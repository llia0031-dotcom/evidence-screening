import type { Copy } from '../copy'
import { HOME } from '../lang'
import Logo from './Logo'

/** The bar of the about and not-found pages: the name back to the demo, and the language switch. */
export default function SimpleBar({ t, onSwitch }: { t: Copy; onSwitch: () => void }) {
  return (
    <header className="bar">
      <div className="container bar-inner bar-inner--simple">
        <Logo t={t} href={HOME} />
        <button type="button" className="btn btn--clear btn--s" onClick={onSwitch} aria-label={t.switchLabel} lang={t.switchTo === 'EN' ? 'en' : 'zh-CN'}>
          {t.switchTo}
        </button>
      </div>
    </header>
  )
}
