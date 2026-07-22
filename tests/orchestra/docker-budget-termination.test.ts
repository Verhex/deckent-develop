import { describe, expect, it, vi } from 'vitest';
import {
  describeDockerPartialResultTermination,
  reconcileDockerRuntimeBudgetResult,
  terminateDockerContainerForBudget,
  type DockerSyncCommand,
  type DockerSyncCommandResult,
} from '../../src/orchestra/spawn-backend-docker.js';
import type { RuntimeBudgetStopEvidence } from '../../src/orchestra/runtime-budget-monitor.js';

function scripted(results: DockerSyncCommandResult[]) {
  const run = vi.fn((_command: string, _args: string[]) => (
    results.shift() ?? { status: 1, stderr: 'unexpected command' }
  )) as unknown as DockerSyncCommand;
  return run;
}

function budgetStop(
  evidenceSource: RuntimeBudgetStopEvidence['evidenceSource'] = 'stop-marker',
): RuntimeBudgetStopEvidence {
  return {
    version: 2,
    projectId: 'project-1',
    taskId: 't3',
    attemptId: 'attempt-1',
    budgetFingerprint: 'a'.repeat(64),
    backend: 'docker',
    state: 'exceeded',
    budget: { maxTurns: 4 },
    decision: {
      state: 'exceeded',
      reasons: ['turn budget exceeded (5 > 4)'],
      counters: {
        turns: 5,
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 3,
        cacheCreationTokens: 4,
        totalTokens: 10,
        maxContextTokens: 8,
      },
    },
    stoppedAt: '2026-07-21T20:00:05.429Z',
    evidenceSource,
  };
}

describe('Docker partial-result termination attribution', () => {
  it('prioritizes durable budget-stop evidence over ambiguous exit 137', () => {
    const notes = describeDockerPartialResultTermination(137, budgetStop());
    expect(notes).toContain('Runtime budget circuit breaker');
    expect(notes).toContain('turn budget exceeded (5 > 4)');
    expect(notes).toContain('exitCode=137');
    expect(notes).toContain('attemptId=attempt-1');
    expect(notes).toContain('evidenceSource=stop-marker');
    expect(notes).not.toContain('OOM');
  });

  it('preserves terminal-usage fallback provenance', () => {
    const notes = describeDockerPartialResultTermination(
      137,
      budgetStop('terminal-usage-fallback'),
    );
    expect(notes).toContain('evidenceSource=terminal-usage-fallback');
    expect(notes).not.toContain('OOM');
  });

  it('preserves OOM attribution for exit 137 without budget evidence', () => {
    const notes = describeDockerPartialResultTermination(137, null);
    expect(notes).toContain('Container OOM-killed (exit 137, SIGKILL)');
    expect(notes).not.toContain('circuit breaker');
  });
});

describe('Docker runtime-budget result reconciliation', () => {
  function doneResult() {
    return {
      taskId: 't3',
      workerId: 'docker-t3',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE' as const,
      notes: 'Worker claimed completion.',
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        provider: 'claude' as const,
        model: 'claude-sonnet-4-20250514' as const,
        source: 'estimate',
      },
      cost: { usd: 0, currency: 'USD', pricingSource: 'estimate', isLocal: false },
      providerBilling: {
        provider: 'claude' as const,
        currency: 'USD',
        providerReportedUsd: 0.25,
        source: 'provider-final' as const,
        fetchedAt: '2026-07-21T20:00:05.429Z',
      },
    };
  }

  it('vetoes exit-0 DONE with exact host counters and durable provenance', () => {
    const result = doneResult();

    expect(reconcileDockerRuntimeBudgetResult(result, 0, budgetStop())).toBe(true);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.testsPassed).toBe(false);
    expect(result.tokenUsage).toEqual({
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheCreationTokens: 4,
      source: 'host-runtime-budget',
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
    });
    expect(result.cost).toBeUndefined();
    expect(result.providerBilling.providerReportedUsd).toBe(0.25);
    expect(result.notes).toContain('exitCode=0');
    expect(result.notes).toContain('attemptId=attempt-1');
    expect(result.notes).toContain('evidenceSource=stop-marker');
    expect(result.notes).toContain(`budgetFingerprint=${'a'.repeat(64)}`);
  });

  it('is idempotent for the same exhausted attempt', () => {
    const result = doneResult();
    reconcileDockerRuntimeBudgetResult(result, 0, budgetStop());
    const once = JSON.stringify(result);

    expect(reconcileDockerRuntimeBudgetResult(result, 0, budgetStop())).toBe(true);
    expect(JSON.stringify(result)).toBe(once);
  });

  it('leaves a successful result untouched without terminal budget evidence', () => {
    const result = doneResult();
    const before = JSON.stringify(result);

    expect(reconcileDockerRuntimeBudgetResult(result, 0, null)).toBe(false);
    expect(JSON.stringify(result)).toBe(before);
  });
});

describe('Docker budget termination state machine', () => {
  it('accepts docker stop only after inspect proves the container is stopped', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'false|143\n' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t1', 15, run)).toEqual({
      containerName: 'deckent-w-t1',
      escalation: 'docker-stop',
      terminationConfirmed: true,
    });
    expect(run.mock.calls.map(call => call[1]?.[0])).toEqual(['stop', 'inspect']);
  });

  it('escalates through TERM and verifies the post-wait state', () => {
    const run = scripted([
      { status: 1, stderr: 'stop failed' },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: 0, stdout: '143' },
      { status: 0, stdout: 'false|143' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t2', 3, run).escalation).toBe('sigterm');
    expect(run.mock.calls.map(call => call[1]?.join(' '))).toContain('kill --signal=SIGTERM deckent-w-t2');
  });

  it('uses SIGKILL when TERM cannot produce a verified stop', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: null, error: new Error('wait timeout') },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: 0, stdout: '137' },
      { status: 0, stdout: 'false|137' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t3', 1, run).escalation).toBe('sigkill');
    expect(run.mock.calls.map(call => call[1]?.join(' '))).toContain('kill --signal=SIGKILL deckent-w-t3');
  });

  it('fails loudly after SIGKILL when Docker cannot prove Running=false', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: null, error: new Error('wait timeout') },
      { status: 0, stdout: 'true|0' },
      { status: 0 },
      { status: null, error: new Error('wait timeout') },
      { status: 0, stdout: 'true|0' },
    ]);
    expect(() => terminateDockerContainerForBudget('deckent-w-t4', 1, run))
      .toThrow('could not verify');
    expect(run.mock.calls.map(call => call[1]?.join(' '))).toContain('kill --signal=SIGKILL deckent-w-t4');
  });
});
