import { useEffect, useState } from 'react'
import { COPY, type Lang } from './copy'
import { HOME, initialLang, saveLang } from './lang'
import SimpleBar from './components/SimpleBar'
import Phrase from './components/Phrase'

// The about page: what the page shows, where its data comes from, how it was tested and its limits, said once.
type Bit = string | { text: string; href: string }
type Section = { h: string; p: Bit[][] }

const REPO = 'https://github.com/llia0031-dotcom/evidence-screening'
const REPORT = `${REPO}/blob/main/eval/EVALUATION.md`
const CHECKER = 'https://github.com/llia0031-dotcom/evidence-check'

const SECTIONS: Record<Lang, Section[]> = {
  zh: [
    {
      h: '这是什么',
      p: [['用大模型初筛简历：对照岗位的每条必备要求给出“符合”或“不符合”，每个判断附上简历原文，再由脚本逐字核对原文确实在简历里。这个页面展示测试时存下的结果，页面本身不调用模型。']],
    },
    {
      h: '数据从哪来',
      p: [['4 个虚构岗位，中文、英文各 2 个，每个 6 条必备要求。简历全部虚构，每份简历对每条要求符不符合，在写简历时就定好。公司和人名是编的，电话和邮箱是占位；学校用的是真实校名，用来测换学校会不会改变结论。']],
    },
    {
      h: '怎么测试的',
      p: [
        ['测试分五轮，另有两项专门测核对和复核本身。每轮跑之前先写好计划和预测，记下文件指纹；跑完后对评分的改动都写明原因。每个模型测试跑两遍。'],
        ['完整报告：', { text: 'eval/EVALUATION.md', href: REPORT }, '（英文）。'],
      ],
    },
    {
      h: '局限',
      p: [['简历短而干净，题目和答案出自同一作者，所以准确率接近 100%，真实简历会难得多。只测了一个模型。模型在这些简历上几乎没有判错“符合”，所以核对和复核能拦住模型自己多少错，还没有测到。']],
    },
    {
      h: '用到的模型和工具',
      p: [
        ['判断：claude-haiku-5-5，effort 设为 medium（第五轮为 low）。核对引文：', { text: 'evidence-check', href: CHECKER }, ' 0.2.0 版核对脚本的固定副本。'],
        ['代码、数据和报告：', { text: 'GitHub 上的 evidence-screening', href: REPO }, '，MIT 许可。字体：Merriweather、Geist、思源宋体、思源黑体（SIL Open Font License 1.1）。'],
      ],
    },
  ],
  en: [
    {
      h: 'What it is',
      p: [['Resume screening with a language model: each must-have of a job gets “meets” or “does not meet”, each verdict comes with the line of the resume behind it, and a script checks word for word that the line is in the resume. This page shows the outputs stored during testing and makes no model calls.']],
    },
    {
      h: 'Where the data comes from',
      p: [['Four fictional jobs, two in Chinese and two in English, each with six must-haves. Every resume is fictional, and whether it meets each requirement was fixed when it was written. The companies and people are made up and the phone numbers and emails are placeholders; the schools are real names, used to test whether changing the school changes the outcome.']],
    },
    {
      h: 'How it was tested',
      p: [
        ['Five rounds, plus two tests of the quote check and the second review themselves. Before each round, the plan and the predictions were written down with the files’ fingerprints; any later change to the scoring is listed with its reason. Every model test ran twice.'],
        ['Full report: ', { text: 'eval/EVALUATION.md', href: REPORT }, '.'],
      ],
    },
    {
      h: 'Limits',
      p: [['The resumes are short and clean, and the questions and answers come from the same author, which is why accuracy is near 100%; real resumes are much harder. One model was tested. The model almost never gave a wrong “meets” on these resumes, so how many of its own mistakes the check and the review would stop is still unmeasured.']],
    },
    {
      h: 'Models and tools',
      p: [
        ['Verdicts: claude-haiku-5-5 at medium effort (low in round five). Quote check: a frozen copy of the ', { text: 'evidence-check', href: CHECKER }, ' 0.2.0 checker script.'],
        ['Code, data and report: ', { text: 'evidence-screening on GitHub', href: REPO }, ', MIT licence. Fonts: Merriweather, Geist, Noto Serif SC and Noto Sans SC (SIL Open Font License 1.1).'],
      ],
    },
  ],
}

export default function AboutPage() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const t = COPY[lang]
  useEffect(() => {
    document.documentElement.lang = t.htmlLang
    document.title = t.about.docTitle
    saveLang(lang)
  }, [lang, t])
  return (
    <div className="pg">
      <a className="skip" href="#main">{t.skip}</a>
      <SimpleBar t={t} onSwitch={() => setLang(lang === 'zh' ? 'en' : 'zh')} />
      <main id="main" className="about">
        <div className="container about-inner">
          <h1>{t.about.title}</h1>
          {SECTIONS[lang].map((s) => (
            <section key={s.h} className="about-sec">
              <h2>{s.h}</h2>
              {s.p.map((para, i) => (
                <p key={i}>{para.map((bit, j) => (typeof bit === 'string' ? <Phrase key={j} text={bit} lang={lang} /> : <a key={j} href={bit.href}>{bit.text}</a>))}</p>
              ))}
            </section>
          ))}
          <a className="btn btn--clear" href={HOME}>{t.about.back}</a>
        </div>
      </main>
    </div>
  )
}
