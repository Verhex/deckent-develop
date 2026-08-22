import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { writeResult } from '../../src/agents/worker.js';
import { TaskResultWriteError } from '../../src/core/task-result-write-authority.js';
import type { TaskResultV1 } from '../../src/core/task-result-schema.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'worker-result-authority-'));
  roots.push(root);
  const tasks = join(root, '.tasks');
  mkdirSync(tasks);
  writeFileSync(join(tasks, 'task-621-003.json'), JSON.stringify({
    id: '621-003',
    title: 'result authority',
    description: '',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'EXECUTING',
  }));
  return root;
}

function canonicalResult(notes = 'verified'): TaskResultV1 {
  return {
    schemaVersion: '1.0',
    taskId: '621-003',
    workerId: 'w-621-003',
    provider: 'codex',
    model: 'gpt-5.6-sol',
    agent: null,
    skills: [],
    attempt: 1,
    isPriorityFix: false,
    fixForTaskId: null,
    filesChanged: [{ path: 'src/agents/worker.ts', status: 'modified', linesAdded: 1, linesRemoved: 1 }],
    totalLinesAdded: 1,
    totalLinesRemoved: 1,
    diskVerified: true,
    boundaryViolations: [],
    tokenUsage: {
      inputTokens: 11,
      outputTokens: 7,
      cacheReadTokens: 3,
      cacheCreationTokens: 2,
      totalTokens: 23,
      source: 'provider-adapter',
    },
    cost: { usd: 0.01, currency: 'USD', pricingSource: 'provider-receipt', isLocal: false },
    providerBilling: {
      source: 'provider-envelope',
      provider: 'codex',
      currency: 'USD',
      providerReportedUsd: 0.01,
      modelUsage: { 'gpt-5.6-sol': { inputTokens: 11, outputTokens: 7, costUsd: 0.01 } },
      capturedAt: '2026-08-22T00:00:00.000Z',
    },
    tests: { passed: 1, failed: 0, total: 1, coverage: null, command: null, orchestratorVerified: true },
    tsc: { clean: true, errors: 0 },
    selfAssessment: 'DONE',
    goCriteria: [],
    notes,
    brainEvaluation: null,
    brainEvaluationReason: null,
    rubricScores: null,
    totalScore: null,
    honestGate: { flagged: false, violation: null },
    handoffNotes: null,
    sharedNotes: [],
    auditorValidation: null,
  };
}

describe('worker terminal result authority wiring', () => {
  it('publishes canonical result bytes without dropping provider usage or billing evidence', () => {
    const root = projectRoot();
    const tasks = join(root, '.tasks');
    const result = canonicalResult();
    writeResult(root, result, undefined, 'attempt-621-003');

    const document = JSON.parse(readFileSync(join(tasks, 'task-621-003.result'), 'utf8')) as {
      attemptId: string;
      result: TaskResultV1;
    };
    expect(document.attemptId).toBe('attempt-621-003');
    expect(document.result.tokenUsage).toEqual(result.tokenUsage);
    expect(document.result.providerBilling).toEqual(result.providerBilling);
  });

  it('rejects control characters before publishing or advancing terminal worker state', () => {
    const root = projectRoot();
    const resultPath = join(root, '.tasks', 'task-621-003.result');

    expect(() => writeResult(root, canonicalResult('invalid\u0000notes'), undefined, 'attempt-621-003'))
      .toThrowError(expect.objectContaining({ name: 'TaskResultWriteError', code: 'schema-invalid' }));
    expect(() => readFileSync(resultPath)).toThrow();
    const task = JSON.parse(readFileSync(join(root, '.tasks', 'task-621-003.json'), 'utf8')) as { status: string };
    expect(task.status).toBe('EXECUTING');
  });

  it('fails with a typed worker-visible error when canonical attempt identity is absent', () => {
    const root = projectRoot();
    const previous = process.env.DECKENT_ATTEMPT_ID;
    delete process.env.DECKENT_ATTEMPT_ID;
    try {
      expect(() => writeResult(root, canonicalResult())).toThrow(TaskResultWriteError);
      expect(() => readFileSync(join(root, '.tasks', 'task-621-003.result'))).toThrow();
    } finally {
      if (previous === undefined) delete process.env.DECKENT_ATTEMPT_ID;
      else process.env.DECKENT_ATTEMPT_ID = previous;
    }
  });
});
