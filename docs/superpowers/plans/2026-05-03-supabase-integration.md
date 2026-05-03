# Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the static Fox of Fox Point site to its Supabase backend so candidates, votes, and nominations live server-side, with realtime updates and a magic-link admin page for moderation.

**Architecture:** Browser-only — Supabase JS client loaded as a UMD bundle alongside React from CDN. Anonymous auth gives every visitor a UUID used to dedupe votes via a unique constraint. Magic-link auth on `andrewmcamp@gmail.com` gates moderation via RLS. Storage holds nomination photos (downscaled client-side to ≤800×800 JPEG before upload).

**Tech Stack:** Supabase (Postgres + Auth + Storage + Realtime), `@supabase/supabase-js@2` (UMD), React 18 (CDN), in-browser Babel. No bundler. No automated tests — verification is manual at each task boundary.

**Spec:** [`docs/superpowers/specs/2026-05-03-supabase-integration-design.md`](../specs/2026-05-03-supabase-integration-design.md)

**Supabase project ID:** `scupbstsavzjqamuixtp`

---

## File Structure

| File | Purpose |
|---|---|
| `supabase-client.js` *(new)* | Initialize `window.sb`; bootstrap anonymous session; expose `window.sbReady` promise. |
| `The Fox of Fox Point.html` *(modify)* | Add Supabase UMD + `supabase-client.js` script tags. |
| `data.js` *(slim)* | Keep only `window.STREETS`. Delete portrait/palettes/CONTESTANTS code. |
| `app.jsx` *(modify)* | Replace local data with Supabase fetches; vote/submit hit the API; realtime subscriptions for votes and dog approvals. |
| `admin.html` *(new)* | Stripped shell loading React + Babel + Supabase + `admin.jsx`. |
| `admin.jsx` *(new)* | Magic-link login + pending-nominations approve/reject UI. |
| `styles.css` *(modify)* | Minor admin styles. |

Database changes are applied via Supabase MCP migrations (no migration file in the repo).

---

## Task 0: Initialize git (optional)

**Files:** none

The current directory isn't a git repo. The plan's commit steps assume one. If you want version history, do this once now; otherwise skip and ignore the `git commit` steps in later tasks.

- [ ] **Step 1: Init repo and add a basic .gitignore**

```bash
cd "C:/Users/Andrew/Brown Dropbox/Andrew Camp/fox-of-fox-point"
git init
```

Create `.gitignore` with:

```
.DS_Store
Thumbs.db
*.log
.env
.env.local
.vscode/
.idea/
```

- [ ] **Step 2: Initial commit**

```bash
git add -A
git commit -m "chore: initial commit of static site"
```

---

## Task 1: Manual Supabase dashboard config

**Files:** none (manual dashboard work)

Supabase Auth needs anonymous sign-ins enabled and the admin URL allow-listed before code changes will work end-to-end. Do this before Task 4 fires real auth calls.

- [ ] **Step 1: Enable anonymous sign-ins**

In Supabase Studio for project `scupbstsavzjqamuixtp`:
- Navigate: **Authentication → Sign In / Providers → Anonymous Sign-Ins**
- Toggle **Enable Anonymous Sign-Ins** → **on**
- Save

- [ ] **Step 2: Add admin redirect URL**

- Navigate: **Authentication → URL Configuration → Redirect URLs**
- Add the URL the admin page will be opened from. For local file:// use, the magic-link landing won't work directly — plan to host the site somewhere (GitHub Pages, Netlify, or `python -m http.server` for local testing). For local dev with `python -m http.server 8000`, add: `http://localhost:8000/admin.html`
- For production (whatever the live URL becomes), add that too. Example: `https://foxofoxpoint.example.com/admin.html`
- Save

- [ ] **Step 3: Note the project URL and anon key for Task 4**

- Navigate: **Project Settings → API**
- Copy **Project URL** (e.g., `https://scupbstsavzjqamuixtp.supabase.co`)
- Copy the **anon public** key (a long JWT). The anon key is safe to embed in client code; the service role key is not — never use that one.
- Paste both into a scratch file or keep the tab open for Task 4.

- [ ] **Step 4: Verification**

Open Authentication → Providers and confirm "Anonymous" shows as enabled. No code change yet — proceed to Task 2.

---

## Task 2: Database migration — votes dedup + counts view

