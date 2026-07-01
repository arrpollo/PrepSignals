# PrepSignals — GMAT dashboard v.19.2

v.19.2 brings back the **data-insights depth of v.16** — the chart-heavy
analytics dashboard — but rebuilt in the v.19 UI, and reorganises the two
tabs into a clearer split:

- **My Score Path** — the personalized surface. It is now action-first:
  path summary, one first recommendation, three practical levers, synthesized
  insight drawers, then optional example debriefs and lower evidence charts.
- **Explore the data** — rebuilt as a **global, filterable charts dashboard**
  over every debrief (the old Explore band-picker is gone; its per-band
  analytics now live here or in the collapsed evidence section on My Score
  Path).

Everything is hand-rolled SVG/CSS themed to the v.19 design system — no chart
library, no CDN, no backend. Same 330 debriefs and same data files as v.19.

## My Score Path tab (action-first + personalized)

After the 4-question intake (current score / target band / weeks to test /
hardest area right now), keyed to the matched peer cohort and the target band:

- **Path summary** — frames `current bucket → target band`, sample quality,
  timeline, and the typical `start → total (+gain)` path where available.
- **Do this first** — one first recommendation based on the user's hardest
  area; "Not sure" falls back to the cohort's weakest-section signal.
- **Your 3 levers** — section focus, practice loop, and resource stack, each
  opening an insight-first drawer with stats, takeaways, and optional examples.
- **What the debriefs are telling you** — compact synthesis cards before
  individual stories.
- **Example debriefs** — closest debrief cards remain available as optional
  supporting evidence.
- **Explore the evidence** — lower, collapsed target-band analytics:
  - **Where scores land** — score histogram with your target band highlighted.
  - **Typical section split** — median Q / V / DI, with the weakest called out.
  - **What they studied with** — most-named resources.
  - **Prep & gain context** — median prep, gain, attempts, self-study share.
  - **Tactic adoption by band** — a tap-through heatmap.

## Explore the data tab (global charts)

A filter toolbar (**score band chips · source · resource · self-study only**)
drives a live stat row and eight charts over the filtered set:

1. **Score distribution** — histogram (selected bands highlighted).
2. **Where each tier is weakest** — grouped bars, median Q/V/DI per band.
3. **How big a jump is realistic?** — point-gain distribution.
4. **Most-used resources** — horizontal bars.
5. **Prep time vs score gain** — scatter with a least-squares trendline.
6. **Does more prep time help?** — median total score by prep-duration bucket.
7. **Tactic adoption by score band** — tap-through heatmap.
8. **Browse the filtered debriefs** — card grid with "show more".

## Hand-rolled chart primitives

New reusable SVG builders (in the `SVG CHART PRIMITIVES` block): `svgVBars`,
`svgGroupedBars`, `svgScatter`, `svgHist`, `hBarsHTML`, plus `niceTicks` and a
`paint()` helper that re-runs the grow-in animation on each render. Every
chart has a compact `<520px` variant; the whole surface collapses cleanly at
the 760px breakpoint. Aggregation stays 100% client-side.

New Python bucket definitions passed as tokens: `__GAINB__` (point-gain
buckets) and `__PREPB__` (prep-duration buckets).

## Rebuild

From this folder:

```bash
python3 build_v19_2.py
```

Writes `dashboard_v19_2.html`. Same data notes, deep links
(`?p=` / `?band=` / `?d=`), privacy model, and analytics events as v.19 —
see `../v.19/README.md`.
