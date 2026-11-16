import type { Copy, Lang } from '../copy'
import { reference, type Dataset } from '../data'
import Chip from './Chip'
import QuoteLine from './QuoteLine'
import Phrase from './Phrase'
import TitlePieces, { useArrived } from './Title'

// The hero's sample: a real stored output, the reference version of one resume per language, three requirements.
const SAMPLE = { zh: 'C1-02', en: 'E1-02' } as const
const ROWS = ['R2', 'R3', 'R5', 'R6']

function Sample({ t, lang, data }: { t: Copy; lang: Lang; data: Dataset }) {
  const resume = data.resumes.find((r) => r.id === SAMPLE[lang])
  if (!resume) return null
  const v = reference(resume)
  const job = data.jobs.find((j) => j.id === resume.job)!
  return (
    <figure className="hero-figure">
      <div className="clear sample">
        <div className="sample-head">
          <span className="sample-job">{job.title}</span>
          <span className="sample-who">{v.name}</span>
        </div>
        <ul className="sample-rows">
          {ROWS.map((rid, i) => {
            const req = job.requirements.find((r) => r.id === rid)!
            const out = v.requirements.find((r) => r.id === rid)!
            const q = out.quotes[0]?.text
            return (
              <li key={rid} className="sample-row" style={{ ['--i' as string]: i }}>
                <div className="sample-req"><span>{req.text}</span><Chip v={out.verdict} t={t} /></div>
                {q ? <QuoteLine text={q} met={out.verdict === 'met'} t={t} /> : <p className="sample-none">{t.demo.noQuote}</p>}
              </li>
            )
          })}
        </ul>
        <p className="sample-decision" style={{ ['--i' as string]: ROWS.length }}>{v.decision === 'advance' ? t.demo.advance : t.demo.reject}</p>
      </div>
    </figure>
  )
}

export default function Hero({ t, lang, data }: { t: Copy; lang: Lang; data: Dataset | null }) {
  const arrived = useArrived()
  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="container hero-grid">
        <div className="hero-text">
          <h1 id="hero-h" data-k-title="" className={arrived ? 'k-in' : undefined}><TitlePieces lines={t.hero.head} lang={lang} /></h1>
          <p className="lead"><Phrase text={t.hero.lead} lang={lang} /></p>
          <a className="k-btn" href="#demo">{t.hero.cta}</a>
          <p className="proof"><Phrase text={t.hero.proof} lang={lang} /></p>
        </div>
        {data ? <Sample t={t} lang={lang} data={data} /> : <div className="hero-figure"><div className="clear sample skeleton" aria-hidden /></div>}
      </div>
    </section>
  )
}
