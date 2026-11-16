import type { Lang } from '../copy'

const seg = new Intl.Segmenter('zh', { granularity: 'word' })

/** Chinese display text broken only between words, never inside one ("核对" stays whole). English is left to the browser. */
export default function Phrase({ text, lang }: { text: string; lang: Lang }) {
  if (lang !== 'zh') return <>{text}</>
  return <>{[...seg.segment(text)].map((s, i) => <span key={i} className="ph">{s.segment}</span>)}</>
}
