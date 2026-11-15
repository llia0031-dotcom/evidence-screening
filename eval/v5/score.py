#!/usr/bin/env python3
"""Score v5: v3's resumes at effort "low", then a second review of every "met" verdict the split arms gave.

  python eval/v5/score.py SCREEN.jsonl REVIEW.jsonl      writes SCREEN.summary.md and .summary.json

Rules (fixed in eval/v5/PREREGISTRATION.md before the run):
  * screening: v3's rules and answer key (eval/v3/score.py), applied to the low-effort outputs; v3's medium-effort run
    (eval/v3/results/run-2026-11-14.jsonl) is shown beside it;
  * the model's own wrong "met" verdicts (split and split-self, both runs): how many the quote check stops, how many the
    review rejects (each reviewer arm and run), and how many get through both;
  * the model's own right "met" verdicts: how many the check fails and how many the review rejects (false alarms);
  * rates are given only when there are at least 5 wrong "met" verdicts; below that, counts only.
Standard library only.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3"))
import score as V3  # noqa: E402

V3_RUN = HERE.parent / "v3" / "results" / "run-2026-11-14.jsonl"
ARMS = ["plain", "split", "split-self"]
REVIEWERS = ["verify-full", "verify-fact"]


def screening(path):
    table = V3.rows(V3.load(path))
    runs = sorted({k[1] for k in table})
    out = {}
    for arm in ARMS:
        c = defaultdict(int)
        wt = defaultdict(int)
        for run in runs:
            for i in V3.index:
                row = table.get((arm, run, i["id"]))
                if not row:
                    continue
                for r in V3.REQS:
                    v, g = row["verdicts"].get(r), V3.gold_met(i["id"], r)
                    c["cells"] += 1
                    c["correct"] += v in ("met", "not_met") and (v == "met") == g
                    c["wrong_met"] += v == "met" and not g
                    c["wrong_not_met"] += v != "met" and g
                    if v == "met" and not g:
                        wt[V3.label(i["id"], r)["trap"]] += 1
                c["decisions"] += 1
                c["decision_correct"] += row["decision"] == V3.gold_decision(i["id"])
        out[arm] = {**c, "wrong_met_by_trap": dict(sorted(wt.items()))}
    return out


def rate(a, b):
    return f"{a}/{b}" + (f" ({100 * a / b:.1f}%)" if b >= 5 else "")


def main(screen_path: Path, review_path: Path) -> int:
    raw = [json.loads(l) for l in screen_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    rev = [json.loads(l) for l in review_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    items = {x["id"]: x for x in json.loads((HERE / "review-items.json").read_text(encoding="utf-8"))["items"]}
    S = {"screen_file": screen_path.name, "review_file": review_path.name,
         "cost": {"screen": sum(r.get("cost", 0) for r in raw), "review": sum(r.get("cost", 0) for r in rev)},
         "failed": {"screen": sum(1 for r in raw if not r.get("ok")), "review": sum(1 for r in rev if not r.get("ok"))},
         "efforts": sorted({r.get("effort") for r in raw}), "review_efforts": sorted({r.get("effort") for r in rev}),
         "prompt_shas": sorted({r.get("prompt_sha") for r in raw}), "review_prompt_shas": sorted({r.get("prompt_sha") for r in rev}),
         "send_modes": sorted({r.get("send_mode") for r in raw + rev})}
    S["low"] = screening(screen_path)
    S["medium_v3"] = screening(V3_RUN)

    flagged = defaultdict(dict)  # (reviewer, run) -> item id -> True when the reviewer says "wrong"
    for r in rev:
        if r.get("ok"):
            flagged[(r["arm"], r["run"])][r["item"]] = r["output"].get("verdict") == "wrong"
    review_runs = sorted({k[1] for k in flagged})
    by = {}
    for arm in ("split", "split-self"):
        mine = [x for x in items.values() if x["arm"] == arm]
        wrong = [x for x in mine if x["kind"] == "wrong"]
        right = [x for x in mine if x["kind"] == "right"]
        o = {"met": len(mine), "wrong": len(wrong), "right": len(right),
             "check_stops_wrong": sum(x["check"] != "supported" for x in wrong), "check_fails_right": sum(x["check"] != "supported" for x in right), "review": {}}
        for rv in REVIEWERS:
            for run in review_runs:
                f = flagged[(rv, run)]
                o["review"][f"{rv} run {run}"] = {
                    "rejects_wrong": sum(f.get(x["id"], False) for x in wrong),
                    "rejects_right": sum(f.get(x["id"], False) for x in right),
                    "through_both": sum(1 for x in wrong if x["check"] == "supported" and not f.get(x["id"], False)),
                    "missing": sum(1 for x in mine if x["id"] not in f),
                }
        o["wrong_cases"] = [f"{x['id']} ({x['trap']}; check {x['check']})" for x in wrong]
        by[arm] = o
    S["review"] = by
    (screen_path.with_suffix(".summary.json")).write_text(json.dumps(S, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")

    L = [f"# v5 results: {screen_path.name} and {review_path.name}", "",
         f"Rules: `eval/v5/score.py`, fixed in `eval/v5/PREREGISTRATION.md`. Screening effort: {', '.join(S['efforts'])}; review effort: {', '.join(S['review_efforts'])}. "
         f"Sent through: {', '.join(S['send_modes'])}. Prompt hashes: screening {', '.join(S['prompt_shas'])}, review {', '.join(S['review_prompt_shas'])}. "
         f"Failed: screening {S['failed']['screen']}, review {S['failed']['review']}. Cost at batch price: screening US${S['cost']['screen']:.4f}, review US${S['cost']['review']:.4f}.", "",
         "## Screening: low effort against v3's medium effort (two runs, 288 verdicts per arm)", "",
         "| Arm | Correct, low | Correct, medium (v3) | Wrong met, low | Wrong met, medium | Wrong not met, low | Decisions right, low |", "|---|---|---|---|---|---|---|"]
    for arm in ARMS:
        a, m = S["low"][arm], S["medium_v3"][arm]
        L.append(f"| {arm} | {a['correct']}/{a['cells']} | {m['correct']}/{m['cells']} | {a['wrong_met']} | {m['wrong_met']} | {a['wrong_not_met']} | {a['decision_correct']}/{a['decisions']} |")
    L += ["", "Wrong met verdicts by trap type, low effort: " + "; ".join(f"{arm} {json.dumps(S['low'][arm]['wrong_met_by_trap'], ensure_ascii=False)}" for arm in ARMS), "",
          "## The model's own met verdicts: what the check and the review do", ""]
    for arm, o in by.items():
        L += [f"### {arm}: {o['met']} met verdicts, {o['wrong']} wrong, {o['right']} right", "",
              f"Quote check: stops {rate(o['check_stops_wrong'], o['wrong'])} wrong; fails {rate(o['check_fails_right'], o['right'])} right.", "",
              "| Reviewer | Rejects wrong | Rejects right (false alarms) | Wrong through check and review | Not reviewed |", "|---|---|---|---|---|"]
        for k, t in o["review"].items():
            L.append(f"| {k} | {rate(t['rejects_wrong'], o['wrong'])} | {rate(t['rejects_right'], o['right'])} | {t['through_both']} | {t['missing']} |")
        L += ["", "Wrong cases: " + ("; ".join(o["wrong_cases"]) or "none"), ""]
    md = "\n".join(L) + "\n"
    screen_path.with_suffix(".summary.md").write_text(md, encoding="utf-8", newline="\n")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]), Path(sys.argv[2])))
