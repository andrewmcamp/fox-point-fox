import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || null;
  return req.headers.get("cf-connecting-ip")
      ?? req.headers.get("x-real-ip")
      ?? null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);
  const jwt = auth.slice(7);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonResponse({ error: "unauthorized" }, 401);
  const voter_id = userData.user.id;

  let body: { dog_id?: unknown; fingerprint?: unknown };
  try { body = await req.json(); } catch { return jsonResponse({ error: "bad_request" }, 400); }

  const dog_id = typeof body.dog_id === "string" ? body.dog_id : null;
  if (!dog_id || !/^[0-9a-f-]{36}$/i.test(dog_id)) {
    return jsonResponse({ error: "bad_request", message: "invalid dog_id" }, 400);
  }
  const fingerprint =
    typeof body.fingerprint === "string" && body.fingerprint.length > 0 && body.fingerprint.length <= 128
      ? body.fingerprint
      : null;

  const voter_ip = clientIp(req);
  const user_agent = req.headers.get("User-Agent");

  // Atomic insert into votes + votes_meta via SECURITY INVOKER RPC. Service
  // role bypasses RLS for the writes; the function still validates dog status
  // so a stale dog_id can't be voted for.
  const { error: rpcErr } = await admin.rpc("cast_vote", {
    p_dog_id: dog_id,
    p_voter_id: voter_id,
    p_fingerprint: fingerprint,
    p_voter_ip: voter_ip,
    p_user_agent: user_agent,
  });

  if (rpcErr) {
    if (rpcErr.code === "23505") return jsonResponse({ error: "already_voted" }, 409);
    if (rpcErr.code === "P0001" || rpcErr.message?.includes("not_approved")) {
      return jsonResponse({ error: "not_approved" }, 403);
    }
    console.error("cast_vote RPC failed:", rpcErr);
    return jsonResponse({ error: "server_error" }, 500);
  }

  return jsonResponse({ ok: true });
});
