# PrepSignals — GMAT personalized-plan dashboard v.19

v.19 is a Phase 1 UX rebuild aimed at the ~70% bounce rate on v.18.1. It stops
pre-rendering the full analytics dashboard on load and replaces it with a
3-question intake that builds a personalized plan against a matched peer
cohort. No login anywhere — personalization is entirely client-side.

## What changed vs v.18.1

- **New landing flow.** The homepage no longer dumps the whole band-scoped
  dashboard at once. It shows one hero + a 3-question intake (current score /
  target band / weeks to test) with a single "Build my plan" CTA.
- **Peer-matched personalization.** On submit, the plan is built from debriefs
  that both *started* near the user's current-score bucket and *reached* the
  target band (`peersFor()`), not just the target band as a whole. If fewer
  than 6 exact matches exist, it falls back to the full band with an honest
  "band-wide" disclaimer — never silently thins the sample without saying so.
- **Pacing callout.** Compares the user's stated timeline against the matched
  cohort's median prep time and surfaces a tight/typical/long-runway note.
- **Two-mode nav.** "Your plan" (personalized, default) vs "Explore the data"
  (the old v.18.1 band-picker dashboard, unchanged, for the analytically
  curious) vs "About". The Explore tab reuses the exact same rendering engine
  as v.18.1 (bands, histogram, section split, resource bars, tactic heatmap,
  browse-all) — no analytics were removed, just moved off the critical path.
- **No accounts.** The three intake answers are saved to `localStorage`
  (`ps_plan_v1`) so a return visit skips straight to the plan. Nothing is
  sent to a server.

## Rebuild

From this folder:

```bash
python3 build_v19.py
```

Writes `dashboard_v19.html`. The page is static and self-contained; it reads
the local `debriefs.json` and `post_details.json` at build time (unchanged
from v.18.1 — same 330 debriefs after the Debrief-tag filter).

## Deep links

- `?p=<cur>-<tgt>-<wk>` opens a specific personalized plan directly, e.g.
  `?p=c2-b2-w2` (605–654 → 705–745, 4–7 weeks). Submitting the intake also
  writes this URL and saves it to localStorage.
- `?band=<low>` opens the Explore tab pre-scoped to a band (v.18.1-compatible).
- `?d=<post_id>` opens a specific debrief detail page, from either tab.

## Analytics events

Carried over from v.18.1: `band_select`, `debrief_open`, `origin_click`,
`about_open`, `action_click`, `insight_open`, `cohort_open`.

New in v.19: `intake_submit` (cur/tgt/wk), `intake_edit`, `plan_view`
(cur/tgt/wk/matched/sample), `plan_action_click` (kind/band).

## Data notes

The underlying data pipeline is unchanged: same 330 debriefs (post
Debrief-tag filter, 367 raw records), same `debriefs.json`, same
`post_details.json`. The current-score buckets and weeks-to-test buckets are
tuned to the real `start_score` (375–715, median 595) and `prep_weeks`
(1–157, median 9) distributions. `MIN_PEERS = 6` is the floor before the
"closest matches" plan falls back to the full band.

## Known gaps (not yet addressed — future phases)

- No account/sync layer, so the plan doesn't follow a user across devices.
  Deliberately deferred until Phase 1 shows people actually return.
- `popstate` (browser back/forward) restores detail/cohort overlays and
  Explore-tab band state, but does not fully restore Your-Plan intake state —
  a minor gap versus full SPA history handling, acceptable for a prototype.