**Files:** none in repo (migration applied via MCP)

Adds the `voter_id` column with unique constraint on `votes`, and the `dog_vote_counts` view.

- [ ] **Step 1: Apply migration via MCP**

Use the `mcp__supabase__apply_migration` tool against project `scupbstsavzjqamuixtp` with name `votes_voter_id_and_counts_view` and this SQL:

```sql
alter table public.votes
  add column voter_id uuid not null,
  add constraint votes_voter_id_unique unique (voter_id);

create view public.dog_vote_counts as
select dog_id, count(*)::int as votes
from public.votes
group by dog_id;
```

- [ ] **Step 2: Verify**

Run via `mcp__supabase__execute_sql`:

```sql
select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name='votes' and column_name='voter_id';
```

Expected: one row, `is_nullable = NO`.

```sql
select * from public.dog_vote_counts;
```

Expected: empty result (no votes yet), no error.

---

## Task 3: Database migration — RLS policies for `dogs` and `votes`

**Files:** none in repo (migration applied via MCP)

Locks reads/writes per the spec. Anyone can see approved dogs and all vote counts; anonymous users can insert pending dogs and one vote each; admin (your email) can update/delete dogs.

- [ ] **Step 1: Apply migration via MCP**

Migration name: `rls_policies_dogs_and_votes`. SQL:

```sql
-- Helper expression for admin email check is inlined in each policy.

-- DOGS
drop policy if exists "dogs_select_approved" on public.dogs;
create policy "dogs_select_approved" on public.dogs
  for select using (status = 'approved');

drop policy if exists "dogs_select_admin" on public.dogs;
create policy "dogs_select_admin" on public.dogs
  for select using (auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com');

drop policy if exists "dogs_insert_anyone_pending" on public.dogs;
create policy "dogs_insert_anyone_pending" on public.dogs
  for insert with check (status = 'pending');

drop policy if exists "dogs_update_admin" on public.dogs;
create policy "dogs_update_admin" on public.dogs
  for update using (auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com')
  with check (auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com');

drop policy if exists "dogs_delete_admin" on public.dogs;
create policy "dogs_delete_admin" on public.dogs
  for delete using (auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com');

-- VOTES
drop policy if exists "votes_select_anyone" on public.votes;
create policy "votes_select_anyone" on public.votes
  for select using (true);

drop policy if exists "votes_insert_self_for_approved" on public.votes;
create policy "votes_insert_self_for_approved" on public.votes
  for insert with check (
    voter_id = auth.uid()
    and exists (select 1 from public.dogs d where d.id = dog_id and d.status = 'approved')
  );

-- (No update/delete policies — denied by default with RLS on.)
```

- [ ] **Step 2: Verify policies are present**

```sql
select schemaname, tablename, policyname, cmd from pg_policies
where schemaname='public' and tablename in ('dogs','votes')
order by tablename, policyname;
```

Expected: 5 policies on `dogs` (`select_approved`, `select_admin`, `insert_anyone_pending`, `update_admin`, `delete_admin`) and 2 on `votes` (`select_anyone`, `insert_self_for_approved`).

---

## Task 4: Storage bucket + policies

**Files:** none in repo (created via MCP / dashboard)

Creates the `nominations` bucket and policies via SQL on `storage.objects`.

- [ ] **Step 1: Create bucket via MCP**

Apply migration `nominations_storage_bucket_and_policies`:

```sql
insert into storage.buckets (id, name, public)
values ('nominations', 'nominations', true)
on conflict (id) do nothing;

drop policy if exists "nominations_insert_authenticated" on storage.objects;
create policy "nominations_insert_authenticated" on storage.objects
  for insert
  with check (bucket_id = 'nominations' and auth.role() = 'authenticated');

drop policy if exists "nominations_select_public" on storage.objects;
create policy "nominations_select_public" on storage.objects
  for select using (bucket_id = 'nominations');

drop policy if exists "nominations_update_admin" on storage.objects;
create policy "nominations_update_admin" on storage.objects
  for update using (bucket_id = 'nominations' and auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com');

drop policy if exists "nominations_delete_admin" on storage.objects;
create policy "nominations_delete_admin" on storage.objects
  for delete using (bucket_id = 'nominations' and auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com');
```

