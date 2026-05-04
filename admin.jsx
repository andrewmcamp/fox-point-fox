/* global React, ReactDOM */
const { useState, useEffect } = React;

const ADMIN_EMAIL = "andrewmcamp@gmail.com";

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
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
