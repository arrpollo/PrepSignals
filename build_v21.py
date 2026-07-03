#!/usr/bin/env python3
"""v.21 — PrepSignals: personalized study planner and account menu.

Extends v.20. Sources:

  src/template.html  page shell (views, overlays, nav, terms/privacy) with __TOKEN__ holes
  src/app.css        design system + components (edit this, not the output)
  src/app.js         app + router (edit this, not the output)
  src/auth.js        Supabase auth: signup/login/verify/reset, sync, gating
  src/admin.js       /admin area (role-gated via Supabase RLS)

This script reads debriefs.json + post_details.json, computes the score
bands/buckets, and writes the deployable static site next to itself:

  index.html   shell with tokens filled (title, counts, dates, build id)
  data.js      window.__PS_DATA__ = {...}  (~0.9 MB, cached separately)
  app.css      copied from src/
  app.js       src/app.js + src/auth.js + src/admin.js concatenated

Deploy = push this folder; vercel.json rewrites every path to /index.html
(filesystem wins first, so /data.js, /app.js, /assets/* pass through).

What changed vs v.20.2 (same data, same static architecture):
  1. /me is now a personalized Study Planner with rule-based assistant prompts.
  2. Account/profile/security/admin links live in the avatar menu on every viewport.
  3. Progress entries support lightweight review-log fields.
  4. About has a Supabase-backed feedback form and admin feedback inbox.
  5. Signup nudges are contextual instead of front-loaded in the hero.

Setup:    see supabase/SETUP.md (run supabase/setup.sql once, enable
          email confirmation, set redirect URLs).
Rebuild:  python3 gmat_research/v.21/build_v21.py
Preview:  python3 gmat_research/v.21/serve.py 8781   (SPA fallback included)
"""
import json
import shutil
import statistics as st
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / "src"
JS_PARTS = ["app.js", "auth.js", "admin.js"]  # concatenated into app.js in order


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

    tooltips = {
        "Maybe Promo": "Possible promotional signals (brand-endorsement framing, a vendor "
                       "rep in comments, or readers asking if it's an ad) — open it and judge.",
        "Self Study": "Used only free resources (GMAT Club, GMAT Ninja, Official Guide, "
                      "Official Mocks) or no named resource at all — no paid prep course.",
    }

    payload = {"DEB": deb, "DETAILS": details, "BANDS": bands, "CURB": curb,
               "WEEKB": weekb, "GAINB": gainb, "PREPB": prepb, "TT": tooltips}
    data_js = ("/* generated by build_v21.py — do not edit */\n"
               "window.__PS_DATA__="
               + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
               + ";\n")
    (BASE / "data.js").write_text(data_js)

    build_id = time.strftime("%Y%m%d%H%M")
    html = ((SRC / "template.html").read_text()
            .replace("__NDEB__", str(len(deb)))
            .replace("__MEDIAN__", str(int(st.median(scores))) if scores else "—")
            .replace("__MINDATE__", min_date).replace("__MAXDATE__", max_date)
            .replace("__BUILD__", build_id))
    (BASE / "index.html").write_text(html)

    shutil.copyfile(SRC / "app.css", BASE / "app.css")
    app_js = "\n".join((SRC / p).read_text() for p in JS_PARTS)
    (BASE / "app.js").write_text(app_js)

    kb = lambda p: f"{(BASE / p).stat().st_size / 1024:.0f} KB"
    print(f"built {build_id}: index.html ({kb('index.html')}), data.js ({kb('data.js')}), "
          f"app.css ({kb('app.css')}), app.js ({kb('app.js')})")
    print(f"{len(deb)} debriefs, {len(details)} detail pages.")
    for b in bands:
        print(f"  target {b['label']}: {b['count']}")


if __name__ == "__main__":
    main()
