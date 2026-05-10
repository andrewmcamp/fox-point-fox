# Legacy Vote Burst Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second client-side heuristic to `SuspiciousVotesPanel` that flags legacy votes (no fingerprint or IP) as a "burst" when 7+ votes for the same candidate land in 60 seconds, extended while consecutive gaps stay under 30 seconds. Reuse the existing soft-delete plumbing for invalidate/restore.

**Architecture:** Single-file change in `admin.jsx`. The existing fingerprint+IP detection stays untouched; we add a parallel `buildTimeBurstClusters(...)` pure function. Both heuristics produce cluster objects with the same shape (`key`, `voteIds`, `n`, `firstAt`, `lastAt`, `allInvalidated`, plus a new `type` discriminator). State splits the active lists by heuristic but unifies the invalidated list. `setClusterInvalidation` learns to dispatch a restored cluster back to the correct active list based on `cluster.type`.

**Tech Stack:** React 18 (CDN, no build step), Supabase JS client `window.sb`. No new dependencies.

**Reference spec:** [docs/superpowers/specs/2026-05-09-legacy-vote-burst-detection-design.md](../specs/2026-05-09-legacy-vote-burst-detection-design.md)

---

## File Structure

- **Modify:** `admin.jsx` — `SuspiciousVotesPanel` only.

No new files. The new helper and constants live at the top of the existing component or as module-level declarations near `ADMIN_DOG_ID`.

---

## Task 1: Refactor — rename `activeClusters` → `activeDeviceIpClusters` and tag existing clusters with `type: "device-ip"`

This is a pure mechanical refactor. Zero behavior change. It readies the code for a second cluster type without introducing any.

**Files:**
- Modify: `admin.jsx` — `SuspiciousVotesPanel`.

- [ ] **Step 1: Rename in initial state**

In `admin.jsx`, change:

```jsx
  const [state, setState] = useState({
    loading: true, error: "",
    activeClusters: [],
    invalidatedClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
```

to:

```jsx
  const [state, setState] = useState({
    loading: true, error: "",
    activeDeviceIpClusters: [],
    invalidatedClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
```

- [ ] **Step 2: Add `type` field to the cluster builder**

In `refresh`, find the `.map(([key, arr]) => { ... })` block that constructs cluster objects. Inside the returned object literal, add `type: "device-ip"` after `key`. The block currently returns:

```jsx
          return {
            key,
            fingerprint, voter_ip,
            n: arr.length,
            voteIds: arr.map((v) => v.id),
            dogIds: [...new Set(arr.map((v) => v.dog_id))],
            firstAt: first, lastAt: last,
            allInvalidated,
          };
```

Replace with:

```jsx
          return {
            key,
            type: "device-ip",
            fingerprint, voter_ip,
            n: arr.length,
            voteIds: arr.map((v) => v.id),
            dogIds: [...new Set(arr.map((v) => v.dog_id))],
            firstAt: first, lastAt: last,
            allInvalidated,
          };
```

- [ ] **Step 3: Rename in refresh's setState call**

Find:

```jsx
      const activeClusters = allClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedClusters = allClusters
        .filter((c) => c.allInvalidated)
        .sort((a, b) => b.n - a.n);

      setState({
        loading: false, error: "",
        activeClusters, invalidatedClusters,
        totalVotes: votes.length, missingSignals: missing, dogName,
      });
```

Replace with:

```jsx
      const activeDeviceIpClusters = allClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedClusters = allClusters
        .filter((c) => c.allInvalidated)
        .sort((a, b) => b.n - a.n);

      setState({
        loading: false, error: "",
        activeDeviceIpClusters, invalidatedClusters,
        totalVotes: votes.length, missingSignals: missing, dogName,
      });
```

- [ ] **Step 4: Rename in `setClusterInvalidation` (4 references)**

The handler has 4 references to `s.activeClusters` inside its two `setState((s) => {...})` callbacks (the optimistic move and the error revert). Change every `s.activeClusters` to `s.activeDeviceIpClusters`. Keep the keys in the returned object literals consistent — i.e. an object literal that previously used the shorthand `activeClusters: [...]` must now use the explicit form `activeDeviceIpClusters: [...]` (or use `activeDeviceIpClusters` as the local name; both work).

Concretely, the optimistic-move setState body becomes:

