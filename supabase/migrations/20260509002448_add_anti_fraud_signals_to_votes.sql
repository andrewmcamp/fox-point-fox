alter table public.votes
  add column if not exists fingerprint text,
  add column if not exists voter_ip    inet,
  add column if not exists user_agent  text;

comment on column public.votes.fingerprint is 'Client-volunteered device hash (SHA-256 hex). For post-hoc abuse review only — trivially spoofable.';
comment on column public.votes.voter_ip   is 'Server-stamped IP read from x-forwarded-for in cast-vote Edge Function.';
comment on column public.votes.user_agent is 'Server-stamped User-Agent header from cast-vote Edge Function.';
