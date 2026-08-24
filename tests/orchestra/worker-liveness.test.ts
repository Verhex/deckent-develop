/**
 * Sprint 191 hotfix — checkWorkerLiveness 5-layer signal evaluation
 * Memory: [[feedback_no_synthetic_results]]
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkWorkerLiveness,
  readHostHeartbeatAuthority,
} from '../../src/orchestra/worker-liveness.js';
import { createWorkerActivityHeartbeat } from '../../src/core/worker-activity-heartbeat.js';
import type { Task } from '../../src/core/task-types.js';

const baseTask: Task = {
  id: '191-009',
  title: 'IDENTITY.md AUTOGEN extension',
  description: '',
  model: 'opus',
  effort: 'normal',
  priority: 'NORMAL',
  reason: 'test',
  scope: { directories: [], filesRead: [], filesWrite: [] },
  dependencies: [],
  goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
  status: 'PENDING',
  sprintId: 'sprint-191',
  createdAt: new Date().toISOString(),
} as Task;

describe('checkWorkerLiveness — host heartbeat authority read model', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-liveness-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeActivity(overrides: Partial<ReturnType<typeof createWorkerActivityHeartbeat>> = {}): void {
    writeFileSync(join(root, '.tasks', 'task-191-009.hb'), JSON.stringify({
      ...createWorkerActivityHeartbeat({
        taskId: '191-009', workerId: 'w-191-009', attemptId: 'attempt-a',
        backend: 'docker', status: 'EXECUTING', currentAction: 'Working',
        observedAt: '2026-08-24T12:00:00.000Z',
      }),
      ...overrides,
    }), 'utf8');
  }

  it('never-spawned when assignedWorker missing', () => {
    const task = { ...baseTask, assignedWorker: undefined } as Task;
    const result = checkWorkerLiveness(task, root);
    expect(result.status).toBe('never-spawned');
    expect(result.signals.assignedWorker).toBe(false);
    expect(result.reason).toContain('dispatcher never reached');
  });

  it('uses an exact activity attempt identity and host authority alive result', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    writeActivity();
    const result = checkWorkerLiveness(task, root, { readAuthority: (_root, activity) => {
      expect(activity.attemptId).toBe('attempt-a');
      return 'alive';
    } });
    expect(result.status).toBe('alive');
    expect(result.signals.authorityMatched).toBe(true);
  });

  it('does not use activity age as process truth', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    writeActivity({ observedAt: '2000-01-01T00:00:00.000Z' });
    const result = checkWorkerLiveness(task, root, { readAuthority: () => 'alive' });
    expect(result.status).toBe('alive');
  });

  it('preserves unavailable/HOLD instead of inventing dead', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    writeActivity();
    expect(checkWorkerLiveness(task, root, { readAuthority: () => 'unavailable' }).status)
      .toBe('unavailable');
  });

  it('returns dead only from explicit host authority', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    writeActivity();
    expect(checkWorkerLiveness(task, root, { readAuthority: () => 'dead' }).status).toBe('dead');
  });

  it('does not call a result-settled worker stale when authority is unavailable', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    writeFileSync(join(root, '.tasks', 'task-191-009.result'), '{}', 'utf8');
    const result = checkWorkerLiveness(task, root);
    expect(result.status).toBe('unavailable');
    expect(result.signals.resultSettled).toBe(true);
  });

  it('requires one matching exact attempt authority entry', () => {
    writeActivity();
    const runtime = join(root, '.deckent', 'runtime', 'worker-heartbeat-authority', 'entry');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'identity.json'), JSON.stringify({ identity: {
      taskId: '191-009', workerId: 'w-191-009', attemptId: 'attempt-a',
    } }), 'utf8');
    writeFileSync(join(runtime, '0000000000000001.json'), JSON.stringify({ liveness: 'alive' }), 'utf8');
    const activity = createWorkerActivityHeartbeat({
      taskId: '191-009', workerId: 'w-191-009', attemptId: 'attempt-a',
      backend: 'docker', status: 'EXECUTING', currentAction: 'Working',
      observedAt: '2026-08-24T12:00:00.000Z',
    });
    expect(readHostHeartbeatAuthority(root, activity)).toBe('alive');
  });

  it('uses the resolved project root identically from a nested cwd', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    writeActivity();
    const nested = join(root, 'nested');
    mkdirSync(nested);
    const previousCwd = process.cwd();
    try {
      process.chdir(nested);
      expect(checkWorkerLiveness(task, root, { readAuthority: () => 'alive' }).status)
        .toBe('alive');
    } finally {
      process.chdir(previousCwd);
    }
  });
});
