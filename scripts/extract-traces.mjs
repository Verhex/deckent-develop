// scripts/extract-traces.mjs
// ═══ SP-2 Phase 2 — CC-transcript → JSONL corpora driver ════════════════════
// Reads the Claude-Code session transcripts and writes two OpenAI-messages
// corpora to .deckent/traces/ (gitignored): extracted-aligned.jsonl (core-4
// remapped to deckent natives) + extracted-general.jsonl (all, general distil).
// Build-gated: imports the compiled extractor from dist/. Skip-safe (exit 0)
// when the CC dir or dist build is missing, so a pre-build run does not false-red.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const ccDir = process.env['DECKENT_CC_DIR'] ?? join(homedir(), '.claude', 'projects', '-home-alperen-deckent-dev');
if (!existsSync(ccDir)) {
  console.log(`SKIP: CC transcripts dir not found (${ccDir}) — set DECKENT_CC_DIR`);
  process.exit(0);
}

const distExtractor = resolve('dist/training/cc-trace-extractor.js');
if (!existsSync(distExtractor)) {
  console.log('SKIP: dist/training/cc-trace-extractor.js not found — run npm run build first');
  process.exit(0);
}

const { extractFromSession } = await import('../dist/training/cc-trace-extractor.js');
const { composeSystemPrompt } = await import('../dist/agent/identity.js');

const system = composeSystemPrompt({ cwd: process.cwd(), lang: 'tr' });

const files = readdirSync(ccDir).filter((f) => f.endsWith('.jsonl'));
let scanned = 0;
const aligned = [];
const general = [];
for (const f of files) {
  let lines;
  try {
    lines = readFileSync(join(ccDir, f), 'utf-8').split('\n').filter((l) => l.trim().length > 0);
  } catch {
    continue; // unreadable file — skip, keep going
  }
  scanned += 1;
  const r = extractFromSession(lines, system);
  aligned.push(...r.aligned);
  general.push(...r.general);
}

const outDir = join(process.cwd(), '.deckent', 'traces');
mkdirSync(outDir, { recursive: true });
const alignedPath = join(outDir, 'extracted-aligned.jsonl');
const generalPath = join(outDir, 'extracted-general.jsonl');
writeFileSync(alignedPath, aligned.map((e) => JSON.stringify(e)).join('\n') + (aligned.length ? '\n' : ''), 'utf-8');
writeFileSync(generalPath, general.map((e) => JSON.stringify(e)).join('\n') + (general.length ? '\n' : ''), 'utf-8');

console.log(`extract-traces: scanned ${scanned}/${files.length} session files`);
console.log(`  aligned : ${aligned.length} examples → ${alignedPath}`);
console.log(`  general : ${general.length} examples → ${generalPath}`);
process.exit(0);
