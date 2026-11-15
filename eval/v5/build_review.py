#!/usr/bin/env python3
"""Build the v5 review set from the v5 screening run: every "met" verdict the split and split-self arms gave (both runs),
with its resume_fact, quotes and comparison, marked right or wrong by the v3 answer key, and the quote check's result.

  python eval/v5/build_review.py eval/v5/results/run-<date>.jsonl      writes eval/v5/review-items.json
No model calls. Standard library only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3"))
import score as V3  # noqa: E402


def main(path: Path) -> int:
    table = V3.rows(V3.load(path))
    items = []
    for (arm, run, iid), row in sorted(table.items()):
        if arm not in V3.CHECKED or not row["ok"]:
            continue
        for r in V3.REQS:
            it = row["items"].get(r)
            if row["verdicts"].get(r) != "met" or not it:
                continue
            right = V3.gold_met(iid, r)
            items.append({
                "id": f"{arm}-r{run}-{iid}-{r}", "kind": "right" if right else "wrong", "arm": arm, "run": run, "resume": iid, "req": r,
                "trap": None if right else V3.label(iid, r)["trap"], "check": row["checks"].get(r, ("—",))[0],
                "resume_fact": it.get("resume_fact", ""), "quotes": [q for q in it.get("quotes", []) if isinstance(q, str)], "comparison": it.get("comparison", ""),
            })
    out = HERE / "review-items.json"
    out.write_text(json.dumps({"about": f"v5 review set, built from {path.name}: every met verdict of split and split-self.", "items": items},
                              ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(items)} met verdicts to review: {sum(x['kind'] == 'right' for x in items)} right, {sum(x['kind'] == 'wrong' for x in items)} wrong")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
