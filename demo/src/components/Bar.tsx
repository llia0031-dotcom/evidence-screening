import type { Copy } from '../copy'
import { useCurrentSection } from '../hooks'

const SECTIONS = ['demo', 'results', 'faq'] as const

export default function Bar({ t, onSwitch }: { t: Copy; onSwitch: () => void }) {
  const current = useCurrentSection([...SECTIONS])
  return (
    <header className="bar">
      <div className="container bar-inner">
        <a className="logo" href="#top">
          <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect x="5" y="7" width="22" height="3.5" rx="1.75" fill="currentColor" /><rect x="5" y="14.25" width="14" height="3.5" rx="1.75" fill="currentColor" /><rect x="5" y="21.5" width="18" height="3.5" rx="1.75" fill="var(--color-accent)" /></svg>
          <span className="logo-name">{t.brand}</span>
        </a>
        <nav className="links" aria-label={t.brand}>
          {SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} aria-current={current === id ? 'location' : undefined}>{t.nav[id]}</a>
          ))}
        </nav>
        <button type="button" className="btn btn--clear btn--s" onClick={onSwitch} aria-label={t.switchLabel} lang={t.switchTo === 'EN' ? 'en' : 'zh-CN'}>
          {t.switchTo}
        </button>
      </div>
    </header>
  )
}
