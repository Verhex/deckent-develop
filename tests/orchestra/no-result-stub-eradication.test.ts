// ─── No-Result Stub Eradication Tests ────────────────────────────────────
// Sprint 165 Task 1 (Bug X): Brain "no-result → CODE_VERIFIED_DONE" stub
// eradication. Sprint 156-011 CRITICAL debt reproduce on Sprint 164.
//
// The bug: when a worker dies (Docker HB shutdown, OOM) without writing .result,
// Brain previously wrote a stub:
//   { linesAdded: 0, testsPassed: false, selfAssessment: 'DONE',
//     codeVerified: 'CODE_VERIFIED_DONE', notes: 'Code physically verified...' }
// This treated dead workers as successful. The fix: an honest gate that
// forces NO_GO whenever (linesAdded === 0 && testsPassed === false) even
// when selfAssessment claims DONE, regardless of any codeVerified marker.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  enforceHonestResultGate,
  classifyHonestyViolation,
  writeHonestSentinelResult,
  isStubResult,
  isConfirmedStub,
} from '../../src/orchestra/result-evaluator.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/types.js';

// ─── Test helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '165-001',
    title: 'Bug X fix',
    description: 'Eradicate CODE_VERIFIED_DONE stub',
    model: 'opus',
    effort: 'high',
    priority: 'CRITICAL',
    reason: 'Sprint 156-011 debt replay',
    scope: {
      directories: ['src/orchestra/', 'src/agents/', 'tests/orchestra/'],
      filesRead: [],
      filesWrite: [
        'src/orchestra/result-evaluator.ts',
        'src/orchestra/debt-manager.ts',
        'src/orchestra/sprint-phases.ts',
        'src/agents/worker.ts',
        'tests/orchestra/no-result-stub-eradication.test.ts',
      ],
    },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '165-001',
    workerId: 'w-165-001',
    filesChanged: ['src/orchestra/result-evaluator.ts'],
    linesAdded: 120,
    linesRemoved: 10,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'Real work performed',
    ...overrides,
  };
}

// ─── Scenario (a) — Real work + tests pass → DONE preserved ──────────────

