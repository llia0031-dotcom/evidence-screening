import { useEffect, useState } from 'react'
import type { Lang } from '../copy'

const seg = new Intl.Segmenter('zh', { granularity: 'word' })

/** True from the second frame after mount: the class that starts the kit's title effect (kit.css, data-k-title). */
export function useArrived() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let r2 = 0
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setOn(true)) })
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
  }, [])
  return on
}

/** A head's text in pieces for the kit's title effect: a Chinese character or a Latin word to a piece, Chinese still
 *  breaking only between words. A screen reader gets the head whole. */
export default function TitlePieces({ lines, lang }: { lines: string[]; lang: Lang }) {
  let c = 0
  const piece = (text: string, key: number) => <span key={key} className="k-ch" style={{ ['--c' as string]: c++ }}>{text}</span>
  return (
    <>
      <span className="visually-hidden">{lines.join(lang === 'zh' ? '' : ' ')}</span>
      <span aria-hidden>
        {lines.map((line, l) => (
          <span key={l} className="h-line">
            {lang === 'zh'
              ? [...seg.segment(line)].map((s, w) => <span key={w} className="ph">{[...s.segment].map((ch, i) => piece(ch, i))}</span>)
              : line.split(/(\s+)/).map((w, i) => (/^\s+$/.test(w) ? ' ' : w ? piece(w, i) : null))}
          </span>
        ))}
      </span>
    </>
  )
}
