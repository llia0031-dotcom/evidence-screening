import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CaretDown, CaretLeft, CaretRight, CheckCircle, XCircle } from '@phosphor-icons/react'
import type { Copy, Lang } from '../copy'
import { degreeOf, listed, reference, schoolOf, type Dataset, type Job, type Resume as ResumeT, type Version } from '../data'
import { useReveal } from '../hooks'
import { spaced } from '../spacing'
import Resume from './Resume'
import Phrase from './Phrase'

// The demo is laid out the way applicant tracking systems lay out a job (Ashby, Greenhouse, Lever):
// one job per page, its title carrying a menu to the other job, the screening outcome as a row of filters, the
// candidates as a list beside the one under review, and the review itself as a queue (n of N, previous, next).

type Tab = 'judge' | 'compare'
type Kind = Version['kind']
type Filter = 'all' | 'advance' | 'reject'

function Pick<T extends string>({ legend, name, options, value, onChange }: { legend: string; name: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="pick">
      <legend>{legend}</legend>
      <div className="pick-opts">
        {options.map((o) => (
          <label key={o.value} className="opt" data-on={o.value === value}>
            <input type="radio" className="visually-hidden" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

const Status = ({ met }: { met: boolean }) =>
  met ? <CheckCircle className="st st--met" size={16} weight="fill" aria-hidden /> : <XCircle className="st st--not" size={16} weight="fill" aria-hidden />

const Verdict = ({ met, t }: { met: boolean; t: Copy }) => <span className="cv"><Status met={met} />{met ? t.demo.met : t.demo.notMet}</span>

const initial = (name: string, lang: Lang) => (lang === 'zh' ? name.slice(0, 1) : name.split(' ').filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join(''))

/** Six short marks, one per requirement, in order: the row's verdicts at a glance. */
function Marks({ v, job, label }: { v: Version; job: Job; label: string }) {
  return (
    <span className="marks" role="img" aria-label={label}>
      {job.requirements.map((r) => <i key={r.id} data-met={v.requirements.find((q) => q.id === r.id)?.verdict === 'met'} />)}
    </span>
  )
}

/** The lines that differ between two versions of a resume: one line added or one or two lines changed. */
function lineDiff(before: string, after: string) {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length === b.length) return a.flatMap((l, i) => (l !== b[i] ? [{ kind: 'changed' as const, before: l, after: b[i] }] : []))
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return [{ kind: 'added' as const, before: '', after: b[i] }]
}
const plain = (l: string) => l.replace(/^#+ |^- /, '')

/** One verdict per requirement, each with the resume line behind it; the selected one is marked in the resume beside. */
function Judge({ t, job, version }: { t: Copy; job: Job; version: Version }) {
  const [sel, setSel] = useState('R1')
  useEffect(() => setSel('R1'), [version.id])
  const out = version.requirements.find((r) => r.id === sel)
  const marks = (out?.quotes ?? []).map((q) => q.span).filter((s): s is [number, number] => !!s)
  const short = t.demo.short[job.id] ?? {}
  return (
    <div className="judge">
      <ul className="crit" aria-label={t.demo.tabs.judge}>
        {job.requirements.map((req) => {
          const r = version.requirements.find((x) => x.id === req.id)
          const met = r?.verdict === 'met'
          const on = sel === req.id
          const q = r?.quotes[0]?.text
          return (
            <li key={req.id} className="crit-row" data-on={on}>
              <button type="button" className="crit-btn" aria-expanded={on} onClick={() => setSel(req.id)}>
                <Status met={met} />
                <span className="crit-main">
                  <span className="crit-name">{short[req.id] ?? req.text}<span className="crit-v">{met ? t.demo.met : t.demo.notMet}</span></span>
                  {on && <span className="crit-req">{req.text}</span>}
                  <span className="crit-q">{q ? (met ? q : `${t.demo.closest}${t.htmlLang === 'en' ? ': ' : '：'}${q}`) : t.demo.noQuote}</span>
                </span>
              </button>
              {on && r && (
                <div className="crit-more">
                  <p className="crit-finding">{spaced(r.finding)}</p>
                  {r.verdict !== r.key && <p className="tag tag--warn">{t.demo.differs}</p>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <div className="judge-paper">
        <Resume text={version.text} marks={marks} label={t.demo.paper} focusKey={`${version.id}|${sel}`} />
      </div>
    </div>
  )
}

function Compare({ t, lang, job, resume, base }: { t: Copy; lang: Lang; job: Job; resume: ResumeT; base: Version }) {
  const ref = reference(resume)
  const kinds: Kind[] = (['name', 'school', 'gap', 'marital', 'injection'] as Kind[]).filter((k) => resume.versions.some((v) => v.kind === k && v.id !== ref.id))
  const [kind, setKind] = useState<Kind>('name')
  // A name is compared with the version on screen; the other changes were made to the reference version.
  const names = resume.versions.filter((v) => v.kind === 'name' && v.id !== base.id)
  const [nameId, setNameId] = useState(names[0]?.id ?? '')
  useEffect(() => { setKind('name'); setNameId(names[0]?.id ?? '') }, [resume.id, base.id])
  const after = kind === 'name' ? resume.versions.find((v) => v.id === nameId) : resume.versions.find((v) => v.kind === kind)
  const before = kind === 'name' ? base : after ? resume.versions.find((v) => v.id === after.compareTo) : undefined
  if (!after || !before) return null
  const changed = job.requirements.filter((req) => before.requirements.find((r) => r.id === req.id)?.verdict !== after.requirements.find((r) => r.id === req.id)?.verdict)
  const diff = lineDiff(before.text, after.text)
  const decisionChanged = before.decision !== after.decision
  const summary = (changed.length ? t.demo.someChanged(changed.length, changed.map((r) => `${job.requirements.indexOf(r) + 1}`).join(lang === 'zh' ? '、' : ', ')) + (decisionChanged ? t.demo.decisionChanged : t.demo.decisionSame) : decisionChanged ? t.demo.decisionChanged : t.demo.sameAll)
  const short = t.demo.short[job.id] ?? {}

  return (
    <div className="compare">
      <div className="compare-picks">
        <Pick legend={t.demo.change} name="kind" value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k, label: t.demo.changes[k] }))} />
        {kind === 'name' && (
          <Pick legend={t.demo.nameOf} name="name" value={nameId} onChange={setNameId} options={names.map((v) => ({ value: v.id, label: v.name }))} />
        )}
      </div>
      <p className="compare-summary" aria-live="polite"><Phrase text={summary} lang={lang} /></p>
      <div className="diff" aria-label={t.demo.change}>
        {diff.map((d, i) => (
          <div key={i} className="diff-row">
            <span className="diff-kind">{d.kind === 'added' ? t.demo.diffAdded : t.demo.diffChanged}</span>
            {d.kind === 'changed' && <del className="diff-old">{plain(d.before)}</del>}
            <ins className="diff-new">{plain(d.after)}</ins>
          </div>
        ))}
      </div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={t.demo.tabs.compare}>
        <table className="ctable">
          <thead>
            <tr>
              <th scope="col">{t.demo.requirement}</th>
              <th scope="col">{t.demo.before}<span className="th-sub">{before.name}</span></th>
              <th scope="col">{t.demo.after}<span className="th-sub">{after.name}</span></th>
            </tr>
          </thead>
          <tbody>
            {job.requirements.map((req) => {
              const b = before.requirements.find((r) => r.id === req.id)
              const a = after.requirements.find((r) => r.id === req.id)
              const diffd = b?.verdict !== a?.verdict
              return (
                <tr key={req.id} data-changed={diffd}>
                  <th scope="row">{short[req.id] ?? req.text}</th>
                  <td><Verdict met={b?.verdict === 'met'} t={t} /></td>
                  <td><Verdict met={a?.verdict === 'met'} t={t} />{diffd && <span className="tag tag--changed">{t.demo.changed}</span>}</td>
                </tr>
              )
            })}
            <tr className="ctable-decision" data-changed={decisionChanged}>
              <th scope="row">{t.demo.decision}</th>
              <td>{before.decision === 'advance' ? t.demo.advance : t.demo.reject}</td>
              <td>{after.decision === 'advance' ? t.demo.advance : t.demo.reject}{decisionChanged && <span className="tag tag--changed">{t.demo.changed}</span>}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The job's title with a menu to the other job, as an ATS opens one job per page. */
function JobMenu({ t, jobs, job, count, onPick }: { t: Copy; jobs: Job[]; job: Job; count: (id: string) => number; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (!open) return
    items.current[0]?.focus()
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLButtonElement>('.job-title')?.focus() }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const i = items.current.findIndex((el) => el === document.activeElement)
      const n = items.current.length
      items.current[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus()
    }
  }
  return (
    <div className="job-menu" ref={box} onKeyDown={onKey}>
      <button type="button" className="job-title" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{job.title}</span>
        <CaretDown size={18} weight="bold" aria-hidden />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={t.demo.jobs}>
          {jobs.map((j, i) => (
            <button key={j.id} ref={(el) => { items.current[i] = el }} type="button" role="menuitemradio" aria-checked={j.id === job.id} className="menu-item" onClick={() => { setOpen(false); onPick(j.id) }}>
              <span className="menu-title">{j.title}</span>
              <span className="menu-sub">{j.company} · {t.demo.resumesN(count(j.id))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const jobFromUrl = () => new URLSearchParams(location.search).get('job') ?? ''

export default function Demo({ t, lang, data, failed }: { t: Copy; lang: Lang; data: Dataset | null; failed: boolean }) {
  const { ref, shown } = useReveal<HTMLElement>()
  const [tab, setTab] = useState<Tab>('judge')
  const [jobId, setJobId] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [resumeId, setResumeId] = useState('')
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  // Each job has its own address (?job=…), as each job has its own page in an ATS.
  useEffect(() => {
    if (!data) return
    const want = jobFromUrl()
    const j = data.jobs.find((x) => x.id === want) ?? data.jobs[0]
    setJobId(j.id)
  }, [data])
  useEffect(() => {
    const back = () => { if (data) setJobId((data.jobs.find((x) => x.id === jobFromUrl()) ?? data.jobs[0]).id) }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [data])
  const openJob = (id: string) => {
    const u = new URL(location.href)
    u.searchParams.set('job', id)
    u.hash = 'demo'
    history.pushState(null, '', u)
    setJobId(id)
  }

  const job = data?.jobs.find((j) => j.id === jobId)
  const all = useMemo(() => (data ? data.resumes.filter((r) => r.job === jobId).map((r, i) => ({ r, i, v: listed(r, i) })) : []), [data, jobId])
  const rows = all.filter((x) => filter === 'all' || x.v.decision === filter)
  useEffect(() => { setFilter('all'); setTab('judge'); setResumeId(all[0]?.r.id ?? '') }, [jobId, data])
  const at = Math.max(0, rows.findIndex((x) => x.r.id === resumeId))
  const cur = rows[at]
  const go = (d: number) => { const n = rows[at + d]; if (n) { setResumeId(n.r.id) } }
  const pickFilter = (f: Filter) => {
    setFilter(f)
    const first = all.find((x) => f === 'all' || x.v.decision === f)
    if (first && !(f === 'all' || cur?.v.decision === f)) setResumeId(first.r.id)
  }
  const count = (f: Filter) => all.filter((x) => f === 'all' || x.v.decision === f).length

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const next: Tab = tab === 'judge' ? 'compare' : 'judge'
    setTab(next)
    tabs.current[next === 'judge' ? 0 : 1]?.focus()
  }

  return (
    <section id="demo" className="section demo" aria-labelledby="demo-h" ref={ref} data-shown={shown}>
      <div className="container">
        <div className="demo-head">
          <h2 id="demo-h"><Phrase text={t.demo.head} lang={lang} /></h2>
        </div>

        {failed ? (
          <div className="clear empty" role="alert">
            <p>{t.demo.loadError}</p>
            <button type="button" className="btn btn--clear" onClick={() => location.reload()}>{t.demo.reload}</button>
          </div>
        ) : !data || !job || !cur ? (
          <div className="clear app skeleton-stage" aria-hidden><div className="skeleton sk-line" /><div className="skeleton sk-block" /><div className="skeleton sk-block" /></div>
        ) : (
          <div className="clear app">
            <header className="job-head">
              <JobMenu t={t} jobs={data.jobs} job={job} count={(id) => data.resumes.filter((r) => r.job === id).length} onPick={openJob} />
              <p className="job-meta">{job.company} · {job.location} · {t.demo.musts(job.requirements.length)}</p>
              <div className="stages" role="group" aria-label={t.demo.outcome}>
                {(['all', 'advance', 'reject'] as Filter[]).map((f) => (
                  <button key={f} type="button" className="stage-tab" aria-pressed={filter === f} onClick={() => pickFilter(f)}>
                    {t.demo.filter[f]}<span className="stage-n num">{count(f)}</span>
                  </button>
                ))}
              </div>
            </header>

            <div className="app-body">
              <ul className="cands" aria-label={t.demo.candidates}>
                {rows.map((x) => (
                  <li key={x.r.id}>
                    <button type="button" className="cand" aria-current={x.r.id === cur.r.id ? 'true' : undefined} onClick={() => setResumeId(x.r.id)}>
                      <span className="cand-n num" aria-hidden>{String(x.i + 1).padStart(2, '0')}</span>
                      <span className="av" aria-hidden>{initial(x.v.name, lang)}</span>
                      <span className="cand-who">
                        <span className="cand-name">{x.v.name}</span>
                        <span className="cand-sub">{lang === 'zh' ? `${schoolOf(x.v, lang)} · ${degreeOf(x.v, lang)}` : `${degreeOf(x.v, lang)} · ${schoolOf(x.v, lang)}`}</span>
                      </span>
                      <Marks v={x.v} job={job} label={t.demo.metCount(x.v.requirements.filter((q) => q.verdict === 'met').length, job.requirements.length)} />
                      <span className="dtag" data-d={x.v.decision}>{x.v.decision === 'advance' ? t.demo.advance : t.demo.reject}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="detail" id="demo-panel">
                <div className="detail-head">
                  <span className="av av--l" aria-hidden>{initial(cur.v.name, lang)}</span>
                  <div className="detail-who">
                    <h3 className="detail-name">{cur.v.name}</h3>
                    <p className="cand-sub">{schoolOf(cur.v, lang)} · {degreeOf(cur.v, lang)}</p>
                  </div>
                  <span className="dtag" data-d={cur.v.decision}>{cur.v.decision === 'advance' ? t.demo.advance : t.demo.reject}</span>
                  <div className="queue">
                    <span className="queue-at num">{t.demo.queue(at + 1, rows.length)}</span>
                    <button type="button" className="icon-btn" aria-label={t.demo.prev} disabled={at === 0} onClick={() => go(-1)}><CaretLeft size={16} weight="bold" aria-hidden /></button>
                    <button type="button" className="icon-btn" aria-label={t.demo.next} disabled={at >= rows.length - 1} onClick={() => go(1)}><CaretRight size={16} weight="bold" aria-hidden /></button>
                  </div>
                </div>
                <div className="dtabs" role="tablist" aria-label={cur.v.name}>
                  {(['judge', 'compare'] as Tab[]).map((k, i) => (
                    <button key={k} ref={(el) => { tabs.current[i] = el }} type="button" role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="detail-panel" tabIndex={tab === k ? 0 : -1} className="dtab" onClick={() => setTab(k)} onKeyDown={onTabKey}>
                      {t.demo.tabs[k]}
                      {k === 'judge' && <span className="dtab-n num">{t.demo.metCount(cur.v.requirements.filter((q) => q.verdict === 'met').length, job.requirements.length)}</span>}
                    </button>
                  ))}
                </div>
                <div id="detail-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                  {tab === 'judge' ? <Judge t={t} job={job} version={cur.v} /> : <Compare t={t} lang={lang} job={job} resume={cur.r} base={cur.v} />}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
