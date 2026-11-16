// Fonts, the same as the portfolio site's: headings, big figures and sentences to read in Merriweather
// (Latin letters and digits) with Noto Serif SC (思源宋体) for Chinese; small type and controls in Geist (variable)
// with Noto Sans SC (思源黑体). All from Fontsource (OFL-1.1), bundled with the page; only these weights are loaded,
// each with font-display: swap. The Chinese faces come split by character ranges, so a page downloads only the
// pieces it uses.
import '@fontsource/merriweather/400.css'
import '@fontsource/merriweather/700.css'
import '@fontsource-variable/geist/index.css'
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/900.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'

// Chinese curly quotes in running text. Merriweather and Geist come first in the stacks (for Latin letters and
// digits) and also have “ ” ‘ ’, so in a Chinese sentence those would be drawn as narrow Latin quotes. These aliases
// cover only the four quote characters and point at the Noto files that hold them; the Chinese page puts them first
// in its text stacks (styles/tokens.css). Headings keep the narrow Latin quotes: these faces have no halt feature, so a
// full-width quote beside a full-width comma would leave a gap in a heading.
import serif400Quotes from '@fontsource/noto-serif-sc/files/noto-serif-sc-latin-400-normal.woff2?url'
import sans400Quotes from '@fontsource/noto-sans-sc/files/noto-sans-sc-latin-400-normal.woff2?url'
import sans500Quotes from '@fontsource/noto-sans-sc/files/noto-sans-sc-latin-500-normal.woff2?url'

const QUOTES = 'U+2018-2019, U+201C-201D'
for (const [family, url, weight] of [['Quotes Serif SC', serif400Quotes, '400'], ['Quotes Sans SC', sans400Quotes, '400'], ['Quotes Sans SC', sans500Quotes, '500']]) {
  document.fonts.add(new FontFace(family, `url(${url}) format('woff2')`, { unicodeRange: QUOTES, weight, display: 'swap' }))
}
