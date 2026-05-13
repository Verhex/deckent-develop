/**
 * tests/audit/worker-brain-audit-parity.test.ts
 *
 * Sprint 165 Task 3 (Bug Z) — Worker ↔ Brain audit parity tests.
 *
 * Root cause: src/orchestra/baseline-tracker.ts::parseVitestOutput uses a
 * loose regex `(\d+)\s+failed` that matches the first "N failed" anywhere
 * in vitest output — typically the `Test Files  1 failed | 742 passed (743)`
 * line — instead of the Tests summary line. When file fail count differs
 * from test fail count, Brain's gate reports the file count, while worker
 * (running its own `npx vitest run`) sees the test count → permanent
 * vitestDelta.fail = 1 even when worker fixed all the failures it was
 * responsible for.
 *
 * Fix surface: a corrected audit helper in src/monitor/auditor.ts
 * (`runVitestAuditGate`) — same suite (npx vitest run), JSON reporter
 * preferred (no regex ambiguity), text footer fallback uses
 * `parseVitestBaselineOutput` which constrains to the Tests line only.
 *
 * Parity tests verify:
 *  (a) audit helper output equals worker fail count for the same suite
 *  (b) audit helper is idempotent (same output across N runs)
 *  (c) delta calculation produces correct sign when baseline differs
 *  (d) race-condition guard: parser is pure (no global state, no I/O)
 */

import { describe, it, expect } from 'vitest';
import {
  parseVitestBaselineOutput,
  computeVitestDelta,
  runVitestAuditGate,
  type AuditGateBaseline,
} from '../../src/monitor/auditor.js';

describe('Bug Z parity — parseVitestBaselineOutput vs raw output', () => {
  // ─── Real vitest output captured Sprint 165 (May 2026) ────────────
  // Note the "Test Files 1 failed" vs "Tests 2 failed" mismatch — this
  // is the exact pattern that breaks baseline-tracker's loose regex.
  const REAL_OUTPUT = [
    ' Test Files  1 failed | 742 passed (743)',
    '      Tests  2 failed | 16253 passed | 66 skipped (16321)',
    '   Start at  10:34:56',
    '   Duration  32.41s',
  ].join('\n');

  it('parity (a) — parser reads Tests line (2 failed), NOT Test Files line (1 failed)', () => {
    const parsed = parseVitestBaselineOutput(REAL_OUTPUT, '');
    expect(parsed.parseOk).toBe(true);
    expect(parsed.testFailed).toBe(2); // ← worker sees 2, audit must too
    expect(parsed.testPassed).toBe(16253);
    expect(parsed.testCount).toBe(16321);
  });

  it('parity (a-edge) — file fail > test fail (impossible in vitest but regex must still target Tests)', () => {
    // Synthetic: if Test Files claimed 5 failed but Tests claimed 0,
    // parser must report 0 (Tests is authority), not 5.
    const synthetic = [
      ' Test Files  5 failed | 740 passed (745)',
      '      Tests  0 failed | 16321 passed (16321)',
    ].join('\n');
    const parsed = parseVitestBaselineOutput(synthetic, '');
    expect(parsed.testFailed).toBe(0);
  });

  it('parity (a-clean) — all-pass run reports 0 failures', () => {
    const clean = [
      ' Test Files  743 passed (743)',
      '      Tests  16321 passed | 66 skipped (16321)',
    ].join('\n');
    const parsed = parseVitestBaselineOutput(clean, '');
    expect(parsed.parseOk).toBe(true);
    expect(parsed.testFailed).toBe(0);
    expect(parsed.testPassed).toBe(16321);
  });
});

describe('Bug Z parity — idempotency', () => {
  it('parity (b) — parser produces identical output across 5 successive calls', () => {
    const output = [
      ' Test Files  1 failed | 742 passed (743)',
      '      Tests  2 failed | 16253 passed | 66 skipped (16321)',
    ].join('\n');

    const runs = Array.from({ length: 5 }, () => parseVitestBaselineOutput(output, ''));

    // All runs must be deep-equal — proves parser is pure
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
    expect(runs[0]!.testFailed).toBe(2);
  });

  it('parity (b-no-side-effect) — calling parser does not mutate input strings', () => {
    const stdout = ' Tests  3 failed | 100 passed (103)';
    const stderr = '';
    const stdoutCopy = stdout;
    const stderrCopy = stderr;

    parseVitestBaselineOutput(stdout, stderr);
    parseVitestBaselineOutput(stdout, stderr);

    expect(stdout).toBe(stdoutCopy);
    expect(stderr).toBe(stderrCopy);
  });
});

describe('Bug Z parity — delta calculation', () => {
  it('parity (c) — delta.fail = current - baseline (positive when regression)', () => {
    const baseline: AuditGateBaseline = {
      testCount: 100, testPassed: 98, testFailed: 2, testSkipped: 0,
    };
    const current: AuditGateBaseline = {
      testCount: 100, testPassed: 95, testFailed: 5, testSkipped: 0,
    };
    const delta = computeVitestDelta(baseline, current);
    expect(delta.fail).toBe(3); // 5 - 2 = 3 new failures
    expect(delta.pass).toBe(-3);
  });

  it('parity (c-zero) — delta.fail = 0 when current matches baseline', () => {
    const baseline: AuditGateBaseline = {
      testCount: 16321, testPassed: 16253, testFailed: 2, testSkipped: 66,
    };
    const current: AuditGateBaseline = { ...baseline };
    const delta = computeVitestDelta(baseline, current);
    expect(delta.fail).toBe(0);
    expect(delta.pass).toBe(0);
  });

  it('parity (c-regression) — delta.fail negative when fixes occurred', () => {
    const baseline: AuditGateBaseline = {
      testCount: 100, testPassed: 80, testFailed: 20, testSkipped: 0,
    };
    const current: AuditGateBaseline = {
      testCount: 100, testPassed: 100, testFailed: 0, testSkipped: 0,
    };
    const delta = computeVitestDelta(baseline, current);
    expect(delta.fail).toBe(-20); // worker fixed 20 failures
  });

  it('parity (c-null-baseline) — when baseline is null, delta == current (no comparison)', () => {
    const current: AuditGateBaseline = {
      testCount: 100, testPassed: 95, testFailed: 5, testSkipped: 0,
    };
    const delta = computeVitestDelta(null, current);
    expect(delta.fail).toBe(5);
    expect(delta.pass).toBe(95);
  });
});

