/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo } = React;

// fixed deadline: midnight at end of May 31, 2026 (i.e. start of June 1) — local time
const DEADLINE = new Date(2026, 5, 1, 0, 0, 0).getTime();
// voting opens at midnight at the start of May 8, 2026 — local time
const OPENS = new Date(2026, 4, 8, 0, 0, 0).getTime();

function publicPhotoUrl(path) {
  if (!path) return null;
  return window.sb.storage.from("nominations").getPublicUrl(path).data.publicUrl;
}

async function downscaleImage(file, maxDim = 800, quality = 0.85) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

function mapDogRow(d, votes = 0) {
  return {
    id: d.id,
    name: d.name,
    breed: d.breed,
    age: d.age,
    owner: d.owner_name,
    street: d.home_street,
    quote: d.tagline || "",
    platform: d.platform || [],
    joined: d.created_at,
    portrait: publicPhotoUrl(d.photo_path),
    votes,
  };
}

// === Polaroid ===
function Polaroid({ src, caption, style, className = "" }) {
  return (
    <div className={`polaroid ${className}`} style={style}>
      <img className="photo" src={src} alt={caption} />
      {caption ? <div className="caption">{caption}</div> : null}
    </div>);

}

// === Vote button ===
function VoteButton({ count, voted, hasVoted, onVote, big = false, votingOpen = true }) {
  const [flash, setFlash] = useState(false);
  const disabled = !votingOpen || (hasVoted && !voted);
  const handle = (e) => {
    e.stopPropagation();
    if (voted || disabled) return;
    setFlash(true);
    onVote();
    setTimeout(() => setFlash(false), 700);
  };
  let label;
  if (voted) label = "Your pick";else
  if (!votingOpen) label = "Opens May 8";else
  if (disabled) label = "Already voted";else
  label = "Vote";
  return (
    <button
      className={`vote-btn ${voted ? "voted" : ""} ${disabled ? "is-disabled" : ""} ${flash ? "flash" : ""} ${big ? "big" : ""}`}
      onClick={handle}
      disabled={disabled}
      aria-disabled={disabled}>
      <span className="heart">{voted ? "♥" : "♡"}</span>
      <span>{label}</span>
      <span style={{ opacity: 0.7, marginLeft: 4 }}>· {count.toLocaleString()}</span>
    </button>);

}

// === Countdown ===
function useCountdown(deadline) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  let diff = Math.max(0, deadline - now);
  const days = Math.floor(diff / 86400000);diff -= days * 86400000;
  const hours = Math.floor(diff / 3600000);diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);
  return { days, hours, mins };
}

function CountdownBanner({ deadline }) {
  const { days, hours, mins } = useCountdown(deadline);
  return (
    <div className="countdown-banner">
      <span className="pulse"></span>
      <span className="label">Voting closes midnight, May 31</span>
      <span className="clock">
        {days}<span className="unit">d</span>
        {String(hours).padStart(2, "0")}<span className="unit">h</span>
        {String(mins).padStart(2, "0")}<span className="unit">m</span>
      </span>
    </div>);

}

function CountdownClock({ deadline }) {
  const { days, hours, mins } = useCountdown(deadline);
  return (
    <span className="meta-value clock">
      {days}<span className="unit">d</span>
      {String(hours).padStart(2, "0")}<span className="unit">h</span>
      {String(mins).padStart(2, "0")}<span className="unit">m</span>
    </span>);

}

