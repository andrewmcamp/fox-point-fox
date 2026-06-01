# Cutover checklist — voting → static site

Run on or just after **midnight, June 1, 2026** (the moment voting closes).

Branch: `claude/post-vote-static`. The post-vote site is fully built and styled on this branch. The list below runs the data extraction and promotes the branch to production.

---

## Pre-flight (do once, before cutover day)

- [ ] **Tone-check the hero, podium, and FAQ copy** in [app-static.jsx](app-static.jsx). Search for `TODO:` and remove the marker once you're happy with the wording above the `Hero` component.
- [ ] **Push this branch to a Netlify deploy preview** and smoke-test in a browser:
  - Hero loads, podium shows top 3 with #1/#2/#3 badges.
  - Candidate gallery renders all 59 dogs in voter order.
  - Click any candidate → modal opens, share button works, `?fox=<id>` appears in URL.
  - Survey form renders, fill it out, submit a test entry.
- [ ] **Confirm Netlify registered the survey form.** Site dashboard → **Forms** should list `survey-2027`. If missing, the deploy didn't see the hidden `<form>` in `index.html` — investigate before going live.
- [ ] **Set up email notifications for the form.** Netlify → Forms → `survey-2027` → **Settings & notifications** → Add **Email notification** to your inbox.
- [ ] **Drop in a social-share image.** Create a `1200×630` JPG named `og-image.jpg` at the repo root. Used for link previews on iMessage, Slack, Twitter, etc. (referenced in [index.html](index.html)'s `og:image` and `twitter:image` meta tags). If you skip this, previews fall back to text-only — still works, just less eye-catching.

## At cutover (after midnight, June 1)

> ### ⚠️ DO NOT SKIP STEP 2
> The `dogs.json` currently committed on this branch is a **dev snapshot** taken before voting closed. The ranks, the podium order, and the candidate list will all change by midnight. The export script in step 2 regenerates `dogs.json` with the final tallies *and* downloads all photos locally — without it the production site shows stale rankings and (after step 6) broken photos.

1. **Run `pg_dump` against Supabase.** Stash the file in `archive/` (gitignored). Make a second copy in Dropbox or a private repo:

   ```bash
   pg_dump "postgresql://postgres:[PASSWORD]@db.scupbstsavzjqamuixtp.supabase.co:5432/postgres" \
     --no-owner --no-privileges --no-acl \
     > archive/supabase-final-2026.sql
   ```

   Once Supabase is cancelled, the schema is gone for good. Do this first.

2. **Run the export script:**

   ```bash
   node scripts/export-from-supabase.mjs
   ```

   This rewrites `dogs.json` with the final vote-sorted rankings, downloads every approved candidate's photo into `images/dogs/`, rewrites the photo paths in `dogs.json` to those local copies, and writes `archive/final-tallies-2026.json` (private, raw vote counts).

3. **Locally verify the site renders the new data.** Serve the directory and open the page:

   ```bash
   npx serve .
   # then visit the printed URL — check:
   #  - podium order matches the final tallies
   #  - all candidate photos load (open DevTools Network tab and confirm
   #    zero requests to *.supabase.co — they should all hit /images/dogs/)
   #  - modal, share button, deep-link, and survey form all still work
   ```

4. **Commit and push.** Stage only the public files:

   ```bash
   git add index.html app-static.jsx dogs.json styles.css images/dogs/ scripts/ CUTOVER.md docs/2027-survey-questions.md
   git commit -m "Cutover: switch to static post-vote site"
   git push
   ```

   Open a PR from `claude/post-vote-static` → `main`, merge, watch Netlify deploy.

5. **Confirm production.** Hit https://foxpointfox.com and verify:
   - Hero loads with "The Foxes of Fox Point" headline.
   - Podium shows the final #1/#2/#3.
   - All candidates appear in voter-ranked order.
   - **Open DevTools Network tab and confirm no requests go to `*.supabase.co`** — if any do, photo paths in `dogs.json` weren't rewritten and you need to rerun step 2.
   - Survey form submits and the test entry appears in Netlify → Forms → `survey-2027`.
   - Old voting UI is gone (no vote buttons, no admin, no nomination form).

6. **Only after #5 passes:** cancel the Supabase paid plan.

## Files left to delete on `main` after cutover

These exist on `main` from the live voting site and are not used by the static build. Remove in the cutover commit (or a quick follow-up):

- `app.jsx`
- `supabase-client.js`
- `data.js`
- `admin.html`, `admin.jsx`
- `supabase/` (functions + migrations)
- `mural.jpg` (no longer used — hero is graphic-free)
- `docs/superpowers/specs/2026-05-09-vote-invalidation-design.md` and related plans (optional — historical)

## Reference

- **Public schema** (`dogs.json`, read by the site): `id`, `name`, `breed`, `age`, `owner`, `street`, `quote`, `platform[]`, `photo_url`, `final_rank`.
- **Private archive schema**: `id`, `name`, `final_rank`, `votes`, `photo_path`, plus orphan vote counts from removed candidates.
- **Survey** is a native Netlify Form (`survey-2027`) — see [docs/2027-survey-questions.md](docs/2027-survey-questions.md) for the questions, field names, and operating notes.
- **Free-tier ceiling on the survey:** 100 submissions/month. Bump to Forms Level 1 ($19/mo) if you spike past it.
