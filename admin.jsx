/* global React, ReactDOM */
const { useState, useEffect } = React;

const ADMIN_EMAIL = "andrewmcamp@gmail.com";
// Jack is the admin's own dog; suppress test-traffic clusters that resolve to
// him alone in the suspicious-votes panel. Pinned by UUID so a name edit or a
// future second "Jack" can't silently change what gets filtered.
const ADMIN_DOG_ID = "5d985f9a-728c-4ba9-ab77-49ae3db40725";

// Legacy-vote burst heuristic: a cluster of legacy votes (no fingerprint, no IP)
// for the same candidate where MIN_VOTES_IN_WINDOW or more votes land within
// WINDOW_SECONDS of the burst's first vote, with consecutive gaps under
// MAX_GAP_SECONDS keeping the burst alive.
const BURST_MIN_VOTES_IN_WINDOW = 7;
const BURST_WINDOW_SECONDS = 60;
const BURST_MAX_GAP_SECONDS = 30;

function LoginCard({ onSent }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const trimmed = email.trim();
    if (!trimmed) {
      setErr("Please enter an email address.");
      return;
    }
    if (trimmed.toLowerCase() !== ADMIN_EMAIL) {
      setErr("Sorry — this admin tool is restricted.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await window.sb.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
      onSent(trimmed);
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell-narrow">
      <div className="admin-card">
        <span className="eyebrow">Fox of Fox Point</span>
        <h1>Admin sign-in</h1>
        <p className="sub">Enter your admin email to receive a sign-in link.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn btn-fox" disabled={busy}>
            {busy ? "Sending…" : "Send magic link"}
          </button>
        </form>
        {err && <div className="field-error">{err}</div>}
      </div>
    </div>
  );
}

function SentNotice({ email }) {
  return (
    <div className="admin-shell-narrow">
      <div className="admin-card">
        <span className="eyebrow">Almost there</span>
        <h1>Check your inbox</h1>
        <p className="sub">
          We sent a sign-in link to <strong>{email}</strong>.
          Click it to come back here authenticated.
        </p>
      </div>
    </div>
  );
}

function PendingList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inFlight, setInFlight] = useState(new Set());

  const photoUrl = (path) =>
    path ? window.sb.storage.from("nominations").getPublicUrl(path).data.publicUrl : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await window.sb
        .from("dogs").select("*").eq("status", "pending")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setRows((current) => {
          const fetched = data || [];
          const fetchedIds = new Set(fetched.map(r => r.id));
          const realtimeOnly = current.filter(r => !fetchedIds.has(r.id));
          return [...fetched, ...realtimeOnly];
        });
      }
      setLoading(false);
    })();
    const channel = window.sb
      .channel("admin:pending")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "dogs" },
        (payload) => {
          if (payload.new.status === "pending") {
            setRows((r) => r.some(x => x.id === payload.new.id) ? r : [...r, payload.new]);
          }
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "dogs" },
        (payload) => {
          if (payload.new.status !== "pending") {
            setRows((r) => r.filter(x => x.id !== payload.new.id));
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("admin pending channel error:", status, err);
      });
    return () => { cancelled = true; window.sb.removeChannel(channel); };
  }, []);

  const setStatus = async (id, status) => {
    if (inFlight.has(id)) return;
    setInFlight((s) => { const n = new Set(s); n.add(id); return n; });
    const removedRow = rows.find(x => x.id === id);
    setRows((r) => r.filter(x => x.id !== id));
    const { error } = await window.sb.from("dogs").update({ status }).eq("id", id);
    if (error) {
      setRows((r) => {
        if (!removedRow || r.some(x => x.id === id)) return r;
        return [...r, removedRow].sort((a, b) =>
          (a.created_at || "").localeCompare(b.created_at || "")
        );
      });
      alert("Update failed: " + error.message);
    }
    setInFlight((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  if (loading) return <div className="empty-pending">Loading…</div>;
  if (error) return <div className="empty-pending error">Error: {error}</div>;
  if (!rows.length) return <div className="empty-pending">No pending nominations right now.</div>;

  return (
    <div className="pending-grid">
      {rows.map(d => {
        const url = photoUrl(d.photo_path);
        return (
          <div key={d.id} className="pending-row">
            {url
              ? <img className="pending-photo" src={url} alt={d.name} />
              : <div className="pending-photo" />}
            <div className="pending-info">
              <div className="pending-name">{d.name}</div>
              <div className="pending-meta">
                {d.breed} · {d.home_street} · age {d.age ?? "?"}
                <br />
                Owner: {d.owner_name}{d.email ? ` · ${d.email}` : ""}
              </div>
              {d.tagline && <div className="pending-quote">"{d.tagline}"</div>}
              {d.platform && d.platform.length > 0 && (
                <ul className="pending-platform">
                  {d.platform.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              )}
            </div>
            <div className="pending-actions">
              <button
                className="btn btn-fox"
                onClick={() => setStatus(d.id, "approved")}
                disabled={inFlight.has(d.id)}>
                Approve
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { if (window.confirm(`Reject nomination for ${d.name}?`)) setStatus(d.id, "rejected"); }}
                disabled={inFlight.has(d.id)}>
                Reject
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Identify legacy-vote burst clusters per candidate. Input: every legacy vote
// (no fingerprint, no IP) including invalidated ones, plus the dog-name map.
// Output: cluster objects with the same shape the existing fingerprint+IP
// builder uses, plus type = "time-burst".
function buildTimeBurstClusters(legacyVotes, dogName) {
  // Group by dog_id, sorted ascending by created_at.
  const byDog = new Map();
  for (const v of legacyVotes) {
    if (!byDog.has(v.dog_id)) byDog.set(v.dog_id, []);
    byDog.get(v.dog_id).push(v);
  }
  for (const arr of byDog.values()) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  const clusters = [];
  for (const [dog_id, arr] of byDog.entries()) {
    let burst = [];
    const flushIfQualifying = () => {
      if (burst.length === 0) return;
      const firstAt = burst[0].created_at;
      // Compare on epoch ms — Postgres serializes timestamptz with +00:00 and 6
      // microsecond digits; toISOString() emits Z and 3 milliseconds, so string
      // compare across the formats can include sub-ms-late votes incorrectly.
      const cutoffMs = new Date(firstAt).getTime() + BURST_WINDOW_SECONDS * 1000;
      const inWindow = burst.filter((v) => new Date(v.created_at).getTime() <= cutoffMs).length;
      if (inWindow >= BURST_MIN_VOTES_IN_WINDOW) {
        clusters.push({
          key: `burst:${dog_id}:${firstAt}`,
          type: "time-burst",
          dog_id,
          dog_name: dogName.get(dog_id) || dog_id,
          n: burst.length,
          voteIds: burst.map((v) => v.id),
          dogIds: [dog_id],
          firstAt,
          lastAt: burst[burst.length - 1].created_at,
          votesInFirst60s: inWindow,
          allInvalidated: burst.every((v) => v.invalidated_at !== null),
        });
      }
      burst = [];
    };

    for (const v of arr) {
      if (burst.length === 0) {
        burst.push(v);
        continue;
      }
      const prev = burst[burst.length - 1];
      const gapSec = (new Date(v.created_at).getTime() - new Date(prev.created_at).getTime()) / 1000;
      if (gapSec > BURST_MAX_GAP_SECONDS) {
        flushIfQualifying();
        burst.push(v);
      } else {
        burst.push(v);
      }
    }
    flushIfQualifying();
  }

  // Hide bursts that are entirely the admin's dog (test traffic), matching
  // the existing fingerprint+IP filter convention.
  return clusters.filter((c) => c.dog_id !== ADMIN_DOG_ID);
}

function SuspiciousVotesPanel({ session }) {
  const [state, setState] = useState({
    loading: true, error: "",
    activeDeviceIpClusters: [],
    activeTimeBurstClusters: [],
    invalidatedClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });
  // Cluster keys (device-ip: `fingerprint|voter_ip`; time-burst:
  // `burst:dog_id:firstAt`) currently mid-update. Mirrors PendingList's pattern.
  const [inFlight, setInFlight] = useState(new Set());

  const refresh = async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      // Default PostgREST limit is 1000; raise it so this stays correct as the
      // election grows. Sensitive signals live on votes_meta (admin-read only via
      // RLS); votes carries dog_id + created_at which we join client-side.
      const [votesRes, metaRes, dogsRes] = await Promise.all([
        window.sb.from("votes").select("id, dog_id, created_at, invalidated_at, invalidated_by").limit(20000),
        window.sb.from("votes_meta").select("vote_id, fingerprint, voter_ip").limit(20000),
        window.sb.from("dogs").select("id, name"),
      ]);
      if (votesRes.error) throw votesRes.error;
      if (metaRes.error) throw metaRes.error;
      if (dogsRes.error) throw dogsRes.error;

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
            type: "device-ip",
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

      const activeDeviceIpClusters = allClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedDeviceIpClusters = allClusters
        .filter((c) => c.allInvalidated);

      // Build legacy vote list (no fingerprint, no IP — or no meta row at all),
      // including invalidated rows so already-invalidated bursts can surface
      // in the Invalidated section for restore.
      const legacyVotes = votes.filter((v) => {
        const m = metaByVote.get(v.id);
        return !m || (!m.fingerprint && !m.voter_ip);
      });
      const burstClusters = buildTimeBurstClusters(legacyVotes, dogName);
      const activeTimeBurstClusters = burstClusters
        .filter((c) => !c.allInvalidated)
        .sort((a, b) => b.n - a.n);
      const invalidatedTimeBurstClusters = burstClusters
        .filter((c) => c.allInvalidated);

      const invalidatedClusters = [
        ...invalidatedDeviceIpClusters,
        ...invalidatedTimeBurstClusters,
      ].sort((a, b) => b.n - a.n);

      setState({
        loading: false, error: "",
        activeDeviceIpClusters, activeTimeBurstClusters, invalidatedClusters,
        totalVotes: votes.length, missingSignals: missing, dogName,
      });
    } catch (e) {
      console.error("suspicious-votes refresh failed:", e);
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  };

  useEffect(() => { refresh(); }, []);

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

    // Optimistic UI: move the cluster between lists immediately. The active
    // side is keyed by cluster.type; the invalidated side is unified.
    setState((s) => {
      const updated = { ...cluster, allInvalidated: invalidate };
      const activeKey = cluster.type === "time-burst"
        ? "activeTimeBurstClusters"
        : "activeDeviceIpClusters";
      if (invalidate) {
        return {
          ...s,
          [activeKey]: s[activeKey].filter((c) => c.key !== cluster.key),
          invalidatedClusters: [updated, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      }
      return {
        ...s,
        invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
        [activeKey]: [updated, ...s[activeKey]].sort((a, b) => b.n - a.n),
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
        const activeKey = cluster.type === "time-burst"
          ? "activeTimeBurstClusters"
          : "activeDeviceIpClusters";
        if (invalidate) {
          return {
            ...s,
            invalidatedClusters: s.invalidatedClusters.filter((c) => c.key !== cluster.key),
            [activeKey]: [reverted, ...s[activeKey]].sort((a, b) => b.n - a.n),
          };
        }
        return {
          ...s,
          [activeKey]: s[activeKey].filter((c) => c.key !== cluster.key),
          invalidatedClusters: [reverted, ...s.invalidatedClusters].sort((a, b) => b.n - a.n),
        };
      });
      alert((invalidate ? "Invalidate" : "Restore") + " failed: " + error.message);
    }

    setInFlight((s) => { const n = new Set(s); n.delete(cluster.key); return n; });
  };

  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

  return (
    <section className="suspicious-panel">
      <div className="suspicious-header">
        <div>
          <h2>Suspicious vote signals</h2>
          <div className="suspicious-summary">
            <span><strong>{state.totalVotes}</strong> total</span>
            <span><strong>{state.missingSignals}</strong> legacy (no signals)</span>
            <span><strong>{state.activeDeviceIpClusters.length}</strong> active clusters</span>
            <span><strong>{state.activeTimeBurstClusters.length}</strong> active bursts</span>
            <span><strong>{state.invalidatedClusters.length}</strong> invalidated</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={state.loading}>
          {state.loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {state.error && <div className="empty-pending error">Error: {state.error}</div>}

      <div className="suspicious-section">
        <p className="suspicious-hint">
          Multiple votes from the same device fingerprint <em>and</em> the same IP. Two-of-a-kind on iOS in the same household can trip this — read the count and timing before acting.
        </p>
        {state.activeDeviceIpClusters.length === 0 ? (
          <div className="empty-pending">No shared device+IP clusters.</div>
        ) : (
          <table className="suspicious-table">
            <thead>
              <tr><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.activeDeviceIpClusters.map((c) => (
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
            </tbody>
          </table>
        )}
      </div>

      <div className="suspicious-section">
        <h3 style={{ marginTop: "1.5rem" }}>Time-cluster bursts (legacy)</h3>
        <p className="suspicious-hint">
          Legacy votes (no device/IP) where {BURST_MIN_VOTES_IN_WINDOW}+ votes for the same candidate landed in {BURST_WINDOW_SECONDS} seconds, extended while gaps stayed under {BURST_MAX_GAP_SECONDS} seconds. Two real friends voting back-to-back can occasionally trip this — read the timing before acting.
        </p>
        {state.activeTimeBurstClusters.length === 0 ? (
          <div className="empty-pending">No legacy-vote bursts.</div>
        ) : (
          <table className="suspicious-table">
            <thead>
              <tr><th>Candidate</th><th>Votes</th><th>Duration</th><th>First 60s</th><th>First</th><th>Last</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.activeTimeBurstClusters.map((c) => {
                const durSec = Math.round((new Date(c.lastAt).getTime() - new Date(c.firstAt).getTime()) / 1000);
                return (
                  <tr key={c.key}>
                    <td>{c.dog_name}</td>
                    <td>{c.n}</td>
                    <td>{durSec}s</td>
                    <td>{c.votesInFirst60s}</td>
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {state.invalidatedClusters.length > 0 && (
        <div className="suspicious-section">
          <h3 style={{ marginTop: "1.5rem" }}>Invalidated clusters</h3>
          <p className="suspicious-hint">
            These clusters were soft-deleted and excluded from totals. Restore returns them to the active tally.
          </p>
          <table className="suspicious-table">
            <thead>
              <tr><th>Type</th><th>Fingerprint</th><th>IP</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th><th>Action</th></tr>
            </thead>
            <tbody>
              {state.invalidatedClusters.map((c) => (
                <tr key={c.key}>
                  <td>{c.type === "time-burst" ? "time burst" : "device+IP"}</td>
                  <td className="mono">{c.fingerprint ? `${c.fingerprint.slice(0, 12)}…` : "—"}</td>
                  <td className="mono">{c.voter_ip || "—"}</td>
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
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminApp() {
  const [session, setSession] = useState(null);
  const [sentTo, setSentTo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await window.sbReady;
      const { data: { session } } = await window.sb.auth.getSession();
      setSession(session);
      setLoading(false);
    })();
    const { data: sub } = window.sb.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="admin-shell-narrow"><div className="admin-card"><p className="sub">Loading…</p></div></div>;
  }

  const isAdmin = session && !session.user.is_anonymous && session.user.email === ADMIN_EMAIL;

  if (!isAdmin && sentTo) return <SentNotice email={sentTo} />;
  if (!isAdmin) return <LoginCard onSent={setSentTo} />;

  return (
    <div className="admin-shell">
      <div className="admin-header">
        <div className="title-block">
          <span className="eyebrow">Fox of Fox Point · Admin</span>
          <h1>Pending nominations</h1>
          <div className="sub">Signed in as {session.user.email}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.sb.auth.signOut()}>
          Sign out
        </button>
      </div>
      <PendingList />
      <SuspiciousVotesPanel session={session} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
