#!/usr/bin/env python3
"""Exploratory notes on the v2 run, written after the results were seen (not preregistered).

  python eval/v2/explore.py RESULTS.jsonl     writes RESULTS.explore.md

1. Every met verdict in the split arm that fails the check: the figures the script could not find in the quotes,
   and whether the fact counts the resume's entries ("两段", "two entries"), a figure the resume never writes.
2. Answers that leave out a requirement, by arm.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as S  # noqa: E402

COUNT = re.compile(r"两段|两个|二段|\btwo (?:experience )?(?:entries|internships|roles|jobs|positions)\b", re.I)


def main(path: Path) -> int:
    recs = S.load(path)
    rows, kinds = [], Counter()
    for (arm, run, iid), r in sorted(recs.items()):
        if arm != "split" or not r.get("ok"):
            continue
        for it in r["output"].get("requirements") or []:
            if it.get("verdict") != "met":
                continue
            f = S.by_id[iid]["file"]
            res = S.ce.check_claim({"id": "x", "text": it.get("resume_fact", ""), "evidence": [{"source": f, "quote": q} for q in it.get("quotes", [])]}, S.sources(iid))
            if res["status"] == "supported":
                continue
            kind = "counts the entries" if COUNT.search(it.get("resume_fact", "")) else "quote without the fact's figures"
            kinds[kind] += 1
            rows.append(f"| {run} | {iid} | {it['id']} | {', '.join(res['missing_numbers'])} | {kind} | {it.get('resume_fact', '')} |")
    missing = Counter()
    miss_rows = []
    for (arm, run, iid), r in sorted(recs.items()):
        if not r.get("ok"):
            continue
        ids = {it.get("id") for it in r["output"].get("requirements") or []}
        gone = [q for q in S.REQS if q not in ids]
        if gone:
            missing[arm] += 1
            miss_rows.append(f"- {arm}, run {run}, {iid}: left out {', '.join(gone)}; decision {r['output'].get('decision')}")
    L = [f"# v2 exploratory notes: {path.name}", "", "Written after the results were seen; not part of the preregistered scoring.", "",
         "## 1. Split: met verdicts that fail the check", "", f"{sum(kinds.values())} in all: " + "; ".join(f"{n} {k}" for k, n in kinds.most_common()) + ".", "",
         "| Run | Version | Requirement | Figures not in the quotes | Kind | resume_fact |", "|---|---|---|---|---|---|", *rows, "",
         "## 2. Answers that leave out a requirement", "", f"By arm: {dict(missing) if missing else 'none'}.", "", *miss_rows]
    out = path.with_suffix(".explore.md")
    out.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    print("\n".join(L))
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
