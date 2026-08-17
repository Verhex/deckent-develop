import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildRunInspectorSnapshot,
  readRunInspectorTaskDetail,
  SPRINT_DETAIL_TEXT_CAP,
} from '../../src/core/run-inspector-read-model.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-run-inspector-'));
  roots.push(value);
  return value;
}

function write(projectRoot: string, relative: string, value: unknown): string {
  const path = join(projectRoot, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
  return path;
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('run inspector read model', () => {
  it('returns an honest idle snapshot for an empty project without writing files', () => {
    const projectRoot = root();
    const before = readFileNames(projectRoot);
    const snapshot = buildRunInspectorSnapshot(projectRoot, { nowMs: 1_700_000_000_000 });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: '2023-11-14T22:13:20.000Z',
      revision: 0,
      sprintId: null,
      phase: null,
      workers: [],
      locks: [],
      lifecycle: { lifecycle: 'IDLE' },
    });
    expect(readFileNames(projectRoot)).toEqual(before);
  });

  it('sources the full lifecycle from authority and never echoes an ignored raw PAUSED claim', () => {
    const projectRoot = root();
    write(projectRoot, '.deckent/sprint-state.json', {
      sprintId: 'sprint-541',
      phase: 'CLEANUP',
      status: 'COMPLETE',
      lifecycle: 'PAUSED',
    });

    const snapshot = buildRunInspectorSnapshot(projectRoot, { nowMs: 1_700_000_000_000 });
    expect(snapshot.lifecycle.lifecycle).toBe('COMPLETE');
    expect(snapshot.lifecycle.status).toBe('COMPLETE');
    expect(snapshot.sprintId).toBe(snapshot.lifecycle.sprintId);
    expect(snapshot.phase).toBe(snapshot.lifecycle.phase);
    expect(JSON.stringify(snapshot)).not.toContain('PAUSED');
  });

  it('tolerates torn task and heartbeat JSON while retaining valid task detail', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-541-bad.json', '{torn');
    write(projectRoot, '.tasks/task-541-001.json', {
      id: '541-001',
      description: 'Inspector title\nMore detail',
      status: 'IN_PROGRESS',
      assignedAgent: 'implementer',
      model: 'gpt-5.6-sol',
      scope: { filesWrite: ['src/core/run-inspector-read-model.ts'] },
    });
    write(projectRoot, '.tasks/task-541-001.hb', '{torn');

    expect(buildRunInspectorSnapshot(projectRoot).workers).toEqual([{
      taskId: '541-001',
      title: 'Inspector title',
      status: 'IN_PROGRESS',
      agent: 'implementer',
      model: 'gpt-5.6-sol',
      filesWrite: ['src/core/run-inspector-read-model.ts'],
      hb: null,
    }]);
  });

  it('advances revision when a read source changes and is stable for equal inputs', () => {
    const projectRoot = root();
    const taskPath = write(projectRoot, '.tasks/task-541-001.json', {
      id: '541-001', description: 'First', status: 'PENDING', scope: { filesWrite: [] },
    });
    utimesSync(taskPath, new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    const first = buildRunInspectorSnapshot(projectRoot, { nowMs: 1_800_000_000_000 });
    const equal = buildRunInspectorSnapshot(projectRoot, { nowMs: 1_800_000_000_000 });
    expect(equal.revision).toBe(first.revision);

    writeFileSync(taskPath, JSON.stringify({
      id: '541-001', description: 'Changed', status: 'PENDING', scope: { filesWrite: [] },
    }));
    utimesSync(taskPath, new Date(1_700_000_001_000), new Date(1_700_000_001_000));
    expect(buildRunInspectorSnapshot(projectRoot).revision).toBeGreaterThan(first.revision);
  });

  it('lists valid locks and reads capped task detail with task-id validation', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-541-001.json', { id: '541-001', description: 'Task' });
    write(projectRoot, '.tasks/task-541-001.plan', 'p'.repeat(SPRINT_DETAIL_TEXT_CAP + 1));
    write(projectRoot, '.tasks/task-541-001.result', { selfAssessment: 'DONE', notes: 'ok' });
    write(projectRoot, '.locks/src__core__x.ts.lock', {
      filePath: 'src/core/x.ts', ownerWorkerId: 'w-1', acquiredAt: 'now', taskId: '541-001',
    });
    write(projectRoot, '.locks/torn.lock', '{bad');

    expect(buildRunInspectorSnapshot(projectRoot).locks).toEqual([{
      filePath: 'src/core/x.ts', ownerWorkerId: 'w-1', acquiredAt: 'now', taskId: '541-001',
    }]);
    const detail = readRunInspectorTaskDetail(projectRoot, '541-001');
    expect(detail?.plan?.truncated).toBe(true);
    expect(detail?.plan?.text).toHaveLength(SPRINT_DETAIL_TEXT_CAP);
    expect(detail?.result).toEqual({ selfAssessment: 'DONE', notes: 'ok' });
    expect(readRunInspectorTaskDetail(projectRoot, '../escape')).toBeNull();
    expect(readRunInspectorTaskDetail(projectRoot, 'missing')).toBeNull();
  });
});

function readFileNames(projectRoot: string): string[] {
  return readdirSync(projectRoot, { recursive: true, encoding: 'utf8' }).sort();
}
