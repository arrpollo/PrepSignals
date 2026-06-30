# PrepSignals — GMAT action-plan dashboard v.18.1

v.18.1 keeps the answer-first score-band entry from v.18, then changes what comes
next: visitors get a distilled plan before they are asked to read individual
debriefs.

## What changed vs v.18

- Adds **Your plan for this score range**: section focus, practice loop, resource
  stack, and proof examples.
- Restores curated analytical depth without Chart.js: score distribution, section
  split, resource frequency, prep/gain context, and tactic heatmap.
- Moves real stories into an **Evidence behind the plan** section so reading
  debriefs is optional proof instead of the primary task.
- Adds clickable proof cohorts from action cards, resource insights, and heatmap
  cells.
- Fixes compressed chart/card presentation with stable chart heights, balanced
  insight panels, and a taller score-path chart inside debrief detail pages.

## Rebuild

From this folder:

```bash
python3 build_v18_1.py
```

Writes `dashboard_v18_1.html`. The page is static and self-contained; it reads the
local `debriefs.json` and `post_details.json` at build time.

## Deep Links

- `?band=655`, `?band=705`, or `?band=755` opens a selected score range.
- `?d=<post_id>` opens a specific debrief detail page.

## Analytics Events

The page keeps v.18 events: `band_select`, `debrief_open`, `origin_click`, and
`about_open`.

v.18.1 adds:

- `action_click`
- `insight_open`
- `cohort_open`

## Data Notes

The underlying data pipeline is unchanged: same 330 debriefs, same
`debriefs.json`, same `post_details.json`. Insight cards always expose sample
sizes and use directional language rather than causal claims.