// === Hero ===
function Hero({ contestants, onJump, votingOpen }) {
  const total = contestants.reduce((s, c) => s + c.votes, 0);
  return (
    <section className="hero-mural" id="top">
      <div className="mural-bg">
        {/* Placeholder landscape mural — replace src with the actual mural photo */}
        <img src="mural.jpg" alt="Welcome to Fox Point mural" />
        <div className="mural-tint"></div>
      </div>
      <div className="mural-content">
        <span className="eyebrow light">May 8–May 31, 2026 · The first annual election</span>
        <h1 className="mural-title">
          Who is the <span className="fox-word">fox of Fox Point?</span>
        </h1>
        <p className="lede light">We've called this neighborhood Fox Point for a few hundred years and never had an actual fox to show for it. So we're picking one of our dogs to take the title. Browse the candidates and vote for the one that feels right.



        </p>
        <div className="hero-cta">
          <button className="btn btn-fox" onClick={() => onJump("foxes")}>See the candidates</button>
          <button className="btn btn-ghost-light" onClick={() => onJump("submit")}>Nominate your dog</button>
        </div>
        <div className="hero-meta-row">
          <div className="meta-card">
            <span className="meta-label"><span className="pulse"></span>{votingOpen ? "Voting" : "Voting begins May 8"}</span>
            {votingOpen
              ? <span className="meta-value">Open!</span>
              : <CountdownClock deadline={OPENS} />}
          </div>
          <div className="meta-card">
            <span className="meta-label"><span className="pulse"></span>Voting closes May 31</span>
            <CountdownClock deadline={DEADLINE} />
          </div>
          <div className="meta-card">
            <span className="meta-label">Dogs running</span>
            <span className="meta-value">{contestants.length}</span>
          </div>
          <div className="meta-card">
            <span className="meta-label">Votes so far</span>
            <span className="meta-value">{total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </section>);

}

// === Foxes section (gallery + sort) ===
function FoxesSection({ contestants, votedFor, onVote, onOpen, error, votingOpen }) {
  const [sort, setSort] = useState("votes");

  const sorted = useMemo(() => {
    const list = [...contestants];
    if (sort === "votes") list.sort((a, b) => b.votes - a.votes);else
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));else
    if (sort === "newest") list.sort((a, b) => a.joined < b.joined ? 1 : -1);else
    if (sort === "underdog") list.sort((a, b) => a.votes - b.votes);
    return list;
  }, [contestants, sort]);

  const sortedAll = useMemo(() => [...contestants].sort((a, b) => b.votes - a.votes), [contestants]);

  return (
    <section className="section" id="foxes">
      <span className="eyebrow">{contestants.length === 1 ? "One candidate" : `${contestants.length} candidates`}</span>
      <h2 style={{ marginTop: 8, marginBottom: 14 }}>Meet the candidates.</h2>
      <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginBottom: 32 }}>Each one nominated by a neighbor. Tap any of them for the full pitch. 
      </p>

      <div className="filter-bar">
        <div className="chips">
          {[["votes", "Most votes"], ["underdog", "Underdogs"], ["name", "A→Z"], ["newest", "Newest"]].map(([v, l]) =>
          <button key={v} className={`chip ${sort === v ? "active" : ""}`} onClick={() => setSort(v)}>{l}</button>
          )}
        </div>
      </div>

      {!sorted.length && (
        <p style={{ color: "var(--ink-2)" }}>
          {error || "No candidates approved yet. Check back soon — or nominate your dog below."}
        </p>
      )}
      <div className="fox-grid">
          {sorted.map((c) => {
          const rank = sortedAll.findIndex((x) => x.id === c.id) + 1;
          const rankCls = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
          return (
            <article
              key={c.id}
              className="fox-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpen(c.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c.id); } }}>
                {rank <= 3 && <div className={`rank-badge ${rankCls}`}>#{rank}</div>}
                <div className="photo-wrap">
                  <img src={c.portrait} alt={c.name} />
                  {sort === "newest" && c.joined >= "Mar 16" && <div className="pinned-tag">new!</div>}
                </div>
                <div className="body">
                  <h3>{c.name}</h3>
                  <div className="meta">{c.breed} · {c.street}</div>
                  <div className="quote">{c.quote}</div>
                  <div className="footer-row">
                    <div className="vote-count"><span className="n">{c.votes.toLocaleString()}</span> <span className="l">votes</span></div>
                    <VoteButton count={c.votes} voted={votedFor === c.id} hasVoted={!!votedFor} onVote={() => onVote(c.id)} votingOpen={votingOpen} />
                  </div>
                </div>
              </article>);

        })}
        </div>
    </section>);

}

