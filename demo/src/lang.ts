import type { Lang } from './copy'

// One language per page view, remembered across the demo, the about page and the not-found page.
const KEY = 'screening-demo-lang'

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

export function saveLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang) } catch { /* ignore */ }
}

/** The page's home: './' on a local preview, the site's own path once published (so a not-found page at any depth links home). */
export const HOME = import.meta.env.BASE_URL
