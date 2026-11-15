# v2: how the quote check is wired in, on new resumes (plan fixed before the run)

Written 13 November 2026 and saved at 21:57:15 MYT, after a harness check on the two smoke resumes and before any model saw the v2 resumes: the results file was created in the same second, by the run command issued after this file was saved. (An earlier version of this line said "about 22:00"; the file times give 21:57.) After the run, nothing in the cases, prompts or scoring rules below changes. Any later fix to the scorer is listed under "Changes after the run" with its reason, and the run is re-scored from the stored outputs, with no new model calls.

## Why v2

In v1 (`../PREREGISTRATION.md`, `../EVALUATION.md`), running the evidence-check script on each verdict's finding removed 356 correct "met" verdicts (18% of all met requirements) and caught none of the wrong ones. Almost all failures came from the six requirements that contain a figure ("at least 4 days a week", "at least 6 months"): the finding restated the job's threshold, and that figure is not in the resume. v2 tests two ways of wiring the check in, on resumes no model has seen:

- **split**: each verdict carries `resume_fact` (only what the resume says, with the resume's own dates and figures) and `comparison` (how that fact meets the requirement; the job's figures and any arithmetic go here). Only `resume_fact` is checked.
- **split-self**: the same prompt, plus a `check_evidence` tool that runs the script on the facts and quotes the model passes, at most three times, before it answers.

## Cases

- Same four fictional jobs and requirements as v1 (`data/jobs.json`).
- 12 new base resumes, three per job (`data/v2/resumes/`), each under four names (English: Daniel Hughes, Emma Hughes, Tan Wei Jie, Nur Aisyah binti Ahmad; Chinese: 陈浩宇, 陈雨欣, 刘子轩, 刘思琪 with the 性别 field): 48 versions. The answer for each requirement was fixed when the resume was written (`data/v2/gold.json`): 212 of 288 cells per run are met (74%), 16 versions should advance, 72 cells per run fall on requirements with a figure.
- Harder than v1 on the figure requirements: experience that only reaches the threshold when two internships are added together, availability written in words (four days, 四天, 五个月), and thresholds set clear of the boundary, so counting months with or without the first month gives the same answer.

## Arms

Same model (`claude-haiku-5-5`, effort `medium`), same job and resume text, structured JSON output (`run.mjs`).

| Arm | Instructions | Checked text |
|---|---|---|
| plain | v1's plain prompt, word for word | none |
| evidence | v1's evidence prompt, word for word | `finding` |
| split | verdict, `resume_fact`, `quotes`, `comparison`; told that only the fact and quotes are checked | `resume_fact` |
| split-self | the split prompt, plus the `check_evidence` tool (at most three runs), told to check every met verdict before answering | `resume_fact` |

## What is measured (`score.py`)

1. **Accuracy** per arm, model only, and "+ script" for the three checked arms (a met verdict whose checked text and quotes do not pass becomes not met; an advance then becomes reject). Reported overall, on requirements with a figure and on the others, plus decisions.
2. **What the check did**: quotes found; met verdicts failing the check, on requirements with a figure and on the others; lost (met in the key) and caught (not met in the key); wrong met verdicts that passed.
3. Cost, API calls, tool use, median latency per arm.
4. Secondary: verdict and decision flips with the name, against run 1 vs run 2.

## Expectations, written down before the run

1. Model only, all four arms get at least 95% of verdicts right.
2. **evidence + script** repeats v1's problem: at least 30% of its met verdicts on requirements with a figure fail the check (v1: 69%).
3. **split + script** fails at most 5% of its met verdicts on requirements with a figure, and loses at most 2% of all met requirements.
4. **split-self + script** loses no more than split, and costs 1.5 to 3 times as much as split.
5. In every checked arm the check catches at most 2 wrong verdicts: wrong verdicts come with real quotes.
6. Name changes flip verdicts no more often than two runs of the same version.

With 48 versions and two runs, a difference of two items or fewer between arms is treated as noise. Expectations that do not hold are reported as not holding.

## Run

From `eval/`: `SCREEN_ENV_FILE=path/to/your.env node v2/run.mjs --runs 2 --out v2/results/run-2026-11-13.jsonl`, then `python eval/v2/score.py eval/v2/results/run-2026-11-13.jsonl` from the project folder. 4 arms × 48 versions × 2 runs = 384 conversations; budget stop at US$0.90 (the whole project stays under US$2: v1 cost US$0.63).

Harness check before the run (`data/smoke/`, two resumes that are in neither v1 nor v2): 8 conversations, none failed, US$0.0068; the split-self arm called the tool once per conversation and the script ran (exit 0). The scorer was tested on a file of perfect answers built from the key (every arm 100%, no check failures).

## Frozen files (sha256, first 12 characters, LF line endings)

| File | sha256 |
|---|---|
| `data/jobs.json` | `12bc01a4a779` |
| `data/variants.json` | `dd8380c080da` |
| `data/v2/gold.json` | `2029d550a090` |
| `data/v2/resumes/*.md` (concatenated in name order) | `a5ae169ce5ef` |
| `data/v2/instances/*.md` (concatenated in name order) | `91cf4c99207d` |
| `data/v2/instances/index.json` | `6e81d5a343f9` |
| `eval/build_instances.py` (its `render` is used) | `0fb035052563` |
| `eval/v2/build.py` | `efab39d0742d` |
| `eval/v2/run.mjs` | `919c4a400794` (prompt hash in every result: `09acd4019d72`) |
| `eval/v2/score.py` | `3e7254c3bdfb` |
| `eval/frozen/check_evidence.py` | `f820b173a356` |

## Changes after the run

The run started at 21:57:15 and finished at 22:05:46 MYT (file times of the results file): 384 conversations, none failed, US$0.3649. Every result carries the prompt hash `09acd4019d72`; all files in the table above still have the listed hashes.

- No change to cases, prompts or scoring rules.
- Added after the results were seen, and reported as exploratory: `eval/v2/explore.py`, which lists every split verdict that fails the check (9 of 10 count the resume's entries, "两段" or "two entries"; 1 quote leaves out the fact's dates) and every answer that leaves out a requirement (one split-self answer left out R5 and R6). Output: `results/run-2026-11-13.explore.md`.

## Note for the public copy

The run command above named the key file on the machine that ran it. In this copy that path is replaced with `path/to/your.env`; nothing else in this file was changed for publication.