Note: anonymous Supabase Auth users return `auth.role() = 'authenticated'` (anonymous users are still authenticated; they just have `is_anonymous = true` in the JWT). So this policy permits anonymous uploads.

- [ ] **Step 2: Verify**

```sql
select id, name, public from storage.buckets where id='nominations';
```

Expected: one row, `public = true`.

```sql
select policyname from pg_policies where schemaname='storage' and tablename='objects'
  and policyname like 'nominations_%' order by policyname;
```

Expected: 4 policies — `nominations_delete_admin`, `nominations_insert_authenticated`, `nominations_select_public`, `nominations_update_admin`.

---

## Task 5: Create `supabase-client.js` and wire it into the HTML

**Files:**
- Create: `supabase-client.js`
- Modify: `The Fox of Fox Point.html`

This file is loaded *before* `app.jsx`. It creates the Supabase client and ensures every visitor has an anonymous session. `window.sbReady` resolves once the session is in place.

- [ ] **Step 1: Create `supabase-client.js`**

Replace `<YOUR-PROJECT-URL>` and `<YOUR-ANON-KEY>` with the values from Task 1, Step 3.

```js
// supabase-client.js — initializes the global Supabase client and anon session.
// The anon key is intentionally public; do not paste the service-role key here.

(function () {
  const SUPABASE_URL = "<YOUR-PROJECT-URL>";
  const SUPABASE_ANON_KEY = "<YOUR-ANON-KEY>";

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
})();
```

- [ ] **Step 2: Modify `The Fox of Fox Point.html`**

Add two `<script>` tags after the React/ReactDOM/Babel scripts and before `data.js`. The Supabase UMD bundle attaches to `window.supabase`.

Replace the script block (lines 15–20) with:

```html
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.1/dist/umd/supabase.js" integrity="sha384-pNDx8ebKKncqRMS1aZKjmB1T1jdd6psogvE0+sPrwW/Sy94M6geGuQpYXQnLCdRq" crossorigin="anonymous"></script>
  <script src="supabase-client.js"></script>

  <script src="data.js"></script>
  <script type="text/babel" src="app.jsx"></script>
```

- [ ] **Step 3: Verify in the browser**

Serve the directory locally so script loading works:

```bash
cd "C:/Users/Andrew/Brown Dropbox/Andrew Camp/fox-of-fox-point"
python -m http.server 8000
```

Open `http://localhost:8000/The%20Fox%20of%20Fox%20Point.html`. Open DevTools console and run:

```js
await window.sbReady
```

Expected: a `Session` object with a `user.id` UUID. No errors. The site itself still renders the hardcoded contestants — Task 6 will switch the data source.

Verify in Supabase Studio: **Authentication → Users** now shows one anonymous user (refresh if needed).

- [ ] **Step 4: Commit**

```bash
git add supabase-client.js "The Fox of Fox Point.html"
git commit -m "feat: load supabase client and bootstrap anon session"
```

---

## Task 6: Slim `data.js` to streets only

**Files:**
- Modify: `data.js`

Now that real photos drive portraits, the SVG generator and the hardcoded contestants list are dead weight.

- [ ] **Step 1: Replace the entire `data.js`**

```js
// data.js — Fox Point street list, used by the nomination form.
window.STREETS = [
  "Wickenden St.", "Ives St.", "Benefit St.", "Brook St.", "Transit St.",
  "Hope St.", "Power St.", "Williams St.", "Sheldon St.", "John St.",
  "Governor St.", "Arnold St."
];
```

- [ ] **Step 2: Verify**

Reload the site. The page will momentarily render (using stale logic from `app.jsx`) but will likely error in the console because `CONTESTANTS` is gone. That's expected — Task 7 fixes `app.jsx`. The street dropdown in the submit form should still populate when we get there.

- [ ] **Step 3: Commit**

```bash
git add data.js
git commit -m "refactor: drop hardcoded contestants and svg portrait generator"
```

---

## Task 7: Refactor `app.jsx` — fetch dogs from Supabase on mount

**Files:**
- Modify: `app.jsx`

Replace the localStorage-backed `useState(() => CONTESTANTS)` with an empty list plus a Supabase fetch. Also fetch the user's existing vote so the heart appears on the right card on reload.

- [ ] **Step 1: Add a helper for resolving public photo URLs**

