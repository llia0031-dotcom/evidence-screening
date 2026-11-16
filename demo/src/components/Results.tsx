import { Fragment } from 'react'
import type { Copy, Lang } from '../copy'
import { RESULTS, fmtInt } from '../data'
import { useReveal } from '../hooks'
import Count from './Count'
import Phrase from './Phrase'

export default function Results({ t, lang }: { t: Copy; lang: Lang }) {
  const { ref, shown } = useReveal<HTMLElement>()
  const ev = RESULTS.arms.evidence
  const pl = RESULTS.arms.plain
  const nf = RESULTS.nameFlips.evidence
  // Round two compares the two ways of wiring the check on the same new resumes.
  const v2 = RESULTS.v2
  const pct = (a: { lost: number; met: number }) => Math.round((100 * a.lost) / a.met)
  const costRatio = (v2.split_self.cost / v2.evidence.cost).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 1 })
  // Round three: a second review of each "meets", against planted misreadings (the first run; the second matched it).
  const review = RESULTS.review.runs[0]
  const f = t.results.figures
  const items = [
    { fig: `${fmtInt(ev.correct, lang)} / ${fmtInt(ev.cells, lang)}`, label: f.accuracy.label, note: f.accuracy.note(`${fmtInt(pl.correct, lang)} / ${fmtInt(pl.cells, lang)}`) },
    { fig: `${nf.decisionFlips} / ${fmtInt(nf.decisions, lang)}`, label: f.names.label, note: f.names.note },
    { fig: `${pct(v2.evidence)}% → ${pct(v2.split_self)}%`, label: f.lost.label, note: f.lost.note(costRatio) },
    { fig: `${review.caught} / ${review.misreadings}`, label: f.review.label, note: f.review.note(review.misreadings, review.right) },
  ]
  return (
    <section id="results" className="section section--band" aria-labelledby="results-h" ref={ref} data-shown={shown}>
      <div className="container">
        <div className="section-head">
          <h2 id="results-h">{t.results.head}</h2>
          <p className="lead lead--lines">
            {t.results.lead(RESULTS.bases, RESULTS.versions, v2.bases, v2.versions, RESULTS.v3.bases, RESULTS.v3.traps).map((line) => (
              <span key={line} className="tl">
                {/* A narrow screen breaks a line at its colon, never inside a clause. */}
                {line.split(/(?<=[：:])\s?/).map((clause, i) => (
                  <Fragment key={i}>{i > 0 && lang === 'en' ? ' ' : null}<span className="clause"><Phrase text={clause} lang={lang} /></span></Fragment>
                ))}
              </span>
            ))}
          </p>
        </div>
        <ul className="figures">
          {items.map((it) => (
            <li key={it.label} className="figure">
              <p className="fig num"><Count text={it.fig} run={shown} /></p>
              <h3><Phrase text={it.label} lang={lang} /></h3>
              <p className="fig-note"><Phrase text={it.note} lang={lang} /></p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