describe('Bug Z parity — race condition guard (parser purity)', () => {
  it('parity (d) — concurrent parser invocations do not interfere', async () => {
    const outputs = [
      '      Tests  0 failed | 100 passed (100)',
      '      Tests  1 failed | 99 passed (100)',
      '      Tests  2 failed | 98 passed (100)',
      '      Tests  3 failed | 97 passed (100)',
      '      Tests  4 failed | 96 passed (100)',
    ];

    // Fire all parses in parallel — pure function must yield independent results
    const promises = outputs.map((out, i) =>
      Promise.resolve(parseVitestBaselineOutput(out, '')).then(r => ({ idx: i, r })),
    );
    const results = await Promise.all(promises);

    for (let i = 0; i < outputs.length; i++) {
      expect(results[i]!.r.testFailed).toBe(i);
    }
  });

  it('parity (d-stateless) — runVitestAuditGate accepts injected gather fn (no shared state)', async () => {
    // Inject a fake gather that returns deterministic counts
    const result = await runVitestAuditGate({
      projectRoot: '/nonexistent',
      sprintId: 'sprint-test',
      gatherFn: () => ({
        status: 'OK',
        testCount: 16321,
        testPassed: 16253,
        testFailed: 2,
        testSkipped: 66,
        exitCode: 1,
        attempts: 1,
        stderrTail: '',
        failureReason: '',
      }),
      readBaselineFn: () => null, // no prior baseline
    });

    expect(result.status).toBe('OK');
    expect(result.current.testFailed).toBe(2);
    expect(result.delta.fail).toBe(2); // no baseline → delta = current
  });
});

describe('Bug Z parity — runVitestAuditGate end-to-end with baseline', () => {
  it('worker-brain parity: same fail count emerges from same suite output', async () => {
    // Worker observed: Tests 2 failed | 16253 passed | 66 skipped (16321)
    // Brain audit MUST agree (this is the Sprint 165 contract).
    const result = await runVitestAuditGate({
      projectRoot: '/nonexistent',
      sprintId: 'sprint-165',
      gatherFn: () => ({
        status: 'OK',
        testCount: 16321,
        testPassed: 16253,
        testFailed: 2,
        testSkipped: 66,
        exitCode: 1,
        attempts: 1,
        stderrTail: '',
        failureReason: '',
      }),
      readBaselineFn: () => ({
        testCount: 16321, testPassed: 16253, testFailed: 2, testSkipped: 66,
      }),
    });

    // No regression — fail count matches baseline
    expect(result.delta.fail).toBe(0);
    expect(result.gateStatus).toBe('PASS');
  });

  it('regression detected: baseline fail=0, current fail=2 → GATE_FAILURE', async () => {
    const result = await runVitestAuditGate({
      projectRoot: '/nonexistent',
      sprintId: 'sprint-165',
      gatherFn: () => ({
        status: 'OK',
        testCount: 100, testPassed: 98, testFailed: 2, testSkipped: 0,
        exitCode: 1, attempts: 1, stderrTail: '', failureReason: '',
      }),
      readBaselineFn: () => ({
        testCount: 100, testPassed: 100, testFailed: 0, testSkipped: 0,
      }),
    });

    expect(result.delta.fail).toBe(2);
    expect(result.gateStatus).toBe('GATE_FAILURE');
  });

  it('worker fixed regressions: baseline fail=17, current fail=0 → PASS (negative delta)', async () => {
    // Sprint 164 T-003 scenario: worker reported "delta.fail: 17 → 0".
    // Audit gate must agree this is PASS, not GATE_FAILURE.
    const result = await runVitestAuditGate({
      projectRoot: '/nonexistent',
      sprintId: 'sprint-164',
      gatherFn: () => ({
        status: 'OK',
        testCount: 16321, testPassed: 16321, testFailed: 0, testSkipped: 0,
        exitCode: 0, attempts: 1, stderrTail: '', failureReason: '',
      }),
      readBaselineFn: () => ({
        testCount: 16321, testPassed: 16304, testFailed: 17, testSkipped: 0,
      }),
    });

    expect(result.delta.fail).toBe(-17);
    expect(result.gateStatus).toBe('PASS');
  });

  it('gather failure (SPAWN_FAIL) → gate INCONCLUSIVE, not GATE_FAILURE', async () => {
    // Sprint 156 T-005 lesson: subprocess failure must not masquerade as test failure
    const result = await runVitestAuditGate({
      projectRoot: '/nonexistent',
      sprintId: 'sprint-x',
      gatherFn: () => ({
        status: 'SPAWN_FAIL',
        testCount: 0, testPassed: 0, testFailed: 0, testSkipped: 0,
        exitCode: null, attempts: 2, stderrTail: 'ENOENT', failureReason: 'spawn failed',
      }),
      readBaselineFn: () => null,
    });

    expect(result.status).toBe('SPAWN_FAIL');
    expect(result.gateStatus).toBe('INCONCLUSIVE');
  });
});
