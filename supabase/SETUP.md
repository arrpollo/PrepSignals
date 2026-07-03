# PrepSignals v.21 — one-time backend setup

The site itself stays 100% static (Vercel Hobby-friendly). Supabase provides
login + database, PostHog provides product analytics. Both keys embedded in the
client are *publishable* keys — safe to ship; all real protection is Postgres
row-level security (see setup.sql).

## 1. Supabase — run the schema (2 minutes)

1. Open https://supabase.com/dashboard/project/vzcgjuqxwsadbpslaujr
2. **SQL Editor → New query** → paste the whole of `setup.sql` → **Run**.
   Re-running later is safe (idempotent).

This creates `profiles`, `plans`, `checklists`, `saved_debriefs`,
`progress_entries`, and `feedback_messages`; enables row-level security (each
user sees only their own study rows; `role='admin'` can read admin data);
installs the signup trigger; and adds `delete_user()` for self-service account
deletion. v.21 also adds review-log columns to `progress_entries`.

## 2. Supabase — auth settings

Authentication → **Sign In / Providers → Email**:
- **Confirm email: ON** (it's the default). This is what enforces
  "email verification before syncing" — unverified users get no session,
  so they physically cannot write to the database.
- Minimum password length: 8 (matches the client-side check).

Authentication → **URL Configuration**:
- Site URL: `https://prepsignals.vercel.app`
- Redirect URLs — add both:
  - `https://prepsignals.vercel.app/**`
  - `http://localhost:8781/**`   (local preview via serve.py)

Optional (recommended before launch): Authentication → **Email Templates** —
put "PrepSignals" in the subject lines. Note the built-in email service is
rate-limited (a few per hour) and fine for testing; add custom SMTP
(e.g. Resend free tier) under Project Settings → Auth before real traffic.

## 3. Become admin

Sign up on the site with **prepsignals@gmail.com** (any prompt or the Log in
button → Create account) and verify the email. The signup trigger assigns
`role='admin'` to that address automatically. If you signed up *before*
running setup.sql, step 6 at the bottom of the SQL fixes it.

Then Admin appears in the account avatar menu for that account:
- `/admin` — signups, opt-in rate, signup sources, latest users
- `/admin/users` — full list + target/weak-area/stage/timeline distributions
- `/admin/content` — most-saved debriefs, saves per user, checklist completion
- `/admin/feedback` — About-page feedback/contact submissions
- `/admin/events` — the event dictionary + funnels to build in PostHog

Anyone else opening /admin gets an access message — and even if they bypassed
the UI, RLS returns zero rows without the admin role. Never put the
`service_role` key in the site.

## 4. PostHog — nothing to install

The snippet ships in `index.html` with project token
`phc_CtkjhRN3pZtZEcSMP3YXisKBJbwKenPngJd8tLLmwWbu` (US cloud). It:
- auto-captures `$pageview` on every pushState route change,
- receives every `track()` event (same names as Vercel Analytics),
- identifies logged-in users by Supabase user id (`posthog.identify`),
- is disabled on localhost / file:// so dev sessions don't pollute data.

Suggested one-time setup in https://us.posthog.com/project/494794 —
funnels: `$pageview → intake_submit → plan_view` (visitor→plan),
`plan_view → auth_modal_open[source=plan] → signup_completed` (plan→signup),
`auth_prompt[source=save_debrief] → signup_completed` (save→signup);
retention on `$pageview` for the 1/7/30-day return rates;
trends on `debrief_open` (most-opened) and `origin_click` (source-link clicks).
For v.21, also track `planner_prompt_click`, `planner_task_click`,
`feedback_submit`, and `account_menu_open`.

## 5. Deploy checklist (when ready)

Push `index.html`, `data.js`, `app.css`, `app.js`, `vercel.json`, `assets/`
to the PrepSignals repo root as usual. Vercel Analytics keeps working; PostHog
and Supabase activate automatically on the prod domain. Then do one end-to-end
smoke test: sign up with a real email → verify → save a debrief → log a review
entry → submit About feedback → open `/admin/feedback` → confirm the message is
visible and can be triaged.
