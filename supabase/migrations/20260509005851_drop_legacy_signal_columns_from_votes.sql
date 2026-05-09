-- Sensitive signals now live exclusively in votes_meta. Removing them from
-- votes closes the leak: PostgREST queries on votes can no longer return
-- them, and realtime broadcasts on votes can no longer carry them.
alter table public.votes
  drop column fingerprint,
  drop column voter_ip,
  drop column user_agent;
