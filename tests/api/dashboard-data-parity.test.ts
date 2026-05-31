/**
 * Dashboard API data-parity tests (Sprint 209 Task 209-007 / F7-002).
 *
 * Verifies that the live-data endpoints return correct shapes and values
 * from seeded project state. Uses the E2E test harness (real server, real
 * temp fs) — no mocks.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  startTestServer,
  call,
  buildDashboardSeed,
  type TestServerHandle,
} from './test-server-helper.js';

describe('Dashboard data-parity — live endpoint suite', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  // ─── Sprint endpoint ─────────────────────────────────────────────────────

  it('GET /api/status returns sprint shape with phase and progress', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: {
        dashboard: buildDashboardSeed({
          sprint: { id: 'sprint-209', number: 209, phase: 'EXECUTE', status: 'ACTIVE' },
          progress: { done: 5, active: 3, blocked: 0, total: 14 },
        }),
      },
    });

    const res = await call(handle, '/api/status');
    expect(res.status).toBe(200);

    const body = res.json<{
      sprint: { id: string; phase: string; status: string };
      progress: { done: number; active: number; total: number };
      agents: unknown[];
      updatedAt: string;
    }>();

    expect(body.sprint.id).toBe('sprint-209');
    expect(body.sprint.phase).toBe('EXECUTE');
    expect(body.sprint.status).toBe('ACTIVE');
    expect(body.progress.done).toBe(5);
    expect(body.progress.active).toBe(3);
    expect(body.progress.total).toBe(14);
    expect(Array.isArray(body.agents)).toBe(true);
    expect(typeof body.updatedAt).toBe('string');
  });

  // ─── Worker endpoint ─────────────────────────────────────────────────────

  it('GET /api/workers returns empty array when no heartbeat files exist', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/workers');
    expect(res.status).toBe(200);
    const body = res.json<unknown[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('GET /api/workers returns worker entries from seeded hb files', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: {
        tasks: [
          {
            id: '209-001',
            json: { id: '209-001', title: 'Intent classifier', status: 'EXECUTING' },
          },
        ],
      },
    });

    // Write heartbeat file directly to the seeded project root
    const hb = {
      workerId: 'w-209-001',
      taskId: '209-001',
      status: 'EXECUTING',
      sequence: 3,
      timestamp: new Date().toISOString(),
    };
    writeFileSync(
      join(handle.projectRoot, '.tasks', 'task-209-001.hb'),
      JSON.stringify(hb),
      'utf-8',
    );

    const res = await call(handle, '/api/workers');
    expect(res.status).toBe(200);

    const body = res.json<Array<{
      workerId: string;
      taskId: string;
      status: string;
      taskTitle: string | null;
      taskStatus: string | null;
    }>>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);

    const w = body[0]!;
    expect(w.workerId).toBe('w-209-001');
    expect(w.taskId).toBe('209-001');
    expect(w.status).toBe('EXECUTING');
    expect(w.taskTitle).toBe('Intent classifier');
    expect(w.taskStatus).toBe('EXECUTING');
  });

  // ─── Memory endpoint ─────────────────────────────────────────────────────

  it('GET /api/memory returns seeded memory export content', async () => {
    const memoryContent = '# Memory\n\n## Sprint sprint-208 Learnings\n- 208-001 — routing fix: GO';
    handle = await startTestServer({
      disableAuth: true,
      seed: { memoryMd: memoryContent },
    });

    const res = await call(handle, '/api/memory');
    expect(res.status).toBe(200);

    const body = res.json<{ content: string }>();
    expect(typeof body.content).toBe('string');
    expect(body.content).toContain('Memory');
    expect(body.content).toContain('sprint-208');
  });

  // ─── Agents endpoint ─────────────────────────────────────────────────────

  it('GET /api/agents returns an array of agent objects with required fields', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/agents');
    expect(res.status).toBe(200);

    const body = res.json<Array<{
      id: string;
      name: string;
      source: string;
      enabled: boolean;
      totalUses: number;
      successRate: number;
    }>>();
    expect(Array.isArray(body)).toBe(true);

    // The agent pool loads built-in agents from .deckent/agents/ — in a fresh
    // temp dir there are none, so an empty array is valid.  When agents exist
    // each entry must have the required shape.
    for (const agent of body) {
      expect(typeof agent.id).toBe('string');
      expect(typeof agent.name).toBe('string');
      expect(typeof agent.enabled).toBe('boolean');
      expect(typeof agent.totalUses).toBe('number');
      expect(typeof agent.successRate).toBe('number');
    }
  });

  // ─── Debt endpoint ───────────────────────────────────────────────────────

  it('GET /api/debt returns seeded debt export content', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: { debtMd: '# Debt\n\n_No active technical debt._' },
    });

    const res = await call(handle, '/api/debt');
    expect(res.status).toBe(200);

    const body = res.json<{ content: string }>();
    expect(typeof body.content).toBe('string');
    expect(body.content).toContain('Debt');
  });
});
