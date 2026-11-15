#!/usr/bin/env python3
"""Seeded-error test of the quote check: which kinds of wrong "met" verdicts does it stop? No model calls.

  python eval/seeded/seed.py --check     check the inputs (no catch rates)
  python eval/seeded/seed.py             run; writes eval/seeded/results/seeded-<date>.md and .json

Base: every right "met" verdict that the split and split-self arms gave in v3 (two runs) and that passes the check.
Each is changed in one way at a time, and the changed fact and quotes go through the same frozen evidence-check script:
  A1 a figure in resume_fact changed by one (2025 -> 2026, 07 -> 08, 12 -> 13), quotes unchanged;
  A2 a figure the resume never gives added to resume_fact ("for 7 months", "共 7 个月");
  A3 the first quote copied almost word for word: one word (English) or one character (Chinese) dropped from its middle;
  A4 the first quote replaced by a line from another resume of the same language.
Family B (eval/seeded/misreadings.json): 40 wrong readings of real text, one per v3 trap, written before the run.
"Caught" means the script does not return "supported". Rule-based changes after FactCC (Kryscinski et al., EMNLP 2020);
no code copied. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "v3"))
import score as V3  # noqa: E402

RESULTS = V3.ROOT / "eval" / "v3" / "results" / "run-2026-11-14.jsonl"
CJK = re.compile(r"[一-鿿]")
YEAR = re.compile(r"(19|20)\d\d")


def base_items():
    table = V3.rows(V3.load(RESULTS))
    items = []
    for (arm, run, iid), row in sorted(table.items()):
        if arm not in V3.CHECKED or not row["ok"]:
            continue
        for r in V3.REQS:
            it = row["items"].get(r)
            if row["verdicts"].get(r) != "met" or not V3.gold_met(iid, r) or not it:
                continue
            quotes = [q for q in it.get("quotes", []) if isinstance(q, str)]
            if V3.check(iid, it.get("resume_fact", ""), quotes)[0] == "supported":
                items.append({"arm": arm, "run": run, "iid": iid, "req": r, "lang": V3.by_id[iid]["lang"], "fact": it.get("resume_fact", ""), "quotes": quotes})
    return items


def status(iid, fact, quotes):
    f = V3.by_id[iid]["file"]
    return V3.ce.check_claim({"id": "x", "text": fact, "evidence": [{"source": f, "quote": q} for q in quotes]}, V3.sources(iid))["status"]


# ------------------------------------------------------------------ the changes

def a1(b):
    m = re.search(r"\d+", b["fact"])
    if not m:
        return None
    old = m.group()
    new = str(int(old) + 1).zfill(len(old))
    kind = "year" if YEAR.fullmatch(old) else "other figure"
    return {**b, "fact": b["fact"][: m.start()] + new + b["fact"][m.end():], "kind": kind}


def a2(b):
    have = set()
    for q in b["quotes"]:
        have |= V3.ce.numbers_in(q, generous=True)
    n = next(x for x in ("7", "9", "11", "13", "17") if x not in have)
    fact = b["fact"].rstrip()
    if b["lang"] == "zh":
        fact = (fact[:-1] if fact.endswith("。") else fact) + f"，共 {n} 个月。"
    else:
        fact = (fact[:-1] if fact.endswith(".") else fact) + f", for {n} months."
    return {**b, "fact": fact, "kind": "added figure"}


def a3(b):
    if not b["quotes"]:
        return None
    q = b["quotes"][0]
    if b["lang"] == "zh":
        spots = [i for i, ch in enumerate(q) if CJK.match(ch)]
        if len(spots) < 4:
            return None
        i = spots[len(spots) // 2]
        new = q[:i] + q[i + 1:]
    else:
        words = q.split(" ")
        spots = [i for i, w in enumerate(words) if len(re.sub(r"[^A-Za-z]", "", w)) >= 3]
        if len(spots) < 3:
            return None
        i = spots[len(spots) // 2]
        new = " ".join(words[:i] + words[i + 1:])
    return {**b, "quotes": [new] + b["quotes"][1:], "kind": "word dropped" if b["lang"] == "en" else "character dropped"}


def a4(b, anchors):
    text = V3.texts[b["iid"]]
    pool = [a for rid, a in anchors[b["lang"]] if rid != b["iid"] and a not in text]
    if not b["quotes"] or not pool:
        return None
    # the next resume's anchor, so the choice is fixed and spread across resumes
    after = [a for rid, a in anchors[b["lang"]] if rid > b["iid"] and a not in text] or pool
    return {**b, "quotes": [after[0]] + b["quotes"][1:], "kind": "line from another resume"}


def anchors_by_lang():
    out = defaultdict(list)
    for rid, g in sorted(V3.gold.items()):
        for r in V3.REQS:
            lab = g["labels"][r]
            if lab["met"]:
                out[V3.by_id[rid]["lang"]].append((rid, lab["anchor"]))
    return out


def misreadings():
    data = json.loads((HERE / "misreadings.json").read_text(encoding="utf-8"))["items"]
    return [{**m, "iid": m["resume"], "lang": V3.by_id[m["resume"]]["lang"], "fact": m["resume_fact"],
             "trap": V3.label(m["resume"], m["req"])["trap"]} for m in data]


# ------------------------------------------------------------------ check and run

def self_check() -> int:
    problems = []
    base = base_items()
    mis = misreadings()
    traps = {(i["id"], r) for i in V3.index for r in V3.REQS if not V3.gold_met(i["id"], r)}
    if {(m["iid"], m["req"]) for m in mis} != traps or len(mis) != len(traps):
        problems.append("misreadings do not cover each trap cell exactly once")
    for m in mis:
        for q in m["quotes"]:
            if q not in V3.texts[m["iid"]]:
                problems.append(f"{m['iid']} {m['req']}: quote not copied from the resume: {q}")
    anchors = anchors_by_lang()
    counts = {"A1": sum(a1(b) is not None for b in base), "A2": len(base), "A3": sum(a3(b) is not None for b in base),
              "A4": sum(a4(b, anchors) is not None for b in base), "B": len(mis)}
    print(f"base: {len(base)} right met verdicts that pass the check (split and split-self, v3, two runs); applicable: {counts}")
    for p in problems:
        print("  -", p)
    print("inputs check passed" if not problems else f"{len(problems)} problems")
    return 1 if problems else 0


def run() -> int:
    base = base_items()
    anchors = anchors_by_lang()
    rows = []
    for b in base:
        for fam, fn in (("A1", a1), ("A2", a2), ("A3", a3), ("A4", lambda x: a4(x, anchors))):
            c = fn(b)
            if c is None:
                continue
            st = status(c["iid"], c["fact"], c["quotes"])
            rows.append({"family": fam, "kind": c["kind"], "lang": c["lang"], "arm": c["arm"], "run": c["run"], "iid": c["iid"], "req": c["req"],
                         "fact": c["fact"], "quotes": c["quotes"], "status": st, "caught": st != "supported"})
    for m in misreadings():
        st = status(m["iid"], m["fact"], m["quotes"])
        rows.append({"family": "B", "kind": m["trap"], "lang": m["lang"], "arm": "written", "run": 0, "iid": m["iid"], "req": m["req"],
                     "fact": m["fact"], "quotes": m["quotes"], "status": st, "caught": st != "supported"})

    def tally(sel):
        n = len(sel)
        k = sum(r["caught"] for r in sel)
        return {"n": n, "caught": k, "rate": (k / n) if n else None}

    S = {"base": len(base), "families": {}, "by_kind": {}, "by_lang": {}, "reasons": {}}
    for fam in ("A1", "A2", "A3", "A4", "B"):
        sel = [r for r in rows if r["family"] == fam]
        S["families"][fam] = tally(sel)
        S["by_kind"][fam] = {k: tally([r for r in sel if r["kind"] == k]) for k in sorted({r["kind"] for r in sel})}
        S["by_lang"][fam] = {l: tally([r for r in sel if r["lang"] == l]) for l in ("en", "zh")}
        S["reasons"][fam] = dict(Counter(r["status"] for r in sel))
    out = HERE / "results" / f"seeded-{date.today().isoformat()}"
    out.parent.mkdir(exist_ok=True)
    out.with_suffix(".json").write_text(json.dumps({"summary": S, "rows": rows}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")

    def pct(t):
        return "—" if not t["n"] else f"{t['caught']}/{t['n']} ({100 * t['rate']:.1f}%)"

    names = {"A1": "A1 a figure in the fact changed by one", "A2": "A2 a figure the resume never gives added to the fact",
             "A3": "A3 the quote copied almost word for word", "A4": "A4 the quote taken from another resume",
             "B": "B a wrong reading of real text (one per v3 trap)"}
    L = [f"# Seeded-error test of the quote check: {out.name}", "",
         f"Base: {len(base)} right \"met\" verdicts from v3 (split and split-self, two runs) that pass the check. Rules: `eval/seeded/seed.py`, fixed in `eval/seeded/PREREGISTRATION.md`. No model calls.", "",
         "| Change | Caught | English | Chinese | What the script said |", "|---|---|---|---|---|"]
    for fam in ("A1", "A2", "A3", "A4", "B"):
        L.append(f"| {names[fam]} | {pct(S['families'][fam])} | {pct(S['by_lang'][fam]['en'])} | {pct(S['by_lang'][fam]['zh'])} | {json.dumps(S['reasons'][fam])} |")
    L += ["", "By kind:", ""]
    for fam in ("A1", "A3", "B"):
        L.append(f"- {fam}: " + "; ".join(f"{k} {pct(t)}" for k, t in S["by_kind"][fam].items()))
    L += ["", "## Changes the script let through (A families, first 30)", "", "| Family | Resume | Req | Fact | Quotes |", "|---|---|---|---|---|"]
    for r in [r for r in rows if r["family"] != "B" and not r["caught"]][:30]:
        L.append(f"| {r['family']} {r['kind']} | {r['iid']} | {r['req']} | {r['fact'][:140]} | {' / '.join(r['quotes'])[:120]} |")
    L += ["", "## Wrong readings the script stopped (family B)", ""]
    caught_b = [r for r in rows if r["family"] == "B" and r["caught"]]
    L += [f"- {r['iid']} {r['req']} ({r['kind']}): {r['status']}" for r in caught_b] or ["None."]
    md = "\n".join(L) + "\n"
    out.with_suffix(".md").write_text(md, encoding="utf-8", newline="\n")
    print(md)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--check", action="store_true")
    a = p.parse_args(argv)
    return self_check() if a.check else run()


if __name__ == "__main__":
    sys.exit(main())
