# Supabase Integration Design — Fox of Fox Point

**Date:** 2026-05-03
**Project:** Fox of Foxpoint (Supabase project ref `scupbstsavzjqamuixtp`)
**Status:** Approved (pending user spec review)

## Goal

Connect the existing static, no-build React frontend to the Supabase backend so that:

- The candidate gallery is populated by real, neighbor-submitted nominations rather than a hardcoded list.
- Votes persist server-side and are deduplicated per browser-session.
- Nominations include real photo uploads and pass through a moderation step before going public.
- The leaderboard updates live as votes come in.

The site launches with an empty gallery; nominations and votes begin only when real users arrive.

## Non-goals

- Authenticated voting (email magic link, etc.) — the site is honor-system by design.
- Hard anti-fraud measures (IP throttling, fingerprinting beyond Supabase anon-auth's UUID).
- A bundler / build step — the site stays openable as a plain HTML file.
- Automated tests — verification is manual.

## Architecture

Three actors talk to Supabase directly from the browser via the JS client; no Edge Functions or custom server.

| Actor | Identity | Purpose |
|---|---|---|
| Voter | Supabase anonymous auth (one UUID per browser session) | Insert one row into `votes` |
| Nominator | Same anonymous session | Upload photo to Storage; insert into `dogs` with `status='pending'` |
| Admin (you) | Supabase magic-link auth, restricted to `andrewmcamp@gmail.com` via RLS | Update `dogs.status` to `approved`/`rejected` |

The Supabase JS client loads as a UMD bundle from CDN alongside React, exposing `window.supabase`. The existing `data.js` is replaced by a runtime fetch of approved dogs (with vote counts) plus realtime subscriptions.

## Database changes

The `dogs` and `votes` tables already exist with the right basic shape. The migration adds dedup, a counts view, RLS, and Storage.

### `votes` — additions

```sql
alter table votes
  add column voter_id uuid not null,
  add constraint votes_voter_id_unique unique (voter_id);
```

The unique constraint enforces "one vote per anonymous session, period" (not one per dog) — matching the rule in the FAQ.

### `dog_vote_counts` — new view

```sql
create view dog_vote_counts as
select dog_id, count(*)::int as votes
from votes
group by dog_id;
```

PostgREST exposes this automatically. The frontend joins/zips it with `dogs` for the gallery.

### RLS policies

**`dogs`:**

| Operation | Who | Condition |
|---|---|---|
| `select` | anyone (including anon) | `status = 'approved'` |
| `select` | admin | always |
| `insert` | anyone (incl. anon) | `with check (status = 'pending')` |
| `update` | admin | always |
| `delete` | admin | always |

Admin = `auth.jwt() ->> 'email' = 'andrewmcamp@gmail.com'`.

**`votes`:**

| Operation | Who | Condition |
|---|---|---|
| `select` | anyone | always (counts are public) |
| `insert` | authenticated (anon counts) | `voter_id = auth.uid()` AND target dog `status='approved'` |
| `update` | nobody | (no policy = denied) |
| `delete` | nobody | (no policy = denied) |

The unique constraint on `voter_id` does the dedup; RLS just keeps voters from forging someone else's vote.

### Storage

- Bucket: **`nominations`**, public-read.
- Insert policy: any authenticated user (anonymous counts).
- Update/delete: admin only.
- Path convention: `nominations/<uuid>.jpg`. Stored in `dogs.photo_path`.
- Photos are uploaded as JPEG after client-side downscale (see Frontend section).

### Schema additions to `dogs`

None. The original schema included `palette`/`ear`/`eye`/`snout` thinking we'd render generated SVG portraits, but we are dropping the SVG portrait system in favor of uploaded photos. No schema change needed.

### Manual setup steps (one-time, in Supabase dashboard)

1. Authentication → Providers → enable **Anonymous sign-ins**.
2. Authentication → URL Configuration → add the admin page URL to allowed redirect URLs (so magic-link redirects work).
3. Confirm email provider is configured (Supabase ships a default sender for OTP/magic links).

## Frontend changes

### File layout

```
The Fox of Fox Point.html      (modified — add supabase CDN script + supabase-client.js)
app.jsx                         (modified — fetches from Supabase; vote/submit hit the API)
data.js                         (slimmed — only STREETS remains; portrait code deleted)
styles.css                      (minor admin styles added)
supabase-client.js              (new — creates window.sb; bootstraps anon session)
admin.html                      (new — admin page shell)
admin.jsx                       (new — magic-link login + pending-nominations UI)
```

### `supabase-client.js`

Runs before `app.jsx`. Responsibilities:

- `window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`
- On load, if no session, call `sb.auth.signInAnonymously()`.
- Expose `window.sbReady` — a promise that resolves when the session exists.

The URL and anon key are inlined in this file. The anon key is public by Supabase's design.

### `app.jsx` modifications

**Initial load:**
- Replace `useState(() => CONTESTANTS)` initializer with `useState([])`.
- On mount, `await window.sbReady`, then:
  - Fetch all approved dogs: `sb.from('dogs').select('*').eq('status', 'approved')`.
  - Fetch counts: `sb.from('dog_vote_counts').select('*')`.
  - Zip them together (default 0 votes for dogs with no votes yet).
  - Fetch the user's existing vote: `sb.from('votes').select('dog_id').eq('voter_id', session.user.id).maybeSingle()`. Set `votedFor` from the result.

**Voting:**
- Remove the `localStorage` writes for `ffp.contestants` and `ffp.votedFor`.
- `confirmVote` becomes async: `await sb.from('votes').insert({dog_id, voter_id: session.user.id})`.
  - Success → optimistic local count increment (realtime will reconcile); set `votedFor`.
  - Unique-constraint error (code `23505`) → toast "Looks like you've already voted"; refetch existing vote and update state.
  - RLS error → toast "That candidate isn't accepting votes anymore."

**Nomination submission:**
- `handleSubmit` becomes async:
  1. Validate file (`type.startsWith('image/')`, size ≤ 10MB).
  2. **Downscale the image** — load into an `Image`, draw to a canvas at max 800×800 (preserve aspect ratio), call `canvas.toBlob('image/jpeg', 0.85)`.
  3. Upload blob: `sb.storage.from('nominations').upload('<uuid>.jpg', blob)`.
  4. Insert row: `sb.from('dogs').insert({name, breed, age, owner_name, email, home_street, tagline, platform: platform.split('\n').filter(Boolean), photo_path: '<uuid>.jpg', status: 'pending'})`.
  5. Toast on success; reset form.
- On photo upload failure: leave form filled, inline error, do not insert dogs row (no orphan row).
- On dogs insert failure after successful upload: orphan blob remains in storage. Acceptable — admin can clean periodically.

**Realtime:**
- `sb.channel('public:votes').on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'votes'}, payload => …)` — increment local count for the affected `dog_id`.
- `sb.channel('public:dogs').on('postgres_changes', {event: 'UPDATE', schema: 'public', table: 'dogs'}, payload => …)` — when a row flips to `status='approved'`, append it to the gallery; when it flips away, remove it.

**Photo rendering:**
- Where the code currently uses `c.portrait`, replace with `sb.storage.from('nominations').getPublicUrl(c.photo_path).data.publicUrl`. Compute once per dog and cache on the in-memory record.

### `data.js` cleanup

- Delete `makePortrait`, `palettes`, `RAW`, the `window.CONTESTANTS` mapping.
- Keep `window.STREETS = FP_STREETS` — the submit form still uses it.

### `admin.html` / `admin.jsx`

A separate page with the same React/Babel/Supabase script tags. Stripped-down shell — no nav, no hero.

**Logged-out state:**
- Email input (defaults to `andrewmcamp@gmail.com`).
- Submit → `sb.auth.signInWithOtp({email, options: {emailRedirectTo: <admin url>}})`.
- "Check your inbox" message.

**Logged-in state:**
- Verify `session.user.email === 'andrewmcamp@gmail.com'`; otherwise show "not authorized."
- Fetch `dogs` where `status='pending'`. Display each row with: photo (via public URL), name, breed, age, owner, street, tagline, platform list. **Approve** and **Reject** buttons.
- Approve: `update dogs set status='approved' where id=...`. Reject: `update dogs set status='rejected' where id=...`.
- Realtime subscription on `dogs` INSERT so new pending nominations appear without a refresh.
- "Sign out" button.

## Error handling

| Scenario | Behavior |
|---|---|
| Anon sign-in fails | Gallery still renders read-only; vote button shows "voting unavailable"; submission disabled with friendly note. |
| Vote insert — unique constraint (already voted) | Toast: "Looks like you've already voted." Refetch existing vote, update state. |
| Vote insert — RLS reject (dog un-approved between fetch and click) | Toast: "That candidate isn't accepting votes anymore." |
| Photo upload fails | Inline form error; form state preserved; no dogs row inserted. |
| Dogs insert fails after successful upload | Orphan blob remains; accepted for low volume. |
| File too large / not an image / decode error | Client validates `type` and `size <= 10MB`; downscale errors fall back to uploading the original. |
| Realtime channel disconnects | supabase-js auto-reconnects; small count drift between visits is acceptable; next page load is authoritative. |
| Magic link opened in different browser | Works — the link itself establishes the session. |

## Testing

Manual verification (no automated tests added; the surface is small and the existing project has no test runner):

1. Open `The Fox of Fox Point.html` — gallery loads (empty initially) from Supabase.
2. Submit a nomination with a photo → row appears in Supabase with `status='pending'`; downscaled JPEG visible in Storage; original was a large source file.
3. Open `admin.html` → magic link → approve the nomination → it appears in the public gallery without a refresh in a second browser window.
4. Vote in browser A → count ticks up in browser B without refresh (realtime).
5. Try to vote a second time in browser A → toast: "already voted." Server-side row count for `voter_id` stays at 1.
6. Open browser B (incognito) → fresh anon session, can vote independently. (Documented honor-system limitation.)
7. Reject a pending nomination from admin → it does not appear publicly.

## Open items / follow-ups (out of scope for this spec)

- Edge-Function-based IP logging for retroactive abuse detection (Q2 option d).
- Bulk operations / pagination in admin (only needed if nomination volume balloons).
- A "view rejected" tab in admin.
- Cleanup job for orphan storage blobs.
- Switch to Vite if/when the no-build setup becomes a constraint.
