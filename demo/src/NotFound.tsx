import { useEffect, useState } from 'react'
import { COPY, type Lang } from './copy'
import { HOME, initialLang, saveLang } from './lang'
import SimpleBar from './components/SimpleBar'

// The page GitHub Pages serves for an address that does not exist: one line and the way back.
export default function NotFound() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const t = COPY[lang]
  useEffect(() => {
    document.documentElement.lang = t.htmlLang
    document.title = t.notFound.docTitle
    saveLang(lang)
  }, [lang, t])
  return (
    <div className="pg">
      <a className="skip" href="#main">{t.skip}</a>
      <SimpleBar t={t} onSwitch={() => setLang(lang === 'zh' ? 'en' : 'zh')} />
      <main id="main" className="nf">
        <div className="container nf-inner">
          <p className="nf-code" aria-hidden>404</p>
          <h1>{t.notFound.title}</h1>
          <a className="k-btn" href={HOME}>{t.notFound.back}</a>
        </div>
      </main>
    </div>
  )
}