// === Submit form ===
function SubmitSection({ onSubmitted }) {
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [owner, setOwner] = useState("");
  const [email, setEmail] = useState("");
  const [street, setStreet] = useState("");
  const [quote, setQuote] = useState("");
  const [platform, setPlatform] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoMeta, setPhotoMeta] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);

  const handleFile = (f) => {
    setError("");
    if (!f || !f.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("That image is over 10MB — please pick a smaller one.");
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhoto(e.target.result);
      setPhotoMeta({ name: f.name, size: (f.size / 1024).toFixed(0) + " KB" });
    };
    reader.readAsDataURL(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!file) {
      setError("A photo is required.");
      return;
    }
    setSubmitting(true);
    try {
      const blob = await downscaleImage(file).catch((err) => {
        console.warn("downscaleImage failed, uploading original:", err);
        return file;
      });
      const path = `${crypto.randomUUID()}.jpg`;
      const up = await window.sb.storage.from("nominations").upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (up.error) throw up.error;
      const ageNum = age === "" ? null : Number(age);
      const platformList = platform.split("\n").map(s => s.trim()).filter(Boolean);
      const ins = await window.sb.from("dogs").insert({
        name, breed, age: Number.isFinite(ageNum) ? ageNum : null,
        owner_name: owner, email: email || null,
        home_street: street, tagline: quote || null,
        platform: platformList, photo_path: path, status: "pending",
      });
      if (ins.error) throw ins.error;
      onSubmitted({ name });
      // reset form
      setName(""); setBreed(""); setAge(""); setOwner(""); setEmail("");
      setStreet(""); setQuote(""); setPlatform("");
      setPhoto(null); setPhotoMeta(null); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e2) {
      console.error("Submit failed:", e2);
      setError("Sorry — submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section" id="submit">
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <span className="eyebrow" style={{ display: "inline-flex" }}>Got a dog?</span>
        <h2 style={{ marginTop: 12 }}>Nominate your dog.</h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "50ch", margin: "12px auto 0" }}>
          One nomination per dog. We'll add yours to the gallery within a day.
        </p>
      </div>
      <form className="submit-card" onSubmit={handleSubmit}>
        <div className="field">
          <label>Photo</label>
          {photo ?
          <div className="dropzone-preview">
              <img src={photo} alt="preview" />
              <div>
                <div style={{ fontSize: 14, color: "var(--ink-2)" }}>{photoMeta?.name} · {photoMeta?.size}</div>
                <div className="change" onClick={() => {setPhoto(null);setPhotoMeta(null);fileRef.current.value = "";}}>Choose a different photo</div>
              </div>
            </div> :

          <div className={`dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => {e.preventDefault();setDrag(true);}}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
          onClick={() => fileRef.current.click()}>
              <div className="icon">↑</div>
              <div style={{ fontSize: 16, color: "var(--ink-2)" }}>Drop a square photo here, or <span style={{ color: "var(--fox-deep)", textDecoration: "underline" }}>browse</span></div>
              <div className="help">JPG or PNG · best at 800×800</div>
            </div>
          }
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files[0])} />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Your dog's name</label>
            <input type="text" placeholder="e.g. Sir Reginald Fluffwell" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Breed</label>
            <input type="text" placeholder="e.g. Shiba Inu" value={breed} onChange={(e) => setBreed(e.target.value)} required />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Age (years)</label>
            <input type="number" min="0" max="30" step="1" placeholder="4" value={age} onChange={(e) => setAge(e.target.value)} />
          </div>
          <div className="field">
            <label>Home street</label>
            <input type="text" list="ffp-streets" placeholder="Choose or type a street…" value={street} onChange={(e) => setStreet(e.target.value)} required />
            <datalist id="ffp-streets">
              {(window.STREETS || []).map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Your name</label>
            <input type="text" placeholder="e.g. M. Tavares" value={owner} onChange={(e) => setOwner(e.target.value)} required />
          </div>
          <div className="field">
            <label>Email <span className="optional">(optional)</span></label>
            <input type="email" placeholder="if you want the results emailed to you" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>One sentence about your dog</label>
          <input type="text" placeholder="e.g. Looks like a fox. Acts like a small senator." value={quote} onChange={(e) => setQuote(e.target.value)} />
        </div>
        <div className="field">
          <label>What would they do if they won? (one per line)</label>
          <textarea placeholder={"More benches at India Point\nQuieter leaf blowers\nUniversal puddle access"} value={platform} onChange={(e) => setPlatform(e.target.value)} rows="4" />
        </div>

        {error && <div style={{ color: "#a52a1a", marginTop: 12, textAlign: "center" }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button type="submit" className="btn btn-fox" disabled={submitting}>
            {submitting ? "Submitting…" : "Nominate your dog →"}
          </button>
        </div>
        <div className="fineprint">By submitting, you certify that your nominee is in fact a dog and lives in Fox Point.</div>
      </form>
    </section>);

}

// === About + FAQ ===
function AboutSection() {
  return (
    <section className="section" id="about">
      <span className="eyebrow">About</span>
      <h2 style={{ marginTop: 8, marginBottom: 36 }}>A small thing, run by neighbors.</h2>
      <div className="about-grid">
        <div>
          <p>Fox Point sits on the southeast corner of Providence. Named after foxes that, as far as anyone can tell, haven't actually lived here in centuries. It's time to fix that.



          </p>
          <p>
            For one full year, one Fox Point dog will hold the title <strong>Fox of Fox Point</strong>.
            The role is ceremonial. The duties are flexible. The honor is total.
          </p>
          <p>Anyone with a dog and a Fox Point address can nominate them. Anyone at all can vote — once per person, on the honor system. Voting starts on May 8th and closes at midnight on May 31. The winner is announced here on June 1.



          </p>
          <p>
            <strong>The prize:</strong> a year of recognition on this site, until the next election in May 2027. Plus bragging rights.

          </p>
        </div>
        <div className="faq">
          <details>
            <summary>Does my dog need to look like a fox?</summary>
            <p>Not necessarily, but it'll probably help get more votes.</p>
          </details>
          <details>
            <summary>Can I vote for my own dog?</summary>
            <p>Of course. I'd expect nothing less.</p>
          </details>
          <details>
            <summary>What if my dog loses?</summary>
            <p>They are still your dog. They love you. Give them a treat — they have no idea what an election is. Please consider running again next year.</p>
          </details>
          <details>
            <summary>Who's running this?</summary>
            <p>Just a guy in Fox Point. My dog looks like a fox, and I want to call him the Fox of Fox Point — but I can't just hand him the title. It has to be official. I'd love for him to win. I also believe in fair elections.</p>
          </details>

          <details>
            <summary>How do you prevent fraud?</summary>
            <p>Honor system, mostly. Plus light browser fingerprinting, and the conviction that anyone who would cheat at this is going through something.</p>
          </details>
        </div>
      </div>
    </section>);}

// === Profile modal ===
function FoxModal({ contestant, contestants, votedFor, onVote, onClose, onOpen, votingOpen }) {
  if (!contestant) return null;
  const c = contestant;
  const sorted = [...contestants].sort((a, b) => b.votes - a.votes);
  const idx = sorted.findIndex((x) => x.id === c.id);
  const rank = idx + 1;
  const prev = sorted[(idx - 1 + sorted.length) % sorted.length];
  const next = sorted[(idx + 1) % sorted.length];

  useEffect(() => {
    const handler = (e) => {if (e.key === "Escape") onClose();};
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {document.removeEventListener("keydown", handler);document.body.style.overflow = "";};
  }, []);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-grid">
          <div>
            <div className="photo-big">
              <img src={c.portrait} alt={c.name} />
            </div>
          </div>
          <div>
            <span className="eyebrow">#{rank} · {c.street}</span>
            <h2 style={{ marginTop: 8 }}>{c.name}</h2>
            <div className="modal-meta">{c.breed} · age {c.age} · with {c.owner}</div>
            <div className="quote-big">"{c.quote}"</div>
            <div className="stats">
              <div className="cell"><div className="num">#{rank}</div><div className="lbl">Standing</div></div>
              <div className="cell"><div className="num">{c.votes.toLocaleString()}</div><div className="lbl">Votes</div></div>
              <div className="cell"><div className="num">{c.age}</div><div className="lbl">Years old</div></div>
            </div>
            <h3 className="platform-h">If elected, they'll:</h3>
            <ul className="platform">
              {(c.platform || []).map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <div className="vote-row">
              <VoteButton count={c.votes} voted={votedFor === c.id} hasVoted={!!votedFor} onVote={() => onVote(c.id)} votingOpen={votingOpen} big />
              <span style={{ color: "var(--ink-3)", fontSize: 13 }}>One vote per person. Choose carefully.</span>
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

// === Toast ===
function Toast({ msg, show }) {
  return (
    <div className={`toast ${show ? "show" : ""}`}>
      <span className="check">♥</span>
      <span>{msg}</span>
    </div>);

}

// === Vote confirmation modal ===
function VoteConfirmModal({ contestant, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="confirm-photo">
          <img src={contestant.portrait} alt={contestant.name} />
        </div>
        <div className="confirm-body">
          <div className="confirm-eyebrow">Confirm your vote</div>
          <h2>Vote for {contestant.name.split(",")[0]}?</h2>
          <p className="confirm-warn">
            <strong>Heads up:</strong> you only get <em>one</em> vote in this election. Once you cast it,
            you can't change your mind, vote for another dog, or undo it. Make it count.
          </p>
          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={onCancel}>Not yet — let me look around</button>
            <button className="btn btn-fox" onClick={onConfirm}>
              <span style={{ marginRight: 6 }}>♥</span>
              Yes, this is my dog
            </button>
          </div>
        </div>
      </div>
    </div>);

}

// === App ===
function App() {
  const [contestants, setContestants] = useState([]);
  const [votedFor, setVotedFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [pendingVoteId, setPendingVoteId] = useState(null);
  const [toast, setToast] = useState({ msg: "", show: false });
  const [submitted, setSubmitted] = useState(false);
  const sessionUserIdRef = useRef(null);
  const [votingOpen, setVotingOpen] = useState(() => Date.now() >= OPENS);

  useEffect(() => {
    if (votingOpen) return;
    const ms = OPENS - Date.now();
    if (ms <= 0) { setVotingOpen(true); return; }
    const id = setTimeout(() => setVotingOpen(true), ms);
    return () => clearTimeout(id);
  }, [votingOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await window.sbReady;
        sessionUserIdRef.current = session.user.id;
        const [dogsRes, countsRes, voteRes] = await Promise.all([
          window.sb.from("dogs").select("*").eq("status", "approved"),
          window.sb.from("dog_vote_counts").select("*"),
          window.sb.from("votes").select("dog_id").eq("voter_id", session.user.id).maybeSingle(),
        ]);
        if (cancelled) return;
        if (dogsRes.error) throw dogsRes.error;
        if (countsRes.error) throw countsRes.error;
        if (voteRes.error) throw voteRes.error;
        const counts = new Map((countsRes.data || []).map(r => [r.dog_id, r.votes]));
        const merged = (dogsRes.data || []).map(d => mapDogRow(d, counts.get(d.id) || 0));
        setContestants(merged);
        setVotedFor(voteRes.data ? voteRes.data.dog_id : null);
      } catch (e) {
        console.error("Failed to load contestants:", e);
        if (!cancelled) setError("Couldn't load candidates — try refreshing the page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let votesChannel, dogsChannel;
    (async () => {
      await window.sbReady;
      votesChannel = window.sb
        .channel("public:votes")
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "votes" },
          (payload) => {
            // Skip the voter's own INSERT — confirmVote already incremented optimistically.
            // If sessionUserIdRef is still null (load effect not yet resolved), any phantom
            // increment here is overwritten when setContestants(merged) fires below.
            if (payload.new.voter_id === sessionUserIdRef.current) return;
            const newDogId = payload.new.dog_id;
            setContestants((list) => list.map(x =>
              x.id === newDogId ? { ...x, votes: x.votes + 1 } : x
            ));
          }
        )
        .subscribe((status, err) => {
          if (err) console.error("realtime subscribe error:", status, err);
        });

      dogsChannel = window.sb
        .channel("public:dogs")
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "dogs" },
          (payload) => {
            const row = payload.new;
            setContestants((list) => {
              const wasIn = list.some(c => c.id === row.id);
              if (row.status === "approved" && !wasIn) {
                // votes default to 0; the authoritative count comes from a full reload.
                return [...list, mapDogRow(row, 0)];
              }
              if (row.status !== "approved" && wasIn) {
                return list.filter(c => c.id !== row.id);
              }
              return list;
            });
          }
        )
        .subscribe((status, err) => {
          if (err) console.error("realtime subscribe error:", status, err);
        });
    })();
    return () => {
      if (votesChannel) window.sb.removeChannel(votesChannel);
      if (dogsChannel) window.sb.removeChannel(dogsChannel);
    };
  }, []);

  const showToast = (msg) => {
    setToast({ msg, show: true });
    clearTimeout(window._tt);
    window._tt = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2400);
  };

  const handleVote = (id) => {
    if (votedFor || !votingOpen) return;
    setPendingVoteId(id);
  };
  const confirmVote = async () => {
    const id = pendingVoteId;
    setPendingVoteId(null);
    if (!id || votedFor) return;
    const c = contestants.find((x) => x.id === id);
    try {
      const session = await window.sbReady;
      const { error } = await window.sb.from("votes").insert({
        dog_id: id,
        voter_id: session.user.id,
      });
      if (error) {
        if (error.code === "23505") {
          // already voted on a previous session/tab — refetch and reconcile
          const { data } = await window.sb
            .from("votes").select("dog_id").eq("voter_id", session.user.id).maybeSingle();
          if (data) setVotedFor(data.dog_id);
          showToast("Looks like you've already voted.");
          return;
        }
        // RLS rejection or anything else
        console.error("Vote insert failed:", error);
        showToast("That candidate isn't accepting votes anymore.");
        return;
      }
      // Optimistic local count bump. Task 10's votes-INSERT handler MUST skip
      // events where voter_id === session.user.id, or the voter sees their own
      // vote counted twice locally.
      setContestants((list) => list.map((x) => x.id === id ? { ...x, votes: x.votes + 1 } : x));
      setVotedFor(id);
      const firstName = c?.name?.split(" ")[0] ?? "your candidate";
      showToast(`Your vote is in for ${firstName}.`);
    } catch (e) {
      console.error("Vote failed:", e);
      showToast("Something went wrong. Try again?");
    }
  };
  const cancelVote = () => setPendingVoteId(null);
  const handleJump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleSubmitted = (data) => {
    setSubmitted(true);
    showToast(`Thanks! ${data.name || "Your dog"} is in.`);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const open = openId ? contestants.find((c) => c.id === openId) : null;

  return (
    <div>
      <nav className="nav">
        <a href="#top" className="logo" onClick={(e) => {e.preventDefault();handleJump("top");}}>
          <span className="dot"></span>
          <span>Who is the Fox of Fox Point?</span>
        </a>
        <div className="nav-links">
          <a href="#foxes" onClick={(e) => {e.preventDefault();handleJump("foxes");}}>Candidates</a>
          <a href="#submit" onClick={(e) => {e.preventDefault();handleJump("submit");}}>Nominate</a>
          <a href="#about" onClick={(e) => {e.preventDefault();handleJump("about");}}>About</a>
        </div>

      </nav>

      <Hero contestants={contestants} onJump={handleJump} votingOpen={votingOpen} />
      <FoxesSection contestants={contestants} votedFor={votedFor} onVote={handleVote} onOpen={setOpenId} error={error} votingOpen={votingOpen} />
      <SubmitSection onSubmitted={handleSubmitted} />
      <AboutSection />

      <footer className="footer">
        <div className="footer-mark">Who is the Fox of Fox Point?</div>
        <div style={{ marginTop: 8, fontSize: 13 }}>Questions? Yell out a window on Wickenden.</div>
      </footer>

      {open && <FoxModal contestant={open} contestants={contestants} votedFor={votedFor} onVote={handleVote} onClose={() => setOpenId(null)} onOpen={setOpenId} votingOpen={votingOpen} />}
      {pendingVoteId && <VoteConfirmModal contestant={contestants.find((c) => c.id === pendingVoteId)} onConfirm={confirmVote} onCancel={cancelVote} />}
      <Toast msg={toast.msg} show={toast.show} />
    </div>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
