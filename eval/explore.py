#!/usr/bin/env python3
"""Exploratory analyses, written after the first results were seen (not preregistered).

  python eval/explore.py RESULTS.jsonl     writes RESULTS.explore.md

1. Why "met" verdicts fail the evidence-check script: for every missing figure, is it in the
   job posting's requirement text (a threshold such as "4 days" or "6 months" restated in the
   finding) and not in the resume?
2. A looser check, "quotes only": a met verdict counts as verified when it has at least one quote
   and every quote is found in the resume; the figure rule is left out.
3. Example findings that fail, one per base resume and requirement.
Uses the same loading and checking code as score.py; changes nothing there.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import score as S  # noqa: E402


def main(path: Path) -> int:
    recs = S.load_results(path)
    runs = sorted({k[1] for k in recs})
    missing_kind = Counter()
    fail_cells = Counter()
    examples = {}
    quote_only = {"cells": 0, "correct": 0, "false_met": 0, "false_not_met": 0, "unverified_gold_met": 0}
    met_total = met_quote_ok = 0
    for (arm, run, iid), r in recs.items():
        if arm != "evidence" or not r.get("ok"):
            continue
        job = S.jobs[S.by_id[iid]["job"]]
        reqs = {q["id"]: q["text"] for q in job["requirements"]}
        text = S.texts[iid]
        items = {it.get("id"): it for it in (r["output"].get("requirements") or [])}
        for rid in S.REQS:
            it = items.get(rid)
            g = S.gold_met(iid, rid)
            v = it.get("verdict") if it else None
            verified_q = False
            if it and v == "met":
                met_total += 1
                chk = S.check_requirement(iid, it)
                verified_q = chk["quotes"] > 0 and chk["quotes_found"] == chk["quotes"]
                met_quote_ok += verified_q
                if chk["status"] != "supported":
                    fail_cells[(S.by_id[iid]["base"], rid, chk["status"])] += 1
                    examples.setdefault((S.by_id[iid]["base"], rid), (iid, it.get("finding"), it.get("quotes"), chk))
                    for n in chk["missing_numbers"]:
                        in_req = n in S.ce.numbers_in(reqs[rid], generous=True)
                        in_resume = n in S.ce.numbers_in(text, generous=True)
                        missing_kind[("in requirement" if in_req else "not in requirement") + (", in resume" if in_resume else ", not in resume")] += 1
            final = "met" if (v == "met" and verified_q) else "not_met"
            quote_only["cells"] += 1
            quote_only["correct"] += (final == "met") == g
            quote_only["false_met"] += final == "met" and not g
            quote_only["false_not_met"] += final != "met" and g
            quote_only["unverified_gold_met"] += v == "met" and not verified_q and g
    L = [f"# Exploratory analyses: {path.name}", "", "Written after the first results were seen; not part of the preregistered scoring.", ""]
    L += ["## 1. Figures in failing findings", "",
          f"Missing figures in all: {sum(missing_kind.values())}; in the requirement text: {sum(n for k, n in missing_kind.items() if k.startswith('in requirement'))}.", "",
          "| Missing figure is ... | Count |", "|---|---|"]
    for k, n in missing_kind.most_common():
        L.append(f"| {k} | {n} |")
    L += ["", "Failing met verdicts by base resume, requirement and reason:", "", "| Base | Requirement | Reason | Count |", "|---|---|---|---|"]
    for (b, rid, st), n in sorted(fail_cells.items()):
        L.append(f"| {b} | {rid} | {st} | {n} |")
    q = quote_only
    L += ["", "## 2. Quotes-only check (figure rule left out)", "",
          f"- Met verdicts with every quote found: {met_quote_ok}/{met_total}.",
          f"- Accuracy: {q['correct']}/{q['cells']} ({100 * q['correct'] / q['cells']:.1f}%); false met {q['false_met']}; false not met {q['false_not_met']} (of which lost by the quote check: {q['unverified_gold_met']}).", ""]
    L += ["## 3. One failing finding per base resume and requirement", ""]
    for (b, rid), (iid, finding, quotes, chk) in sorted(examples.items()):
        L.append(f"- **{b} {rid}** ({iid}, {chk['status']}, missing {chk['missing_numbers']}): finding “{finding}”; quotes {json.dumps(quotes, ensure_ascii=False)}")

    # 4. requirements whose text contains a figure, against the others
    num_reqs = {(jid, q["id"]) for jid, job in S.jobs.items() for q in job["requirements"] if S.ce.numbers_in(q["text"])}
    c = Counter()
    for (arm, run, iid), r in recs.items():
        if arm != "evidence" or not r.get("ok"):
            continue
        for it in r["output"].get("requirements") or []:
            if it.get("verdict") != "met":
                continue
            ok = S.check_requirement(iid, it)["status"] == "supported"
            k = "with" if (S.by_id[iid]["job"], it.get("id")) in num_reqs else "without"
            c[k + "_total"] += 1
            c[k + "_fail"] += not ok
    L += ["", "## 4. Requirements whose text contains a figure", "",
          f"- Requirements with a figure in their text: {len(num_reqs)} of {sum(len(j['requirements']) for j in S.jobs.values())} ({', '.join(f'{a} {b}' for a, b in sorted(num_reqs))}).",
          f"- Met verdicts that fail the script: {c['with_fail']} of {c['with_total']} on those requirements; {c['without_fail']} of {c['without_total']} on the others."]

    # 5. cost and output length per resume version (one call)
    import statistics
    L += ["", "## 5. Per call (one resume version)", "", "| Arm | Mean cost (US$) | Median output tokens |", "|---|---|---|"]
    for arm in ["score-only", "plain", "evidence"]:
        rs = [r for (a, _, _), r in recs.items() if a == arm]
        L.append(f"| {arm} | {statistics.fmean(r.get('cost', 0) for r in rs):.5f} | {statistics.median(r.get('usage', {}).get('output', 0) for r in rs):.0f} |")

    # 6. score contrasts whose interval excludes 0 (from the preregistered summary)
    summ = json.loads(path.with_suffix(".summary.json").read_text(encoding="utf-8"))
    score_eff = {k: v for k, v in summ["effects"].items() if k.endswith(" score")}
    total = sum(len(v) for v in score_eff.values())
    excl = [(k, name, e) for k, v in score_eff.items() for name, e in v.items()
            if e["ci95"][0] is not None and (e["ci95"][0] > 0 or e["ci95"][1] < 0)]
    L += ["", "## 6. Score contrasts whose 95% interval excludes 0", "", f"{len(excl)} of {total} contrasts (an interval that ends exactly at 0 counts as including it):", ""]
    for k, name, e in excl:
        L.append(f"- {k}: {name}: {e['mean']:.2f} ({e['ci95'][0]:.2f} to {e['ci95'][1]:.2f})")

    # 6b. verdict and decision flips for the changes other than names (school, gap, marital, injection)
    L += ["", "## 6b. Flips for school, gap, marital line and injection together", "", "| Arm | Verdict flips | Decision flips |", "|---|---|---|"]
    for arm in ["plain", "evidence", "evidence+script"]:
        bk = summ["stability"][arm]["by_kind"]
        ks = [bk[k] for k in ("school", "gap", "marital", "injection") if k in bk]
        L.append(f"| {arm} | {sum(k['flips'] for k in ks)}/{sum(k['cells'] for k in ks)} | {sum(k['decision_flips'] for k in ks)}/{sum(k['decisions'] for k in ks)} |")

    # 7. keyword baseline errors by base resume and requirement
    fm, fn = set(), set()
    for i in S.index:
        kv = S.keyword_verdicts(i["id"])
        for rid in S.REQS:
            g = S.gold_met(i["id"], rid)
            if kv[rid] == "met" and not g:
                fm.add((i["base"], rid))
            if kv[rid] != "met" and g:
                fn.add((i["base"], rid))
    L += ["", "## 7. Keyword baseline errors (base resume, requirement)", "",
          f"- Marked met, not met in the key: {', '.join(f'{b} {r}' for b, r in sorted(fm))}.",
          f"- Marked not met, met in the key: {', '.join(f'{b} {r}' for b, r in sorted(fn))}."]
    out = path.with_suffix(".explore.md")
    out.write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    print("\n".join(L[:40]))
    print(f"... written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
