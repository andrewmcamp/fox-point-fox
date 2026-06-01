/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo } = React;

// Survey is a Netlify Form — see docs/2027-survey-questions.md.
// Submissions land in the Netlify dashboard under the "survey-2027" form.
const SURVEY_FORM_NAME = "survey-2027";

// === Share button ===
function ShareButton({ contestant }) {
  const [copied, setCopied] = useState(false);
  const handle = async (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}?fox=${contestant.id}`;
    const shareData = {
      title: `${contestant.name} — Fox of Fox Point 2026`,
      text: `Meet ${contestant.name}, one of the 2026 candidates for Fox of Fox Point.`,
      url,
    };
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — silent
    }
  };
  return (
    <button
      className={`pass-along-btn ${copied ? "copied" : ""}`}
      onClick={handle}
      aria-label={`Share ${contestant.name}`}>
      <span className="pass-along-icon" aria-hidden="true">{copied ? "✓" : "↗"}</span>
      <span>{copied ? "Copied!" : "Share"}</span>
    </button>);
}

// === Closed-early note (auto-hides on 2026-06-03 at local midnight) ===
// Acknowledges that voting was cut short on the night of 2026-05-31.
// Remove this component (and its render site below) any time after the hide date.
const CLOSED_EARLY_HIDE_AT = new Date(2026, 5, 3, 0, 0, 0).getTime();
function ClosedEarlyNote() {
  if (Date.now() >= CLOSED_EARLY_HIDE_AT) return null;
  return (
    <aside className="closed-early-note" role="note">
      <span className="closed-early-tag">Note</span>
      <p>Thank you, everyone, for participating!<br />I shut down voting around 10pm because I needed to get to bed and it seemed like votes were done.</p>
    </aside>);
}

// === Hero (post-vote, compact, full-width) ===
// TODO: hero copy is the post-vote draft — confirm wording before cutover.
const PODIUM_TIERS = ["gold", "silver", "bronze"];

function Hero({ contestants, onJump }) {
  return (
    <section className="hero-compact" id="top">
      <div className="hero-compact-inner">
        <span className="eyebrow">Voting closed May 31, 2026</span>
        <h1 className="hero-compact-title">
          The <span className="fox-word">Foxes of Fox Point</span>
        </h1>
        <p className="hero-compact-lede">
          Thanks to everyone who nominated, voted, and rallied their friends. The 2026 results are in — and the next election kicks off Spring 2027.
        </p>
        <div className="hero-cta">
          <button className="btn btn-fox" onClick={() => onJump("survey")}>Take the 2-minute survey →</button>
          <button className="btn btn-ghost" onClick={() => onJump("foxes")}>See all {contestants.length ? `${contestants.length} ` : ""}candidates</button>
        </div>
      </div>
    </section>);
}

// === Podium (top 3) ===
function PodiumSection({ contestants, onOpen }) {
  const podium = contestants.slice(0, 3);
  if (podium.length < 3) return null;
  return (
    <section className="podium-section" id="podium">
      <div className="podium-section-inner">
        <ol className="podium podium-large" aria-label="Top three candidates">
          {podium.map((c, i) => {
            const tier = PODIUM_TIERS[i];
            return (
              <li
                key={c.id}
                className={`podium-item podium-${tier}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(c.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c.id); } }}>
                <div className={`podium-badge ${tier}`}>#{i + 1}</div>
                <div className="podium-photo">
                  <img src={c.photo_url} alt={c.name} />
                </div>
                <div className="podium-body">
                  <div className="podium-name">{c.name}</div>
                  <div className="podium-meta">{c.breed} · {c.street}</div>
                  {c.quote ? <div className="podium-quote">"{c.quote}"</div> : null}
                </div>
              </li>);
          })}
        </ol>
      </div>
    </section>);
}