```jsx
    setState((s) => {
      const updated = { ...cluster, allInvalidated: invalidate };
      if (invalidate) {
        return {
          ...s,
          activeDeviceIpClusters: s.activeDeviceIpClusters.filter((c) => c.key !== cluster.key),
          invalidatedClusters: [updated, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      }
      return {
        ...s,
        invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
        activeDeviceIpClusters: [updated, ...s.activeDeviceIpClusters].sort((a, b) => b.n - a.n),
      };
    });
```

And the revert setState body becomes:

```jsx
      setState((s) => {
        const reverted = { ...cluster, allInvalidated: !invalidate };
        if (invalidate) {
          return {
            ...s,
            invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
            activeDeviceIpClusters: [reverted, ...s.activeDeviceIpClusters].sort((a, b) => b.n - a.n),
          };
        }
        return {
          ...s,
          activeDeviceIpClusters: s.activeDeviceIpClusters.filter((c) => c.key !== cluster.key),
          invalidatedClusters: [reverted, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      });
```

- [ ] **Step 5: Rename in render block**

The render references `state.activeClusters` in three places:

1. The summary count: `<span><strong>{state.activeClusters.length}</strong> active clusters</span>`
2. The empty-state check: `{state.activeClusters.length === 0 ? (`
3. The table body map: `{state.activeClusters.map((c) => (`

Replace all three to use `state.activeDeviceIpClusters`.

- [ ] **Step 6: Verify no `state.activeClusters` references remain**

Grep `admin.jsx` for `activeClusters` (should match only `activeDeviceIpClusters`). Expected: zero matches for the bare name `activeClusters` (without the `DeviceIp` qualifier).

- [ ] **Step 7: Commit**

```bash
git add admin.jsx
git commit -m "refactor(admin): rename activeClusters to activeDeviceIpClusters and tag type"
```

---

## Task 2: Add burst detection algorithm, wire into refresh, and update Invalidated table for both types

This task adds the new heuristic and prepares the Invalidated table to render both cluster types. It does NOT yet add the new active section in the UI — that's Task 3. After this task, the panel looks visually identical to before for users with no current invalidations.

**Files:**
- Modify: `admin.jsx` — `SuspiciousVotesPanel`.

- [ ] **Step 1: Add module-level constants near `ADMIN_DOG_ID`**

Just below the `ADMIN_DOG_ID` declaration at the top of `admin.jsx`, add:

```jsx
// Legacy-vote burst heuristic: a cluster of legacy votes (no fingerprint, no IP)
// for the same candidate where MIN_VOTES_IN_WINDOW or more votes land within
// WINDOW_SECONDS of the burst's first vote, with consecutive gaps under
// MAX_GAP_SECONDS keeping the burst alive.
const BURST_MIN_VOTES_IN_WINDOW = 7;
const BURST_WINDOW_SECONDS = 60;
const BURST_MAX_GAP_SECONDS = 30;
```

- [ ] **Step 2: Add the `buildTimeBurstClusters` helper above `SuspiciousVotesPanel`**

Just above `function SuspiciousVotesPanel(...)`, add:

```jsx
// Identify legacy-vote burst clusters per candidate. Input: every legacy vote
// (no fingerprint, no IP) including invalidated ones, plus the dog-name map.
// Output: cluster objects with the same shape the existing fingerprint+IP
// builder uses, plus type = "time-burst".
function buildTimeBurstClusters(legacyVotes, dogName) {
  // Group by dog_id, sorted ascending by created_at.
  const byDog = new Map();
  for (const v of legacyVotes) {
    if (!byDog.has(v.dog_id)) byDog.set(v.dog_id, []);
    byDog.get(v.dog_id).push(v);
  }
  for (const arr of byDog.values()) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const clusters = [];
  for (const [dog_id, arr] of byDog.entries()) {
    let burst = [];
    const flushIfQualifying = () => {
      if (burst.length === 0) return;
      const firstAt = burst[0].created_at;
      const cutoff = new Date(new Date(firstAt).getTime() + BURST_WINDOW_SECONDS * 1000).toISOString();
      const inWindow = burst.filter((v) => v.created_at <= cutoff).length;
      if (inWindow >= BURST_MIN_VOTES_IN_WINDOW) {
        clusters.push({
          key: `burst:${dog_id}:${firstAt}`,
          type: "time-burst",
          dog_id,
          dog_name: dogName.get(dog_id) || dog_id,
          n: burst.length,
          voteIds: burst.map((v) => v.id),
          dogIds: [dog_id],
          firstAt,
          lastAt: burst[burst.length - 1].created_at,
          votesInFirst60s: inWindow,
          allInvalidated: burst.every((v) => v.invalidated_at !== null),
        });
      }
      burst = [];
    };

    for (const v of arr) {
      if (burst.length === 0) {
        burst.push(v);
        continue;
      }
      const prev = burst[burst.length - 1];
      const gapSec = (new Date(v.created_at).getTime() - new Date(prev.created_at).getTime()) / 1000;
      if (gapSec > BURST_MAX_GAP_SECONDS) {
        flushIfQualifying();
        burst.push(v);
      } else {
        burst.push(v);
      }
    }
    flushIfQualifying();
  }

  // Hide bursts that are entirely the admin's dog (test traffic), matching
  // the existing fingerprint+IP filter convention.
  return clusters.filter((c) => c.dog_id !== ADMIN_DOG_ID);
}
```

