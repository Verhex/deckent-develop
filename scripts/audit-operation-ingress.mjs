#!/usr/bin/env node
// ═══ audit-operation-ingress — OPERATION-001 O3 (report-only baseline) ══════
//
// The operation catalog (O1) declares canonical operations — op.fs.write,
// op.fs.delete, … — with a gate, risk and capability each. But NOTHING in
// production resolves an actual effect through `resolveOperation`: the catalog
// exists, ingress enforcement does not (catalog presence ≠ enforcement).
//
// This audit MEASURES that gap for the fs-write+delete family (the owner-
// approved first scope, 2026-08-08 Q&A). It is deliberately REPORT-ONLY —
// it is NOT wired into `lint:gates` and never fails the build. Its jobs:
//   1. Turn "108-ish?" into an exact, tracked count of fs-write/delete call
//      sites in src/ production code.
//   2. Separate catalog-MEDIATED sites (a file that imports and calls
//      resolveOperation) from UNMEDIATED ones — today mediated is 0.
//   3. Write a stable baseline the successor CI-ratchet slice inherits.
//
// The effect-site definition is owner-approved and frozen into the baseline:
// the fs-write+delete verbs below. op.memory.* and op.fs.read are later slices;
// turning this into a CI-blocking ratchet is an explicit typed-residual on
// OPERATION-001, not this slice.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, 'scripts', 'operation-ingress-baseline.json');

// Owner-approved fs-write+delete effect verbs (2026-08-08 Q&A). Matched as a
// call — `verb(` — so a bare identifier in prose/type position does not count.
const EFFECT_VERBS = [
  'writeFile', 'writeFileSync',
  'appendFile', 'appendFileSync',
  'unlink', 'unlinkSync',
  'rm', 'rmSync',
  'rmdir', 'rmdirSync',
];
const EFFECT_CALL_RE = new RegExp(`\\b(${EFFECT_VERBS.join('|')})\\s*\\(`, 'g');

/** A file is catalog-MEDIATED when it imports the operation catalog and calls
 *  resolveOperation — the only structural signal available today that an effect
 *  is being routed through the canonical vocabulary. */
function isMediatedFile(source) {
  return /from ['"][^'"]*operation-catalog[^'"]*['"]/.test(source)
    && /\bresolveOperation\s*\(/.test(source);
}

function collectTsFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectTsFiles(full, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip line-comments and block-comments so a commented-out `writeFileSync(`
 *  is not counted as a live effect site. Cheap, not a full parser — good enough
 *  for a call-shaped verb match. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function auditOperationIngress() {
  const files = collectTsFiles(SRC).sort();
  const byFile = {};
  let unmediated = 0;
  let mediated = 0;
  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const source = stripComments(raw);
    const matches = source.match(EFFECT_CALL_RE);
    const count = matches ? matches.length : 0;
    if (count === 0) continue;
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const fileMediated = isMediatedFile(source);
    byFile[rel] = { count, mediated: fileMediated };
    if (fileMediated) mediated += count;
    else unmediated += count;
  }
  const orderedByFile = Object.fromEntries(Object.entries(byFile).sort(([a], [b]) => a.localeCompare(b)));
  const digestSource = JSON.stringify(Object.entries(orderedByFile).map(([f, v]) => `${f}:${v.count}:${v.mediated}`));
  const digest = createHash('sha256').update(digestSource).digest('hex');
  return {
    schemaVersion: 1,
    family: 'fs-write+delete',
    verbs: EFFECT_VERBS,
    total: mediated + unmediated,
    mediated,
    unmediated,
    fileCount: Object.keys(orderedByFile).length,
    byFile: orderedByFile,
    digest,
  };
}

const invokedDirectly = (() => {
  try { return fileURLToPath(import.meta.url) === (process.argv[1] ?? ''); } catch { return false; }
})();

if (invokedDirectly) {
  const report = auditOperationIngress();
  const writeMode = process.argv.includes('--write');
  process.stdout.write(
    `[operation-ingress] fs-write+delete effect sites in src/: total=${report.total} `
    + `mediated=${report.mediated} unmediated=${report.unmediated} `
    + `across ${report.fileCount} file(s) · digest=${report.digest.slice(0, 12)}\n`,
  );
  process.stdout.write(
    `[operation-ingress] REPORT-ONLY — this audit never fails the build. `
    + `${report.mediated} of ${report.total} sites route through the operation catalog `
    + `(resolveOperation); the rest are unmediated (OPERATION-001 O3 residual: wire ingress + a CI ratchet).\n`,
  );
  if (writeMode) {
    writeFileSync(BASELINE, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[operation-ingress] baseline written → ${relative(ROOT, BASELINE)}\n`);
  } else if (existsSync(BASELINE)) {
    const prior = JSON.parse(readFileSync(BASELINE, 'utf-8'));
    if (prior.digest !== report.digest) {
      process.stdout.write(
        `[operation-ingress] NOTE: live surface drifted from the baseline `
        + `(baseline total=${prior.total}/digest=${String(prior.digest).slice(0, 12)}). `
        + `This is advisory only — refresh with \`node scripts/audit-operation-ingress.mjs --write\`.\n`,
      );
    }
  }
}
