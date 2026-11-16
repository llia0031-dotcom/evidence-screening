// v5: v3's resumes and arms at effort "low". Does the lower effort make the model err on the traps, and are its own
// wrong "met" verdicts stopped by the quote check and by a second review (v5/review.mjs)?
//
// A copy of v3/run.mjs with one change: EFFORT is "low" (v1 to v4 used "medium"). Arms: v2's plain, split and
// split-self, with v2's prompts, schemas and tool copied word for word (the prompt hash must equal v2's).
// What changed is how the requests are sent: through the Message Batches API (half price; results usually within an
// hour, at most 24 hours) instead of one call at a time. split-self's tool loop runs as rounds of batches: a reply
// that calls check_evidence gets its tool result locally, and the next turn goes into the next batch.
// Labels in data/v3/gold.json never reach the model.
//
// The API key is read from an .env file (SCREEN_ENV_FILE, relative to the eval folder; default eval/.env),
// never from process.env, so this cannot pick up credentials that belong to other tools. It is never logged.
//
// Usage (from eval/): node v5/run.mjs --smoke
//                     node v5/run.mjs --runs 2 --out v5/results/run-<date>.jsonl [--budget 0.4]
// Progress is kept in <out>.state.json, so a stopped run picks up where it was, including a batch still in flight.
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
const EFFORT = "low";
const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 }; // Claude Haiku 5.5 list price, prompts up to 100K tokens
const BATCH_DISCOUNT = 0.5; // the Message Batches API bills every token at half the list price
const MAX_TOOL_ROUNDS = 3;
const MAX_RESUBMITS = 1; // an errored or expired request is sent again once
const POLL_MS = 30_000;
const V2_PROMPT_SHA = "09acd4019d72";
const ARMS = ["plain", "split", "split-self"];
const ARM_CODE = { plain: "p", split: "s", "split-self": "ss" };
const SCRIPT = path.join(EVAL, "frozen", "check_evidence.py");
const PYTHON = (() => {
  const r = spawnSync("python", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : "python";
})();

const envFile = path.resolve(EVAL, process.env.SCREEN_ENV_FILE ?? ".env");
const apiKey = fs.existsSync(envFile) ? (parseEnv(fs.readFileSync(envFile, "utf8")).ANTHROPIC_API_KEY ?? "").trim() : "";

const sha12 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const jobs = Object.fromEntries(readJson(path.join(ROOT, "data", "jobs.json")).jobs.map((j) => [j.id, j]));

// ------------------------------------------------------------------ prompts (copied from v2/run.mjs, all four arms, so the hash can be compared)

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

// ------------------------------------------------------------------ the check tool (same as v2)

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
    const env = Object.fromEntries(Object.entries({ PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PYTHONIOENCODING: "utf-8" }).filter(([, v]) => v));
    const r = spawnSync(PYTHON, [SCRIPT, file, "--sources", resumeFile, "--format", "markdown", "--lang", lang], { encoding: "utf8", timeout: 60_000, env });
    const code = r.status ?? 2;
    return { code, text: `exit code ${code}\n\n${`${r.stdout ?? ""}${r.stderr ? `\n${r.stderr}` : ""}`.trim()}`, broken: !(r.stdout ?? "").trim(), n: claims.length };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------ batches

let client = null;
function getClient() {
  client ??= new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", timeout: 180_000, maxRetries: 4 });
  return client;
}

const costOf = (u) => (u.input * PRICE.input + u.output * PRICE.output) * BATCH_DISCOUNT;

function params(conv, job) {
  const p = {
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA[conv.arm] } },
    system: SYSTEM[conv.arm],
    messages: conv.messages,
  };
  if (conv.arm === "split-self") {
    p.tools = [TOOL];
    if (conv.round >= MAX_TOOL_ROUNDS) p.tool_choice = { type: "none" };
  }
  return p;
}

function finish(conv, fields, stream) {
  conv.done = true;
  const rec = {
    run: conv.run, arm: conv.arm, instance: conv.instance, prompt_sha: PROMPT_SHA, effort: EFFORT, send_mode: "batch",
    ...fields, usage: conv.usage, cost: costOf(conv.usage), model_served: conv.model_served ?? null,
    api_calls: conv.api_calls, tool_log: conv.tool_log, batch_ids: conv.batch_ids,
  };
  stream.write(JSON.stringify(rec) + "\n");
}

