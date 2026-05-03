// supabase-client.js — initializes the global Supabase client and anon session.
// The anon key is intentionally public; do not paste the service-role key here.

(function () {
  const SUPABASE_URL = "https://scupbstsavzjqamuixtp.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_Vw94Ithe9BSSEa46skdxXw_MSZQ0lZ2";

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = sb;

  window.sbReady = (async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) return session;
    const { data, error } = await sb.auth.signInAnonymously();
    if (error) {
      console.error("Anonymous sign-in failed:", error);
      throw error;
    }
    return data.session;
  })();

  window.sbReady.catch(() => {}); // suppress unhandledrejection; downstream callers handle via try/catch on await
})();
