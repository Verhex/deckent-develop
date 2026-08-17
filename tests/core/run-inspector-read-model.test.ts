import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildRunInspectorSnapshot,
  listRunInspectorRuns,
  observeRunInspectorSnapshot,
  readRunInspectorTaskDetail,
  RUN_INSPECTOR_OBSERVER_FAILURE_THRESHOLD,
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
  vi.useRealTimers();
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
      logTail: { lines: ['private log content'], truncated: false },
      resultEvidence: {
        selfAssessment: 'DONE', filesChanged: ['src/core/x.ts'], notesPresent: true,
      },
    });
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
      logPath: null, logTailAvailable: false, logTail: null, resultEvidence: null,
    });
  });

  it('returns the last default or overridden number of log lines', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-544-001.json', { id: '544-001', description: 'Task' });
    write(projectRoot, '.tasks/task-544-001.log', Array.from(
      { length: 45 },
      (_, index) => `line-${index + 1}`,
    ).join('\n'));

    expect(readRunInspectorTaskDetail(projectRoot, '544-001')?.lineage.logTail).toEqual({
      lines: Array.from({ length: 40 }, (_, index) => `line-${index + 6}`),
      truncated: true,
    });
    expect(readRunInspectorTaskDetail(projectRoot, '544-001', { tailLines: 3 })
      ?.lineage.logTail).toEqual({
      lines: ['line-43', 'line-44', 'line-45'],
      truncated: true,
    });
  });

  it('hard-caps the requested line count and joined tail bytes without an ellipsis', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-544-002.json', { id: '544-002', description: 'Task' });
    write(projectRoot, '.tasks/task-544-002.log', [
      ...Array.from({ length: 201 }, (_, index) => `discard-${index}`),
      'x'.repeat(SPRINT_DETAIL_TEXT_CAP + 1),
    ].join('\n'));

    const tail = readRunInspectorTaskDetail(projectRoot, '544-002', { tailLines: 500 })
      ?.lineage.logTail;
    expect(tail?.truncated).toBe(true);
    expect(tail?.lines).toHaveLength(1);
    expect(Buffer.byteLength(tail?.lines.join('\n') ?? '', 'utf8')).toBe(SPRINT_DETAIL_TEXT_CAP);
    expect(tail?.lines[0]).toBe('x'.repeat(SPRINT_DETAIL_TEXT_CAP));
    expect(tail?.lines.join('\n')).not.toContain('…');
  });

  it('keeps a torn final log line as-is', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-544-003.json', { id: '544-003', description: 'Task' });
    write(projectRoot, '.tasks/task-544-003.log', 'complete\r\ntorn');

    expect(readRunInspectorTaskDetail(projectRoot, '544-003')?.lineage.logTail).toEqual({
      lines: ['complete', 'torn'], truncated: false,
    });
  });

  it('degrades invalid UTF-8 log content to null while retaining availability truth', () => {
    const projectRoot = root();
    write(projectRoot, '.tasks/task-544-004.json', { id: '544-004', description: 'Task' });
    const logPath = write(projectRoot, '.tasks/task-544-004.log', 'valid');
    writeFileSync(logPath, Buffer.from([0xc3, 0x28]));

    expect(readRunInspectorTaskDetail(projectRoot, '544-004')?.lineage).toMatchObject({
      logTailAvailable: true,
      logTail: null,
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

  it('delivers the current snapshot immediately when no revision cursor is supplied', () => {
    vi.useFakeTimers();
    const projectRoot = root();
    const onSnapshot = vi.fn();

    const observer = observeRunInspectorSnapshot(projectRoot, { onSnapshot });

    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(onSnapshot.mock.calls[0]?.[0]).toMatchObject({ schemaVersion: 1, revision: 0 });
    vi.advanceTimersByTime(250);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    observer.close();
  });

  it('primes a reconnect cursor without delivering a duplicate snapshot', () => {
    vi.useFakeTimers();
    const projectRoot = root();
    const revision = buildRunInspectorSnapshot(projectRoot).revision;
    const onSnapshot = vi.fn();
    const observer = observeRunInspectorSnapshot(projectRoot, {
      sinceRevision: revision,
      onSnapshot,
    });

    expect(onSnapshot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onSnapshot).not.toHaveBeenCalled();
    observer.close();
  });

  it('coalesces rapid source changes and delivers only the latest revision on the next tick', () => {
    vi.useFakeTimers();
    const projectRoot = root();
    const onSnapshot = vi.fn();
    const observer = observeRunInspectorSnapshot(projectRoot, { intervalMs: 1, onSnapshot });
    const taskPath = write(projectRoot, '.tasks/task-543-001.json', {
      id: '543-001', description: 'First', status: 'PENDING', scope: { filesWrite: [] },
    });
    utimesSync(taskPath, new Date(1_700_000_001_000), new Date(1_700_000_001_000));
    writeFileSync(taskPath, JSON.stringify({
      id: '543-001', description: 'Latest', status: 'PENDING', scope: { filesWrite: [] },
    }));
    utimesSync(taskPath, new Date(1_700_000_002_000), new Date(1_700_000_002_000));

    vi.advanceTimersByTime(249);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    expect(onSnapshot.mock.calls[1]?.[0].workers[0]?.title).toBe('Latest');
    observer.close();
  });

  it('closes idempotently and stops future polling', () => {
    vi.useFakeTimers();
    const projectRoot = root();
    const onSnapshot = vi.fn();
    const observer = observeRunInspectorSnapshot(projectRoot, { onSnapshot });

    observer.close();
    observer.close();
    write(projectRoot, '.tasks/task-543-001.json', { id: '543-001', description: 'Later' });
    vi.advanceTimersByTime(1_000);
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('contains callback errors and reports a persistent read failure once', () => {
    vi.useFakeTimers();
    const callbackError = new Error('consumer failed');
    const onSnapshot = vi.fn(() => { throw callbackError; });
    const healthy = observeRunInspectorSnapshot(root(), { onSnapshot });
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    healthy.close();

    const onError = vi.fn(() => { throw new Error('reporter failed'); });
    const broken = observeRunInspectorSnapshot(null as unknown as string, {
      onSnapshot: vi.fn(),
      onError,
    });
    expect(() => vi.advanceTimersByTime(
      250 * (RUN_INSPECTOR_OBSERVER_FAILURE_THRESHOLD + 2),
    )).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'PERSISTENT_READ_FAILURE',
      consecutiveFailures: RUN_INSPECTOR_OBSERVER_FAILURE_THRESHOLD,
    });
    broken.close();
  });
});

function readFileNames(projectRoot: string): string[] {
  return readdirSync(projectRoot, { recursive: true, encoding: 'utf8' }).sort();
}
