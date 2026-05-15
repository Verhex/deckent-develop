import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  getActiveWorkerIds,
  markPending,
  markActive,
  clearPending,
  _clearAllPending,
  _getPendingSpawns,
} from '../../src/core/active-workers.js';

const TEST_ROOT = '/tmp/test-active-workers-pending';

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(join(TEST_ROOT, '.tasks'), { recursive: true });
  _clearAllPending();
});

describe('PENDING_SPAWNS — race-window protection (Sprint 170 P0-5)', () => {
  it('markPending adds taskId to active list even without .hb file', () => {
    markPending('170-002');
    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active).toContain('170-002');
    expect(_getPendingSpawns()).toContain('170-002');
  });

  it('markActive transitions taskId out of pending Set (.hb is now authoritative)', () => {
    markPending('170-005');
    expect(_getPendingSpawns()).toContain('170-005');

    markActive('170-005');
    expect(_getPendingSpawns()).not.toContain('170-005');

    // After markActive, .hb file is what proves activity. If .hb absent and
    // pending is empty, active list is empty too.
    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active).not.toContain('170-005');
  });

  it('getActiveWorkerIds returns deduped union(pending, fromHeartbeats)', () => {
    // One taskId only in pending
    markPending('170-aaa');
    // One taskId only on disk
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-170-bbb.hb'),
      JSON.stringify({ workerId: 'docker-170-bbb', taskId: '170-bbb', status: 'EXECUTING' }),
    );
    // One taskId in BOTH (deduplication test)
    markPending('170-ccc');
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-170-ccc.hb'),
      JSON.stringify({ workerId: 'docker-170-ccc', taskId: '170-ccc', status: 'EXECUTING' }),
    );

    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active.sort()).toEqual(['170-aaa', '170-bbb', '170-ccc']);
    // No duplicates — 170-ccc appears exactly once
    expect(active.filter(id => id === '170-ccc')).toHaveLength(1);
  });

  it('clearPending removes a pending taskId (spawn-fail recovery path)', () => {
    markPending('170-fail');
    expect(_getPendingSpawns()).toContain('170-fail');

    clearPending('170-fail');
    expect(_getPendingSpawns()).not.toContain('170-fail');

    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active).not.toContain('170-fail');
  });
});
