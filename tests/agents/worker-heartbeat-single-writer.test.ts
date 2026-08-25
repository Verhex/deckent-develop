import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { refreshWaitingHeartbeat } from '../../src/agents/worker-approval-env.js';
import { writeTaskHeartbeatFile } from '../../src/core/worker-activity-heartbeat.js';
import { GeminiAdapter } from '../../src/providers/gemini.js';

interface LegacyHeartbeat {
  workerId: string;
  taskId: string;
  status: string;
  currentAction: string;
  timestamp: string;
  filesChangedCount: number;
  sequence: number;
}

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-heartbeat-writer-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  return root;
}

function heartbeat(
  taskId: string,
  sequence: number,
  timestamp: string,
): LegacyHeartbeat {
  return {
    workerId: `worker-${taskId}`,
    taskId,
    status: 'EXECUTING',
    currentAction: 'working',
    timestamp,
    filesChangedCount: 0,
    sequence,
  };
}

function readHeartbeat(path: string): LegacyHeartbeat {
  return JSON.parse(readFileSync(path, 'utf8')) as LegacyHeartbeat;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('single heartbeat writer primitive wiring', () => {
  it('never lets two competing writers regress the persisted heartbeat', () => {
    const path = join(makeRoot(), '.tasks', 'task-race.hb');
    const newer = heartbeat('race', 2, '2026-08-25T12:00:02.000Z');
    const stale = heartbeat('race', 1, '2026-08-25T12:00:01.000Z');

    const winningWrite = writeTaskHeartbeatFile(path, newer);
    const losingWrite = writeTaskHeartbeatFile(path, stale);

    expect(winningWrite).toEqual({ state: 'WRITTEN' });
    expect(losingWrite).toEqual({
      state: 'SKIPPED',
      reasonCode: 'MONOTONIC_REGRESSION',
    });
    expect(readHeartbeat(path)).toEqual(newer);
  });

  it('advances every approval-wait refresh monotonically', () => {
    const root = makeRoot();
    const path = join(root, '.tasks', 'task-approval.hb');
    writeFileSync(
      path,
      JSON.stringify(heartbeat('approval', 7, '2020-01-01T00:00:00.000Z')),
      'utf8',
    );

    refreshWaitingHeartbeat(root, 'approval');
    const first = readHeartbeat(path);
    refreshWaitingHeartbeat(root, 'approval');
    const second = readHeartbeat(path);

    expect(first.sequence).toBe(8);
    expect(second.sequence).toBe(9);
    expect(Date.parse(second.timestamp)).toBeGreaterThanOrEqual(
      Date.parse(first.timestamp),
    );
    expect(second.currentAction).toBe('awaiting approval decision');
  });

  it('routes a provider heartbeat through the monotonic primitive in a tmpdir', () => {
    class TestGeminiAdapter extends GeminiAdapter {
      writeProviderHeartbeat(taskId: string, root: string): void {
        this.writeHeartbeat(taskId, root, 'EXECUTING');
      }
    }

    const root = makeRoot();
    const path = join(root, '.tasks', 'task-provider.hb');
    const authoritative = heartbeat(
      'provider',
      9,
      '2099-01-01T00:00:00.000Z',
    );
    writeTaskHeartbeatFile(path, authoritative);

    new TestGeminiAdapter(root).writeProviderHeartbeat('provider', root);

    expect(readHeartbeat(path)).toEqual(authoritative);
  });
});
