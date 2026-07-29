// ─── tests/orchestra/landing-continuation-deadlock.test.ts ──────────────────
//
// MASTER-PLAN 664 + 660. Three defects measured on the 2026-07-25 live sprint,
// pinned here so they cannot come back:
//
//   A) The continuation turn-reserve rule was unsatisfiable by construction.
//      It demanded `remaining >= reservedTurns` where reservedTurns is a fixed
//      fraction of the HARD budget — but the reserve exists to finance the
//      landing itself, so any landing that used it left remaining below the bar.
//      Task 457-002: hard=32, used=31, remaining=1, reservedTurns=8 → permanent
//      hold. The rule is now a small absolute minimum instead.
//
//   B) A held continuation was invisible AND non-terminal: debugLog only, no
//      result, so the run waited forever for a result no attempt could write.
//
//   C) exit 137 was ASSERTED to be an OOM whenever no budget-stop evidence
//      matched. It only means SIGKILL. 457-003 was really a turn-ceiling kill on
//      a host with 31 GB free, and the message sent debugging toward memory.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  describeDockerPartialResultTermination,
  reconcileDockerLandingRequestedRuntimeBudgetUsage,
  settleHeldExecutionContinuation,
} from '../../src/orchestra/spawn-backend-docker.js';
import type { RuntimeBudgetUsageEvidence } from '../../src/orchestra/runtime-budget-monitor.js';
import { EXECUTION_CONTINUATION_MINIMUM_TURNS } from '../../src/orchestra/execution-continuation-runner.js';

const roots: string[] = [];

function makeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-landing-deadlock-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('landing → continuation deadlock (MASTER-PLAN 664)', () => {
  it('preserves real terminal landing counters without fabricating billing or success', () => {
    const result = {
      taskId: '462-002',
      selfAssessment: 'DONE',
      testsPassed: true,
      cost: 99,
    } as unknown as Parameters<typeof reconcileDockerLandingRequestedRuntimeBudgetUsage>[0];
    const usage = {
      terminal: true,
      decision: {
        state: 'landing-requested',
        counters: {
          turns: 34,
          inputTokens: 7111,
          outputTokens: 450,
          cacheReadTokens: 3_813_862,
          cacheCreationTokens: 134_883,
        },
      },
    } as RuntimeBudgetUsageEvidence;

    expect(reconcileDockerLandingRequestedRuntimeBudgetUsage(result, usage, {
      provider: 'claude',
      model: 'claude-sonnet-5',
    })).toBe(true);
    expect(result.selfAssessment).toBe('DONE');
    expect(result.tokenUsage).toMatchObject({
      inputTokens: 7111,
      outputTokens: 450,
      cacheReadTokens: 3_813_862,
      cacheCreationTokens: 134_883,
      source: 'host-runtime-budget',
      provider: 'claude',
      model: 'claude-sonnet-5',
    });
    expect(result.providerBilling).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('admits a continuation on a small absolute turn minimum, not the hard-budget reserve', () => {
    // The measured deadlock: hard 32 with reserve_ratio 0.25 reserves 8 turns,
    // and a real landing left 1. A rule requiring 8 could never be met again.
    const reservedTurnsForHard32 = Math.ceil(32 * 0.25);
    expect(reservedTurnsForHard32).toBe(8);
    expect(EXECUTION_CONTINUATION_MINIMUM_TURNS).toBeLessThan(reservedTurnsForHard32);
    // Still a real floor: a continuation needs at least one work turn plus one
    // turn to settle, otherwise it could only burn budget without landing.
    expect(EXECUTION_CONTINUATION_MINIMUM_TURNS).toBeGreaterThanOrEqual(2);
  });

  it('settles a held continuation as a typed terminal result', () => {
    const root = makeProject();
    const settled = settleHeldExecutionContinuation(
      root,
      '457-002',
      137,
      'Execution continuation turn reserve is insufficient: remaining=1, required=2',
    );
    expect(settled).toBe(true);

    const result = JSON.parse(
      readFileSync(join(root, '.tasks', 'task-457-002.result'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(result['selfAssessment']).toBe('NO_GO');
    expect(result['exitCode']).toBe(137);
    expect(result['continuationHeld']).toMatchObject({ version: 1 });
    // The reason must survive verbatim — a hold with no cause is what made the
    // original failure undiagnosable.
    expect(String(result['notes'])).toContain('remaining=1');
    expect(String(result['notes'])).toContain('landing checkpoint');
  });

  it('never overwrites a real worker result with a hold settlement', () => {
    const root = makeProject();
    const resultPath = join(root, '.tasks', 'task-457-009.result');
    writeFileSync(resultPath, JSON.stringify({ taskId: '457-009', selfAssessment: 'DONE' }), 'utf-8');

    expect(settleHeldExecutionContinuation(root, '457-009', 137, 'held')).toBe(false);
    expect(JSON.parse(readFileSync(resultPath, 'utf-8'))).toMatchObject({ selfAssessment: 'DONE' });
  });

  it('does not write a result when the project has no tasks directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-landing-deadlock-'));
    roots.push(root);
    expect(settleHeldExecutionContinuation(root, '457-010', 137, 'held')).toBe(false);
    expect(existsSync(join(root, '.tasks', 'task-457-010.result'))).toBe(false);
  });
});

describe('exit-137 termination diagnosis (MASTER-PLAN 660)', () => {
  const budgetStop = {
    attemptId: 'attempt-1',
    evidenceSource: 'stop-marker',
    decision: { reasons: ['turn budget exceeded (25 > 12)'] },
  } as unknown as Parameters<typeof describeDockerPartialResultTermination>[1];

  it('reports the budget breaker when durable evidence exists', () => {
    const note = describeDockerPartialResultTermination(137, budgetStop, null);
    expect(note).toContain('Runtime budget circuit breaker');
    expect(note).toContain('turn budget exceeded');
    expect(note).not.toContain('OOM');
  });

  it('claims OOM only when docker measured it', () => {
    expect(describeDockerPartialResultTermination(137, null, true)).toContain('OOMKilled=true');
  });

  it('does not let a false OOMKilled flag rule memory out (cgroup-v2 child kill)', () => {
    const note = describeDockerPartialResultTermination(137, null, false);
    expect(note).toContain('OOMKilled=false');
    // The flag only covers PID 1; a child OOM kill leaves it false. Measured on
    // task 458-005 (3 GB limit, provider CLI killed, entrypoint exited 137).
    expect(note).toContain('PID 1');
    expect(note).toContain('cgroup v2');
    expect(note).not.toMatch(/NOT an out-of-memory kill/);
  });

  it('never asserts OOM when it could not be measured', () => {
    const note = describeDockerPartialResultTermination(137, null, null);
    expect(note).toContain('could not be measured');
    expect(note).toContain('cause undetermined');
    expect(note).not.toMatch(/OOM-killed/);
  });
});
