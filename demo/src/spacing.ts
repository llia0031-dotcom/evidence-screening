import { Pangu } from 'pangu/shared'

// Spaces between Chinese and Latin letters or digits (中文文案排版指北), added with pangu.js to prose
// that comes from stored model output. Interface copy is written with the spaces already in it
// (scripts/check-spacing.mjs confirms it), and resume text and quotes are never touched: a quote must
// stay exactly as it appears in the resume.
const pangu = new Pangu()

// pangu also puts spaces around the curly quotes “ ”. In Chinese those are fullwidth punctuation, and the
// guidelines leave no space between fullwidth punctuation and a character, so those spaces are taken out again.
const QUOTE_GAP = /(?<=[一-鿿　-〿＀-￯]) (?=[“”])|(?<=[“”]) (?=[一-鿿　-〿＀-￯])/g

export const spaced = (text: string) => pangu.spaceText(text).replace(QUOTE_GAP, '')
