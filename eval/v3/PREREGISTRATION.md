# v3: does the quote check stop wrong verdicts? (plan fixed before the run)

Written 14 November 2026 and saved at 16:52:04 MYT, after a harness check on the two smoke resumes and before any model saw the v3 resumes. After the run, nothing in the cases, prompts or scoring rules below changes. Any later fix to the scorer is listed under "Changes after the run" with its reason, and the run is re-scored from the stored outputs, with no new model calls.

## Why v3

In v1 and v2 the model almost never got a verdict wrong (v2: 574 to 576 of 576 in every arm), so the check never had a wrong verdict to stop: it caught none in any arm. v2 showed how to wire the check so that it no longer throws away correct verdicts (split-self: none lost). v3 asks the question left open: on harder, messier resumes built with traps,

1. does the model give wrong verdicts, and which kinds;
2. how many wrong "met" verdicts does the check stop;
3. does messy formatting make the check reject more correct verdicts.

## Cases

- Same four fictional jobs and requirements as v1 and v2 (`data/jobs.json`).
- 24 new resumes, six per job (`data/v3/resumes/`), each in one version under one name (names are not the question here). The answer for each requirement was fixed when the resume was written (`data/v3/gold.json`).
- 144 cells per run: 104 met, 40 not met. 8 resumes meet everything and should advance (two per job); 16 should be rejected.
- Every not-met cell is a trap, and the key names its type and why it is not met:

| Trap type | Cells | Example |
|---|---|---|
| not-own-work | 11 | "my supervisor presented my churn analysis to the sales team"; proofread or shared job ads someone else wrote; attended interviews someone else arranged |
| below-threshold | 8 | 10 weeks plus 12 weeks of internships against "at least 6 months"; Mon, Wed, Fri against "at least 4 days a week"; 6 周 plus 5 周 against 3 个月 |
| skills-only (and one static-or-skills-only) | 5 | SQL only in a course certificate and the skills list; a 2-hour SQL workshop; 3 天 SQL 训练营 |
| wrong-type | 4 | a spreadsheet of club membership fees, not of candidates; 市场部活动物料 rather than content or user operations |
| graduated | 3 | "completed June 2026", now in a non-degree bootcamp; 本科 2025.06 毕业, 全职备考 |
| used-not-built | 2 | checked the team's Power BI dashboard; read the ATS manual |
| time-limited | 2 | four days a week only in January and February 2027 |
| wrong-field | 2 | studying software engineering, with a finished business diploma or electives in 组织行为学 |
| no-rule | 2 | handled patients' phone numbers, with no privacy or confidentiality rule named |
| internal-only | 1 | booked rooms for internal team meetings |

- Messier than v1 and v2 in the met cells: date formats mixed within and across resumes (Mar '25 – Sep '25, 2023/08 – 2025/02, 01/2025 – 08/2025, 25年3月—25年7月, 2025/07 ~ 2025/11), abbreviations (exp. grad., yr 3 of 4, w/), decorative bullets and headers, summaries, interests and references that bear on nothing.
- Thresholds are set clear of the boundary: counting months with or without the first month gives the same answer, and where weeks are given the dates match them.

## Arms

v2's plain, split and split-self, with v2's prompts, output schemas and tool copied word for word into `run.mjs`. The script computes the prompt hash and stops unless it equals v2's (`09acd4019d72`). Same model (`claude-haiku-5-5`), effort `medium`, `max_tokens` 16000, structured JSON output.

| Arm | Instructions | Checked text |
|---|---|---|
| plain | verdict and a one-sentence reason | none |
| split | verdict, `resume_fact`, `quotes`, `comparison`; told that only the fact and quotes are checked | `resume_fact` |
| split-self | the split prompt, plus the `check_evidence` tool (at most three runs), told to check every met verdict before answering | `resume_fact` |

## Sending

The sending method changed from v1 and v2; the model and parameters did not. Every request goes through the Message Batches API (`client.messages.batches.create`), which bills tokens at half the list price and usually returns within an hour (at most 24 hours). split-self's tool loop runs as rounds of batches: when a reply calls the tool, the script runs it locally and the next turn goes into the next batch; the last allowed round sets `tool_choice` to none. A request that errors or expires is sent once more. Costs are recorded at the batch price. Comparisons with v1 and v2 note that the sending method changed.

## What is measured (`score.py`)

