# Vote Invalidation (Soft Delete) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a UI to soft-delete (invalidate) suspicious vote clusters so they're excluded from `dog_vote_counts` while staying in the `votes` table for audit, with the ability to restore.

**Architecture:** Two new columns (`invalidated_at`, `invalidated_by`) on `votes`. The current "everyone can read everything" SELECT policy on `votes` is split into a non-admin policy (`invalidated_at is null`) plus an admin policy (all rows), which means non-admins can't see invalidated rows or the audit columns at all. A partial unique index on `voter_id WHERE invalidated_at IS NULL` replaces the existing UNIQUE constraint so an invalidated voter can re-vote. The admin UI (`SuspiciousVotesPanel` in `admin.jsx`) gets an Invalidate button per active cluster and a separate Invalidated-clusters section with Restore.

**Tech Stack:** PostgreSQL via Supabase (migrations + RLS), React 18 (CDN, no build step) in `admin.jsx`, Supabase JS client `window.sb`.

**Reference spec:** [docs/superpowers/specs/2026-05-09-vote-invalidation-design.md](../specs/2026-05-09-vote-invalidation-design.md)

**Supabase project ref:** `scupbstsavzjqamuixtp` (Fox of Foxpoint, ACTIVE_HEALTHY).

---

## File Structure

- **Create:** `supabase/migrations/<timestamp>_add_vote_invalidation.sql` — schema, RLS, partial index, view replacement.
- **Modify:** `admin.jsx` — `SuspiciousVotesPanel` data shape, render, and actions. Pass session into the panel from `AdminApp`.

No new files in the React tree. The panel is already a single component in `admin.jsx`; the change keeps it there.

---

## Task 1: Write the migration file

**Files:**
- Create: `supabase/migrations/<timestamp>_add_vote_invalidation.sql`

The migration timestamp must be greater than the latest existing one (`20260509005851`). Use `20260509100000` (or higher).

- [ ] **Step 1: Create the migration file**

Write `supabase/migrations/20260509100000_add_vote_invalidation.sql` with this exact content:

```sql
-- 1. Audit columns on votes. No FK on invalidated_by, matching voter_id.
alter table public.votes
  add column invalidated_at timestamptz,
  add column invalidated_by uuid;

comment on column public.votes.invalidated_at is
  'When an admin soft-deleted this vote. Null = active. Tallies exclude rows where this is non-null.';
comment on column public.votes.invalidated_by is
  'auth.users.id of the admin who invalidated this vote. No FK, matching the convention on voter_id.';

-- 2. Replace UNIQUE(voter_id) with a partial unique index so an invalidated
--    voter can vote again. The cast_vote RPC continues to rely on this index
--    for dedup; nothing in the RPC changes.
alter table public.votes drop constraint votes_voter_id_unique;

create unique index votes_voter_id_active_uniq
  on public.votes (voter_id)
  where invalidated_at is null;

-- 3. View now excludes invalidated rows. Belt-and-suspenders given the new
--    SELECT RLS posture below — non-admins can't see invalidated rows at all.
create or replace view public.dog_vote_counts as
  select dog_id, count(*)::integer as votes
    from public.votes
   where invalidated_at is null
   group by dog_id;

-- 4. Replace the broad SELECT policy. Non-admins see only active rows;
--    admin sees all rows. This is what closes the leak of which votes were
--    invalidated, when, and by whom.
drop policy votes_select_anyone on public.votes;

create policy votes_select_active_anyone on public.votes
  for select
  using (invalidated_at is null);

create policy votes_select_admin on public.votes
  for select
  using ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com');

-- 5. Admin can invalidate / restore. No other UPDATE policy exists, so
--    non-admins cannot UPDATE.
create policy votes_update_admin on public.votes
  for update
  using ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com');
```

- [ ] **Step 2: Commit the migration file (do not apply yet)**

```bash
git add supabase/migrations/20260509100000_add_vote_invalidation.sql
git commit -m "feat(db): migration for vote invalidation (soft delete)"
```

