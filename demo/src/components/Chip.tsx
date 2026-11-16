import { CheckCircle, XCircle } from '@phosphor-icons/react'
import type { Copy } from '../copy'
import type { Verdict } from '../data'

/** The verdict as a status chip: met in the water tint with a check, not met in a hairline with a cross. */
export default function Chip({ v, t }: { v: Verdict | null | undefined; t: Copy }) {
  const met = v === 'met'
  return (
    <span className="chip" data-v={met ? 'met' : 'not'}>
      {met ? <CheckCircle size={16} weight="fill" aria-hidden /> : <XCircle size={16} weight="regular" aria-hidden />}
      {met ? t.demo.met : t.demo.notMet}
    </span>
  )
}
