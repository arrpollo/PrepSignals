# PrepSignals v.21

Your personal GMAT study planner, built from 330 real debriefs. v.21 keeps the
static Supabase-powered architecture from the previous release and shifts the
logged-in experience from a generic workspace to a rule-based Study Planner.

- **/path** — answer four questions and get a score path, checklist, and cohort evidence
- **/explore** — browse/filter every debrief and open the source stories
- **/me** — Study Planner: Today card, planner assistant prompts, next tasks, progress insight, and recommended debriefs
- **/me/saved · /me/progress** — saved debriefs and review log with optional focus/tags/notes
- **/account/profile · /account/security** — profile, prep metadata, marketing opt-in, password change, sign out/delete
- **/about** — modern About page with Supabase-backed feedback/contact form
- **/admin** (+ /users /content /feedback /events) — admin dashboard, including feedback triage

Anonymous users can browse, explore, and generate/share a score path. Signup is
prompted contextually when users want to keep a path, save debriefs, sync
checklist progress, or maintain a review log.

## Backend Setup

Run `supabase/setup.sql` for v.21. It adds:

- `feedback_messages` for About-page contact submissions
- optional `section_focus`, `review_tags`, and `notes` columns on `progress_entries`
- RLS policies for anonymous/authenticated feedback inserts and admin-only review

## Develop

```bash
python3 build_v21.py
python3 serve.py 8781
```

Edit `src/template.html`, `src/app.css`, `src/app.js`, `src/auth.js`, and
`src/admin.js`; generated files are `index.html`, `data.js`, `app.css`, and
`app.js`.