- [ ] **Step 3: Add `activeTimeBurstClusters` to initial state**

Change:

```jsx
  const [state, setState] = useState({
    loading: true, error: "",
    activeDeviceIpClusters: [],
    invalidatedClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
```

to:

```jsx
  const [state, setState] = useState({
    loading: true, error: "",
    activeDeviceIpClusters: [],
    activeTimeBurstClusters: [],
    invalidatedClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
```

- [ ] **Step 4: Compute time-burst clusters in `refresh` and merge into the state**

Locate the `refresh` body, specifically the part that ends with the `setState({...})` call. Replace the splitting+setState section so it:

1. Builds the legacy-vote list for the burst helper.
2. Calls `buildTimeBurstClusters`.
3. Splits the burst clusters into active vs invalidated.
4. Concatenates the invalidated-burst clusters onto the existing invalidated list, then sorts.

Find:

```jsx
      const activeDeviceIpClusters = allClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedClusters = allClusters
        .filter((c) => c.allInvalidated)
        .sort((a, b) => b.n - a.n);

      setState({
        loading: false, error: "",
        activeDeviceIpClusters, invalidatedClusters,
        totalVotes: votes.length, missingSignals: missing, dogName,
      });
```

Replace with:

```jsx
      const activeDeviceIpClusters = allClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedDeviceIpClusters = allClusters
        .filter((c) => c.allInvalidated);

      // Build legacy vote list (no fingerprint, no IP — or no meta row at all),
      // including invalidated rows so already-invalidated bursts can surface
      // in the Invalidated section for restore.
      const legacyVotes = votes.filter((v) => {
        const m = metaByVote.get(v.id);
        return !m || (!m.fingerprint && !m.voter_ip);
      });
      const burstClusters = buildTimeBurstClusters(legacyVotes, dogName);
      const activeTimeBurstClusters = burstClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedTimeBurstClusters = burstClusters
        .filter((c) => c.allInvalidated);

      const invalidatedClusters = [
        ...invalidatedDeviceIpClusters,
        ...invalidatedTimeBurstClusters,
      ].sort((a, b) => b.n - a.n);

      setState({
        loading: false, error: "",
        activeDeviceIpClusters, activeTimeBurstClusters, invalidatedClusters,
        totalVotes: votes.length, missingSignals: missing, dogName,
      });
```

- [ ] **Step 5: Update `setClusterInvalidation` move logic to dispatch by `cluster.type`**

The optimistic-move and error-revert setState callbacks both branch on `invalidate`. Inside each branch, they currently always touch `activeDeviceIpClusters`. We need them to touch the correct active list — `activeDeviceIpClusters` when `cluster.type === "device-ip"`, otherwise `activeTimeBurstClusters`.

Replace the optimistic-move setState body (the first `setState((s) => {...})` in the handler) with:

```jsx
    // Optimistic UI: move the cluster between lists immediately. The active
    // side is keyed by cluster.type; the invalidated side is unified.
    setState((s) => {
      const updated = { ...cluster, allInvalidated: invalidate };
      const activeKey = cluster.type === "time-burst"
        ? "activeTimeBurstClusters"
        : "activeDeviceIpClusters";
      if (invalidate) {
        return {
          ...s,
          [activeKey]: s[activeKey].filter((c) => c.key !== cluster.key),
          invalidatedClusters: [updated, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      }
      return {
        ...s,
        invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
        [activeKey]: [updated, ...s[activeKey]].sort((a, b) => b.n - a.n),
      };
    });
```

