// ═══ Proof-of-Function Gate Tests (Sprint 216 Task 216-002) ═══════════
// Hermetic — every test injects a mock smoke runner. NO real `spawn`
// invocation, NO real server boot, NO real filesystem touches outside
// the synthetic Task object. CI runs these on a clean machine and they
// must pass identically to local runs (karpathy-discipline CUSTOM
// Test Hermeticity).

import { describe, it, expect, vi } from 'vitest';

import {
  verifyProofOfFunction,
  applyProofOfFunctionGate,
  readSmokeSpec,
  shellSplit,
  defaultSmokeRunner,
  PROOF_OF_FUNCTION_MISMATCH_CHANNEL,
  type SmokeRunnerFn,
  type ProofResult,
} from '../../src/orchestra/proof-of-function.js';
// Wire-coverage assertion: the same symbol must be reachable from the
// result-evaluator re-export path (kanit: `grep -rl verifyProofOfFunction
// src/orchestra/result-evaluator.ts`).
import {
  verifyProofOfFunction as verifyProofOfFunctionViaEvaluator,
  PROOF_OF_FUNCTION_MISMATCH_CHANNEL as PROOF_CHANNEL_VIA_EVALUATOR,
} from '../../src/orchestra/result-evaluator.js';
import {
  TaskStatus,
  type Task,
  type TaskResult,
  type EvaluationResult,
} from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> & { smoke?: { command: string; expect: string } } = {}): Task {
  const { smoke, ...rest } = overrides;
  const base = {
    id: '216-002-test',
    title: 'Test task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/api/'],
      filesRead: [],
      filesWrite: ['src/api/server.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.EXECUTING,
    ...rest,
  } as Task;
  if (smoke !== undefined) {
    (base as Task & { smoke?: unknown }).smoke = smoke;
  }
  return base;
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '216-002-test',
    workerId: 'w-test',
    filesChanged: ['src/api/server.ts'],
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'DONE',
    notes: 'test',
    ...overrides,
  };
}

function makeEvaluation(decision: EvaluationResult['decision']): EvaluationResult {
  return {
    decision,
    totalScore: decision === 'DONE' ? 95 : 60,
    rubricScores: [],
    retryCount: 0,
  };
}

function passingRunner(stdout = 'http_root=200 __DECKENT_API_TOKEN__ present'): SmokeRunnerFn {
  return vi.fn(async () => ({
    exitCode: 0,
    stdout,
    stderr: '',
    timedOut: false,
  }));
}

function failingRunner(): SmokeRunnerFn {
  return vi.fn(async () => ({
    exitCode: 1,
    stdout: '<!doctype html>\n<html>...</html>',
    stderr: 'connection refused',
    timedOut: false,
  }));
}

// ─── (1) Smoke passes → DONE preserved ────────────────────────────────

describe('verifyProofOfFunction — passing smoke', () => {
  it('returns passed=true when expect substring is found and exit=0', async () => {
    const task = makeTask({
      smoke: {
        command: 'node dist/cli/entry.js serve --port 3211',
        expect: '__DECKENT_API_TOKEN__',
      },
    });
    const result = makeResult();
    const evaluation = makeEvaluation('DONE');
    const runner = passingRunner();

    const gate = await verifyProofOfFunction(task, '/tmp/fake', result, evaluation, {
      smokeRunner: runner,
    });

    expect(gate.status).toBe('passed');
    expect(gate.passed).toBe(true);
    expect(gate.command).toContain('serve');
    expect(runner).toHaveBeenCalledTimes(1);

    // applyProofOfFunctionGate must preserve DONE on pass
    const applied = applyProofOfFunctionGate(evaluation, gate);
    expect(applied.decision).toBe('DONE');
  });
});

// ─── (2) Smoke fails → downgrade DONE → GO_WITH_TECH_DEBT ─────────────