---

## Task 2: Apply migration and verify schema state

**Files:** none modified. Uses Supabase MCP tools against project ref `scupbstsavzjqamuixtp`.

- [ ] **Step 1: Apply the migration**

Use the `mcp__supabase__apply_migration` tool with:
- `project_id`: `scupbstsavzjqamuixtp`
- `name`: `add_vote_invalidation`
- `query`: the full SQL body from Task 1 Step 1.

Expected: success response, no error.

- [ ] **Step 2: Verify columns exist on `votes`**

Use `mcp__supabase__execute_sql` with `project_id: scupbstsavzjqamuixtp` and:

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema='public' and table_name='votes'
   and column_name in ('invalidated_at','invalidated_by');
```

Expected: two rows, `invalidated_at timestamp with time zone` (nullable=YES), `invalidated_by uuid` (nullable=YES).

- [ ] **Step 3: Verify the constraint was replaced by the partial index**

Use `mcp__supabase__execute_sql`:

```sql
select conname from pg_constraint where conrelid='public.votes'::regclass and conname='votes_voter_id_unique';
select indexname, indexdef from pg_indexes where schemaname='public' and tablename='votes' and indexname='votes_voter_id_active_uniq';
```

Expected: first query returns 0 rows; second query returns 1 row whose `indexdef` ends with `WHERE (invalidated_at IS NULL)`.

- [ ] **Step 4: Verify the view filters invalidated rows**

```sql
select pg_get_viewdef('public.dog_vote_counts', true);
```

Expected: definition includes `WHERE (invalidated_at IS NULL)`.

- [ ] **Step 5: Verify RLS policies**

```sql
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname='public' and tablename='votes'
 order by policyname;
```

Expected: exactly three policies — `votes_select_active_anyone` (SELECT, qual `(invalidated_at IS NULL)`), `votes_select_admin` (SELECT, qual contains the admin email), `votes_update_admin` (UPDATE, both qual and with_check contain the admin email). The old `votes_select_anyone` is gone.

- [ ] **Step 6: Smoke test — invalidate one vote in SQL, confirm tally drops**

```sql
-- Pick an arbitrary vote id and remember its dog_id and the dog's current count.
with target as (select id, dog_id from public.votes order by created_at desc limit 1)
select t.id, t.dog_id, dvc.votes as count_before
  from target t left join public.dog_vote_counts dvc on dvc.dog_id = t.dog_id;
```

Note the `id`, `dog_id`, and `count_before`. Then:

```sql
update public.votes set invalidated_at = now() where id = '<id-from-above>';

select dog_id, votes from public.dog_vote_counts where dog_id = '<dog_id-from-above>';
```

Expected: the new `votes` count for that dog is `count_before - 1`.

- [ ] **Step 7: Restore the smoke-test vote**

```sql
update public.votes set invalidated_at = null where id = '<id-from-above>';