Replace the revert setState body (inside `if (error) { setState((s) => {...}) }`) with:

```jsx
      setState((s) => {
        const reverted = { ...cluster, allInvalidated: !invalidate };
        const activeKey = cluster.type === "time-burst"
          ? "activeTimeBurstClusters"
          : "activeDeviceIpClusters";
        if (invalidate) {
          return {
            ...s,
            invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
            [activeKey]: [reverted, ...s[activeKey]].sort((a, b) => b.n - a.n),
          };
        }
        return {
          ...s,
          [activeKey]: s[activeKey].filter((c) => c.key !== cluster.key),
          invalidatedClusters: [reverted, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      });
```

- [ ] **Step 6: Update the Invalidated table to render both types**

The Invalidated table currently has columns `Fingerprint | IP | Votes | Candidates | First | Last | Action`. Add a `Type` column at the front and make the Fingerprint and IP cells show `—` when absent (time-burst rows have no fingerprint or IP).

Find the Invalidated section's `<thead>` row:

```jsx
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th><th>Action</th></tr>
```

Replace with:

```jsx
              <tr><th>Type</th><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th><th>Action</th></tr>
```

Find the Invalidated section's row body:

```jsx
              {state.invalidatedClusters.map((c) => (
                <tr key={c.key}>
                  <td className="mono">{c.fingerprint.slice(0, 12)}…</td>
                  <td className="mono">{c.voter_ip}</td>
                  <td>{c.n}</td>
                  <td>{c.dogIds.map((id) => state.dogName.get(id) || id).join(", ")}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setClusterInvalidation(c, false)}
                      disabled={inFlight.has(c.key)}>
                      {inFlight.has(c.key) ? "Working…" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
```

Replace with:

```jsx
              {state.invalidatedClusters.map((c) => (
                <tr key={c.key}>
                  <td>{c.type === "time-burst" ? "time burst" : "device+IP"}</td>
                  <td className="mono">{c.fingerprint ? `${c.fingerprint.slice(0, 12)}…` : "—"}</td>
                  <td className="mono">{c.voter_ip || "—"}</td>
                  <td>{c.n}</td>
                  <td>{c.dogIds.map((id) => state.dogName.get(id) || id).join(", ")}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setClusterInvalidation(c, false)}
                      disabled={inFlight.has(c.key)}>
                      {inFlight.has(c.key) ? "Working…" : "Restore"}
                    </button>
                  </td>
                </tr>
              ))}
```

The `dogIds` array is set to `[dog_id]` on time-burst clusters by `buildTimeBurstClusters`, so the Candidates cell renders the single dog name correctly without further branching.

- [ ] **Step 7: Commit**

```bash
git add admin.jsx
git commit -m "feat(admin): legacy vote burst detection wired into refresh and invalidated table"
```

---

## Task 3: Render the active "Time-cluster bursts (legacy)" section and update the summary count

Now make the new heuristic visible.

**Files:**
- Modify: `admin.jsx` — `SuspiciousVotesPanel` render block.

- [ ] **Step 1: Add a tally to the summary line**

Find:

```jsx
            <span><strong>{state.activeDeviceIpClusters.length}</strong> active clusters</span>
            <span><strong>{state.invalidatedClusters.length}</strong> invalidated clusters</span>
```

Replace with:

```jsx
            <span><strong>{state.activeDeviceIpClusters.length}</strong> active clusters</span>
            <span><strong>{state.activeTimeBurstClusters.length}</strong> active bursts</span>
            <span><strong>{state.invalidatedClusters.length}</strong> invalidated</span>
```

- [ ] **Step 2: Add the new active section**

After the existing active fingerprint+IP `<div className="suspicious-section">...</div>` block, and BEFORE the `{state.invalidatedClusters.length > 0 && (...)}` block, insert exactly:

