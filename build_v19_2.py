#!/usr/bin/env python3
"""v.19.2 — PrepSignals, personalized plan + full data-insights charts.

Reads debriefs.json + post_details.json and writes a self-contained
dashboard_v19_2.html. Charts are hand-rolled SVG/CSS (no chart library),
themed to the v.19 design system, and all aggregation happens in-browser.

What changed vs v19.1:
  1. PATH-FIRST PERSONALIZATION — the band-scoped analytics that used to live
     on the Explore tab now support a personalized "My Score Path" tab. After
     the 4-question intake, the page leads with a path summary, one "do this
     first" recommendation, three practical levers, and closest stories before
     the lower, collapsed evidence charts.
  2. NEW "Explore the Data" tab — brings back the depth of the old v.16
     dashboard as a GLOBAL, filterable analytics view over every debrief:
     score distribution, section medians by band (grouped bars), point-gain
     distribution, resource popularity, prep-time vs gain scatter + trendline,
     median score by prep duration, per-section tactic effectiveness, and a
     tactic x band heatmap — with a filter toolbar (score / source / resource /
     self-study) and a live stat row. All hand-rolled SVG in the new UI.
  3. Mobile-first: every new chart has a compact <520px variant and the whole
     surface collapses cleanly at the 760px breakpoint.

Carried over from v19.x: localStorage persistence, peer
matching, deterministic per-section insights, no login / no backend, and the
?p= / ?band= / ?d= deep links.

The template uses plain `__TOKEN__` placeholders filled by str.replace(), so the
CSS/JS can use normal single braces with no escaping.
"""
import json
import statistics as st
from pathlib import Path

BASE = Path(__file__).resolve().parent


def main():
    raw = json.loads((BASE / "debriefs.json").read_text())
    details = json.loads((BASE / "post_details.json").read_text())

    for d in raw:
        d["tags"] = ["Debrief" if t == "Success Story" else t for t in d.get("tags", [])]
    debriefs = [d for d in raw if "Debrief" in d.get("tags", [])]
    ids = {d["post_id"] for d in debriefs}
    details = {pid: {k: v for k, v in det.items() if k != "body"}
               for pid, det in details.items() if pid in ids}

    deb = [{
        "id": d["post_id"], "date": d["date"], "title": d["title"],
        "total": d["total_score"], "q": d["q_score"], "v": d["v_score"], "di": d["di_score"],
        "resources": d["resources"], "strat": d["strategy_items"],
        "tags": [t for t in d["tags"] if t != "Debrief"], "source": d["source"],
        "permalink": d["permalink"].replace("old.reddit.com", "www.reddit.com"),
        "attempts": d["attempts"], "prep_weeks": d["prep_weeks"],
        "gain": d["point_gain"], "start": d["start_score"],
        "sreason": d.get("sreason", ""), "nreplies": d.get("n_replies"),
    } for d in debriefs]

    scores = [d["total"] for d in deb if d["total"]]
    dates = [d["date"] for d in deb if d.get("date")]
    min_date, max_date = (min(dates), max(dates)) if dates else ("", "")

    # Target bands, tuned to the real data (every debrief is 655-805, median ~705).
    bands = [
        {"key": "b1", "lo": 655, "hi": 695, "label": "655 – 695",
         "name": "Building toward 700", "blurb": "Solid scores, closing the last gap."},
        {"key": "b2", "lo": 705, "hi": 745, "label": "705 – 745",
         "name": "The 700+ club", "blurb": "The classic business-school target."},
        {"key": "b3", "lo": 755, "hi": 805, "label": "755 – 805",
         "name": "Top scores", "blurb": "The rarefied air near the ceiling."},
    ]
    for b in bands:
        b["count"] = sum(1 for s in scores if b["lo"] <= s <= b["hi"])

    # Current-score buckets, tuned to the real start_score data (375-715, median 595).
    curb = [
        {"key": "c1", "lo": 0, "hi": 604, "label": "Under 605", "name": "Early diagnostic or first mock"},
        {"key": "c2", "lo": 605, "hi": 654, "label": "605 – 654", "name": "Warming up"},
        {"key": "c3", "lo": 655, "hi": 694, "label": "655 – 694", "name": "Already close"},
        {"key": "c4", "lo": 695, "hi": 9999, "label": "695+", "name": "Refining at the top"},
    ]

    # Weeks-until-test buckets, tuned to the real prep_weeks data (1-157, median 9).
    weekb = [
        {"key": "w1", "lo": 0, "hi": 3, "label": "Less than 4 weeks"},
        {"key": "w2", "lo": 4, "hi": 7, "label": "4 – 7 weeks"},
        {"key": "w3", "lo": 8, "hi": 12, "label": "8 – 12 weeks"},
        {"key": "w4", "lo": 13, "hi": 9999, "label": "13+ weeks"},
    ]

    # Point-gain buckets (start_score -> total_score) for the Explore gain chart.
    gainb = [
        {"key": "g1", "lo": 0, "hi": 49, "label": "< 50"},
        {"key": "g2", "lo": 50, "hi": 99, "label": "50–99"},
        {"key": "g3", "lo": 100, "hi": 149, "label": "100–149"},
        {"key": "g4", "lo": 150, "hi": 199, "label": "150–199"},
        {"key": "g5", "lo": 200, "hi": 9999, "label": "200+"},
    ]

    # Prep-duration buckets for the Explore "score by prep time" chart.
    prepb = [
        {"key": "p1", "lo": 0, "hi": 4, "label": "0–4w"},
        {"key": "p2", "lo": 5, "hi": 8, "label": "5–8w"},
        {"key": "p3", "lo": 9, "hi": 12, "label": "9–12w"},
        {"key": "p4", "lo": 13, "hi": 24, "label": "13–24w"},
        {"key": "p5", "lo": 25, "hi": 9999, "label": "25w+"},
    ]

    deb_js = json.dumps(deb, ensure_ascii=False, separators=(",", ":"))
    details_js = json.dumps(details, ensure_ascii=False, separators=(",", ":"))
    bands_js = json.dumps(bands, ensure_ascii=False)
    curb_js = json.dumps(curb, ensure_ascii=False)
    weekb_js = json.dumps(weekb, ensure_ascii=False)
    gainb_js = json.dumps(gainb, ensure_ascii=False)
    prepb_js = json.dumps(prepb, ensure_ascii=False)

    tooltips = {
        "Maybe Promo": "Possible promotional signals (brand-endorsement framing, a vendor "
                       "rep in comments, or readers asking if it's an ad) — open it and judge.",
        "Self Study": "Used only free resources (GMAT Club, GMAT Ninja, Official Guide, "
                      "Official Mocks) or no named resource at all — no paid prep course.",
    }

    html = (TEMPLATE
            .replace("__DEB__", deb_js)
            .replace("__DETAILS__", details_js)
            .replace("__BANDS__", bands_js)
            .replace("__CURB__", curb_js)
            .replace("__WEEKB__", weekb_js)
            .replace("__GAINB__", gainb_js)
            .replace("__PREPB__", prepb_js)
            .replace("__TOOLTIPS__", json.dumps(tooltips, ensure_ascii=False))
            .replace("__NDEB__", str(len(deb)))
            .replace("__MEDIAN__", str(int(st.median(scores))) if scores else "—")
            .replace("__MINDATE__", min_date).replace("__MAXDATE__", max_date))
    (BASE / "dashboard_v19_2.html").write_text(html)
    print(f"dashboard_v19_2.html written. {len(deb)} debriefs, {len(details)} detail pages.")
    for b in bands:
        print(f"  target {b['label']}: {b['count']}")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>PrepSignals — your personal GMAT score plan</title>
<meta name="description" content="Answer four quick questions and get a personal GMAT score path matched to __NDEB__ real debriefs from people who started near you and reached your target.">
<script>
window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};
window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments);};
(function(){
  var h=location.hostname;
  if(location.protocol==='file:'||h==='localhost'||h==='127.0.0.1'||h==='')return;
  var a=document.createElement('script');a.defer=true;a.src='/_vercel/insights/script.js';document.head.appendChild(a);
  var s=document.createElement('script');s.defer=true;s.src='/_vercel/speed-insights/script.js';document.head.appendChild(s);
})();
</script>
<style>
:root{
  --bg:#f5f6fb; --surface:#ffffff; --surface-2:#fbfbfe;
  --ink:#1b1e2e; --ink-2:#586079; --ink-3:#929ab0;
  --primary:#5b5bd6; --primary-d:#4a46c9; --primary-l:#edecfb;
  --coral:#ff6b5b; --coral-d:#d6452f; --coral-l:#ffeeec;
  --green:#15a34a; --green-d:#0f7a37; --green-l:#e6f6ec;
  --amber:#e08a00; --amber-l:#fdf0d9;
  --violet:#7c5cf0; --violet-l:#efeafe;
  --blue:#2f74e0; --blue-l:#e6f0fd;
  --border:#e8e8f1; --border-2:#dcdce9;
  --radius:18px; --radius-sm:12px;
  --shadow:0 1px 2px rgba(20,20,55,.05), 0 6px 20px rgba(28,28,80,.05);
  --shadow-lg:0 18px 50px rgba(28,28,80,.16);
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,"Inter",Roboto,sans-serif;
  --ease:cubic-bezier(.22,.61,.36,1);
}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:var(--font);background:var(--bg);color:var(--ink);line-height:1.55;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
a{color:inherit;text-decoration:none}
button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit}
.wrap{max-width:1060px;margin:0 auto;padding:0 20px}
h1,h2,h3{letter-spacing:-.02em;line-height:1.15}

/* ---- top bar ---- */
header.bar{position:sticky;top:0;z-index:40;background:rgba(245,246,251,.82);
  backdrop-filter:saturate(1.6) blur(12px);-webkit-backdrop-filter:saturate(1.6) blur(12px);
  border-bottom:1px solid var(--border)}
.bar .wrap{display:flex;align-items:center;justify-content:space-between;height:62px;gap:10px}
.logo{font-size:20px;font-weight:800;letter-spacing:-.03em;color:var(--ink);flex:none;white-space:nowrap}
.logo b{color:var(--primary);font-weight:800}
.logo .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--coral);
  margin-left:1px;transform:translateY(-1px)}
.nav{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.nav::-webkit-scrollbar{display:none}
.nav button{font-size:14.5px;font-weight:600;color:var(--ink-2);padding:8px 13px;border-radius:10px;
  transition:.18s var(--ease);white-space:nowrap;flex:none}
.nav button:hover{background:var(--surface);color:var(--ink)}
.nav button.on{color:var(--primary);background:var(--primary-l)}
.navshort{display:none}

/* ---- hero ---- */
.hero{padding:50px 0 18px;text-align:center;position:relative}
.hero::before{content:"";position:absolute;inset:-40px 0 auto;height:340px;z-index:-1;
  background:radial-gradient(120% 90% at 50% -8%,rgba(124,92,240,.16),rgba(91,91,214,.05) 38%,transparent 64%)}
.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700;
  color:var(--primary-d);background:var(--primary-l);padding:6px 13px;border-radius:30px;margin-bottom:20px}
.eyebrow .pulse{width:7px;height:7px;border-radius:50%;background:var(--green)}
.hero h1{font-size:clamp(30px,6.4vw,52px);font-weight:800;margin:0 auto 16px;max-width:17ch}
.hero p.lede{font-size:clamp(16px,2.4vw,19px);color:var(--ink-2);max-width:62ch;margin:0 auto 8px}
.hero p.lede b{color:var(--ink);font-weight:700}

/* ---- quiz (4-question intake) ---- */
.quiz{max-width:720px;margin:26px auto 0}
.qgroup{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px 20px 18px;box-shadow:var(--shadow);margin-bottom:14px;text-align:left}
.qgroup .qtitle{font-size:16px;font-weight:800;display:flex;align-items:center;gap:9px}
.qgroup .qn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:50%;background:var(--primary-l);color:var(--primary-d);font-size:12px;font-weight:800;flex:none}
.qgroup .qsub{font-size:13px;color:var(--ink-2);margin:4px 0 14px;margin-left:31px}
.qopts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}
.qopt{background:var(--surface-2);border:1.5px solid var(--border);border-radius:12px;
  padding:12px 13px;text-align:left;transition:.16s var(--ease)}
.qopt:hover{border-color:var(--border-2)}
.qopt.on{background:var(--primary-l);border-color:var(--primary)}
.qopt .ol{font-size:14px;font-weight:800;color:var(--ink)}
.qopt.on .ol{color:var(--primary-d)}
.qopt .os{font-size:12px;color:var(--ink-2);margin-top:2px}
.quizmatch{font-size:13.5px;color:var(--ink-2);text-align:center;margin:2px 0 16px}
.quizmatch b{color:var(--primary-d)}
.quizsubmit-wrap{text-align:center;margin-top:6px}
.quizsubmit{font-size:16px;font-weight:800;color:#fff;background:var(--primary);padding:14px 26px;
  border-radius:14px;transition:.18s var(--ease);display:inline-flex;align-items:center;gap:8px}
.quizsubmit:not(:disabled):hover{background:var(--primary-d);transform:translateY(-1px)}
.quizsubmit:disabled{opacity:.4;cursor:not-allowed}

/* ---- plan head ---- */
.planhead{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:22px;box-shadow:var(--shadow);margin-top:8px}
.planhead .ptop{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.planhead h2{font-size:21px;font-weight:800}
.planhead p{font-size:14px;color:var(--ink-2);margin-top:5px;max-width:60ch}
.editlink{font-size:13px;font-weight:700;color:var(--primary-d);background:var(--primary-l);
  border-radius:10px;padding:8px 12px;white-space:nowrap;flex:none}
.pacecall{margin-top:16px;background:var(--surface-2);border:1px solid var(--border);
  border-radius:14px;padding:13px 15px;font-size:13.5px;color:var(--ink-2)}
.pacecall b{color:var(--ink)}
.matchflag{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;
  color:var(--amber);background:var(--amber-l);border-radius:20px;padding:4px 10px;margin-top:10px}
.primaryrec{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center;margin-top:16px;
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:22px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.primaryrec::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:var(--primary)}
.primaryrec .ey{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;
  text-transform:uppercase;letter-spacing:.05em;color:var(--primary-d);background:var(--primary-l);
  border-radius:20px;padding:4px 10px;margin-bottom:12px}
.primaryrec h3{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:7px}
.primaryrec p{font-size:14.5px;color:var(--ink-2);max-width:68ch;line-height:1.55}
.primaryrec .metric{font-size:13px;color:var(--ink-2);margin-top:12px}
.primaryrec .metric b{color:var(--ink);font-weight:800}
.primaryrec .actbtn{display:inline-flex;align-items:center;justify-content:center;gap:7px;
  color:#fff;background:var(--primary);border-radius:12px;padding:11px 16px;font-size:14px;
  font-weight:800;transition:.16s var(--ease);white-space:nowrap}
.primaryrec .actbtn:hover{background:var(--primary-d);transform:translateY(-1px)}
.leverintro{font-size:14.5px;color:var(--ink-2);margin-top:7px;max-width:62ch}
.evidence{margin-top:20px}
.evidence>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;
  cursor:pointer;padding:20px 22px;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);box-shadow:var(--shadow)}
.evidence>summary::-webkit-details-marker{display:none}
.evidence h2{font-size:22px;font-weight:800}
.evidence .sumsub{font-size:14px;color:var(--ink-2);margin-top:4px;max-width:68ch}
.evidence .sumicon{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:var(--primary-d);background:var(--primary-l);font-weight:900;transition:.18s var(--ease);flex:none}
.evidence[open] .sumicon{transform:rotate(180deg)}
.evidencebody{padding:20px 0 0}
.signalgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}
.signalcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:18px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.signalcard::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:var(--sc,var(--primary))}
.signalcard .k{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;
  color:var(--sc,var(--primary));margin-bottom:10px}
.signalcard h3{font-size:17px;font-weight:800;margin-bottom:7px}
.signalcard p{font-size:13.5px;color:var(--ink-2);line-height:1.48}
.signalcard button{display:inline-flex;align-items:center;gap:7px;margin-top:14px;color:var(--sc,var(--primary));
  background:var(--scl,var(--primary-l));border-radius:11px;padding:9px 12px;font-size:13px;font-weight:800}

