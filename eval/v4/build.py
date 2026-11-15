#!/usr/bin/env python3
"""Render the v4 test set: the 24 v3 resumes, anonymised, each in a neutral version and six versions that add one
bundle of job-irrelevant markers (data/v4/markers.json) hinting at ethnicity and gender.

Anonymised: the name becomes an applicant number, the e-mail address follows it, and the gender field is removed.
The school stays as in v3. The markers go in a new section at the end. Everything else is v3's text, rendered with
v1's render() (imported, not copied). Answers are v3's (data/v3/gold.json): no marker bears on any requirement.
Usage: python eval/v4/build.py
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "eval"))
from build_instances import render  # noqa: E402

DATA = ROOT / "data"
V3 = DATA / "v3"
V4 = DATA / "v4"
OUT = V4 / "instances"

# Chinese templates carry the gender field in several shapes; each is removed with its separator.
GENDER_FIELD = [r"性别[：\s]*\{\{GENDER\}\}\s*[｜／]?\s*", r"（\{\{GENDER\}\}）", r"\{\{GENDER\}\}[｜　]", r"　\{\{GENDER\}\}"]


def anonymise(template: str) -> str:
    for pat in GENDER_FIELD:
        template = re.sub(pat, "", template)
    if "{{GENDER}}" in template:
        raise ValueError("gender field left in a template")
    return template


def section(lang: str, markers: dict, bundle: dict) -> str:
    m = markers[lang]
    lines = [m["heading"]] + [f"{m['labels'][k]}：{bundle[k]}" if lang == "zh" else f"{m['labels'][k]}: {bundle[k]}" for k in ("cca", "languages", "hobbies")]
    return "\n".join(lines)


def main() -> int:
    jobs = {j["id"]: j for j in json.loads((DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]}
    gold = json.loads((V3 / "gold.json").read_text(encoding="utf-8"))["resumes"]
    variants = json.loads((DATA / "variants.json").read_text(encoding="utf-8"))
    markers = json.loads((V4 / "markers.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = []
    for n, (base_id, g) in enumerate(gold.items()):
        lang = jobs[g["job"]]["lang"]
        number = 2001 + n
        name = f"应聘者 #{number}" if lang == "zh" else f"Applicant #{number}"
        fields = {"{{NAME}}": name, "{{EMAIL}}": f"applicant{number}@example.com", "{{SCHOOL}}": variants[lang]["schools"][g["school"]]}
        text = render(anonymise((V3 / "resumes" / f"{base_id}.md").read_text(encoding="utf-8")), fields).rstrip("\n")
        groups = {"neutral": None, **markers[lang]["groups"]}
        for group, bundle in groups.items():
            body = text if bundle is None else f"{text}\n\n{section(lang, markers, bundle)}"
            iid = f"{base_id.replace('V3', 'V4')}__{group}"
            (OUT / f"{iid}.md").write_text(body + "\n", encoding="utf-8", newline="\n")
            index.append({"id": iid, "file": f"{iid}.md", "base": base_id, "job": g["job"], "lang": lang, "group": group,
                          "ethnicity": None if bundle is None else group.rsplit("-", 1)[0], "gender": None if bundle is None else group.rsplit("-", 1)[1].upper(),
                          "compare_to": f"{base_id.replace('V3', 'V4')}__neutral"})
    (OUT / "index.json").write_text(json.dumps({"instances": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(index)} resume versions written to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
