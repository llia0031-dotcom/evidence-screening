// Checks that every Chinese interface string already follows 中文文案排版指北 spacing:
// running pangu.js over it must change nothing. Usage: node scripts/check-spacing.mjs
import fs from 'node:fs'
import pangu from 'pangu'

// Same exception as src/spacing.ts: no space between Chinese and the fullwidth curly quotes.
const QUOTE_GAP = /(?<=[一-鿿　-〿＀-￯]) (?=[“”])|(?<=[“”]) (?=[一-鿿　-〿＀-￯])/g
const src = fs.readFileSync(new URL('../src/copy.ts', import.meta.url), 'utf8')
// Quoted strings, and template strings with each ${\u2026} replaced by a sample number.
const strings = [...src.matchAll(/'([^'\n]*[\u4e00-\u9fff][^'\n]*)'|`([^`\n]*[\u4e00-\u9fff][^`\n]*)`/g)]
  .map((m) => m[1] ?? m[2].replace(/\$\{[^}]*\}/g, '12'))
let changed = 0
for (const s of strings) {
  const out = pangu.spaceText(s).replace(QUOTE_GAP, '')
  if (out !== s) { changed++; console.log(`- ${s}\n+ ${out}`) }
}
console.log(`${strings.length} Chinese strings checked, ${changed} would change`)
process.exitCode = changed ? 1 : 0