// === Candidate gallery ===
function FoxesSection({ contestants, onOpen, error }) {
  const [sort, setSort] = useState("rank");

  const sorted = useMemo(() => {
    const list = [...contestants];
    if (sort === "rank") list.sort((a, b) => a.final_rank - b.final_rank);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [contestants, sort]);

  return (
    <section className="section" id="foxes">
      <span className="eyebrow">{contestants.length === 1 ? "One candidate" : `${contestants.length} candidates`}</span>
      <h2 style={{ marginTop: 8, marginBottom: 14 }}>Meet the candidates.</h2>
      <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginBottom: 32 }}>
        Each one nominated by a neighbor. Tap any of them for the full pitch.
      </p>

      <div className="filter-bar">
        <div className="chips">
          {[["rank", "Voter order"], ["name", "A→Z"]].map(([v, l]) =>
            <button key={v} className={`chip ${sort === v ? "active" : ""}`} onClick={() => setSort(v)}>{l}</button>
          )}
        </div>
      </div>

      {!sorted.length && (
        <p style={{ color: "var(--ink-2)" }}>
          {error || "No candidates to show."}
        </p>
      )}
      <div className="fox-grid">
        {sorted.map((c) =>
          <article
            key={c.id}
            className="fox-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(c.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c.id); } }}>
            <div className="photo-wrap">
              <img src={c.photo_url} alt={c.name} loading="lazy" />
            </div>
            <div className="body">
              <h3>{c.name}</h3>
              <div className="meta">{c.breed} · {c.street}</div>
              <div className="quote">{c.quote}</div>
            </div>
          </article>
        )}
      </div>
    </section>);
}

// === Survey section (Netlify Forms) ===
const Q_ROLE = [
  ["nominated", "Nominated a dog"],
  ["voted", "Voted"],
  ["shared", "Shared it / told a neighbor"],
  ["browsed", "Just browsed the candidates"],
];
const Q_DURATION = [
  ["way_too_long", "Way too long — a week or two would have been plenty"],
  ["a_little_long", "A little long — three weeks would be better"],
  ["about_right", "About right"],
  ["too_short", "Too short — I missed it or wanted more time"],
];
const Q_AUTH = [
  ["social_login", "Sign in with Google, Apple, or Facebook"],
  ["sms", "Verify via a one-time text message"],
  ["email", "Verify via a one-time email link"],
  ["captcha", "A CAPTCHA only (no account or contact info)"],
  ["honor_system", "None — keep it honor-system; fraud cleanup is the price of low friction"],
  ["dont_care", "Don't care — your call"],
];
const Q_EVENT = [
  ["meet_the_candidates", "A meet-the-candidates evening before voting opens"],
  ["awards_party", "An awards or winners party after voting closes"],
  ["casual_meetup", "A casual dog meetup with no formal program"],
  ["online_only", "Probably not — the online version is enough"],
];
const Q_PAIN = [
  ["fraud_distracting", "The fraud and disqualifications got distracting"],
  ["voting_confusing", "The voting flow was confusing"],
  ["photo_upload", "Photo upload didn't work or was hard"],
  ["vote_unconfirmed", "I couldn't tell if my vote went through"],
  ["bad_info", "Some candidate info was missing or wrong"],
  ["none", "Nothing really — it was great"],
  ["other", "Other"],
];

function RadioGroup({ name, options, required }) {
  return (
    <div className="opt-grid">
      {options.map(([value, label]) =>
        <label key={value} className="opt opt-radio">
          <input type="radio" name={name} value={value} required={required} />
          <span>{label}</span>
        </label>
      )}
    </div>);
}
function CheckGroup({ name, options }) {
  return (
    <div className="opt-grid">
      {options.map(([value, label]) =>
        <label key={value} className="opt opt-check">
          <input type="checkbox" name={name} value={value} />
          <span>{label}</span>
        </label>
      )}
    </div>);
}

