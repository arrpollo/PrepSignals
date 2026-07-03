# PrepSignals v.21 Handoff

## What changed
v.21 turns the logged-in `/me` area into a personalized Study Planner. It does
not add courses, a question bank, fake AI chat, or adaptive scoring. The planner
is deterministic: it uses the current score path, checklist state, saved
debriefs, progress/review log, and cohort evidence already in the app.

## Architecture
```
src/template.html   SPA shell, About/contact form, account view container
src/app.css         design system, planner/account/contact/admin feedback styles
src/app.js          router, plan/explore/detail views, Study Planner, review log
src/auth.js         Supabase auth, account menu/profile/security, feedback submit
src/admin.js        /admin dashboard, including /admin/feedback
build_v21.py        writes index.html/data.js/app.css/app.js
supabase/setup.sql  v.21 schema/RLS additions
```

Keep using `var` and function declarations in `auth.js`/`admin.js` where possible:
`app.js` applies the first route before later concatenated sections run, so
function hoisting keeps initial renders safe.

## New Routes
```
/me                         Study Planner
/account/profile            profile, target, test month, weak area, prep stage, opt-in
/account/security           password change and sign out
/admin/feedback             feedback inbox and status triage
```

The primary mobile nav still hides the `Admin` tab, but admin users can reach it
from the avatar menu at all viewport widths.

## Supabase Changes
- `progress_entries`: added nullable `section_focus`, `notes`, and `review_tags text[]`.
- `feedback_messages`: stores `email`, `title`, `body`, `status`, optional `user_id`, and timestamps.
- Feedback inserts are allowed for anonymous and authenticated users; reads and
  status updates are admin-only.

If feedback or review-log sync fails, first confirm the v.21 SQL has been run.

## Verification Checklist
- Build: `python3 build_v21.py`
- Static JS check: `node --check app.js`
- Smoke routes: `/path`, generated `/path/...`, `/me`, `/me/progress`,
  `/account/profile`, `/account/security`, `/about`, `/admin/feedback`
- Mobile: verify the avatar menu opens and shows Admin for an admin account
- About: submit feedback with Supabase online; verify fallback email draft when unavailable
