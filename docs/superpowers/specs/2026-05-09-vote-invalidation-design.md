# Vote invalidation (soft delete) — design

## Problem

Repeat fraudulent voting clusters (same fingerprint+IP, batches of 20+ votes for one or two specific candidates) are showing up in the admin's "Suspicious vote signals" panel. The admin needs a way to exclude these votes from the official tally while preserving a track record — i.e. soft delete, not hard delete.

## Goals

- Admin can invalidate a flagged cluster from the admin UI in one click.
- Invalidated votes are excluded from `dog_vote_counts` (and therefore from the public leaderboard).
- Invalidated rows remain in the `votes` table with timestamp + admin user_id, for audit.
- A voter whose vote was invalidated can cast a new vote.
- Mistaken invalidations can be reversed.

## Non-goals

- Realtime decrement on the public site when a vote is invalidated. The public count converges on next page load. (The realtime channel currently listens only to INSERT events; we are not extending it.)
- Free-text reason field, structured audit log table, or any audit UI beyond the admin panel itself.
- Per-vote invalidation within a cluster. Action is whole-cluster only (cluster = same fingerprint AND same IP).
- Hardening against the data-leakage vector that `voter_id` is publicly readable. That is a pre-existing condition; this change does not make it worse.

## Schema changes

### New columns on `votes`

```sql
alter table public.votes
  add column invalidated_at timestamptz,
  add column invalidated_by uuid;

comment on column public.votes.invalidated_at is
  'When an admin soft-deleted this vote. Null = active. Tallies exclude rows where this is non-null.';
comment on column public.votes.invalidated_by is
  'auth.users.id of the admin who invalidated this vote. No FK, matching the convention on voter_id.';
```

No FK to `auth.users(id)` on `invalidated_by`: matches the existing convention that `voter_id` (also a UUID pointing at `auth.users`) has no FK either.

### Replace `UNIQUE(voter_id)` with a partial unique index

The current constraint is `votes_voter_id_unique UNIQUE (voter_id)`. Replace with a partial unique index so an invalidated voter can vote again:

```sql
alter table public.votes drop constraint votes_voter_id_unique;

create unique index votes_voter_id_active_uniq
  on public.votes (voter_id)
  where invalidated_at is null;
```

This is what makes "allow re-voting after invalidation" work end-to-end. The `cast_vote` RPC continues to rely on the index for dedup; nothing in the RPC changes.

### Update `dog_vote_counts` view

```sql
create or replace view public.dog_vote_counts as
  select dog_id, count(*)::integer as votes
    from public.votes
   where invalidated_at is null
   group by dog_id;
```

The view is `security_invoker=true` (already set), so it respects the caller's RLS. The `where invalidated_at is null` filter is belt-and-suspenders given the new RLS posture (below) — not load-bearing for non-admins, but keeps the admin's view of `dog_vote_counts` aligned with what the public sees.

## RLS changes

### The leak we are closing

Today: `votes` has a single `votes_select_anyone` policy with `qual = true`, so anyone can `select * from votes` and see every column. Adding `invalidated_at` / `invalidated_by` directly under that policy would leak:

- Which votes were invalidated and when (probe-able heuristic).
- The admin's `auth.users.id`.

### Replacement policies on `votes`

```sql
drop policy votes_select_anyone on public.votes;

-- Non-admins see only active votes. They never see invalidated rows or the
-- new audit columns' non-null values.
create policy votes_select_active_anyone on public.votes
  for select
  using (invalidated_at is null);

-- Admin sees all rows, matching the votes_meta admin-read pattern.
create policy votes_select_admin on public.votes
  for select
  using ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com');

-- Admin can invalidate / restore.
create policy votes_update_admin on public.votes
  for update
  using ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com');
```

### Second-order effects of the SELECT split

1. **Re-vote flow works without client changes.** The public app's voter-self check, `from("votes").select("dog_id").eq("voter_id", session.user.id).maybeSingle()`, returns zero rows for an invalidated voter. The UI naturally treats them as having not voted; they can cast a new vote.
2. **`dog_vote_counts` is correct for everyone.** With `security_invoker=true`, non-admins aggregate over only active rows; admins aggregate over only active rows because of the view's own filter.
3. **`invalidated_by` only ever surfaces to the admin themselves.** No leakage of admin user_id to other users.

