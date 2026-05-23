/**
 * Sprint 191 hotfix — checkWorkerLiveness 5-layer signal evaluation
 * Memory: [[feedback_no_synthetic_results]]
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkWorkerLiveness,
  LIVENESS_FRESHNESS_MS,
} from '../../src/orchestra/worker-liveness.js';
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

describe('checkWorkerLiveness — 5-layer signal evaluation', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-liveness-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('L1: never-spawned when assignedWorker missing — short-circuits without probing other signals', () => {
    const task = { ...baseTask, assignedWorker: undefined } as Task;
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => {
        throw new Error('should not probe docker when L1 fails');
      },
    });
    expect(result.status).toBe('never-spawned');
    expect(result.signals.assignedWorker).toBe(false);
    expect(result.reason).toContain('dispatcher never reached');
  });

  it('L2: alive when docker container running, even without heartbeat/log', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: (name) => {
        expect(name).toBe('deckent-w-191-009');
        return true;
      },
    });
    expect(result.status).toBe('alive');
    expect(result.signals.dockerRunning).toBe(true);
  });

  it('L3: alive when heartbeat fresh', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const hbPath = join(root, '.tasks', 'task-191-009.hb');
    writeFileSync(hbPath, '{"taskId":"191-009"}', 'utf-8');
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => false,
    });
    expect(result.status).toBe('alive');
    expect(result.signals.heartbeatFresh).toBe(true);
  });

  it('L3 negative: heartbeat older than 90s → not fresh', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const hbPath = join(root, '.tasks', 'task-191-009.hb');
    writeFileSync(hbPath, '{"taskId":"191-009"}', 'utf-8');
    // Backdate mtime to 2 minutes ago
    const staleSec = Date.now() / 1000 - 120;
    utimesSync(hbPath, staleSec, staleSec);
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => false,
    });
    expect(result.signals.heartbeatFresh).toBe(false);
    expect(result.status).toBe('dead');
  });

  it('L4: alive when log file growing (mtime fresh) even without HB', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const logPath = join(root, '.tasks', 'task-191-009.log');
    writeFileSync(logPath, 'still writing...\n', 'utf-8');
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => false,
    });
    expect(result.signals.logGrowing).toBe(true);
    expect(result.status).toBe('alive');
  });

  it('L5: partial-result detected but ALONE does NOT promote to alive — needs docker/hb/log', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const partialPath = join(root, '.tasks', 'task-191-009.partial-result');
    writeFileSync(partialPath, '{"selfAssessment":"NO_GO"}', 'utf-8');
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => false,
    });
    expect(result.signals.partialResultExists).toBe(true);
    expect(result.status).toBe('dead');
    expect(result.reason).toContain('partial=true');
  });

  it('dead: no signals at all → genuine timeout', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => false,
    });
    expect(result.status).toBe('dead');
    expect(result.signals.dockerRunning).toBe(false);
    expect(result.signals.heartbeatFresh).toBe(false);
    expect(result.signals.logGrowing).toBe(false);
    expect(result.signals.partialResultExists).toBe(false);
  });

  it('docker probe errors fail closed (false, not throw)', () => {
    const task = { ...baseTask, assignedWorker: 'w-191-009' } as Task;
    const result = checkWorkerLiveness(task, root, {
      isDockerContainerRunning: () => { throw new Error('docker absent'); },
    });
    // Should swallow throw → dead status
    expect(result.status).toBe('dead');
  });

  it('LIVENESS_FRESHNESS_MS is 90 seconds (matches RUNTIME_EXTENSION_HEARTBEAT_FRESH_S)', () => {
    expect(LIVENESS_FRESHNESS_MS).toBe(90_000);
  });
});
