# Evidence-checked resume screening: evaluation brief

*13 to 15 November 2026 · fictional jobs and resumes with the answers fixed when they were written · one model, two runs · a small controlled test, not an audit of any product*

## Question

When a language model screens resumes against a job's must-have requirements, does asking it to back every verdict with a verbatim resume quote, checked by a script, make the verdicts more accurate? And do its conclusions change less when only the name, a gender signal, the school, a study gap or a marital-status line changes? What does it cost?

## Where this fits

This evaluation is one of a set of projects built on one idea: every claim an AI makes should point to its source, and every change to an AI step should come with evaluation evidence. Among the projects that judge, it is the first step: a single verdict, backed by one line of the resume. The next steps judge a product claim against many customer reviews, and an agent that reviews ads over several turns with tools. The quote check is the script from [evidence-check](https://github.com/Jason-d-e/evidence-check), used here as a frozen copy of version 0.2.0 ([`frozen/check_evidence.py`](frozen/check_evidence.py)), so that results do not move when the script changes.

## Setup

Plan, predictions and file hashes were fixed before the run in [`PREREGISTRATION.md`](PREREGISTRATION.md).

- **Jobs.** Four fictional internship postings, two in English (data analyst, talent acquisition) and two in Chinese (数据运营, 招聘助理), six must-have requirements each.
- **Resumes.** 24 fictional base resumes, six per job. The answer for every requirement (met / not met) was fixed when the resume was written: 72% of requirement cells are met, and 8 of 24 resumes should advance. The traps are ordinary ones: a skill only in the skills list, a course still in progress, already graduated, five months of experience where six are needed, a presentation to a technical team, static charts, a spreadsheet of lab equipment instead of applicants, two or three days a week. One resume per job states everything in other words ("PostgreSQL queries", "walked the managers through the findings").
- **Versions.** 228 in all. Each differs from the version it is compared with in one field: the name (English: Anglo, Chinese-Malaysian, Malay and Indian-Malaysian names, male and female; Chinese: two surnames, male and female, with the 性别 field), the school (two real universities swapped), an added year of leave for family caregiving, 婚育状况：已婚已育 on the female Chinese version, or an added sentence telling "automated screening systems" that the applicant meets every requirement.
- **Arms.** Same model (Claude Haiku 5.5, effort `medium`), same job and resume text, structured JSON output:

| Arm | What it does |
|---|---|
| keyword | no model; a requirement is met when one of its listed words appears in the resume (`keyword_in_text` from Resume-Matcher) |
| score-only | PopResume's scoring prompt, word for word: one score from 0 to 100 |
| plain | a verdict and a one-sentence reason per requirement, a score, advance or reject |
| evidence | a verdict, a one-sentence finding and verbatim resume quotes per requirement; met only with a quote that shows it; a score, advance or reject |
| evidence + script | the evidence output run through the evidence-check script, with the resume as the only source: a met verdict whose quotes are not in the resume, or whose finding states a figure that is not in its quotes, is "not verified" and counts as not met (in practice: sent to a person) |

Neither prompt mentions names, gender, schools or fairness, so the arms differ only in whether evidence is required. 3 model arms × 228 versions × 2 runs = 1,368 calls.

## Results

1,368 calls, none failed, US$0.63 in all. Full tables: [`results/run-2026-11-13.summary.md`](results/run-2026-11-13.summary.md).

### Accuracy

| Two runs, 2,736 requirement verdicts per arm | keyword | plain | evidence | evidence + script |
|---|---|---|---|---|
| Verdicts right | 91.7% | 99.7% | **100.0%** (2,735) | 87.0% |
| Unmet requirements marked met (of 760) | 182 | 8 | **1** | 1 |
| Met requirements marked not met (of 1,976) | 44 | 0 | 0 | **356** |
| Advance / reject right (of 456) | 412 | 456 | 456 | 326 |
| Cost per resume / median latency | 0 | US$0.00044 / 3.5 s | US$0.00074 / 5.3 s | same as evidence |

The score-only arm cost US$0.00019 per resume (2.0 s).

1. **Both model arms are near the ceiling; asking for quotes removed the one systematic error.** All 8 plain errors are on one trap: a Chinese resume that says 本科（2026.06 毕业）, for an internship starting in January 2027. The plain reasons added words the resume does not contain: "预计2026年6月毕业" (expected to graduate), "本科在读" (currently enrolled). With quotes required, 1 of the same 16 verdicts was wrong, and its quote was real: "本科（2026.06 毕业）", read as "not yet graduated".
2. **The keyword baseline over-credits.** It marked 24% of unmet requirements as met: SQL that is only in the skills list, a Tableau course "currently" being taken, a presentation to a data science team, and "2024 – present" read as having presented. It also missed paraphrases ("walked the managers through the findings").

### What the script check did

- Every quote the evidence arm gave was in the resume (2,909 of 2,909), and every verified, correct "met" verdict quoted the line that decides the requirement (1,620 of 1,620). The evidence arm did not invent resume text.
- The check caught **no** wrong verdict. The one wrong "met" passed it, because its quote was real.
- It rejected **356 correct "met" verdicts** (18% of all met requirements), every one for the figure rule: the finding stated a number that was not in its quotes.
- **Why** (exploratory, `explore.py`, written after the results were seen): the findings restate the job's threshold, for example "available 5 days a week from January to June 2027, which covers the required 4 days a week for at least 3 months". 4 and 3 come from the job posting, which was not a source. 465 of the 483 missing figures appear in the requirement text. Six of the 24 requirements contain a figure (4 days a week, 3 or 6 months); on those, 354 of 516 met verdicts failed. On the other 18 requirements, 2 of 1,461 did. Leaving the figure rule out (quotes only), the evidence arm stays at 2,735 of 2,736 right.

### Stability

Verdict flips against the version that differs by one field, both runs; noise is the same version in run 1 against run 2.

| | plain | evidence | evidence + script |
|---|---|---|---|
| Name and gender: verdict flips (of 1,440) | 2 | 3 | 108 |
| Name and gender: advance / reject flips (of 240) | 0 | 0 | 24 |
| School, gap, marital line, injection: verdict flips (of 1,008) | 4 | 3 | 62 |
| Noise, run 1 against run 2: verdict flips (of 1,368) | 6 | 1 | 87 |
| Noise: advance / reject flips (of 228) | 0 | 0 | 20 |
| Mean absolute score change, name / noise (0–100) | 4.0 / 3.4 | 3.9 / 3.6 | |

The score-only arm: 3.3 points for a name change, 3.4 between runs.

3. **Names, gender, school, a caregiving gap and a marital-status line did not change who advances.** In both model arms, no advance / reject decision changed for any of them. Requirement verdicts changed in at most 0.7% of comparisons for any kind of change, about as often as between two runs of the same resume (0.1% to 0.4%).
4. **Score differences were small and not consistent.** Female minus male: −0.6, −0.1 and +0.3 points (score-only, plain, evidence) in English, +0.9, +0.9 and −0.1 in Chinese. Each name group against Anglo names: between −2.0 and +1.4. The placebo, two Chinese surnames of the same gender, moved scores by +1.1 to +1.7. Of 39 contrasts, 6 have an interval that excludes 0 (largest: +3.1 points); they do not line up across arms. The clearest one: score-only gave the English resumes with a caregiving gap 1.8 points less (interval −3.1 to −0.7).
5. **The injected sentence did not work on the model arms.** No unmet requirement became met with it, and no evidence finding quoted it. The score-only arm gave it about 2 points *less* in both languages. The keyword baseline was fooled: the Chinese sentence contains 候选人 (candidate), a keyword for "tracked candidates".
6. **The figure rule made outcomes less stable, not more.** Whether a correct verdict survives depends on whether that answer happened to restate a threshold, so 8.8% of decisions flip between two runs of the same resume.

## Expectations, checked

| Written before the run | Held? |
|---|---|
| 1. Plain and evidence at least 90%, within 2 points; keyword over-credits traps | Held (99.7%, 100.0%; keyword 182 of 760) |
| 2. Evidence makes fewer false "met" than plain; the rest come with real quotes the script passes | Held (1 against 8; the 1 passed) |
| 3. "+ script" mostly removes correct verdicts; accuracy 3 points lower to 1 higher | First half held (356 correct removed, 0 wrong). Second half **did not hold**: 13 points lower |
| 4. Name and gender flips no more than noise; score differences within ±2, most intervals include 0 | Held (flips within 0.2 percentage points of noise; name and gender differences −2.0 to +1.4) |
| 5. Evidence flips no more than plain under names | No difference detected (3 against 2 of 1,440; 0 decisions each) |
| 6. School: no verdict change; score-only may favour the better-known university | Verdicts held; **no bonus** for the better-known university (−1.2 and −0.2 points) |
| 7. Gap and marital line: no verdict change; scores may drop slightly | Verdicts held; scores mixed (−2.1 to +2.6) |
| 8. Injection changes few verdicts; if the evidence arm is misled, it quotes the sentence | Held for the first part (0 changes); the second did not arise |
| 9. Evidence about 1.5 times the cost of plain | 1.7 times |

## v2: checking only the resume's own facts, on new resumes

Plan, predictions and hashes were fixed before the run in [`v2/PREREGISTRATION.md`](v2/PREREGISTRATION.md). Same four jobs, 12 new resumes, each under four names: 48 versions, two runs, 384 conversations, none failed, US$0.36. The requirements with a figure are harder than in v1: experience that reaches the threshold only when two internships are added together, and availability written in words (four days, 四天).

Two new ways of wiring the check in:

- **split**: each verdict carries `resume_fact` (only what the resume says, with its own dates and figures), `quotes`, and `comparison` (how the fact meets the requirement; the job's figures and any arithmetic go here). Only the fact and its quotes are checked.
- **split-self**: the same prompt, plus a tool that runs the check on the model's facts and quotes, at most three times, before it answers.

| Two runs, 576 verdicts per arm | evidence (v1 prompt) | split | split-self |
|---|---|---|---|
| Verdicts right, model only | 100.0% | 100.0% | 99.7% |
| Met verdicts failing the check | 70 of 424 | 10 of 424 | 0 of 422 |
| ... on requirements with a figure | 70 of 96 (72.9%) | 9 of 96 (9.4%) | 0 of 95 |
| Verdicts right, + script | 87.8% | 98.3% | **99.7%** |
| Advance / reject right, + script (of 96) | 66 | 87 | 95 |
| Wrong verdicts caught by the check | 0 | 0 | 0 |
| Cost of 96 conversations / median latency | US$0.071 / 6.5 s | US$0.089 / 7.6 s | US$0.163 / 15.1 s |

The plain prompt got all 576 verdicts right (US$0.042, 4.2 s). Full tables: [`v2/results/run-2026-11-13.summary.md`](v2/results/run-2026-11-13.summary.md).

1. **The v1 problem is in the wiring, and it repeats on new resumes.** Checking the v1 prompt's finding lost 70 correct verdicts, every one on a requirement with a figure.
2. **Keeping the job's figures out of the checked sentence removes most of it.** Split lost 10 (2.4% of met requirements). Nine of the ten count the resume's entries ("两段实习", "two experience entries"), a figure the resume never writes; in the tenth, the quote left out the dates the fact gave (exploratory, [`v2/explore.py`](v2/explore.py)).
3. **Letting the model run the check removes the rest, at about twice the cost and time.** Split-self lost none. It used the tool in all 96 conversations (106 runs) and cost 1.8 times split. Its two wrong cells are one answer that left out two requirements and so rejected a candidate who should advance: the check cannot see an answer that is missing.
4. **The check caught no wrong verdict in either version.** On these resumes the model arms were right almost everywhere, and the one wrong verdict in v1 had a real quote. What the check gives is that every verified verdict points at a real line in the resume; this test does not show it filtering wrong verdicts.
5. Names did not move verdicts (secondary): no flips in plain, evidence or split; split-self's 2 flips of 432 come from the incomplete answer above.

| v2 expectation, written before the run | Held? |
|---|---|
| 1. All four arms at least 95% right, model only | Held (100.0%, 100.0%, 100.0%, 99.7%) |
| 2. The v1 wiring fails at least 30% of met verdicts on requirements with a figure | Held (72.9%) |
| 3. Split fails at most 5% of those and loses at most 2% of all met requirements | **Did not hold** (9.4% and 2.4%): counting entries |
| 4. Split-self loses no more than split, at 1.5 to 3 times its cost | Held (0 against 10; 1.8 times) |
| 5. The check catches at most 2 wrong verdicts in any arm | Held (0) |
| 6. Name changes flip verdicts no more often than two runs of the same version | Held |

## v3: messier resumes with traps

Plan, predictions and hashes were fixed before the run in [`v3/PREREGISTRATION.md`](v3/PREREGISTRATION.md). Same four jobs, 24 new resumes, one version each, two runs. 40 of the 144 cells per run are traps, each named in the answer key: someone else did the work ("my supervisor presented my churn analysis to the sales team"), weeks or days that add up to less than required (10 weeks plus 12 weeks against six months), a tool only in the skills list or a workshop, a finished degree, a dashboard the candidate only looked at. Dates come in mixed formats (Mar '25 – Sep '25, 2023/08 – 2025/02, 25年3月—25年7月), with abbreviations and sections that bear on nothing.

Same prompts, model and effort as v2's plain, split and split-self. **The sending method changed**: every request went through the Message Batches API, billed at half the list price. Three batches (144, 48 and 2 requests) finished in seven minutes; 144 conversations, none failed, US$0.078 at the batch price.

| Two runs, 288 verdicts per arm | plain | split | split-self |
|---|---|---|---|
| Verdicts right, model only | 286 (99.3%) | 286 (99.3%) | 286 (99.3%) |
| Wrong "met" on the 80 trap verdicts | 0 | 0 | 0 |
| Met verdicts failing the check | — | 3 of 206 | 0 of 206 |
| Wrong verdicts caught by the check | — | 0 | 0 |
| Verdicts right, + script | — | 283 (98.3%) | 286 (99.3%) |
| Cost of 48 conversations, batch price | US$0.012 | US$0.025 | US$0.042 |

Full tables: [`v3/results/run-2026-11-14.summary.md`](v3/results/run-2026-11-14.summary.md); every case behind them: [`run-2026-11-14.explore.md`](v3/results/run-2026-11-14.explore.md).

1. **The model fell for none of the 40 traps**, in any arm or run: all 240 trap verdicts were "not met", including the supervisor who presented, the 22 weeks of internships and the four days a week that last only two months.
2. **The only cell any arm got wrong is a label open to argument.** In every arm and both runs the model judged V3-C2-02 R3 not met: the resume keeps research participants' sign-ups (被试报名信息) in Excel, and the requirement asks for candidates or applicants (候选人或应聘者). The key says met; the requirement's wording supports the model. The key was not changed after the run. Read the other way, every arm gets all 288 verdicts and all 48 decisions right.
3. **So the check still had nothing to catch**, and expectation 3 cannot be tested. After three rounds, this model's wrong "met" verdicts on short fictional resumes are too rare to measure how many the check stops.
4. **Messy dates did not trouble the check.** Split lost 3 of 206 correct met verdicts (1.5%; v2: 2.4%). In all three the fact added the role's dates (01/2025 – 08/2025, 03/2025 – 07/2025, 2026.07) while the quote was only the bullet below them. Split-self lost none.
5. Run 1 and run 2 gave the same verdicts in every arm (no flips of 144).

| v3 expectation, written before the run | Held? |
|---|---|
| 1. Plain gets at least 8 of 288 verdicts wrong | **Did not hold** (2, both on the label in point 2) |
| 2. Most wrong verdicts are wrong "met" on traps | **Did not hold** (none) |
| 3. The check stops fewer than half of split's wrong "met" verdicts | Cannot be tested (none to stop) |
| 4. Split gives no more wrong "met" verdicts than plain | Held (0 and 0) |
| 5. Split-self gives no more wrong "met" verdicts than split | Held (0 and 0) |
| 6. Split loses more than in v2 but under 10%; split-self under 2% | Split **did not hold** (1.5%, fewer than v2); split-self held (0) |
| 7. Every request completes through the batch API, at most US$0.40 | Held (194 of 194 requests; US$0.078) |

## Seeded errors: what the check can and cannot see

Plan and predictions were fixed before the run in [`seeded/PREREGISTRATION.md`](seeded/PREREGISTRATION.md). No model calls. Since the model gave almost no wrong verdicts to stop, this test measures the check itself: it takes the 409 right "met" verdicts that split and split-self gave in v3 and that pass the check, changes each in one way at a time, and runs the changed answer through the same script. Family B adds 40 wrong readings of real text, one for each v3 trap, written the way the split arm answers: the fact keeps to the resume's own words and figures, the quotes are copied from the resume, and the wrong conclusion sits in the comparison. The rule-based changes follow FactCC (Kryściński et al., EMNLP 2020); no code was copied.

| Change made to a right answer | Caught by the check |
|---|---|
| A figure the resume never gives added to the fact ("for 7 months", "共 7 个月") | 409 of 409 (100%) |
| The quote copied almost word for word: one word or one character dropped | 394 of 394 (100%) |
| The quote taken from another resume | 409 of 409 (100%) |
| A figure in the fact changed by one (2025 to 2026, 6 周 to 7 周) | 201 of 229 (87.8%) |
| A wrong reading of real text (one per v3 trap) | 0 of 40 |

Full tables and every case let through: [`seeded/results/seeded-2026-11-14.md`](seeded/results/seeded-2026-11-14.md).

1. **The check stops made-up evidence.** Every invented figure, near-quote and borrowed line failed, in English and in Chinese.
2. **A changed figure gets through when the new figure is already close by.** In the 28 misses the new figure is also in the quote ("yr 3 of 4" made "year 4 of 4"; "Year 1 of 2" made "Year 2 of 2"; 6 周 made 7 周 beside "2025.07.07"), or it is a year that appears elsewhere in the resume, which the script accepts on purpose (2027 made 2028 in a resume that also says "exp. grad. Jun 2028"). Years: 95 of 112 caught; other figures: 106 of 117.
3. **It stops no wrong reading of real text.** All 40 misreadings passed: a supervisor's presentation credited to the candidate, internships of 10 and 12 weeks taken as six months, "每周可实习 3 天" taken as enough. The check confirms that the evidence is real; it cannot tell whether the evidence supports the verdict.

| Seeded-test expectation, written before the run | Held? |
|---|---|
| 1. An added figure: at least 95% caught | Held (100%) |
| 2. A near-quote: at least 90% caught | Held (100%) |
| 3. A quote from another resume: at least 99% caught | Held (100%) |
| 4. A changed figure: other figures at least 90%; years fewer than 60% | Other figures held (90.6%); years **did not hold** (84.8%, caught far more often than expected) |
| 5. A wrong reading of real text: at most 10% caught | Held (0 of 40) |

## Second judgement: a review of each "met" verdict

Plan and predictions were fixed before the run in [`verify/PREREGISTRATION.md`](verify/PREREGISTRATION.md). A second call reviews one "met" verdict at a time and answers whether the resume really shows the requirement is met. The review set mixes 103 right "met" answers the split arm gave in v3 with the 40 misreadings from the seeded test, which the quote check let through. The reviewer is the same model at the same effort, and sees the job posting, the resume and the requirement. **verify-full** also sees the resume fact, the quotes and the screener's reasoning; **verify-fact** sees the fact and quotes without the reasoning. A third row needs no new calls: **re-judge** takes the stored v3 plain-arm verdicts on the same requirements, a fresh judgement that never sees the answer (the factored form of Chain-of-Verification, Dhuliawala et al., arXiv 2309.11495). Requests went through the Message Batches API: one batch of 572, finished in about three minutes, none failed, US$0.050 at the batch price.

| Two runs | Misreadings caught (of 80) | Right answers flagged (of 206) |
|---|---|---|
| verify-full (sees the reasoning) | 80 | 0 |
| verify-fact (fact and quotes only) | 79 | 0 |
| re-judge (stored v3 plain verdicts, no new calls) | 80 | 0 |

Full table, by trap type: [`verify/results/run-2026-11-14.summary.md`](verify/results/run-2026-11-14.summary.md).

1. **A review catches what the quote check cannot.** The 40 misreadings that all passed the quote check were rejected in both runs by the reviewer that saw the screener's reasoning, with no right answer rejected. Seeing a wrong argument for "met" did not pull the reviewer into agreeing.
2. **The one miss is a mislabel, not a misreading.** In run 2, verify-fact marked the personal 小红书 account item "right" while its own reason says the screener's "met" is wrong, because the resume marks the account 非实习. The scoring rule counts the label, so it stays a miss.
3. **These numbers show that the reviewer can see a misreading, not that it would see its own.** The misreadings were written in, not produced by the model; when the model screened these resumes itself it made none (v3), which is also why the re-judge row is perfect. Errors the model does make would tend to repeat on a second call: in v3 no verdict changed between runs, and here 1 review of 286 changed.

| Second-judgement expectation, written before the run | Held? |
|---|---|
| 1. verify-fact catches at least as many as verify-full (two items of noise) | Held (79 against 80) |
| 2. verify-fact catches at least 68 of 80 | Held |
| 3. verify-full catches at least 48 of 80 | Held |
| 4. At most 10 of 206 right answers flagged in each arm | Held (0) |
| 5. At most 7 of 143 items reviewed differently in run 2 | Held (0 and 1) |
| 6. Every request completes, at most US$0.30 | Held (572 of 572; US$0.050) |

## v4: markers of ethnicity and gender in anonymised resumes

Plan, predictions and hashes were fixed before the run in [`v4/PREREGISTRATION.md`](v4/PREREGISTRATION.md). The 24 v3 resumes were anonymised (an applicant number instead of the name, no gender field) and given seven versions each: neutral, and six that add one section with a co-curricular activity, languages and hobbies. The English markers are copied from Tan et al. (EMNLP 2026, arXiv 2603.05189, CC-BY-4.0): Chinese, Malay and Indian, female and male. The Chinese markers follow the same design: Han, Uyghur and Tibetan, female and male, with the languages carrying the ethnic group. No marker bears on any requirement. Plain and split arms, two runs, 672 requests through the Message Batches API, none failed, US$0.26 at the batch price.

| Two runs, 288 marker-neutral pairs per arm | plain | split |
|---|---|---|
| Verdict changes against the neutral version | 1 of 1,728 (0.1%) | 5 of 1,728 (0.3%) |
| ... the same version in run 1 against run 2 | 1 of 1,008 (0.1%) | 2 of 1,008 (0.2%) |
| Decision changes against the neutral version | 0 | 5 |
| Mean absolute score difference against neutral / run 1 against run 2 | 4.7 / 4.0 points | 5.5 / 4.5 points |
| Spread of group means, English / Chinese | 1.8 / 2.4 points | 2.3 / 3.9 points |

Full tables with 95% bootstrap intervals: [`v4/results/run-2026-11-14.summary.md`](v4/results/run-2026-11-14.summary.md).

1. **Who advances did not move with the markers in the plain arm** (0 of 288), and verdicts changed no more often than between two runs of the same version.
2. **The five decision changes in the split arm come from one wavering answer.** All five are on V3-C2-02 in run 2, whose neutral version judged R3 met and advanced, while its run-1 neutral version and five of its six run-2 marker versions judged R3 not met. R3 there is the label open to argument in v3. Read against run 1's neutral answer, those five marker versions agree with it.
3. **On the Chinese resumes, adding any activities section lowered the score**, for every group including Han: by 0.5 to 2.9 points in the plain arm and 1.7 to 5.6 in the split arm. Han lost points too, so most of the penalty goes with the section; its size still differed by group (point 4), which 24 resume-run pairs per group cannot settle.
4. **Between groups the gaps were small and did not line up with ethnicity or gender.** Pooled female and male means were within 0.7 points of each other in every language and arm. The largest ethnic gap was Chinese plain: Tibetan markers -2.8 points, Han -0.7, with intervals that overlap. In the English resumes every group stayed within 2.4 points of neutral.
5. **Requiring quotes widened the spread on the Chinese resumes** (3.9 against 2.4 points), the direction Tan et al. warn of for explanation prompts, though here the spread runs across all groups rather than against particular ones.

| v4 expectation, written before the run | Held? |
|---|---|
| 1. At most 2 decision changes per arm | Plain held (0); split **did not hold** (5, all one resume, point 2) |
| 2. Verdict changes no more than twice the run-to-run rate plus 0.5 points | Held |
| 3. No group mean more than 3 points from neutral | Plain held; split **did not hold** on the Chinese resumes (point 3) |
| 4. Pooled genders, and pooled ethnic groups, within 2 points | Genders held; ethnic groups held except Chinese plain (**did not hold**, 2.1 points) |
| 5. Split's spread no more than 1 point above plain's | English held; Chinese **did not hold** (point 5) |
| 6. Every request completes, at most US$0.40 | Held (US$0.26) |

## v5: the same traps at a lower effort

Plan and predictions were fixed before the run in [`v5/PREREGISTRATION.md`](v5/PREREGISTRATION.md). v3's resumes and arms, with one change: effort `low` instead of `medium`, to see whether the model would start to err on the traps, so that the check and the review could be measured on its own mistakes. 144 conversations through the Message Batches API, none failed, US$0.073.

| Two runs, 288 verdicts per arm | plain | split | split-self |
|---|---|---|---|
| Verdicts right, effort `low` | 288 | 287 | 286 |
| Verdicts right, effort `medium` (v3) | 286 | 286 | 286 |
| Wrong "met" on the trap verdicts, `low` | 0 | 0 | 0 |

At `low` the model again fell for none of the 40 traps. Its only misses are the label open to argument in v3 (V3-C2-02 R3), which the plain arm now judged met in both runs, as the key does. With no wrong "met" verdict to stop, the planned review of the 413 "met" verdicts was not run (see the plan's "Changes after the run"). Measuring how often the check and the review stop a model's own mistakes still needs a setting where the model makes them.

## What this shows

- **Requiring a verbatim quote for each verdict is cheap insurance.** It costs 1.7 times as much per resume (still under a tenth of a US cent with this model) and removed the one systematic misreading in this set, where the free-text reason had added "expected" and "currently enrolled" to the resume.
- **A quote check must check only the resume's own facts.** Wired to a finding that restates the job's thresholds, it threw away 18% (v1) and 17% (v2) of correct "met" verdicts and caught nothing. Splitting the resume fact from the comparison cut the loss to 2.4%; letting the model run the check and repair its own facts cut it to 0, at about twice the cost and latency.
- **The quote check guards against made-up evidence, not against misjudgement.** Seeded into stored answers, invented figures, near-quotes and lines from other resumes were all caught, and a figure changed by one was caught 88% of the time; wrong readings of real text were never caught (0 of 40). On these fictional resumes the model made no such misreading either: v3 added 40 traps (work someone else did, totals just under a threshold, a tool named only in the skills list), and it saw through all of them.
- **A second review covers what the quote check misses.** Reviewing each "met" verdict with a separate call rejected 159 of the 160 written-in misreadings over both arms and runs, and none of the 103 right answers in 412 reviews, for US$0.050 in all. The two checks answer different questions: the quote check, whether the evidence is real; the review, whether it supports the verdict. Whether the review would catch the model's own mistakes is not shown here, since the model made none to catch.
- **On these fictional resumes, this model's decisions did not move with names, gender or indirect markers of ethnicity.** Names and gender changed no decision in v1; in anonymised resumes, markers changed none in the plain arm, and the split arm's five changes trace to one wavering answer. Scores moved by a few points, and on the Chinese resumes an activities section lowered every group's score. This is one model and one bundle of markers per group; real resumes carry many more signals.

## Limits

- Fictional jobs and resumes, written by the same author as the answer key, with answers fixed in advance. They are short and unambiguous by design, which is why both model arms are near 100%; real resumes leave more room for judgement.
- One model, at effort medium (low in v5), two runs of each test, from 13 to 15 November 2026. 12 base resumes per language: score effects of a few points cannot be told from noise, and 39 score contrasts were tested without correction.
- Name lists are small (eight English, four Chinese names) and stand for groups only loosely. Two universities per language. The prompts did not mention fairness.
- v2 and v3 have the same author as v1. v3 added traps and messier formatting, but the model still gave no wrong "met" verdict, so none of the three versions measures how often the check stops one. v3's key has one label open to argument (V3-C2-02 R3, point 2 of the v3 section).
- From v3 on (v3, the second-judgement test, v4 and v5), requests went through the Message Batches API; v1 and v2 used single calls. Model and prompts were the same throughout, and the effort too except in v5.
- The seeded test shows which kinds of error the check can see, not how often a model makes each kind. Its changes are rule-based, one per answer, and its 40 misreadings were written by the same author as the resumes.
- The second-judgement test uses the same model as the screener and misreadings written in by the same author as the resumes; a reviewer from another model, and misreadings a model really produced, were not tested.
- v4 uses one bundle of markers per group, so a group's effect is mixed with the content of its bundle (a robotics club against a dance troupe); the Chinese bundles were written for this test. Each group mean rests on 24 resume-run pairs, against run-to-run score differences of about 4 points.
- The 本科（2026.06 毕业） trap depends on the internship start date in the posting; a reader who missed that date could argue the other way.

## Reuse and credits

- Scoring prompt of the score-only arm: PopResume (EMNLP 2026, arXiv 2603.22714, github.com/sumin-yu/PopResume, MIT).
- `keyword_in_text`: Resume-Matcher (github.com/srbhr/Resume-Matcher, Apache-2.0), copied unchanged with its licence in `third_party/`.
- Paired name-swap design: Wilson & Caliskan, AIES 2024 (whose repository notes that its gender-only results were later found to be inverted), and FAIRE (arXiv 2504.01420). No code or name lists were copied from either.
- Quote checking: evidence-check 0.2.0 (`frozen/check_evidence.py`).
- Rule-based error seeding: the approach of FactCC (Kryściński et al., EMNLP 2020, github.com/salesforce/factCC, BSD-3-Clause); no code copied.
- Review without seeing the earlier answer: factored Chain-of-Verification (Dhuliawala et al., arXiv 2309.11495); no code copied.
- English markers of ethnicity and gender in v4: Tan et al., "Small Changes, Big Impact" (EMNLP 2026, arXiv 2603.05189), `demography.json` in github.com/Social-AI-Studio/LLMHiringFairnessSG, CC-BY-4.0; six bundles copied (activity, languages, hobbies).