function SurveySection() {
  const [status, setStatus] = useState("idle"); // idle | submitting | done | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    const form = e.target;
    const formData = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of formData.entries()) params.append(k, v);
    try {
      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("done");
      // Scroll the thanks block into view so the user sees confirmation.
      setTimeout(() => {
        const el = document.getElementById("survey");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err) {
      console.error("Survey submit failed:", err);
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <section className="section" id="survey">
        <div className="survey-thanks">
          <span className="eyebrow">Thanks for the time</span>
          <h2 style={{ marginTop: 12 }}>Got it.</h2>
          <p style={{ color: "var(--ink-2)", marginTop: 14, maxWidth: "50ch", marginInline: "auto" }}>
            That's it. I'll read every response and use them to shape the 2027 contest. See you in the spring.
          </p>
          <p className="survey-thanks-sig">— Andrew</p>
        </div>
      </section>);
  }

  return (
    <section className="section" id="survey">
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <span className="eyebrow" style={{ display: "inline-flex" }}>Help shape next year</span>
        <h2 style={{ marginTop: 12 }}>2-minute survey.</h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "55ch", margin: "12px auto 0" }}>
          Seven quick questions on how to run the contest in 2027 — what worked, what didn't, what you'd change. Answers go straight to me.
        </p>
      </div>

      <form
        className="survey-form"
        name={SURVEY_FORM_NAME}
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        onSubmit={handleSubmit}>
        <input type="hidden" name="form-name" value={SURVEY_FORM_NAME} />
        <p className="survey-honeypot" hidden>
          <label>Don't fill this out if you're human: <input name="bot-field" tabIndex="-1" autoComplete="off" /></label>
        </p>

        <div className="survey-q" role="group">
          <div className="survey-q-title">1. How did you take part in the 2026 election?</div>
          <p className="q-help">Select all that apply.</p>
          <CheckGroup name="role" options={Q_ROLE} />
        </div>

        <div className="survey-q" role="group">
          <div className="survey-q-title">2. How did the one-month voting window feel?</div>
          <RadioGroup name="duration" options={Q_DURATION} required />
        </div>

        <div className="survey-q" role="group">
          <div className="survey-q-title">3. Some votes this year were obviously fake and had to be removed. For 2027, which verification methods would feel acceptable to you?</div>
          <p className="q-help">Select every option you'd be OK with.</p>
          <CheckGroup name="auth" options={Q_AUTH} />
        </div>

        <div className="survey-q" role="group">
          <div className="survey-q-title">4. Would you come to an in-person event in 2027?</div>
          <p className="q-help">Select all that interest you.</p>
          <CheckGroup name="event" options={Q_EVENT} />
        </div>

        <div className="survey-q" role="group">
          <div className="survey-q-title">5. Anything about the 2026 election that didn't sit right?</div>
          <p className="q-help">Select all that apply.</p>
          <CheckGroup name="pain" options={Q_PAIN} />
        </div>

        <div className="survey-q" role="group">
          <div className="survey-q-title">6. Want a heads-up when 2027 nominations open? Drop your email. <span className="q-optional">(Optional)</span></div>
          <p className="q-help">Used only to notify you when the next election starts — not added to any list, not shared, not sold.</p>
          <input
            type="email"
            name="email"
            placeholder="you@example.com"
            className="survey-text"
            autoComplete="email" />
        </div>

        <div className="survey-q" role="group">
          <div className="survey-q-title">7. Anything else? <span className="q-optional">(Optional)</span></div>
          <p className="q-help">Got an idea I didn't ask about, a story to share, or a complaint to register?</p>
          <textarea
            name="comments"
            placeholder="Optional — say whatever."
            className="survey-text"
            rows="4" />
        </div>

        {status === "error" ? (
          <p className="survey-error">
            Submission failed. Give it another shot, or email me directly at <a href="mailto:admin@foxpointfox.com">admin@foxpointfox.com</a>.
          </p>
        ) : null}

        <div className="survey-submit-row">
          <button
            type="submit"
            className="btn btn-fox btn-large"
            disabled={status === "submitting"}>
            {status === "submitting" ? "Sending…" : "Send it →"}
          </button>
        </div>
      </form>
    </section>);
}

// === About + FAQ (past-tense) ===
function AboutSection() {
  return (
    <section className="section" id="about">
      <span className="eyebrow">About</span>
      <h2 style={{ marginTop: 8, marginBottom: 36 }}>What was this anyways?</h2>
      <div className="about-grid">
        <div>
          <p>
            Fox Point sits on the southeast corner of Providence. Named after foxes that, as far as anyone can tell, haven't actually lived here in centuries. So in May 2026, we ran the first annual election to pick a Fox Point dog to take the title.
          </p>
          <p>
            Anyone with a dog and a Fox Point address could nominate them. Anyone at all could vote — once per person, on the honor system. Voting ran May 8 through May 31, 2026.
          </p>
          <p>
            Thanks to everyone who turned out. The next election is in Spring 2027.
          </p>
        </div>
        <div className="faq">
          <details>
            <summary>Will there be another election?</summary>
            <p>Yes — Spring 2027. Sign up for next year's contest by taking the survey above and leaving your email.</p>
          </details>
          <details>
            <summary>Where did the vote counts go?</summary>
            <p>The top three are called out at the top of the page. Below that, every candidate is listed in voter order but without exact counts — partly to keep the spirit light, partly because some votes had to be adjusted for fraud and I'd rather not relitigate that here. I've kept the raw tallies privately for posterity.</p>
          </details>
          <details>
            <summary>Who ran this?</summary>
            <p>Just a guy in Fox Point. My dog looks like a fox. He's not the Fox of Fox Point. He's still a very good boy.</p>
          </details>
        </div>
      </div>
    </section>);
}