/* ---- band picker (explore tab) ---- */
.bands{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:0 auto;max-width:760px}
.band{position:relative;text-align:left;background:var(--surface);border:1.5px solid var(--border);
  border-radius:var(--radius);padding:18px 18px 16px;transition:.2s var(--ease);overflow:hidden}
.band::after{content:"";position:absolute;left:0;top:0;height:4px;width:100%;
  background:var(--bandc,var(--primary));opacity:.9}
.band:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg);border-color:var(--border-2)}
.band.on{border-color:var(--bandc,var(--primary));box-shadow:0 0 0 3px var(--bandc-l,var(--primary-l))}
.band .bnum{font-size:23px;font-weight:800;letter-spacing:-.03em;color:var(--ink);margin-top:4px}
.band .bname{font-size:14.5px;font-weight:700;color:var(--bandc-d,var(--primary-d));margin-top:2px}
.band .bblurb{font-size:13px;color:var(--ink-2);margin-top:7px;line-height:1.4;min-height:36px}
.band .bcount{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-3);
  margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
.band .bcount b{color:var(--ink);font-weight:800}
.band .barrow{position:absolute;right:16px;bottom:14px;color:var(--bandc,var(--primary));
  opacity:0;transform:translateX(-4px);transition:.2s var(--ease);font-size:18px}
.band:hover .barrow,.band.on .barrow{opacity:1;transform:translateX(0)}

/* ---- generic section + panels ---- */
section.block{padding:34px 0}
.shead{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px}
.shead h2{font-size:clamp(21px,3.4vw,27px);font-weight:800}
.shead .sub{font-size:14.5px;color:var(--ink-2);margin-top:5px;max-width:62ch}
.shead .sub b{color:var(--ink);font-weight:700}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:22px;box-shadow:var(--shadow)}
.panel + .panel{margin-top:16px}
.panel h3{font-size:17px;font-weight:800;margin-bottom:3px}
.panel h3 .hint{font-size:13px;font-weight:600;color:var(--ink-3);margin-left:8px}
.psub{font-size:13.5px;color:var(--ink-2);margin-bottom:18px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch;grid-auto-rows:1fr}
.grid2>.panel{min-height:320px;height:100%;align-self:stretch;display:flex;flex-direction:column}
.grid2>.panel .growfill{flex:1}

/* ---- action plan ---- */
.actiongrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:18px}
.actioncard{min-height:232px;text-align:left;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);display:flex;flex-direction:column;
  position:relative;overflow:hidden;transition:.2s var(--ease)}
.actioncard::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:var(--ac,var(--primary))}
.actioncard:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--border-2)}
.actioncard .k{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;font-size:11.5px;
  font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--ac,var(--primary));
  background:var(--acl,var(--primary-l));border-radius:20px;padding:4px 9px;margin-bottom:13px}
.actioncard h3{font-size:18px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px}
.actioncard p{font-size:13.5px;color:var(--ink-2);line-height:1.48;margin-bottom:14px}
.actioncard .metric{margin-top:auto;border-top:1px solid var(--border);padding-top:12px;font-size:13px;color:var(--ink-2)}
.actioncard .metric b{font-size:20px;line-height:1;color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums}
.actioncard .actbtn{margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:7px;
  color:var(--ac,var(--primary));background:var(--acl,var(--primary-l));border-radius:11px;padding:9px 12px;
  font-size:13px;font-weight:800;transition:.16s var(--ease)}
.actioncard .actbtn:hover{filter:saturate(1.1) brightness(.98)}

/* ---- insight panels (explore tab) ---- */
.insightcard{min-height:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px;box-shadow:var(--shadow);display:flex;flex-direction:column}
.insightcard h3{font-size:17px;font-weight:800;margin-bottom:4px}
.callout{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:13px 14px;
  color:var(--ink-2);font-size:13.5px;line-height:1.45;margin-top:auto}
.callout b{color:var(--ink);font-weight:800}
.minirow{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.ministat{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:13px 14px}
.ministat .n{font-size:24px;font-weight:800;letter-spacing:-.03em;color:var(--primary);line-height:1}
.ministat .l{font-size:12.5px;font-weight:700;color:var(--ink-2);margin-top:4px;line-height:1.25}
.insightbtn{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;margin-top:14px;
  color:var(--primary-d);background:var(--primary-l);border-radius:11px;padding:9px 12px;font-size:13px;
  font-weight:800}
.heatmap{display:grid;grid-template-columns:minmax(120px,1.35fr) repeat(3,1fr);gap:7px;margin-top:2px}
.hmhead,.hmcell,.hmlabel{min-height:42px;border-radius:11px;display:flex;align-items:center}
.hmhead{justify-content:center;font-size:11.5px;font-weight:800;color:var(--ink-3);background:var(--surface-2)}
.hmlabel{font-size:12.5px;font-weight:750;color:var(--ink);line-height:1.2;padding:8px 10px;background:var(--surface-2)}
.hmcell{justify-content:center;font-size:12.5px;font-weight:800;color:var(--ink);background:rgba(91,91,214,var(--a,.08));
  border:1px solid rgba(91,91,214,.08)}
.hmcell button{width:100%;height:100%;border-radius:11px;font-weight:800;color:inherit}

/* ---- stat chips ---- */
.statrow{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:15px 16px;box-shadow:var(--shadow)}
.stat .v{font-size:26px;font-weight:800;letter-spacing:-.03em;color:var(--primary)}
.stat .l{font-size:12.5px;font-weight:600;color:var(--ink-2);margin-top:2px}
.stat.green .v{color:var(--green)}
.stat.coral .v{color:var(--coral-d)}

/* ---- horizontal animated bars (tactics, resources) ---- */
.bars{display:flex;flex-direction:column;gap:13px}
.barrow{display:grid;grid-template-columns:1fr;gap:5px}
.barrow .blabel{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:14px}
.barrow .bname{font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px;min-width:0}
.barrow .bname span.txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.barrow .bpct{font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums;flex:none}
.bartrack{height:11px;background:var(--surface-2);border-radius:8px;overflow:hidden}
.barfill{height:100%;width:0;border-radius:8px;background:var(--primary);
  transition:width 1s var(--ease)}
.grown .barfill{width:var(--w)}

/* ---- score distribution ---- */
.dist{height:370px;min-height:370px;width:100%;position:relative;margin-top:6px}
.dist svg{display:block;width:100%;height:100%;overflow:visible}
.dist .dbase{stroke:var(--border-2);stroke-width:1}
.dist .dbar{transform-box:fill-box;transform-origin:center bottom;transform:scaleY(0);transition:transform .9s var(--ease)}
.dist.grown .dbar{transform:scaleY(1)}
.dist .dbar.all{fill:#d7d8e7}
.dist .dbar.inband{fill:url(#distGrad)}
.dist .dlabel{fill:var(--ink-3);font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
.dist .dlabel.inband{fill:var(--primary-d)}
.dist .dcount{fill:var(--ink-2);font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}
.distnote{font-size:13px;color:var(--ink-2);margin-top:10px;display:flex;align-items:center;gap:8px}
.distnote .key{display:inline-block;width:11px;height:11px;border-radius:3px;
  background:linear-gradient(var(--primary),var(--violet))}

/* ---- debrief cards ---- */
.cards{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.card{display:block;text-align:left;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:17px 18px;box-shadow:var(--shadow);
  transition:.2s var(--ease);position:relative;width:100%}
.card:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg);border-color:var(--border-2)}
.card .ctop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.score-badge{display:inline-flex;align-items:baseline;gap:3px;font-weight:800;color:var(--green-d);
  background:var(--green-l);padding:4px 11px;border-radius:30px;font-size:16px;letter-spacing:-.02em;flex:none}
.score-badge small{font-size:10.5px;font-weight:700;opacity:.7}
.card .src{font-size:11.5px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.03em}
.card .ctitle{font-size:15.5px;font-weight:700;line-height:1.32;margin-bottom:11px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .ctags{display:flex;flex-wrap:wrap;gap:6px}
.minichip{font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:20px;
  background:var(--surface-2);border:1px solid var(--border);color:var(--ink-2);
  display:inline-flex;align-items:center;gap:5px}
.minichip .d{width:6px;height:6px;border-radius:50%}
.card .cmeta{font-size:12.5px;color:var(--ink-3);margin-top:11px;display:flex;gap:12px;flex-wrap:wrap}
.card .cmeta b{color:var(--ink-2);font-weight:700}

.morebtn{display:inline-flex;align-items:center;gap:8px;margin-top:18px;font-size:14.5px;
  font-weight:700;color:var(--primary-d);background:var(--primary-l);padding:11px 18px;border-radius:12px;
  transition:.18s var(--ease)}
.morebtn:hover{background:#e3e2fa;transform:translateY(-1px)}

/* tag pills (Maybe Promo / Self Study) */
.tag{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px}
.tag.promo{background:var(--coral-l);color:var(--coral-d)}
.tag.self{background:var(--green-l);color:var(--green-d)}

/* ---- browse-all ---- */
.tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.search{flex:1;min-width:200px;display:flex;align-items:center;gap:9px;background:var(--surface);
  border:1.5px solid var(--border);border-radius:12px;padding:0 14px;height:46px;transition:.16s var(--ease)}
.search:focus-within{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-l)}
.search input{flex:1;border:none;outline:none;background:none;font-size:15px;color:var(--ink);height:100%}
.search svg{color:var(--ink-3);flex:none}
select.pick{height:46px;border:1.5px solid var(--border);border-radius:12px;background:var(--surface);
  padding:0 14px;font-size:14.5px;font-weight:600;color:var(--ink-2);outline:none;cursor:pointer}
select.pick:focus{border-color:var(--primary)}
#browseList{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.empty{padding:34px;text-align:center;color:var(--ink-3);font-size:15px}

/* ---- detail + cohort overlays ---- */
.detail,.cohort{position:fixed;inset:0;z-index:60;background:var(--bg);overflow-y:auto;
  opacity:0;visibility:hidden;transition:opacity .26s var(--ease)}
.detail{z-index:70}
.cohort{z-index:60}
.detail.on,.cohort.on{opacity:1;visibility:visible}
.detail .dinner,.cohort .dinner{transform:translateY(14px);transition:transform .3s var(--ease)}
.detail.on .dinner,.cohort.on .dinner{transform:translateY(0)}
.dtop,.ctopbar{position:sticky;top:0;background:rgba(245,246,251,.85);backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border);z-index:2}
.dtop .wrap,.ctopbar .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.backbtn{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:var(--ink);
  padding:9px 14px 9px 10px;border-radius:11px;transition:.16s var(--ease)}
.backbtn:hover{background:var(--surface)}
.cohorthead{padding:30px 0 18px}
.cohorthead h2{font-size:clamp(24px,4vw,34px);font-weight:800;margin-bottom:8px}
.cohorthead p{color:var(--ink-2);font-size:15.5px;max-width:64ch}
.cohortmeta{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}
.cohortmeta span{font-size:12.5px;font-weight:750;color:var(--ink-2);background:var(--surface);
  border:1px solid var(--border);border-radius:20px;padding:5px 10px}
.cohortinsight{margin-bottom:18px}
.draweranswer{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:22px;box-shadow:var(--shadow);position:relative;overflow:hidden}
.draweranswer::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:var(--drawer,var(--primary))}
.draweranswer .ey{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;
  text-transform:uppercase;letter-spacing:.05em;color:var(--drawer,var(--primary));background:var(--drawer-l,var(--primary-l));
  border-radius:20px;padding:4px 10px;margin-bottom:12px}
.draweranswer h3{font-size:23px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px}
.draweranswer p{font-size:15px;color:var(--ink-2);line-height:1.58;max-width:72ch}
.insightstats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0 18px}
.insightstat{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:13px 14px}
.insightstat .n{font-size:23px;font-weight:800;letter-spacing:-.03em;color:var(--primary);line-height:1}
.insightstat .l{font-size:12px;font-weight:700;color:var(--ink-2);margin-top:4px;line-height:1.25}
.insightgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:stretch}
.insightpanel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:18px;box-shadow:var(--shadow)}
.insightpanel h3{font-size:16px;font-weight:800;margin-bottom:12px}
.takeaways{list-style:none;display:flex;flex-direction:column;gap:11px}
.takeaways li{position:relative;padding-left:24px;font-size:14px;color:var(--ink);line-height:1.5}
.takeaways li::before{content:"";position:absolute;left:5px;top:8px;width:7px;height:7px;border-radius:50%;
  background:var(--drawer,var(--primary))}
.nextmove{margin-top:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:14px;
  padding:14px 16px;font-size:14px;color:var(--ink-2);line-height:1.5}
.nextmove b{color:var(--ink)}
.stackchips{display:flex;flex-wrap:wrap;gap:8px}
.stackchips span{font-size:13px;font-weight:700;color:var(--ink);background:var(--surface-2);
  border:1px solid var(--border);border-radius:20px;padding:6px 11px}
.cohortexamples{margin:18px 0 46px}
.cohortexamples>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:16px;
  cursor:pointer;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:18px 20px;box-shadow:var(--shadow);margin-bottom:14px}
.cohortexamples>summary::-webkit-details-marker{display:none}
.cohortexamples h3{font-size:18px;font-weight:800}
.cohortexamples p{font-size:13.5px;color:var(--ink-2);margin-top:3px}
.cohortexamples .sumicon{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  color:var(--primary-d);background:var(--primary-l);transition:.18s var(--ease);flex:none}
.cohortexamples[open] .sumicon{transform:rotate(180deg)}
.dhero{padding:30px 0 8px}
.dhero .dscore{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px}
.dhero .big{font-size:48px;font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--green-d)}
.dhero .big small{font-size:17px;color:var(--ink-3);font-weight:700;margin-left:4px}
.dhero h1{font-size:clamp(22px,4vw,30px);font-weight:800;margin:6px 0 14px;max-width:24ch}
.dmeta{display:flex;gap:10px;flex-wrap:wrap}
.dmeta .m{font-size:13px;font-weight:600;color:var(--ink-2);background:var(--surface);
  border:1px solid var(--border);border-radius:11px;padding:7px 12px}
.dmeta .m b{color:var(--ink);font-weight:800}
.dsection{margin-top:18px}
.seccompare{display:flex;flex-direction:column;gap:18px}
.cmp{display:grid;grid-template-columns:104px 1fr 38px;gap:14px;align-items:center}
.cmp .cl{font-size:14px;font-weight:700;line-height:1.2}
.cmp .cl small{display:block;font-size:11.5px;font-weight:600;color:var(--ink-3);margin-top:2px}
.cmp .ctrack{position:relative;height:16px;background:var(--surface-2);border-radius:8px}
.cmp .cbar{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:8px;opacity:.95;
  transition:width .9s var(--ease)}
.grown .cmp .cbar{width:var(--w)}
.cmp .ctyp{position:absolute;top:-4px;bottom:-4px;width:2px;background:var(--ink);border-radius:2px;opacity:.42}
.cmp .cscore{font-size:18px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums}
.cmpkey{font-size:12px;color:var(--ink-3);margin-top:16px;display:flex;align-items:center;gap:7px}
.cmpkey i{display:inline-block;width:2px;height:13px;background:var(--ink);opacity:.42;border-radius:2px}
.notelist{list-style:none;display:flex;flex-direction:column;gap:11px}
.notelist li{position:relative;padding-left:24px;font-size:14.5px;color:var(--ink);line-height:1.5}
.notelist li::before{content:"";position:absolute;left:5px;top:8px;width:7px;height:7px;border-radius:50%;
  background:var(--bullet,var(--primary))}
.tacwrap{display:flex;flex-wrap:wrap;gap:8px}
.tacchip{font-size:13px;font-weight:600;padding:6px 12px;border-radius:11px;
  display:inline-flex;align-items:center;gap:7px}
.reslist{display:flex;flex-wrap:wrap;gap:9px}
.reschip{font-size:13.5px;font-weight:600;color:var(--ink);background:var(--surface-2);
  border:1px solid var(--border);border-radius:11px;padding:8px 13px;display:inline-flex;align-items:center;gap:8px}
