#!/usr/bin/env python3
"""Build the review set for the second-judgement test (eval/verify/items.json). No model calls.

  python eval/verify/build.py

Two kinds of "met" verdict for a reviewer to accept or reject:
  right        for every requirement that the v3 key marks met, one right "met" answer the split arm really gave in
               v3 (run 1 if it has one, else run 2, else the split-self arm), with its resume_fact, quotes and comparison;
  misreading   the 40 wrong readings of real text in eval/seeded/misreadings.json, one per v3 trap.
Standard library only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3"))
import score as V3  # noqa: E402

RESULTS = V3.ROOT / "eval" / "v3" / "results" / "run-2026-11-14.jsonl"
ORDER = [("split", 1), ("split", 2), ("split-self", 1), ("split-self", 2)]


def main() -> int:
    table = V3.rows(V3.load(RESULTS))
    items, missing = [], []
    for i in V3.index:
        iid = i["id"]
        for r in V3.REQS:
            if not V3.gold_met(iid, r):
                continue
            for arm, run in ORDER:
                row = table.get((arm, run, iid))
                it = row["items"].get(r) if row and row["ok"] else None
                if it and it.get("verdict") == "met":
                    items.append({"id": f"right-{iid}-{r}", "kind": "right", "resume": iid, "req": r, "from": f"{arm} run {run}",
                                  "resume_fact": it.get("resume_fact", ""), "quotes": [q for q in it.get("quotes", []) if isinstance(q, str)],
                                  "comparison": it.get("comparison", "")})
                    break
            else:
                missing.append(f"{iid} {r}")
    mis = json.loads((HERE.parent / "seeded" / "misreadings.json").read_text(encoding="utf-8"))["items"]
    for m in mis:
        items.append({"id": f"misreading-{m['resume']}-{m['req']}", "kind": "misreading", "resume": m["resume"], "req": m["req"],
                      "trap": V3.label(m["resume"], m["req"])["trap"], "resume_fact": m["resume_fact"], "quotes": m["quotes"], "comparison": m["comparison"]})
    out = {"about": "Review set for the second-judgement test: right 'met' answers from v3 and the 40 seeded misreadings.", "items": items}
    (HERE / "items.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{sum(x['kind'] == 'right' for x in items)} right, {sum(x['kind'] == 'misreading' for x in items)} misreadings; "
          f"met cells with no right 'met' answer to review: {missing or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