describe('verifyProofOfFunction — failing smoke triggers downgrade', () => {
  it('returns failed and applyProofOfFunctionGate downgrades DONE → GO_WITH_TECH_DEBT', async () => {
    const task = makeTask({
      smoke: {
        command: 'node dist/cli/entry.js serve --port 3211',
        expect: '__DECKENT_API_TOKEN__',
      },
    });
    const result = makeResult();
    const evaluation = makeEvaluation('DONE');
    const runner = failingRunner();

    const gate = await verifyProofOfFunction(task, '/tmp/fake', result, evaluation, {
      smokeRunner: runner,
    });

    expect(gate.status).toBe('failed');
    expect(gate.passed).toBe(false);
    expect(gate.evidence).toMatch(/NOT found|exit code|connection refused/);

    const applied = applyProofOfFunctionGate(evaluation, gate);
    expect(applied.decision).toBe('GO_WITH_TECH_DEBT');
    // Source eval must remain unmutated (Karpathy D3 — surgical, no
    // hidden side effects)
    expect(evaluation.decision).toBe('DONE');
  });

  it('treats non-zero exit code as failure even when expect matches', async () => {
    const task = makeTask({
      smoke: { command: 'node dist/cli/entry.js serve', expect: '__DECKENT_API_TOKEN__' },
    });
    const evaluation = makeEvaluation('DONE');
    const runner: SmokeRunnerFn = async () => ({
      exitCode: 137,
      stdout: '__DECKENT_API_TOKEN__ found',
      stderr: '',
      timedOut: false,
    });

    const gate = await verifyProofOfFunction(task, '/tmp/fake', makeResult(), evaluation, {
      smokeRunner: runner,
    });
    expect(gate.status).toBe('failed');
    expect(gate.evidence).toContain('exit code 137');
  });

  it('treats spawn timeout as failure', async () => {
    const task = makeTask({
      smoke: { command: 'node dist/cli/entry.js serve', expect: '__DECKENT_API_TOKEN__' },
    });
    const evaluation = makeEvaluation('DONE');
    const runner: SmokeRunnerFn = async () => ({
      exitCode: null,
      stdout: '',
      stderr: '',
      timedOut: true,
    });

    const gate = await verifyProofOfFunction(task, '/tmp/fake', makeResult(), evaluation, {
      smokeRunner: runner,
      timeoutMs: 5000,
    });
    expect(gate.status).toBe('failed');
    expect(gate.evidence).toContain('timed out');
  });

  it('treats runner throw as failure (fail-closed)', async () => {
    const task = makeTask({
      smoke: { command: 'node dist/cli/entry.js serve', expect: '__DECKENT_API_TOKEN__' },
    });
    const evaluation = makeEvaluation('DONE');
    const runner: SmokeRunnerFn = async () => {
      throw new Error('boom');
    };

    const gate = await verifyProofOfFunction(task, '/tmp/fake', makeResult(), evaluation, {
      smokeRunner: runner,
    });
    expect(gate.status).toBe('failed');
    expect(gate.evidence).toContain('boom');
  });
});

// ─── (3) No smoke spec → no-op ────────────────────────────────────────

