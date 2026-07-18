// ═══ sprint-live-service — 588/F1 «Köprü» read-model pins ═══════════════════
//
// Hermetic tmpdir fixtures for the exact on-disk shapes the terminal itself
// writes (.tasks/task-*.json + .hb, sprint-state.json, .locks). The honesty
// lines: tolerant parses (garbage degrades to absence, never a throw),
// hb-age from the heartbeat's OWN timestamp, path-safe drill-in ids.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readSprintLive,
  readSprintTaskDetail,
  SPRINT_DETAIL_TEXT_CAP,
} from '../../src/orchestra/sprint-live-service.js';

let root: string;
const NOW = Date.parse('2026-07-18T12:00:00.000Z');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprint-live-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function seedTask(id: string, overrides: Record<string, unknown> = {}): void {
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(join(root, '.tasks', `task-${id}.json`), JSON.stringify({
    id,
    description: `Task ${id} does a thing\nsecond line ignored`,
    status: 'EXECUTING',
    model: 'sonnet',
    agent: 'api-builder',
    scope: { filesWrite: ['src/a.ts', 'src/b.ts'] },
    ...overrides,
  }), 'utf-8');
}

describe('readSprintLive — the «Köprü» snapshot', () => {
  it('empty project → honest inactive snapshot (no throw, no invention)', () => {
    const snap = readSprintLive(root, NOW);
    expect(snap).toMatchObject({ sprintId: null, phase: null, workers: [], locks: [], active: false });
    expect(snap.generatedAt).toBe('2026-07-18T12:00:00.000Z');
  });

  it('folds task + heartbeat into a worker card (title=first line capped, hb-age from ITS timestamp)', () => {
    seedTask('001');
    writeFileSync(join(root, '.tasks', 'task-001.hb'), JSON.stringify({
      workerId: 'w-1', taskId: '001', status: 'WORKING',
      currentAction: 'editing src/a.ts', currentFile: 'src/a.ts',
      filesChangedCount: 2, sequence: 7,
      timestamp: '2026-07-18T11:59:20.000Z', // 40s önce
    }), 'utf-8');

    const snap = readSprintLive(root, NOW);
    expect(snap.active).toBe(true);
    expect(snap.workers).toHaveLength(1);
    const worker = snap.workers[0]!;
    expect(worker).toMatchObject({
      taskId: '001',
      title: 'Task 001 does a thing',
      status: 'EXECUTING',
      agent: 'api-builder',
      model: 'sonnet',
      filesWrite: ['src/a.ts', 'src/b.ts'],
    });
    expect(worker.hb).toMatchObject({
      status: 'WORKING', currentAction: 'editing src/a.ts', currentFile: 'src/a.ts',
      filesChangedCount: 2, sequence: 7, ageMs: 40_000,
    });
  });

  it('reads phase from the SAME sprint-state.json `deckent status` uses; locks listed with age', () => {
    seedTask('001');
    writeFileSync(join(root, '.deckent-tmp'), ''); // noise — ignored
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprint: { id: 'sprint-447', phase: 'EXECUTE' },
    }), 'utf-8');
    mkdirSync(join(root, '.locks'), { recursive: true });
    writeFileSync(join(root, '.locks', 'src__a.ts.lock'), 'w-1', 'utf-8');

    const snap = readSprintLive(root, NOW);
    expect(snap.sprintId).toBe('sprint-447');
    expect(snap.phase).toBe('EXECUTE');
    expect(snap.locks).toHaveLength(1);
    expect(snap.locks[0]!.name).toBe('src__a.ts.lock');
    expect(snap.locks[0]!.ageMs).toBeGreaterThanOrEqual(0);
  });

  it('garbage task-json is skipped, garbage hb degrades to absent hb, torn state → null phase (tolerance)', () => {
    seedTask('good');
    writeFileSync(join(root, '.tasks', 'task-bad.json'), 'not-json{', 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-good.hb'), 'torn{', 'utf-8');
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), '{{{', 'utf-8');

    const snap = readSprintLive(root, NOW);
    expect(snap.workers.map((w) => w.taskId)).toEqual(['good']);
    expect(snap.workers[0]!.hb).toBeUndefined();
    expect(snap.phase).toBeNull();
  });
});

describe('readSprintTaskDetail — Worker-Penceresi drill-in', () => {
  it('returns task + plan (capped) + result + hb; missing task → null; unsafe id → null', () => {
    seedTask('007');
    writeFileSync(join(root, '.tasks', 'task-007.plan'), 'PLAN:\n- step 1\n- step 2\n', 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-007.result'), JSON.stringify({
      taskId: '007', selfAssessment: 'DONE', notes: 'ok',
    }), 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-007.hb'), JSON.stringify({
      workerId: 'w', taskId: '007', status: 'DONE', currentAction: 'finished',
      timestamp: '2026-07-18T11:59:00.000Z', filesChangedCount: 1, sequence: 9,
    }), 'utf-8');

    const detail = readSprintTaskDetail(root, '007', NOW)!;
    expect(detail.task).toMatchObject({ id: '007', status: 'EXECUTING' });
    expect(detail.plan).toEqual({ text: 'PLAN:\n- step 1\n- step 2\n', truncated: false });
    expect(detail.result).toMatchObject({ selfAssessment: 'DONE' });
    expect(detail.hb).toMatchObject({ status: 'DONE', ageMs: 60_000 });

    expect(readSprintTaskDetail(root, 'yok', NOW)).toBeNull();
    expect(readSprintTaskDetail(root, '../etc/passwd', NOW)).toBeNull();
  });

  it('an oversized .plan is truncated at the explicit cap', () => {
    seedTask('big');
    writeFileSync(join(root, '.tasks', 'task-big.plan'), 'x'.repeat(SPRINT_DETAIL_TEXT_CAP + 500), 'utf-8');
    const detail = readSprintTaskDetail(root, 'big', NOW)!;
    expect(detail.plan!.truncated).toBe(true);
    expect(detail.plan!.text.length).toBe(SPRINT_DETAIL_TEXT_CAP);
  });
});