describe('enforceHonestResultGate — Scenario (a): real DONE preserved', () => {
  it('passes through DONE when linesAdded>0 and testsPassed=true', () => {
    const task = makeTask();
    const result = makeResult({ linesAdded: 120, testsPassed: true, selfAssessment: 'DONE' });

    const gated = enforceHonestResultGate(result, task);

    expect(gated.honest).toBe(true);
    expect(gated.violation).toBeUndefined();
    expect(gated.result.selfAssessment).toBe('DONE');
    expect(gated.result.linesAdded).toBe(120);
  });

  it('passes through GO_WITH_TECH_DEBT when linesAdded>0 and selfAssessment is tech debt', () => {
    const task = makeTask();
    const result = makeResult({ linesAdded: 50, testsPassed: true, selfAssessment: 'GO_WITH_TECH_DEBT' });

    const gated = enforceHonestResultGate(result, task);

    expect(gated.honest).toBe(true);
    expect(gated.result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
  });
});

// ─── Scenario (b) — Real work + tests fail → not downgraded by gate ──────
// (Rubric eval decides — NO_GO or GO_WITH_TECH_DEBT — not the honest gate.)

describe('enforceHonestResultGate — Scenario (b): real-work test-fail not downgraded by gate', () => {
  it('does NOT force NO_GO when linesAdded>0 even if testsPassed=false', () => {
    const task = makeTask();
    const result = makeResult({
      linesAdded: 80,
      testsPassed: false,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Implementation done, 2 tests still flaky',
    });

    const gated = enforceHonestResultGate(result, task);

    // Honest gate only triggers on (linesAdded === 0 && testsPassed === false).
    // Real work with failing tests is a rubric/evaluator concern, not a stub.
    expect(gated.honest).toBe(true);
    expect(gated.violation).toBeUndefined();
    expect(gated.result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
  });
});

// ─── Scenario (c) — Missing .result with on-disk files → NO_GO sentinel ──

describe('writeHonestSentinelResult — Scenario (c): missing .result becomes honest NO_GO', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-stub-eradication-'));
    // .tasks dir
    writeFileSync(join(tmpRoot, '.gitkeep'), '');
    require('node:fs').mkdirSync(join(tmpRoot, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('writes honest NO_GO sentinel — not a CODE_VERIFIED_DONE stub', () => {
    const taskId = '165-001';
    const filesOnDisk = ['src/orchestra/result-evaluator.ts'];

    writeHonestSentinelResult(tmpRoot, taskId, filesOnDisk, 'worker-crashed-no-result');

    const resultPath = join(tmpRoot, '.tasks', `task-${taskId}.result`);
    expect(existsSync(resultPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult & {
      codeVerified?: string;
      partialMarker?: boolean;
    };

    // CRITICAL: NO_GO, never DONE, no codeVerified field
    expect(parsed.selfAssessment).toBe('NO_GO');
    expect(parsed.linesAdded).toBe(0);
    expect(parsed.testsPassed).toBe(false);
    expect(parsed.codeVerified).toBeUndefined();
    expect(parsed.notes).toContain('worker-crashed-no-result');
    // notes MUST NOT match Docker auto-pattern (would re-trigger tryCodeVerifiedDone)
    expect(parsed.notes).not.toContain('Docker worker exited without writing result file');
  });

  // P0-B (B-SENTINEL-CLOBBER, sprint-323): a sentinel must NEVER overwrite a real
  // result. The worker either wrote one (present in .tasks) or the sprint already
  // evaluated + archived it — neither is a crash.
  it('does NOT clobber an existing .result with a sentinel (P0-B)', () => {
    const taskId = 'pb-existing';
    const realPath = join(tmpRoot, '.tasks', `task-${taskId}.result`);
    writeFileSync(realPath, JSON.stringify({
      taskId, workerId: 'w-real', filesChanged: ['src/x.ts'], linesAdded: 42,
      linesRemoved: 0, testsPassed: true, coverage: 90, selfAssessment: 'DONE', notes: 'real work',
    }), 'utf-8');

    writeHonestSentinelResult(tmpRoot, taskId, [], 'worker-crashed-no-result');

    const after = JSON.parse(readFileSync(realPath, 'utf-8')) as TaskResult;
    expect(after.selfAssessment).toBe('DONE');   // pre-fix: NO_GO (clobbered)
    expect(after.workerId).toBe('w-real');       // pre-fix: brain-honest-gate
  });

  it('does NOT write a sentinel when a real result is already archived (finalize-race, P0-B)', () => {
    const taskId = 'pb-archived';
    const fs = require('node:fs') as typeof import('node:fs');
    fs.mkdirSync(join(tmpRoot, '.brain', 'archive', 'sprint-1-tasks'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.brain', 'archive', 'sprint-1-tasks', `task-${taskId}.result`),
      JSON.stringify({ taskId, workerId: 'w-real', selfAssessment: 'DONE', notes: 'archived real' }),
      'utf-8',
    );

    writeHonestSentinelResult(tmpRoot, taskId, [], 'worker-crashed-no-result');

    // No sentinel written to .tasks — the archived result is authoritative.
    expect(existsSync(join(tmpRoot, '.tasks', `task-${taskId}.result`))).toBe(false); // pre-fix: sentinel written
  });
});

// ─── Scenario (d) — Stub literal → forced NO_GO ──────────────────────────

describe('enforceHonestResultGate — Scenario (d): stub literal forced to NO_GO', () => {
  it('downgrades selfAssessment DONE with linesAdded=0 + testsPassed=false to NO_GO', () => {
    const task = makeTask();
    const stubResult: TaskResult & { codeVerified?: string } = {
      taskId: '165-001',
      workerId: 'brain-reconcile',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Code physically verified despite missing .result (Sprint 135 docker HB shutdown bug pattern)',
      codeVerified: 'CODE_VERIFIED_DONE',
    };

    const gated = enforceHonestResultGate(stubResult, task);

    expect(gated.honest).toBe(false);
    expect(gated.violation).toBe('DISHONEST_DONE_STUB');
    expect(gated.result.selfAssessment).toBe('NO_GO');
    // codeVerified field MUST be stripped — never re-emitted by the gate
    expect((gated.result as TaskResult & { codeVerified?: string }).codeVerified).toBeUndefined();
    expect(gated.result.notes).toContain('honest-gate');
  });

  it('isStubResult detects the literal stub pattern', () => {
    const stub: TaskResult & { codeVerified?: string } = {
      taskId: '165-001',
      workerId: 'brain-reconcile',
      filesChanged: ['src/foo.ts'],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'stub',
      codeVerified: 'CODE_VERIFIED_DONE',
    };

    expect(isStubResult(stub)).toBe(true);

    const real = makeResult({ linesAdded: 100, testsPassed: true });
    expect(isStubResult(real)).toBe(false);
  });
});

// ─── B-STUB (Sprint 318) — RETRO pre-finalize disk-evidence guard ──────────
// The retro-phase pre-finalize gate switched from raw isStubResult (which
// false-flagged 318-003's rename → synthetic NO_GO) to isConfirmedStub, which
// adds the MF-8 disk-evidence override the retro caller previously bypassed.
describe('isConfirmedStub — B-STUB disk-evidence guard (RETRO pre-finalize)', () => {
  const scope = { directories: ['src/'], filesRead: [], filesWrite: ['src/a.ts'] };
  const stubShape = makeResult({
    filesChanged: ['src/a.ts'], linesAdded: 0, testsPassed: false, selfAssessment: 'DONE',
  });

  it('stub shape + DISK EVIDENCE (rename/docker untracked) → NOT a confirmed stub', () => {
    const withEvidence = () => ({ hasDiskEvidence: true, linesAdded: 12, untrackedFiles: [] });
    expect(isConfirmedStub(stubShape, scope, '/mock', withEvidence)).toBe(false);
  });

  it('stub shape + NO disk evidence → confirmed stub (legacy synthetic NO_GO preserved)', () => {
    const noEvidence = () => ({ hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] });
    expect(isConfirmedStub(stubShape, scope, '/mock', noEvidence)).toBe(true);
  });

  it('non-stub result → never a confirmed stub regardless of disk', () => {
    const real = makeResult({ linesAdded: 100, testsPassed: true });
    const noEvidence = () => ({ hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] });
    expect(isConfirmedStub(real, scope, '/mock', noEvidence)).toBe(false);
  });

  it('diskVerify throws (no git in sandbox) → fail-open to confirmed stub', () => {
    const boom = () => { throw new Error('no git'); };
    expect(isConfirmedStub(stubShape, scope, '/mock', boom)).toBe(true);
  });
});

// ─── Scenario (e) — Docker crash + heartbeat timeout → NO_GO + FIX ────────

describe('classifyHonestyViolation — Scenario (e): docker crash classified for FIX', () => {
  it('classifies missing result + crashed worker as worker-crashed-no-result', () => {
    const task = makeTask();
    // No result file at all — only on-disk evidence
    const violation = classifyHonestyViolation({
      hasResultFile: false,
      result: null,
      task,
      filesOnDisk: ['src/orchestra/result-evaluator.ts'],
      heartbeatTimedOut: true,
    });

    expect(violation.code).toBe('WORKER_CRASHED_NO_RESULT');
    expect(violation.triggersFix).toBe(true);
    expect(violation.evaluation).toBe('NO_GO');
  });

  it('classifies present-but-stub result as DISHONEST_DONE_STUB and triggers FIX', () => {
    const task = makeTask();
    const stub: TaskResult & { codeVerified?: string } = {
      taskId: '165-001',
      workerId: 'brain-reconcile',
      filesChanged: ['src/orchestra/result-evaluator.ts'],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: false,
      coverage: 0,
      selfAssessment: 'DONE',
      notes: 'Code physically verified',
      codeVerified: 'CODE_VERIFIED_DONE',
    };

    const violation = classifyHonestyViolation({
      hasResultFile: true,
      result: stub,
      task,
      filesOnDisk: ['src/orchestra/result-evaluator.ts'],
      heartbeatTimedOut: false,
    });

    expect(violation.code).toBe('DISHONEST_DONE_STUB');
    expect(violation.triggersFix).toBe(true);
    expect(violation.evaluation).toBe('NO_GO');
  });
});

// ─── Scenario (f) — Scope violation → NO_GO + boundary alarm ──────────────

describe('enforceHonestResultGate — Scenario (f): scope violation forced to NO_GO', () => {
  it('forces NO_GO when filesChanged contains path outside scope.filesWrite', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/result-evaluator.ts'],
      },
    });
    // Worker reports writing files INSIDE its scope BUT also touched an
    // out-of-scope file (DIRECTIVES.md — Sprint 164 164-006 scenario).
    const result = makeResult({
      filesChanged: ['src/orchestra/result-evaluator.ts', 'DIRECTIVES.md'],
      linesAdded: 50,
      testsPassed: true,
      selfAssessment: 'DONE',
    });

    const gated = enforceHonestResultGate(result, task);

    expect(gated.honest).toBe(false);
    expect(gated.violation).toBe('BOUNDARY_VIOLATION');
    expect(gated.result.selfAssessment).toBe('NO_GO');
    expect(gated.result.notes).toContain('boundary');
  });

  it('does NOT flag boundary violation when all filesChanged are inside scope', () => {
    const task = makeTask({
      scope: {
        directories: ['src/orchestra/'],
        filesRead: [],
        filesWrite: ['src/orchestra/result-evaluator.ts', 'src/orchestra/debt-manager.ts'],
      },
    });
    const result = makeResult({
      filesChanged: ['src/orchestra/result-evaluator.ts', 'src/orchestra/debt-manager.ts'],
      linesAdded: 50,
      testsPassed: true,
      selfAssessment: 'DONE',
    });

    const gated = enforceHonestResultGate(result, task);

    expect(gated.honest).toBe(true);
    expect(gated.violation).toBeUndefined();
  });
});

