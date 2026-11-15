# v5: at a lower effort, does the model err, and do the check and a review stop its own mistakes? (plan fixed before the run)

Written 15 November 2026 and saved at 00:56:40 MYT, after a harness check on the two smoke resumes and before any model saw the v3 resumes at this effort. After the run, nothing in the cases, prompts or scoring rules below changes. Any later fix to the scorer is listed under "Changes after the run" with its reason, and the run is re-scored from the stored outputs, with no new model calls.

## Why v5

At effort `medium` the model fell for none of v3's 40 traps, so neither the quote check nor the second review could be measured on the model's own mistakes: the review test had to use misreadings written in by hand. v5 lowers one setting, the effort, to `low`, and asks:

1. does the model now give wrong "met" verdicts on the traps;
2. of its own wrong "met" verdicts, how many does the quote check stop, and how many does a second review reject;
3. how many of its right "met" verdicts does the review reject (false alarms).

## Cases and arms

- **Screening**: v3's 24 resumes and answer key, v3's three arms (plain, split, split-self) with v2's prompts word for word (prompt hash `09acd4019d72`), `claude-haiku-5-5`, effort **`low`** (v1 to v4 used `medium`), two runs: 144 conversations. The only change from v3 is the effort.
- **Review**: every "met" verdict the split and split-self arms give (both runs), with its `resume_fact`, quotes and comparison, goes to the reviewer of the second-judgement test, unchanged (`verify`'s prompts, hash `c6ae232bd450`, effort `medium`): verify-full (sees the comparison) and verify-fact (does not), two runs each. The review set is built from the screening outputs by `build_review.py`; whether a verdict is right never reaches the reviewer.
- Both stages go through the Message Batches API at half price. Budget stop US$0.20 for screening and US$0.25 for the review (the project total, about US$1.38 before this run, stays under US$2).

## What is measured (`score.py`)

1. Screening accuracy at `low` beside v3's `medium` run; wrong "met" and wrong "not met" verdicts; wrong "met" by trap type.
2. For the model's own wrong "met" verdicts in split and split-self: stopped by the check; rejected by each reviewer and run; through both.
3. For its right "met" verdicts: failed by the check; rejected by each reviewer and run.
4. Rates are given only where there are at least 5 wrong "met" verdicts; below that, counts only.

## Expectations, written down before the run

1. At `low`, plain gives at least 5 wrong "met" verdicts over the two runs (at `medium`: 0).
2. If split has at least 5 wrong "met" verdicts, the check stops fewer than half of them (the seeded test: real quotes read the wrong way all pass).
3. If split has at least 5 wrong "met" verdicts, verify-full rejects at least 80% of them in each run.
4. Each reviewer rejects at most 5% of the right "met" verdicts in each run.
5. split-self gives no more wrong "met" verdicts than split (a two-item tolerance).
6. Every request completes; v5 costs at most US$0.45.

If the model still gives almost no wrong "met" verdicts at `low`, expectations 2 and 3 cannot be tested and the report says so.

## Run

From `eval/`: `SCREEN_ENV_FILE=path/to/your.env node v5/run.mjs --runs 2 --out v5/results/run-2026-11-15.jsonl --budget 0.2`; then from the project folder `python eval/v5/build_review.py eval/v5/results/run-2026-11-15.jsonl`; then from `eval/` `node v5/review.mjs --runs 2 --out v5/results/review-2026-11-15.jsonl --budget 0.25`; then `python eval/v5/score.py eval/v5/results/run-2026-11-15.jsonl eval/v5/results/review-2026-11-15.jsonl`.

Harness check before the run (`data/smoke/`, two resumes in no version of the test): 6 conversations at effort `low` through the batch API, none failed, US$0.0023 (`v5/results/smoke.jsonl`, `smoke.log`). `build_review.py` and `score.py` were tested on v3's stored medium-effort outputs with a review file of answers taken from the key: no wrong met verdicts, no false alarms, counts only (no rates) where there were fewer than 5 wrong verdicts.

## Frozen files (sha256, first 12 characters, LF line endings)

| File | sha256 |
|---|---|
| `data/jobs.json` | `12bc01a4a779` |
| `data/v3/gold.json` | `385fc5423acc` |
| `data/v3/instances/*.md` (concatenated in name order) | `415734d1d55e` |
| `eval/v3/score.py` (its rules are used) | `15944bb8ab10` |
| `eval/v5/run.mjs` | `a142b119cc85` (prompt hash in every result: `09acd4019d72`) |
| `eval/v5/build_review.py` | `1ec76ee7b89e` |
| `eval/v5/review.mjs` | `d8a27fa1126e` (prompt hash in every review: `c6ae232bd450`) |
| `eval/v5/score.py` | `c40982722350` |
| `eval/frozen/check_evidence.py` | `f820b173a356` |

## Changes after the run

The file was saved at 00:56:40; the first batch was sent at 00:56:48 and the last results read at 01:04:02 MYT (run log): three batches of 144, 48 and 5 requests, all succeeded, US$0.0733 at the batch price. Every result carries the prompt hash `09acd4019d72` and effort `low`; all files in the table above still have the listed hashes. No change to cases, prompts or scoring rules.

- **The review stage was not run** (decided after the screening results were seen). At effort `low` the split and split-self arms gave 413 "met" verdicts and none was wrong, so there was no wrong verdict for the review to reject (expectations 2 and 3), and the review's false alarms on right verdicts had already been measured in the second-judgement test (0 of 412). Running it would have cost about US$0.15 for no new answer to the question v5 asked. `score.py` was run with an empty review file (`results/review-not-run.jsonl`), so its review tables are empty.

| Expectation | Held? |
|---|---|
| 1. Plain gives at least 5 wrong "met" verdicts at `low` | **Did not hold** (0; plain got all 288 verdicts right) |
| 2. The check stops fewer than half of split's wrong "met" verdicts | Cannot be tested (none) |
| 3. verify-full rejects at least 80% of split's wrong "met" verdicts | Cannot be tested (none; review not run) |
| 4. Each reviewer rejects at most 5% of the right "met" verdicts | Not tested (review not run) |
| 5. split-self gives no more wrong "met" verdicts than split | Held (0 and 0) |
| 6. Every request completes, at most US$0.45 | Held (US$0.0733, plus US$0.0023 for the harness check) |

## Note for the public copy

The run command above named the key file on the machine that ran it. In this copy that path is replaced with `path/to/your.env`; nothing else in this file was changed for publication.
