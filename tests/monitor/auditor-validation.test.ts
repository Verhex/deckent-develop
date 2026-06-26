// tests/monitor/auditor-validation.test.ts
// Sprint 326 Task 6.1 — Auditor second-layer validation + finding-ledger lifecycle.
// Spec §"Auditor — second-layer validation (event-driven, finding-lifecycle)".
// ADR-003: vitest. Hermetic — all I/O under os.tmpdir(), torn down in afterEach.
//
// Faithful RED proof: before src/monitor/finding-ledger.ts + validateArtifactOnWrite existed,
// these imports fail to resolve → the suite is RED. With the modules present it is GREEN.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  validateArtifactOnWrite,
} from '../../src/monitor/auditor.js';
import {
  openFinding,
  recheckFinding,
  closeFinding,
  getFinding,
  loadFindings,
  findingsPath,
  findingId,
  type FindingLedger,
} from '../../src/monitor/finding-ledger.js';

const SPRINT = 'sprint-326';

/** A complete, contract-valid TaskResultV1 fixture (passes validateTaskResult). */
function validResult(taskId: string): Record<string, unknown> {
  return {
    taskId,
    workerId: `w-${taskId}`,
    provider: 'claude',
    model: 'opus',
    filesChanged: [
      { path: 'src/a.ts', status: 'modified', linesAdded: 3, linesRemoved: 1 },
    ],
    totalLinesAdded: 3,
    totalLinesRemoved: 1,
    tokenUsage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      source: 'provider-adapter',
    },
    cost: { usd: 0.01, pricingSource: 'registry' },
    tests: { passed: 1, failed: 0, total: 1 },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE',
  };
}

