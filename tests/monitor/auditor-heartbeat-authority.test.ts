import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  isWorkerStale,
  readHeartbeatAuthoritySnapshots,
  scanHeartbeats,
} from '../../src/monitor/auditor.js';
import { RUNTIME_DIR, TASKS_DIR } from '../../src/core/constants.js';
import { WorkerHeartbeatAuthorityStore } from '../../src/core/worker-heartbeat-authority-store.js';
import type { WorkerHeartbeatAuthorityIdentity } from '../../src/core/worker-heartbeat-authority.js';
import { AgentStatus, type Heartbeat } from '../../src/core/types.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'auditor-heartbeat-authority-'));
  roots.push(value);
  mkdirSync(join(value, TASKS_DIR), { recursive: true });
  return value;
}

function identity(): WorkerHeartbeatAuthorityIdentity {
  return { runId: 'run-487', taskId: '487-014', attemptId: 'attempt-1', workerId: 'w-487-014', fence: 'fence-1' };
}

function heartbeat(): Heartbeat {
  return {
    workerId: 'w-487-014', taskId: '487-014', status: AgentStatus.EXECUTING,
    currentAction: 'working', timestamp: '2026-07-31T10:00:00.000Z',
    filesChangedCount: 0, sequence: 1, progress: 10,
  };
}

function observe(projectRoot: string, overrides: Partial<Parameters<WorkerHeartbeatAuthorityStore['observe']>[0]> = {}): void {
  const store = new WorkerHeartbeatAuthorityStore(join(projectRoot, RUNTIME_DIR, 'worker-heartbeat-authority'));
  const exactIdentity = identity();
  expect(store.initialize(exactIdentity).state).toBe('READY');
  expect(store.observe({
    identity: exactIdentity,
    expectedHostSequence: 0,
    hostProcessOutcome: { state: 'running', exitCode: null },
    workerTaskVerdict: 'pending',
    liveness: 'alive',
    ...overrides,
  }).state).toBe('ACCEPTED');
}

afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }); });

describe('auditor heartbeat authority consumer', () => {
  it('uses a fenced alive snapshot for liveness even when the legacy heartbeat is stale', () => {
    const projectRoot = root();
    observe(projectRoot);
    const snapshots = readHeartbeatAuthoritySnapshots(projectRoot);

    expect(snapshots).toHaveLength(1);
    expect(isWorkerStale(heartbeat(), projectRoot, 1, undefined, snapshots[0])).toBe(false);
  });

  it('keeps task verdict separate from host exit outcome when deciding terminal state', () => {
    const projectRoot = root();
    observe(projectRoot, {
      hostProcessOutcome: { state: 'exited', exitCode: 7 },
      workerTaskVerdict: 'no-go',
      liveness: 'not-alive',
    });
    const snapshot = readHeartbeatAuthoritySnapshots(projectRoot)[0];

    expect(isWorkerStale(heartbeat(), projectRoot, 1, undefined, snapshot)).toBe(true);
  });

  it('reads authority snapshots without caching, so a new fence is visible immediately', () => {
    const projectRoot = root();
    observe(projectRoot);
    expect(readHeartbeatAuthoritySnapshots(projectRoot)).toHaveLength(1);

    const second = { ...identity(), attemptId: 'attempt-2', fence: 'fence-2' };
    const store = new WorkerHeartbeatAuthorityStore(join(projectRoot, RUNTIME_DIR, 'worker-heartbeat-authority'));
    store.initialize(second);
    expect(store.observe({ identity: second, expectedHostSequence: 0, hostProcessOutcome: { state: 'running', exitCode: null }, workerTaskVerdict: 'pending', liveness: 'alive' }).state).toBe('ACCEPTED');

    expect(readHeartbeatAuthoritySnapshots(projectRoot)).toHaveLength(2);
  });

  it('turns conflicting fences into a HOLD alert instead of a stale decision', () => {
    const projectRoot = root();
    observe(projectRoot);
    const second = { ...identity(), attemptId: 'attempt-2', fence: 'fence-2' };
    const store = new WorkerHeartbeatAuthorityStore(join(projectRoot, RUNTIME_DIR, 'worker-heartbeat-authority'));
    store.initialize(second);
    store.observe({ identity: second, expectedHostSequence: 0, hostProcessOutcome: { state: 'running', exitCode: null }, workerTaskVerdict: 'pending', liveness: 'alive' });

    // scan needs a legacy display heartbeat but does not write or overwrite it.
    writeFileSync(join(projectRoot, TASKS_DIR, 'task-487-014.hb'), JSON.stringify(heartbeat()));
    const result = scanHeartbeats(projectRoot, 1);
    expect(result.staleAgents).toEqual([]);
    expect(result.alerts).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'WARNING', source: 'w-487-014' })]));
  });
});
