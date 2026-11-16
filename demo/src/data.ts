// The stored evaluation output, exported by eval/export_demo.py. Nothing here calls a model.
import type { Lang } from './copy'
import results from './data/results.json'

export type Verdict = 'met' | 'not_met'
export interface Quote { text: string; span: [number, number] | null }
export interface ReqOut { id: string; verdict: Verdict; finding: string; quotes: Quote[]; check: string; missing: string[]; key: Verdict }
export interface Version {
  id: string; variant: string; kind: 'name' | 'school' | 'gap' | 'marital' | 'injection'; compareTo: string
  name: string; gender: 'M' | 'F'; group: string; text: string; decision: 'advance' | 'reject'; score: number
  requirements: ReqOut[]
}
export interface Resume { id: string; job: string; keyDecision: 'advance' | 'reject'; versions: Version[] }
export interface Job { id: string; title: string; company: string; location: string; summary: string; requirements: { id: string; text: string }[] }
export interface Dataset { jobs: Job[]; resumes: Resume[] }

export const RESULTS = results

const cache: Partial<Record<Lang, Promise<Dataset>>> = {}
export function loadDataset(lang: Lang): Promise<Dataset> {
  cache[lang] ??= (lang === 'zh' ? import('./data/zh.json') : import('./data/en.json')).then((m) => m.default as unknown as Dataset)
  return cache[lang]!
}

/** The reference version of a resume: the one every other version is compared with. */
export function reference(r: Resume): Version {
  const first = r.versions[0]
  return r.versions.find((v) => v.id === first.compareTo) ?? first
}

/** A short label for a resume: its degree, read from the education line. */
export function degreeOf(v: Version, lang: Lang): string {
  const lines = v.text.split('\n')
  if (lang === 'zh') {
    const i = lines.findIndex((l) => l.startsWith('## 教育经历'))
    const parts = (lines[i + 1] ?? '').split('　').filter(Boolean)
    return parts[1] ?? ''
  }
  const i = lines.findIndex((l) => l.startsWith('## Education'))
  const deg = (lines[i + 1] ?? '').split(',')[0]
  return deg.replace(/^(Bachelor|Master) of /, '').replace(/ \(.*\)$/, '')
}

/** The school, read from the education line. */
export function schoolOf(v: Version, lang: Lang): string {
  const lines = v.text.split(/\n/)
  if (lang === 'zh') {
    const i = lines.findIndex((l) => l.startsWith('## 教育经历'))
    return (lines[i + 1] ?? '').split('　').filter(Boolean)[0] ?? ''
  }
  const i = lines.findIndex((l) => l.startsWith('## Education'))
  return (lines[i + 1] ?? '').split(',').slice(1).join(',').trim()
}

/** The version a resume is listed under: its name versions taken in turn, so neighbouring rows carry different names. */
export function listed(r: Resume, i: number): Version {
  const names = r.versions.filter((v) => v.kind === 'name')
  return names.length ? names[i % names.length] : reference(r)
}

export function fmtInt(n: number, lang: Lang) {
  return n.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
}
