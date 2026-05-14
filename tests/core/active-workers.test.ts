import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getActiveWorkerIds } from '../../src/core/active-workers.js';

const TEST_ROOT = '/tmp/test-active-workers';

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(join(TEST_ROOT, '.tasks'), { recursive: true });
});

describe('getActiveWorkerIds', () => {
  it('returns taskIds from .hb files', () => {
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-168-001.hb'),
      JSON.stringify({ workerId: 'docker-168-001', taskId: '168-001', status: 'EXECUTING' }),
    );
    writeFileSync(
      join(TEST_ROOT, '.tasks', 'task-168-002.hb'),
      JSON.stringify({ workerId: 'docker-168-002', taskId: '168-002', status: 'EXECUTING' }),
    );
    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active.sort()).toEqual(['168-001', '168-002']);
  });

  it('returns empty array if no .hb files', () => {
    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active).toEqual([]);
  });

  it('handles malformed .hb files gracefully', () => {
    writeFileSync(join(TEST_ROOT, '.tasks', 'task-168-001.hb'), 'not-json');
    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active).toEqual([]);
  });

  it('returns empty array if .tasks directory does not exist', () => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    const active = getActiveWorkerIds(TEST_ROOT);
    expect(active).toEqual([]);
  });
});