// ─── MF-8 (Sprint 252) — disk-evidence overrides linesAdded=0 false-stub ────
// A docker/host-adapter worker that creates a NEW (untracked) file reports
// linesAdded=0 (git numstat HEAD = 0 for untracked) — the stub/empty-write
// heuristics would wrongly flip its DONE to NO_GO. When disk-verify shows real
// evidence (untrackedFiles), the gate must treat it as honest. A genuine stub
// (no disk evidence) must STILL flip — the integrity boundary is preserved.
describe('enforceHonestResultGate — MF-8: disk evidence vs linesAdded=0 false-stub', () => {
  it('codex-in-docker shape (DONE, linesAdded=0, testsPassed=false) + disk evidence → HONEST (not flipped)', () => {
    const task = makeTask({ scope: { directories: ['docs/_verify-docker/'], filesRead: [], filesWrite: ['docs/_verify-docker/codex-docker.md'] } });
    const result = makeResult({ filesChanged: ['docs/_verify-docker/codex-docker.md'], linesAdded: 0, testsPassed: false, selfAssessment: 'DONE' });
    const diskVerify = { hasDiskEvidence: true, linesAdded: 0, untrackedFiles: ['docs/_verify-docker/codex-docker.md'] };

    const gated = enforceHonestResultGate(result, task, diskVerify);

    expect(gated.honest).toBe(true);
    expect(gated.violation).toBeUndefined();
    expect(gated.result.selfAssessment).toBe('DONE');
  });

  it('SAME shape but NO disk evidence → still DISHONEST_DONE_STUB (integrity preserved)', () => {
    const task = makeTask();
    const result = makeResult({ filesChanged: [], linesAdded: 0, testsPassed: false, selfAssessment: 'DONE' });
    const noEvidence = { hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] as string[] };

    const gated = enforceHonestResultGate(result, task, noEvidence);

    expect(gated.honest).toBe(false);
    expect(gated.violation).toBe('DISHONEST_DONE_STUB');
    expect(gated.result.selfAssessment).toBe('NO_GO');
  });

  it('omitted diskVerify (e.g. retro-phase caller) → exact legacy behavior (still flips a stub)', () => {
    const task = makeTask();
    const result = makeResult({ filesChanged: [], linesAdded: 0, testsPassed: false, selfAssessment: 'DONE' });

    const gated = enforceHonestResultGate(result, task);

    expect(gated.honest).toBe(false);
    expect(gated.violation).toBe('DISHONEST_DONE_STUB');
  });

  it('Check 3 (filesChanged>0, linesAdded=0, DONE) + disk evidence → HONEST (no SCOPE_VIOLATION_OR_EMPTY_WRITE)', () => {
    // in-scope file (so Check 2 boundary does not fire — we isolate Check 3)
    const task = makeTask({ scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/x.md'] } });
    const result = makeResult({ filesChanged: ['docs/x.md'], linesAdded: 0, testsPassed: true, selfAssessment: 'DONE' });
    const diskVerify = { hasDiskEvidence: true, linesAdded: 0, untrackedFiles: ['docs/x.md'] };

    const gated = enforceHonestResultGate(result, task, diskVerify);

    expect(gated.honest).toBe(true);
  });
});
