import { describe, expect, it, vi } from 'vitest';
import {
  describeDockerPartialResultTermination,
  reconcileDockerRuntimeBudgetResult,
  reconcileDockerRuntimeBudgetUsage,
  requestDockerContainerLanding,
  terminateDockerContainerForBudget,
  type DockerSyncCommand,
  type DockerSyncCommandResult,
} from '../../src/orchestra/spawn-backend-docker.js';
import type {
  RuntimeBudgetStopEvidence,
  RuntimeBudgetUsageEvidence,
} from '../../src/orchestra/runtime-budget-monitor.js';

function scripted(results: DockerSyncCommandResult[]) {
  const run = vi.fn((_command: string, _args: string[]) => (
    results.shift() ?? { status: 1, stderr: 'unexpected command' }
  )) as unknown as DockerSyncCommand;
  return run;
}

function budgetStop(
  evidenceSource: RuntimeBudgetStopEvidence['evidenceSource'] = 'stop-marker',
  counterEvidenceSource: RuntimeBudgetStopEvidence['counterEvidenceSource'] = 'stop-marker',
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
    counterEvidenceSource,
  };
}

function budgetUsage(
  state: RuntimeBudgetUsageEvidence['decision']['state'] = 'within-budget',
  terminal = true,
): RuntimeBudgetUsageEvidence {
  const counters = {
    turns: 3,
    inputTokens: 11,
    outputTokens: 22,
    cacheReadTokens: 33,
    cacheCreationTokens: 44,
    totalTokens: 110,
    maxContextTokens: 88,
  };
  return {
    version: 2,
    projectId: 'project-1',
    taskId: 't3',
    attemptId: 'attempt-2',
    budgetFingerprint: 'b'.repeat(64),
    backend: 'docker',
    terminal,
    budget: { maxTurns: 4 },
    decision: { state, reasons: [], counters },
    guardState: {
      version: 1,
      counters,
      seenDedupeKeys: ['call:msg-1', 'call:msg-2', 'call:msg-3'],
      measurableEvents: 3,
      incrementalUsageEvents: 3,
    },
    updatedAt: '2026-07-22T05:00:00.000Z',
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
    expect(result.notes).toContain('counterEvidenceSource=stop-marker');
    expect(result.notes).toContain(`budgetFingerprint=${'a'.repeat(64)}`);
  });

  it('surfaces terminal counter provenance separately from containment provenance', () => {
    const result = doneResult();

    reconcileDockerRuntimeBudgetResult(
      result,
      137,
      budgetStop('stop-marker', 'terminal-usage'),
    );

    expect(result.notes).toContain('evidenceSource=stop-marker');
    expect(result.notes).toContain('counterEvidenceSource=terminal-usage');
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

  it('patches terminal within-budget counters without changing verdict or billing truth', () => {
    const result = doneResult();
    const previousBilling = result.providerBilling;

    expect(reconcileDockerRuntimeBudgetUsage(result, budgetUsage(), {
      provider: 'claude',
      model: 'claude-sonnet-5',
    })).toBe(true);
    expect(result.selfAssessment).toBe('DONE');
    expect(result.testsPassed).toBe(true);
    expect(result.notes).toBe('Worker claimed completion.');
    expect(result.providerBilling).toBe(previousBilling);
    expect(result.cost).toBeUndefined();
    expect(result.tokenUsage).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheReadTokens: 33,
      cacheCreationTokens: 44,
      source: 'host-runtime-budget',
      provider: 'claude',
      model: 'claude-sonnet-4-20250514',
    });
  });

  it('is idempotent and supplies canonical identity when the worker omitted it', () => {
    const result = doneResult();
    delete result.tokenUsage.provider;
    delete result.tokenUsage.model;
    reconcileDockerRuntimeBudgetUsage(result, budgetUsage(), {
      provider: 'claude',
      model: 'claude-sonnet-5',
    });
    const once = JSON.stringify(result);

    expect(reconcileDockerRuntimeBudgetUsage(result, budgetUsage(), {
      provider: 'claude',
      model: 'claude-sonnet-5',
    })).toBe(true);
    expect(JSON.stringify(result)).toBe(once);
    expect(result.tokenUsage).toMatchObject({ provider: 'claude', model: 'claude-sonnet-5' });
  });

  it('does not patch nonterminal, unmeasurable, or exceeded evidence', () => {
    const cases = [
      budgetUsage('within-budget', false),
      { ...budgetUsage(), decision: { ...budgetUsage().decision, counters: {
        turns: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, totalTokens: 0, maxContextTokens: 0,
      } } },
      budgetUsage('unmeasurable'),
      budgetUsage('exceeded'),
    ];
    for (const evidence of cases) {
      const result = doneResult();
      const before = JSON.stringify(result);
      expect(reconcileDockerRuntimeBudgetUsage(result, evidence)).toBe(false);
      expect(JSON.stringify(result)).toBe(before);
    }
  });
});

describe('Docker budget termination state machine', () => {
  it('freezes the whole container before exact checkpoint-stop termination', () => {
    const run = scripted([{ status: 0 }, { status: 0 }]);

    expect(requestDockerContainerLanding('deckent-w-landing', run)).toBeUndefined();
    expect(run.mock.calls.map(call => call[1])).toEqual([
      ['pause', 'deckent-w-landing'],
      ['kill', '--signal=SIGKILL', 'deckent-w-landing'],
    ]);
  });

  it('fails loud when Docker cannot freeze the checkpoint-stop attempt', () => {
    const run = scripted([{ status: 1, stderr: 'container unavailable' }]);

    expect(() => requestDockerContainerLanding('deckent-w-missing', run))
      .toThrow(/could not freeze.*container unavailable/);
  });

  it('unpauses for hard-containment adoption when frozen-container kill fails', () => {
    const run = scripted([
      { status: 0 },
      { status: 1, stderr: 'kill unavailable' },
      { status: 0 },
    ]);

    expect(() => requestDockerContainerLanding('deckent-w-recoverable', run))
      .toThrow(/could not terminate frozen.*container unpaused for hard-containment adoption/);
    expect(run.mock.calls.map(call => call[1])).toEqual([
      ['pause', 'deckent-w-recoverable'],
      ['kill', '--signal=SIGKILL', 'deckent-w-recoverable'],
      ['unpause', 'deckent-w-recoverable'],
    ]);
  });

  it('accepts docker stop only after inspect proves the container is stopped', () => {
    const run = scripted([
      { status: 0 },
      { status: 0, stdout: 'false|143\n' },
    ]);
    expect(terminateDockerContainerForBudget('deckent-w-t1', 15, run)).toEqual({
      containerName: 'deckent-w-t1',
      escalation: 'docker-stop',
      terminationConfirmed: true,
      exitCode: 143,
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
    expect(terminateDockerContainerForBudget('deckent-w-t2', 3, run)).toMatchObject({
      escalation: 'sigterm',
      exitCode: 143,
    });
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
    expect(terminateDockerContainerForBudget('deckent-w-t3', 1, run)).toMatchObject({
      escalation: 'sigkill',
      exitCode: 137,
    });
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
