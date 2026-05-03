/* global React, ReactDOM */
const { useState, useEffect } = React;

const ADMIN_EMAIL = "andrewmcamp@gmail.com";

function LoginCard({ onSent }) {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { error } = await window.sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
      onSent(email);
    } catch (e2) {
      setErr(e2.message || String(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: 12 }}>Admin</h1>
      <p style={{ color: "#555" }}>Enter your email to receive a sign-in link.</p>
      <form onSubmit={submit}>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          style={{ width: "100%", padding: 10, fontSize: 16, marginBottom: 12 }}
        />
        <button type="submit" disabled={busy} style={{ padding: "10px 16px" }}>
          {busy ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {err && <div style={{ color: "#a52a1a", marginTop: 12 }}>{err}</div>}
    </div>
  );
}

function SentNotice({ email }) {
  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>Check your inbox</h1>
      <p>We sent a sign-in link to <strong>{email}</strong>. Click it to come back here authenticated.</p>
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
    setRows((r) => r.filter(x => x.id !== id)); // optimistic
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

  if (loading) return <div>Loading…</div>;
  if (error) return <div style={{ color: "#a52a1a" }}>Error: {error}</div>;
  if (!rows.length) return <p style={{ color: "#666" }}>No pending nominations.</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {rows.map(d => (
        <div key={d.id} style={{
          display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 16,
          padding: 16, border: "1px solid #ddd", borderRadius: 8, alignItems: "center"
        }}>
          {photoUrl(d.photo_path)
            ? <img src={photoUrl(d.photo_path)} alt={d.name}
                   style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6 }} />
            : <div style={{ width: 120, height: 120, background: "#eee", borderRadius: 6 }} />}
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{d.name}</div>
            <div style={{ color: "#666" }}>{d.breed} · {d.home_street} · age {d.age ?? "?"}</div>
            <div style={{ color: "#666", fontSize: 14 }}>Owner: {d.owner_name}{d.email ? ` · ${d.email}` : ""}</div>
            {d.tagline && <div style={{ marginTop: 8, fontStyle: "italic" }}>"{d.tagline}"</div>}
            {d.platform && d.platform.length > 0 && (
              <ul style={{ marginTop: 8 }}>
                {d.platform.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setStatus(d.id, "approved")} disabled={inFlight.has(d.id)}
                    style={{ padding: "8px 14px", background: "#2a7a3a", color: "white", border: 0, borderRadius: 4, opacity: inFlight.has(d.id) ? 0.6 : 1 }}>
              Approve
            </button>
            <button onClick={() => { if (window.confirm(`Reject nomination for ${d.name}?`)) setStatus(d.id, "rejected"); }} disabled={inFlight.has(d.id)}
                    style={{ padding: "8px 14px", background: "#a52a1a", color: "white", border: 0, borderRadius: 4, opacity: inFlight.has(d.id) ? 0.6 : 1 }}>
              Reject
            </button>
          </div>
        </div>
      ))}
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

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  // Anonymous sessions don't count as logged in for admin purposes.
  const isAdmin = session && !session.user.is_anonymous && session.user.email === ADMIN_EMAIL;

  if (!isAdmin && sentTo) return <SentNotice email={sentTo} />;
  if (!isAdmin) return <LoginCard onSent={setSentTo} />;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Pending nominations</h1>
        <button onClick={() => window.sb.auth.signOut()}>Sign out</button>
      </div>
      <PendingList />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
