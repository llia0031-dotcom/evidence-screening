# Second judgement: does a review of each "met" verdict stop misreadings? (plan fixed before the run)

Written 14 November 2026 and saved at 18:20:07 MYT, after a harness check on two review items and before the full run. After the run, nothing in the cases, prompts or scoring rules below changes. Any later fix to the scorer is listed under "Changes after the run" with its reason, and the run is re-scored from the stored outputs, with no new model calls.

## Why

The seeded-error test ([`../seeded/PREREGISTRATION.md`](../seeded/PREREGISTRATION.md)) showed that the quote check stops made-up evidence but no wrong reading of real text: all 40 misreadings, one per v3 trap, passed it. A misreading needs a different kind of check. This test tries the simplest one: a second call that reviews each "met" verdict and says whether the resume really shows the requirement is met.

## Cases

`items.json`, built by `build.py` from stored answers, with no model calls:

- **103 right answers**: for each requirement the v3 key marks met, one right "met" answer the split arm gave in v3 (run 1 if it has one, else run 2, else split-self), with its `resume_fact`, quotes and comparison. V3-C2-02 R3 has none, because every arm judged it not met.
- **40 misreadings**: `../seeded/misreadings.json`, one per v3 trap, written before the seeded test: the fact keeps to the resume's own words, every quote is copied from the resume, and the wrong conclusion sits in the comparison (for example "The candidate's churn analysis was presented to the sales team", where the supervisor presented it).

## Reviewers

Same model as every round (`claude-haiku-5-5`, effort `medium`, `max_tokens` 16000), structured JSON output `{verdict: "right" | "wrong", reason}`, the reason in the resume's language. Each review sees the job posting, the resume, the requirement and the verdict "met". The two arms differ only in how much of the answer the reviewer sees:

| Arm | Sees |
|---|---|
| verify-full | the resume fact, the quotes and the screener's comparison (its reasoning) |
| verify-fact | the resume fact and the quotes, without the comparison |

Baseline with no new calls, **re-judge**: a fresh judgement that never sees the answer, taken from the stored v3 plain-arm runs 1 and 2. An item is flagged when plain judged that requirement not met. This follows the factored variant of Chain-of-Verification (Dhuliawala et al., arXiv 2309.11495), where verification questions are answered without the earlier answer in view so its mistakes are not copied. Its numbers were seen while the scorer was tested, because they come from stored runs: 40 of 40 misreadings flagged in each run and no right answer flagged. They show only that this model does not make these misreadings on its own; they say nothing about errors it does make, which a second run of the same model would tend to repeat (v3: no verdict changed between run 1 and run 2 in any arm).

Two runs per arm: 143 items × 2 arms × 2 runs = 572 requests. **Sending**: Message Batches API, as in v3; costs recorded at the batch price (half the list price). Budget stop at US$0.30 (the project stays under US$2; about US$1.07 spent so far).

## What is measured (`score.py`)

1. Misreadings caught: judged "wrong" by the reviewer, per arm and run, summed over runs, and by trap type.
2. False alarms: right answers judged "wrong", per arm and run.
3. A failed or missing review counts as not flagged.
4. Secondary: items whose review differs between run 1 and run 2.

## Expectations, written down before the run

1. verify-fact catches at least as many misreadings as verify-full (over both runs, allowing two items of noise): seeing the screener's reasoning pulls the reviewer toward agreeing.
2. verify-fact catches at least 85% of misreadings (68 of 80 over both runs).
3. verify-full catches at least 60% (48 of 80).
4. Each arm flags at most 5% of right answers (10 of 206 over both runs).
5. Each arm gives a different review on run 2 for at most 5% of items (7 of 143).
6. Every request completes through the batch API, at most US$0.30.

Expectations that do not hold are reported as not holding.

## Run

From `eval/`: `SCREEN_ENV_FILE=path/to/your.env node verify/run.mjs --runs 2 --out verify/results/run-2026-11-14.jsonl`, then `python eval/verify/score.py eval/verify/results/run-2026-11-14.jsonl` from the project folder.

Harness check before the run: two review items (one right answer, one misreading) through both arms, 4 requests in one batch, none failed, US$0.0004 (`verify/results/smoke.jsonl`, `smoke.log`). The scorer was tested on a file of perfect reviews built from the item kinds: 40 of 40 caught and no false alarm in every run.

## Frozen files (sha256, first 12 characters, LF line endings)

| File | sha256 |
|---|---|
| `eval/verify/items.json` | `0a6cb9683a2b` |
| `eval/verify/build.py` | `045239473799` |
| `eval/verify/run.mjs` | `0a7da7fd7858` (prompt hash in every result: `c6ae232bd450`) |
| `eval/verify/score.py` | `370faba2bdc9` |
| `eval/seeded/misreadings.json` | `d117d6e11df8` |
| `eval/v3/results/run-2026-11-14.jsonl` (stored answers and the re-judge baseline) | `294298c4736d` |
| `eval/v3/score.py` (its loading is used) | `15944bb8ab10` |
| `data/v3/instances/*.md` (concatenated in name order) | `415734d1d55e` |
| `data/jobs.json` | `12bc01a4a779` |

## Changes after the run

The file was saved at 18:20:07; the batch was sent at 18:20:15 and its results were read at 18:23:19 MYT (run log and file times): one batch of 572 requests, all succeeded, US$0.0504 at the batch price. Every result carries the prompt hash `c6ae232bd450`; all files in the table above still have the listed hashes. No change to cases, prompts or scoring rules.

| Expectation | Held? |
|---|---|
| 1. verify-fact catches at least as many as verify-full, two items of noise allowed | Held (79 against 80) |
| 2. verify-fact catches at least 68 of 80 | Held (79) |
| 3. verify-full catches at least 48 of 80 | Held (80) |
| 4. Each arm flags at most 10 of 206 right answers | Held (0 in both arms) |
| 5. At most 7 of 143 items reviewed differently in run 2 | Held (verify-full 0, verify-fact 1) |
| 6. Every request completes, at most US$0.30 | Held (572 of 572; US$0.0504) |

Noted after the results were seen: the one misreading not caught (verify-fact, run 2, V3-C1-06 R3) has the verdict "right" while its reason says the screener's "met" is wrong, because the account is a personal project marked 非实习. The rule counts the verdict field, so it stays a miss.

## Note for the public copy

The run command above named the key file on the machine that ran it. In this copy that path is replaced with `path/to/your.env`; nothing else in this file was changed for publication.
