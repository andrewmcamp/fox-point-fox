# 2027 Planning Survey — spec & operating notes

Seven questions, ~2 minutes. The form is implemented natively in [app-static.jsx](../app-static.jsx) and submits to **Netlify Forms** under the form name `survey-2027`. All required except Q6 (email) and Q7 (final thoughts).

This doc is the canonical record of the question content and answer-option values — useful when reading the submissions dashboard or planning question changes for next year.

---

## How it works

- Form is rendered by React in `app-static.jsx`, using semantic HTML inputs styled by `styles.css`.
- Netlify detects the form at deploy time via the hidden `<form>` block at the top of `index.html` — that block declares every field name so Netlify registers the form. The hidden block is structural only; do not delete it.
- Submissions land in Netlify dashboard → **Forms → survey-2027**. Configure email notifications there.
- Spam protection: built-in Netlify honeypot field (`bot-field`). No CAPTCHA — keep it frictionless.
- Submit handler in `SurveySection` POSTs form-encoded data to `/`, then shows a thank-you state in place.

**Free-tier limit:** 100 submissions/month. If you expect to exceed that, the Netlify Forms Level 1 add-on is $19/mo for 1,000 submissions.

---

## Questions

For each question below: the HTML `name=` attribute (what shows up as the column in the Netlify dashboard) is in **backticks**, options table maps internal value → shown label.

### Q1. Role — `role`
- **Type:** checkbox group (multi-select)
- **Required:** no
- **Question:** How did you take part in the 2026 election?
- **Help text:** Select all that apply.

| Value | Label |
|---|---|
| `nominated` | Nominated a dog |
| `voted` | Voted |
| `shared` | Shared it / told a neighbor |
| `browsed` | Just browsed the candidates |

### Q2. Duration — `duration`
- **Type:** radio group (single select)
- **Required:** yes
- **Question:** How did the one-month voting window feel?

| Value | Label |
|---|---|
| `way_too_long` | Way too long — a week or two would have been plenty |
| `a_little_long` | A little long — three weeks would be better |
| `about_right` | About right |
| `too_short` | Too short — I missed it or wanted more time |

### Q3. Anti-fraud verification — `auth`
- **Type:** checkbox group (multi-select)
- **Required:** no
- **Question:** Some votes this year were obviously fake and had to be removed. For 2027, which verification methods would feel acceptable to you?
- **Help text:** Select every option you'd be OK with.

| Value | Label |
|---|---|
| `social_login` | Sign in with Google, Apple, or Facebook |
| `sms` | Verify via a one-time text message |
| `email` | Verify via a one-time email link |
| `captcha` | A CAPTCHA only (no account or contact info) |
| `honor_system` | None — keep it honor-system; fraud cleanup is the price of low friction |
| `dont_care` | Don't care — your call |

### Q4. In-person event — `event`
- **Type:** checkbox group (multi-select)
- **Required:** no
- **Question:** Would you come to an in-person event in 2027?
- **Help text:** Select all that interest you.

| Value | Label |
|---|---|
| `meet_the_candidates` | A meet-the-candidates evening before voting opens |
| `awards_party` | An awards or winners party after voting closes |
| `casual_meetup` | A casual dog meetup with no formal program |
| `online_only` | Probably not — the online version is enough |

### Q5. Pain points — `pain`
- **Type:** checkbox group (multi-select)
- **Required:** no
- **Question:** Anything about the 2026 election that didn't sit right?
- **Help text:** Select all that apply.

| Value | Label |
|---|---|
| `fraud_distracting` | The fraud and disqualifications got distracting |
| `voting_confusing` | The voting flow was confusing |
| `photo_upload` | Photo upload didn't work or was hard |
| `vote_unconfirmed` | I couldn't tell if my vote went through |
| `bad_info` | Some candidate info was missing or wrong |
| `none` | Nothing really — it was great |
| `other` | Other |

### Q6. Email capture — `email`
- **Type:** short text (HTML `type="email"`)
- **Required:** no
- **Question:** Want a heads-up when 2027 nominations open? Drop your email.
- **Help text:** Used only to notify you when the next election starts — not added to any list, not shared, not sold.
- **Placeholder:** `you@example.com`

### Q7. Final thoughts — `comments`
- **Type:** long text (textarea)
- **Required:** no
- **Question:** Anything else?
- **Help text:** Got an idea I didn't ask about, a story to share, or a complaint to register?
- **Placeholder:** *Optional — say whatever.*

---

## Thank-you state (rendered in place after submit)

> **Got it.**
>
> That's it. I'll read every response and use them to shape the 2027 contest. See you in the spring.
>
> — Andrew

---

## After deploy — operating the form

1. Push the branch to a Netlify deploy preview (or production). Netlify scans the served HTML and registers `survey-2027` as a form.
2. In Netlify dashboard → **Site → Forms → survey-2027**: turn on email notifications so submissions land in your inbox.
3. (Optional) Set up a Slack/Zapier webhook for the same notifications.
4. Watch the submission count vs the 100/mo free-tier ceiling. If it spikes near 100 during the post-vote week, enable the Level 1 add-on temporarily.
5. To export raw submissions: dashboard → **Forms → survey-2027 → Download as CSV**. Each multi-select column comes back as a comma-separated list of the internal `value` strings (e.g. `voted,shared`).

## To change a question

1. Update the question array (`Q_ROLE`, `Q_RESIDENCY`, etc.) in [app-static.jsx](../app-static.jsx).
2. If you add a new question (new field `name=`), add a matching `<input>` to the hidden detection form in [index.html](../index.html) — otherwise Netlify won't accept the new field. Renaming an existing field needs the same update.
3. Bump the `?v=N` cache-buster on the `app-static.jsx` script tag.
4. Update the corresponding section in this doc.
