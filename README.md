# PrepSignals — GMAT guided debrief dashboard v.17

Ship-ready static PrepSignals dashboard over achieved-score GMAT debrief links.
Open `dashboard_v17.html` in a browser after rebuilding; all data and Chart.js
are embedded in the generated HTML.

## What's new in v.17

- Adds a mobile-first "Choose your path" launcher for Quant, Verbal, DI,
  high-score debriefs, resources, and score jumps.
- Moves recommended high-signal debrief cards near the top of the dashboard.
- Makes mobile debrief cards fully tappable and limits initial mobile list
  rendering behind a "Show more" control.
- Replaces the expanded mobile filter block with a bottom-sheet style panel.
- Replaces the wide tactic heatmap on mobile with stacked tactic cards by score
  band.
- Adds guarded Vercel Web Analytics custom events without changing the static,
  privacy-safe no-backend model.

## Rebuild

From this folder:

```bash
python3 build_v17.py
```

The builder writes:

- `dashboard_v17.html`

## Analytics

This is a static Vercel dashboard, not a Next.js app. Web Analytics is enabled
with Vercel's static script in the generated HTML:

```html
<script>
  window.va = window.va || function () {
    (window.vaq = window.vaq || []).push(arguments);
  };
</script>
<script defer src="/_vercel/insights/script.js"></script>
```

You do not need `npm i @vercel/analytics` unless the project is later converted
to a Next.js/React app.

Speed Insights is wired the same way for this static page:

```html
<script>
  window.si = window.si || function () {
    (window.siq = window.siq || []).push(arguments);
  };
</script>
<script defer src="/_vercel/speed-insights/script.js"></script>
```

You do not need `npm i @vercel/speed-insights` unless the project is later
converted to a Next.js/React app. If Vercel's Speed Insights dashboard later
shows a project-specific static HTML script path, use that path in place of
`/_vercel/speed-insights/script.js`.

## Files

| File | Role |
|------|------|
| `dashboard_v17.html` | Generated static dashboard. |
| `build_v17.py` | Builds the dashboard from the embedded data files. |
| `chart.umd.min.js` | Vendored Chart.js 4.4.7 browser bundle. |
| `debriefs.json` | Per-post source rows with strategy items. |
| `post_details.json` | Detail-page model: timeline, Q/V/DI notes, tactic chips. |
| `vercel.json` | Routes `/` to the v.16 dashboard. |