### Realtime

The public app subscribes to `INSERT` on `votes`. Newly cast votes always have `invalidated_at = null`, so they pass the new SELECT policy and broadcast normally. UPDATEs (the invalidate / restore path) are not subscribed on the public side, so no client-side code change is needed there.

## Admin UI changes (`admin.jsx` → `SuspiciousVotesPanel`)

### Data load

- Extend the votes select to include `invalidated_at, invalidated_by` alongside `id, dog_id, created_at`.
- Cluster on (fingerprint AND voter_ip) as today.
- Split clustered output into `activeClusters` and `invalidatedClusters`:
  - A cluster is "invalidated" if **all** of its votes have `invalidated_at is not null`.
  - Otherwise it lands in "active" (mixed clusters, which shouldn't occur in practice since invalidation is whole-cluster, surface in "active" so they remain visible for cleanup).
- The existing admin-dog filter (drops single-candidate clusters that are entirely the admin's own dog) applies after the active/invalidated split.

### Layout

- **Active clusters table** (existing UI, plus one new column):
  - Columns: Fingerprint, IP, Votes, Candidates, First, Last, **Action**.
  - The Action cell holds an "Invalidate" button.
- **Invalidated clusters section** (new, rendered below the active table when any exist):
  - Same column shape as the active table.
  - Action column holds a "Restore" button.
- The summary line gains one tally: `<N> invalidated clusters`.

### Actions

- **Invalidate**: `confirm("Invalidate all N votes in this cluster? This will exclude them from totals.")` → on OK, `update votes set invalidated_at = now(), invalidated_by = <admin auth uid> where id in (<vote_ids>)`. The cluster moves to the invalidated section.
- **Restore**: `confirm("Restore all N votes in this cluster?")` → on OK, `update votes set invalidated_at = null, invalidated_by = null where id in (<vote_ids>)`. The cluster moves back to active.
- Both actions:
  - Use an in-flight set keyed by cluster key (`fingerprint|voter_ip`) to prevent double-clicks, mirroring the `inFlight` pattern in `PendingList`.
  - Do an optimistic local mutation of the affected vote rows (set/clear `invalidated_at`) and re-cluster from the mutated rows, so the UI updates without a full refetch.
  - On error, revert the optimistic change and `alert(error.message)`.

## Test plan

Manual, against a Supabase preview branch:

1. **Migration**: apply migration to the preview branch; confirm `votes` has the two new columns, the partial unique index exists, the old unique constraint is gone, the view filters on `invalidated_at`, and the three new policies are present.
2. **Public read posture**: as anon and as a non-admin authenticated user, `select * from votes` returns no rows where `invalidated_at is not null` (after manually invalidating a row in SQL).
3. **Admin read posture**: as the admin email, `select * from votes` returns all rows including invalidated ones.
4. **Admin update posture**: as a non-admin authenticated user, `update votes set invalidated_at = now() where id = ...` is blocked by RLS. As admin, it succeeds.
5. **Public tally**: `select * from dog_vote_counts` excludes invalidated votes for both anon and admin callers.
6. **Re-vote flow**: cast a vote as an anon user, invalidate it as admin, return to the public site as the same anon session, confirm the candidates show as un-voted and a new vote can be cast successfully (the partial unique index permits it).
7. **Admin UI happy path**: from the suspicious-votes panel, click Invalidate on a cluster → confirm → cluster moves to invalidated section, public tallies drop on next reload. Click Restore on the same cluster → cluster returns to active, tallies restore.
8. **Admin UI edge**: double-click Invalidate, confirm only one request fires; force an error path (e.g. revoke update temporarily), confirm UI reverts and shows the error.

## Out of scope / explicit non-changes

- `cast_vote` RPC: unchanged. The partial unique index continues to enforce one-active-vote-per-voter.
- `votes_meta`: unchanged. Invalidation does not touch the meta row; cascade behavior is irrelevant since we don't delete.
- Public app code (`app.jsx`): no changes required. RLS handles the visibility of invalidated rows transparently.
- Realtime publication / channel subscriptions: unchanged.
