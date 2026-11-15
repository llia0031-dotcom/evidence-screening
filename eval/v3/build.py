#!/usr/bin/env python3
"""Render the v3 resume templates (data/v3/resumes) into data/v3/instances: one version per resume.

v3 tests whether the quote check stops wrong verdicts, on messier resumes with traps. Names are not the question
here, so each resume gets one name (fixed in data/v3/gold.json) and no variants.
Same jobs as v1 (data/jobs.json), same rendering as v1 (render() from eval/build_instances.py, imported, not copied).
Usage: python eval/v3/build.py
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
V3 = DATA / "v3"
OUT = V3 / "instances"


def main() -> int:
    jobs = {j["id"]: j for j in json.loads((DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]}
    gold = json.loads((V3 / "gold.json").read_text(encoding="utf-8"))["resumes"]
    variants = json.loads((DATA / "variants.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = []
    for base_id, g in gold.items():
        lang = jobs[g["job"]]["lang"]
        v = variants[lang]
        person = v["names"][g["name"]]
        fields = {
            "{{NAME}}": person["name"], "{{EMAIL}}": person["email"], "{{SCHOOL}}": v["schools"][g["school"]],
            "{{GENDER}}": v.get("gender_text", {}).get(person["gender"], ""),
        }
        template = (V3 / "resumes" / f"{base_id}.md").read_text(encoding="utf-8")
        (OUT / f"{base_id}.md").write_text(render(template, fields), encoding="utf-8", newline="\n")
        index.append({"id": base_id, "file": f"{base_id}.md", "base": base_id, "job": g["job"], "lang": lang,
                      "name_key": g["name"], "gender": person["gender"], "group": person["group"], "school": g["school"]})
    (OUT / "index.json").write_text(json.dumps({"instances": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(index)} resume versions written to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