/** The same fixture with a required field removed → validates INCOMPLETE. */
function incompleteResult(taskId: string): Record<string, unknown> {
  const r = validResult(taskId);
  delete r.totalLinesAdded; // required number, no default → missing
  return r;
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-findings-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('finding-ledger primitives', () => {
  it('open → persists an open finding to .deckent/findings/<sprint>.json', () => {
    const f = openFinding(root, SPRINT, '326-012', 'result', ['totalLinesAdded'], '2026-06-26T10:00:00.000Z');
    expect(f.status).toBe('open');
    expect(f.missingFields).toEqual(['totalLinesAdded']);
    expect(f.rechecks).toBe(0);
    expect(f.openedAt).toBe('2026-06-26T10:00:00.000Z');
    expect(f.closedAt).toBeUndefined();

    // Persisted at the spec'd path.
    const path = findingsPath(root, SPRINT);
    expect(path.endsWith(join('.deckent', 'findings', `${SPRINT}.json`))).toBe(true);
    expect(existsSync(path)).toBe(true);

    const ledger = JSON.parse(readFileSync(path, 'utf-8')) as FindingLedger;
    expect(ledger.sprintId).toBe(SPRINT);
    expect(ledger.findings).toHaveLength(1);
    expect(ledger.findings[0]?.taskId).toBe('326-012');
  });

  it('open is idempotent — re-opening the same artifact preserves openedAt + does not duplicate', () => {
    openFinding(root, SPRINT, 'T', 'result', ['a'], '2026-06-26T10:00:00.000Z');
    const second = openFinding(root, SPRINT, 'T', 'result', ['a', 'b'], '2026-06-26T11:00:00.000Z');
    expect(second.openedAt).toBe('2026-06-26T10:00:00.000Z'); // preserved
    expect(second.missingFields).toEqual(['a', 'b']); // refreshed
    expect(loadFindings(root, SPRINT).findings).toHaveLength(1); // no duplicate
  });

  it('recheck increments rechecks + keeps the finding open; close marks closed', () => {
    openFinding(root, SPRINT, 'T', 'result', ['a']);
    const re = recheckFinding(root, SPRINT, 'T', 'result', ['a']);
    expect(re?.rechecks).toBe(1);
    expect(re?.status).toBe('open');

    const closed = closeFinding(root, SPRINT, 'T', 'result', '2026-06-26T12:00:00.000Z');
    expect(closed.status).toBe('closed');
    expect(closed.closedAt).toBe('2026-06-26T12:00:00.000Z');
    expect(closed.rechecks).toBe(1); // carried forward
    expect(closed.missingFields).toEqual([]);
  });

  it('recheck on a non-existent finding is a no-op (undefined)', () => {
    expect(recheckFinding(root, SPRINT, 'missing', 'result')).toBeUndefined();
  });

  it('findingId is stable + unique per (taskId, artifact)', () => {
    expect(findingId('T', 'result')).toBe('finding-T-result');
    expect(findingId('T', 'log')).toBe('finding-T-log');
    expect(findingId('T', 'result')).not.toBe(findingId('T', 'log'));
  });
});

describe('validateArtifactOnWrite — event-driven finding lifecycle', () => {
  it('INCOMPLETE result → opens a finding + reports INCOMPLETE with missingFields', () => {
    const report = validateArtifactOnWrite(root, SPRINT, '326-012', 'result', incompleteResult('326-012'));

    expect(report.status).toBe('INCOMPLETE');
    expect(report.validated).toBe(true);
    expect(report.missingFields).toContain('totalLinesAdded');
    expect(report.findingId).toBe('finding-326-012-result');

    const finding = getFinding(root, SPRINT, '326-012', 'result');
    expect(finding?.status).toBe('open');
    expect(finding?.missingFields).toContain('totalLinesAdded');
  });

  it('after the field is filled, a recheck of THAT result closes the finding (tracked to resolution)', () => {
    // 1st write event — INCOMPLETE → opens the finding.
    validateArtifactOnWrite(root, SPRINT, '326-012', 'result', incompleteResult('326-012'));
    expect(getFinding(root, SPRINT, '326-012', 'result')?.status).toBe('open');

    // Orchestrator re-derives the result (field now present) → recheck of THAT artifact.
    const report = validateArtifactOnWrite(root, SPRINT, '326-012', 'result', validResult('326-012'));

    expect(report.status).toBe('OK');
    expect(report.validated).toBe(true);

    const finding = getFinding(root, SPRINT, '326-012', 'result');
    expect(finding?.status).toBe('closed');
    expect(finding?.closedAt).toBeDefined();
    expect(finding?.rechecks).toBeGreaterThanOrEqual(1); // the resolving recheck was counted
  });

  it('a separate OK result is validated ONCE and never re-checked', () => {
    // 1st write event — OK → validated, recorded as a closed (clean) finding.
    const first = validateArtifactOnWrite(root, SPRINT, '326-099', 'result', validResult('326-099'));
    expect(first.status).toBe('OK');
    expect(first.validated).toBe(true);
    expect(getFinding(root, SPRINT, '326-099', 'result')?.status).toBe('closed');

    // 2nd write event for the SAME artifact — must NOT re-validate (OK never re-checked).
    const second = validateArtifactOnWrite(root, SPRINT, '326-099', 'result', validResult('326-099'));
    expect(second.status).toBe('OK');
    expect(second.validated).toBe(false); // skipped — not re-checked
  });

  it('the ledger tracks the artifact open → closed across the full lifecycle', () => {
    validateArtifactOnWrite(root, SPRINT, 'L', 'result', incompleteResult('L'));
    expect(getFinding(root, SPRINT, 'L', 'result')?.status).toBe('open');

    validateArtifactOnWrite(root, SPRINT, 'L', 'result', validResult('L'));
    expect(getFinding(root, SPRINT, 'L', 'result')?.status).toBe('closed');

    // Exactly one finding entry for the artifact — no duplication across the lifecycle.
    const matching = loadFindings(root, SPRINT).findings.filter(
      (f) => f.taskId === 'L' && f.artifact === 'result',
    );
    expect(matching).toHaveLength(1);
  });

  it('result and log artifacts of the same task are tracked independently', () => {
    validateArtifactOnWrite(root, SPRINT, 'M', 'result', incompleteResult('M'));
    // A custom validator stands in for the log schema (phase 4) — here it reports OK.
    const logReport = validateArtifactOnWrite(root, SPRINT, 'M', 'log', { any: 'shape' }, {
      validate: () => ({ ok: true }),
    });

    expect(logReport.status).toBe('OK');
    expect(getFinding(root, SPRINT, 'M', 'result')?.status).toBe('open');
    expect(getFinding(root, SPRINT, 'M', 'log')?.status).toBe('closed');
  });
});
