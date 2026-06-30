#!/usr/bin/env python3
"""v.18.1 — PrepSignals, action-plan-first GMAT debrief intelligence.

A bright, aspirational refinement of v.18. Presentation only: reads
debriefs.json + post_details.json and writes a self-contained dashboard_v18_1.html.

What changed vs v18:
  1. The first post-selection surface is a distilled action plan, not a list of
     summaries to read.
  2. Curated analytical depth comes back: distribution, section split, resources,
     prep/gain snapshots, and a compact tactic heatmap.
  3. Charts are still hand-built SVG/HTML, with taller stable chart containers and
     balanced cards.
  4. Debrief and band deep links remain unchanged (?d=<post_id>, ?band=<low>).

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

    # Bands tuned to the real data (every debrief is 655-805, median ~705).
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

    deb_js = json.dumps(deb, ensure_ascii=False, separators=(",", ":"))
    details_js = json.dumps(details, ensure_ascii=False, separators=(",", ":"))
    bands_js = json.dumps(bands, ensure_ascii=False)

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
            .replace("__TOOLTIPS__", json.dumps(tooltips, ensure_ascii=False))
            .replace("__NDEB__", str(len(deb)))
            .replace("__MEDIAN__", str(int(st.median(scores))) if scores else "—")
            .replace("__MINDATE__", min_date).replace("__MAXDATE__", max_date))
    (BASE / "dashboard_v18_1.html").write_text(html)
    print(f"dashboard_v18_1.html written. {len(deb)} debriefs, {len(details)} detail pages.")
    for b in bands:
        print(f"  {b['label']}: {b['count']}")


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>PrepSignals — your GMAT score plan from real debriefs</title>
<meta name="description" content="Pick your target GMAT score and get a distilled prep plan from 330 real debriefs — section focus, practice loop, resources, and proof examples.">
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
.bar .wrap{display:flex;align-items:center;justify-content:space-between;height:62px}
.logo{font-size:20px;font-weight:800;letter-spacing:-.03em;color:var(--ink)}
.logo b{color:var(--primary);font-weight:800}
.logo .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--coral);
  margin-left:1px;transform:translateY(-1px)}
.nav{display:flex;gap:6px;align-items:center}
.nav button{font-size:14.5px;font-weight:600;color:var(--ink-2);padding:8px 13px;border-radius:10px;
  transition:.18s var(--ease)}
.nav button:hover{background:var(--surface);color:var(--ink)}
.nav button.on{color:var(--primary);background:var(--primary-l)}

/* ---- hero ---- */
.hero{padding:50px 0 18px;text-align:center;position:relative}
.hero::before{content:"";position:absolute;inset:-40px 0 auto;height:340px;z-index:-1;
  background:radial-gradient(120% 90% at 50% -8%,rgba(124,92,240,.16),rgba(91,91,214,.05) 38%,transparent 64%)}
.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:700;
  color:var(--primary-d);background:var(--primary-l);padding:6px 13px;border-radius:30px;margin-bottom:20px}
.eyebrow .pulse{width:7px;height:7px;border-radius:50%;background:var(--green)}
.hero h1{font-size:clamp(30px,6.4vw,52px);font-weight:800;margin:0 auto 16px;max-width:15ch}
.hero p.lede{font-size:clamp(16px,2.4vw,19px);color:var(--ink-2);max-width:36ch;margin:0 auto 30px}
.hero p.lede b{color:var(--ink);font-weight:700}

/* ---- band picker ---- */
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
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch}
.grid2>.panel{min-height:330px;height:100%;display:flex;flex-direction:column}
.grid2>.panel .growfill{flex:1}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:stretch}
.blockh3{font-size:18px;font-weight:800;margin-bottom:3px}
.blockh3 .hint{font-size:13px;font-weight:600;color:var(--ink-3);margin-left:8px}

/* ---- action plan ---- */
.actiongrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}
.actioncard{min-height:258px;text-align:left;background:var(--surface);border:1px solid var(--border);
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

/* ---- insight panels ---- */
.insightgrid{display:grid;grid-template-columns:1.18fr .82fr;gap:16px;align-items:stretch}
.insightstack{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.insightcard{min-height:236px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
  padding:20px;box-shadow:var(--shadow);display:flex;flex-direction:column}
.insightcard h3{font-size:17px;font-weight:800;margin-bottom:4px}
.sample{font-size:12.5px;font-weight:700;color:var(--ink-3);margin-bottom:14px}
.sample b{color:var(--ink-2)}
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

/* ---- section playbook (Quant / Verbal / Data Insights) ---- */
.playbook{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.seccard{background:var(--surface);border:1px solid var(--border);border-top:4px solid var(--seccol,var(--primary));
  border-radius:var(--radius);padding:17px 18px 20px;box-shadow:var(--shadow);display:flex;flex-direction:column}
.seccard .sh{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:15px}
.seccard .sn{font-size:16.5px;font-weight:800;color:var(--seccol,var(--primary));letter-spacing:-.01em}
.seccard .sscore{font-size:12px;font-weight:700;color:var(--ink-2);background:var(--surface-2);
  border:1px solid var(--border);border-radius:20px;padding:3px 11px;white-space:nowrap;flex:none}
.seccard .sscore b{color:var(--seccol,var(--primary));font-weight:800;font-variant-numeric:tabular-nums}
.seccard .bars{flex:1;gap:11px}
.secempty{font-size:13px;color:var(--ink-3);line-height:1.5}
.habits{margin-top:14px;display:flex;flex-wrap:wrap;align-items:center;gap:9px;background:var(--surface);
  border:1px solid var(--border);border-radius:var(--radius-sm);padding:13px 16px;box-shadow:var(--shadow)}
.habits .hk{font-size:13px;font-weight:800;color:var(--ink);flex:none}
.habits .hchip{font-size:12.5px;font-weight:600;color:var(--ink);background:var(--primary-l);
  border-radius:20px;padding:4px 11px;display:inline-flex;gap:6px;align-items:center}
.habits .hchip b{color:var(--primary-d);font-weight:800;font-variant-numeric:tabular-nums}

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
.sectag{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;flex:none}
.sec-Q{background:var(--blue-l);color:var(--blue)} .fill-Q{background:var(--blue)}
.sec-V{background:var(--violet-l);color:var(--violet)} .fill-V{background:var(--violet)}
.sec-DI{background:var(--amber-l);color:var(--amber)} .fill-DI{background:var(--amber)}
.sec-G{background:var(--primary-l);color:var(--primary-d)} .fill-G{background:var(--primary)}

/* ---- score distribution ---- */
.dist{height:310px;min-height:310px;width:100%;position:relative;margin-top:6px}
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
.spark{width:100%;height:230px;min-height:230px}
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

/* ---- about ---- */
.about h2{font-size:26px;font-weight:800;margin-bottom:8px}
.about h3{font-size:16px;font-weight:800;margin:22px 0 6px}
.about p{font-size:15px;color:var(--ink-2);max-width:68ch;margin-bottom:8px}
.about a{color:var(--primary-d);font-weight:600}

footer{border-top:1px solid var(--border);margin-top:40px;padding:30px 0 50px;color:var(--ink-3);font-size:13.5px}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{color:var(--ink-2);font-weight:600}

.hidden{display:none!important}

/* ---- mobile ---- */
@media(max-width:760px){
  .wrap{padding:0 16px}
  .hero{padding:34px 0 8px}
  .bands{grid-template-columns:1fr;gap:11px;max-width:440px}
  .band{padding:16px 17px}
  .band .bblurb{min-height:0}
  .band .barrow{opacity:1;transform:none}
  .actiongrid{grid-template-columns:1fr;gap:12px}
  .actioncard{min-height:0}
  .statrow{grid-template-columns:1fr 1fr;gap:10px}
  .grid2{grid-template-columns:1fr}
  .grid2>.panel{min-height:0}
  .grid3,.insightgrid,.insightstack{grid-template-columns:1fr}
  .playbook{grid-template-columns:1fr;gap:12px}
  .cards,#browseList{grid-template-columns:1fr}
  .dist{height:260px;min-height:260px}
  .heatmap{grid-template-columns:minmax(104px,1.1fr) repeat(3,1fr);gap:5px}
  .hmhead,.hmcell,.hmlabel{min-height:38px}
  .hmhead{font-size:10px}
  .hmlabel,.hmcell{font-size:11px}
  .habits{padding:12px 14px}
  section.block{padding:26px 0}
  .panel{padding:18px}
  .dhero .big{font-size:40px}
  .spark{height:190px;min-height:190px}
}
@media(prefers-reduced-motion:reduce){
  *{transition:none!important;animation:none!important;scroll-behavior:auto!important}
  .barfill,.dist .dbar,.cmp .cbar{transition:none!important}
}
</style></head>
<body>
<header class="bar"><div class="wrap">
  <a class="logo" href="?" onclick="goHome(event)">Prep<b>Signals</b><span class="dot"></span></a>
  <nav class="nav">
    <button id="nav-home" class="on" onclick="showView('home')">Debriefs</button>
    <button id="nav-about" onclick="showView('about')">About</button>
  </nav>
</div></header>

<main id="view-home">
  <div class="wrap">
    <section class="hero">
      <span class="eyebrow"><span class="pulse"></span>__NDEB__ real GMAT debriefs</span>
      <h1>What score are you aiming for?</h1>
      <p class="lede">Get a practical plan from people who <b>actually hit it</b> — what to focus on, what to practice, and which stories prove the pattern.</p>
      <div class="bands" id="bands"></div>
    </section>
  </div>

  <div class="wrap">
    <section class="block" id="results">
      <div class="shead">
        <div>
          <h2 id="resTitle">Your plan for this score range</h2>
          <p class="sub" id="resSub"></p>
        </div>
      </div>
      <div class="statrow" id="statrow"></div>
      <div class="actiongrid" id="actionPlan"></div>
    </section>

    <section class="block" id="patterns">
      <div class="shead"><div>
        <h2>Distilled signals</h2>
        <p class="sub">Directional patterns from this score range. Each card includes the sample behind it so you can judge the strength of the signal.</p>
      </div></div>
      <div class="panel">
        <h3>Where scores land</h3>
        <p class="psub" id="distSub"></p>
        <div class="dist" id="dist"></div>
        <div class="distnote"><span class="key"></span> <span id="distKey"></span></div>
      </div>
      <div class="grid2" style="margin-top:16px">
        <div class="panel insightcard">
          <h3>Typical section split</h3>
          <p class="psub" id="splitSub"></p>
          <div class="seccompare growfill" id="splitViz" style="margin-top:4px"></div>
          <div class="callout" id="splitCall"></div>
        </div>
        <div class="panel insightcard">
          <h3>What they studied with</h3>
          <p class="psub" id="resSub2"></p>
          <div class="bars growfill" id="resBars"></div>
          <button class="insightbtn" id="resExamples" type="button">See resource examples</button>
        </div>
      </div>
      <div class="grid2" style="margin-top:16px">
        <div class="panel insightcard">
          <h3>Prep time &amp; score gain</h3>
          <p class="psub" id="prepSub"></p>
          <div class="minirow" id="prepGain"></div>
          <div class="callout" id="prepCall"></div>
        </div>
        <div class="panel insightcard">
          <h3>Tactic heatmap</h3>
          <p class="psub" id="heatSub"></p>
          <div class="heatmap growfill" id="tacticHeat"></div>
        </div>
      </div>
    </section>

    <section class="block" id="evidence">
      <div class="shead"><div>
        <h2>Evidence behind the plan</h2>
        <p class="sub" id="cardSub"></p>
      </div></div>
      <div class="cards" id="recoCards"></div>
      <button class="morebtn" onclick="jumpBrowse()">Browse all debriefs <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
    </section>

    <section class="block" id="browse">
      <div class="shead"><div>
        <h2>Browse every debrief</h2>
        <p class="sub">All __NDEB__ stories. Search a topic or filter by source.</p>
      </div></div>
      <div class="tools">
        <label class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input id="q" type="search" placeholder="Search title, tactic, or resource…" autocomplete="off">
        </label>
        <select class="pick" id="fBand"><option value="">All scores</option></select>
        <select class="pick" id="fSrc"><option value="">All sources</option></select>
      </div>
      <div id="browseList"></div>
      <div class="empty hidden" id="browseEmpty">No debriefs match that. Try a wider search.</div>
    </section>
  </div>
</main>

<section id="view-about" class="hidden"><div class="wrap about" style="padding:42px 0">
  <h2>About PrepSignals</h2>
  <p>PrepSignals turns hundreds of real GMAT debriefs into a simple question: <b>what did people who hit your target score actually do?</b> Pick a score range and you'll see the tactics that show up most, the resources people leaned on, and the individual stories behind every number.</p>
  <h3>Where the data comes from</h3>
  <p>Every debrief links back to its original public post on Reddit's r/GMAT and GMAT Club. We only summarise — the source is always one tap away so you can read it in full and judge for yourself.</p>
  <h3>Independence</h3>
  <p>PrepSignals is independent and isn't affiliated with GMAC, any prep company, or any course. Resources are named because the original posters named them, not because anyone paid to appear. Debriefs that read like promotions are flagged "Maybe Promo" so you can weigh them.</p>
  <h3>Privacy</h3>
  <p>No accounts, no tracking cookies, no backend. The page is static. We use Vercel's privacy-friendly aggregate analytics to see which ranges and stories are useful — nothing that identifies you.</p>
  <h3>Feedback</h3>
  <p>Spot something off, or want your post removed? The original posts are public summaries, but we honor removal requests — reach out and we'll take it down.</p>
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
    <div class="cards" id="cohortCards"></div>
  </div>
</div></div>

<footer><div class="wrap">
  <span>PrepSignals — independent GMAT debrief signal. Not affiliated with GMAC.</span>
  <span><a href="#" onclick="showView('about');return false">About &amp; sources</a></span>
</div></footer>

<script>
const DEB=__DEB__, DETAILS=__DETAILS__, BANDS=__BANDS__, TT=__TOOLTIPS__;
const RM=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const BANDC={b1:{c:'var(--blue)',d:'var(--blue)',l:'var(--blue-l)'},
            b2:{c:'var(--primary)',d:'var(--primary-d)',l:'var(--primary-l)'},
            b3:{c:'var(--violet)',d:'var(--violet)',l:'var(--violet-l)'}};
let state={band:'b2'};

function track(name,props){try{if(typeof window.va==='function')window.va('event',{name,data:props||{}});}catch(e){}}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function inBand(d,b){return d.total!=null&&d.total>=b.lo&&d.total<=b.hi;}
function bandOf(key){return BANDS.find(b=>b.key===key);}
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

/* strategy item "DI: DI targeted practice" -> {sec:'DI', label:'DI targeted practice'} */
function parseStrat(s){const i=s.indexOf(':');if(i<0)return{sec:'G',label:s};
  let sec=s.slice(0,i).trim(),label=s.slice(i+1).trim();
  if(sec==='General')sec='G'; if(!['Q','V','DI','G'].includes(sec))sec='G';
  return{sec,label};}
const SECNAME={Q:'Quant',V:'Verbal',DI:'Data',G:'General'};

/* ---------- band picker ---------- */
function renderBands(){
  document.getElementById('bands').innerHTML=BANDS.map(b=>{
    const c=BANDC[b.key];
    return `<button class="band ${b.key===state.band?'on':''}" data-k="${b.key}"
      style="--bandc:${c.c};--bandc-d:${c.d};--bandc-l:${c.l}" onclick="pickBand('${b.key}',true)">
      <div class="bnum">${b.label}</div>
      <div class="bname">${esc(b.name)}</div>
      <div class="bblurb">${esc(b.blurb)}</div>
      <div class="bcount"><b>${b.count}</b> debriefs</div>
      <span class="barrow">&rarr;</span>
    </button>`;}).join('');
}
function pickBand(key,scroll){
  state.band=key;
  document.querySelectorAll('.band').forEach(el=>el.classList.toggle('on',el.dataset.k===key));
  const b=bandOf(key);
  history.replaceState({band:key},'', '?band='+b.lo);
  renderResults(); renderPatterns();
  track('band_select',{band:b.label});
  if(scroll){const t=document.getElementById('results');
    const y=t.getBoundingClientRect().top+scrollY-70;
    scrollTo({top:y,behavior:RM?'auto':'smooth'});}
}

/* ---------- results ---------- */
function countUp(el,to,suffix){
  if(RM||to<1){el.textContent=(to||0)+(suffix||'');return;}
  const dur=750,t0=performance.now();
  (function step(t){const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);
    el.textContent=Math.round(to*e)+(suffix||'');if(p<1)requestAnimationFrame(step);})(t0);
}
function renderResults(){
  const b=bandOf(state.band),rows=debsIn(b);
  document.getElementById('resTitle').textContent='Your plan for '+b.label;
  document.getElementById('resSub').innerHTML=`A directional plan distilled from <b>${rows.length}</b> debriefs in this score range. Read the cards first; the stories below are proof, not homework.`;

  const totals=rows.map(d=>d.total).filter(x=>x!=null);
  const preps=rows.map(d=>d.prep_weeks).filter(x=>x!=null);
  const gains=rows.map(d=>d.gain).filter(x=>x!=null);
  const selfn=rows.filter(d=>(d.tags||[]).includes('Self Study')).length;
  const stats=[
    {v:rows.length,l:'debriefs',cls:''},
    {v:median(totals),l:'median score',cls:'green'},
    {v:preps.length?median(preps):null,l:'median weeks prep',cls:''},
    {v:gains.length?'+'+median(gains):(selfn?Math.round(100*selfn/rows.length)+'%':null),
      l:gains.length?'median score gain':'self-study only',cls:'coral'},
  ];
  document.getElementById('statrow').innerHTML=stats.map(s=>
    `<div class="stat ${s.cls}"><div class="v">${s.v==null?'—':s.v}</div><div class="l">${s.l}</div></div>`).join('');

  renderActionPlan(rows,b);
  renderRecoCards(rows,b);
  observeGrow();
}
function renderActionPlan(rows,b){
  const weak=weakestSection(rows),secKey=weak?weak.key:null,secCode=secKey?(secKey==='q'?'Q':secKey==='v'?'V':'DI'):null;
  const secTop=secCode?topStrats(rows,secCode,1)[0]:null;
  const genTop=topStrats(rows,'G',3);
  const resTop=topResources(rows,3);
  const proof=bestExamples(rows,6);
  const prep=rows.map(d=>d.prep_weeks).filter(x=>x!=null),gains=rows.map(d=>d.gain).filter(x=>x!=null);
  const cards=[
    {k:'Section focus',c:'var(--blue)',l:'var(--blue-l)',
      h:weak?`Start with ${weak.name}`:'Start section by section',
      p:weak?`${weak.name} is the lowest median split in this band (${sectionShort(secKey)}${weak.score}). Treat that as the first diagnostic checkpoint, not a verdict.`:'Not enough full section splits here, so start by separating Quant, Verbal, and DI practice.',
      m:secTop?`<b>${pct(secTop[1],rows.length)}%</b> mention ${esc(secTop[0])}`:`<b>${rows.length}</b> examples in range`,
      a:'See section examples',kind:'section'},
    {k:'Practice loop',c:'var(--primary)',l:'var(--primary-l)',
      h:genTop[0]?esc(genTop[0][0]):'Build a review loop',
      p:'The repeated pattern is not just doing more questions. People describe a loop of mocks, review, targeted drills, and test-day execution.',
      m:genTop[0]?`<b>${pct(genTop[0][1],rows.length)}%</b> name this habit`:`<b>${rows.length}</b> debriefs sampled`,
      a:'Open habit examples',kind:'habit'},
    {k:'Resource stack',c:'var(--amber)',l:'var(--amber-l)',
      h:resTop[0]?esc(resTop[0][0]):'Use named materials deliberately',
      p:'Resources are popularity signals, not proof of causality. The useful move is seeing how students combined official material, practice banks, and review.',
      m:resTop[0]?`<b>${pct(resTop[0][1],rows.length)}%</b> mention the top resource`:`<b>0</b> named resources`,
      a:'See resource examples',kind:'resource'},
    {k:'Proof examples',c:'var(--green)',l:'var(--green-l)',
      h:'Read only the highest-signal stories',
      p:'Use debriefs after the plan: look for situations like yours, then copy the process details rather than the exact product stack.',
      m:prep.length||gains.length?`<b>${prep.length}</b> prep-time / <b>${gains.length}</b> gain samples`:`<b>${proof.length}</b> detailed stories`,
      a:'Jump to proof',kind:'proof'},
  ];
  document.getElementById('actionPlan').innerHTML=cards.map(x=>`
    <div class="actioncard" style="--ac:${x.c};--acl:${x.l}">
      <span class="k">${x.k}</span>
      <h3>${x.h}</h3>
      <p>${x.p}</p>
      <div class="metric">${x.m}</div>
      <button class="actbtn" type="button" onclick="handleAction('${x.kind}')">${x.a}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </div>`).join('');
}
function handleAction(kind){
  const b=bandOf(state.band),rows=debsIn(b);
  track('action_click',{kind,band:b.label});
  if(kind==='proof'){jumpEvidence();return;}
  if(kind==='section'){
    const weak=weakestSection(rows),key=weak&&weak.key?weak.key:'q';
    const pool=rowsForSection(rows,key);
    openCohort(`${sectionLabel(key)} examples`,`${pool.length} ${b.label} debriefs with ${sectionLabel(key)} scores, tactics, or notes.`,bestExamples(pool,12),{kind:'section',band:b.label,section:sectionLabel(key),sample:pool.length});
    return;
  }
  if(kind==='habit'){
    const top=topStrats(rows,'G',1)[0];
    const pool=top?rowsForStrat(rows,'G',top[0]):rows;
    openCohort(top?`${top[0]} examples`:'Practice-loop examples',`Directional examples from ${b.label} debriefs that mention this habit.`,bestExamples(pool,12),{kind:'habit',band:b.label,tactic:top&&top[0],sample:pool.length});
    return;
  }
  if(kind==='resource'){
    const top=topResources(rows,1)[0];
    const pool=top?rows.filter(d=>(d.resources||[]).includes(top[0])):rows;
    openCohort(top?`${top[0]} examples`:'Resource examples',`These are posts that named the resource. Treat this as usage context, not an effectiveness ranking.`,bestExamples(pool,12),{kind:'resource',band:b.label,resource:top&&top[0],sample:pool.length});
  }
}
function debCardHTML(d){
  const det=DETAILS[d.id]||{};
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
function renderRecoCards(rows,b){
  /* prefer the richest stories: most tactics + has detail notes + most replies */
  const scored=bestExamples(rows,6);
  document.getElementById('cardSub').textContent=`Six detailed ${b.label} stories selected for tactics, section notes, replies, prep/gain context, and named resources. Optional reading when you want proof behind the plan.`;
  document.getElementById('recoCards').innerHTML=scored.map(debCardHTML).join('');
}

/* ---------- section playbook (Quant / Verbal / Data Insights) ---------- */
const PLAYSEC=[['Q','Quant','q'],['V','Verbal','v'],['DI','Data Insights','di']];
const SECCOL={Q:'var(--blue)',V:'var(--violet)',DI:'var(--amber)'};
function renderPlaybook(rows,b){
  const contrib=rows.filter(d=>(d.strat||[]).length),denom=contrib.length||rows.length;
  document.getElementById('playSub').innerHTML=contrib.length
    ?`Quant, Verbal and Data Insights reward different things. Among the <b>${contrib.length}</b> ${b.label} debriefs that spelled out their approach, here's each section's playbook — and the score people typically posted in it.`
    :`Quant, Verbal and Data Insights reward different things — open the stories below for section-by-section detail.`;
  document.getElementById('playbook').innerHTML=PLAYSEC.map(([S,name,k])=>{
    const sc=rows.map(d=>d[k]).filter(x=>x!=null),typ=sc.length?Math.round(median(sc)):null;
    const cnt={};contrib.forEach(d=>(d.strat||[]).forEach(s=>{const p=parseStrat(s);if(p.sec===S)cnt[p.label]=(cnt[p.label]||0)+1;}));
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,5),maxc=top.length?top[0][1]:1;
    const body=top.length
      ?`<div class="bars">${top.map(([label,n])=>{const pct=Math.round(100*n/denom);
        return `<div class="barrow"><div class="blabel"><span class="bname"><span class="txt">${esc(label)}</span></span><span class="bpct">${pct}%</span></div>
        <div class="bartrack"><div class="barfill" style="--w:${Math.round(100*n/maxc)}%;background:${SECCOL[S]}"></div></div></div>`;}).join('')}</div>`
      :`<p class="secempty">No commonly-named ${name} tactics in this range yet — the stories below still cover it.</p>`;
    return `<div class="seccard" style="--seccol:${SECCOL[S]}">
      <div class="sh"><span class="sn">${name}</span>${typ!=null?`<span class="sscore">Typical&nbsp;<b>${typ}</b></span>`:''}</div>
      ${body}</div>`;}).join('');
  /* habits that cut across all three (General tactics) */
  const g={};contrib.forEach(d=>(d.strat||[]).forEach(s=>{const p=parseStrat(s);if(p.sec==='G')g[p.label]=(g[p.label]||0)+1;}));
  const gt=Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,5),hb=document.getElementById('habits');
  hb.innerHTML=gt.length?`<span class="hk">Across all sections</span>`+gt.map(([l,n])=>`<span class="hchip">${esc(l)} <b>${Math.round(100*n/denom)}%</b></span>`).join(''):'';
  hb.style.display=gt.length?'':'none';
}

/* ---------- patterns ---------- */
function renderPatterns(){
  const b=bandOf(state.band),rows=debsIn(b);
  const pts=[];for(let s=655;s<=805;s+=10)pts.push(s);
  const cnt={};DEB.forEach(d=>{if(d.total!=null)cnt[d.total]=(cnt[d.total]||0)+1;});
  const max=Math.max(...pts.map(s=>cnt[s]||0),1);
  const W=940,H=270,padX=28,padT=28,padB=42,base=H-padB,plotH=H-padT-padB,step=(W-padX*2)/pts.length,bw=Math.min(38,step*.72);
  const bars=pts.map((s,i)=>{
    const n=cnt[s]||0,inb=s>=b.lo&&s<=b.hi,h=n?Math.max(6,Math.round(n/max*plotH)):0;
    const x=padX+i*step+(step-bw)/2,y=base-h,show=(s%20===5)||s===805;
    return `<rect class="dbar ${inb?'inband':'all'}" x="${x.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${h}" rx="7">
      <title>${s}: ${n} debriefs</title></rect>
      ${n>=10?`<text class="dcount" x="${(x+bw/2).toFixed(1)}" y="${Math.max(15,y-8)}" text-anchor="middle">${n}</text>`:''}
      ${show?`<text class="dlabel ${inb?'inband':''}" x="${(x+bw/2).toFixed(1)}" y="${H-14}" text-anchor="middle">${s}</text>`:''}`;
  }).join('');
  document.getElementById('dist').innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score distribution histogram">
    <defs><linearGradient id="distGrad" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#7c5cf0"/><stop offset="1" stop-color="#5b5bd6"/></linearGradient></defs>
    <line class="dbase" x1="${padX}" x2="${W-padX}" y1="${base}" y2="${base}"/>${bars}</svg>`;
  const mode=pts.reduce((a,s)=>(cnt[s]||0)>(cnt[a]||0)?s:a,655);
  document.getElementById('distSub').textContent=`All __NDEB__ debriefs by official total score. The busiest score is ${mode}; your selected band is highlighted.`;
  document.getElementById('distKey').textContent=`Your range, ${b.label}`;

  /* typical section split (median Q/V/DI for this band) */
  const cm={q:'var(--blue)',v:'var(--violet)',di:'var(--amber)'};
  const slo=55,shi=90,sscale=v=>Math.max(2,Math.min(100,Math.round(100*(v-slo)/(shi-slo))));
  const complete=rows.filter(d=>d.q!=null&&d.v!=null&&d.di!=null);
  document.getElementById('splitSub').innerHTML=`Median section scores among <b>${complete.length}</b> ${b.label} debriefs with complete Q/V/DI splits.`;
  const med=sectionMedians(rows),weak=weakestSection(rows);
  document.getElementById('splitViz').innerHTML=[['q','Quant'],['v','Verbal'],['di','Data Insights']].map(([k,name])=>{
    const m=med[k]!=null?Math.round(med[k]):null;
    if(m==null)return '';
    return `<div class="cmp"><div class="cl">${name}</div>
      <div class="ctrack"><div class="cbar" style="--w:${sscale(m)}%;background:${cm[k]}"></div></div>
      <div class="cscore" style="color:${cm[k]}">${m}</div></div>`;}).join('');
  document.getElementById('splitCall').innerHTML=weak
    ?`<b>${weak.name}</b> is the lowest median split in this range. Use that as a diagnostic prompt, then compare against the examples.`
    :`Not enough complete section splits to name a bottleneck confidently.`;

  /* resources */
  const top=topResources(rows,6),mx=top.length?top[0][1]:1;
  document.getElementById('resSub2').innerHTML=`Most-named resources among <b>${rows.length}</b> ${b.label} scorers. Popularity only, not proof of effectiveness.`;
  document.getElementById('resBars').innerHTML=top.map(([r,n])=>{const pct=Math.round(100*n/rows.length);
    return `<div class="barrow"><div class="blabel"><span class="bname"><span class="txt">${esc(r)}</span></span><span class="bpct">${pct}%</span></div>
      <div class="bartrack"><div class="barfill" style="--w:${Math.round(100*n/mx)}%"></div></div></div>`;}).join('');
  const rb=document.getElementById('resExamples');
  rb.onclick=()=>{track('insight_open',{kind:'resource',band:b.label});handleAction('resource');};

  /* prep and gain snapshots */
  const prep=rows.map(d=>d.prep_weeks).filter(x=>x!=null),gains=rows.map(d=>d.gain).filter(x=>x!=null);
  const attempts=rows.map(d=>d.attempts).filter(x=>x!=null),self=rows.filter(d=>(d.tags||[]).includes('Self Study')).length;
  document.getElementById('prepSub').innerHTML=`Only some debriefs report prep length or start score, so this panel is context rather than a target.`;
  document.getElementById('prepGain').innerHTML=[
    ['Median prep',prep.length?fmt(median(prep))+'w':'—',prep.length],
    ['Median gain',gains.length?'+'+fmt(median(gains)):'—',gains.length],
    ['Median attempts',attempts.length?fmt(median(attempts)):'—',attempts.length],
    ['Self-study flag',self?pct(self,rows.length)+'%':'—',rows.length],
  ].map(([l,n,s])=>`<div class="ministat"><div class="n">${n}</div><div class="l">${l}<br><span style="color:var(--ink-3);font-weight:650">n=${s}</span></div></div>`).join('');
  document.getElementById('prepCall').innerHTML=`Use these as planning bounds: <b>${prep.length}</b> posts state prep time and <b>${gains.length}</b> state a start-to-official score gain.`;

  /* compact tactic heatmap */
  const candidates=[
    ...topStrats(rows,'Q',2).map(x=>({sec:'Q',label:x[0]})),
    ...topStrats(rows,'V',2).map(x=>({sec:'V',label:x[0]})),
    ...topStrats(rows,'DI',2).map(x=>({sec:'DI',label:x[0]})),
    ...topStrats(rows,'G',2).map(x=>({sec:'G',label:x[0]})),
  ].filter((x,i,a)=>a.findIndex(y=>y.sec===x.sec&&y.label===x.label)===i).slice(0,6);
  document.getElementById('heatSub').innerHTML=`Share of each score band mentioning repeated tactics. Tap a cell for examples.`;
  const cells=[];
  cells.push('<div class="hmhead"></div>');
  BANDS.forEach(bd=>cells.push(`<div class="hmhead">${bd.label.replace(' – ','-')}</div>`));
  candidates.forEach(item=>{
    cells.push(`<div class="hmlabel">${esc(item.label)}</div>`);
    BANDS.forEach(bd=>{
      const br=debsIn(bd),pool=rowsForStrat(br,item.sec,item.label),p=pct(pool.length,br.length),a=Math.max(.08,Math.min(.56,p/100*.9));
      cells.push(`<div class="hmcell" style="--a:${a.toFixed(2)}"><button type="button" onclick='openHeatCohort(${JSON.stringify(item.sec)},${JSON.stringify(item.label)},${JSON.stringify(bd.key)})'>${p}%</button></div>`);
    });
  });
  document.getElementById('tacticHeat').innerHTML=cells.join('');
  observeGrow();
}

/* ---------- browse all ---------- */
function renderBrowse(){
  const q=(document.getElementById('q').value||'').toLowerCase().trim();
  const fb=document.getElementById('fBand').value, fs=document.getElementById('fSrc').value;
  let rows=DEB.slice();
  if(fb){const b=bandOf(fb);rows=rows.filter(d=>inBand(d,b));}
  if(fs)rows=rows.filter(d=>d.source===fs);
  if(q)rows=rows.filter(d=>(d.title+' '+(d.strat||[]).join(' ')+' '+(d.resources||[]).join(' ')).toLowerCase().includes(q));
  rows.sort((a,b)=>b.total-a.total);
  const list=document.getElementById('browseList');
  document.getElementById('browseEmpty').classList.toggle('hidden',rows.length>0);
  list.innerHTML=rows.slice(0,60).map(debCardHTML).join('');
}

/* ---------- cohort proof drawer ---------- */
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
  /* scale 55-90 so real differences (most section scores sit 75-90) are visible */
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
  const W=760,H=230,padL=46,padR=28,padT=28,padB=38,xs=(i)=>padL+i*(W-padL-padR)/(tl.length-1);
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
function showView(v){
  document.getElementById('view-home').classList.toggle('hidden',v!=='home');
  document.getElementById('view-about').classList.toggle('hidden',v!=='about');
  document.getElementById('nav-home').classList.toggle('on',v==='home');
  document.getElementById('nav-about').classList.toggle('on',v==='about');
  if(v==='about')track('about_open',{});
  scrollTo(0,0);
}
function goHome(e){if(e)e.preventDefault();if(document.getElementById('detail').classList.contains('on'))doClose();
  if(document.getElementById('cohort').classList.contains('on'))closeCohort();
  history.pushState({},'', '?');showView('home');scrollTo(0,0);}
function jumpBrowse(){const t=document.getElementById('browse');
  scrollTo({top:t.getBoundingClientRect().top+scrollY-70,behavior:RM?'auto':'smooth'});}
function jumpEvidence(){const t=document.getElementById('evidence');
  scrollTo({top:t.getBoundingClientRect().top+scrollY-70,behavior:RM?'auto':'smooth'});}

window.addEventListener('popstate',e=>{
  const s=e.state||{};
  if(s.d){openDebrief(s.d,false);}
  else{doClose();
    const p=new URLSearchParams(location.search);
    if(p.get('band')){const b=BANDS.find(x=>String(x.lo)===p.get('band'));if(b&&b.key!==state.band){state.band=b.key;renderBands();renderResults();renderPatterns();}}
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
function initFilters(){
  document.getElementById('fBand').innerHTML='<option value="">All scores</option>'+
    BANDS.map(b=>`<option value="${b.key}">${b.label}</option>`).join('');
  const srcs=[...new Set(DEB.map(d=>d.source))].sort();
  document.getElementById('fSrc').innerHTML='<option value="">All sources</option>'+
    srcs.map(s=>`<option>${esc(s)}</option>`).join('');
  ['q','fBand','fSrc'].forEach(id=>document.getElementById(id).addEventListener('input',renderBrowse));
}
(function init(){
  const p=new URLSearchParams(location.search);
  if(p.get('band')){const b=BANDS.find(x=>String(x.lo)===p.get('band'));if(b)state.band=b.key;}
  renderBands();initFilters();renderResults();renderPatterns();renderBrowse();
  observeGrow();
  const did=p.get('d');
  if(did&&DEB.find(x=>x.id===did)){openDebrief(did,false);history.replaceState({d:did},'', '?d='+did);}
})();
</script>
</body></html>"""


if __name__ == "__main__":
    main()