// === Profile modal ===
function FoxModal({ contestant, contestants, onClose, onOpen }) {
  if (!contestant) return null;
  const c = contestant;
  const sorted = [...contestants].sort((a, b) => a.final_rank - b.final_rank);
  const idx = sorted.findIndex((x) => x.id === c.id);
  const prev = sorted[(idx - 1 + sorted.length) % sorted.length];
  const next = sorted[(idx + 1) % sorted.length];

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-grid">
          <div>
            <div className="photo-big">
              <img src={c.photo_url} alt={c.name} />
            </div>
          </div>
          <div>
            <span className="eyebrow">{c.street}</span>
            <h2 style={{ marginTop: 8 }}>{c.name}</h2>
            <div className="modal-meta">{c.breed}{c.age != null ? ` · age ${c.age}` : ""}{c.owner ? ` · with ${c.owner}` : ""}</div>
            {c.quote ? <div className="quote-big">"{c.quote}"</div> : null}
            {c.platform && c.platform.length ? (
              <>
                <h3 className="platform-h">If elected, they would have:</h3>
                <ul className="platform">
                  {c.platform.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </>
            ) : null}
            <div className="vote-row">
              <span className="vote-fineprint">Voting closed May 31, 2026.</span>
              <div className="vote-row-buttons">
                <ShareButton contestant={c} />
              </div>
            </div>
            <div className="nav-row">
              <button className="btn btn-ghost btn-sm" onClick={() => onOpen(prev.id)}>← {prev.name.split(" ")[0]}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onOpen(next.id)}>{next.name.split(" ")[0]} →</button>
            </div>
          </div>
        </div>
      </div>
    </div>);
}

// === App ===
function App() {
  const [contestants, setContestants] = useState([]);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  // Capture ?fox=<id> once at mount so the URL-sync effect below can't strip it
  // before contestants finish loading.
  const initialFoxIdRef = useRef(
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("fox")
      : null
  );
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (didAutoOpenRef.current || !contestants.length) return;
    const foxId = initialFoxIdRef.current;
    if (foxId && contestants.some((c) => c.id === foxId)) {
      setOpenId(foxId);
    }
    didAutoOpenRef.current = true;
  }, [contestants]);

  // Keep ?fox= in sync with the open modal so the URL is always shareable.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (openId) url.searchParams.set("fox", openId);
    else url.searchParams.delete("fox");
    window.history.replaceState({}, "", url.toString());
  }, [openId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`dogs.json?v=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        // Sort by final_rank so the gallery's default order matches voter ranking.
        data.sort((a, b) => a.final_rank - b.final_rank);
        setContestants(data);
      } catch (e) {
        console.error("Failed to load candidates:", e);
        if (!cancelled) setError("Couldn't load candidates — try refreshing the page.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleJump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const open = openId ? contestants.find((c) => c.id === openId) : null;

  return (
    <div>
      <nav className="nav">
        <a href="#top" className="logo" onClick={(e) => { e.preventDefault(); handleJump("top"); }}>
          <span className="dot"></span>
          <span>The Fox of Fox Point</span>
        </a>
        <div className="nav-links">
          <a href="#survey" onClick={(e) => { e.preventDefault(); handleJump("survey"); }}>Survey</a>
          <a href="#foxes" onClick={(e) => { e.preventDefault(); handleJump("foxes"); }}>Candidates</a>
          <a href="#about" onClick={(e) => { e.preventDefault(); handleJump("about"); }}>About</a>
        </div>
      </nav>

      <Hero contestants={contestants} onJump={handleJump} />
      <ClosedEarlyNote />
      <PodiumSection contestants={contestants} onOpen={setOpenId} />
      <SurveySection />
      <FoxesSection contestants={contestants} onOpen={setOpenId} error={error} />
      <AboutSection />

      <footer className="footer">
        <div className="footer-mark">The Fox of Fox Point · 2026</div>
        <div style={{ marginTop: 8, fontSize: 13 }}>Questions? Yell out a window on Wickenden or <a href="mailto:admin@foxpointfox.com">email me</a>.</div>
      </footer>

      {open && <FoxModal contestant={open} contestants={contestants} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
    </div>);
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