Near the top of `app.jsx`, after the `DEADLINE` constant (around line 5), add:

```jsx
function publicPhotoUrl(path) {
  if (!path) return "";
  return window.sb.storage.from("nominations").getPublicUrl(path).data.publicUrl;
}
```

- [ ] **Step 2: Replace the App component's initial state and add a load effect**

Find the `App` component (around line 491). Replace its top section (state hooks + the two existing localStorage `useEffect`s) with:

```jsx
function App() {
  const [contestants, setContestants] = useState([]);
  const [votedFor, setVotedFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [pendingVoteId, setPendingVoteId] = useState(null);
  const [toast, setToast] = useState({ msg: "", show: false });
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await window.sbReady;
        const [dogsRes, countsRes, voteRes] = await Promise.all([
          window.sb.from("dogs").select("*").eq("status", "approved"),
          window.sb.from("dog_vote_counts").select("*"),
          window.sb.from("votes").select("dog_id").eq("voter_id", session.user.id).maybeSingle(),
        ]);
        if (cancelled) return;
        if (dogsRes.error) throw dogsRes.error;
        if (countsRes.error) throw countsRes.error;
        const counts = new Map((countsRes.data || []).map(r => [r.dog_id, r.votes]));
        const merged = (dogsRes.data || []).map(d => ({
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
          votes: counts.get(d.id) || 0,
        }));
        setContestants(merged);
        setVotedFor(voteRes.data ? voteRes.data.dog_id : null);
      } catch (e) {
        console.error("Failed to load contestants:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);
```

Delete the two old `useEffect`s that wrote to `localStorage` for `ffp.contestants` and `ffp.votedFor`. (The `useState` initializers that read from `localStorage` are already gone in the block above.)

- [ ] **Step 3: Handle empty/loading state in the UI**

Just above the `return` in `App`, no change needed — the existing components handle empty arrays gracefully *except* `Standings`, which calls `sorted[0].votes` on an empty list. Patch `Standings` (around line 190):

Find:
```jsx
function Standings({ contestants, onOpen }) {
  const sorted = [...contestants].sort((a, b) => b.votes - a.votes);
  const max = sorted[0].votes;
```

Replace with:
```jsx
function Standings({ contestants, onOpen }) {
  if (!contestants.length) {
    return (
      <section className="section" id="standings">
        <span className="eyebrow">Live standings</span>
        <h2 style={{ marginTop: 8, marginBottom: 14 }}>Who's winning?</h2>
        <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>No votes yet. Be the first.</p>
      </section>
    );
  }
  const sorted = [...contestants].sort((a, b) => b.votes - a.votes);
  const max = sorted[0].votes || 1;
```

(Also guard against division-by-zero by using `max || 1`.)

Similarly patch `FoxesSection` to not crash when empty — find the `<div className="fox-grid">` block and just before it add:

```jsx
{!sorted.length && (
  <p style={{ color: "var(--ink-2)" }}>No candidates approved yet. Check back soon — or nominate your dog below.</p>
)}
```

- [ ] **Step 4: Verify**

Reload `http://localhost:8000/The%20Fox%20of%20Fox%20Point.html`. Expected:
- Console shows no errors.
- The candidate gallery and standings show empty-state copy ("No candidates approved yet" / "No votes yet").
- The "Dogs running" / "Votes so far" counters in the hero both read 0.

Insert a test row directly in Supabase Studio (`dogs` table, `status='approved'`, fill required fields, leave `photo_path` as a non-existent path string for now). Reload the page — that dog should appear in the gallery (with a broken image; we fix uploads in Task 9).

Delete the test row before continuing.

- [ ] **Step 5: Commit**

```bash
git add app.jsx
git commit -m "feat: fetch contestants and vote state from supabase on load"
```

---

## Task 8: Refactor `app.jsx` — voting hits the API

**Files:**
- Modify: `app.jsx`

Replace the in-memory `setContestants` increment with a real `votes` insert. Handle the unique-constraint and RLS errors per the spec.

- [ ] **Step 1: Replace `confirmVote`**

Find `confirmVote` (around line 526). Replace the whole function with:

```jsx
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
    // Optimistic local count bump; realtime will reconcile if needed.
    setContestants((list) => list.map((x) => x.id === id ? { ...x, votes: x.votes + 1 } : x));
    setVotedFor(id);
    showToast(`Your vote is in for ${c.name.split(" ")[0]}.`);
  } catch (e) {
    console.error("Vote failed:", e);
    showToast("Something went wrong. Try again?");
  }
};
```

