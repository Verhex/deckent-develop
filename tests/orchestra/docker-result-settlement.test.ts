import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRef,
  listPendingTaskResultSettlementAttempts,
  readTaskResultSettlementClosure,
  readTaskResultSettlement,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementPreparedAtomic,
  writeTaskResultSettlementAttemptAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  closeDockerTaskResultSettlement,
  persistDockerTaskResultSettlement,
  reconcileDockerHostTerminalResultFile,
} from '../../src/orchestra/spawn-backend-docker.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; tasks: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-docker-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const tasks = join(root, '.tasks');
  mkdirSync(tasks, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root, tasks };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('persistDockerTaskResultSettlement', () => {
  it('embeds the final result under the exact project/task/attempt authority', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-a';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      notes: 'host final',
    }), 'utf-8');

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 137)).toBe(true);
    expect(readTaskResultSettlement(ref)).toMatchObject({
      exitCode: 137,
      result: { taskId, selfAssessment: 'NO_GO', notes: 'host final' },
    });

    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
    }), 'utf-8');
    expect(readTaskResultSettlement(ref)?.result).toMatchObject({ selfAssessment: 'NO_GO' });
  });

  it('does not invent authority for direct legacy backend calls and rejects cross-project refs', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-b';
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({ taskId, selfAssessment: 'DONE' }), 'utf-8');
    expect(persistDockerTaskResultSettlement(root, tasks, undefined, 0)).toBe(false);

    const ref = createTaskResultSettlementRef(root, taskId);
    const otherRoot = join(root, '..', 'other');
    mkdirSync(otherRoot, { recursive: true });
    expect(() => persistDockerTaskResultSettlement(otherRoot, tasks, ref, 0)).toThrow(/authority/);
  });

  it('closes the durable claim only after dispatch, settlement and lifecycle cleanup evidence', () => {
    const { root, tasks } = fixture();
    const taskId = 'docker-closed';
    const ref = createTaskResultSettlementRef(root, taskId);
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
    writeTaskResultSettlementDispatchAtomic(ref, 'f'.repeat(64));
    writeFileSync(join(tasks, `task-${taskId}.result`), JSON.stringify({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
    }), 'utf-8');

    expect(persistDockerTaskResultSettlement(root, tasks, ref, 0)).toBe(true);
    expect(closeDockerTaskResultSettlement(ref, 'stopped-removed')).toBe(true);
    expect(readTaskResultSettlementClosure(ref)).toMatchObject({
      state: 'closed',
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(listPendingTaskResultSettlementAttempts(root)).toEqual([]);
  });
});

describe('reconcileDockerHostTerminalResultFile', () => {
  const contract = {
    version: 1,
    kind: 'terminal-verdict',
    protocol: 'xverify-v1',
  } as const;
  const event = (seq: number, type: string, content: unknown): string => JSON.stringify({
    ts: '2026-07-22T00:00:00.000Z',
    seq,
    type,
    content,
  });

  it('promotes only an exact wrapper marker from assistant protocol and preserves evidence', () => {
    const { tasks } = fixture();
    const taskId = 'xverify-a';
    const resultPath = join(tasks, `task-${taskId}.result`);
    const logPath = join(tasks, `task-${taskId}.log`);
    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
      markerType: 'EXIT_WITHOUT_RESULT',
      workPresent: false,
      diffStat: '',
      exitCode: 0,
      tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
      providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
    }), 'utf-8');
    writeFileSync(logPath, [
      event(1, 'text', { type: 'user', message: { content: [{ type: 'text', text: 'VERDICT: REFUTED prompt example' }] } }),
      event(2, 'text', { type: 'assistant', message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED exact host evidence' }] } }),
      event(3, 'usage', { type: 'result', result: 'VERDICT: REFUTED copied envelope' }),
    ].join('\n'), 'utf-8');

    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBe(
      'VERDICT: CONFIRMED exact host evidence',
    );
    const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(result).toMatchObject({
      taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
      exitCode: 0,
      tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
      providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
    });
    expect(result).not.toHaveProperty('markerType');
    expect(result).not.toHaveProperty('workPresent');
    expect(result).not.toHaveProperty('diffStat');
    expect(String(result['notes'])).toMatch(/VERDICT: CONFIRMED exact host evidence$/);
  });

  it('does not promote prompt echoes, incomplete protocol, or a genuine worker result', () => {
    const { tasks } = fixture();
    const taskId = 'xverify-b';
    const resultPath = join(tasks, `task-${taskId}.result`);
    const logPath = join(tasks, `task-${taskId}.log`);
    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      markerType: 'EXIT_WITHOUT_RESULT',
      exitCode: 0,
    }), 'utf-8');
    writeFileSync(logPath, event(1, 'text', {
      type: 'user',
      message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED prompt echo' }] },
    }), 'utf-8');
    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBeNull();

    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      markerType: 'EXIT_WITHOUT_RESULT',
      exitCode: 1,
    }), 'utf-8');
    writeFileSync(logPath, event(2, 'text', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED process still failed' }] },
    }), 'utf-8');
    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBeNull();

    writeFileSync(resultPath, JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'genuine worker failure',
    }), 'utf-8');
    writeFileSync(logPath, event(2, 'text', {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED should not override' }] },
    }), 'utf-8');
    expect(reconcileDockerHostTerminalResultFile(resultPath, logPath, taskId, contract)).toBeNull();
    expect(JSON.parse(readFileSync(resultPath, 'utf-8'))).toMatchObject({
      selfAssessment: 'NO_GO',
      notes: 'genuine worker failure',
    });
  });
});
