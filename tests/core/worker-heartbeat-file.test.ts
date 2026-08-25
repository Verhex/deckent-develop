import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkerActivityHeartbeat,
  writeTaskHeartbeatFile,
} from '../../src/core/worker-activity-heartbeat.js';

const roots: string[] = [];

function heartbeatPath(): string {
  const root = mkdtempSync(join(tmpdir(), 'worker-heartbeat-file-'));
  roots.push(root);
  return join(root, 'task-674-001.hb');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('writeTaskHeartbeatFile', () => {
  it('atomically writes without leaving a temporary artifact', () => {
    const path = heartbeatPath();
    const payload = createWorkerActivityHeartbeat({
      taskId: '674-001', workerId: 'w-674-001', attemptId: 'attempt-1',
      backend: 'subprocess', status: 'EXECUTING', currentAction: 'Testing',
      observedAt: '2026-08-25T12:00:00.000Z',
    });

    expect(writeTaskHeartbeatFile(path, payload)).toEqual({ state: 'WRITTEN' });

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(payload);
    expect(readdirSync(join(path, '..'))).toEqual(['task-674-001.hb']);
  });

  it('skips a timestamp regression for the same canonical attempt', () => {
    const path = heartbeatPath();
    const base = {
      taskId: '674-001', workerId: 'w-674-001', attemptId: 'attempt-1',
      backend: 'subprocess' as const, status: 'EXECUTING', currentAction: 'Testing',
    };
    const current = createWorkerActivityHeartbeat({
      ...base, observedAt: '2026-08-25T12:00:00.000Z',
    });
    const stale = createWorkerActivityHeartbeat({
      ...base, observedAt: '2026-08-25T11:59:59.000Z',
    });
    writeTaskHeartbeatFile(path, current);

    expect(writeTaskHeartbeatFile(path, stale)).toEqual({
      state: 'SKIPPED', reasonCode: 'MONOTONIC_REGRESSION',
    });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(current);
  });

  it('writes a legacy heartbeat without dropping fields', () => {
    const path = heartbeatPath();
    const legacy = {
      workerId: 'w-674-001', taskId: '674-001', status: 'EXECUTING',
      currentAction: 'Testing', timestamp: '2026-08-25T12:00:00.000Z',
      filesChangedCount: 2, sequence: 3, progress: 40,
      agentId: 'implementer', backend: 'subprocess', pid: 12345,
    };

    expect(writeTaskHeartbeatFile(path, legacy)).toEqual({ state: 'WRITTEN' });

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(legacy);
  });
});