function handle(conv, result, it, stream) {
  const type = result.result.type;
  if (type !== "succeeded") {
    conv.resubmits = (conv.resubmits ?? 0) + 1;
    const why = type === "errored" ? `batch request errored: ${result.result.error?.error?.type ?? result.result.error?.type ?? "unknown"}` : `batch request ${type}`;
    if (conv.resubmits > MAX_RESUBMITS) finish(conv, { ok: false, error: why }, stream);
    return;
  }
  const msg = result.result.message;
  conv.api_calls++;
  conv.usage.input += msg.usage?.input_tokens ?? 0;
  conv.usage.output += msg.usage?.output_tokens ?? 0;
  conv.model_served = msg.model;
  if (msg.stop_reason === "refusal") return finish(conv, { ok: false, error: "refused" }, stream);
  if (msg.stop_reason === "max_tokens") return finish(conv, { ok: false, error: "cut off at max_tokens" }, stream);
  if (msg.stop_reason === "tool_use") {
    if (conv.round >= MAX_TOOL_ROUNDS) return finish(conv, { ok: false, error: "tool call after the tool limit" }, stream);
    conv.messages.push({ role: "assistant", content: msg.content });
    const results = [];
    for (const block of msg.content.filter((b) => b.type === "tool_use")) {
      const r = runScript(block.input, it.path, it.lang);
      conv.tool_log.push({ exit: r.code, broken: r.broken, facts: r.n });
      results.push({ type: "tool_result", tool_use_id: block.id, content: r.text });
    }
    conv.messages.push({ role: "user", content: results });
    conv.round++;
    return; // the next turn goes into the next batch
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  try {
    finish(conv, { ok: true, output: JSON.parse(text) }, stream);
  } catch {
    finish(conv, { ok: false, error: "output is not JSON", raw: text }, stream);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(batchId) {
  let last = "";
  for (;;) {
    const b = await getClient().messages.batches.retrieve(batchId);
    const line = `${b.processing_status}: ${JSON.stringify(b.request_counts)}`;
    if (line !== last) console.log(`${new Date().toISOString()} batch ${batchId} ${line}`);
    last = line;
    if (b.processing_status === "ended") return b;
    await sleep(POLL_MS);
  }
}

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
  return { smoke: a.includes("--smoke"), runs: Number(get("runs", "2")), out: get("out", ""), budget: Number(get("budget", "0.4")) };
}

async function main() {
  const opt = args();
  if (PROMPT_SHA !== V2_PROMPT_SHA) {
    console.log(`STOP: the copied prompts hash to ${PROMPT_SHA}, not v2's ${V2_PROMPT_SHA}`);
    return 1;
  }
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
    const dir = path.join(ROOT, "data", "v3", "instances");
    items = readJson(path.join(dir, "index.json")).instances.map((s) => ({ ...s, path: path.join(dir, s.file) }));
    out = path.resolve(EVAL, opt.out);
  }
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  for (const it of items) it.text = fs.readFileSync(it.path, "utf8");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const statePath = `${out}.state.json`;

  // Conversations already written to the results file are done; the rest come from the saved state or start fresh.
  const done = new Set();
  let spentDone = 0;
  if (fs.existsSync(out)) {
    for (const line of fs.readFileSync(out, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      spentDone += r.cost ?? 0;
      if (r.ok) done.add(`${r.run}|${r.arm}|${r.instance}`);
    }
  }
  let state = fs.existsSync(statePath) ? readJson(statePath) : { pending_batch: null, convs: {} };
  for (let run = 1; run <= opt.runs; run++) {
    for (const it of items) {
      for (const arm of ARMS) {
        const key = `${run}|${arm}|${it.id}`;
        if (done.has(key) || state.convs[key]) continue;
        state.convs[key] = {
          key, run, arm, instance: it.id, cid: `r${run}-${ARM_CODE[arm]}-${it.id}`, round: 0, done: false,
          messages: [{ role: "user", content: userMessage(jobs[it.job], it.text) }],
          usage: { input: 0, output: 0 }, api_calls: 0, tool_log: [], batch_ids: [],
        };
      }
    }
  }
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state), "utf8");
  save();
  const stream = fs.createWriteStream(out, { flags: "a" });
  const live = () => Object.values(state.convs).filter((c) => !c.done);
  // Spent = what the results file held at the start + every conversation finished or still open in this session.
  for (const c of Object.values(state.convs)) c.this_session = !c.done;
  const spent = () => spentDone + Object.values(state.convs).filter((c) => c.this_session).reduce((s, c) => s + costOf(c.usage), 0);
  console.log(`${live().length} conversations to run (${done.size} already stored, US$${spentDone.toFixed(4)} spent so far); budget US$${opt.budget}; prompt ${PROMPT_SHA}`);

  let stop = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS + 3; round++) {
    if (!state.pending_batch) {
      const todo = live();
      if (!todo.length) break;
      if (spent() >= opt.budget) { stop = `budget of US$${opt.budget} reached`; break; }
      const requests = todo.map((c) => {
        c.req_id = `${c.cid}-t${c.round}-a${c.resubmits ?? 0}`;
        return { custom_id: c.req_id, params: params(c, jobs[byId[c.instance].job]) };
      });
      const batch = await getClient().messages.batches.create({ requests });
      for (const c of todo) c.batch_ids.push(batch.id);
      state.pending_batch = batch.id;
      save();
      console.log(`${new Date().toISOString()} sent batch ${batch.id} with ${requests.length} requests`);
    }
    await waitFor(state.pending_batch);
    const byReq = Object.fromEntries(live().map((c) => [c.req_id, c]));
    let seen = 0;
    for await (const result of await getClient().messages.batches.results(state.pending_batch)) {
      const conv = byReq[result.custom_id];
      if (!conv) continue;
      seen++;
      handle(conv, result, byId[conv.instance], stream);
    }
    state.pending_batch = null;
    save();
    console.log(`${seen} results read; ${live().length} conversations still open; US$${spent().toFixed(4)} spent`);
  }
  for (const c of live()) finish(c, { ok: false, error: stop || "no final answer after the last round" }, stream);
  await new Promise((resolve) => stream.end(resolve));
  save();
  const all = Object.values(state.convs);
  const failed = fs.readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.ok).length;
  console.log(`finished: ${all.length} conversations this session, ${failed} failed records in the file, total US$${spent().toFixed(4)}${stop ? `; stopped: ${stop}` : ""}`);
  return stop || failed ? 1 : 0;
}

process.exitCode = await main();
