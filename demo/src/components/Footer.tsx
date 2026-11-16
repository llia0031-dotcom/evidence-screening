import type { Copy } from '../copy'

export default function Footer({ t }: { t: Copy }) {
  return (
    <footer className="foot">
      <div className="container foot-inner">
        <span className="logo-name">{t.brand}</span>
        <p className="foot-note">{t.footer.note}</p>
        <nav className="foot-links" aria-label={t.footer.top}>
          <a href="#demo">{t.nav.demo}</a>
          <a href="#results">{t.nav.results}</a>
          <a href="#faq">{t.nav.faq}</a>
          <a href="https://github.com/Jason-d-e/evidence-screening">{t.footer.repo}</a>
          <a href="https://github.com/Jason-d-e/evidence-check">{t.footer.checker}</a>
          <a href="about.html">{t.footer.about}</a>
          <a href="#top">{t.footer.top}</a>
        </nav>
      </div>
    </footer>
  )
}
