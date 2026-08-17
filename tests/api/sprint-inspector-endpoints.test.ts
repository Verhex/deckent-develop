import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import { SPRINT_DETAIL_TEXT_CAP } from '../../src/core/run-inspector-read-model.js';

let root: string;
let api: HttpApi | undefined;
let baseUrl: string;
const API_TOKEN = 'sprint-inspector-endpoints-test-token';

async function boot(): Promise<void> {
  api = createHttpServer(root, { port: 0, host: '127.0.0.1', apiToken: API_TOKEN });
  await new Promise<void>((resolve) => api!.server.once('listening', resolve));
  const address = api.server.address();
  if (!address || typeof address === 'string') throw new Error('HTTP server did not bind');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

function get(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
}

function seedTask(taskId: string): void {
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(join(root, '.tasks', `task-${taskId}.json`), JSON.stringify({
    id: taskId,
    description: `Inspect ${taskId}\nsecond line`,
    status: 'EXECUTING',
    assignedAgent: 'api-builder',
    model: 'test-model',
    scope: { filesWrite: ['src/api/server.ts'] },
  }));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sprint-inspector-api-'));
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.locks'), { recursive: true });
});

afterEach(async () => {
  if (api) await api.close();
  api = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe('GET /api/sprint/* canonical inspector routes', () => {
  it('lists the current authority run and archived run projections', async () => {
    mkdirSync(join(root, '.brain', 'sprints'), { recursive: true });
    writeFileSync(join(root, '.brain', 'sprints', 'sprint-540.md'), [
      '# Sprint 540',
      'Sprint ID: sprint-540',
      'Status: COMPLETE',
      'Started At: 2026-08-15T10:00:00.000Z',
      'Completed At: 2026-08-15T11:00:00.000Z',
      'Total Tasks: 3',
      'Completed Tasks: 2',
      'No-Go Tasks: 1',
      'Tech Debt Tasks: 0',
    ].join('\n'));
    await boot();

    const response = await get('/api/inspector/runs');
    expect(response.status).toBe(200);
    const body = await response.json() as {
      schemaVersion: number;
      generatedAt: string;
      revision: number;
      runs: Array<Record<string, unknown>>;
    };

    expect(body).toEqual(expect.objectContaining({
      schemaVersion: 1,
      generatedAt: expect.any(String),
      revision: expect.any(Number),
      runs: expect.any(Array),
    }));
    expect(body.runs[0]).toEqual(expect.objectContaining({ source: 'authority' }));
    expect(body.runs).toContainEqual(expect.objectContaining({
      runId: 'sprint-540',
      recordState: 'COMPLETE',
      source: 'archive',
      startedAt: '2026-08-15T10:00:00.000Z',
      settledAt: '2026-08-15T11:00:00.000Z',
      taskCounts: { total: 3, completed: 2, noGo: 1, techDebt: 0 },
    }));
  });

  it('serves the legacy live keys plus canonical lifecycle authority', async () => {
    seedTask('541-002');
    mkdirSync(join(root, '.brain'), { recursive: true });
    writeFileSync(join(root, '.brain', 'sprint-state.json'), JSON.stringify({
      sprintId: 'raw-sprint', phase: 'FIX', status: 'PAUSED',
    }), { flag: 'w' });
    await boot();

    const response = await get('/api/sprint/live');
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;

    expect(body).toEqual(expect.objectContaining({
      schemaVersion: 1,
      revision: expect.any(Number),
      lifecycle: expect.objectContaining({ lifecycle: expect.any(String) }),
      workers: expect.any(Array),
      locks: expect.any(Array),
      active: expect.any(Boolean),
      generatedAt: expect.any(String),
    }));
    // Legacy `active` is bound to the AUTHORITY verdict — never worker-file inference.
    expect(body.active).toBe((body.lifecycle as { active: boolean }).active);
    expect(body).toHaveProperty('sprintId');
    expect(body).toHaveProperty('phase');
    expect((body.lifecycle as { lifecycle: string }).lifecycle).not.toBe('PAUSED');
  });

  it('caps task plan text and rejects an invalid task id without reading outside the fixture', async () => {
    seedTask('541-002');
    writeFileSync(join(root, '.tasks', 'task-541-002.plan'), 'x'.repeat(SPRINT_DETAIL_TEXT_CAP + 7));
    writeFileSync(join(root, '.tasks', 'task-541-002.result'), JSON.stringify({
      selfAssessment: 'DONE',
      filesChanged: ['src/api/server.ts'],
      notes: 'verified',
    }));
    writeFileSync(join(root, '.tasks', 'task-541-002.log'), 'bounded worker log');
    await boot();

    const detailResponse = await get('/api/sprint/task/541-002');
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as {
      taskId: string;
      plan: { text: string; truncated: boolean };
      lineage: {
        logPath: string | null;
        logTailAvailable: boolean;
        resultEvidence: {
          selfAssessment: string | null;
          filesChanged: string[];
          notesPresent: boolean;
        } | null;
      };
    };
    expect(Object.keys(detail).sort()).toEqual([
      'hb', 'lineage', 'plan', 'result', 'task', 'taskId',
    ]);
    expect(detail.taskId).toBe('541-002');
    expect(detail.plan.truncated).toBe(true);
    expect(detail.plan.text).toBe('x'.repeat(SPRINT_DETAIL_TEXT_CAP));
    expect(detail.lineage).toEqual({
      logPath: join('.tasks', 'task-541-002.log'),
      logTailAvailable: true,
      resultEvidence: {
        selfAssessment: 'DONE',
        filesChanged: ['src/api/server.ts'],
        notesPresent: true,
      },
    });

    const invalidResponse = await get(`/api/sprint/task/${encodeURIComponent('../escape')}`);
    expect(invalidResponse.status).toBe(403);
  });

  it('returns an honest 404 for an unknown valid task id', async () => {
    await boot();

    const response = await get('/api/sprint/task/541-404');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'task not found' });
  });
});
