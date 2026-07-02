# PrepSignals v.19.2.1 Handoff

## What this is
PrepSignals is a static GMAT research dashboard built from 330 public GMAT debriefs. It answers: "What did people who reached my target score actually do?"

No backend, login, CDN, or framework. `build_v19_2_1.py` embeds JSON data and writes `dashboard_v19_2_1.html`.

v.19.2.1 is a UX/UI refresh of v.19.2 aimed at the real audience: ~75% mobile, high bounce. Same data, same deep links, same localStorage keys.

## Files
- `build_v19_2_1.py` — source of truth for HTML/CSS/JS generation.
- `dashboard_v19_2_1.html` — generated static app.
- `debriefs.json` — normalized post-level data.
- `post_details.json` — detailed summaries, timelines, section notes.
- `vercel.json` — rewrites `/` to the dashboard file.

Rebuild:

```bash
python3 gmat_research/v.19.2.1/build_v19_2_1.py
```

Local preview: any static server in this folder (Claude launch config `gmat-dashboard-v19-2-1`, port 8779).

## Current UX

### My Score Path
- Intake is a **stepper**: one question per card, progress bar, emoji icons, auto-advance after each tap, Back button, live "N stories match" line. Big full-width tap targets on mobile.
- Result page is a numbered flow:
  1. **Score-path ticket** — gradient hero card: current → target jump with animated stripe arrow, "+N typical" pill, three count-up stats (% who made the jump, typical gain, typical prep), typical-path sentence, pacing note, "Change answers".
  2. **Step 1 · Today** — the single do-this-first recommendation, accent-colored by topic (section color, or green for timing).
  3. **Step 2 · Your first week** — a 4-item checklist generated from the peer data; ticks persist in localStorage (`ps_checks_v1`, keyed to the plan signature). Completing all four fires confetti.
  4. **Step 3 · Where your points will come from** — three focus cards (section / practice loop / resource stack) opening the existing insight drawers. The old separate "signals" section was merged into this.
  5. Collapsed **Stories like yours** (6 debriefs) and **Dig into the numbers** (target-band charts).
- Confetti bursts on first plan build. Copy de-jargoned ("stories like yours" instead of "cohort", etc.).

### Explore the data
- Chart rows grouped under color-coded **kickers**: Scores / The jump / Time & attempts / What they used / Tactics / Read the stories.
- Every chart has an auto-computed **takeaway** sentence (`setTake()`), recomputed on every filter change.
- Two new analyses: **Do retakes pay off?** (median score by attempt number) and **Self-study vs paid course** (median score/gain/prep duel card).
- **Everything is tappable**: gain bars, prep bars, attempt bars, resource rows, duel columns, and heatmap cells all open the cohort drawer with the matching debriefs.
- Browse list has **search** (title + resource) and **sort** (score / newest / gain / most detailed); sits on a full-bleed tinted band.

## Color system (one meaning per hue, documented in CSS `:root`)
Quant=blue · Verbal=violet · **Data Insights=teal (new — no longer sharing amber)** · resources=amber · practice loop/brand=indigo · timing/test-day=green · score gains=coral.

## Key implementation notes
- Stepper: `STEPQ`, `quizStep`, `pickPlan()` auto-advances, `renderQuiz(animate)`.
- Checklist: `checklistItems()`, `renderChecklist()`, `toggleCheck()`, storage key `ps_checks_v1` scoped by `planSig()`.
- Playful bits: `animateCounts()` (elements with `data-cnt`), `confettiBurst(host)`, `.rise` reveal-on-scroll via `observeGrow()` (with a 1.2s above-the-fold safety fallback so content can never stay invisible).
- Explore: `setTake(id,html)` writes takeaways; `renderXAttempts` / `renderXCompare` are new; `xOpenGain/xOpenPrep/xOpenAttempts/xOpenRes/xOpenSelf` open cohort drawers; `svgVBars` accepts per-bar `click`, `hBarsHTML` accepts `opt.click`; browse uses `xq`/`xsort`.
- Desktop canvas widened to 1180px; `.bleed` gives the browse band full-bleed background.
- `?p=c1-b2-w3-q`, `?band=`, `?d=` deep links and `ps_plan_v1` localStorage all unchanged from v.19.2.

## Future (user's stated direction)
Login + member features are planned. The checklist persistence is the natural first thing to move server-side; `planSig()` already gives a stable plan identity.

## Last verified (2026-07-02, browser smoke test)
- Rebuild with 330 debriefs; zero console errors.
- Stepper: all 4 steps, auto-advance, Back, live match count, deep link written on submit.
- Plan: ticket stats, checklist tick + persistence across reload, insight drawer, example debriefs.
- Explore: all 9 takeaways compute; gain/resource/attempts/self-study taps open correct cohorts; search "mock" + all 4 sorts; heatmap → cohort → debrief detail chain.
- Mobile 375px: zero horizontal overflow on quiz, plan, and explore; 65px tap targets.
