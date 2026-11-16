import { useEffect, useState } from 'react'
import { reducedMotion } from '../hooks'

const NUM = /(\d[\d,]*(?:\.\d+)?)/

/** A key figure counting up to its value once, when `run` turns true (the kit's data-k-count). Every number in the
 *  text counts from 0, keeping its thousands separators and decimals; the rest of the text stays put. */
export default function Count({ text, run }: { text: string; run: boolean }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    setShown(text)
    if (!run || reducedMotion()) return
    const parts = text.split(NUM)
    const t0 = performance.now()
    const dur = 900
    let raf = 0
    const at = (p: string, e: number) => {
      const decimals = (p.split('.')[1] ?? '').length
      const v = Number(p.replace(/,/g, '')) * e
      return p.includes(',') ? Math.round(v).toLocaleString('en-US') : v.toFixed(decimals)
    }
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(k < 1 ? parts.map((p, i) => (i % 2 ? at(p, e) : p)).join('') : text)
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [run, text])
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden>{shown}</span>
    </>
  )
}