select dog_id, votes from public.dog_vote_counts where dog_id = '<dog_id-from-above>';
```

Expected: count returns to `count_before`.

- [ ] **Step 8: Commit (no file changes; this is a checkpoint commit on the worktree if one is in use, otherwise skip)**

If working in an isolated worktree, an empty checkpoint commit can mark progress. Otherwise no commit needed — schema state lives in Supabase.

---

## Task 3: Pass session down into SuspiciousVotesPanel

**Files:**
- Modify: `admin.jsx` — `AdminApp` (around line 354–369) and `SuspiciousVotesPanel` signature (line 203).

The panel needs the admin's `auth.users.id` to write `invalidated_by`. Easiest path: pass the session as a prop.

- [ ] **Step 1: Update the panel signature to accept `session`**

In `admin.jsx`, change:

```jsx
function SuspiciousVotesPanel() {
```

to:

```jsx
function SuspiciousVotesPanel({ session }) {
```

- [ ] **Step 2: Pass session from `AdminApp`**

In `admin.jsx`, change:

```jsx
      <PendingList />
      <SuspiciousVotesPanel />
```

to:

```jsx
      <PendingList />
      <SuspiciousVotesPanel session={session} />
```

- [ ] **Step 3: Quick sanity check in the browser**

Open `admin.html` in a browser, sign in as `andrewmcamp@gmail.com`. The Suspicious vote signals panel should still render exactly as before (the prop isn't used yet). No console errors.

- [ ] **Step 4: Commit**

```bash
git add admin.jsx
git commit -m "refactor(admin): thread session prop into SuspiciousVotesPanel"
```

---

## Task 4: Fetch invalidation columns and split clusters into active/invalidated

**Files:**
- Modify: `admin.jsx` — `SuspiciousVotesPanel.refresh` (lines 210–273) and `useState` initial state (lines 204–208).

This task changes data shape only. The render still shows just the active table (no Invalidated section yet); next task adds the section.

- [ ] **Step 1: Update initial state to track both lists**

Replace:

```jsx
  const [state, setState] = useState({
    loading: true, error: "",
    clusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
```

with:

```jsx
  const [state, setState] = useState({
    loading: true, error: "",
    activeClusters: [],
    invalidatedClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
  // Cluster keys (`fingerprint|voter_ip`) currently mid-update. Mirrors the
  // PendingList inFlight pattern.
  const [inFlight, setInFlight] = useState(new Set());
```

- [ ] **Step 2: Update the votes select to include the new columns**

Inside `refresh`, change:

```jsx
        window.sb.from("votes").select("id, dog_id, created_at").limit(20000),
```

to:

```jsx
        window.sb.from("votes").select("id, dog_id, created_at, invalidated_at, invalidated_by").limit(20000),
```

- [ ] **Step 3: Carry invalidation flags into the cluster builder, then split active vs invalidated**

Replace the entire body of `refresh` from `const dogName = ...` through `setState({...})` with:

```jsx
      const dogName = new Map((dogsRes.data || []).map((d) => [d.id, d.name]));
      const votes = votesRes.data || [];
      const metaByVote = new Map((metaRes.data || []).map((m) => [m.vote_id, m]));

      // Cluster on the AND of (fingerprint, voter_ip). Both must be present
      // and shared across more than one vote to flag.
      const pairMap = new Map();
      let missing = 0;
      for (const v of votes) {
        const m = metaByVote.get(v.id);
        if (!m || (!m.fingerprint && !m.voter_ip)) missing++;
        if (!m || !m.fingerprint || !m.voter_ip) continue;
        const k = `${m.fingerprint}|${m.voter_ip}`;
        if (!pairMap.has(k)) pairMap.set(k, []);
        pairMap.get(k).push({
          id: v.id,
          dog_id: v.dog_id,
          created_at: v.created_at,
          invalidated_at: v.invalidated_at,
        });
      }

      const allClusters = [...pairMap.entries()]
        .filter(([, arr]) => arr.length > 1)
        .map(([key, arr]) => {
          const [fingerprint, voter_ip] = key.split("|");
          let first = arr[0].created_at;
          let last = arr[0].created_at;
          for (const v of arr) {
            if (v.created_at < first) first = v.created_at;
            if (v.created_at > last) last = v.created_at;
          }
          const allInvalidated = arr.every((v) => v.invalidated_at !== null);
          return {
            key,
            fingerprint, voter_ip,
            n: arr.length,
            voteIds: arr.map((v) => v.id),
            dogIds: [...new Set(arr.map((v) => v.dog_id))],
            firstAt: first, lastAt: last,
            allInvalidated,
          };
        })
        // Hide clusters that are entirely votes for the admin's dog (test
        // traffic). Cross-candidate clusters that include them stay visible.
        .filter((c) => !(c.dogIds.length === 1 && c.dogIds[0] === ADMIN_DOG_ID));

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

- [ ] **Step 4: Update the existing render to use `activeClusters`**

In the current render block, change `state.clusters` to `state.activeClusters` everywhere (the empty-state check, the `.length` in the summary, and the `.map` in the table body).

The summary line currently reads:

```jsx
            <span><strong>{state.clusters.length}</strong> shared device+IP clusters</span>
```

Replace with:

```jsx
            <span><strong>{state.activeClusters.length}</strong> active clusters</span>
            <span><strong>{state.invalidatedClusters.length}</strong> invalidated clusters</span>
```

- [ ] **Step 5: Browser sanity check**

Reload the admin panel. The active clusters table should render as before. Open the browser console to confirm no errors. The summary should now show both counts (the invalidated count will be 0 unless you previously left a manually-invalidated row in Task 2; if you restored it as instructed, it'll be 0).

- [ ] **Step 6: Commit**

```bash
git add admin.jsx
git commit -m "refactor(admin): split suspicious clusters into active vs invalidated"
```

---

## Task 5: Render the invalidated-clusters section (read-only)

**Files:**
- Modify: `admin.jsx` — `SuspiciousVotesPanel` render block (after the existing active table, before the closing `</section>`).

- [ ] **Step 1: Add the invalidated section below the active table**

After the existing `<div className="suspicious-section">...</div>` block (the one rendering the active clusters table), insert this sibling block before `</section>`:

```jsx
      {state.invalidatedClusters.length > 0 && (
        <div className="suspicious-section">
          <h3 style={{ marginTop: "1.5rem" }}>Invalidated clusters</h3>
          <p className="suspicious-hint">
            These clusters were soft-deleted and excluded from totals. Restore returns them to the active tally.
          </p>
          <table className="suspicious-table">
            <thead>
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th></tr>
            </thead>
            <tbody>
              {state.invalidatedClusters.map((c) => (
                <tr key={c.key}>
                  <td className="mono">{c.fingerprint.slice(0, 12)}…</td>
                  <td className="mono">{c.voter_ip}</td>
                  <td>{c.n}</td>
                  <td>{c.dogIds.map((id) => state.dogName.get(id) || id).join(", ")}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 2: Browser sanity check**

The invalidated section should not appear (no invalidated clusters yet). The active section should render unchanged. Manually invalidate a cluster's worth of votes via SQL to test rendering:

Use `mcp__supabase__execute_sql`:

```sql
-- Pick the smallest active cluster to flip temporarily.
with cluster_meta as (
  select vm.fingerprint, vm.voter_ip, array_agg(v.id) as ids
    from public.votes_meta vm
    join public.votes v on v.id = vm.vote_id
   where vm.fingerprint is not null and vm.voter_ip is not null
   group by vm.fingerprint, vm.voter_ip
  having count(*) > 1
   order by count(*) asc
   limit 1
)
update public.votes set invalidated_at = now()
 where id = any((select ids from cluster_meta));
```

Reload the admin panel — the invalidated section should appear with the cluster you just flipped. Then revert:

```sql
update public.votes set invalidated_at = null where invalidated_at is not null;
```

(Safe because no production invalidations exist yet.)

- [ ] **Step 3: Commit**

```bash
git add admin.jsx
git commit -m "feat(admin): render invalidated clusters section"
```

---

## Task 6: Add the Invalidate action

**Files:**
- Modify: `admin.jsx` — add an `invalidateCluster` handler inside `SuspiciousVotesPanel`, add an Action column to the active table.

- [ ] **Step 1: Add the handler inside the component**

Inside `SuspiciousVotesPanel`, between `useEffect(() => { refresh(); }, []);` and the `fmtTime` definition, add:

```jsx
  const setClusterInvalidation = async (cluster, invalidate) => {
    if (inFlight.has(cluster.key)) return;
    if (invalidate && !window.confirm(
      `Invalidate all ${cluster.n} votes in this cluster? They will be excluded from totals.`
    )) return;
    if (!invalidate && !window.confirm(
      `Restore all ${cluster.n} votes in this cluster?`
    )) return;

    setInFlight((s) => { const n = new Set(s); n.add(cluster.key); return n; });

    const patch = invalidate
      ? { invalidated_at: new Date().toISOString(), invalidated_by: session.user.id }
      : { invalidated_at: null, invalidated_by: null };

    // Optimistic UI: move the cluster between lists immediately.
    setState((s) => {
      const updated = { ...cluster, allInvalidated: invalidate };
      if (invalidate) {
        return {
          ...s,
          activeClusters: s.activeClusters.filter((c) => c.key !== cluster.key),
          invalidatedClusters: [updated, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      }
      return {
        ...s,
        invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
        activeClusters: [updated, ...s.activeClusters].sort((a, b) => b.n - a.n),
      };
    });

    const { error } = await window.sb
      .from("votes")
      .update(patch)
      .in("id", cluster.voteIds);

    if (error) {
      // Revert optimistic move.
      setState((s) => {
        const reverted = { ...cluster, allInvalidated: !invalidate };
        if (invalidate) {
          return {
            ...s,
            invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
            activeClusters: [reverted, ...s.activeClusters].sort((a, b) => b.n - a.n),
          };
        }
        return {
          ...s,
          activeClusters: s.activeClusters.filter((c) => c.key !== cluster.key),
          invalidatedClusters: [reverted, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      });
      alert((invalidate ? "Invalidate" : "Restore") + " failed: " + error.message);
    }

    setInFlight((s) => { const n = new Set(s); n.delete(cluster.key); return n; });
  };
```

- [ ] **Step 2: Add the Action column to the active table header**

Find the header row in the active section:

```jsx
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th></tr>
```

Replace with:

```jsx
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th><th>Action</th></tr>
```

- [ ] **Step 3: Add the Invalidate button cell to each active row**

Find the active row block (after Task 4, the row still uses the long key expression):

```jsx
              {state.activeClusters.map((c) => (
                <tr key={`${c.fingerprint}|${c.voter_ip}`}>
                  <td className="mono">{c.fingerprint.slice(0, 12)}…</td>
                  <td className="mono">{c.voter_ip}</td>
                  <td>{c.n}</td>
                  <td>{c.dogIds.map((id) => state.dogName.get(id) || id).join(", ")}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                </tr>
              ))}
```

Replace with (note: also switching `key` to `c.key` for consistency with the invalidated section):

```jsx
              {state.activeClusters.map((c) => (
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
                      onClick={() => setClusterInvalidation(c, true)}
                      disabled={inFlight.has(c.key)}>
                      {inFlight.has(c.key) ? "Working…" : "Invalidate"}
                    </button>
                  </td>
                </tr>
              ))}
```

- [ ] **Step 4: Browser test — invalidate a real cluster**

Reload the admin panel as `andrewmcamp@gmail.com`. Pick a small test cluster (or create test traffic if none are present), click Invalidate, confirm. Expected:
- The row moves from the Active table to the Invalidated section.
- No console errors.
- `mcp__supabase__execute_sql` query `select id, invalidated_at, invalidated_by from votes where id = any(<vote_ids>)` shows the timestamp set and the admin's user_id stored in `invalidated_by`.
- `select dog_id, votes from dog_vote_counts where dog_id = '<dog_id>'` shows the count reduced.

If the cluster you invalidated was real, run Step 5 of Task 7 to restore it after the next task is in.

- [ ] **Step 5: Commit**

```bash
git add admin.jsx
git commit -m "feat(admin): invalidate suspicious vote clusters"
```

---

## Task 7: Add the Restore action

**Files:**
- Modify: `admin.jsx` — extend the invalidated section's table to include an Action column with a Restore button. The handler from Task 6 already supports both directions.

- [ ] **Step 1: Add the Action column to the invalidated table**

In the Invalidated section, find the header row:

```jsx
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th></tr>
```

Replace with:

```jsx
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th><th>Action</th></tr>
```

- [ ] **Step 2: Add the Restore button cell to each invalidated row**

Find the invalidated row block (note: it currently uses `key={c.key}` already from Task 5):

```jsx
              {state.invalidatedClusters.map((c) => (
                <tr key={c.key}>
                  <td className="mono">{c.fingerprint.slice(0, 12)}…</td>
                  <td className="mono">{c.voter_ip}</td>
                  <td>{c.n}</td>
                  <td>{c.dogIds.map((id) => state.dogName.get(id) || id).join(", ")}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                </tr>
              ))}
```

Replace with:

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

- [ ] **Step 3: Browser test — restore a cluster**

Reload the admin panel. The cluster invalidated in Task 6 should still be in the Invalidated section. Click Restore, confirm. Expected:
- The row moves back to the Active table.
- `mcp__supabase__execute_sql` query `select id, invalidated_at, invalidated_by from votes where id = any(<vote_ids>)` shows both columns are NULL again.
- `dog_vote_counts` for that dog returns to its original value.

- [ ] **Step 4: Commit**

```bash
git add admin.jsx
git commit -m "feat(admin): restore invalidated vote clusters"
```

---

## Task 8: End-to-end manual verification

**Files:** none modified. This is the spec's test plan run against the live system.

- [ ] **Step 1: RLS — non-admin can't see invalidated rows**

In a private/incognito browser window, sign in to the public site as a non-admin (any email; will be anon if not signed in). Open the browser console and run:

```js
await window.sb.from("votes").select("id, invalidated_at").not("invalidated_at", "is", null);
```

Invalidate a test cluster as admin in another window first. Expected: the non-admin query returns `data: []` for invalidated rows. As admin (in the admin window), the same query returns the invalidated rows.

- [ ] **Step 2: RLS — non-admin cannot UPDATE**

In the non-admin browser console:

```js
await window.sb.from("votes").update({ invalidated_at: new Date().toISOString() }).eq("id", "<some-known-vote-id>");
```

Expected: `data: []` returned (RLS silently blocks the update — no rows match the policy `using` clause for non-admins). Verify in SQL afterwards that the row is unchanged.

- [ ] **Step 3: Re-vote flow**

In a fresh anon browser session, cast a vote on the public site. As admin, find that voter's vote in the suspicious panel (won't appear unless it's in a cluster — for this test, manually invalidate via SQL):

```sql
update public.votes set invalidated_at = now(), invalidated_by = '<admin-user-id>'
 where voter_id = '<the-anon-voter-id>';
```

Reload the public site as the same anon user. Expected: candidates display as un-voted; vote button is enabled. Cast a new vote. Expected: the vote succeeds (the partial unique index permits it because the prior row has `invalidated_at` set).

Verify in SQL: `select id, voter_id, invalidated_at from votes where voter_id = '<the-anon-voter-id>'` shows two rows — one invalidated, one active.

- [ ] **Step 4: Tally correctness**

After Step 3, query `select * from dog_vote_counts where dog_id = '<the-dog-id>'` and confirm the count reflects the active vote only (the invalidated one is excluded).

- [ ] **Step 5: Cleanup test data**

Delete the synthetic test rows created during verification:

```sql
-- Only deletes rows you created during verification. Dry-run the SELECT first.
delete from public.votes where voter_id = '<the-anon-voter-id>';
```

- [ ] **Step 6: Final commit (if there are any tracked changes)**

`git status` should be clean. If there's a worktree-level checkpoint or untracked cleanup, commit it.

---

## Done criteria

- All eight tasks' checkboxes are checked.
- `select * from dog_vote_counts` returns exactly the active-vote totals.
- The admin UI shows Invalidate buttons on active clusters and a separate Invalidated section with Restore buttons.
- An invalidated voter can re-cast a vote on the public site.
- Non-admin readers cannot see `invalidated_at`/`invalidated_by` for any row, nor see invalidated rows at all.
