#!/usr/bin/env python3
"""Self-check and scoring for the v2 evaluation (new resumes, how the quote check is wired in).

  python eval/v2/score.py --check            check the v2 test set itself
  python eval/v2/score.py RESULTS.jsonl      score a run; writes RESULTS.summary.md and .summary.json

Rules (fixed in eval/v2/PREREGISTRATION.md before the run):
  * accuracy: each (resume version, requirement, run) verdict against data/v2/gold.json; a missing verdict is wrong;
  * "+ script": the checked text and its quotes go through the evidence-check script (frozen copy) with the resume
    version as the only source. Checked text: `finding` in the evidence arm, `resume_fact` in split and split-self.
    A met verdict that does not pass counts as not met, and an advance becomes reject;
  * lost = met in the key, verdict met, fails the check; caught = not met in the key, verdict met, fails the check;
  * requirements whose text contains a figure (EN-J1 R4, R5; EN-J2 R6; ZH-J1 R4, R5; ZH-J2 R6) are reported apart;
  * stability (secondary): verdict and decision flips against the reference name in the same run; noise is the same
    version in run 1 against run 2.
Standard library only.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
V2 = DATA / "v2"
INST = V2 / "instances"
REQS = ["R1", "R2", "R3", "R4", "R5", "R6"]
ARMS = ["plain", "evidence", "split", "split-self"]
CHECKED = {"evidence": "finding", "split": "resume_fact", "split-self": "resume_fact"}

spec = importlib.util.spec_from_file_location("check_evidence_frozen", ROOT / "eval" / "frozen" / "check_evidence.py")
ce = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ce)

jobs = {j["id"]: j for j in json.loads((DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]}
gold = json.loads((V2 / "gold.json").read_text(encoding="utf-8"))["resumes"]
index = json.loads((INST / "index.json").read_text(encoding="utf-8"))["instances"]
by_id = {i["id"]: i for i in index}
texts = {i["id"]: (INST / i["file"]).read_text(encoding="utf-8") for i in index}
FIGURE_REQS = {(jid, r["id"]) for jid, j in jobs.items() for r in j["requirements"] if ce.numbers_in(r["text"])}
_src = {}


def sources(iid):
    if iid not in _src:
        f = by_id[iid]["file"]
        _src[iid] = {f: ce.Source(f, INST / f, texts[iid])}
    return _src[iid]


def gold_met(iid, r):
    return gold[by_id[iid]["base"]]["labels"][r]["met"]


def gold_decision(iid):
    return "advance" if all(gold_met(iid, r) for r in REQS) else "reject"


def check(iid, text, quotes):
    f = by_id[iid]["file"]
    res = ce.check_claim({"id": "x", "text": text, "evidence": [{"source": f, "quote": q} for q in quotes]}, sources(iid))
    return res["status"], sum(e["found"] for e in res["evidence"]), len(quotes)


# ------------------------------------------------------------------ self-check

def self_check() -> int:
    problems = []
    for iid, t in texts.items():
        if "{{" in t:
            problems.append(f"{iid}: placeholder left")
    for base, g in gold.items():
        if sorted(g["labels"]) != REQS:
            problems.append(f"{base}: requirement ids")
        versions = [i for i in index if i["base"] == base]
        if len(versions) != 4:
            problems.append(f"{base}: {len(versions)} versions")
        for r, lab in g["labels"].items():
            if lab["met"]:
                for v in versions:
                    if lab["anchor"] not in texts[v["id"]]:
                        problems.append(f"{v['id']} {r}: anchor not in resume")
                    elif check(v["id"], lab["anchor"], [lab["anchor"]])[0] != "supported":
                        problems.append(f"{v['id']} {r}: anchor fails the script")
            elif not lab.get("why"):
                problems.append(f"{base} {r}: no reason for an unmet label")
    cells = len(index) * len(REQS)
    met = sum(gold_met(i["id"], r) for i in index for r in REQS)
    fig = sum(1 for i in index for r in REQS if (i["job"], r) in FIGURE_REQS)
    print(f"v2: {len(gold)} base resumes, {len(index)} versions; {cells} cells per run, {met} met ({met / cells:.0%}); "
          f"{fig} cells on requirements with a figure; advance in the key: {sum(gold_decision(i['id']) == 'advance' for i in index)} versions")
    if problems:
        print(f"{len(problems)} problems:")
        for p in problems[:30]:
            print("  -", p)
        return 1
    print("self-check passed: every anchor is in its resume and passes the script")
    return 0


# ------------------------------------------------------------------ scoring

def load(path: Path):
    recs = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            key = (r["arm"], r["run"], r["instance"])
            if r.get("ok") or key not in recs:
                recs[key] = r
    return recs


def rows(recs):
    """(arm, run, iid) -> row; '+script' rows for the checked arms."""
    table = {}
    for (arm, run, iid), r in recs.items():
        row = {"ok": bool(r.get("ok")), "verdicts": {q: None for q in REQS}, "decision": None, "checks": {}}
        if row["ok"]:
            out = r["output"]
            row["decision"] = out.get("decision")
            for it in out.get("requirements") or []:
                rid = it.get("id")
                if rid in REQS and row["verdicts"][rid] is None:
                    row["verdicts"][rid] = it.get("verdict")
                    if arm in CHECKED:
                        quotes = [q for q in it.get("quotes", []) if isinstance(q, str)]
                        row["checks"][rid] = check(iid, it.get(CHECKED[arm], ""), quotes)
        table[(arm, run, iid)] = row
        if arm in CHECKED:
            sv = {rid: ("not_met" if v == "met" and row["checks"].get(rid, ("",))[0] != "supported" else v) for rid, v in row["verdicts"].items()}
            unver = sum(1 for rid, v in row["verdicts"].items() if v == "met" and sv[rid] != "met")
            table[(arm + " + script", run, iid)] = {**row, "verdicts": sv, "decision": row["decision"] if (row["decision"] != "advance" or not unver) else "reject"}
    return table


def pct(a, b):
    return "—" if not b else f"{a}/{b} ({100 * a / b:.1f}%)"


def score(path: Path) -> int:
    recs = load(path)
    runs = sorted({k[1] for k in recs})
    table = rows(recs)
    S = {"file": path.name, "runs": runs}
    calls = {}
    for arm in ARMS:
        rs = [r for (a, _, _), r in recs.items() if a == arm]
        lat = [r["latency_ms"] for r in rs if r.get("latency_ms")]
        tl = [len(r.get("tool_log") or []) for r in rs]
        calls[arm] = {"conversations": len(rs), "failed": sum(not r.get("ok") for r in rs), "cost": sum(r.get("cost", 0) for r in rs),
                      "api_calls": sum(r.get("api_calls", 1) for r in rs), "tool_runs": sum(tl), "used_tool": sum(1 for n in tl if n),
                      "median_latency_s": statistics.median(lat) / 1000 if lat else None,
                      "models": sorted({r.get("model_served") for r in rs if r.get("model_served")})}
    S["calls"] = calls

    acc = {}
    for arm in ARMS + [a + " + script" for a in CHECKED]:
        c = defaultdict(int)
        for run in runs:
            for i in index:
                row = table.get((arm, run, i["id"]))
                if not row:
                    continue
                for r in REQS:
                    v = row["verdicts"].get(r)
                    g = gold_met(i["id"], r)
                    fig = (i["job"], r) in FIGURE_REQS
                    ok = v in ("met", "not_met") and (v == "met") == g
                    c["cells"] += 1
                    c["correct"] += ok
                    c["false_met"] += v == "met" and not g
                    c["false_not_met"] += v != "met" and g
                    c["gold_met"] += g
                    c["gold_not_met"] += not g
                    c["fig_cells" if fig else "other_cells"] += 1
                    c["fig_correct" if fig else "other_correct"] += ok
                c["decisions"] += 1
                c["decision_correct"] += row["decision"] == gold_decision(i["id"])
        acc[arm] = dict(c)
    S["accuracy"] = acc

    chk = {}
    for arm in CHECKED:
        c = defaultdict(int)
        for run in runs:
            for i in index:
                row = table.get((arm, run, i["id"]))
                if not row or not row["ok"]:
                    continue
                for r in REQS:
                    st = row["checks"].get(r)
                    if not st:
                        continue
                    c["quotes"] += st[2]
                    c["quotes_found"] += st[1]
                    if row["verdicts"][r] != "met":
                        continue
                    fig = (i["job"], r) in FIGURE_REQS
                    c["met"] += 1
                    c["met_fig" if fig else "met_other"] += 1
                    if st[0] != "supported":
                        c["fail"] += 1
                        c["fail_fig" if fig else "fail_other"] += 1
                        c["lost" if gold_met(i["id"], r) else "caught"] += 1
                        c[f"reason:{st[0]}"] += 1
                    elif not gold_met(i["id"], r):
                        c["wrong_met_passed"] += 1
        chk[arm] = dict(c)
    S["checks"] = chk

    stab = {}
    for arm in ARMS + [a + " + script" for a in CHECKED]:
        k = defaultdict(int)
        for run in runs:
            for i in index:
                if i["id"] == i["compare_to"]:
                    continue
                a, b = table.get((arm, run, i["id"])), table.get((arm, run, i["compare_to"]))
                if not a or not b or not a["ok"] or not b["ok"]:
                    continue
                for r in REQS:
                    k["cells"] += 1
                    k["flips"] += a["verdicts"].get(r) != b["verdicts"].get(r)
                k["decisions"] += 1
                k["decision_flips"] += a["decision"] != b["decision"]
        if len(runs) >= 2:
            for i in index:
                a, b = table.get((arm, runs[0], i["id"])), table.get((arm, runs[1], i["id"]))
                if not a or not b or not a["ok"] or not b["ok"]:
                    continue
                for r in REQS:
                    k["noise_cells"] += 1
                    k["noise_flips"] += a["verdicts"].get(r) != b["verdicts"].get(r)
                k["noise_decisions"] += 1
                k["noise_decision_flips"] += a["decision"] != b["decision"]
        stab[arm] = dict(k)
    S["stability"] = stab

    path.with_suffix(".summary.json").write_text(json.dumps(S, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    L = [f"# v2 results: {S['file']}", "", f"Runs: {', '.join(map(str, runs))}. Rules: `eval/v2/score.py`, fixed in `eval/v2/PREREGISTRATION.md`.", "",
         "## Conversations and cost", "", "| Arm | Conversations | Failed | API calls | Used the tool | Tool runs | Cost (US$) | Median latency (s) |", "|---|---|---|---|---|---|---|---|"]
    for arm, c in calls.items():
        L.append(f"| {arm} | {c['conversations']} | {c['failed']} | {c['api_calls']} | {c['used_tool']} | {c['tool_runs']} | {c['cost']:.4f} | {c['median_latency_s']:.1f} |" if c["median_latency_s"] else f"| {arm} | {c['conversations']} | {c['failed']} | — | — | — | — | — |")
    L.append(f"\nModels served: {', '.join(sorted({m for c in calls.values() for m in c['models']}))}. Total US${sum(c['cost'] for c in calls.values()):.4f}.")
    L += ["", "## Verdicts against the answer key", "", "| Arm | Correct | False met | False not met | On requirements with a figure | On the other requirements | Decision correct |", "|---|---|---|---|---|---|---|"]
    for arm, a in acc.items():
        L.append(f"| {arm} | {pct(a.get('correct', 0), a.get('cells', 0))} | {pct(a.get('false_met', 0), a.get('gold_not_met', 0))} | {pct(a.get('false_not_met', 0), a.get('gold_met', 0))} | "
                 f"{pct(a.get('fig_correct', 0), a.get('fig_cells', 0))} | {pct(a.get('other_correct', 0), a.get('other_cells', 0))} | {pct(a.get('decision_correct', 0), a.get('decisions', 0))} |")
    L += ["", "## What the check did", "", "| Arm | Quotes found | Met verdicts failing the check | on requirements with a figure | on the others | Lost (met in the key) | Caught (not met in the key) | Wrong met that passed |", "|---|---|---|---|---|---|---|---|"]
    for arm, c in chk.items():
        L.append(f"| {arm} | {pct(c.get('quotes_found', 0), c.get('quotes', 0))} | {pct(c.get('fail', 0), c.get('met', 0))} | {pct(c.get('fail_fig', 0), c.get('met_fig', 0))} | {pct(c.get('fail_other', 0), c.get('met_other', 0))} | {c.get('lost', 0)} | {c.get('caught', 0)} | {c.get('wrong_met_passed', 0)} |")
    reasons = {arm: {k[7:]: v for k, v in c.items() if k.startswith('reason:')} for arm, c in chk.items()}
    L.append(f"\nReasons for failing: {json.dumps(reasons)}")
    L += ["", "## Stability (secondary)", "", "| Arm | Verdict flips with the name | Decision flips with the name | Verdict flips run 1 vs 2 | Decision flips run 1 vs 2 |", "|---|---|---|---|---|"]
    for arm, k in stab.items():
        L.append(f"| {arm} | {pct(k.get('flips', 0), k.get('cells', 0))} | {pct(k.get('decision_flips', 0), k.get('decisions', 0))} | {pct(k.get('noise_flips', 0), k.get('noise_cells', 0))} | {pct(k.get('noise_decision_flips', 0), k.get('noise_decisions', 0))} |")
    md = "\n".join(L) + "\n"
    path.with_suffix(".summary.md").write_text(md, encoding="utf-8", newline="\n")
    print(md)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("results", nargs="?")
    p.add_argument("--check", action="store_true")
    a = p.parse_args(argv)
    if a.check:
        return self_check()
    if not a.results:
        p.error("give a results file or --check")
    return score(Path(a.results))


if __name__ == "__main__":
    sys.exit(main())
