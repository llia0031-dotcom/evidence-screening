# Third-party notices

| What | Where it is used | Source | Licence | Licence text |
|---|---|---|---|---|
| evidence-check 0.2.0, `check_evidence.py` (frozen copy) | `eval/frozen/check_evidence.py`: the quote check in every round | github.com/llia0031-dotcom/evidence-check | MIT | `eval/frozen/LICENSE` |
| Resume-Matcher, `keyword_in_text` | `eval/third_party/resume_matcher/text_match.py`: the keyword baseline in round one | github.com/srbhr/Resume-Matcher | Apache-2.0 | `eval/third_party/resume_matcher/LICENSE` |
| PopResume, scoring prompt (`build_scoring_prompt`) | `eval/run.mjs`: the score-only arm in round one, copied word for word | github.com/sumin-yu/PopResume (arXiv 2603.22714) | MIT | `eval/third_party/popresume/LICENSE` |
| Markers of ethnicity and gender (six bundles from `demography.json`: co-curricular activity, languages, hobbies) | `data/v4/markers.json`: the English markers in round four | Tan et al., "Small Changes, Big Impact: Demographic Bias in LLM-Based Hiring Through Subtle Sociocultural Markers in Anonymised Resumes", EMNLP 2026, arXiv 2603.05189; github.com/Social-AI-Studio/LLMHiringFairnessSG | CC-BY-4.0 (creativecommons.org/licenses/by/4.0/) | Changes: one bundle per group; the past school and volunteering fields left out |
| Merriweather, Geist, Noto Serif SC, Noto Sans SC (font files) | `demo/`: bundled into the built page | Fontsource (fontsource.org), npm packages `@fontsource/merriweather`, `@fontsource-variable/geist`, `@fontsource/noto-serif-sc`, `@fontsource/noto-sans-sc` | SIL Open Font License 1.1 | in each npm package (`LICENSE`) |

Methods borrowed without copying code: the paired name-swap design of Wilson & Caliskan (AIES 2024) and FAIRE (arXiv 2504.01420); rule-based error seeding after FactCC (Kryściński et al., EMNLP 2020); review without seeing the earlier answer after factored Chain-of-Verification (Dhuliawala et al., arXiv 2309.11495).
