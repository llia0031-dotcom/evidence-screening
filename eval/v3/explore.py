#!/usr/bin/env python3
"""List the v3 cases behind the summary numbers (no model calls):

  python eval/v3/explore.py RESULTS.jsonl      writes RESULTS.explore.md

1. every wrong met verdict: arm, run, resume, requirement, trap type, what the model wrote, and the check's verdict;
2. every right met verdict that fails the check (lost), with the figures the script could not find;
3. every answer that leaves out a requirement.
Uses score.py's loading and checking. Standard library only.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as S  # noqa: E402


def cell(text: str, n: int = 160) -> str:
    text = " ".join(str(text).split()).replace("|", "/")
    return text if len(text) <= n else text[: n - 1] + "…"


def main(path: Path) -> int:
    recs = S.load(path)
    table = S.rows(recs)
    L = [f"# v3 cases: {path.name}", "", "Listed from the stored outputs with `eval/v3/explore.py`.", ""]

    L += ["## Wrong met verdicts", "", "| Arm | Run | Resume | Req | Trap | What the model wrote | Check |", "|---|---|---|---|---|---|---|"]
    n = 0
    for (arm, run, iid), row in sorted(table.items()):
        if arm.endswith("+ script") or not row["ok"]:
            continue
        for r in S.REQS:
            if row["verdicts"].get(r) == "met" and not S.gold_met(iid, r):
                it = row["items"].get(r, {})
                said = it.get("reason") if arm == "plain" else f"{it.get('resume_fact', '')} — {it.get('comparison', '')}"
                st = row["checks"].get(r, ("—",))[0]
                L.append(f"| {arm} | {run} | {iid} | {r} | {S.label(iid, r)['trap']} | {cell(said)} | {st} |")
                n += 1
    if not n:
        L.append("| — | — | — | — | — | none | — |")

    L += ["", "## Right met verdicts that fail the check (lost)", "", "| Arm | Run | Resume | Req | resume_fact | Quotes | Missing figures |", "|---|---|---|---|---|---|---|"]
    n = 0
    for (arm, run, iid), row in sorted(table.items()):
        if arm not in S.CHECKED or not row["ok"]:
            continue
        for r in S.REQS:
            st = row["checks"].get(r)
            if row["verdicts"].get(r) == "met" and S.gold_met(iid, r) and st and st[0] != "supported":
                it = row["items"][r]
                quotes = [q for q in it.get("quotes", []) if isinstance(q, str)]
                f = S.by_id[iid]["file"]
                res = S.ce.check_claim({"id": "x", "text": it.get("resume_fact", ""), "evidence": [{"source": f, "quote": q} for q in quotes]}, S.sources(iid))
                missing = res.get("missing_numbers") or []
                L.append(f"| {arm} | {run} | {iid} | {r} | {cell(it.get('resume_fact', ''))} | {cell(' / '.join(quotes), 120)} | {', '.join(map(str, missing)) or st[0]} |")
                n += 1
    if not n:
        L.append("| — | — | — | — | none | — | — |")

    L += ["", "## Answers that leave out a requirement", ""]
    n = 0
    for (arm, run, iid), row in sorted(table.items()):
        if arm.endswith("+ script") or not row["ok"]:
            continue
        gone = [r for r in S.REQS if row["verdicts"].get(r) is None]
        if gone:
            L.append(f"- {arm}, run {run}, {iid}: left out {', '.join(gone)}; decision {row['decision']}")
            n += 1
    if not n:
        L.append("None.")
    failed = [k for k, r in recs.items() if not r.get("ok")]
    L += ["", f"Failed conversations: {len(failed)}" + (f" ({'; '.join(f'{a} run {b} {c}' for a, b, c in failed)})" if failed else ".")]
    out = path.with_suffix(".explore.md")
    out.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
