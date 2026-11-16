import type { Copy } from '../copy'

/** Three lines of a list, the last in the signal green, and the name. */
export default function Logo({ t, href }: { t: Copy; href: string }) {
  return (
    <a className="logo" href={href}>
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect x="5" y="7" width="22" height="3.5" rx="1.75" fill="currentColor" /><rect x="5" y="14.25" width="14" height="3.5" rx="1.75" fill="currentColor" /><rect x="5" y="21.5" width="18" height="3.5" rx="1.75" fill="var(--color-accent)" /></svg>
      <span className="logo-name">{t.brand}</span>
    </a>
  )
}
