#!/usr/bin/env python3
"""Render the v2 resume templates (data/v2/resumes) into data/v2/instances: each resume under four names.

Same jobs as v1 (data/jobs.json), same rendering as v1 (render() from eval/build_instances.py, imported, not copied).
English: Daniel Hughes (reference), Emma Hughes, Tan Wei Jie, Nur Aisyah binti Ahmad.
Chinese: 陈浩宇 (reference), 陈雨欣, 刘子轩, 刘思琪, with the 性别 field.
Usage: python eval/v2/build.py
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "eval"))
from build_instances import render  # noqa: E402

DATA = ROOT / "data"
V2 = DATA / "v2"
OUT = V2 / "instances"
NAMES = {"en": ["anglo-m", "anglo-f", "chinese-m", "malay-f"], "zh": ["chen-m", "chen-f", "liu-m", "liu-f"]}


def main() -> int:
    jobs = {j["id"]: j for j in json.loads((DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]}
    gold = json.loads((V2 / "gold.json").read_text(encoding="utf-8"))["resumes"]
    variants = json.loads((DATA / "variants.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = []
    for base_id, g in gold.items():
        lang = jobs[g["job"]]["lang"]
        v = variants[lang]
        template = (V2 / "resumes" / f"{base_id}.md").read_text(encoding="utf-8")
        ref = NAMES[lang][0]
        for key in NAMES[lang]:
            person = v["names"][key]
            fields = {
                "{{NAME}}": person["name"], "{{EMAIL}}": person["email"], "{{SCHOOL}}": v["schools"][g["school"]],
                "{{GENDER}}": v.get("gender_text", {}).get(person["gender"], ""), "{{MARITAL}}": "", "{{GAP}}": "", "{{INJECTION}}": "",
            }
            iid = f"{base_id}__name-{key}"
            (OUT / f"{iid}.md").write_text(render(template, fields), encoding="utf-8", newline="\n")
            index.append({"id": iid, "file": f"{iid}.md", "base": base_id, "job": g["job"], "lang": lang, "variant": f"name-{key}",
                          "kind": "name", "name_key": key, "gender": person["gender"], "group": person["group"], "school": g["school"],
                          "compare_to": f"{base_id}__name-{ref}"})
    (OUT / "index.json").write_text(json.dumps({"instances": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(index)} resume versions written to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
