-- Supabase auto-grants EXECUTE on public-schema functions to anon and
-- authenticated. Strip those so the only role that can invoke cast_vote
-- via PostgREST is service_role (used by the cast-vote Edge Function).
revoke execute on function public.cast_vote(uuid, uuid, text, inet, text) from anon;
revoke execute on function public.cast_vote(uuid, uuid, text, inet, text) from authenticated;
