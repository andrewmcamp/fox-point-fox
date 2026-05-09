/* global React, ReactDOM */
const { useState, useEffect } = React;

const ADMIN_EMAIL = "andrewmcamp@gmail.com";
// Jack is the admin's own dog; suppress test-traffic clusters that resolve to
// him alone in the suspicious-votes panel. Pinned by UUID so a name edit or a
// future second "Jack" can't silently change what gets filtered.
const ADMIN_DOG_ID = "5d985f9a-728c-4ba9-ab77-49ae3db40725";

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

function SuspiciousVotesPanel() {
  const [state, setState] = useState({
    loading: true, error: "",
    fpClusters: [], ipClusters: [],
    totalVotes: 0, missingSignals: 0, dogName: new Map(),
  });

  const refresh = async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      // Default PostgREST limit is 1000; raise it so this stays correct as the
      // election grows. Sensitive signals live on votes_meta (admin-read only via
      // RLS); votes carries dog_id + created_at which we join client-side.
      const [votesRes, metaRes, dogsRes] = await Promise.all([
        window.sb.from("votes").select("id, dog_id, created_at").limit(20000),
        window.sb.from("votes_meta").select("vote_id, fingerprint, voter_ip").limit(20000),
        window.sb.from("dogs").select("id, name"),
      ]);
      if (votesRes.error) throw votesRes.error;
      if (metaRes.error) throw metaRes.error;
      if (dogsRes.error) throw dogsRes.error;

      const dogName = new Map((dogsRes.data || []).map((d) => [d.id, d.name]));
      const votes = votesRes.data || [];
      const metaByVote = new Map((metaRes.data || []).map((m) => [m.vote_id, m]));

      const fpMap = new Map();
      const ipDogMap = new Map();
      let missing = 0;
      for (const v of votes) {
        const m = metaByVote.get(v.id);
        if (!m || (!m.fingerprint && !m.voter_ip)) missing++;
        if (!m) continue;
        const enriched = { dog_id: v.dog_id, created_at: v.created_at };
        if (m.fingerprint) {
          if (!fpMap.has(m.fingerprint)) fpMap.set(m.fingerprint, []);
          fpMap.get(m.fingerprint).push(enriched);
        }
        if (m.voter_ip) {
          const k = `${m.voter_ip}|${v.dog_id}`;
          if (!ipDogMap.has(k)) ipDogMap.set(k, []);
          ipDogMap.get(k).push(enriched);
        }
      }

      const summarize = (arr) => {
        let first = arr[0].created_at;
        let last = arr[0].created_at;
        for (const v of arr) {
          if (v.created_at < first) first = v.created_at;
          if (v.created_at > last) last = v.created_at;
        }
        return { first, last };
      };

      const fpClusters = [...fpMap.entries()]
        .filter(([, arr]) => arr.length > 1)
        .map(([fp, arr]) => {
          const { first, last } = summarize(arr);
          return {
            fingerprint: fp,
            n: arr.length,
            dogIds: [...new Set(arr.map((v) => v.dog_id))],
            firstAt: first, lastAt: last,
          };
        })
        // Hide clusters that are entirely votes for the admin's dog (test
        // traffic). Cross-candidate clusters that include them stay visible —
        // those are genuinely fishy regardless.
        .filter((c) => !(c.dogIds.length === 1 && c.dogIds[0] === ADMIN_DOG_ID))
        .sort((a, b) => b.n - a.n);

      const ipClusters = [...ipDogMap.entries()]
        .filter(([, arr]) => arr.length > 4)
        .map(([key, arr]) => {
          const [ip, dog_id] = key.split("|");
          const { first, last } = summarize(arr);
          return { ip, dog_id, n: arr.length, firstAt: first, lastAt: last };
        })
        .filter((c) => c.dog_id !== ADMIN_DOG_ID)
        .sort((a, b) => b.n - a.n);

      setState({
        loading: false, error: "",
        fpClusters, ipClusters,
        totalVotes: votes.length, missingSignals: missing, dogName,
      });
    } catch (e) {
      console.error("suspicious-votes refresh failed:", e);
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  };

  useEffect(() => { refresh(); }, []);

  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

  return (
    <section className="suspicious-panel">
      <div className="suspicious-header">
        <div>
          <h2>Suspicious vote signals</h2>
          <div className="suspicious-summary">
            <span><strong>{state.totalVotes}</strong> total</span>
            <span><strong>{state.missingSignals}</strong> legacy (no signals)</span>
            <span><strong>{state.fpClusters.length}</strong> fingerprint clusters</span>
            <span><strong>{state.ipClusters.length}</strong> IP/candidate flags</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={state.loading}>
          {state.loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {state.error && <div className="empty-pending error">Error: {state.error}</div>}

      <div className="suspicious-section">
        <h3>Shared fingerprints</h3>
        <p className="suspicious-hint">Same device hash voted more than once.</p>
        {state.fpClusters.length === 0 ? (
          <div className="empty-pending">No fingerprint clusters.</div>
        ) : (
          <table className="suspicious-table">
            <thead>
              <tr><th>Fingerprint</th><th>Votes</th><th>Candidates</th><th>First</th><th>Last</th></tr>
            </thead>
            <tbody>
              {state.fpClusters.map((c) => (
                <tr key={c.fingerprint}>
                  <td className="mono">{c.fingerprint.slice(0, 12)}…</td>
                  <td>{c.n}</td>
                  <td>{c.dogIds.map((id) => state.dogName.get(id) || id).join(", ")}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="suspicious-section">
        <h3>One IP, same candidate (&gt;4 votes)</h3>
        <p className="suspicious-hint">A candidate received 5+ votes from a single IP.</p>
        {state.ipClusters.length === 0 ? (
          <div className="empty-pending">No flagged IP/candidate pairs.</div>
        ) : (
          <table className="suspicious-table">
            <thead>
              <tr><th>IP</th><th>Candidate</th><th>Votes</th><th>First</th><th>Last</th></tr>
            </thead>
            <tbody>
              {state.ipClusters.map((c) => (
                <tr key={`${c.ip}|${c.dog_id}`}>
                  <td className="mono">{c.ip}</td>
                  <td>{state.dogName.get(c.dog_id) || c.dog_id}</td>
                  <td>{c.n}</td>
                  <td>{fmtTime(c.firstAt)}</td>
                  <td>{fmtTime(c.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
      <SuspiciousVotesPanel />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