- [ ] **Step 2: Verify**

In Supabase Studio, insert one approved test dog. Reload the page; the dog appears.

Click Vote → confirm. Expected:
- Heart fills, count increments to 1, toast appears.
- In Supabase Studio, `votes` has one row with that `voter_id`.

Reload the page. Expected: heart still appears on the same dog (`votedFor` was rehydrated from the API).

Try to vote again on a different dog (insert a second approved dog first, since the disabled state will block normally — for testing, either temporarily clear the unique constraint or test by clicking the same dog's vote button after manually clearing local state in DevTools). The expected behavior on a forced second insert is: `error.code === '23505'`, toast says "already voted." Confirm in Studio that there's still only one row for your `voter_id`.

Open in an incognito window — fresh anon session, can vote for a different dog independently. Cleanup: delete test rows after verification.

- [ ] **Step 3: Commit**

```bash
git add app.jsx
git commit -m "feat: voting persists to supabase with dedup"
```

---

## Task 9: Refactor `app.jsx` — nomination submit (downscale + upload + insert)

**Files:**
- Modify: `app.jsx`

Image downscaling helper and a real `handleSubmit` that uploads to Storage then inserts a `dogs` row.

- [ ] **Step 1: Add the downscale helper**

Near the top of `app.jsx` (next to `publicPhotoUrl`), add:

```jsx
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
```

- [ ] **Step 2: Lift `SubmitSection` to use a real submit and validate the photo**

Find `SubmitSection` (around line 227) and replace the `handleFile` and `handleSubmit` definitions with:

```jsx
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
  setError("");
  if (!file) {
    setError("A photo is required.");
    return;
  }
  setSubmitting(true);
  try {
    const blob = await downscaleImage(file).catch(() => file); // fall back to original on encode error
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
```

Just above the submit button (`<button type="submit" className="btn btn-fox">`), inject the inline error and disable while submitting:

```jsx
{error && <div style={{ color: "#a52a1a", marginTop: 12, textAlign: "center" }}>{error}</div>}
```

Change the button to:

```jsx
<button type="submit" className="btn btn-fox" disabled={submitting}>
  {submitting ? "Submitting…" : "Nominate your dog →"}
</button>
```

- [ ] **Step 3: Verify**

Reload the site. Scroll to the nomination form. Submit a real photo + filled fields. Expected:
- Submitting button briefly says "Submitting…"
- Toast: "Thanks! [name] is in."
- Form clears.
- In Supabase Studio: `dogs` table has a new row with `status='pending'`.
- In Supabase Studio: **Storage → nominations** has a `<uuid>.jpg` blob, ≤ ~200KB even if the source was multi-MB.
- That dog does NOT yet appear publicly (status is pending — gallery filters by `approved`).

Try submitting without choosing a photo → inline error "A photo is required." No row inserted.

Try submitting a non-image file → inline error "Please choose an image file."

- [ ] **Step 4: Commit**

```bash
git add app.jsx
git commit -m "feat: nominations upload downscaled photos and insert pending dog rows"
```

---

## Task 10: Realtime subscriptions in `app.jsx`

**Files:**
- Modify: `app.jsx`

Live leaderboard: votes from other browsers tick the count up here. Newly-approved dogs show up without a refresh.

- [ ] **Step 1: Add a realtime effect to `App`**

Just below the existing initial-load `useEffect` in `App`, add:

```jsx
useEffect(() => {
  let votesChannel, dogsChannel;
  (async () => {
    await window.sbReady;
    votesChannel = window.sb
      .channel("public:votes")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        (payload) => {
          const newDogId = payload.new.dog_id;
          setContestants((list) => list.map(x =>
            x.id === newDogId ? { ...x, votes: x.votes + 1 } : x
          ));
        }
      )
      .subscribe();

    dogsChannel = window.sb
      .channel("public:dogs")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "dogs" },
        (payload) => {
          const row = payload.new;
          // Use functional setter so the wasIn check sees current state, not closure.
          setContestants((list) => {
            const wasIn = list.some(c => c.id === row.id);
            if (row.status === "approved" && !wasIn) {
              return [...list, {
                id: row.id, name: row.name, breed: row.breed, age: row.age,
                owner: row.owner_name, street: row.home_street,
                quote: row.tagline || "", platform: row.platform || [],
                joined: row.created_at, portrait: publicPhotoUrl(row.photo_path),
                votes: 0,
              }];
            }
            if (row.status !== "approved" && wasIn) {
              return list.filter(c => c.id !== row.id);
            }
            return list;
          });
        }
      )
      .subscribe();
  })();
  return () => {
    if (votesChannel) window.sb.removeChannel(votesChannel);
    if (dogsChannel) window.sb.removeChannel(dogsChannel);
  };
}, []);
```

- [ ] **Step 2: Verify**

Open the site in two browser windows (one normal, one incognito so they have different anon sessions). Vote in window A. Expected: the count in window B's gallery and standings ticks up within ~1 second without a refresh.

In Supabase Studio, take a `pending` dog and update its status to `approved`. Expected: it appears in both windows' galleries within ~1 second.

Flip it back to `pending`. Expected: it disappears from both.

- [ ] **Step 3: Commit**

```bash
git add app.jsx
git commit -m "feat: realtime updates for vote counts and approved dogs"
```

---

## Task 11: `admin.html` shell

**Files:**
- Create: `admin.html`

A separate page, same React/Babel/Supabase script chain, loads `admin.jsx`.

- [ ] **Step 1: Create `admin.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fox of Fox Point — Admin</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="root"></div>

  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.105.1/dist/umd/supabase.js" integrity="sha384-pNDx8ebKKncqRMS1aZKjmB1T1jdd6psogvE0+sPrwW/Sy94M6geGuQpYXQnLCdRq" crossorigin="anonymous"></script>
  <script src="supabase-client.js"></script>

  <script type="text/babel" src="admin.jsx"></script>
</body>
</html>
```

Note: this page uses the **same** `supabase-client.js`, which calls `signInAnonymously()` if no session exists. That's fine — the moment you sign in via magic link, the session upgrades from anonymous to your real email-bound user. (Anonymous sessions are replaced, not merged, when you do a real sign-in via OTP.)

- [ ] **Step 2: Verify**

Open `http://localhost:8000/admin.html`. Expected: blank page (no `admin.jsx` yet), no console errors. `await window.sbReady` in the console returns a session.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: admin page shell"
```

---

## Task 12: `admin.jsx` — magic-link login

**Files:**
- Create: `admin.jsx`

Initial version: just the login form and a placeholder logged-in screen. Approve/reject UI lands in Task 13.

- [ ] **Step 1: Create `admin.jsx`**

```jsx
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
```

- [ ] **Step 2: Verify**

Open `http://localhost:8000/admin.html`. Expected: login card with your email pre-filled.

Click **Send magic link**. Expected: "Check your inbox" screen appears. A magic-link email arrives at `andrewmcamp@gmail.com`. Click it.

The link opens `admin.html` again (or whatever URL you allow-listed in Task 1). Expected: the page now shows "Pending nominations" header + "Sign out" button. `session.user.email` in the console reads `andrewmcamp@gmail.com`.

Click **Sign out** → returns to login.

- [ ] **Step 3: Commit**

```bash
git add admin.jsx
git commit -m "feat: admin magic-link login"
```

---

## Task 13: `admin.jsx` — pending nominations list with approve/reject + realtime

**Files:**
- Modify: `admin.jsx`

Replace the placeholder logged-in body with a real nominations queue.

- [ ] **Step 1: Add a `PendingList` component**

Add this above `AdminApp`:

```jsx
function PendingList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const photoUrl = (path) =>
    path ? window.sb.storage.from("nominations").getPublicUrl(path).data.publicUrl : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await window.sb
        .from("dogs").select("*").eq("status", "pending")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
    const channel = window.sb
      .channel("admin:pending")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "dogs" },
        (payload) => {
          if (payload.new.status === "pending") {
            setRows((r) => [...r, payload.new]);
          }
        }
      )
      .subscribe();
    return () => { cancelled = true; window.sb.removeChannel(channel); };
  }, []);

  const setStatus = async (id, status) => {
    const prev = rows;
    setRows((r) => r.filter(x => x.id !== id)); // optimistic
    const { error } = await window.sb.from("dogs").update({ status }).eq("id", id);
    if (error) {
      setRows(prev);
      alert("Update failed: " + error.message);
    }
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
          <img src={photoUrl(d.photo_path)} alt={d.name}
               style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6 }} />
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
            <button onClick={() => setStatus(d.id, "approved")}
                    style={{ padding: "8px 14px", background: "#2a7a3a", color: "white", border: 0, borderRadius: 4 }}>
              Approve
            </button>
            <button onClick={() => setStatus(d.id, "rejected")}
                    style={{ padding: "8px 14px", background: "#a52a1a", color: "white", border: 0, borderRadius: 4 }}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder in `AdminApp`**

Find the body of the logged-in branch in `AdminApp` (the `<div>` with `<h1>Pending nominations</h1>` and the placeholder paragraph). Replace the placeholder paragraph with `<PendingList />`:

```jsx
return (
  <div style={{ maxWidth: 900, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <h1>Pending nominations</h1>
      <button onClick={() => window.sb.auth.signOut()}>Sign out</button>
    </div>
    <PendingList />
  </div>
);
```

- [ ] **Step 3: Verify**

In a regular browser window (not the admin one), submit a new nomination via the main site (Task 9 flow).

Switch to the admin window. Expected: the new nomination appears in the list within ~1 second (realtime), with photo, name, owner, etc.

Click **Approve**. Expected: the row disappears from the admin list. Open the main site → the dog now appears in the public gallery.

Submit another nomination, click **Reject** in admin. Expected: it disappears from the admin list and never appears publicly. In Studio, the row exists with `status='rejected'`.

Try a non-admin email: sign out, sign in with a different email (a personal one you can check). After clicking the magic link, you should see "Pending nominations" header but `<PendingList />` should error or show a permissions message — RLS allows you to *view* approved dogs publicly but not pending ones unless you're the admin email. Actually with the current `dogs_select_admin` policy this will return zero pending rows for non-admin emails, which renders as "No pending nominations." That's an acceptable failure mode (no data leaks). If you want a hard "not authorized" UI, add an explicit email check in `AdminApp` — for v1 we accept the soft-deny.

- [ ] **Step 4: Commit**

```bash
git add admin.jsx
git commit -m "feat: admin pending list with approve/reject and realtime"
```

---

## Task 14: End-to-end manual verification

**Files:** none

A final pass against the spec's testing checklist.

- [ ] **Step 1: Run the full happy path**

Walk through every item from spec section "Testing":

1. Open the public site → gallery loads from Supabase (empty if no approved dogs yet).
2. Submit a nomination with a photo → row appears in Supabase as `pending`; downscaled JPEG visible in Storage; the original on disk was much larger.
3. Open admin → magic-link in → approve the nomination → it appears in the public gallery without a refresh in a second open browser window.
4. Vote in browser A → count ticks up in browser B without refresh.
5. Try to vote a second time in browser A → toast says "already voted." Server `votes` row count for your `voter_id` stays at 1.
6. Open in incognito → fresh anon session, can vote independently.
7. Reject a pending nomination from admin → it does not appear publicly.

- [ ] **Step 2: Check the Supabase advisor**

Run via `mcp__supabase__get_advisors`:

```
{ project_id: "scupbstsavzjqamuixtp", type: "security" }
```

Look for unexpected warnings (publicly-readable tables we didn't intend, missing RLS, etc.). Address anything surprising.

- [ ] **Step 3: Confirm anon key is the only secret in client code**

```bash
grep -RIn "eyJ" .  # JWT-shaped tokens
grep -RIn "service_role" .
```

Expected: only the anon key appears, only in `supabase-client.js`. No `service_role` anywhere.

- [ ] **Step 4: Commit if any cleanup happened**

```bash
git add -A
git commit -m "chore: e2e verification cleanup" || true
```

---

## Done

The site now reads candidates and votes from Supabase, accepts photo nominations with client-side downscaling, dedupes votes per anonymous session, updates the leaderboard live, and gives you a magic-link admin page for moderation.

**Follow-ups (deliberately out of scope, per spec):**
- Edge-Function-based IP logging for retroactive abuse detection
- Bulk admin operations / pagination
- "View rejected" tab in admin
- Orphan storage blob cleanup job
- Migration to a build step (Vite) if/when the no-build setup becomes a constraint
