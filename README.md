# PrepSignals — GMAT guided debrief dashboard v.16

Ship-ready static PrepSignals dashboard over achieved-score GMAT debrief links.
Open `dashboard_v16.html` in a browser after rebuilding; all data and Chart.js
are embedded in the generated HTML.

## What's new in v.16

- Creates a more polished guided dashboard from v.15.
- Inlines a vendored Chart.js bundle so charts do not depend on a runtime CDN.
- Uses a deeper study-intelligence palette: ink background, slate panels, cyan
  insight accents, emerald outcomes, amber resource/prep signals, and violet
  Verbal cues.
- Adds chart explanation blocks with filter-aware findings.
- Improves mobile UX with compact filters, stacked chart cards, and debrief
  cards instead of relying only on a wide table.
- Keeps the v.15 data/privacy contract: Debrief rows only, raw post bodies
  stripped before embedding, and original-source links preserved.

## Rebuild

From this folder:

```bash
python3 build_v16.py
```

The builder writes:

- `dashboard_v16.html`

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
| `dashboard_v16.html` | Generated static dashboard. |
| `build_v16.py` | Builds the dashboard from the embedded data files. |
| `chart.umd.min.js` | Vendored Chart.js 4.4.7 browser bundle. |
| `debriefs.json` | Per-post source rows with strategy items. |
| `post_details.json` | Detail-page model: timeline, Q/V/DI notes, tactic chips. |
| `vercel.json` | Routes `/` to the v.16 dashboard. |
