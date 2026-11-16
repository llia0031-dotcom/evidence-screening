// v2: the same screening task on new resumes, testing how the quote check is wired in.
//
// Arms (same model, effort, job posting and resume text; only the instructions, the output fields and the tool differ):
//   plain        v1's plain prompt, word for word;
//   evidence     v1's evidence prompt, word for word: one finding per verdict, checked against its quotes;
//   split        each verdict carries `resume_fact` (only what the resume says, its own dates and figures) and
//                `comparison` (how that fact meets the requirement, where the job's thresholds and any arithmetic go);
//                only `resume_fact` is checked against the quotes;
//   split-self   the split prompt plus a check_evidence tool that runs the evidence-check script (frozen copy) on the
//                facts and quotes the model passes, at most 3 times, before it gives its final answer.
// Labels in data/v2/gold.json never reach the model.
//
// The API key is read from an .env file (SCREEN_ENV_FILE, relative to the eval folder; default eval/.env),
// never from process.env, so this cannot pick up credentials that belong to other tools. It is never logged.
//
// Usage (from eval/): node v2/run.mjs --smoke
//                     node v2/run.mjs --runs 2 --out v2/results/run-<date>.jsonl [--budget 0.9]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const EVAL = path.resolve(here, "..");
const ROOT = path.resolve(EVAL, "..");
const MODEL = "claude-haiku-5-5"; // the cheapest current Claude model
const EFFORT = "medium";
const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 }; // Claude Haiku 5.5 list price, prompts up to 100K tokens
const CONCURRENCY = 8;
const MAX_TOOL_ROUNDS = 3;
const ARMS = ["plain", "evidence", "split", "split-self"];
const SCRIPT = path.join(EVAL, "frozen", "check_evidence.py");
// Resolve the real interpreter once (a launcher needs the full environment; the script then runs with a minimal one).
const PYTHON = (() => {
  const r = spawnSync("python", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : "python";
})();

const envFile = path.resolve(EVAL, process.env.SCREEN_ENV_FILE ?? ".env");
const apiKey = fs.existsSync(envFile) ? (parseEnv(fs.readFileSync(envFile, "utf8")).ANTHROPIC_API_KEY ?? "").trim() : "";

const sha12 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const jobs = Object.fromEntries(readJson(path.join(ROOT, "data", "jobs.json")).jobs.map((j) => [j.id, j]));

// ------------------------------------------------------------------ prompts (plain and evidence copied from v1 run.mjs)

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

const COMMON = [
  "You screen resumes for internship roles. You are given a job posting with numbered requirements and one resume. Every requirement is a must-have.",
];
const SPLIT = [
  ...COMMON,
  'For each requirement, decide whether the resume shows that the candidate meets it ("met") or not ("not_met"), and give three things:',
  "- resume_fact: one sentence that states only what the resume says, with dates and figures exactly as the resume writes them. No figures from the requirement, no totals or durations you calculated, no judgement.",
  "- quotes: the resume text the fact rests on, copied word for word from the resume.",
  "- comparison: one sentence on how that fact meets or misses the requirement. This is where the requirement's figures and any arithmetic go.",
  'A requirement is met only if you can quote resume text that shows it. If the resume does not show it, the verdict is "not_met"; quote the closest text if there is any, or give no quotes.',
  "Each resume_fact and its quotes will be checked automatically against the resume: a quote that does not appear in the resume, or a figure in the resume_fact that does not appear in its quotes, makes that verdict count as not verified. The comparison is not checked.",
  'Then give an overall fit score from 0 to 100 and a decision: "advance" to the next round or "reject".',
  "Write the facts and comparisons in the language of the resume.",
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
  split: SPLIT.join("\n\n"),
  "split-self": [
    ...SPLIT,
    "Before your final answer, run the check yourself with the check_evidence tool on the resume_fact and quotes of every met verdict. Fix any fact or quote it rejects, then reply with the final JSON.",
  ].join("\n\n"),
};

function userMessage(job, resume) {
  return `Job posting:\n\n${jobText(job)}\n\nResume:\n\n${resume.trim()}\n\nReply in JSON.`;
}

const REQ_IDS = ["R1", "R2", "R3", "R4", "R5", "R6"];
const item = (fields) => ({
  type: "object",
  additionalProperties: false,
  required: ["id", "verdict", ...Object.keys(fields)],
  properties: { id: { type: "string", enum: REQ_IDS }, verdict: { type: "string", enum: ["met", "not_met"] }, ...fields },
});
const answer = (fields) => ({
  type: "object",
  additionalProperties: false,
  required: ["requirements", "score", "decision"],
  properties: {
    requirements: { type: "array", items: item(fields) },
    score: { type: "number" },
    decision: { type: "string", enum: ["advance", "reject"] },
  },
});
const QUOTES = { type: "array", items: { type: "string" } };
const SPLIT_FIELDS = { resume_fact: { type: "string" }, quotes: QUOTES, comparison: { type: "string" } };
const SCHEMA = {
  plain: answer({ reason: { type: "string" } }),
  evidence: answer({ finding: { type: "string" }, quotes: QUOTES }),
  split: answer(SPLIT_FIELDS),
  "split-self": answer(SPLIT_FIELDS),
};

const TOOL = {
  name: "check_evidence",
  description:
    "Runs the evidence-check script on the facts you pass, against this resume. A fact passes when every quote appears in the resume and every figure in the fact appears in its quotes. Returns the exit code (0: all pass, 1: at least one does not, 2: bad input) and the script's report.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["facts"],
    properties: {
      facts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "resume_fact", "quotes"],
          properties: { id: { type: "string" }, resume_fact: { type: "string" }, quotes: QUOTES },
        },
      },
    },
  },
};

