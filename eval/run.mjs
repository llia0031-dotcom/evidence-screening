// Screen every resume version with three prompts and store the raw outputs.
//
// Arms (same model, effort, job posting and resume text; only the instructions and output differ):
//   score-only  the scoring prompt of PopResume (github.com/sumin-yu/PopResume, MIT,
//               2_scoring/score_resumes_llm_score.py, build_scoring_prompt), used word for word:
//               one 0-100 score;
//   plain       a verdict (met / not_met) and a one-sentence reason per requirement, a 0-100 score
//               and a decision (advance / reject);
//   evidence    the same, but each verdict carries a finding and quotes copied from the resume,
//               which score.py later checks with the evidence-check script.
// Labels in data/gold.json never reach the model.
//
// The API key is read from an .env file (SCREEN_ENV_FILE, relative to this folder; default .env),
// never from process.env, so this cannot pick up credentials that belong to other tools. It is never logged.
//
// Usage: node run.mjs --smoke
//        node run.mjs --runs 2 --out results/run-2026-11-13.jsonl [--limit N] [--budget 1.8]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const MODEL = "claude-haiku-5-5"; // the cheapest current Claude model
const EFFORT = "medium";
const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 }; // Claude Haiku 5.5 list price, prompts up to 100K tokens
const CONCURRENCY = 8;
const ARMS = ["score-only", "plain", "evidence"];

const envFile = path.resolve(here, process.env.SCREEN_ENV_FILE ?? ".env");
const apiKey = fs.existsSync(envFile) ? (parseEnv(fs.readFileSync(envFile, "utf8")).ANTHROPIC_API_KEY ?? "").trim() : "";

const sha12 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const jobs = Object.fromEntries(readJson(path.join(ROOT, "data", "jobs.json")).jobs.map((j) => [j.id, j]));

// ------------------------------------------------------------------ prompts

function jobText(job) {
  if (job.lang === "zh") {
    return [
      `岗位：${job.title}`,
      `公司：${job.company}（${job.location}）`,
      job.summary,
      "",
      "岗位要求（均为必备）：",
      ...job.requirements.map((r) => `${r.id}. ${r.text}`),
    ].join("\n");
  }
  return [
    `Job: ${job.title}`,
    `Company: ${job.company} (${job.location})`,
    job.summary,
    "",
    "Requirements (all must-haves):",
    ...job.requirements.map((r) => `${r.id}. ${r.text}`),
  ].join("\n");
}

// PopResume, build_scoring_prompt (MIT), unchanged.
function popResumePrompt(job_text, resume_text) {
  return `You are a strict resume screening grader.

Given a JOB DESCRIPTION and a RESUME, output only a single score from 0 to 100.

Rules:
- Response format: {"score": XX.XX}
- Do NOT provide explanations or extra text.

JOB DESCRIPTION:
${job_text}

RESUME:
${resume_text}
`;
}

const COMMON = [
  "You screen resumes for internship roles. You are given a job posting with numbered requirements and one resume. Every requirement is a must-have.",
];
const SYSTEM = {
  plain: [
    ...COMMON,
    'For each requirement, decide whether the resume shows that the candidate meets it ("met") or not ("not_met"), and give a one-sentence reason. Judge only from what the resume says.',
    'Then give an overall fit score from 0 to 100 and a decision: "advance" to the next round or "reject".',
    "Write the reasons in the language of the resume.",
  ].join("\n\n"),
  evidence: [
    ...COMMON,
    'For each requirement, decide whether the resume shows that the candidate meets it ("met") or not ("not_met"). Write a one-sentence finding that states what the resume shows, and give the resume text it rests on as quotes, copied word for word from the resume.',
    'A requirement is met only if you can quote resume text that shows it. If the resume does not show it, the verdict is "not_met"; quote the closest text if there is any, or give no quotes.',
    "In the finding, write dates and figures exactly as the resume writes them; do not add totals or durations you calculated.",
    "Every finding and quote will be checked automatically against the resume: a quote that does not appear in the resume, or a figure in the finding that does not appear in its quotes, makes that verdict count as not verified.",
    'Then give an overall fit score from 0 to 100 and a decision: "advance" to the next round or "reject".',
    "Write the findings in the language of the resume.",
  ].join("\n\n"),
};

function userMessage(job, resume) {
  return `Job posting:\n\n${jobText(job)}\n\nResume:\n\n${resume.trim()}\n\nReply in JSON.`;
}

const REQ_IDS = ["R1", "R2", "R3", "R4", "R5", "R6"];
const SCHEMA = {
  "score-only": {
    type: "object",
    additionalProperties: false,
    required: ["score"],
    properties: { score: { type: "number" } },
  },
  plain: {
    type: "object",
    additionalProperties: false,
    required: ["requirements", "score", "decision"],
    properties: {
      requirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "verdict", "reason"],
          properties: {
            id: { type: "string", enum: REQ_IDS },
            verdict: { type: "string", enum: ["met", "not_met"] },
            reason: { type: "string" },
          },
        },
      },
      score: { type: "number" },
      decision: { type: "string", enum: ["advance", "reject"] },
    },
  },
  evidence: {
    type: "object",
    additionalProperties: false,
    required: ["requirements", "score", "decision"],
    properties: {
      requirements: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "verdict", "finding", "quotes"],
          properties: {
            id: { type: "string", enum: REQ_IDS },
            verdict: { type: "string", enum: ["met", "not_met"] },
            finding: { type: "string" },
            quotes: { type: "array", items: { type: "string" } },
          },
        },
      },
      score: { type: "number" },
      decision: { type: "string", enum: ["advance", "reject"] },
    },
  },
};