```jsx
      <div className="suspicious-section">
        <h3 style={{ marginTop: "1.5rem" }}>Time-cluster bursts (legacy)</h3>
        <p className="suspicious-hint">
          Legacy votes (no device/IP) where {BURST_MIN_VOTES_IN_WINDOW}+ votes for the same candidate landed in {BURST_WINDOW_SECONDS} seconds, extended while gaps stayed under {BURST_MAX_GAP_SECONDS} seconds. Two real friends voting back-to-back can occasionally trip this — read the timing before acting.
        </p>
        {state.activeTimeBurstClusters.length === 0 ? (
          <div className="empty-pending">No legacy-vote bursts.</div>
        ) : (
          <table className="suspicious-table">
            <thead>
              <tr><th>Candidate</th><th>Votes</th><th>Duration</th><th>First 60s</th><th>First</th><th>Last</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.activeTimeBurstClusters.map((c) => {
                const durSec = Math.round((new Date(c.lastAt).getTime() - new Date(c.firstAt).getTime()) / 1000);
                return (
                  <tr key={c.key}>
                    <td>{c.dog_name}</td>
                    <td>{c.n}</td>
                    <td>{durSec}s</td>
                    <td>{c.votesInFirst60s}</td>
                    <td>{fmtTime(c.firstAt)}</td>
                    <td>{fmtTime(c.lastAt)}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setClusterInvalidation(c, true)}
                        disabled={inFlight.has(c.key)}>
                        {inFlight.has(c.key) ? "Working…" : "Invalidate"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
```

- [ ] **Step 3: Commit**

```bash
git add admin.jsx
git commit -m "feat(admin): render active time-cluster bursts section"
```

---

## Task 4: End-to-end manual verification

This task is performed by the user (or a human collaborator) in the browser, since the agent can't drive a browser.

**Files:** none. Verification only.

- [ ] **Step 1: Start a local server**

```bash
python -m http.server 8000 --directory "c:/Users/Andrew/Brown Dropbox/Andrew Camp/fox-of-fox-point"
```

- [ ] **Step 2: Open the admin panel and sign in as admin**

Navigate to http://localhost:8000/admin.html in a browser, complete the magic-link sign-in, and wait for the suspicious-votes panel to load.

- [ ] **Step 3: Verify the active time-burst section**

Confirm:
- A new section titled "Time-cluster bursts (legacy)" appears between the existing "Shared device+IP clusters" section and the "Invalidated clusters" section (when present).
- The summary line shows `<N> active bursts` between the existing tallies.
- The active time-burst table has rows for **Iggy** (20 votes, 7 in first 60s) and **Tortilla** (17 votes, 8 in first 60s) — and only those two. No row for Jack.

(If the data has shifted since the spec was written, the row count may differ — confirm the heuristic is producing reasonable output rather than the exact rows.)

- [ ] **Step 4: Invalidate a time-burst cluster**

Pick the Iggy row. Click "Invalidate" → confirm the dialog. Expected:
- Row disappears from the active time-burst section.
- A new row appears in the Invalidated clusters table with `Type = time burst`, `Fingerprint = —`, `IP = —`, `Candidates = Iggy`, `Votes = 20`.
- In a separate incognito window on http://localhost:8000/index.html, reload — Iggy's vote count drops by 20.

- [ ] **Step 5: Restore the time-burst cluster**

In the Invalidated section, click "Restore" on the Iggy row → confirm. Expected:
- The Iggy row disappears from the Invalidated section.
- The Iggy active time-burst row reappears with the original totals.
- Public site count returns on reload.

- [ ] **Step 6: Verify cross-type rendering of the unified Invalidated table**

If you currently have any device+IP invalidated clusters from the previous feature, confirm they render with `Type = device+IP`, `Fingerprint = fp1234…`, `IP = 1.2.3.4`. If you don't, optionally invalidate a small device+IP cluster (then restore after) to spot-check.

- [ ] **Step 7: Stop the server**

In the controller's terminal, kill the background python process.

---

## Done criteria

- All four tasks' checkboxes are checked.
- Iggy and Tortilla bursts appear in the new active time-burst section.
- Invalidating a time-burst cluster moves it to the unified Invalidated table with `Type = time burst` and `Fingerprint`/`IP` shown as `—`.
- Restoring a time-burst cluster returns it to the active time-burst section.
- The existing fingerprint+IP heuristic still works exactly as before.
- The summary line shows three counts: active clusters, active bursts, invalidated.
