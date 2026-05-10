# Legacy vote burst detection — design

## Problem

The first half of the votes table predates the anti-fraud signals migration. Those rows have no fingerprint and no IP, so the existing "Shared device+IP clusters" heuristic in `SuspiciousVotesPanel` can't see them at all. We need a complementary heuristic that flags suspicious activity in legacy data using the only signal we have: timing.

## Goals

- Surface legacy vote bursts that look like coordinated rapid-fire activity for one candidate.
- Reuse the existing soft-delete plumbing — admin can invalidate a flagged burst with one click and restore it later.
- Keep the existing fingerprint+IP heuristic untouched and visible alongside the new one.

## Non-goals

- Schema changes. Reuse `invalidated_at` / `invalidated_by` and the RLS policies already in place.
- Public-app changes. The heuristic runs entirely in the admin panel.
- Realtime decrement on the public site. Counts converge on next page load.
- Server-side computation. With ~1400 votes the per-candidate scan is trivial in the browser; a view or RPC adds round-trip without value.
- Configurable thresholds. Constants live at the top of the file.
- Deduplication between heuristics. Legacy votes (no fingerprint, no IP) are by definition disjoint from device+IP clusters.

## Heuristic

A **legacy vote** is one whose `votes_meta` row has neither fingerprint nor voter_ip (or has no meta row at all).

Constants:

```
MIN_VOTES_IN_WINDOW = 7
WINDOW_SECONDS      = 60
MAX_GAP_SECONDS     = 30
```

Algorithm, computed client-side over the same fetch the existing panel uses:

1. Build the legacy-vote sequence per candidate, sorted by `created_at` ASC. Include both active (`invalidated_at IS NULL`) and invalidated rows so already-invalidated bursts can surface in the Invalidated section for restore.
2. Walk each per-candidate sequence and partition it into bursts:
   - Start a new burst when the gap from the previous vote exceeds `MAX_GAP_SECONDS`, or it's the first vote for that candidate.
   - Otherwise extend the current burst.
3. For each burst, count votes whose `created_at` falls within `[burstStart, burstStart + WINDOW_SECONDS]`. Keep the burst only if that count is at least `MIN_VOTES_IN_WINDOW`.
4. Apply the same admin-dog filter as the existing panel: drop bursts that are entirely for `ADMIN_DOG_ID`.

Each qualifying burst becomes a cluster object with the same shape as the fingerprint+IP clusters, plus a `type` discriminator:

```js
{
  key: `burst:${dog_id}:${first_at_iso}`,   // stable
  type: "time-burst",
  dog_id, dog_name,
  voteIds: [...],
  n: voteIds.length,
  firstAt, lastAt,
  votesInFirst60s,
  allInvalidated,
}
```

Existing fingerprint+IP clusters are tagged `type: "device-ip"`. The `type` field is universal — every cluster has one.

### Threshold rationale

The proposed thresholds were validated against the live data. With `7/60s + gap<30s`, the heuristic flags exactly two bursts:

- Iggy: 20 votes over 194s, 7 in the first 60s
- Tortilla: 17 votes over 131s, 8 in the first 60s

These match the user's earlier description of the dominant offenders ("the same 1-2 candidates with batches of 20+ votes"). Loosening to `5/60s` would surface 10 bursts including a 5-vote Pickles burst and a 6-vote Pickles burst that look more like genuine social-media spikes; tightening to `10/60s` flags zero. The 7-vote trigger is the tightest setting that still catches the headlines.

## UI changes (`admin.jsx` → `SuspiciousVotesPanel`)

### State

```jsx
const [state, setState] = useState({
  loading, error,
  activeDeviceIpClusters,   // existing fingerprint+IP active list (renamed from activeClusters)
  activeTimeBurstClusters,  // new
  invalidatedClusters,      // unified — both types
  totalVotes, missingSignals, dogName,
});
```

### Layout, top to bottom

1. **Summary line** gains one tally:

   `<N> total · <N> legacy (no signals) · <N> active clusters · <N> active bursts · <N> invalidated`

2. **Shared device+IP clusters** — existing active table, columns unchanged. Drives off `activeDeviceIpClusters`.

3. **Time-cluster bursts (legacy)** — new active table:

   `Candidate | Votes | Duration | First 60s | First | Last | Action`

   Hint text (interpolated from the constants at the top of the file, so changing a constant updates the copy automatically):

   > Legacy votes (no device/IP) where 7+ votes for the same candidate landed in 60 seconds, extended while gaps stayed under 30 seconds. Two real friends voting back-to-back can occasionally trip this — read the timing before acting.

   Action cell: "Invalidate" button.

4. **Invalidated clusters** — unified table at the bottom, only shown when non-empty:

   `Type | Fingerprint | IP | Candidates | Votes | First | Last | Action`

   - `Type` cell: small badge reading "device+IP" or "time burst".
   - For device+IP rows: Fingerprint = `fp1234…`, IP = `1.2.3.4`, Candidates = comma-joined dog names (existing behavior).
   - For time-burst rows: Fingerprint = `—`, IP = `—`, Candidates = the single dog name. Empty cells reinforce the type without needing color.
   - Action cell: "Restore" button (existing handler, unchanged).

### Action handler

The existing `setClusterInvalidation(cluster, invalidate)` handler works unchanged. It already operates on `cluster.key` and `cluster.voteIds`, which both cluster types provide. The only new logic: the optimistic move on success/revert needs to dispatch a cluster back into the correct active list based on `cluster.type` (`activeDeviceIpClusters` or `activeTimeBurstClusters`). On invalidate it always moves into the unified `invalidatedClusters`.

### Renaming

- `state.activeClusters` → `state.activeDeviceIpClusters` (3 references in render, 2 in refresh).
- `state.invalidatedClusters` keeps its name but now holds both types.
- The clustering builder for fingerprint+IP gets a `type: "device-ip"` field added; everything else about it stays the same.

## Test plan

Manual, in the admin panel against the live project:

1. **Heuristic correctness:** With nothing invalidated, the panel's "Time-cluster bursts (legacy)" section shows exactly two rows — Iggy (20) and Tortilla (17) — matching the SQL probe results.
2. **Admin-dog filter:** No row for Jack appears (legacy data has a 5-vote Jack burst that should be filtered).
3. **Invalidate a time-burst:** Click Invalidate on the Iggy row → confirm → it disappears from the active time-burst section and a new row appears in the unified Invalidated table with `Type = time burst`, `Fingerprint = —`, `IP = —`, `Candidates = Iggy`. Public site (incognito reload) shows Iggy's count drop by 20.
4. **Restore a time-burst:** Click Restore on the Iggy row in the Invalidated section → it disappears from there and the original active burst returns. Public site count restores.
5. **Cross-type invalidated rendering:** Manually invalidate one cluster of each type via the UI in the same session. Confirm the unified Invalidated table renders both with their distinct cell content and that Restore works for each.
6. **Empty-state:** With no invalidated clusters, the Invalidated section is hidden entirely. With no time-burst clusters, that section shows an empty hint (or is hidden — match the existing fingerprint+IP empty-state choice).

## Out of scope / explicit non-changes

- `votes` table, `votes_meta`, RLS policies, `cast_vote` RPC: unchanged.
- `app.jsx`: unchanged. The new heuristic produces the same kind of cluster object the existing one did, and invalidations write to the same `votes` columns under the same RLS, so no public-side code needs to know.
- The existing fingerprint+IP heuristic and its admin-dog filter: unchanged.
- Realtime channel subscriptions: unchanged.
