#!/usr/bin/env python3
"""Scoring for the second-judgement test.

  python eval/verify/score.py RESULTS.jsonl      writes RESULTS.summary.md and .summary.json

Rules (fixed in eval/verify/PREREGISTRATION.md before the run):
  * caught = a misreading the reviewer judges "wrong"; false alarm = a right answer the reviewer judges "wrong";
    a failed or missing review counts as "right" (nothing flagged);
  * counted per arm and run, overall and (for misreadings) by trap type, and summed over the two runs;
  * baseline "re-judge": a fresh judgement that never sees the answer, taken from the stored v3 plain-arm runs 1 and 2
    (eval/v3/results/run-2026-11-14.jsonl): an item is flagged when plain judged that requirement not met. No new calls.
Standard library only.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3"))
import score as V3  # noqa: E402

ARMS = ["verify-full", "verify-fact"]
V3_RESULTS = V3.ROOT / "eval" / "v3" / "results" / "run-2026-11-14.jsonl"
items = json.loads((HERE / "items.json").read_text(encoding="utf-8"))["items"]
by_id = {x["id"]: x for x in items}


def pct(a, b):
    return "—" if not b else f"{a}/{b} ({100 * a / b:.1f}%)"


def tally(flags):
    """flags: {item_id: bool flagged} for one arm and run."""
    t = {"misreadings": 0, "caught": 0, "right": 0, "false_alarms": 0, "by_trap": defaultdict(lambda: [0, 0])}
    for x in items:
        f = flags.get(x["id"], False)
        if x["kind"] == "misreading":
            t["misreadings"] += 1
            t["caught"] += f
            t["by_trap"][x["trap"]][0] += f
            t["by_trap"][x["trap"]][1] += 1
        else:
            t["right"] += 1
            t["false_alarms"] += f
    t["by_trap"] = {k: v for k, v in sorted(t["by_trap"].items())}
    return t


def rejudge():
    table = V3.rows(V3.load(V3_RESULTS))
    out = {}
    for run in (1, 2):
        row_of = {iid: table.get(("plain", run, iid)) for iid in V3.by_id}
        out[run] = {x["id"]: (row_of[x["resume"]] or {}).get("verdicts", {}).get(x["req"]) != "met" for x in items}
    return out


def score(path: Path) -> int:
    recs = {}
    cost = defaultdict(float)
    failed = defaultdict(int)
    modes, models, shas = set(), set(), set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        key = (r["arm"], r["run"], r["item"])
        cost[r["arm"]] += r.get("cost", 0)
        modes.add(r.get("send_mode", ""))
        shas.add(r.get("prompt_sha", ""))
        if r.get("model_served"):
            models.add(r["model_served"])
        if not r.get("ok"):
            failed[r["arm"]] += 1
        if r.get("ok") or key not in recs:
            recs[key] = r
    runs = sorted({k[1] for k in recs})
    S = {"file": path.name, "runs": runs, "cost": dict(cost), "failed": dict(failed), "send_modes": sorted(modes), "models": sorted(models),
         "prompt_shas": sorted(shas), "arms": {}}
    for arm in ARMS:
        S["arms"][arm] = {}
        for run in runs:
            flags = {}
            for x in items:
                r = recs.get((arm, run, x["id"]))
                flags[x["id"]] = bool(r and r.get("ok") and (r.get("output") or {}).get("verdict") == "wrong")
            S["arms"][arm][run] = tally(flags)
    S["arms"]["re-judge (v3 plain, no new calls)"] = {run: tally(f) for run, f in rejudge().items()}
    # Run 1 against run 2: items whose review differs between the two runs (secondary).
    S["run_to_run"] = {}
    if len(runs) >= 2:
        for arm in ARMS:
            diff = 0
            for x in items:
                v = [((recs.get((arm, run, x["id"])) or {}).get("output") or {}).get("verdict") for run in runs[:2]]
                diff += v[0] != v[1]
            S["run_to_run"][arm] = diff

    path.with_suffix(".summary.json").write_text(json.dumps(S, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    n_right = sum(x["kind"] == "right" for x in items)
    n_mis = sum(x["kind"] == "misreading" for x in items)
    L = [f"# Second-judgement results: {S['file']}", "",
         f"Review set: {n_right} right \"met\" answers from v3 and {n_mis} seeded misreadings. Runs: {', '.join(map(str, runs))}. "
         f"Rules: `eval/verify/score.py`, fixed in `eval/verify/PREREGISTRATION.md`.", "",
         f"Sent through: {', '.join(S['send_modes'])}. Models served: {', '.join(S['models'])}. Prompt hash: {', '.join(S['prompt_shas'])}. "
         f"Cost at batch price: " + ", ".join(f"{a} US${c:.4f}" for a, c in S["cost"].items()) + f"; total US${sum(S['cost'].values()):.4f}. "
         f"Failed reviews: {sum(S['failed'].values())}.", "",
         "| Reviewer | Run | Misreadings caught | Right answers flagged (false alarms) |", "|---|---|---|---|"]
    for arm, per_run in S["arms"].items():
        for run, t in per_run.items():
            L.append(f"| {arm} | {run} | {pct(t['caught'], t['misreadings'])} | {pct(t['false_alarms'], t['right'])} |")
        tot_c = sum(t["caught"] for t in per_run.values())
        tot_m = sum(t["misreadings"] for t in per_run.values())
        tot_f = sum(t["false_alarms"] for t in per_run.values())
        tot_r = sum(t["right"] for t in per_run.values())
        L.append(f"| {arm} | both | {pct(tot_c, tot_m)} | {pct(tot_f, tot_r)} |")
    L += ["", "Misreadings caught by trap type (both runs):", ""]
    for arm, per_run in S["arms"].items():
        traps = defaultdict(lambda: [0, 0])
        for t in per_run.values():
            for k, (c, n) in t["by_trap"].items():
                traps[k][0] += c
                traps[k][1] += n
        L.append(f"- {arm}: " + "; ".join(f"{k} {c}/{n}" for k, (c, n) in sorted(traps.items())))
    if S["run_to_run"]:
        L += ["", "Items whose review differs between run 1 and run 2: " + "; ".join(f"{a} {pct(d, len(items))}" for a, d in S["run_to_run"].items()) + "."]
    md = "\n".join(L) + "\n"
    path.with_suffix(".summary.md").write_text(md, encoding="utf-8", newline="\n")
    print(md)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("results")
    return score(Path(p.parse_args(argv).results))


if __name__ == "__main__":
    sys.exit(main())
