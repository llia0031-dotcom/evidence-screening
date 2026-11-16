import { useEffect, useRef } from 'react'

type Span = [number, number]

/** One line of the resume with its markdown prefix removed, and the parts that fall inside the marked spans. */
function pieces(line: string, start: number, marks: Span[]) {
  let kind: 'name' | 'head' | 'item' | 'text' = 'text'
  let skip = 0
  if (line.startsWith('# ')) { kind = 'name'; skip = 2 }
  else if (line.startsWith('## ')) { kind = 'head'; skip = 3 }
  else if (line.startsWith('- ')) { kind = 'item'; skip = 2 }
  const from = start + skip
  const to = start + line.length
  const cuts = new Set<number>([from, to])
  for (const [a, b] of marks) {
    if (b <= from || a >= to) continue
    cuts.add(Math.max(a, from))
    cuts.add(Math.min(b, to))
  }
  const points = [...cuts].sort((x, y) => x - y)
  const parts: { text: string; marked: boolean }[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (b <= a) continue
    const marked = marks.some(([x, y]) => a >= x && b <= y)
    parts.push({ text: line.slice(a - start, b - start), marked })
  }
  return { kind, parts }
}

/** The resume as a sheet of paper; the marked spans are underlined in pool blue and the first one is scrolled into view. */
export default function Resume({ text, marks, label, focusKey }: { text: string; marks: Span[]; label: string; focusKey: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current?.querySelector('mark')
    if (!el || !host.current) return
    const box = host.current
    const top = (el as HTMLElement).offsetTop - box.clientHeight / 3
    box.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [focusKey])
  const lines = text.replace(/\n+$/, '').split('\n')
  let offset = 0
  return (
    <div className="paper" ref={host} tabIndex={0} role="region" aria-label={label}>
      {lines.map((line, i) => {
        const start = offset
        offset += line.length + 1
        if (!line.trim()) return <div key={i} className="paper-gap" />
        const { kind, parts } = pieces(line, start, marks)
        const body = parts.map((p, j) => (p.marked ? <mark key={j}>{p.text}</mark> : <span key={j}>{p.text}</span>))
        if (kind === 'name') return <p key={i} className="paper-name">{body}</p>
        if (kind === 'head') return <p key={i} className="paper-head">{body}</p>
        if (kind === 'item') return <p key={i} className="paper-item">{body}</p>
        return <p key={i} className="paper-line">{body}</p>
      })}
    </div>
  )
}