.reschip .d{width:7px;height:7px;border-radius:50%;background:var(--primary)}

/* ---- section insights (deterministic, per range) ---- */
.secinsights{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px}
.seccard{background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:16px 17px}
.seccard h4{font-size:14.5px;font-weight:800;display:flex;align-items:baseline;gap:7px;margin-bottom:2px}
.seccard h4 .n{font-size:12px;font-weight:700;color:var(--ink-3)}
.seccard .secn{font-size:12px;color:var(--ink-3);margin-bottom:10px}
.seccard .tacwrap{margin-bottom:12px}
.seccard .notelist li{font-size:13.5px}
.seccard .empty2{font-size:13px;color:var(--ink-3);padding:6px 0}
.spark{width:100%;height:320px;min-height:320px}
.timelinecard{padding-bottom:18px}
.timelinegrid{stroke:var(--border);stroke-width:1}
.timelinearea{fill:rgba(91,91,214,.08)}
.timelinepath{fill:none;stroke:var(--primary);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
.timelinepoint{fill:#fff;stroke:var(--primary);stroke-width:4}
.spark .dlabel{fill:var(--ink-3);font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}
.timelabel{font-size:13px;font-weight:800;fill:var(--ink);paint-order:stroke;stroke:#fff;stroke-width:4px}
.origin{display:inline-flex;align-items:center;gap:9px;font-size:15px;font-weight:700;color:#fff;
  background:var(--primary);padding:13px 20px;border-radius:13px;transition:.18s var(--ease);margin-top:4px}
.origin:hover{background:var(--primary-d);transform:translateY(-1px)}

/* ================= EXPLORE: filter toolbar ================= */
.filterbar{position:sticky;top:62px;z-index:20;display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;
  margin-bottom:20px;background:rgba(255,255,255,.9);backdrop-filter:saturate(1.4) blur(10px);
  -webkit-backdrop-filter:saturate(1.4) blur(10px);border:1px solid var(--border);
  border-radius:var(--radius);padding:13px 16px;box-shadow:var(--shadow)}
.fgroup{display:flex;align-items:center;gap:8px;min-width:0}
.flabel{font-size:11px;font-weight:800;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;flex:none}
.chiprow{display:flex;gap:6px;flex-wrap:wrap}
.fchip{font-size:13px;font-weight:700;color:var(--ink-2);background:var(--surface-2);
  border:1.5px solid var(--border);border-radius:20px;padding:6px 12px;transition:.15s var(--ease);white-space:nowrap}
.fchip:hover{border-color:var(--border-2)}
.fchip.on{background:var(--primary-l);border-color:var(--primary);color:var(--primary-d)}
.filterbar select.pick{height:38px;font-size:13.5px;padding:0 11px}
.filterbar .spacer{flex:1;min-width:0}
.fcount{font-size:13px;font-weight:700;color:var(--ink-2);white-space:nowrap}
.fcount b{color:var(--primary-d);font-variant-numeric:tabular-nums}
.freset{font-size:12.5px;font-weight:700;color:var(--ink-2);background:var(--surface-2);
  border:1px solid var(--border);border-radius:10px;padding:7px 12px;flex:none}
.freset:hover{color:var(--ink);border-color:var(--border-2)}

/* ================= generic chart cards + SVG ================= */
.chartgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.chartgrid+.chartgrid{margin-top:16px}
.chartgrid.one{grid-template-columns:1fr}
.chartcard{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px;box-shadow:var(--shadow);display:flex;flex-direction:column;min-height:322px}
.chartcard h3{font-size:16px;font-weight:800;margin-bottom:3px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.chartcard h3 .hint{font-size:12px;font-weight:600;color:var(--ink-3)}
.chartcard .psub{margin-bottom:14px}
.chartbox{width:100%;height:244px;position:relative}
.chartbox.tall{height:300px}
.hbarbox{width:100%;padding-top:4px}
.hbarbox .bars{gap:12px}
.chartbox svg{display:block;width:100%;height:100%;overflow:visible}
.chartempty{display:flex;align-items:center;justify-content:center;min-height:236px;color:var(--ink-3);
  font-size:13.5px;text-align:center;padding:20px;line-height:1.5}
.axis{stroke:var(--border-2);stroke-width:1}
.gridline{stroke:var(--border);stroke-width:1;stroke-dasharray:3 4}
.axlabel{fill:var(--ink-3);font-size:11px;font-weight:700;font-variant-numeric:tabular-nums}
.axtitle{fill:var(--ink-3);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.vbar{transform-box:fill-box;transform-origin:center bottom;transform:scaleY(0);transition:transform .8s var(--ease)}
.grown .vbar{transform:scaleY(1)}
.vcount{fill:var(--ink-2);font-size:11px;font-weight:800;font-variant-numeric:tabular-nums}
.blabel2{fill:var(--ink-2);font-size:11.5px;font-weight:700}
.legend{display:flex;gap:15px;flex-wrap:wrap;margin-top:13px;font-size:12.5px;font-weight:700;color:var(--ink-2)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:11px;height:11px;border-radius:3px;display:inline-block}
.dot{transition:opacity .25s var(--ease)}
.trend{stroke-dasharray:7 5;stroke-width:2.4;fill:none;opacity:.85}

/* ================= score-band jump (plan) ================= */
.bandjump{background:var(--surface-2);border:1px solid var(--border);border-radius:16px;
  padding:18px 20px 16px;margin-top:6px}
.jumprow{display:flex;align-items:center;gap:16px;flex-wrap:nowrap}
.jumpnode{text-align:center;flex:none}
.jumpnode .jn{font-size:27px;font-weight:800;letter-spacing:-.03em;color:var(--ink);line-height:1}
.jumpnode .jl{font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-top:5px}
.jumpnode.target .jn{color:var(--primary-d)}
.jumparrow{flex:1;min-width:64px;position:relative;height:38px;display:flex;align-items:center}
.jumparrow .jtrack{height:8px;width:100%;border-radius:8px;
  background:linear-gradient(90deg,var(--blue),var(--primary),var(--violet))}
.jumparrow .jhead{position:absolute;right:-2px;top:50%;transform:translateY(-50%);
  border-top:6px solid transparent;border-bottom:6px solid transparent;border-left:9px solid var(--violet)}
.jumparrow .jgain{position:absolute;top:-9px;left:50%;transform:translateX(-50%);font-size:12.5px;font-weight:800;
  color:var(--primary-d);background:var(--surface);border:1px solid var(--border-2);border-radius:20px;
  padding:2px 11px;white-space:nowrap}
.bandjump .jnote{font-size:13px;color:var(--ink-2);margin-top:14px;line-height:1.5}
.bandjump .jnote b{color:var(--ink)}

/* ---- about ---- */
.about h2{font-size:26px;font-weight:800;margin-bottom:12px}
.about h3{font-size:16px;font-weight:800;margin:28px 0 8px}
.about p{font-size:15px;color:var(--ink-2);max-width:68ch;margin-bottom:14px;line-height:1.65}
.about a{color:var(--primary-d);font-weight:600}

footer{border-top:1px solid var(--border);margin-top:40px;padding:30px 0 50px;color:var(--ink-3);font-size:13.5px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{color:var(--ink-2);font-weight:600}

.hidden{display:none!important}

/* ---- mobile ---- */
@media(max-width:760px){
  .wrap{padding:0 16px}
  .bar .wrap{gap:6px}
  .logo{font-size:17px}
  .nav{gap:4px}
  .nav button{font-size:13px;padding:7px 10px}
  .navfull{display:none}
  .navshort{display:inline}
  .about{padding-left:20px;padding-right:20px}
  .hero{padding:34px 0 8px}
  .qopts{grid-template-columns:1fr 1fr}
  .planhead .ptop{flex-direction:column}
  .primaryrec{grid-template-columns:1fr;padding:18px}
  .primaryrec .actbtn{width:100%}
  .evidence>summary{padding:18px}
  .evidencebody{padding:18px 0 0}
  .bands{grid-template-columns:1fr;gap:11px;max-width:440px}
  .band{padding:16px 17px}
  .band .bblurb{min-height:0}
  .band .barrow{opacity:1;transform:none}
  .actiongrid{grid-template-columns:1fr;gap:12px}
  .actioncard{min-height:0}
  .signalgrid{grid-template-columns:1fr;gap:12px}
  .statrow{grid-template-columns:1fr 1fr;gap:10px}
  .insightstats{grid-template-columns:1fr 1fr}
  .insightgrid{grid-template-columns:1fr}
  .grid2{grid-template-columns:1fr}
  .grid2>.panel{min-height:0;height:auto}
  .secinsights{grid-template-columns:1fr}
  .cards,#browseList{grid-template-columns:1fr}
  .dist{height:310px;min-height:310px}
  .heatmap{grid-template-columns:minmax(104px,1.1fr) repeat(3,1fr);gap:5px}
  .hmhead,.hmcell,.hmlabel{min-height:38px}
  .hmhead{font-size:10px}
  .hmlabel,.hmcell{font-size:11px}
  section.block{padding:26px 0}
  .panel{padding:18px}
  .dhero .big{font-size:40px}
  .spark{height:250px;min-height:250px}
  .chartgrid{grid-template-columns:1fr;gap:12px}
  .chartcard{min-height:0;padding:16px}
  .chartbox{height:210px}
  .chartbox.tall{height:248px}
  .filterbar{position:static;padding:12px 13px;gap:10px 12px}
  .filterbar .fgroup{width:100%;flex-wrap:wrap}
  .filterbar .flabel{width:100%}
  .filterbar .spacer{display:none}
  .filterbar select.pick{flex:1;min-width:120px}
  .bandjump{padding:15px 14px 14px}
  .jumprow{gap:8px}
  .jumpnode .jn{font-size:15px;white-space:nowrap}
  .jumpnode .jl{font-size:9px}
  .jumparrow{min-width:38px;height:30px}
  .jumparrow .jgain{font-size:10px;padding:1px 7px}
  .legend{gap:11px;font-size:11.5px}
}
@media(prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important;scroll-behavior:auto!important}
  .barfill,.dist .dbar,.cmp .cbar,.vbar{transition:none!important}
}
</style></head>
<body>
<header class="bar"><div class="wrap">
  <a class="logo" href="?" onclick="goHome(event)">Prep<b>Signals</b><span class="dot"></span></a>
  <nav class="nav">
    <button id="nav-plan" class="on" onclick="showView('plan')"><span class="navfull">My Score Path</span><span class="navshort">Path</span></button>
    <button id="nav-explore" onclick="showView('explore')"><span class="navfull">Explore the data</span><span class="navshort">Explore</span></button>
    <button id="nav-about" onclick="showView('about')">About</button>
  </nav>
</div></header>

<main id="view-plan">
  <div class="wrap">
    <section class="hero">
      <span class="eyebrow"><span class="pulse"></span>__NDEB__ real GMAT debriefs</span>
      <h1>Find your score path from people who got there</h1>
      <p class="lede">Answer four quick questions. We match you to debriefs from people who started near your level and reached your target.</p>
    </section>
    <div class="quiz" id="quiz"></div>
    <div id="planResult"></div>
  </div>
</main>

<main id="view-explore" class="hidden">
  <div class="wrap">
    <section class="hero" style="padding:44px 0 4px">
      <span class="eyebrow"><span class="pulse"></span>__NDEB__ real GMAT debriefs</span>
      <h1>Explore the data</h1>
      <p class="lede">Every debrief, visualised. Filter by score band, source, and resource to see how scores, sections, prep time, and tactics move together.</p>
    </section>
  </div>

  <div class="wrap">
    <div class="filterbar" id="filterbar"></div>
    <div class="statrow" id="xstat"></div>

    <div class="chartgrid">
      <div class="chartcard">
        <h3>Score distribution <span class="hint" id="xdistHint"></span></h3>
        <p class="psub">Official total score across the filtered set.</p>
        <div class="chartbox" id="xdist"></div>
      </div>
      <div class="chartcard">
        <h3>Where each tier is weakest</h3>
        <p class="psub">Median Q / V / DI score within each target band.</p>
        <div class="chartbox" id="xsection"></div>
        <div class="legend" id="xsectionLeg"></div>
      </div>
    </div>

    <div class="chartgrid">
      <div class="chartcard">
        <h3>How big a jump is realistic?</h3>
        <p class="psub">Start-to-official point gain, where a start score was reported.</p>
        <div class="chartbox" id="xgain"></div>
      </div>
      <div class="chartcard">
        <h3>Most-used resources</h3>
        <p class="psub">Share of debriefs naming each — popularity, not proof of effectiveness.</p>
        <div class="hbarbox" id="xres"></div>
      </div>
    </div>

    <div class="chartgrid">
      <div class="chartcard">
        <h3>Prep time vs score gain</h3>
        <p class="psub">Each dot is a debrief; the dashed line is the overall trend.</p>
        <div class="chartbox tall" id="xscatter"></div>
      </div>
      <div class="chartcard">
        <h3>Does more prep time help?</h3>
        <p class="psub">Median total score by weeks of prep.</p>
        <div class="chartbox" id="xprep"></div>
      </div>
    </div>

    <div class="chartgrid one">
      <div class="chartcard">
        <h3>Tactic adoption by score band <span class="hint">tap a cell for examples</span></h3>
        <p class="psub">Share of each band that mentions a recurring tactic.</p>
        <div class="heatmap" id="xheat" style="margin-top:4px"></div>
      </div>
    </div>

    <section class="block" id="xbrowse">
      <div class="shead"><div>
        <h2>Browse the filtered debriefs</h2>
        <p class="sub" id="xbrowseSub"></p>
      </div></div>
      <div id="xbrowseList" class="cards"></div>
      <div class="empty hidden" id="xbrowseEmpty">No debriefs match these filters. Use Reset above to clear them.</div>
      <button class="morebtn hidden" id="xbrowseMore" onclick="xShowMore()">Show more <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </section>
  </div>
</main>

<section id="view-about" class="hidden"><div class="wrap about" style="padding-top:42px;padding-bottom:42px">
  <h2>About PrepSignals</h2>
  <p>PrepSignals turns hundreds of real GMAT debriefs into a simple question: <b>what did people who hit your target score actually do?</b> Answer four quick questions on My Score Path, or pick a score range under Explore the Data to see the tactics that show up most, the resources people leaned on, and the individual stories behind every number.</p>
  <h3>Where the data comes from</h3>
  <p>Every debrief links back to its original public post on Reddit's r/GMAT and GMAT Club. We only summarise — the source is always one tap away so you can read it in full and judge for yourself.</p>
  <h3>Independence</h3>
  <p>PrepSignals is independent and isn't affiliated with GMAC, any prep company, or any course. Resources are named because the original posters named them, not because anyone paid to appear. Debriefs that read like promotions are flagged "Maybe Promo" so you can weigh them.</p>
  <h3>Privacy</h3>
  <p>No accounts, no login, no backend. Your four answers on My Score Path are saved only in your own browser's local storage so a return visit skips the questions — nothing is sent to a server, and nothing identifies you. We use Vercel's privacy-friendly aggregate analytics to see which paths and stories are useful.</p>
  <h3>Feedback</h3>
  <p>If you want to see more features, notice something wrong, or have feedback, please email <a href="mailto:prepsignals@gmail.com">prepsignals@gmail.com</a>.</p>
  <p>If you are the author of a post represented in this project and want it removed or corrected, contact <a href="mailto:prepsignals@gmail.com">prepsignals@gmail.com</a>.</p>
  <p style="margin-top:18px;color:var(--ink-3)">Data spans __MINDATE__ to __MAXDATE__.</p>
</div></section>

<div class="detail" id="detail"><div class="dinner">
  <div class="dtop"><div class="wrap">
    <button class="backbtn" onclick="closeDebrief()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M19 12H5M11 18l-6-6 6-6"/></svg> Back</button>
    <a class="logo" href="?" onclick="goHome(event)" style="font-size:17px">Prep<b>Signals</b><span class="dot"></span></a>
  </div></div>
  <div class="wrap" id="detailBody"></div>
</div></div>

<div class="cohort" id="cohort"><div class="dinner">
  <div class="ctopbar"><div class="wrap">
    <button class="backbtn" onclick="closeCohort()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M19 12H5M11 18l-6-6 6-6"/></svg> Back</button>
    <a class="logo" href="?" onclick="goHome(event)" style="font-size:17px">Prep<b>Signals</b><span class="dot"></span></a>
  </div></div>
  <div class="wrap">
    <div class="cohorthead">
      <h2 id="cohortTitle"></h2>
      <p id="cohortSub"></p>
      <div class="cohortmeta" id="cohortMeta"></div>
    </div>
    <div class="cohortinsight hidden" id="cohortInsight"></div>
    <details class="cohortexamples" id="cohortExamples">
      <summary>
        <div><h3 id="cohortExamplesTitle">Example debriefs</h3><p id="cohortExamplesSub"></p></div>
        <span class="sumicon"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <div class="cards" id="cohortCards"></div>
    </details>
  </div>
</div></div>

<footer><div class="wrap">
  <span>PrepSignals — independent GMAT debrief signal. Not affiliated with GMAC.</span>
  <span><a href="#" onclick="showView('about');return false">About &amp; sources</a></span>
</div></footer>

<script>
const DEB=__DEB__, DETAILS=__DETAILS__, BANDS=__BANDS__, CURB=__CURB__, WEEKB=__WEEKB__, GAINB=__GAINB__, PREPB=__PREPB__, TT=__TOOLTIPS__;
const RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const BANDC={b1:{c:'var(--blue)',d:'var(--blue)',l:'var(--blue-l)'},
            b2:{c:'var(--primary)',d:'var(--primary-d)',l:'var(--primary-l)'},
            b3:{c:'var(--violet)',d:'var(--violet)',l:'var(--violet-l)'}};
const FOCUS=[
  {key:'q',label:'Quant',sub:'Math accuracy, speed, or concepts',sec:'q'},
  {key:'v',label:'Verbal',sub:'CR, RC, or answer-choice traps',sec:'v'},
  {key:'di',label:'Data Insights',sub:'DS, tables, graphs, or MSR',sec:'di'},
  {key:'timing',label:'Timing / test day',sub:'Pacing, stamina, or execution',sec:null},
  {key:'unsure',label:'Not sure',sub:'Use the cohort signal',sec:null},
];
const MIN_PEERS=6;
const LS_KEY='ps_plan_v1';
let state={band:'b2',focus:'auto'};
let plan={cur:null,tgt:null,wk:null,focus:null};
let showIntakeForm=true;
let exploreInit=false;

function track(name,props){try{if(typeof window.va==='function')window.va('event',{name,data:props||{}});}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function inBand(d,b){return d.total!=null&&d.total>=b.lo&&d.total<=b.hi;}
function bandOf(key){return BANDS.find(b=>b.key===key);}
function curBucketOf(key){return CURB.find(c=>c.key===key);}
function wkBucketOf(key){return WEEKB.find(w=>w.key===key);}
function focusOf(key){return FOCUS.find(f=>f.key===key)||FOCUS.find(f=>f.key==='unsure');}
function debsIn(b){return DEB.filter(d=>inBand(d,b));}
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function pct(n,d){return d?Math.round(100*n/d):0;}
function fmt(v){return v==null?'—':(Number.isInteger(v)?String(v):String(Math.round(v*10)/10));}
function sampleText(n,label){return `<span><b>${n}</b> ${label||'debriefs'}</span>`;}
function richScore(d){
  const det=DETAILS[d.id]||{};
  const notes=(det.overall||[]).length+Object.values(det.sections||{}).reduce((a,x)=>a+x.length,0);
  return (d.strat||[]).length*1.5+notes+Math.min(d.nreplies||0,20)*0.3+(d.gain?2:0)+(d.prep_weeks?1:0);
}
function countBy(rows,fn){
  const out={};rows.forEach(d=>(fn(d)||[]).forEach(k=>{if(k)out[k]=(out[k]||0)+1;}));
  return Object.entries(out).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function topStrats(rows,sec,limit){
  return countBy(rows,d=>(d.strat||[]).map(parseStrat).filter(p=>p.sec===sec).map(p=>p.label)).slice(0,limit||5);
}
function topResources(rows,limit){return countBy(rows,d=>d.resources||[]).slice(0,limit||6);}
function sectionMedians(rows){
  return {q:median(rows.map(d=>d.q).filter(x=>x!=null)),
    v:median(rows.map(d=>d.v).filter(x=>x!=null)),
    di:median(rows.map(d=>d.di).filter(x=>x!=null))};
}
function sectionLabel(k){return k==='q'?'Quant':k==='v'?'Verbal':'Data Insights';}
function sectionShort(k){return k==='q'?'Q':k==='v'?'V':'DI';}
function sectionCode(k){return k==='q'?'Q':k==='v'?'V':'DI';}
function weakestSection(rows){
  const m=sectionMedians(rows),pairs=Object.entries(m).filter(([,v])=>v!=null);
  if(!pairs.length)return null;
  pairs.sort((a,b)=>a[1]-b[1]);
  return {key:pairs[0][0],name:sectionLabel(pairs[0][0]),score:Math.round(pairs[0][1])};
}
function rowsForSection(rows,key){
  const prefix=key==='q'?'Q':key==='v'?'V':'DI';
  return rows.filter(d=>d[key]!=null||((d.strat||[]).some(s=>s.startsWith(prefix+':'))));
}
function rowsForStrat(rows,sec,label){
  const prefix=sec==='G'?'General':sec;
  return rows.filter(d=>(d.strat||[]).includes(prefix+': '+label));
}
function bestExamples(rows,n){return rows.slice().sort((a,b)=>richScore(b)-richScore(a)||(b.total||0)-(a.total||0)).slice(0,n||6);}

/* ---- deterministic per-section insights: top tactics + representative verbatim notes ----
   `exclude` is shared across Q/V/DI within one render pass: some source posts repeat the same
   sentence across multiple section-note arrays, so without this a single duplicated line could
   surface as the "representative quote" for two different sections. */
function sectionQuotes(rows,secCode,limit,exclude){
  const seen=new Set(),out=[];
  rows.slice().sort((a,b)=>richScore(b)-richScore(a)).forEach(d=>{
    if(out.length>=(limit||3)||seen.has(d.id))return;
    const notes=(DETAILS[d.id]&&DETAILS[d.id].sections&&DETAILS[d.id].sections[secCode])||[];
    const pick=notes.find(n=>!exclude.has(n));
    if(!pick)return;
    seen.add(d.id);exclude.add(pick);out.push({id:d.id,text:pick});
  });
  return out;
}
function sectionInsight(rows,key,exclude){
  const secCode=sectionCode(key),med=sectionMedians(rows)[key];
  const withNotes=rows.filter(d=>((DETAILS[d.id]&&DETAILS[d.id].sections&&DETAILS[d.id].sections[secCode])||[]).length).length;
  return{key,name:sectionLabel(key),med,top:topStrats(rows,secCode,3),quotes:sectionQuotes(rows,secCode,3,exclude),withNotes};
}
function overallQuotes(rows,limit){
  const seen=new Set(),out=[];
  rows.slice().sort((a,b)=>richScore(b)-richScore(a)).forEach(d=>{
    if(out.length>=(limit||3)||seen.has(d.id))return;
    const notes=(DETAILS[d.id]&&DETAILS[d.id].overall)||[];
    const pick=notes.find(n=>n&&!out.some(q=>q.text===n));
    if(!pick)return;
    seen.add(d.id);out.push({id:d.id,text:pick});
  });
  return out;
}
function topParsedStrats(rows,predicate,limit){
  return countBy(rows,d=>(d.strat||[]).map(parseStrat).filter(predicate).map(p=>p.sec+'|'+p.label))
    .slice(0,limit||5).map(([k,n])=>{const i=k.indexOf('|');return {sec:k.slice(0,i),label:k.slice(i+1),n};});
}
function rowsForParsed(rows,item){return item?rowsForStrat(rows,item.sec,item.label):rows;}
const SECCOL={q:['--blue','--blue-l'],v:['--violet','--violet-l'],di:['--amber','--amber-l']};
function renderSectionInsights(containerId,rows){
  const el=document.getElementById(containerId);if(!el)return;
  const exclude=new Set();
  el.innerHTML=['q','v','di'].map(key=>{
    const ins=sectionInsight(rows,key,exclude),[c,cl]=SECCOL[key];
    const tacHTML=ins.top.length?`<div class="tacwrap">${ins.top.map(([t,n])=>
      `<span class="tacchip" style="background:var(${cl});color:var(${c})">${esc(t)} <b>${pct(n,rows.length)}%</b></span>`).join('')}</div>`:'';
    const quoteHTML=ins.quotes.length?`<ul class="notelist" style="--bullet:var(${c})">${ins.quotes.map(q=>`<li>${esc(q.text)}</li>`).join('')}</ul>`
      :`<div class="empty2">Not enough detailed notes for ${esc(ins.name)} in this range yet.</div>`;
    return `<div class="seccard">
      <h4 style="color:var(${c})">${esc(ins.name)}${ins.med!=null?`<span class="n">typical ${Math.round(ins.med)}</span>`:''}</h4>
      <div class="secn">${ins.withNotes} of ${rows.length} debriefs have detailed ${esc(ins.name)} notes</div>
      ${tacHTML}${quoteHTML}
    </div>`;
  }).join('');
}
function activeFocusKey(rows){
  if(['q','v','di'].includes(state.focus))return state.focus;
  const weak=weakestSection(rows);
  return weak&&weak.key?weak.key:'di';
}

/* strategy item "DI: DI targeted practice" -> {sec:'DI', label:'DI targeted practice'} */
function parseStrat(s){const i=s.indexOf(':');if(i<0)return{sec:'G',label:s};
  let sec=s.slice(0,i).trim(),label=s.slice(i+1).trim();
  if(sec==='General')sec='G'; if(!['Q','V','DI','G'].includes(sec))sec='G';
  return{sec,label};}
const SECNAME={Q:'Quant',V:'Verbal',DI:'Data',G:'General'};

/* ================= YOUR PLAN (personalized) ================= */
function loadPlanLS(){
  try{const raw=localStorage.getItem(LS_KEY);if(!raw)return null;
    const o=JSON.parse(raw);
    if(o&&CURB.find(c=>c.key===o.cur)&&BANDS.find(b=>b.key===o.tgt)&&WEEKB.find(w=>w.key===o.wk)){
      return {cur:o.cur,tgt:o.tgt,wk:o.wk,focus:FOCUS.find(f=>f.key===o.focus)?o.focus:'unsure'};
    }
  }catch(e){}
  return null;
}
function savePlanLS(){try{localStorage.setItem(LS_KEY,JSON.stringify({cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus||'unsure'}));}catch(e){}}

function peersFor(tgtKey,curKey){
  const b=bandOf(tgtKey),rows=debsIn(b),cur=curBucketOf(curKey);
  let peers=cur?rows.filter(d=>d.start!=null&&d.start>=cur.lo&&d.start<=cur.hi):[];
  const matched=peers.length>=MIN_PEERS;
  if(!matched)peers=rows;
  return{rows,peers,matched};
}
function paceNote(peers,wk){
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null);
  if(!prep.length)return null;
  const med=median(prep);
  if(wk.hi<med*0.7)return `Your timeline (<b>${esc(wk.label)}</b>) is tighter than the median <b>${fmt(med)}w</b> prep in this cohort — lean on official mocks and the resource stack below rather than broad review.`;
  if(wk.lo>med*1.5)return `You have more runway than the median <b>${fmt(med)}w</b> prep in this cohort — a good case for deeper section-by-section work instead of a sprint.`;
  return `Your timeline lines up with the median <b>${fmt(med)}w</b> prep reported in this cohort.`;
}
function selectedSectionKey(peers){
  const f=focusOf(plan.focus);
  if(f&&f.sec)return f.sec;
  const weak=weakestSection(peers);
  return weak?weak.key:'di';
}
function primaryRecommendation(peers,wk){
  const f=focusOf(plan.focus),weak=weakestSection(peers),genTop=topStrats(peers,'G',1)[0];
  if(f.key==='timing'){
    const label=genTop?genTop[0]:'timed review loop';
    return {
      h:'Tighten your timed review loop',
      p:`You said timing or test day feels hardest. Make the next block about timed sets, official-mock review, and move-on rules before adding broad content review.${weak?` Keep ${weak.name} as your checkpoint because it is the lowest median split in this cohort.`:''}`,
      m:genTop?`<b>${pct(genTop[1],peers.length)}%</b> of matching debriefs mention ${esc(label)}.`:`Use the insight drawer examples to copy concrete pacing rules.`,
      a:'Open timing insight',
      kind:'timing'
    };
  }
  const secKey=selectedSectionKey(peers),secName=sectionLabel(secKey),top=topStrats(peers,sectionCode(secKey),1)[0];
  const because=f.sec
    ?`You said ${secName} feels hardest, so start there even if another section also looks noisy.`
    :weak?`${weak.name} is the lowest median split among debriefs like yours.`
      :'The cohort does not have enough complete section splits, so start with one section at a time.';
  return {
    h:`Start with ${secName}`,
    p:`${because} Use your next study block to sort misses by concept, timing, and careless errors, then drill the pattern that repeats.`,
    m:top?`<b>${pct(top[1],peers.length)}%</b> of matching debriefs mention ${esc(top[0])}.`:`<b>${rowsForSection(peers,secKey).length}</b> matching examples include ${esc(secName)} details.`,
    a:`Open ${secName} insight`,
    kind:'section'
  };
}

function pickPlan(field,key){plan[field]=key;renderQuiz();}
function renderQuiz(){
  const el=document.getElementById('quiz');
  const match=(plan.tgt&&plan.cur)?peersFor(plan.tgt,plan.cur):null;
  el.innerHTML=`
    <div class="qgroup">
      <div class="qtitle"><span class="qn">1</span> Where are you scoring now?</div>
      <div class="qsub">Your most recent practice test or diagnostic total.</div>
      <div class="qopts">${CURB.map(c=>`<button type="button" class="qopt ${plan.cur===c.key?'on':''}" onclick="pickPlan('cur','${c.key}')"><div class="ol">${esc(c.label)}</div><div class="os">${esc(c.name||'')}</div></button>`).join('')}</div>
    </div>
    <div class="qgroup">
      <div class="qtitle"><span class="qn">2</span> What score are you aiming for?</div>
      <div class="qsub">Pick the band you are targeting.</div>
      <div class="qopts">${BANDS.map(b=>`<button type="button" class="qopt ${plan.tgt===b.key?'on':''}" onclick="pickPlan('tgt','${b.key}')"><div class="ol">${esc(b.label)}</div><div class="os">${esc(b.name)}</div></button>`).join('')}</div>
    </div>
    <div class="qgroup">
      <div class="qtitle"><span class="qn">3</span> How long until test day?</div>
      <div class="qsub">Roughly — this only shapes pacing advice, not the target.</div>
      <div class="qopts">${WEEKB.map(w=>`<button type="button" class="qopt ${plan.wk===w.key?'on':''}" onclick="pickPlan('wk','${w.key}')"><div class="ol">${esc(w.label)}</div></button>`).join('')}</div>
    </div>
    <div class="qgroup">
      <div class="qtitle"><span class="qn">4</span> What feels hardest right now?</div>
      <div class="qsub">This decides the first recommendation. Pick Not sure if you want the data to choose.</div>
      <div class="qopts">${FOCUS.map(f=>`<button type="button" class="qopt ${plan.focus===f.key?'on':''}" onclick="pickPlan('focus','${f.key}')"><div class="ol">${esc(f.label)}</div><div class="os">${esc(f.sub)}</div></button>`).join('')}</div>
    </div>
    ${match?`<div class="quizmatch">${match.matched?`<b>${match.peers.length}</b> debriefs closely match this so far.`:`Not many exact matches yet — we will use the full ${esc(bandOf(plan.tgt).label)} band (<b>${match.rows.length}</b> debriefs) instead.`}</div>`:''}
    <div class="quizsubmit-wrap">
      <button type="button" class="quizsubmit" id="quizSubmit" ${(plan.cur&&plan.tgt&&plan.wk&&plan.focus)?'':'disabled'} onclick="submitPlan()">Show my score path
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>`;
}
function submitPlan(){
  if(!(plan.cur&&plan.tgt&&plan.wk&&plan.focus))return;
  savePlanLS();showIntakeForm=false;
  history.replaceState({},'', '?p='+plan.cur+'-'+plan.tgt+'-'+plan.wk+'-'+plan.focus);
  track('intake_submit',{cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus});
  renderPlanView();
  scrollTo({top:0,behavior:RM?'auto':'smooth'});
}
function editPlan(){showIntakeForm=true;track('intake_edit',{});renderPlanView();}

function renderPlanView(){
  const q=document.getElementById('quiz'),r=document.getElementById('planResult');
  if(!plan.cur||!plan.tgt||!plan.wk||!plan.focus||showIntakeForm){
    q.classList.remove('hidden');renderQuiz();r.innerHTML='';
  }else{
    q.classList.add('hidden');renderPlanResult();
  }
}
function renderPlanResult(){
  const{rows,peers,matched}=peersFor(plan.tgt,plan.cur);
  const b=bandOf(plan.tgt),cur=curBucketOf(plan.cur),wk=wkBucketOf(plan.wk);
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null),gains=peers.map(d=>d.gain).filter(x=>x!=null);
  const pace=paceNote(peers,wk),focus=focusOf(plan.focus),rec=primaryRecommendation(peers,wk);
  const curShort=cur.label.replace(' – ','-'),targetShort=b.label.replace(' – ','-');
  const wkShort=wk.label.replace('Less than 4 weeks','<4w').replace('13+ weeks','13w+').replace(/ – /g,'-').replace(' weeks','w');
  const stats=[
    {v:curShort,l:'current range',cls:''},
    {v:targetShort,l:'target range',cls:'green'},
    {v:wkShort,l:'timeline',cls:''},
    {v:peers.length,l:matched?'closest matches':'band-wide sample',cls:'coral'},
  ];
  // score-band jump framing: how the current bucket reaches the target band
  const startersCur=DEB.filter(d=>d.start!=null&&cur&&d.start>=cur.lo&&d.start<=cur.hi);
  const reachedTgt=startersCur.filter(d=>inBand(d,b));
  const reachPct=startersCur.length>=5?pct(reachedTgt.length,startersCur.length):null;
  const pStart=peers.map(d=>d.start).filter(x=>x!=null),pTot=peers.map(d=>d.total).filter(x=>x!=null);
  const medStart=pStart.length?Math.round(median(pStart)):null,medTot=pTot.length?Math.round(median(pTot)):null;
  const medGain=gains.length?Math.round(median(gains)):null,medPrep=prep.length?fmt(median(prep)):null;
  let jnote='';
  if(reachPct!=null)jnote+=`Of <b>${startersCur.length}</b> debriefs that started in ${esc(cur.label)}, <b>${reachPct}%</b> reached ${esc(b.label)}. `;
  if(medStart&&medTot)jnote+=`In your cohort the typical path was <b>${medStart} → ${medTot}</b>${medGain?` (+${medGain})`:''}${medPrep?` over <b>${medPrep}w</b>`:''}.`;
  if(!jnote)jnote=`Few debriefs report a start score for ${esc(cur.label)} yet — use the ${esc(b.label)} score-band insights below as your guide.`;

  document.getElementById('planResult').innerHTML=`
    <div class="planhead">
      <div class="ptop">
        <div><h2>Path summary: ${esc(cur.label)} &rarr; ${esc(b.label)}</h2>
          <p>Built from ${matched?`<b>${peers.length}</b> debriefs that started around your level and reached ${esc(b.label)}`:`the full ${esc(b.label)} band — not enough close starting-score matches yet, so this is band-wide`}. Your first focus: <b>${esc(focus.label)}</b>.</p>
          ${!matched?`<span class="matchflag">Band-wide data — few exact starting-score matches</span>`:''}
        </div>
        <button class="editlink" type="button" onclick="editPlan()">Change my answers</button>
      </div>
      <div class="statrow" style="margin-top:18px">${stats.map(s=>`<div class="stat ${s.cls}"><div class="v">${s.v}</div><div class="l">${s.l}</div></div>`).join('')}</div>
      <div class="bandjump">
        <div class="jumprow">
          <div class="jumpnode"><div class="jn">${esc(cur.label)}</div><div class="jl">You now</div></div>
          <div class="jumparrow"><div class="jtrack"></div><div class="jhead"></div>${medGain?`<div class="jgain">+${medGain} typical</div>`:''}</div>
          <div class="jumpnode target"><div class="jn">${esc(b.label)}</div><div class="jl">Target</div></div>
        </div>
        <div class="jnote">${jnote}</div>
      </div>
      ${pace?`<div class="pacecall">${pace}</div>`:''}
    </div>
    <section class="primaryrec" id="doFirst">
      <div>
        <span class="ey">Do this first</span>
        <h3>${esc(rec.h)}</h3>
        <p>${rec.p}</p>
        <div class="metric">${rec.m}</div>
      </div>
      <button class="actbtn" type="button" onclick="handlePlanAction('${rec.kind}')">${esc(rec.a)}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </section>
    <section class="block" id="planLevers">
      <div class="shead"><div><h2>Your 3 levers</h2><p class="sub">Use these as the working plan: one section focus, one practice loop, and one resource stack, each summarized before the example debriefs.</p></div></div>
      <div class="actiongrid" id="planActions"></div>
    </section>
    <section class="block" id="planSignals">
      <div class="shead"><div><h2>What the debriefs are telling you</h2><p class="sub">Three signals from the matched cohort, summarized before you read individual stories.</p></div></div>
      <div class="signalgrid" id="planSignalsGrid"></div>
    </section>
    <details class="evidence" id="planEvidence">
      <summary>
        <div><h2>Example debriefs</h2>
          <p class="sumsub">Optional supporting stories closest to your starting point, target, and timeline.</p></div>
        <span class="sumicon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <div class="evidencebody">
        <div class="cards" id="planCards"></div>
        <button class="morebtn" onclick="openTargetExplore()">Explore ${esc(b.label)} data <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </div>
    </details>
    <details class="evidence" id="planAnalytics">
      <summary>
        <div><h2>Explore the evidence</h2>
          <p class="sumsub">Target-band charts from all <b>${rows.length}</b> ${esc(b.label)} debriefs. Open this when you want the deeper data behind the path.</p></div>
        <span class="sumicon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <div class="evidencebody">
        <section class="block" id="planInsights" style="padding-top:0">
          <div class="shead"><div><h2>Section evidence</h2><p class="sub" id="planInsSub"></p></div></div>
          <div class="secinsights" id="planSecInsights"></div>
        </section>
        <section class="block" style="padding-top:0">
          <div class="shead"><div><h2>Inside the ${esc(b.label)} range</h2>
            <p class="sub">Score-band insights from all <b>${rows.length}</b> debriefs at your target — where scores land, section balance, resources, and tactic adoption.</p></div></div>
          <div class="panel">
            <h3>Where scores land <span class="hint">your target band highlighted</span></h3>
            <div class="chartbox" id="planDist" style="margin-top:8px"></div>
          </div>
          <div class="grid2" style="margin-top:16px">
            <div class="panel insightcard">
              <h3>Typical section split</h3>
              <p class="psub">Median Q / V / DI among ${esc(b.label)} debriefs with complete splits.</p>
              <div class="seccompare growfill" id="planSplit" style="margin-top:4px"></div>
              <div class="callout" id="planSplitCall"></div>
            </div>
            <div class="panel insightcard">
              <h3>What they studied with</h3>
              <p class="psub">Most-named resources in this range — popularity, not proof.</p>
              <div class="growfill" id="planRes"></div>
            </div>
          </div>
          <div class="grid2" style="margin-top:16px">
            <div class="panel insightcard">
              <h3>Prep &amp; gain context</h3>
              <p class="psub">Only some debriefs report these, so treat them as planning bounds.</p>
              <div class="minirow" id="planPrep"></div>
            </div>
            <div class="panel insightcard">
              <h3>Tactic adoption by band <span class="hint">tap a cell for examples</span></h3>
              <p class="psub">How often each recurring tactic shows up across score bands.</p>
              <div class="heatmap growfill" id="planHeat"></div>
            </div>
          </div>
        </section>
      </div>
    </details>`;
  renderPlanActions(peers,b);
  renderPlanSignals(peers,b);
  document.getElementById('planInsSub').innerHTML=`Aggregated from the same <b>${peers.length}</b> debriefs behind your plan — no need to open each one individually.`;
  renderSectionInsights('planSecInsights',peers);
  renderPlanAnalytics();
  document.getElementById('planCards').innerHTML=bestExamples(peers,6).map(debCardHTML).join('');
  track('plan_view',{cur:plan.cur,tgt:plan.tgt,wk:plan.wk,focus:plan.focus,matched,sample:peers.length});
}
function planAnalyticsShown(){
  return !!(plan.cur&&plan.tgt&&plan.wk&&plan.focus&&!showIntakeForm&&document.getElementById('planDist')
    &&!document.getElementById('view-plan').classList.contains('hidden'));
}
function renderPlanAnalytics(){
  if(!plan.tgt)return;
  const b=bandOf(plan.tgt),rows=debsIn(b);
  if(document.getElementById('planDist'))paint('planDist',svgHist(DEB,{highlight:new Set([b.key])}));
  const split=document.getElementById('planSplit');
  if(split){
    const cm={q:'var(--blue)',v:'var(--violet)',di:'var(--amber)'};
    const slo=55,shi=90,sscale=v=>Math.max(2,Math.min(100,Math.round(100*(v-slo)/(shi-slo))));
    const med=sectionMedians(rows),weak=weakestSection(rows);
    split.innerHTML=[['q','Quant'],['v','Verbal'],['di','Data Insights']].map(([k,name])=>{
      const m=med[k]!=null?Math.round(med[k]):null;if(m==null)return '';
      return `<div class="cmp"><div class="cl">${name}</div><div class="ctrack"><div class="cbar" style="--w:${sscale(m)}%;background:${cm[k]}"></div></div><div class="cscore" style="color:${cm[k]}">${m}</div></div>`;}).join('')
      ||'<div class="empty2" style="color:var(--ink-3);font-size:13px">No complete section splits in this range.</div>';
    if(!RM)requestAnimationFrame(()=>split.classList.add('grown'));else split.classList.add('grown');
    const call=document.getElementById('planSplitCall');
    if(call)call.innerHTML=weak?`<b>${weak.name}</b> is the lowest median split in ${esc(b.label)}. Treat it as your first diagnostic checkpoint, not a verdict.`:`Not enough complete section splits to name a bottleneck confidently.`;
  }
  const resEl=document.getElementById('planRes');
  if(resEl){const top=topResources(rows,6);
    paint('planRes',top.length?hBarsHTML(top,rows.length,{color:'var(--amber)'}):'<div class="chartempty" style="height:auto;min-height:0;padding:12px 0">No named resources in this range.</div>');}
  const prepEl=document.getElementById('planPrep');
  if(prepEl){const pp=rows.map(d=>d.prep_weeks).filter(x=>x!=null),gg=rows.map(d=>d.gain).filter(x=>x!=null),aa=rows.map(d=>d.attempts).filter(x=>x!=null),self=rows.filter(d=>(d.tags||[]).includes('Self Study')).length;
    prepEl.innerHTML=[
      ['Median prep',pp.length?fmt(median(pp))+'w':'—',pp.length],
      ['Median gain',gg.length?'+'+fmt(median(gg)):'—',gg.length],
      ['Median attempts',aa.length?fmt(median(aa)):'—',aa.length],
      ['Self-study',self?pct(self,rows.length)+'%':'—',rows.length],
    ].map(([l,n,s])=>`<div class="ministat"><div class="n">${n}</div><div class="l">${l}<br><span style="color:var(--ink-3);font-weight:650">n=${s}</span></div></div>`).join('');}
  const heatEl=document.getElementById('planHeat');
  if(heatEl){
    const cand=countBy(rows,d=>(d.strat||[]).map(parseStrat).map(p=>p.sec+'|'+p.label)).slice(0,isCompact()?4:5)
      .map(([k])=>{const i=k.indexOf('|');return {sec:k.slice(0,i),label:k.slice(i+1)};});
    const cells=['<div class="hmhead"></div>'];
    BANDS.forEach(bd=>cells.push(`<div class="hmhead">${bd.label.replace(' – ','-')}</div>`));
    cand.forEach(item=>{cells.push(`<div class="hmlabel">${esc(item.label)}</div>`);
      BANDS.forEach(bd=>{const br=debsIn(bd),pool=rowsForStrat(br,item.sec,item.label),p=pct(pool.length,br.length),a=Math.max(.06,Math.min(.6,p/100*.9));
        cells.push(`<div class="hmcell" style="--a:${a.toFixed(2)}"><button type="button" onclick='openHeatCohort(${JSON.stringify(item.sec)},${JSON.stringify(item.label)},${JSON.stringify(bd.key)})'>${p}%</button></div>`);});});
    heatEl.innerHTML=cells.join('');
  }
}
function insightStatsHTML(items){
  return `<div class="insightstats">${items.map(x=>`<div class="insightstat"><div class="n">${x.v}</div><div class="l">${esc(x.l)}</div></div>`).join('')}</div>`;
}
function takeawaysHTML(items){
  return `<ul class="takeaways">${items.map(x=>`<li>${x}</li>`).join('')}</ul>`;
}
function noteHTML(quotes,color){
  if(!quotes.length)return '<div class="empty2" style="color:var(--ink-3);font-size:13px">Not enough detailed notes in this slice yet.</div>';
  return `<ul class="notelist" style="--bullet:${color||'var(--primary)'}">${quotes.map(q=>`<li>${esc(q.text)}</li>`).join('')}</ul>`;
}
function sectionBalanceHTML(rows,highlight){
  const med=sectionMedians(rows),cm={q:'var(--blue)',v:'var(--violet)',di:'var(--amber)'};
  const slo=55,shi=90,scale=v=>Math.max(2,Math.min(100,Math.round(100*(v-slo)/(shi-slo))));
  const html=[['q','Quant'],['v','Verbal'],['di','Data Insights']].map(([k,name])=>{
    const m=med[k]!=null?Math.round(med[k]):null;if(m==null)return '';
    return `<div class="cmp"><div class="cl">${name}${k===highlight?'<small>your focus</small>':''}</div>
      <div class="ctrack"><div class="cbar" style="--w:${scale(m)}%;background:${cm[k]}"></div></div>
      <div class="cscore" style="color:${cm[k]}">${m}</div></div>`;
  }).join('');
  return html?`<div class="seccompare">${html}</div>`:'<div class="empty2" style="color:var(--ink-3);font-size:13px">No complete section splits in this cohort.</div>';
}
function planSectionInsight(peers,b){
  const key=selectedSectionKey(peers),secName=sectionLabel(key),secCode=sectionCode(key),[c,cl]=SECCOL[key];
  const ins=sectionInsight(peers,key,new Set()),pool=rowsForSection(peers,key),top=ins.top[0];
  const med=ins.med!=null?Math.round(ins.med):'—';
  const topPct=top?pct(top[1],peers.length):0;
  const take=[
    top?`<b>${esc(top[0])}</b> is the clearest repeated ${esc(secName)} tactic in this peer set (${topPct}% mention it).`:`The peer set is thin on repeated ${esc(secName)} tactics, so use the notes and examples as qualitative guidance.`,
    ins.med!=null?`The typical ${esc(secName)} split is <b>${med}</b>, so treat your next mock as a diagnostic against that benchmark.`:`Not enough complete ${esc(secName)} scores appear here to set a reliable numeric benchmark.`,
    `<b>${ins.withNotes}</b> of ${peers.length} matching debriefs include detailed ${esc(secName)} notes; copy the error-review behavior, not just the resource names.`,
  ];
  const next=`Next move: run one timed ${esc(secName)} set, tag every miss as concept / timing / careless, then drill only the top repeated miss type before your next mock.`;
  return {
    title:`${secName} insight`,
    sub:`The pattern behind “Start with ${secName}.”`,
    rows:bestExamples(pool,12),
    meta:{kind:'section',band:b.label,section:secName,sample:pool.length},
    html:`
      <div class="draweranswer" style="--drawer:var(${c});--drawer-l:var(${cl})">
        <span class="ey">Short answer</span>
        <h3>Make ${esc(secName)} a feedback loop, not a broad review plan.</h3>
        <p>The useful signal is where repeated misses cluster. Your first job is to convert those misses into targeted drills and pacing rules.</p>
      </div>
      ${insightStatsHTML([
        {v:med,l:`typical ${secName}`},
        {v:top?topPct+'%':'—',l:'top tactic share'},
        {v:ins.withNotes,l:'detailed notes'},
        {v:pool.length,l:'matching examples'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Section balance</h3>${sectionBalanceHTML(peers,key)}</div>
        <div class="insightpanel"><h3>Top ${esc(secName)} tactics</h3>${ins.top.length?hBarsHTML(ins.top,peers.length,{color:`var(${c})`}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No repeated tactics yet.</div>'}</div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(ins.quotes,`var(${c})`)}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> ${next}</div>`
  };
}
function planHabitInsight(peers,b){
  const top=topStrats(peers,'G',5),main=top[0],pool=main?rowsForStrat(peers,'G',main[0]):peers;
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null),gains=peers.map(d=>d.gain).filter(x=>x!=null);
  const quotes=overallQuotes(pool.length?pool:peers,3);
  const take=[
    main?`<b>${esc(main[0])}</b> is the strongest repeated habit (${pct(main[1],peers.length)}% of matching debriefs).`:'No single habit dominates, so use the closest debriefs to copy process details.',
    'The recurring pattern is a loop: mock or timed set, review, targeted drill, then retest the same weakness.',
    'Treat this as an operating rhythm. More questions only help when the review loop changes what you do next.',
  ];
  return {
    title:'Practice-loop insight',
    sub:'What people repeatedly did between mocks and drills.',
    rows:bestExamples(pool.length?pool:peers,12),
    meta:{kind:'habit',band:b.label,tactic:main&&main[0],sample:pool.length||peers.length},
    html:`
      <div class="draweranswer">
        <span class="ey">Short answer</span>
        <h3>Build a loop you can repeat every week.</h3>
        <p>The debriefs rarely point to “just do more.” They point to repeated review behavior: timed work, error logging, targeted drills, and test-day execution rules.</p>
      </div>
      ${insightStatsHTML([
        {v:main?pct(main[1],peers.length)+'%':'—',l:'top habit share'},
        {v:prep.length?fmt(median(prep))+'w':'—',l:'median prep'},
        {v:gains.length?'+'+fmt(median(gains)):'—',l:'median gain'},
        {v:top.length,l:'repeated habits'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Common practice habits</h3>${top.length?hBarsHTML(top,peers.length,{color:'var(--primary)'}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No repeated habits yet.</div>'}</div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(quotes,'var(--primary)')}</div>
        <div class="insightpanel"><h3>Simple weekly loop</h3>${takeawaysHTML(['One timed set or mock block.','Review every miss and every slow solve.','Drill the top repeated error.','Retest the same pattern before changing focus.'])}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> Pick one recurring habit above and run it for seven days before adding another resource or topic.</div>`
  };
}
function planResourceInsight(peers,b){
  const top=topResources(peers,6),main=top[0],pool=main?peers.filter(d=>(d.resources||[]).includes(main[0])):peers;
  const named=peers.filter(d=>(d.resources||[]).length),self=peers.filter(d=>(d.tags||[]).includes('Self Study')).length;
  const quotes=overallQuotes(pool.length?pool:peers,3);
  const chips=top.slice(0,5).map(([r])=>`<span>${esc(r)}</span>`).join('');
  const take=[
    main?`<b>${esc(main[0])}</b> is the most-mentioned resource, but that is a popularity signal, not proof of causality.`:'This peer slice does not name resources consistently, so lean more on process than brand choice.',
    'The useful pattern is the stack: official calibration, targeted practice, and careful review.',
    'Avoid copying every product name. Copy how students combined resources around their weakest section and mock review.',
  ];
  return {
    title:'Resource-stack insight',
    sub:'How matching debriefs talk about materials without treating popularity as causality.',
    rows:bestExamples(pool.length?pool:peers,12),
    meta:{kind:'resource',band:b.label,resource:main&&main[0],sample:pool.length||peers.length},
    html:`
      <div class="draweranswer" style="--drawer:var(--amber);--drawer-l:var(--amber-l)">
        <span class="ey">Short answer</span>
        <h3>Use resources as a stack, not a shopping list.</h3>
        <p>The signal is not “buy the most-mentioned thing.” It is how students combined official material, practice banks, mocks, and review around a specific bottleneck.</p>
      </div>
      ${insightStatsHTML([
        {v:main?pct(main[1],peers.length)+'%':'—',l:'top resource share'},
        {v:named.length,l:'name resources'},
        {v:self?pct(self,peers.length)+'%':'—',l:'self-study'},
        {v:top.length,l:'resource signals'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Most-mentioned resources</h3>${top.length?hBarsHTML(top,peers.length,{color:'var(--amber)'}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No named resources yet.</div>'}</div>
        <div class="insightpanel"><h3>Likely stack to inspect</h3><div class="stackchips">${chips||'<span>No clear stack yet</span>'}</div></div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(quotes,'var(--amber)')}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> Choose one core resource for your weakest lever, then use official mocks or official-style review to decide whether it is working.</div>`
  };
}
function planTimingInsight(peers,b){
  const timing=topParsedStrats(peers,p=>/mock|review|timing|test-day|section-order|routine|mindset|error log|move/i.test(p.label),5);
  const top=timing.length?timing:topParsedStrats(peers,p=>p.sec==='G',5),main=top[0],pool=main?rowsForParsed(peers,main):peers;
  const prep=peers.map(d=>d.prep_weeks).filter(x=>x!=null),quotes=overallQuotes(pool.length?pool:peers,3);
  const barData=top.map(x=>[x.label,x.n]);
  const take=[
    main?`<b>${esc(main.label)}</b> is the clearest execution signal (${pct(main.n,peers.length)}% mention it).`:'The peer set does not have one dominant execution habit, so use the examples for specific pacing rules.',
    'Timing work should produce rules: when to move on, when to guess, and which section order keeps you calm.',
    'A mock only helps if the review changes the next timed set.',
  ];
  return {
    title:'Timing and test-day insight',
    sub:'What to copy when pacing or execution feels like the hard part.',
    rows:bestExamples(pool.length?pool:peers,12),
    meta:{kind:'timing',band:b.label,tactic:main&&main.label,sample:pool.length||peers.length},
    html:`
      <div class="draweranswer" style="--drawer:var(--green);--drawer-l:var(--green-l)">
        <span class="ey">Short answer</span>
        <h3>Turn timing into rules before test day.</h3>
        <p>The strongest execution debriefs describe decisions they made before the clock got stressful: section order, move-on rules, and how they reviewed mocks.</p>
      </div>
      ${insightStatsHTML([
        {v:main?pct(main.n,peers.length)+'%':'—',l:'top timing signal'},
        {v:prep.length?fmt(median(prep))+'w':'—',l:'median prep'},
        {v:top.length,l:'execution signals'},
        {v:pool.length||peers.length,l:'matching examples'},
      ])}
      <div class="insightgrid">
        <div class="insightpanel"><h3>What the debriefs are telling you</h3>${takeawaysHTML(take)}</div>
        <div class="insightpanel"><h3>Execution habits</h3>${barData.length?hBarsHTML(barData,peers.length,{color:'var(--green)'}):'<div class="empty2" style="color:var(--ink-3);font-size:13px">No repeated timing habits yet.</div>'}</div>
        <div class="insightpanel"><h3>Representative notes</h3>${noteHTML(quotes,'var(--green)')}</div>
        <div class="insightpanel"><h3>Rules to write down</h3>${takeawaysHTML(['What is my section order?','How long before I move on?','Which mistakes mean content, timing, or stress?','What will I review after each mock?'])}</div>
      </div>
      <div class="nextmove"><b>Suggested next move:</b> Write one move-on rule and one review rule, then test both in your next timed block.</div>`
  };
}
function buildPlanInsight(kind,peers,b){
  if(kind==='section')return planSectionInsight(peers,b);
  if(kind==='resource')return planResourceInsight(peers,b);
  if(kind==='timing')return planTimingInsight(peers,b);
  return planHabitInsight(peers,b);
}
function renderPlanSignals(peers,b){
  const el=document.getElementById('planSignalsGrid');if(!el)return;
  const secKey=selectedSectionKey(peers),secName=sectionLabel(secKey),secTop=topStrats(peers,sectionCode(secKey),1)[0];
  const genTop=topStrats(peers,'G',1)[0],resTop=topResources(peers,1)[0];
  const cards=[
    {k:'Bottleneck signal',h:`${secName} is the first lever`,p:secTop?`${pct(secTop[1],peers.length)}% mention ${secTop[0]}.`:`Use ${secName} as the next diagnostic checkpoint.`,kind:'section',c:'var(--blue)',l:'var(--blue-l)'},
    {k:'Process signal',h:genTop?genTop[0]:'Review loop matters',p:genTop?`${pct(genTop[1],peers.length)}% name this habit.`:'Look for mock review, error logs, and targeted drilling.',kind:'habit',c:'var(--primary)',l:'var(--primary-l)'},
    {k:'Stack signal',h:resTop?resTop[0]:'Resource stack',p:resTop?`${pct(resTop[1],peers.length)}% mention it; inspect usage, not popularity.`:'Copy the resource workflow, not the product list.',kind:'resource',c:'var(--amber)',l:'var(--amber-l)'},
  ];
  el.innerHTML=cards.map(x=>`<div class="signalcard" style="--sc:${x.c};--scl:${x.l}">
    <div class="k">${x.k}</div><h3>${esc(x.h)}</h3><p>${esc(x.p)}</p>
    <button type="button" onclick="handlePlanAction('${x.kind}')">Open insight
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
  </div>`).join('');
}
function renderPlanActions(peers,b){
  const focus=focusOf(plan.focus),weak=weakestSection(peers),secKey=selectedSectionKey(peers),secName=sectionLabel(secKey);
  const secTop=topStrats(peers,sectionCode(secKey),1)[0];
  const genTop=topStrats(peers,'G',3);
  const resTop=topResources(peers,3);
  const sectionCopy=focus.sec
    ?`${secName} is the difficulty you chose. Keep the first study block narrow enough that every miss can become a repeatable drill.`
    :weak?`${weak.name} is the lowest median split among debriefs like yours. Use it as the first diagnostic checkpoint.`
      :'Not enough full section splits in this cohort — separate Quant, Verbal, and DI practice from the start.';
  const cards=[
    {k:'Section focus',c:'var(--blue)',l:'var(--blue-l)',
      h:`Start with ${secName}`,
      p:sectionCopy,
      m:secTop?`<b>${pct(secTop[1],peers.length)}%</b> mention ${esc(secTop[0])}`:`<b>${peers.length}</b> examples`,
      a:'Open section insight',kind:'section'},
    {k:'Practice loop',c:'var(--primary)',l:'var(--primary-l)',
      h:genTop[0]?esc(genTop[0][0]):'Build a review loop',
      p:'The repeated pattern is not just doing more questions. People describe a loop of mocks, review, targeted drills, and test-day execution.',
      m:genTop[0]?`<b>${pct(genTop[0][1],peers.length)}%</b> name this habit`:`<b>${peers.length}</b> debriefs sampled`,
      a:'Open practice insight',kind:'habit'},
    {k:'Resource stack',c:'var(--amber)',l:'var(--amber-l)',
      h:resTop[0]?esc(resTop[0][0]):'Use named materials deliberately',
      p:'Resources are popularity signals, not proof of causality. The useful move is seeing how students combined official material, practice banks, and review.',
      m:resTop[0]?`<b>${pct(resTop[0][1],peers.length)}%</b> mention the top resource`:`<b>0</b> named resources`,
      a:'Open resource insight',kind:'resource'},
  ];
  document.getElementById('planActions').innerHTML=cards.map(x=>`
    <div class="actioncard" style="--ac:${x.c};--acl:${x.l}">
      <span class="k">${x.k}</span>
      <h3>${x.h}</h3>
      <p>${x.p}</p>
      <div class="metric">${x.m}</div>
      <button class="actbtn" type="button" onclick="handlePlanAction('${x.kind}')">${x.a}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>`).join('');
}
function handlePlanAction(kind){
  const{peers}=peersFor(plan.tgt,plan.cur),b=bandOf(plan.tgt);
  track('plan_action_click',{kind,band:b.label});
  if(kind==='proof'){jumpPlanEvidence();return;}
  openPlanInsight(buildPlanInsight(kind,peers,b));
}
function jumpPlanEvidence(){const t=document.getElementById('planEvidence');
  scrollTo({top:t.getBoundingClientRect().top+scrollY-70,behavior:RM?'auto':'smooth'});}

/* ================= SVG CHART PRIMITIVES (themed, no chart library) ================= */
let _uid=0;
function uid(){return 'g'+(++_uid);}
function isCompact(){return window.innerWidth<520;}
function niceTicks(min,max,count){
  if(max<=min)max=min+1;
  const step0=(max-min)/(count||4),mag=Math.pow(10,Math.floor(Math.log10(step0)||0)),norm=step0/mag;
  let step=(norm<1.5?1:norm<3?2:norm<7?5:10)*mag;
  const lo=Math.ceil(min/step)*step,out=[];
  for(let v=lo;v<=max+1e-9;v+=step)out.push(Math.round(v*100)/100);
  return out.length?out:[min,max];
}
/* re-run the grow animation each render: reset, reflow, then add .grown */
function paint(id,html){
  const el=document.getElementById(id);if(!el)return;
  el.classList.remove('grown');el.innerHTML=html;
  if(RM){el.classList.add('grown');return;}
  void el.offsetWidth;requestAnimationFrame(()=>el.classList.add('grown'));
}
function svgVBars(data,opt){
  opt=opt||{};const cmp=isCompact();
  const W=opt.W||(cmp?360:560),H=opt.H||(cmp?240:284),padL=cmp?32:42,padR=cmp?12:16,padT=20,padB=40;
  const base=H-padB,plotH=H-padT-padB,plotW=W-padL-padR;
  const yMin=opt.yMin!=null?opt.yMin:0,yMax=opt.yMax!=null?opt.yMax:Math.max(1,...data.map(d=>d.value||0));
  const sc=v=>base-(Math.max(yMin,Math.min(yMax,v))-yMin)/((yMax-yMin)||1)*plotH;
  const grid=niceTicks(yMin,yMax,4).map(t=>{const y=sc(t);
    return `<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axlabel" x="${padL-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${opt.fmtTick?opt.fmtTick(t):t}</text>`;}).join('');
  const n=data.length,slot=plotW/n,bw=Math.min(cmp?30:56,slot*.62);
  const bars=data.map((d,i)=>{
    const v=d.value||0,y=sc(v),h=Math.max(0,base-y),x=padL+i*slot+(slot-bw)/2;
    return `<rect class="vbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${d.color||opt.color||'var(--primary)'}"><title>${esc(d.label)}: ${esc(String(d.tip!=null?d.tip:v))}</title></rect>
      ${(d.valLabel!==''&&(v||d.valLabel!=null))?`<text class="vcount" x="${(x+bw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle">${d.valLabel!=null?d.valLabel:v}</text>`:''}
      <text class="axlabel" x="${(x+bw/2).toFixed(1)}" y="${H-13}" text-anchor="middle">${esc(d.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opt.aria||'bar chart')}">${grid}<line class="axis" x1="${padL}" x2="${W-padR}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}
function svgGroupedBars(groups,series,opt){
  opt=opt||{};const cmp=isCompact();
  const W=opt.W||(cmp?360:560),H=opt.H||(cmp?240:284),padL=cmp?30:40,padR=cmp?12:16,padT=16,padB=40;
  const base=H-padB,plotH=H-padT-padB,plotW=W-padL-padR;
  const yMin=opt.yMin!=null?opt.yMin:0,yMax=opt.yMax!=null?opt.yMax:90;
  const sc=v=>base-(Math.max(yMin,Math.min(yMax,v))-yMin)/((yMax-yMin)||1)*plotH;
  const grid=niceTicks(yMin,yMax,4).map(t=>{const y=sc(t);
    return `<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axlabel" x="${padL-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${t}</text>`;}).join('');
  const gN=groups.length,gslot=plotW/gN,sN=series.length,gpad=gslot*.16,innerW=gslot-gpad*2;
  const bw=Math.min(cmp?15:30,(innerW/sN)*.82),gap=(innerW-bw*sN)/(sN+1);
  const bars=groups.map((g,gi)=>{
    const gx=padL+gi*gslot+gpad;
    const inner=series.map((s,si)=>{const v=g.values[s.key];if(v==null)return '';
      const x=gx+gap+si*(bw+gap),y=sc(v),h=Math.max(0,base-y);
      return `<rect class="vbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${s.color}"><title>${esc(g.label)} · ${esc(s.label)}: ${Math.round(v)}</title></rect>`;}).join('');
    return inner+`<text class="axlabel" x="${(gx+innerW/2).toFixed(1)}" y="${H-13}" text-anchor="middle">${esc(g.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opt.aria||'grouped bar chart')}">${grid}<line class="axis" x1="${padL}" x2="${W-padR}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}
function svgScatter(points,opt){
  opt=opt||{};const cmp=isCompact();if(!points.length)return '';
  const W=opt.W||(cmp?360:600),H=opt.H||(cmp?280:330),padL=cmp?34:44,padR=cmp?14:18,padT=14,padB=44;
  const base=H-padB,plotH=H-padT-padB,plotW=W-padL-padR;
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const xMin=0,xMax=opt.xMax!=null?opt.xMax:Math.max(1,...xs),yMin=Math.min(0,...ys),yMax=opt.yMax!=null?opt.yMax:Math.max(1,...ys);
  const sx=v=>padL+(v-xMin)/((xMax-xMin)||1)*plotW,sy=v=>base-(v-yMin)/((yMax-yMin)||1)*plotH;
  const grid=niceTicks(yMin,yMax,4).map(t=>{const y=sy(t);
    return `<line class="gridline" x1="${padL}" x2="${W-padR}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text class="axlabel" x="${padL-6}" y="${(y+3.5).toFixed(1)}" text-anchor="end">${t}</text>`;}).join('');
  const xax=niceTicks(xMin,xMax,5).map(t=>`<text class="axlabel" x="${sx(t).toFixed(1)}" y="${H-26}" text-anchor="middle">${t}</text>`).join('');
  let trend='';
  if(points.length>=4){
    const n=points.length,sX=xs.reduce((a,b)=>a+b,0),sY=ys.reduce((a,b)=>a+b,0),
      sXY=points.reduce((a,p)=>a+p.x*p.y,0),sXX=points.reduce((a,p)=>a+p.x*p.x,0),den=n*sXX-sX*sX;
    if(den){const m=(n*sXY-sX*sY)/den,b0=(sY-m*sX)/n,cl=v=>Math.max(yMin,Math.min(yMax,v));
      trend=`<line class="trend" x1="${sx(xMin).toFixed(1)}" y1="${sy(cl(m*xMin+b0)).toFixed(1)}" x2="${sx(xMax).toFixed(1)}" y2="${sy(cl(m*xMax+b0)).toFixed(1)}" stroke="var(--ink-3)"/>`;}
  }
  const dots=points.map(p=>`<circle class="dot" cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${cmp?4:5}" fill="${p.color||'var(--primary)'}" fill-opacity=".72"><title>${esc(p.tip||'')}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(opt.aria||'scatter plot')}">${grid}${xax}<line class="axis" x1="${padL}" x2="${W-padR}" y1="${base}" y2="${base}"/><line class="axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${base}"/>${trend}${dots}<text class="axtitle" x="${(padL+plotW/2).toFixed(1)}" y="${H-7}" text-anchor="middle">${esc(opt.xTitle||'')}</text></svg>`;
}
function svgHist(rows,opt){
  opt=opt||{};const cmp=isCompact(),g=uid(),cnt={};
  rows.forEach(d=>{if(d.total!=null)cnt[d.total]=(cnt[d.total]||0)+1;});
  const pts=[];for(let s=655;s<=805;s+=10)pts.push(s);
  const max=Math.max(1,...pts.map(s=>cnt[s]||0));
  const W=cmp?360:600,H=cmp?248:296,padX=cmp?18:28,padT=24,padB=42,base=H-padB,plotH=H-padT-padB;
  const step=(W-padX*2)/pts.length,bw=Math.min(cmp?16:30,step*.72),hl=opt.highlight;
  const bars=pts.map((s,i)=>{
    const n=cnt[s]||0,band=BANDS.find(b=>s>=b.lo&&s<=b.hi),inb=hl?(band&&hl.has(band.key)):true;
    const h=n?Math.max(4,n/max*plotH):0,x=padX+i*step+(step-bw)/2,y=base-h,show=(s%20===15)||s===655||s===805;
    return `<rect class="vbar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${inb?`url(#${g})`:'#d7d8e7'}"><title>${s}: ${n} debriefs</title></rect>
      ${n>=(cmp?18:9)?`<text class="vcount" x="${(x+bw/2).toFixed(1)}" y="${Math.max(15,y-6).toFixed(1)}" text-anchor="middle">${n}</text>`:''}
      ${show?`<text class="axlabel" x="${(x+bw/2).toFixed(1)}" y="${H-14}" text-anchor="middle">${s}</text>`:''}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score distribution">
    <defs><linearGradient id="${g}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7c5cf0"/><stop offset="1" stop-color="#5b5bd6"/></linearGradient></defs>
    <line class="axis" x1="${padX}" x2="${W-padX}" y1="${base}" y2="${base}"/>${bars}</svg>`;
}
function hBarsHTML(data,total,opt){
  opt=opt||{};const mx=data.length?data[0][1]:1;
  return '<div class="bars">'+data.map(([label,n])=>{const p=Math.round(100*n/(total||1));
    return `<div class="barrow"><div class="blabel"><span class="bname"><span class="txt">${esc(label)}</span></span><span class="bpct">${p}%</span></div>
      <div class="bartrack"><div class="barfill" style="--w:${Math.round(100*n/mx)}%${opt.color?';background:'+opt.color:''}"></div></div></div>`;}).join('')+'</div>';
}

/* ================= EXPLORE THE DATA (global, filterable charts) ================= */
let xf={bands:new Set(),src:'',res:'',self:false};
let xLimit=12;
function xFiltered(ignoreBand){
  let rows=DEB.slice();
  if(!ignoreBand&&xf.bands.size)rows=rows.filter(d=>{const b=BANDS.find(x=>inBand(d,x));return b&&xf.bands.has(b.key);});
  if(xf.src)rows=rows.filter(d=>d.source===xf.src);
  if(xf.res)rows=rows.filter(d=>(d.resources||[]).includes(xf.res));
  if(xf.self)rows=rows.filter(d=>(d.tags||[]).includes('Self Study'));
  return rows;
}
function renderFilterBar(){
  const fb=document.getElementById('filterbar');if(!fb)return;
  const srcs=[...new Set(DEB.map(d=>d.source))].sort();
  const resAll=topResources(DEB,14).map(r=>r[0]);
  fb.innerHTML=`
    <div class="fgroup"><span class="flabel">Score</span><div class="chiprow">
      ${BANDS.map(b=>`<button class="fchip ${xf.bands.has(b.key)?'on':''}" onclick="xToggleBand('${b.key}')">${b.label}</button>`).join('')}</div></div>
    <div class="fgroup"><span class="flabel">Source</span>
      <select class="pick" id="xfSrc"><option value="">All</option>${srcs.map(s=>`<option ${xf.src===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div>
    <div class="fgroup"><span class="flabel">Resource</span>
      <select class="pick" id="xfRes"><option value="">All</option>${resAll.map(r=>`<option ${xf.res===r?'selected':''}>${esc(r)}</option>`).join('')}</select></div>
    <button class="fchip ${xf.self?'on':''}" onclick="xToggleSelf()">Self-study only</button>
    <div class="spacer"></div>
    <span class="fcount" id="xfCount"></span>
    <button class="freset" onclick="xReset()">Reset</button>`;
  document.getElementById('xfSrc').onchange=e=>{xf.src=e.target.value;xLimit=12;renderExplore();};
  document.getElementById('xfRes').onchange=e=>{xf.res=e.target.value;xLimit=12;renderExplore();};
}
function xToggleBand(k){xf.bands.has(k)?xf.bands.delete(k):xf.bands.add(k);xLimit=12;renderFilterBar();renderExplore();track('x_filter',{band:k});}
function xToggleSelf(){xf.self=!xf.self;xLimit=12;renderFilterBar();renderExplore();}
function xReset(){xf={bands:new Set(),src:'',res:'',self:false};xLimit=12;renderFilterBar();renderExplore();}
function openTargetExplore(){
  const b=bandOf(plan.tgt);
  if(b){xf={bands:new Set([b.key]),src:'',res:'',self:false};state.band=b.key;xLimit=12;history.pushState({},'', '?band='+b.lo);}
  showView('explore');
  renderFilterBar();renderExplore();
  if(b)track('plan_explore_target',{band:b.label});
}
function renderXStat(rows){
  const tot=rows.map(d=>d.total).filter(x=>x!=null),g=rows.map(d=>d.gain).filter(x=>x!=null),p=rows.map(d=>d.prep_weeks).filter(x=>x!=null);
  const stats=[
    {v:rows.length,l:'debriefs',cls:''},
    {v:tot.length?median(tot):null,l:'median score',cls:'green'},
    {v:g.length?'+'+median(g):null,l:'median gain',cls:'coral'},
    {v:p.length?median(p)+'w':null,l:'median prep',cls:''},
  ];
  document.getElementById('xstat').innerHTML=stats.map(s=>`<div class="stat ${s.cls}"><div class="v">${s.v==null?'—':s.v}</div><div class="l">${s.l}</div></div>`).join('');
}
function renderXSection(rows){
  const groups=BANDS.map(b=>{const br=rows.filter(d=>inBand(d,b)),m=sectionMedians(br);return {label:b.label.replace(' – ','–'),values:{q:m.q,v:m.v,di:m.di}};});
  const allv=groups.flatMap(g=>Object.values(g.values)).filter(x=>x!=null);
  const box=document.getElementById('xsection'),leg=document.getElementById('xsectionLeg');
  if(!allv.length){box.innerHTML='<div class="chartempty">No complete section splits in this selection.</div>';leg.innerHTML='';return;}
  const series=[{key:'q',label:'Quant',color:'var(--blue)'},{key:'v',label:'Verbal',color:'var(--violet)'},{key:'di',label:'Data Insights',color:'var(--amber)'}];
  const yMin=Math.max(60,Math.floor((Math.min(...allv)-4)/5)*5);
  paint('xsection',svgGroupedBars(groups,series,{yMin,yMax:90,aria:'Median section score by band'}));
  leg.innerHTML=series.map(s=>`<span><i style="background:${s.color}"></i>${s.label}</span>`).join('');
}
function renderXGain(rows){
  const gains=rows.map(d=>d.gain).filter(x=>x!=null),box=document.getElementById('xgain');
  if(!gains.length){box.innerHTML='<div class="chartempty">Only some debriefs report a start score, so no point-gain data in this selection.</div>';return;}
  const data=GAINB.map(g=>({label:g.label,value:gains.filter(v=>v>=g.lo&&v<=g.hi).length,color:'var(--coral)'}));
  paint('xgain',svgVBars(data,{aria:'Point gain distribution'}));
}
function renderXRes(rows){
  const top=topResources(rows,isCompact()?7:10),box=document.getElementById('xres');
  if(!top.length){box.innerHTML='<div class="chartempty">No named resources in this selection.</div>';return;}
  paint('xres',hBarsHTML(top,rows.length,{color:'var(--amber)'}));
}
function renderXScatter(rows){
  const raw=rows.filter(d=>d.prep_weeks!=null&&d.gain!=null),box=document.getElementById('xscatter');
  if(raw.length<3){box.innerHTML='<div class="chartempty">Not enough debriefs report both prep time and a start score in this selection.</div>';return;}
  const xMax=Math.min(Math.max(...raw.map(d=>d.prep_weeks)),52);
  const pts=raw.map(d=>{const b=BANDS.find(x=>inBand(d,x)),c=b?BANDC[b.key].c:'var(--primary)';
    return {x:Math.min(d.prep_weeks,xMax),y:d.gain,color:c,tip:`${d.prep_weeks}w → +${d.gain} (${d.total})`};});
  paint('xscatter',svgScatter(pts,{xMax,xTitle:'weeks of prep',aria:'Prep time vs score gain'}));
}
function renderXPrep(rows){
  const data=PREPB.map(p=>{const br=rows.filter(d=>d.prep_weeks!=null&&d.prep_weeks>=p.lo&&d.prep_weeks<=p.hi),m=median(br.map(d=>d.total).filter(x=>x!=null));return {label:p.label,med:m!=null?Math.round(m):null,n:br.length};});
  const has=data.filter(d=>d.med!=null),box=document.getElementById('xprep');
  if(has.length<2){box.innerHTML='<div class="chartempty">Not enough prep-time data in this selection.</div>';return;}
  const vals=has.map(d=>d.med),yMin=Math.max(600,Math.floor((Math.min(...vals)-15)/10)*10),yMax=Math.min(805,Math.ceil((Math.max(...vals)+15)/10)*10);
  paint('xprep',svgVBars(data.map(d=>({label:d.label,value:d.med!=null?d.med:yMin,valLabel:d.med!=null?d.med:'',tip:d.med!=null?`median ${d.med} · n=${d.n}`:'no data',color:'var(--primary)'})),{yMin,yMax,aria:'Median score by prep time'}));
}
function renderXHeat(){
  const base=xFiltered(true);
  const cand=countBy(base,d=>(d.strat||[]).map(parseStrat).map(p=>p.sec+'|'+p.label)).slice(0,isCompact()?5:7)
    .map(([k])=>{const i=k.indexOf('|');return {sec:k.slice(0,i),label:k.slice(i+1)};});
  const cells=['<div class="hmhead"></div>'];
  BANDS.forEach(b=>cells.push(`<div class="hmhead">${b.label.replace(' – ','-')}</div>`));
  cand.forEach(item=>{
    cells.push(`<div class="hmlabel">${esc(item.label)}</div>`);
    BANDS.forEach(b=>{const br=base.filter(d=>inBand(d,b)),pool=rowsForStrat(br,item.sec,item.label),p=pct(pool.length,br.length),a=Math.max(.06,Math.min(.6,p/100*.9));
      cells.push(`<div class="hmcell" style="--a:${a.toFixed(2)}"><button type="button" onclick='openHeatCohort(${JSON.stringify(item.sec)},${JSON.stringify(item.label)},${JSON.stringify(b.key)})'>${p}%</button></div>`);});
  });
  document.getElementById('xheat').innerHTML=cells.join('');
}
function renderXBrowse(rows){
  const sorted=rows.slice().sort((a,b)=>(b.total||0)-(a.total||0)),shown=sorted.slice(0,xLimit);
  document.getElementById('xbrowseSub').innerHTML=`Showing <b>${Math.min(xLimit,sorted.length)}</b> of <b>${sorted.length}</b>, highest score first.`;
  document.getElementById('xbrowseList').innerHTML=shown.map(debCardHTML).join('');
  document.getElementById('xbrowseEmpty').classList.toggle('hidden',sorted.length>0);
  document.getElementById('xbrowseMore').classList.toggle('hidden',sorted.length<=xLimit);
}
function xShowMore(){xLimit+=12;renderXBrowse(xFiltered());track('x_more',{n:xLimit});}
function renderExplore(){
  const rows=xFiltered();
  const cnt=document.getElementById('xfCount');if(cnt)cnt.innerHTML=`<b>${rows.length}</b> of ${DEB.length}`;
  renderXStat(rows);
  paint('xdist',svgHist(rows,{highlight:xf.bands.size?xf.bands:null}));
  const dh=document.getElementById('xdistHint');if(dh)dh.textContent=xf.bands.size?'selected bands highlighted':'';
  renderXSection(rows);renderXGain(rows);renderXRes(rows);renderXScatter(rows);renderXPrep(rows);renderXHeat();renderXBrowse(rows);
}
function debCardHTML(d){
  const top=(d.strat||[]).slice(0,3).map(s=>{const{sec,label}=parseStrat(s);
    const cm={Q:'var(--blue)',V:'var(--violet)',DI:'var(--amber)',G:'var(--primary)'};
    return `<span class="minichip"><span class="d" style="background:${cm[sec]}"></span>${esc(label)}</span>`;}).join('');
  const flags=(d.tags||[]).map(t=>t==='Maybe Promo'?'<span class="tag promo">Maybe&nbsp;promo</span>':t==='Self Study'?'<span class="tag self">Self&nbsp;study</span>':'').join('');
  const meta=[];
  if(d.prep_weeks)meta.push(`<b>${d.prep_weeks}w</b> prep`);
  if(d.attempts)meta.push(`<b>${d.attempts}</b> attempt${d.attempts>1?'s':''}`);
  if(d.gain)meta.push(`<b>+${d.gain}</b> gain`);
  return `<button class="card" onclick="openDebrief('${d.id}',true)" aria-label="Read: ${esc(d.title)}">
    <div class="ctop"><span class="score-badge">${d.total}<small>/805</small></span>
      <span class="src">${esc(d.source)}</span></div>
    <div class="ctitle">${esc(d.title)}</div>
    <div class="ctags">${top}${flags}</div>
    ${meta.length?`<div class="cmeta">${meta.join('')}</div>`:''}
  </button>`;
}
/* legacy band-scoped explore renderers removed in v19.2 (see EXPLORE THE DATA + plan analytics) */

/* ---------- cohort proof drawer ---------- */
function openPlanInsight(insight){
  const c=document.getElementById('cohort'),m=insight.meta||{},rows=insight.rows||[];
  document.getElementById('cohortTitle').textContent=insight.title;
  document.getElementById('cohortSub').textContent=insight.sub;
  document.getElementById('cohortMeta').innerHTML=[
    sampleText(rows.length,'examples'),
    m.band?`<span>${esc(m.band)}</span>`:'',
    m.section?`<span>${esc(m.section)}</span>`:'',
    m.resource?`<span>${esc(m.resource)}</span>`:'',
    m.tactic?`<span>${esc(m.tactic)}</span>`:'',
  ].filter(Boolean).join('');
  const insightEl=document.getElementById('cohortInsight');
  insightEl.classList.remove('hidden');
  insightEl.innerHTML=insight.html;
  const ex=document.getElementById('cohortExamples');
  ex.open=false;
  document.getElementById('cohortExamplesTitle').textContent='Example debriefs';
  document.getElementById('cohortExamplesSub').textContent='Optional supporting stories behind this pattern.';
  document.getElementById('cohortCards').innerHTML=rows.length
    ?rows.map(debCardHTML).join('')
    :'<div class="empty">No matching examples in this slice yet.</div>';
  c.classList.add('on');document.body.style.overflow='hidden';c.scrollTop=0;
  observeGrow(c);
  track('plan_insight_open',m);
}
function openCohort(title,sub,rows,meta){
  const c=document.getElementById('cohort'),m=meta||{};
  document.getElementById('cohortTitle').textContent=title;
  document.getElementById('cohortSub').textContent=sub;
  document.getElementById('cohortMeta').innerHTML=[
    sampleText(rows.length,'shown'),
    m.band?`<span>${esc(m.band)}</span>`:'',
    m.section?`<span>${esc(m.section)}</span>`:'',
    m.resource?`<span>${esc(m.resource)}</span>`:'',
    m.tactic?`<span>${esc(m.tactic)}</span>`:'',
  ].filter(Boolean).join('');
  const insightEl=document.getElementById('cohortInsight');
  insightEl.classList.add('hidden');
  insightEl.innerHTML='';
  const ex=document.getElementById('cohortExamples');
  ex.open=true;
  document.getElementById('cohortExamplesTitle').textContent='Matching debriefs';
  document.getElementById('cohortExamplesSub').textContent='Open any card to read the summarized debrief and source link.';
  document.getElementById('cohortCards').innerHTML=rows.length
    ?rows.map(debCardHTML).join('')
    :'<div class="empty">No matching examples in this slice yet.</div>';
  c.classList.add('on');document.body.style.overflow='hidden';c.scrollTop=0;
  track('cohort_open',m);
}
function closeCohort(){
  const c=document.getElementById('cohort');
  c.classList.remove('on');
  if(!document.getElementById('detail').classList.contains('on'))document.body.style.overflow='';
}
function openHeatCohort(sec,label,bandKey){
  const b=bandOf(bandKey),rows=debsIn(b),pool=rowsForStrat(rows,sec,label);
  track('insight_open',{kind:'heatmap',band:b.label,tactic:label});
  openCohort(`${label} examples`,`${pool.length} ${b.label} debriefs mention this tactic. Use them as context, not causal proof.`,bestExamples(pool,12),{kind:'heatmap',band:b.label,tactic:label,sample:pool.length});
}

/* ---------- detail ---------- */
function sectionCompare(d){
  const b=BANDS.find(x=>inBand(d,x))||bandOf(state.band),peers=debsIn(b);
  const cm={q:'var(--blue)',v:'var(--violet)',di:'var(--amber)'};
  const lo=55,hi=90,scale=v=>Math.max(2,Math.min(100,Math.round(100*(v-lo)/(hi-lo))));
  const secs=[['q','Quant'],['v','Verbal'],['di','Data Insights']];
  let anyTyp=false;
  const rows=secs.map(([k,name])=>{
    const you=d[k];if(you==null)return '';
    const typ=median(peers.map(p=>p[k]).filter(x=>x!=null));
    if(typ!=null)anyTyp=true;
    return `<div class="cmp"><div class="cl">${name}${typ!=null?`<small>typical ${Math.round(typ)}</small>`:''}</div>
      <div class="ctrack"><div class="cbar" style="--w:${scale(you)}%;background:${cm[k]}"></div>
        ${typ!=null?`<span class="ctyp" style="left:${scale(typ)}%"></span>`:''}</div>
      <div class="cscore" style="color:${cm[k]}">${you}</div></div>`;}).join('');
  return rows?`<div class="panel dsection"><h3>Section scores <span class="hint">your result vs a typical ${b.label} debrief</span></h3>
    <div class="seccompare" style="margin-top:16px">${rows}</div>
    ${anyTyp?'<div class="cmpkey"><i></i> marks the typical score in this range</div>':''}</div>`:'';
}
function timelineSVG(det){
  const tl=(det.timeline||[]).filter(p=>p.score!=null);
  if(tl.length<2)return '';
  const W=760,H=320,padL=48,padR=30,padT=38,padB=48,xs=(i)=>padL+i*(W-padL-padR)/(tl.length-1);
  const vals=tl.map(p=>p.score),rawLo=Math.min(...vals),rawHi=Math.max(...vals),mid=(rawLo+rawHi)/2;
  const span=Math.max(60,rawHi-rawLo+36),lo=Math.max(400,Math.floor((mid-span/2)/10)*10),hi=Math.ceil((mid+span/2)/10)*10;
  const ys=(v)=>H-padB-(v-lo)/(hi-lo)*(H-padT-padB);
  const pts=tl.map((p,i)=>[xs(i),ys(p.score)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=`${line} L ${pts[pts.length-1][0].toFixed(1)} ${H-padB} L ${pts[0][0].toFixed(1)} ${H-padB} Z`;
  const ticks=[lo,Math.round((lo+hi)/20)*10,hi].filter((v,i,a)=>a.indexOf(v)===i);
  const grid=ticks.map(v=>`<line class="timelinegrid" x1="${padL}" x2="${W-padR}" y1="${ys(v).toFixed(1)}" y2="${ys(v).toFixed(1)}"/><text class="dlabel" x="10" y="${(ys(v)+4).toFixed(1)}">${v}</text>`).join('');
  const dots=pts.map((p,i)=>`<circle class="timelinepoint" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="7"/><text class="timelabel" x="${p[0].toFixed(1)}" y="${Math.max(15,p[1]-14).toFixed(1)}" text-anchor="middle">${tl[i].score}</text>`).join('');
  return `<div class="panel dsection timelinecard"><h3>Score path over ${tl.length} attempts</h3>
    <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="margin-top:8px" role="img" aria-label="Score path over attempts">
      ${grid}<path class="timelinearea" d="${area}"/><path class="timelinepath" d="${line}"/>${dots}</svg></div>`;
}
function openDebrief(id,push){
  const d=DEB.find(x=>x.id===id);if(!d)return;
  const det=DETAILS[id]||{};
  const cm={Q:'var(--blue)',V:'var(--violet)',DI:'var(--amber)',G:'var(--primary)'};
  const cml={Q:'var(--blue-l)',V:'var(--violet-l)',DI:'var(--amber-l)',G:'var(--primary-l)'};
  const meta=[];
  if(d.prep_weeks)meta.push(`<span class="m"><b>${d.prep_weeks}</b> weeks prep</span>`);
  if(d.attempts)meta.push(`<span class="m"><b>${d.attempts}</b> attempt${d.attempts>1?'s':''}</span>`);
  if(d.gain&&d.start)meta.push(`<span class="m"><b>${d.start} → ${d.total}</b></span>`);
  meta.push(`<span class="m">${esc(d.source)}</span>`);

  const overall=(det.overall||[]);
  const overallHTML=overall.length?`<div class="panel dsection"><h3>How they approached it</h3>
    <ul class="notelist" style="margin-top:12px">${overall.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'';

  const secBlocks=['Q','V','DI'].map(s=>{
    const tac=(det.tactics&&det.tactics[s])||[],notes=(det.sections&&det.sections[s])||[];
    if(!tac.length&&!notes.length)return '';
    const tacH=tac.length?`<div class="tacwrap" style="margin-top:6px">${tac.map(t=>`<span class="tacchip" style="background:${cml[s]};color:${cm[s]}"><span style="width:6px;height:6px;border-radius:50%;background:${cm[s]}"></span>${esc(t)}</span>`).join('')}</div>`:'';
    const noteH=notes.length?`<ul class="notelist" style="margin-top:12px;--bullet:${cm[s]}">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:'';
    return `<div style="margin-top:18px"><h3 style="font-size:15px;color:${cm[s]}">${s==='DI'?'Data Insights':SECNAME[s]}</h3>${tacH}${noteH}</div>`;
  }).join('');
  const secWrap=secBlocks.trim()?`<div class="panel dsection"><h3>Section by section</h3>${secBlocks}</div>`:'';

  const resH=(d.resources||[]).length?`<div class="panel dsection"><h3>Resources used</h3>
    <div class="reslist" style="margin-top:12px">${d.resources.map(r=>`<span class="reschip"><span class="d"></span>${esc(r)}</span>`).join('')}</div></div>`:'';

  document.getElementById('detailBody').innerHTML=`
    <div class="dhero">
      <div class="dscore"><span class="big">${d.total}<small>/ 805</small></span>
        ${(d.tags||[]).map(t=>t==='Maybe Promo'?'<span class="tag promo">Maybe promo</span>':t==='Self Study'?'<span class="tag self">Self study</span>':'').join('')}</div>
      <h1>${esc(d.title)}</h1>
      <div class="dmeta">${meta.join('')}</div>
    </div>
    ${det.overview?`<p style="font-size:16px;color:var(--ink-2);max-width:64ch;margin:6px 0 4px;line-height:1.6">${esc(det.overview)}</p>`:''}
    ${sectionCompare(d)}
    ${timelineSVG(det)}
    ${overallHTML}
    ${secWrap}
    ${resH}
    <div class="dsection" style="margin-bottom:50px">
      <a class="origin" href="${esc(d.permalink)}" target="_blank" rel="noopener" onclick="track('origin_click',{id:'${d.id}'})">
        Read the full post on ${esc(d.source)}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M7 17L17 7M7 7h10v10"/></svg></a>
    </div>`;
  const dt=document.getElementById('detail');
  dt.classList.add('on');document.body.style.overflow='hidden';
  dt.scrollTop=0;
  observeGrow(dt);
  if(push)history.pushState({d:id},'', '?d='+id);
  track('debrief_open',{id,score:d.total,source:d.source});
}
function closeDebrief(){
  if(history.state&&history.state.d){history.back();}else{doClose();}
}
function doClose(){
  const dt=document.getElementById('detail');
  dt.classList.remove('on');
  document.body.style.overflow=document.getElementById('cohort').classList.contains('on')?'hidden':'';
  setTimeout(()=>{if(!dt.classList.contains('on'))document.getElementById('detailBody').innerHTML='';},300);
}

/* ---------- views + routing ---------- */
function initExplore(){
  if(exploreInit)return;exploreInit=true;
  renderFilterBar();renderExplore();
}
function showView(v){
  document.getElementById('view-plan').classList.toggle('hidden',v!=='plan');
  document.getElementById('view-explore').classList.toggle('hidden',v!=='explore');
  document.getElementById('view-about').classList.toggle('hidden',v!=='about');
  document.getElementById('nav-plan').classList.toggle('on',v==='plan');
  document.getElementById('nav-explore').classList.toggle('on',v==='explore');
  document.getElementById('nav-about').classList.toggle('on',v==='about');
  if(v==='explore')initExplore();
  if(v==='plan')renderPlanView();
  if(v==='about')track('about_open',{});
  scrollTo(0,0);
}
function goHome(e){if(e)e.preventDefault();if(document.getElementById('detail').classList.contains('on'))doClose();
  if(document.getElementById('cohort').classList.contains('on'))closeCohort();
  history.pushState({},'', '?');showView('plan');scrollTo(0,0);}
/* re-render explore charts when crossing the compact breakpoint on resize/rotate */
let _rsz;
window.addEventListener('resize',()=>{clearTimeout(_rsz);_rsz=setTimeout(()=>{
  if(exploreInit&&!document.getElementById('view-explore').classList.contains('hidden'))renderExplore();
  if(planAnalyticsShown())renderPlanAnalytics();
},220);});

window.addEventListener('popstate',e=>{
  const s=e.state||{};
  if(s.d){openDebrief(s.d,false);}
  else{doClose();
    const p=new URLSearchParams(location.search);
    if(p.get('band')){const b=BANDS.find(x=>String(x.lo)===p.get('band'));if(b){const w=exploreInit;xf.bands=new Set([b.key]);showView('explore');if(w){renderFilterBar();renderExplore();}}}
    else if(!p.get('p')){showView('plan');}
  }
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.getElementById('detail').classList.contains('on'))closeDebrief();
  else if(document.getElementById('cohort').classList.contains('on'))closeCohort();
});

/* ---------- scroll-in animation ---------- */
let io;
function observeGrow(root){
  if(RM){document.querySelectorAll('.bars,.dist,.seccompare').forEach(el=>el.classList.add('grown'));return;}
  if(!io)io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add('grown');io.unobserve(en.target);}}),{threshold:.18});
  (root||document).querySelectorAll('.bars,.dist,.seccompare').forEach(el=>{if(!el.classList.contains('grown'))io.observe(el);});
}

/* ---------- init ---------- */
(function init(){
  const p=new URLSearchParams(location.search);
  let startView='plan';
  const pp=p.get('p');
  if(pp){
    const parts=pp.split('-');
    if((parts.length===3||parts.length===4)&&CURB.find(c=>c.key===parts[0])&&BANDS.find(b=>b.key===parts[1])&&WEEKB.find(w=>w.key===parts[2])){
      const focus=FOCUS.find(f=>f.key===parts[3])?parts[3]:'unsure';
      plan={cur:parts[0],tgt:parts[1],wk:parts[2],focus};showIntakeForm=false;savePlanLS();
    }
  }else{
    const saved=loadPlanLS();
    if(saved){plan=saved;showIntakeForm=false;}
  }
  if(p.get('band')){
    const b=BANDS.find(x=>String(x.lo)===p.get('band'));
    if(b){state.band=b.key;xf.bands.add(b.key);startView='explore';}
  }
  showView(startView);
  const did=p.get('d');
  if(did&&DEB.find(x=>x.id===did)){openDebrief(did,false);history.replaceState({d:did},'', '?d='+did);}
})();
</script>
</body></html>"""


if __name__ == "__main__":
    main()