export const PROMPT_SHA = sha12(JSON.stringify({ SYSTEM, SCHEMA, TOOL, user: userMessage(Object.values(jobs)[0], "{resume}") }));

// ------------------------------------------------------------------ the check tool

function runScript(input, resumeFile, lang) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "screencheck-"));
  try {
    const name = path.basename(resumeFile);
    const claims = (Array.isArray(input?.facts) ? input.facts : []).map((f) => ({
      id: String(f.id ?? ""),
      text: String(f.resume_fact ?? ""),
      evidence: (Array.isArray(f.quotes) ? f.quotes : []).map((q) => ({ source: name, quote: String(q) })),
    }));
    const file = path.join(dir, "claims.json");
    fs.writeFileSync(file, JSON.stringify({ claims }), "utf8");
    // A minimal environment: the script needs nothing else, and no credentials are passed on.
    const env = Object.fromEntries(Object.entries({ PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PYTHONIOENCODING: "utf-8" }).filter(([, v]) => v));
    const r = spawnSync(PYTHON, [SCRIPT, file, "--sources", resumeFile, "--format", "markdown", "--lang", lang], { encoding: "utf8", timeout: 60_000, env });
    const code = r.status ?? 2;
    return { code, text: `exit code ${code}\n\n${`${r.stdout ?? ""}${r.stderr ? `\n${r.stderr}` : ""}`.trim()}`, broken: !(r.stdout ?? "").trim(), n: claims.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ calls

let client = null;
function getClient() {
  client ??= new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", timeout: 180_000, maxRetries: 4 });
  return client;
}

async function converse(arm, job, it) {
  const started = Date.now();
  const usage = { input: 0, output: 0 };
  const toolLog = [];
  const messages = [{ role: "user", content: userMessage(job, it.text) }];
  let apiCalls = 0;
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS + 1; round++) {
      const params = {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA[arm] } },
        system: SYSTEM[arm],
        messages,
      };
      if (arm === "split-self") {
        params.tools = [TOOL];
        if (round >= MAX_TOOL_ROUNDS) params.tool_choice = { type: "none" };
      }
      const response = await getClient().messages.create(params);
      apiCalls++;
      usage.input += response.usage?.input_tokens ?? 0;
      usage.output += response.usage?.output_tokens ?? 0;
      const base = () => ({ usage, cost: usage.input * PRICE.input + usage.output * PRICE.output, latency_ms: Date.now() - started, model_served: response.model, api_calls: apiCalls, tool_log: toolLog });
      if (response.stop_reason === "refusal") return { ok: false, error: "refused", ...base() };
      if (response.stop_reason === "max_tokens") return { ok: false, error: "cut off at max_tokens", ...base() };
      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results = [];
        for (const block of response.content.filter((b) => b.type === "tool_use")) {
          const r = runScript(block.input, it.path, it.lang);
          toolLog.push({ exit: r.code, broken: r.broken, facts: r.n });
          results.push({ type: "tool_result", tool_use_id: block.id, content: r.text });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      try {
        return { ok: true, output: JSON.parse(text), ...base() };
      } catch {
        return { ok: false, error: "output is not JSON", raw: text, ...base() };
      }
    }
    return { ok: false, error: "no final answer after the tool limit", usage, cost: usage.input * PRICE.input + usage.output * PRICE.output, api_calls: apiCalls, tool_log: toolLog };
  } catch (err) {
    const spent = { usage, cost: usage.input * PRICE.input + usage.output * PRICE.output, api_calls: apiCalls };
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, fatal: true, error: "API key rejected", ...spent };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, error: "rate limited", ...spent };
    if (err instanceof Anthropic.APIError) return { ok: false, error: `API error ${err.status ?? ""}: ${err.message}`, ...spent };
    return { ok: false, error: `failed: ${err.message}`, ...spent };
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
  return { smoke: a.includes("--smoke"), runs: Number(get("runs", "2")), out: get("out", ""), budget: Number(get("budget", "0.9")) };
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
    const dir = path.join(ROOT, "data", "smoke");
    items = readJson(path.join(dir, "smoke.json")).instances.map((s) => ({ ...s, path: path.join(dir, s.file), lang: jobs[s.job].lang }));
    out = path.join(here, "results", "smoke.jsonl");
    opt.runs = 1;
  } else {
    if (!opt.out) throw new Error("--out is required");
    const dir = path.join(ROOT, "data", "v2", "instances");
    items = readJson(path.join(dir, "index.json")).instances.map((s) => ({ ...s, path: path.join(dir, s.file) }));
    out = path.resolve(EVAL, opt.out);
  }
  for (const it of items) it.text = fs.readFileSync(it.path, "utf8");
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
  for (let run = 1; run <= opt.runs; run++) for (const it of items) for (const arm of ARMS) if (!done.has(`${run}|${arm}|${it.id}`)) tasks.push({ run, arm, it });
  console.log(`${tasks.length} conversations to run (${done.size} already stored, US$${spent.toFixed(4)} spent so far); budget US$${opt.budget}`);
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
        const r = await converse(t.arm, jobs[t.it.job], t.it);
        if (r.fatal) stop = r.error;
        spent += r.cost ?? 0;
        finished++;
        if (!r.ok) failed++;
        stream.write(JSON.stringify({ run: t.run, arm: t.arm, instance: t.it.id, prompt_sha: PROMPT_SHA, effort: EFFORT, ...r }) + "\n");
        if (finished % 40 === 0) console.log(`${finished}/${tasks.length} done, ${failed} failed, US$${spent.toFixed(4)}`);
      }),
    ),
  );
  await new Promise((resolve) => stream.end(resolve));
  console.log(`finished ${finished} conversations, ${failed} failed, total US$${spent.toFixed(4)}${stop ? `; stopped: ${stop}` : ""}`);
  return stop || failed ? 1 : 0;
}

process.exitCode = await main();