describe('verifyProofOfFunction — no smoke spec', () => {
  it('returns no-op when task.smoke is absent (Tier-1 task without DIRECTIVES Smoke: line)', async () => {
    const task = makeTask({}); // user-surface (api/), but no smoke field
    const result = makeResult();
    const evaluation = makeEvaluation('DONE');
    const runner = vi.fn();

    const gate = await verifyProofOfFunction(task, '/tmp/fake', result, evaluation, {
      smokeRunner: runner as unknown as SmokeRunnerFn,
    });

    expect(gate.status).toBe('no-op');
    expect(gate.passed).toBe(true);
    expect(runner).not.toHaveBeenCalled();

    // Gate must NOT downgrade — DONE preserved when no smoke spec
    const applied = applyProofOfFunctionGate(evaluation, gate);
    expect(applied.decision).toBe('DONE');
  });

  it('returns no-op for Tier-0 (non-user-surface) task even when smoke field is set', async () => {
    // Scope is src/core/ (Tier-0). Gate must not fire.
    const task = makeTask({
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config.ts'] },
      smoke: { command: 'node x', expect: 'x' },
    });
    const evaluation = makeEvaluation('DONE');
    const runner = vi.fn();

    const gate = await verifyProofOfFunction(task, '/tmp/fake', makeResult(), evaluation, {
      smokeRunner: runner as unknown as SmokeRunnerFn,
    });

    expect(gate.status).toBe('no-op');
    expect(gate.evidence).toMatch(/not user-surface/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns no-op when rubric decision is not DONE (nothing to downgrade)', async () => {
    const task = makeTask({
      smoke: { command: 'node dist/cli/entry.js serve', expect: '__DECKENT_API_TOKEN__' },
    });
    const evaluation = makeEvaluation('GO_WITH_TECH_DEBT');
    const runner = vi.fn();

    const gate = await verifyProofOfFunction(task, '/tmp/fake', makeResult(), evaluation, {
      smokeRunner: runner as unknown as SmokeRunnerFn,
    });

    expect(gate.status).toBe('no-op');
    expect(runner).not.toHaveBeenCalled();
  });
});

// ─── (4) Audit event emitted on failure ───────────────────────────────

describe('applyProofOfFunctionGate — audit event emission', () => {
  it('emits PROOF_OF_FUNCTION_MISMATCH event to the audit sink on downgrade', () => {
    const audit = vi.fn();
    const evaluation = makeEvaluation('DONE');
    const failedGate: ProofResult = {
      status: 'failed',
      passed: false,
      evidence: 'expect __DECKENT_API_TOKEN__ NOT found',
      command: 'node dist/cli/entry.js serve',
      reason: 'expect __DECKENT_API_TOKEN__ NOT found',
    };

    const applied = applyProofOfFunctionGate(evaluation, failedGate, {
      audit,
      taskId: '216-006',
    });

    expect(applied.decision).toBe('GO_WITH_TECH_DEBT');
    expect(audit).toHaveBeenCalledTimes(1);
    const event = audit.mock.calls[0]?.[0];
    expect(event).toBeDefined();
    expect(event.channel).toBe(PROOF_OF_FUNCTION_MISMATCH_CHANNEL);
    expect(event.taskId).toBe('216-006');
    expect(event.command).toBe('node dist/cli/entry.js serve');
    expect(event.reason).toMatch(/NOT found/);
  });

  it('does NOT emit audit event on no-op gate result', () => {
    const audit = vi.fn();
    const evaluation = makeEvaluation('DONE');
    const noopGate: ProofResult = {
      status: 'no-op',
      passed: true,
      evidence: 'task is not user-surface',
      command: null,
    };

    const applied = applyProofOfFunctionGate(evaluation, noopGate, { audit });
    expect(applied.decision).toBe('DONE');
    expect(audit).not.toHaveBeenCalled();
  });

  it('does NOT emit audit event on passed gate result', () => {
    const audit = vi.fn();
    const evaluation = makeEvaluation('DONE');
    const passGate: ProofResult = {
      status: 'passed',
      passed: true,
      evidence: 'expect matched, exit=0',
      command: 'curl ...',
    };

    const applied = applyProofOfFunctionGate(evaluation, passGate, { audit });
    expect(applied.decision).toBe('DONE');
    expect(audit).not.toHaveBeenCalled();
  });

  it('audit sink throw does not corrupt the downgrade (fail-safe)', () => {
    const audit = vi.fn(() => { throw new Error('sink died'); });
    const evaluation = makeEvaluation('DONE');
    const failedGate: ProofResult = {
      status: 'failed',
      passed: false,
      evidence: 'failure',
      command: 'node x',
      reason: 'fail',
    };
    const applied = applyProofOfFunctionGate(evaluation, failedGate, { audit, taskId: 'x' });
    expect(applied.decision).toBe('GO_WITH_TECH_DEBT');
  });

  it('does NOT downgrade GO_WITH_TECH_DEBT or NO_GO even when gate fails (nothing to downgrade)', () => {
    const audit = vi.fn();
    const evaluation = makeEvaluation('GO_WITH_TECH_DEBT');
    const failedGate: ProofResult = {
      status: 'failed',
      passed: false,
      evidence: 'failure',
      command: 'node x',
      reason: 'fail',
    };
    const applied = applyProofOfFunctionGate(evaluation, failedGate, { audit, taskId: 'x' });
    expect(applied.decision).toBe('GO_WITH_TECH_DEBT');
    expect(audit).not.toHaveBeenCalled();
  });
});

// ─── (5) Utilities (readSmokeSpec, shellSplit) ────────────────────────

describe('readSmokeSpec', () => {
  it('returns null when task.smoke is missing', () => {
    const task = makeTask({});
    expect(readSmokeSpec(task)).toBeNull();
  });

  it('returns null on malformed smoke spec (missing fields)', () => {
    const task = makeTask({});
    (task as Task & { smoke?: unknown }).smoke = { command: 'node' }; // no expect
    expect(readSmokeSpec(task)).toBeNull();
  });

  it('returns null when command is whitespace-only', () => {
    const task = makeTask({});
    (task as Task & { smoke?: unknown }).smoke = { command: '   ', expect: 'x' };
    expect(readSmokeSpec(task)).toBeNull();
  });

  it('returns the spec when both command and expect are non-empty strings', () => {
    const task = makeTask({
      smoke: { command: 'node dist/cli/entry.js serve', expect: '__DECKENT_API_TOKEN__' },
    });
    const spec = readSmokeSpec(task);
    expect(spec).toEqual({
      command: 'node dist/cli/entry.js serve',
      expect: '__DECKENT_API_TOKEN__',
    });
  });
});

describe('shellSplit', () => {
  it('splits unquoted whitespace', () => {
    expect(shellSplit('node dist/cli/entry.js serve --port 3211')).toEqual([
      'node', 'dist/cli/entry.js', 'serve', '--port', '3211',
    ]);
  });

  it('preserves double-quoted groups', () => {
    expect(shellSplit('curl -H "Authorization: Bearer abc" localhost:3211/')).toEqual([
      'curl', '-H', 'Authorization: Bearer abc', 'localhost:3211/',
    ]);
  });

  it('preserves single-quoted groups', () => {
    expect(shellSplit("echo 'hello world'")).toEqual(['echo', 'hello world']);
  });

  it('returns empty array for empty / whitespace input', () => {
    expect(shellSplit('')).toEqual([]);
    expect(shellSplit('   \t  ')).toEqual([]);
  });
});

// ─── (6) Result-evaluator re-export wire ──────────────────────────────

describe('result-evaluator re-export wire', () => {
  it('exposes verifyProofOfFunction symbol identical to the one in proof-of-function module', () => {
    expect(verifyProofOfFunctionViaEvaluator).toBe(verifyProofOfFunction);
  });
  it('exposes the audit channel constant via result-evaluator re-export', () => {
    expect(PROOF_CHANNEL_VIA_EVALUATOR).toBe(PROOF_OF_FUNCTION_MISMATCH_CHANNEL);
    expect(PROOF_OF_FUNCTION_MISMATCH_CHANNEL).toContain('PROOF_OF_FUNCTION_MISMATCH');
  });
});

// ─── (7) defaultSmokeRunner — narrow smoke (no real server) ───────────

describe('defaultSmokeRunner — empty command + non-existent binary', () => {
  it('returns gracefully when the command is empty', async () => {
    const out = await defaultSmokeRunner('', '/tmp', 5_000);
    expect(out.exitCode).toBeNull();
    expect(out.stderr).toMatch(/empty smoke command/);
  });

  it('reports spawn error for a non-existent binary (does not throw)', async () => {
    const out = await defaultSmokeRunner('definitely-not-a-real-binary-xyz', '/tmp', 5_000);
    // node spawn fires 'error' synchronously for ENOENT — outcome is null exit + stderr text.
    expect(out.exitCode).toBeNull();
    expect(out.stderr.length).toBeGreaterThan(0);
  });
});
