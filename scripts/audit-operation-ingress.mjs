#!/usr/bin/env node
// ═══ audit-operation-ingress — OPERATION-001 O3 ratchet gate ════════
//
// The operation catalog (O1) declares canonical operations — op.fs.write,
// op.fs.delete, … — with a gate, risk and capability each. OPERATION-001 O3
// incrementally closes the gap between that catalog and production effects.
//
// This fail-closed gate covers the owner-approved fs-write+delete family. Its
// default and --write modes retain the historical report/baseline behavior;
// --check compares the live src/ surface with the committed schema-v1 baseline.
// The ratchet rejects either new unmediated sites or lost mediated coverage and
// identifies per-file unmediated growth so the drift can be fixed directly.
//
// The effect-site definition is owner-approved and frozen into the baseline:
// the fs-write+delete verbs below. op.memory.* and op.fs.read are later slices;
// changing that definition is outside this OPERATION-001 ratchet slice.

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

export function loadOperationIngressBaseline(path = BASELINE) {
  const baseline = JSON.parse(readFileSync(path, 'utf-8'));
  if (
    baseline === null
    || typeof baseline !== 'object'
    || baseline.schemaVersion !== 1
    || !Number.isInteger(baseline.mediated)
    || baseline.mediated < 0
    || !Number.isInteger(baseline.unmediated)
    || baseline.unmediated < 0
    || baseline.byFile === null
    || typeof baseline.byFile !== 'object'
    || Array.isArray(baseline.byFile)
  ) {
    throw new Error('expected schemaVersion 1 with non-negative mediated/unmediated counts and byFile');
  }
  return baseline;
}

function gainedUnmediatedSites(report, baseline) {
  const gains = [];
  for (const [file, current] of Object.entries(report.byFile)) {
    if (current.mediated) continue;
    const prior = baseline.byFile[file];
    const priorUnmediated = prior
      && typeof prior === 'object'
      && prior.mediated === false
      && Number.isInteger(prior.count)
      && prior.count >= 0
      ? prior.count
      : 0;
    if (current.count > priorUnmediated) {
      gains.push({
        file,
        gained: current.count - priorUnmediated,
        baseline: priorUnmediated,
        live: current.count,
      });
    }
  }
  return gains;
}

export function evaluateOperationIngressRatchet(report, baseline) {
  return {
    unmediatedRegression: report.unmediated > baseline.unmediated,
    mediatedRegression: report.mediated < baseline.mediated,
    unmediatedGains: gainedUnmediatedSites(report, baseline),
  };
}

function runCheck(report) {
  let baseline;
  try {
    baseline = loadOperationIngressBaseline();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `[operation-ingress] FAIL BASELINE_INVALID: unable to load schema-v1 baseline: ${detail}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const { unmediatedRegression, mediatedRegression, unmediatedGains } =
    evaluateOperationIngressRatchet(report, baseline);
  if (!unmediatedRegression && !mediatedRegression) {
    process.stdout.write(
      `[operation-ingress] PASS OPERATION-001 ratchet: unmediated=${report.unmediated} `
      + `(baseline=${baseline.unmediated}) mediated=${report.mediated} `
      + `(baseline=${baseline.mediated})\n`,
    );
    return;
  }

  process.stderr.write(
    `[operation-ingress] FAIL OPERATION_INGRESS_RATCHET_VIOLATION: `
    + `unmediated=${report.unmediated} (baseline=${baseline.unmediated}); `
    + `mediated=${report.mediated} (baseline=${baseline.mediated})\n`,
  );
  if (unmediatedRegression) {
    for (const gain of unmediatedGains) {
      process.stderr.write(
        `[operation-ingress] UNMEDIATED_DRIFT ${gain.file}: +${gain.gained} `
        + `(baseline=${gain.baseline}, live=${gain.live})\n`,
      );
    }
  }
  if (mediatedRegression) {
    process.stderr.write(
      `[operation-ingress] MEDIATED_COVERAGE_REGRESSION: -${baseline.mediated - report.mediated} `
      + `(baseline=${baseline.mediated}, live=${report.mediated})\n`,
    );
  }
  process.exitCode = 1;
}

const invokedDirectly = (() => {
  try { return fileURLToPath(import.meta.url) === (process.argv[1] ?? ''); } catch { return false; }
})();

if (invokedDirectly) {
  const report = auditOperationIngress();
  const checkMode = process.argv.includes('--check');
  const writeMode = process.argv.includes('--write');
  if (checkMode) {
    runCheck(report);
  } else {
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
}
