import type { Copy, Lang } from '../copy'
import { RESULTS, fmtInt } from '../data'
import { useReveal } from '../hooks'

export default function Faq({ t, lang }: { t: Copy; lang: Lang }) {
  const { ref, shown } = useReveal<HTMLElement>()
  // Answers that carry figures take them from the stored results (the seeded test of the check).
  const s = RESULTS.seeded
  const made = lang === 'zh' ? `${fmtInt(s.madeUp.n, lang)} 处全部被拦下` : `all ${fmtInt(s.madeUp.n, lang)} were stopped`
  const fig = `${Math.round((100 * s.figure.caught) / s.figure.n)}%`
  return (
    <section id="faq" className="section section--faq" aria-labelledby="faq-h" ref={ref} data-shown={shown}>
      <div className="container faq-grid">
        <h2 id="faq-h">{t.faq.head}</h2>
        <div className="faq">
          {t.faq.items.map((f) => (
            <details key={f.q} className="faq-item">
              <summary><span>{f.q}</span></summary>
              <p>{typeof f.a === 'function' ? f.a(made, fig) : f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
