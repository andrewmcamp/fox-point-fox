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
--    security_invoker is explicit so the view evaluates RLS as the caller;
--    CREATE OR REPLACE preserves reloptions but being explicit removes the
--    implicit dependency on prior state.
create or replace view public.dog_vote_counts
  with (security_invoker = true) as
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
