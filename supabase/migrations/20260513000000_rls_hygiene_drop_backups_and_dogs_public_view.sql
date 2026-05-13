-- 1. Drop the two pre-migration backup tables. They had RLS disabled and full
--    anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE grants, leaking the voter↔dog
--    graph and (for the _split table) 26 rows of fingerprint/voter_ip/user_agent.
drop table public.votes_backup_20260508;
drop table public.votes_backup_20260509_split;

-- 2. Public projection of dogs for the storefront. Excludes `email` so the
--    public REST/realtime read path no longer carries owner contact info.
--    security_invoker = true means RLS on the base table still applies as the
--    caller, so the admin policy on dogs continues to work transparently.
create view public.dogs_public
  with (security_invoker = true) as
  select id, name, breed, age, owner_name, home_street, tagline, platform,
         photo_path, status, created_at
    from public.dogs
   where status = 'approved';

grant select on public.dogs_public to anon, authenticated;

comment on view public.dogs_public is
  'Storefront-safe projection of dogs. Excludes admin-only columns (email). Filters to approved status. The full table is still admin-readable via the dogs_select_admin policy.';