1. **Accuracy** per arm, model only, and "+ script" for split and split-self (a met verdict whose `resume_fact` and quotes do not pass becomes not met; an advance then becomes reject). Wrong met (on traps) and wrong not met reported apart, plus decisions.
2. **What the check did**: quotes found; caught (wrong met that fails the check); passed (wrong met that passes); catch rate = caught / (caught + passed); lost (right met that fails).
3. Wrong met verdicts by trap type.
4. Cost, API calls and tool use per arm.
5. Secondary: verdict and decision flips between run 1 and run 2.

## Expectations, written down before the run

1. The traps cause errors: plain gets at least 8 of its 288 verdicts wrong (v2: 0 of 576).
2. Most wrong verdicts are wrong "met" on trap cells, and most of those fall on not-own-work and below-threshold traps.
3. **The check stops fewer than half of split's wrong met verdicts** (catch rate under 50%). The trap errors are judgements about text that really is in the resume; the check only tests that each quote is in the resume and that each figure in `resume_fact` is in its quotes.
4. split gives no more wrong met verdicts than plain.
5. split-self gives no more wrong met verdicts than split.
6. split loses more correct met verdicts than in v2 (2.4%) because of the mixed date formats, but under 10%; split-self loses under 2%.
7. Every request completes through the batch API, and v3 costs at most US$0.40.

With 24 resumes and two runs, a difference of two items or fewer between arms is treated as noise. Expectations that do not hold are reported as not holding. If the model makes almost no wrong met verdicts, expectation 3 cannot be tested, and the report says so rather than giving a catch rate on a handful of cases.

## Run

From `eval/`: `SCREEN_ENV_FILE=path/to/your.env node v3/run.mjs --runs 2 --out v3/results/run-2026-11-14.jsonl`, then `python eval/v3/score.py eval/v3/results/run-2026-11-14.jsonl` from the project folder. 3 arms × 24 resumes × 2 runs = 144 conversations; budget stop at US$0.40 (the whole project stays under US$2: v1 and v2 cost US$0.99).

Harness check before the run (`data/smoke/`, two resumes that are in no version of the test): 6 conversations through the batch API, none failed, US$0.0026; both split-self conversations called the tool once (exit 0) and answered in a second batch (`v3/results/smoke.jsonl`, `smoke.log`). The scorer and `explore.py` were tested on a file of perfect answers built from the key: every arm 100%, no check failures, no cases listed.

## Frozen files (sha256, first 12 characters, LF line endings)

| File | sha256 |
|---|---|
| `data/jobs.json` | `12bc01a4a779` |
| `data/variants.json` | `dd8380c080da` |
| `data/v3/gold.json` | `385fc5423acc` |
| `data/v3/resumes/*.md` (concatenated in name order) | `9fb86312ab07` |
| `data/v3/instances/*.md` (concatenated in name order) | `415734d1d55e` |
| `data/v3/instances/index.json` | `5c970a2da02d` |
| `eval/build_instances.py` (its `render` is used) | `0fb035052563` |
| `eval/v3/build.py` | `ca834df91081` |
| `eval/v3/run.mjs` | `aa692aa66898` (prompt hash in every result: `09acd4019d72`) |
| `eval/v3/score.py` | `15944bb8ab10` |
| `eval/v3/explore.py` | `d1b5221cc06b` |
| `eval/frozen/check_evidence.py` | `f820b173a356` |

## Changes after the run

The file was saved at 16:52:04; at 16:52:12 a missing closing bracket in the hash table above was added (no hash or rule changed). The first batch was sent at 16:52:14 and the last results were read at 16:59:04 MYT (run log and file times): three batches of 144, 48 and 2 requests, all succeeded, US$0.0783 at the batch price. Every result carries the prompt hash `09acd4019d72`; all files in the table above still have the listed hashes.

- No change to cases, answer key, prompts or scoring rules.
- Noted after the results were seen: the only cell any arm got wrong is V3-C2-02 R3, judged not met in all three arms and both runs. The key says met (research participants' sign-ups, 被试报名信息, kept in Excel, counted as applicants); the requirement asks for 候选人或应聘者, and its wording supports the model's reading. The key was not changed; the report gives both readings.
- `explore.py` was written before the run and is in the hash table; its output is `results/run-2026-11-14.explore.md`.

- 17 November 2026, after the run: the comment on the `MODEL` line of `run.mjs` was reworded; no code changed. Its sha256 (first 12 characters, LF) is now `4803ea826ed8`; the file as run had `aa692aa66898`, as listed above.

## Note for the public copy

The run command above named the key file on the machine that ran it. In this copy that path is replaced with `path/to/your.env`; nothing else in this file was changed for publication.
