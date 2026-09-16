#!/usr/bin/env node
// scripts/security/secret-baseline.mjs
// Sprint 169 H3 — OSS Pre-Flip Secret Scan Baseline
// 10 regex pattern across tracked files. Allowlist hits via .secrets-baseline (file, hash) tuples.
// Usage:
//   node scripts/security/secret-baseline.mjs                  # check mode (exit 1 on unallowlisted hits)
//   node scripts/security/secret-baseline.mjs --build-baseline # rebuild allowlist from current hits

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

const PATTERNS = [
  { name: 'AWS_ACCESS_KEY', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS_SECRET', regex: /(?:aws_secret|secret_access_key)[\s'"=:]+[A-Za-z0-9/+=]{40}/gi },
  { name: 'GITHUB_PAT', regex: /gh[pousr]_[A-Za-z0-9]{36,255}/g },
  { name: 'OPENAI_KEY', regex: /sk-(?:proj-)?[A-Za-z0-9_-]{40,}/g },
  { name: 'ANTHROPIC_KEY', regex: /sk-ant-[A-Za-z0-9_-]{40,}/g },
  { name: 'GOOGLE_API_KEY', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'DISCORD_TOKEN', regex: /(?:bot\s+)?[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}/gi },
  { name: 'TELEGRAM_TOKEN', regex: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g },
  { name: 'PRIVATE_KEY', regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g },
  { name: 'ENV_VALUE', regex: /^\s*[A-Z_]+_(?:TOKEN|KEY|SECRET|PASSWORD)\s*=\s*[A-Za-z0-9_-]{16,}/gm },
];

const SKIP_PREFIXES = ['node_modules/', 'dist/', '.brain/memory.db'];
const SKIP_SUFFIXES = ['.lock', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.mp4', '.webp', '.db'];
const SKIP_EXACT = new Set([
  '.secrets-baseline',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB cap to keep scan fast and avoid binaries

function loadBaseline() {
  if (!existsSync('.secrets-baseline')) return { allowlist: [] };
  try {
    return JSON.parse(readFileSync('.secrets-baseline', 'utf-8'));
  } catch (err) {
    console.error(`[secret-baseline] failed to parse .secrets-baseline: ${err.message}`);
    process.exit(2);
  }
}

function simpleHash(s) {
  let h = 0;
  for (const c of s) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return h.toString(16);
}

function lineOf(content, idx) {
  return content.slice(0, idx).split('\n').length;
}

function shouldSkip(file) {
  if (SKIP_EXACT.has(file)) return true;
  for (const p of SKIP_PREFIXES) if (file.startsWith(p)) return true;
  for (const s of SKIP_SUFFIXES) if (file.endsWith(s)) return true;
  return false;
}

function listTrackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n')
      .filter((f) => f.length > 0);
  } catch (err) {
    console.error(`[secret-baseline] git ls-files failed: ${err.message}`);
    process.exit(2);
  }
}

function scan(mode) {
  const baseline = loadBaseline();
  // build-baseline collects ALL matches so the rebuilt file is complete (idempotent re-runs safe)
  const allowed = mode === 'build-baseline'
    ? new Set()
    : new Set(baseline.allowlist.map((a) => `${a.file}:${a.hash}`));
  const tracked = listTrackedFiles();

  const hits = [];
  for (const file of tracked) {
    if (shouldSkip(file)) continue;
    let st;
    try { st = statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    if (st.size > MAX_FILE_BYTES) continue;

    let content;
    try { content = readFileSync(file, 'utf-8'); } catch { continue; }
    if (content.indexOf('\0') !== -1) continue; // binary heuristic

    for (const { name, regex } of PATTERNS) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const hash = simpleHash(match[0]);
        const key = `${file}:${hash}`;
        if (allowed.has(key)) continue;
        hits.push({ file, pattern: name, line: lineOf(content, match.index), hash });
      }
    }
  }

  if (mode === 'build-baseline') {
    const allowlist = hits.map((h) => ({ file: h.file, pattern: h.pattern, hash: h.hash, note: 'baseline-build' }));
    const payload = {
      _comment: 'Secret scan allowlist — Sprint 169 H3. Each entry permits a specific (file, hash) match. Review on every change.',
      builtAt: new Date().toISOString(),
      allowlist,
    };
    writeFileSync('.secrets-baseline', JSON.stringify(payload, null, 2) + '\n');
    console.log(`[secret-baseline] built: ${allowlist.length} allowlist entries.`);
    process.exit(0);
  }

  if (hits.length > 0) {
    console.error(`[secret-baseline] SECRETS DETECTED (${hits.length} unallowlisted hit${hits.length === 1 ? '' : 's'}):`);
    for (const h of hits) console.error(`  ${h.file}:${h.line} [${h.pattern}] hash=${h.hash}`);
    console.error('');
    console.error('If these are real secrets: rotate them and remove from history.');
    console.error('If these are test fixtures: rerun with --build-baseline (only after manual review).');
    process.exit(1);
  }

  console.log(`[secret-baseline] no unallowlisted secrets in ${tracked.length} tracked files.`);
  process.exit(0);
}

const mode = process.argv[2] === '--build-baseline' ? 'build-baseline' : 'check';
scan(mode);
