import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

async function openLiveStream(path = '/api/sprint/live/stream'): Promise<{
  response: Response;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  readUntil: (predicate: (text: string) => boolean) => Promise<string>;
  close: () => Promise<void>;
}> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (!response.body) throw new Error('SSE response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const readUntil = async (predicate: (text: string) => boolean): Promise<string> => {
    let text = '';
    while (!predicate(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return text;
  };
  return {
    response,
    reader,
    readUntil,
    close: async () => {
      controller.abort();
      try { await reader.cancel(); } catch { /* already aborted */ }
    },
  };
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

  it('streams an initial full live snapshot with the legacy active key', async () => {
    seedTask('541-002');
    await boot();

    const stream = await openLiveStream();
    const body = await stream.readUntil((text) => text.includes('event: snapshot'));
    await stream.close();

    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toBe('text/event-stream');
    expect(body).toContain('retry: 3000');
    const dataLine = body.split('\n').find((line) => line.startsWith('data: {'));
    const payload = JSON.parse(dataLine!.slice('data: '.length)) as Record<string, unknown>;
    expect(payload).toEqual(expect.objectContaining({
      schemaVersion: 1,
      revision: expect.any(Number),
      lifecycle: expect.objectContaining({ active: expect.any(Boolean) }),
      workers: expect.any(Array),
      locks: expect.any(Array),
      active: expect.any(Boolean),
    }));
    expect(payload.active).toBe((payload.lifecycle as { active: boolean }).active);
  });

  it('uses sinceRevision as the observer cursor and skips the duplicate snapshot', async () => {
    await boot();
    const liveResponse = await get('/api/sprint/live');
    const live = await liveResponse.json() as { revision: number };

    const stream = await openLiveStream(`/api/sprint/live/stream?sinceRevision=${live.revision}`);
    const { value } = await stream.reader.read();
    await stream.close();

    expect(new TextDecoder().decode(value)).toContain('retry: 3000');
    expect(new TextDecoder().decode(value)).not.toContain('event: snapshot');
  });

  it('disposes the observer and ping interval when the client closes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    await boot();
    const timersBeforeConnect = vi.getTimerCount();

    const stream = await openLiveStream();
    await stream.readUntil((text) => text.includes('event: snapshot'));
    expect(vi.getTimerCount()).toBeGreaterThan(timersBeforeConnect);
    await stream.close();
    for (let attempt = 0; attempt < 20 && vi.getTimerCount() !== timersBeforeConnect; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(vi.getTimerCount()).toBe(timersBeforeConnect);
    vi.useRealTimers();
  });

  it.each(['-1', '1.5', 'abc', '9007199254740992'])(
    'rejects invalid sinceRevision=%s with a typed 400 and no stream',
    async (sinceRevision) => {
      await boot();
      const response = await get(`/api/sprint/live/stream?sinceRevision=${sinceRevision}`);

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toEqual({
        error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      });
    },
  );

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
        logTail: { lines: string[]; truncated: boolean } | null;
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
      logTail: { lines: ['bounded worker log'], truncated: false },
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

  it('passes a bounded tailLines override through to the task log tail', async () => {
    seedTask('541-002');
    writeFileSync(join(root, '.tasks', 'task-541-002.log'), 'first\nsecond\nthird\nfourth\n');
    await boot();

    const response = await get('/api/sprint/task/541-002?tailLines=2');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      taskId: '541-002',
      lineage: expect.objectContaining({
        logTail: { lines: ['third', 'fourth'], truncated: true },
      }),
    }));
  });

  it.each(['0', '201', '-1', '1.5', 'abc', ''])(
    'rejects invalid tailLines=%s with a typed 400',
    async (tailLines) => {
      seedTask('541-002');
      await boot();

      const response = await get(`/api/sprint/task/541-002?tailLines=${tailLines}`);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tailLines must be an integer between 1 and 200',
          details: [{
            field: 'tailLines',
            message: 'Must be an integer between 1 and 200',
            value: tailLines,
          }],
        },
      });
    },
  );

  it('returns an honest 404 for an unknown valid task id', async () => {
    await boot();

    const response = await get('/api/sprint/task/541-404');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'task not found' });
  });
});
