import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildRunInspectorSnapshot,
  listRunInspectorRuns,
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
    write(projectRoot, '.tasks/task-541-001.result', {
      selfAssessment: 'DONE', filesChanged: ['src/core/x.ts'], notes: 'ok',
    });
    write(projectRoot, '.tasks/task-541-001.log', 'private log content');
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
    expect(detail?.result).toEqual({
      selfAssessment: 'DONE', filesChanged: ['src/core/x.ts'], notes: 'ok',
    });
    expect(detail?.lineage).toEqual({
      logPath: join('.tasks', 'task-541-001.log'),
      logTailAvailable: true,
      resultEvidence: {
        selfAssessment: 'DONE', filesChanged: ['src/core/x.ts'], notesPresent: true,
      },
    });
    expect(JSON.stringify(detail)).not.toContain('private log content');
    expect(readRunInspectorTaskDetail(projectRoot, '../escape')).toBeNull();
    expect(readRunInspectorTaskDetail(projectRoot, 'missing')).toBeNull();
  });

  it('lists the authority run first and archived settlement records newest-first', () => {
    const projectRoot = root();
    write(projectRoot, '.deckent/sprint-state.json', {
      sprintId: 'sprint-542', phase: 'CLEANUP', status: 'COMPLETE',
    });
    write(projectRoot, '.brain/sprints/sprint-540.md', [
      '# Sprint 540',
      '- **Status:** COMPLETE',
      '- **Started At:** 2026-08-15T10:00:00.000Z',
      '- **Settled At:** 2026-08-15T11:00:00.000Z',
      '- **Total Tasks:** 3',
      '- **Completed Tasks:** 2',
      '- **No-Go Tasks:** 1',
    ].join('\n'));
    write(projectRoot, '.brain/sprints/sprint-541.md', [
      '# Sprint 541',
      '**Record State:** LANDED',
      '**Settled At:** 2026-08-16T11:00:00.000Z',
    ].join('\n'));
    const archivePath = join(projectRoot, '.deckent/archive/sprints/sprint-539');
    mkdirSync(archivePath, { recursive: true });
    utimesSync(archivePath, new Date('2026-08-14T11:00:00.000Z'), new Date('2026-08-14T11:00:00.000Z'));

    const listing = listRunInspectorRuns(projectRoot, { nowMs: 1_800_000_000_000 });
    expect(listing).toMatchObject({ schemaVersion: 1, generatedAt: '2027-01-15T08:00:00.000Z' });
    expect(listing.runs.map(run => run.runId)).toEqual([
      'sprint-542', 'sprint-541', 'sprint-540', 'sprint-539',
    ]);
    expect(listing.runs[0]).toMatchObject({ source: 'authority', lifecycle: 'COMPLETE' });
    expect(listing.runs[1]).toEqual({
      runId: 'sprint-541', recordState: 'LANDED', source: 'archive',
      startedAt: null, settledAt: '2026-08-16T11:00:00.000Z', taskCounts: null,
    });
    expect(listing.runs[2]).toMatchObject({
      recordState: 'COMPLETE',
      taskCounts: { total: 3, completed: 2, noGo: 1, techDebt: null },
    });
  });

  it('honestly returns only the authority entry when archive sources are absent', () => {
    const listing = listRunInspectorRuns(root(), { nowMs: 1_700_000_000_000 });
    expect(listing.revision).toBe(0);
    expect(listing.runs).toEqual([{
      runId: null, lifecycle: 'IDLE', source: 'authority', startedAt: null,
      settledAt: null, taskCounts: null,
    }]);
  });

  it('reports absent lineage artifacts without fabricating evidence', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-542-001.json', { id: '542-001', description: 'Task' });
    expect(readRunInspectorTaskDetail(projectRoot, '542-001')?.lineage).toEqual({
      logPath: null, logTailAvailable: false, resultEvidence: null,
    });
  });

  it('advances run-list revision when an archive settlement record appears', () => {
    const projectRoot = root();
    const first = listRunInspectorRuns(projectRoot, { nowMs: 1_800_000_000_000 });
    const record = write(projectRoot, '.brain/sprints/sprint-541.md', [
      '# Sprint 541', '**Settled At:** 2026-08-16T11:00:00.000Z',
    ].join('\n'));
    utimesSync(record, new Date(1_700_000_001_000), new Date(1_700_000_001_000));
    const second = listRunInspectorRuns(projectRoot, { nowMs: 1_800_000_000_000 });
    expect(second.revision).toBeGreaterThan(first.revision);
    expect(second.runs).toHaveLength(2);
  });
});

function readFileNames(projectRoot: string): string[] {
  return readdirSync(projectRoot, { recursive: true, encoding: 'utf8' }).sort();
}
