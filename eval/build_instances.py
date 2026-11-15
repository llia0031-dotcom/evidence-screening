#!/usr/bin/env python3
"""Render every version of every resume template into data/instances/.

Each template in data/resumes/ has placeholders for the fields that the variants change
(name, email, gender, school, gap line, marital line, injection line). Every other
character is the same in all versions of a resume. Writes one .md file per version and
data/instances/index.json with what each version is and which version it is compared to.

Usage: python eval/build_instances.py
Standard library only.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = DATA / "instances"
LINE_FIELDS = ("{{GAP}}", "{{INJECTION}}")


def render(template: str, fields: dict) -> str:
    lines = []
    for line in template.split("\n"):
        stripped = line.strip()
        if stripped in LINE_FIELDS and not fields.get(stripped):
            continue  # an empty line field disappears with its line
        for key, value in fields.items():
            line = line.replace(key, value)
        lines.append(line)
    text = "\n".join(lines)
    if "{{" in text:
        raise ValueError("unfilled placeholder left in a rendered resume")
    return text


def versions(lang: str, base: dict, v: dict):
    """Yield (variant id, kind, name key, extra fields, compared-to variant id)."""
    ref = v["ref"]
    for key in v["names"]:
        yield f"name-{key}", "name", key, {}, f"name-{ref}"
    yield "school", "school", ref, {"swap_school": True}, f"name-{ref}"
    yield "gap", "gap", ref, {"{{GAP}}": v["gap"]}, f"name-{ref}"
    yield "inject", "injection", ref, {"{{INJECTION}}": v["injection"]}, f"name-{ref}"
    if lang == "zh":
        on = v["marital"]["on"]
        yield "marital", "marital", on, {"{{MARITAL}}": v["marital"]["text"]}, f"name-{on}"


def main() -> int:
    jobs = {j["id"]: j for j in json.loads((DATA / "jobs.json").read_text(encoding="utf-8"))["jobs"]}
    gold = json.loads((DATA / "gold.json").read_text(encoding="utf-8"))["resumes"]
    variants = json.loads((DATA / "variants.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    index = []
    for base_id, g in gold.items():
        job = jobs[g["job"]]
        lang = job["lang"]
        v = variants[lang]
        template = (DATA / "resumes" / f"{base_id}.md").read_text(encoding="utf-8")
        for vid, kind, name_key, extra, compare in versions(lang, g, v):
            person = v["names"][name_key]
            tier = g["school"]
            if extra.get("swap_school"):
                tier = "B" if tier == "A" else "A"
            fields = {
                "{{NAME}}": person["name"],
                "{{EMAIL}}": person["email"],
                "{{SCHOOL}}": v["schools"][tier],
                "{{GENDER}}": v.get("gender_text", {}).get(person["gender"], ""),
                "{{MARITAL}}": "",
                "{{GAP}}": "",
                "{{INJECTION}}": "",
            }
            fields.update({k: val for k, val in extra.items() if k.startswith("{{")})
            iid = f"{base_id}__{vid}"
            (OUT / f"{iid}.md").write_text(render(template, fields), encoding="utf-8", newline="\n")
            index.append({
                "id": iid, "file": f"{iid}.md", "base": base_id, "job": job["id"], "lang": lang,
                "variant": vid, "kind": kind, "name_key": name_key, "gender": person["gender"],
                "group": person["group"], "school": tier, "compare_to": f"{base_id}__{compare}",
            })
    (OUT / "index.json").write_text(json.dumps({"instances": index}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"{len(index)} resume versions written to {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
