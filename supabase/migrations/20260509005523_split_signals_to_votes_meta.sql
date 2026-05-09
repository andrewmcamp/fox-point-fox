-- 1. Sibling table: vote_id is both PK and FK so each vote has at most one
--    metadata row, and a vote deletion cascades the meta row.
create table public.votes_meta (
  vote_id     uuid primary key references public.votes(id) on delete cascade,
  fingerprint text,
  voter_ip    inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

comment on table public.votes_meta is
  'Sensitive per-vote signals (fingerprint, IP, UA). Read-restricted via RLS to the admin email; written only by the cast_vote RPC running under service_role.';

-- 2. RLS: only the admin email can read. No other policies → service_role
--    (which bypasses RLS) is the only writer.
alter table public.votes_meta enable row level security;

create policy votes_meta_admin_read on public.votes_meta
  for select
  using ((auth.jwt() ->> 'email') = 'andrewmcamp@gmail.com');

-- 3. Backfill from rows already on votes that have any signal.
insert into public.votes_meta (vote_id, fingerprint, voter_ip, user_agent)
select id, fingerprint, voter_ip, user_agent
  from public.votes
 where fingerprint is not null
    or voter_ip    is not null
    or user_agent  is not null;

-- 4. Atomic cast: insert into votes and votes_meta in one transaction.
--    SECURITY INVOKER (default) — caller's RLS applies. The cast-vote Edge
--    Function calls this with service_role, which bypasses RLS for the writes;
--    if a non-service caller ever invoked it, RLS on votes/votes_meta would
--    block the inserts. Belt-and-braces: also revoke EXECUTE from public.
create or replace function public.cast_vote(
  p_dog_id      uuid,
  p_voter_id    uuid,
  p_fingerprint text,
  p_voter_ip    inet,
  p_user_agent  text
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.dogs where id = p_dog_id and status = 'approved'
  ) then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;

  insert into public.votes (dog_id, voter_id)
       values (p_dog_id, p_voter_id)
    returning id into v_id;

  insert into public.votes_meta (vote_id, fingerprint, voter_ip, user_agent)
       values (v_id, p_fingerprint, p_voter_ip, p_user_agent);

  return v_id;
end;
$$;

revoke execute on function public.cast_vote(uuid, uuid, text, inet, text) from public;
grant  execute on function public.cast_vote(uuid, uuid, text, inet, text) to service_role;
