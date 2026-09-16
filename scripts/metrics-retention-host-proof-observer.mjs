#!/usr/bin/env node
// Canonical source invocation: node --import tsx scripts/metrics-retention-host-proof-observer.mjs
//
// Host-proof observer for the metrics rotation/retention topology
// (STATE-RETENTION-001 own residual). It exercises the PRODUCTION ingress
// (`recordMetric` → size-triggered rotation → retention prune receipt) inside a
// disposable fixture root and never touches the live project state.
//
// Proof-first ordering: this observer encodes the target contract. Until the
// production chain exists it fails with a bounded machine code — that is the
// honest signal, not a defect of the observer. It attests behaviour, never
// intent; a green run means the real chain ran, not that a test passed.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// API names verified against src/core/observability.ts: the writer ingress is
// `metric(name, value, tags)` and the root is bound by `initObservability`.
const OBSERVATION_KIND = 'deckent-metrics-retention-observation-v1';
const FAILURE_KIND = 'deckent-metrics-retention-observation-failure-v1';
const SUCCESS_CHECKS = Object.freeze([
  'size-triggered-rotation',
  'retention-prune-bounded',
  'prune-receipt-typed',
  'active-file-preserved',
]);

const DECKENT_DIR = '.deckent';
const METRICS_FILENAME = 'metrics.jsonl';
// Sprint ids are numeric by contract (`^sprint-\\d+$`, sprint-archive.ts:74);
// a descriptive id makes the archive publisher refuse with INVALID_SPRINT_ID.
const FIXTURE_SPRINT_ID = 'sprint-999999';
// Small ceiling so the fixture crosses it deterministically without writing MBs.
const MAX_SIZE_MB = 0.01;
const KEEP_LAST_N = 2;
const ROTATION_CYCLES = 5;
// Bounded: the amortised check must fire well inside this many appends.
const INGRESS_TRIGGER_MAX_WRITES = 64;

/** Deterministic key-sorted JSON so observation bytes never depend on insertion order. */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

function metricsPath(root) {
  return join(root, DECKENT_DIR, METRICS_FILENAME);
}

/** Bytes past the configured ceiling, written through a plain append. */
function seedOversizeMetrics(root) {
  const path = metricsPath(root);
  const line = `${JSON.stringify({
    type: 'metric',
    name: 'fixture.seed',
    value: 1,
    tags: { sprintId: FIXTURE_SPRINT_ID },
    timestamp: '2026-01-01T00:00:00.000Z',
  })}\n`;
  const target = Math.ceil(MAX_SIZE_MB * 1024 * 1024) + line.length;
  let written = 0;
  while (written <= target) {
    appendFileSync(path, line, 'utf-8');
    written += line.length;
  }
}

function archiveFileCount(root) {
  const dir = join(root, DECKENT_DIR, 'archive', 'sprints', FIXTURE_SPRINT_ID, 'metrics');
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl.gz')).length;
}

async function observe() {
  let stage = 'init';
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'deckent-metrics-retention-proof-'));
  try {
    stage = 'fixture-seed';
    mkdirSync(join(fixtureRoot, DECKENT_DIR), { recursive: true });
    // The ceiling must reach production THROUGH config, not through a caller
    // override — that is the wiring under attestation.
    writeFileSync(join(fixtureRoot, DECKENT_DIR, 'config.json'), JSON.stringify({
      observability: { rotation: { maxSizeMB: MAX_SIZE_MB } },
    }), 'utf-8');

    stage = 'module-load';
    // The production ingress and the retention authority under attestation.
    const observability = await import('../src/core/observability.js');
    const rotation = await import('../src/core/observability-rotation.js');

    // ── Target contract: the size ceiling must be consumed on the WRITE path,
    //    not only at sprint finalize. A missing export is the current reality
    //    and is reported as an unmet contract, never silently skipped.
    stage = 'ingress-contract';
    if (typeof observability.metric !== 'function') return 61;
    if (typeof observability.initObservability !== 'function') return 60;
    if (typeof rotation.shouldRotate !== 'function') return 62;
    if (typeof rotation.enforceRetentionPolicy !== 'function') return 63;

    stage = 'size-trigger';
    observability.initObservability(fixtureRoot, FIXTURE_SPRINT_ID);
    seedOversizeMetrics(fixtureRoot);
    const oversized = statSync(metricsPath(fixtureRoot)).size;
    if (!rotation.shouldRotate(fixtureRoot)) return 64;

    // Production writes must rotate through the ingress itself. The check is
    // amortised by design, so the contract is "within a bounded number of
    // appended bytes after the ceiling is crossed" — never "on the very next
    // append", which would put a stat in the hot telemetry path. This loop is
    // bounded: if rotation has not happened by then, the wiring is absent.
    let rotated = false;
    for (let write = 0; write < INGRESS_TRIGGER_MAX_WRITES; write += 1) {
      observability.metric('fixture.trigger', write, { sprintId: FIXTURE_SPRINT_ID });
      if (statSync(metricsPath(fixtureRoot)).size < oversized) { rotated = true; break; }
    }
    if (!rotated) return 65;
    if (archiveFileCount(fixtureRoot) < 1) return 66;

    stage = 'retention-prune';
    for (let cycle = 0; cycle < ROTATION_CYCLES; cycle += 1) {
      seedOversizeMetrics(fixtureRoot);
      observability.metric('fixture.cycle', cycle, { sprintId: FIXTURE_SPRINT_ID });
    }
    // Retention prunes ARCHIVES; the live file must come through untouched.
    const activeBefore = statSync(metricsPath(fixtureRoot)).size;
    const receipt = rotation.enforceRetentionPolicy(fixtureRoot, {
      keepLastN: KEEP_LAST_N,
      maxSizeMB: MAX_SIZE_MB,
    });
    const activeAfter = statSync(metricsPath(fixtureRoot)).size;

    // Bounded retention: the policy ceiling holds and pruning is not unbounded.
    const remaining = archiveFileCount(fixtureRoot);
    if (remaining > KEEP_LAST_N) return 67;
    if (remaining === 0) return 68;

    stage = 'prune-receipt';
    // Deletion is only legitimate through a typed receipt that names what went.
    if (!receipt || typeof receipt !== 'object') return 69;
    if (!Array.isArray(receipt.pruned)) return 70;
    if (typeof receipt.policy !== 'object' || receipt.policy === null) return 71;
    if (receipt.legalHold !== false && receipt.legalHold !== true) return 72;

    stage = 'active-file-preserved';
    // The live metrics file must survive retention untouched: only archives are
    // prunable. Size-equality is the exact assertion — "still exists" alone
    // would pass even if retention had truncated it.
    if (!existsSync(metricsPath(fixtureRoot))) return 73;
    if (activeAfter !== activeBefore) return 74;

    process.stdout.write(canonicalJson({
      checks: SUCCESS_CHECKS,
      kind: OBSERVATION_KIND,
      outcome: 'observed',
      version: 1,
    }));
    return 0;
  } catch (error) {
    // Keep the stdout success protocol exact. Report only bounded machine codes,
    // never a stack/message which could carry source data or private paths.
    const code = error && typeof error === 'object' ? error.code : undefined;
    process.stderr.write(`${canonicalJson({
      kind: FAILURE_KIND,
      stage,
      reasonCode: 'METRICS_RETENTION_OBSERVER_EXCEPTION',
      errorCode: typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/u.test(code)
        ? code : 'UNCLASSIFIED',
    })}\n`);
    return 75;
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

process.exitCode = await observe();
