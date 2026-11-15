# Seeded-error test: which wrong verdicts does the quote check stop? (plan fixed before the run)

Written 14 November 2026 and saved at 17:13:47 MYT, before `seed.py` was run without `--check` (the `--check` run only counts the inputs and confirms that every family B quote is copied from its resume; it computes no catch rate). The test makes no model calls and costs nothing.

## Why

In v1, v2 and v3 the model gave almost no wrong "met" verdicts, so how many the check stops could not be measured: v3 built 40 traps and the model fell for none. This test measures the check itself. It takes right answers the model really gave, changes them in one controlled way at a time, and runs the changed answer through the same script. That shows which kinds of error the check can see. It does not show how often a model makes them.

## Cases

- **Base**: every right "met" verdict that the split and split-self arms gave in v3 (both runs) and that passes the check: 409 verdicts, each a `resume_fact` with its quotes.
- **A1, a figure changed**: the first figure in `resume_fact` goes up by one (2025 to 2026, 07 to 08, 12 to 13); quotes unchanged. 229 of the 409 facts have a figure. Years and other figures are reported apart, because the script accepts a year in the fact if that year appears anywhere in the resume.
- **A2, a figure added**: a figure that is in none of the quotes is added to the fact ("for 7 months", "共 7 个月"). All 409.
- **A3, a quote copied almost word for word**: one word (English) or one character (Chinese) is dropped from the middle of the first quote. 394 quotes are long enough.
- **A4, a quote from another resume**: the first quote is replaced by a line from another resume in the same language. All 409.
- **B, a wrong reading of real text**: one wrong "met" verdict for each of the 40 v3 traps, in `misreadings.json`, written the way the split arm answers: the fact keeps to the resume's own words and figures, every quote is copied from the resume, and the wrong conclusion sits in the comparison, which is not checked. Examples: "The candidate's churn analysis was presented to the sales team" (the supervisor presented it); two internships of 10 and 12 weeks for a six-month requirement; "每周可实习 3 天" for four days a week.

The rule-based changes follow the approach of FactCC (Kryściński et al., EMNLP 2020, github.com/salesforce/factCC, BSD-3-Clause), which perturbs numbers, dates and entities to make sentences that no longer match their source. No code was copied: FactCC works on English claims only, and this test also changes quotes and covers Chinese.

## What is measured (`seed.py`)

For each family: how many changed answers the script does not return as "supported" (caught), overall, in English and in Chinese, and which status it returned. A1 is also split into years and other figures. Cases the script lets through in the A families, and family B cases it stops, are listed.

## Expectations, written down before the run

1. A2 (a figure added): at least 95% caught.
2. A3 (a quote copied almost word for word): at least 90% caught.
3. A4 (a quote from another resume): at least 99% caught.
4. A1, figures other than years: at least 90% caught. A1, years: fewer than 60% caught, because a year counts as supported when it appears anywhere in the resume.
5. B (a wrong reading of real text): at most 10% caught.

Expectations that do not hold are reported as not holding.

## Run

From the project folder: `python eval/seeded/seed.py`. Writes `eval/seeded/results/seeded-2026-11-14.md` and `.json`.

## Frozen files (sha256, first 12 characters, LF line endings)

| File | sha256 |
|---|---|
| `eval/seeded/seed.py` | `d5a33dc88eec` |
| `eval/seeded/misreadings.json` | `d117d6e11df8` |
| `eval/v3/results/run-2026-11-14.jsonl` (the stored answers) | `294298c4736d` |
| `eval/v3/score.py` (its loading and checking are used) | `15944bb8ab10` |
| `data/v3/gold.json` | `385fc5423acc` |
| `data/v3/instances/*.md` (concatenated in name order) | `415734d1d55e` |
| `eval/frozen/check_evidence.py` | `f820b173a356` |

## Changes after the run

Run at 17:13:52 MYT (file time of the results), five seconds after this file was saved: `results/seeded-2026-11-14.md` and `.json`. All files in the table above still have the listed hashes. No change to cases, changes or rules.

| Expectation | Held? |
|---|---|
| 1. A2 at least 95% caught | Held (409 of 409) |
| 2. A3 at least 90% caught | Held (394 of 394; 2 of them as "quote too short", the rest as "quote not found") |
| 3. A4 at least 99% caught | Held (409 of 409) |
| 4. A1 other figures at least 90%; years fewer than 60% | Other figures held (106 of 117, 90.6%); years **did not hold** (95 of 112, 84.8%): a changed year was caught far more often than expected |
| 5. B at most 10% caught | Held (0 of 40) |
