import type { Copy } from '../copy'

/** A quoted resume line. Behind a met verdict it is the evidence (the accent rule); behind a not-met verdict it is only the closest line, labelled so. */
export default function QuoteLine({ text, met, t }: { text: string; met: boolean; t: Copy }) {
  if (met) return <blockquote className="well quote-line"><span className="q">{text}</span></blockquote>
  return (
    <blockquote className="well quote-line quote-line--closest">
      <span className="quote-label">{t.demo.closest}</span>
      {text}
    </blockquote>
  )
}
