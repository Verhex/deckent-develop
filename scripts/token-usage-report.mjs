#!/usr/bin/env node
// scripts/token-usage-report.mjs
// Aggregate REAL Anthropic API token usage from Claude Code session transcripts
// (~/.claude/projects/**/*.jsonl). Ground truth: the `message.usage` fields the
// API returns per call — NOT worker self-estimates (.result tokenUsage).
// Dedupe: streamed chunks repeat the same message id with identical usage; each
// message id is counted once.
//
// Usage:
//   node scripts/token-usage-report.mjs                 # all models, all projects
//   node scripts/token-usage-report.mjs --model fable   # filter by model substring
//   node scripts/token-usage-report.mjs --model fable --sessions
//   node scripts/token-usage-report.mjs --price 10,50   # $/MTok in,out → cost estimate
//
// Cost estimate multipliers (Anthropic standard): cacheRead = 0.1 × input,
// cacheWrite(5m) = 1.25 × input. Subscription auth = $0 actual; the estimate
// shows what the usage WOULD cost on API billing.
import { createReadStream, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};
const modelFilter = flag('model') ?? '';
const showSessions = args.includes('--sessions');
const price = (flag('price') ?? '').split(',').map(Number);
const [priceIn, priceOut] = price.length === 2 && price.every(Number.isFinite) ? price : [NaN, NaN];

const root = join(homedir(), '.claude', 'projects');
const seen = new Set();
const perModel = {};
const perDay = {};
const perSession = {};

const bucket = (map, key) => (map[key] ??= { in: 0, out: 0, cr: 0, cw: 0, calls: 0, first: null, last: null });
const acc = (m, u, ts) => {
  m.in += u.input_tokens || 0;
  m.out += u.output_tokens || 0;
  m.cr += u.cache_read_input_tokens || 0;
  m.cw += u.cache_creation_input_tokens || 0;
  m.calls++;
  if (ts) { m.first ??= ts; m.last = ts; }
};

let dirs;
try { dirs = readdirSync(root); } catch { console.error(`no transcripts at ${root}`); process.exit(1); }

for (const dir of dirs) {
  let files;
  try { files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
  for (const f of files) {
    const rl = createInterface({ input: createReadStream(join(root, dir, f)), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"usage"') || !line.includes('"model"')) continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      const msg = j.message;
      if (!msg?.usage?.output_tokens && !msg?.usage?.input_tokens && !msg?.usage?.cache_read_input_tokens) continue;
      if (!msg.model || msg.model === '<synthetic>') continue;
      if (modelFilter && !msg.model.includes(modelFilter)) continue;
      const id = msg.id || j.uuid;
      if (seen.has(id)) continue;
      seen.add(id);
      const ts = j.timestamp ?? null;
      acc(bucket(perModel, msg.model), msg.usage, ts);
      acc(bucket(perDay, (ts ?? 'unknown').slice(0, 10)), msg.usage, ts);
      acc(bucket(perSession, `${dir}/${basename(f, '.jsonl').slice(0, 8)}`), msg.usage, ts);
    }
  }
}

const fmt = (n) => n.toLocaleString('en-US');
const cost = (m) => {
  if (!Number.isFinite(priceIn)) return '';
  const usd = (m.in / 1e6) * priceIn + (m.out / 1e6) * priceOut
    + (m.cr / 1e6) * priceIn * 0.1 + (m.cw / 1e6) * priceIn * 1.25;
  return ` ~$${usd.toFixed(2)}`;
};
const row = (k, m) =>
  `${k}: calls=${fmt(m.calls)} in=${fmt(m.in)} out=${fmt(m.out)} cacheRead=${fmt(m.cr)} cacheWrite=${fmt(m.cw)}${cost(m)}`;

console.log(`=== per model${modelFilter ? ` (filter: ${modelFilter})` : ''} ===`);
for (const [k, m] of Object.entries(perModel).sort((a, b) => b[1].out - a[1].out)) console.log(row(k, m));
console.log('\n=== per day (UTC) ===');
for (const [k, m] of Object.entries(perDay).sort()) console.log(row(k, m));
if (showSessions) {
  console.log('\n=== per session (UTC range) ===');
  for (const [k, m] of Object.entries(perSession).sort((a, b) => (a[1].first ?? '').localeCompare(b[1].first ?? '')))
    console.log(`${row(k, m)} ${(m.first ?? '?').slice(5, 16)}→${(m.last ?? '?').slice(11, 16)}`);
}