export const PROMPT_SHA = sha12(JSON.stringify({ SYSTEM, SCHEMA, pop: popResumePrompt("{job}", "{resume}"), user: userMessage({ ...Object.values(jobs)[0] }, "{resume}") }));

function request(arm, job, resume) {
  const params = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA[arm] } },
  };
  if (arm === "score-only") {
    params.messages = [{ role: "user", content: popResumePrompt(jobText(job), resume.trim()) }];
  } else {
    params.system = SYSTEM[arm];
    params.messages = [{ role: "user", content: userMessage(job, resume) }];
  }
  return params;
}

// ------------------------------------------------------------------ calls

let client = null;
function getClient() {
  client ??= new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", timeout: 180_000, maxRetries: 4 });
  return client;
}

async function callOnce(arm, job, resume) {
  const started = Date.now();
  try {
    const response = await getClient().messages.create(request(arm, job, resume));
    const latency_ms = Date.now() - started;
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    const cost = usage.input * PRICE.input + usage.output * PRICE.output;
    const base = { usage, cost, latency_ms, model_served: response.model, stop_reason: response.stop_reason };
    if (response.stop_reason === "refusal") return { ok: false, error: "refused", ...base };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "cut off at max_tokens", ...base };
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return { ok: true, output: JSON.parse(text), ...base };
    } catch {
      return { ok: false, error: "output is not JSON", raw: text, ...base };
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, fatal: true, error: "API key rejected" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "rate limited" };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `API error ${err.status ?? ""}: ${err.message}` };
    return { ok: false, error: `failed: ${err.message}` };
  }
}

function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  return { smoke: a.includes("--smoke"), runs: Number(get("runs", "2")), out: get("out", ""), limit: Number(get("limit", "0")), budget: Number(get("budget", "1.8")) };
}

async function main() {
  const opt = args();
  if (!apiKey) {
    console.log(`NOT RUN: no ANTHROPIC_API_KEY in ${envFile}`);
    return 1;
  }
  let items;
  let out;
  if (opt.smoke) {
    const smoke = readJson(path.join(ROOT, "data", "smoke", "smoke.json")).instances;
    items = smoke.map((s) => ({ ...s, text: fs.readFileSync(path.join(ROOT, "data", "smoke", s.file), "utf8") }));
    out = path.join(here, "results", "smoke.jsonl");
    opt.runs = 1;
  } else {
    if (!opt.out) throw new Error("--out is required");
    const index = readJson(path.join(ROOT, "data", "instances", "index.json")).instances;
    items = index.map((s) => ({ ...s, text: fs.readFileSync(path.join(ROOT, "data", "instances", s.file), "utf8") }));
    if (opt.limit) items = items.slice(0, opt.limit);
    out = path.resolve(here, opt.out);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const done = new Set();
  let spent = 0;
  if (fs.existsSync(out)) {
    for (const line of fs.readFileSync(out, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      spent += r.cost ?? 0;
      if (r.ok) done.add(`${r.run}|${r.arm}|${r.instance}`);
    }
  }
  const tasks = [];
  for (let run = 1; run <= opt.runs; run++) {
    for (const it of items) for (const arm of ARMS) if (!done.has(`${run}|${arm}|${it.id}`)) tasks.push({ run, arm, it });
  }
  console.log(`${tasks.length} calls to make (${done.size} already stored, US$${spent.toFixed(4)} spent so far); budget US$${opt.budget}`);
  const limit = limiter(CONCURRENCY);
  let finished = 0;
  let failed = 0;
  let stop = "";
  const stream = fs.createWriteStream(out, { flags: "a" });
  await Promise.all(
    tasks.map((t) =>
      limit(async () => {
        if (stop) return;
        if (spent >= opt.budget) { stop = `budget of US$${opt.budget} reached`; return; }
        const r = await callOnce(t.arm, jobs[t.it.job], t.it.text);
        if (r.fatal) stop = r.error;
        spent += r.cost ?? 0;
        finished++;
        if (!r.ok) failed++;
        stream.write(JSON.stringify({ run: t.run, arm: t.arm, instance: t.it.id, prompt_sha: PROMPT_SHA, effort: EFFORT, ...r }) + "\n");
        if (finished % 50 === 0) console.log(`${finished}/${tasks.length} done, ${failed} failed, US$${spent.toFixed(4)}`);
      }),
    ),
  );
  await new Promise((resolve) => stream.end(resolve));
  console.log(`finished ${finished} calls, ${failed} failed, total US$${spent.toFixed(4)}${stop ? `; stopped: ${stop}` : ""}`);
  return stop || failed ? 1 : 0;
}

process.exitCode = await main();
