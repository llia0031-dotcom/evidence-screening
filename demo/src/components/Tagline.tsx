import type { Lang } from '../copy'
import { useReveal } from '../hooks'
import Phrase from './Phrase'

/** The tagline: two lines in the reading serif, rising in once with the section. */
export default function Tagline({ lines, lang }: { lines: string[]; lang: Lang }) {
  const { ref, shown } = useReveal<HTMLElement>()
  return (
    <section className="tagline" ref={ref} data-shown={shown}>
      <div className="container">
        <p className="tagline-text">
          {lines.map((line) => <span key={line} className="tl"><Phrase text={line} lang={lang} /></span>)}
        </p>
      </div>
    </section>
  )
}
