# PrepSignals v.19.2.1 — UX/UI refresh

Static GMAT dashboard built from 330 public debriefs (r/GMAT + GMAT Club).
`python3 build_v19_2_1.py` reads `debriefs.json` + `post_details.json` and writes
the self-contained `dashboard_v19_2_1.html`. No backend, no framework, no CDN.

## Why this version
v.19.2 split the site into **My Score Path** (guidance) and **Explore the data**
(charts), but Path was still hard to use and didn't say what to do next, Explore
was shallow, desktop felt cramped in the middle, colors drifted, and mobile
(~75% of traffic) had boxes crammed together.

## What changed vs v.19.2

### UX
1. **Stepper intake** — one question per screen with a progress bar, emoji
   icons, auto-advance, Back, and a live "N stories match" counter. Much less
   scrolling on mobile; same `?p=` links and `ps_plan_v1` storage.
2. **Plan as numbered steps** — gradient *score-path ticket* (jump, % who made
   it, typical gain/prep, count-up numbers) → *Step 1 · Today* → *Step 2 · Your
   first week* (persistent 4-item checklist generated from peer data, saved in
   `ps_checks_v1`) → *Step 3 · three focus areas* (old "levers" + "signals"
   merged into one section). Jargon removed throughout.
3. **Deeper Explore** — a computed takeaway sentence under every chart, two new
   analyses (*Do retakes pay off?*, *Self-study vs paid course*), tappable
   bars/rows/columns that open the matching debriefs, search + sort in browse,
   and color-coded section kickers to give the page a narrative.

### UI
4. **One color system** (documented in `:root`): Quant=blue, Verbal=violet,
   **Data Insights=teal** (new token — DI no longer shares amber with
   resources), resources=amber, practice loop=indigo, timing=green,
   gains=coral. About page explains the mapping.
5. **Playful + wider** — 1180px canvas, floating hero blobs, gradient headline
   word, animated ticket arrow, count-up stats, confetti on plan build and on
   completing the checklist, reveal-on-scroll cards (with reduced-motion and
   IO-fallback safety), full-bleed tinted browse band, bigger mobile gaps and
   58px+ tap targets.

## Verified
Browser smoke test 2026-07-02: full stepper flow, plan build + checklist
persistence across reload, all 9 Explore takeaways, tap-to-cohort on every new
surface, search/sort, heatmap → cohort → detail chain, and zero horizontal
overflow at 375px. No console errors.
