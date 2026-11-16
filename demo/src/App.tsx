import { useEffect, useState } from 'react'
import { COPY, type Lang } from './copy'
import { loadDataset, type Dataset } from './data'
import Bar from './components/Bar'
import Hero from './components/Hero'
import Tagline from './components/Tagline'
import Steps from './components/Steps'
import Demo from './components/Demo'
import Results from './components/Results'
import Faq from './components/Faq'
import Footer from './components/Footer'
import { initialLang, saveLang } from './lang'

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const [data, setData] = useState<Dataset | null>(null)
  const [failed, setFailed] = useState(false)
  const t = COPY[lang]

  useEffect(() => {
    document.documentElement.lang = t.htmlLang
    document.title = t.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description)
    saveLang(lang)
    let live = true
    setData(null)
    setFailed(false)
    loadDataset(lang).then((d) => { if (live) setData(d) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [lang, t])

  return (
    <div className="pg" id="top">
      <a className="skip" href="#main">{t.skip}</a>
      <Bar t={t} onSwitch={() => setLang(lang === 'zh' ? 'en' : 'zh')} />
      <main id="main">
        <Hero t={t} lang={lang} data={data} />
        <Tagline lines={t.tagline} lang={lang} />
        <Steps t={t} lang={lang} />
        <Demo t={t} lang={lang} data={data} failed={failed} />
        <Results t={t} lang={lang} />
        <Faq t={t} lang={lang} />
      </main>
      <Footer t={t} />
    </div>
  )
}
