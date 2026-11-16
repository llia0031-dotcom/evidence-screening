// Second-judgement test: a reviewer call accepts or rejects one "met" verdict at a time.
//
// The review set (verify/items.json, built by verify/build.py) holds 103 right "met" answers the split arm gave in v3
// and the 40 seeded misreadings (seeded/misreadings.json), which the quote check let through.
// Arms (same model, effort, job posting, resume and requirement; only what the reviewer sees of the answer differs):
//   verify-full   the verdict "met", the resume_fact, the quotes and the screener's comparison (its reasoning);
//   verify-fact   the verdict "met", the resume_fact and the quotes, without the comparison.
// Requests go through the Message Batches API (half price), as in v3. Which items are misreadings never reaches the model.
//
// The API key is read from an .env file (SCREEN_ENV_FILE, relative to the eval folder; default eval/.env),
// never from process.env, so this cannot pick up credentials that belong to other tools. It is never logged.
//
// Usage (from eval/): node verify/run.mjs --smoke
//                     node verify/run.mjs --runs 2 --out verify/results/run-<date>.jsonl [--budget 0.3]
// Progress is kept in <out>.state.json, so a stopped run picks up a batch still in flight.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const EVAL = path.resolve(here, "..");
const ROOT = path.resolve(EVAL, "..");
const MODEL = "claude-haiku-5-5"; // the cheapest current Claude model
const EFFORT = "medium";
const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6 }; // Claude Haiku 5.5 list price, prompts up to 100K tokens
const BATCH_DISCOUNT = 0.5; // the Message Batches API bills every token at half the list price
const MAX_RESUBMITS = 1;
const POLL_MS = 30_000;
const ARMS = ["verify-full", "verify-fact"];
const ARM_CODE = { "verify-full": "vf", "verify-fact": "vc" };

const envFile = path.resolve(EVAL, process.env.SCREEN_ENV_FILE ?? ".env");
const apiKey = fs.existsSync(envFile) ? (parseEnv(fs.readFileSync(envFile, "utf8")).ANTHROPIC_API_KEY ?? "").trim() : "";

const sha12 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const jobs = Object.fromEntries(readJson(path.join(ROOT, "data", "jobs.json")).jobs.map((j) => [j.id, j]));
const INST = path.join(ROOT, "data", "v3", "instances");
const instances = Object.fromEntries(readJson(path.join(INST, "index.json")).instances.map((i) => [i.id, i]));

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

const SEES = {
  "verify-full": "the resume fact and quotes it rests on, and the screener's reasoning",
  "verify-fact": "the resume fact and quotes it rests on",
};
const SYSTEM = Object.fromEntries(
  ARMS.map((arm) => [
    arm,
    [
      `You review one verdict from a resume screen for an internship role. You are given the job posting with numbered requirements, one resume, and a screener's verdict on one requirement: that the candidate meets it, with ${SEES[arm]}.`,
      "Decide whether the resume really shows that the candidate meets this requirement. Every requirement is a must-have. Judge only from what the resume says.",
      'Answer "right" if the verdict is correct and "wrong" if it is not, with a one-sentence reason. Write the reason in the language of the resume.',
    ].join("\n\n"),
  ]),
);
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "reason"],
  properties: { verdict: { type: "string", enum: ["right", "wrong"] }, reason: { type: "string" } },
};

function userMessage(arm, job, resume, item) {
  const req = job.requirements.find((r) => r.id === item.req);
  const lines = [
    `Job posting:\n\n${jobText(job)}`,
    `Resume:\n\n${resume.trim()}`,
    [
      "Verdict to review:",
      `Requirement ${req.id}: ${req.text}`,
      "Verdict: met",
      `Resume fact: ${item.resume_fact}`,
      "Quotes:",
      ...(item.quotes.length ? item.quotes.map((q) => `- ${q}`) : ["(none)"]),
      ...(arm === "verify-full" ? [`Screener's reasoning: ${item.comparison}`] : []),
    ].join("\n"),
    "Reply in JSON.",
  ];
  return lines.join("\n\n");
}

const sample = { req: "R1", resume_fact: "{fact}", quotes: ["{quote}"], comparison: "{comparison}" };
export const PROMPT_SHA = sha12(JSON.stringify({ SYSTEM, SCHEMA, user: ARMS.map((a) => userMessage(a, Object.values(jobs)[0], "{resume}", sample)) }));

// ------------------------------------------------------------------ batches

let client = null;
function getClient() {
  client ??= new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", timeout: 180_000, maxRetries: 4 });
  return client;
}

const costOf = (u) => (u.input * PRICE.input + u.output * PRICE.output) * BATCH_DISCOUNT;
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
  return { smoke: a.includes("--smoke"), runs: Number(get("runs", "2")), out: get("out", ""), budget: Number(get("budget", "0.3")) };
}

