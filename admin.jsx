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
        options: { emailRedirectTo: window.location.href },
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
    const { data: sub } = window.sb.auth.onAuthStateChange((_evt, s) => setSession(s));
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
      <p style={{ color: "#666" }}>(Nominations list lands in Task 13.)</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AdminApp />);
