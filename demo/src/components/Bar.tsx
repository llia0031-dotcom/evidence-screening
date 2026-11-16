import type { Copy } from '../copy'
import { useCurrentSection } from '../hooks'
import Logo from './Logo'

const SECTIONS = ['demo', 'results', 'faq'] as const

export default function Bar({ t, onSwitch }: { t: Copy; onSwitch: () => void }) {
  const current = useCurrentSection([...SECTIONS])
  return (
    <header className="bar">
      <div className="container bar-inner">
        <Logo t={t} href="#top" />
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