async function main() {
  const opt = args();
  if (!apiKey) {
    console.log(`NOT RUN: no ANTHROPIC_API_KEY in ${envFile}`);
    return 1;
  }
  let items = readJson(path.join(here, "items.json")).items;
  let out;
  if (opt.smoke) {
    items = [items.find((x) => x.kind === "right"), items.find((x) => x.kind === "misreading")];
    out = path.join(here, "results", "smoke.jsonl");
    opt.runs = 1;
  } else {
    if (!opt.out) throw new Error("--out is required");
    out = path.resolve(EVAL, opt.out);
  }
  const byId = Object.fromEntries(items.map((x) => [x.id, x]));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const statePath = `${out}.state.json`;

  const done = new Set();
  let spentDone = 0;
  if (fs.existsSync(out)) {
    for (const line of fs.readFileSync(out, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line);
      spentDone += r.cost ?? 0;
      if (r.ok) done.add(`${r.run}|${r.arm}|${r.item}`);
    }
  }
  const state = fs.existsSync(statePath) ? readJson(statePath) : { pending_batch: null, reqs: {} };
  for (let run = 1; run <= opt.runs; run++) {
    items.forEach((it, idx) => {
      for (const arm of ARMS) {
        const key = `${run}|${arm}|${it.id}`;
        if (done.has(key) || state.reqs[key]) continue;
        state.reqs[key] = { key, run, arm, item: it.id, cid: `r${run}-${ARM_CODE[arm]}-${String(idx).padStart(3, "0")}`, done: false, resubmits: 0, batch_ids: [] };
      }
    });
  }
  const save = () => fs.writeFileSync(statePath, JSON.stringify(state), "utf8");
  save();
  const stream = fs.createWriteStream(out, { flags: "a" });
  const live = () => Object.values(state.reqs).filter((r) => !r.done);
  let spent = spentDone;
  console.log(`${live().length} reviews to run (${done.size} already stored, US$${spentDone.toFixed(4)} spent so far); budget US$${opt.budget}; prompt ${PROMPT_SHA}`);

  const finish = (q, fields, usage, model) => {
    q.done = true;
    const u = usage ?? { input: 0, output: 0 };
    const cost = costOf(u);
    spent += cost;
    const it = byId[q.item];
    stream.write(JSON.stringify({ run: q.run, arm: q.arm, item: q.item, kind: it.kind, prompt_sha: PROMPT_SHA, effort: EFFORT, send_mode: "batch",
      ...fields, usage: u, cost, model_served: model ?? null, batch_ids: q.batch_ids }) + "\n");
  };

  let stop = "";
  for (let round = 0; round <= MAX_RESUBMITS + 1; round++) {
    if (!state.pending_batch) {
      const todo = live();
      if (!todo.length) break;
      if (spent >= opt.budget) { stop = `budget of US$${opt.budget} reached`; break; }
      const requests = todo.map((q) => {
        const it = byId[q.item];
        const inst = instances[it.resume];
        const job = jobs[inst.job];
        const resume = fs.readFileSync(path.join(INST, inst.file), "utf8");
        q.req_id = `${q.cid}-a${q.resubmits}`;
        return {
          custom_id: q.req_id,
          params: {
            model: MODEL,
            max_tokens: 16000,
            output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
            system: SYSTEM[q.arm],
            messages: [{ role: "user", content: userMessage(q.arm, job, resume, it) }],
          },
        };
      });
      const batch = await getClient().messages.batches.create({ requests });
      for (const q of todo) q.batch_ids.push(batch.id);
      state.pending_batch = batch.id;
      save();
      console.log(`${new Date().toISOString()} sent batch ${batch.id} with ${requests.length} requests`);
    }
    await waitFor(state.pending_batch);
    const byReq = Object.fromEntries(live().map((q) => [q.req_id, q]));
    let seen = 0;
    for await (const result of await getClient().messages.batches.results(state.pending_batch)) {
      const q = byReq[result.custom_id];
      if (!q) continue;
      seen++;
      const type = result.result.type;
      if (type !== "succeeded") {
        q.resubmits++;
        if (q.resubmits > MAX_RESUBMITS) finish(q, { ok: false, error: `batch request ${type}` });
        continue;
      }
      const msg = result.result.message;
      const usage = { input: msg.usage?.input_tokens ?? 0, output: msg.usage?.output_tokens ?? 0 };
      if (msg.stop_reason === "refusal") { finish(q, { ok: false, error: "refused" }, usage, msg.model); continue; }
      if (msg.stop_reason === "max_tokens") { finish(q, { ok: false, error: "cut off at max_tokens" }, usage, msg.model); continue; }
      const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      try {
        finish(q, { ok: true, output: JSON.parse(text) }, usage, msg.model);
      } catch {
        finish(q, { ok: false, error: "output is not JSON", raw: text }, usage, msg.model);
      }
    }
    state.pending_batch = null;
    save();
    console.log(`${seen} results read; ${live().length} reviews still open; US$${spent.toFixed(4)} spent`);
  }
  for (const q of live()) finish(q, { ok: false, error: stop || "no answer after the last resubmission" });
  await new Promise((resolve) => stream.end(resolve));
  save();
  const failed = fs.readFileSync(out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.ok).length;
  console.log(`finished: ${Object.keys(state.reqs).length} reviews this session, ${failed} failed records in the file, total US$${spent.toFixed(4)}${stop ? `; stopped: ${stop}` : ""}`);
  return stop || failed ? 1 : 0;
}

process.exitCode = await main();
