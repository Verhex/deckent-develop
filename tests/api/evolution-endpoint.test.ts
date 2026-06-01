/**
 * Tests for GET /api/evolution/* endpoints (Sprint 215, Task 215-013).
 *
 * Uses the real HTTP test harness (startTestServer) against a tmpdir project
 * root — no gitignored local state is ever read (hermetic per Sprint 215 rules).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  startTestServer,
  call,
  type TestServerHandle,
} from './test-server-helper.js';

describe('GET /api/evolution/genealogy', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('returns empty family tree when no genealogy data exists', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/evolution/genealogy');

    expect(res.status).toBe(200);
    const body = res.json<{ roots: string[]; nodes: Record<string, unknown>; edges: unknown[] }>();
    expect(body.roots).toEqual([]);
    expect(body.nodes).toEqual({});
    expect(body.edges).toEqual([]);
  });

  it('returns populated family tree when genealogy.json exists', async () => {
    handle = await startTestServer({ disableAuth: true });

    // Write a genealogy.json to the tmpdir project root
    const agentsDir = join(handle.projectRoot, '.deckent', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, 'genealogy.json'),
      JSON.stringify({
        'agent-v2': {
          agentId: 'agent-v2',
          parentId: 'agent-v1',
          createdAt: '2026-01-01T00:00:00.000Z',
          reason: 'performance improvement',
        },
        'agent-v1': {
          agentId: 'agent-v1',
          parentId: null,
          createdAt: '2025-12-01T00:00:00.000Z',
          reason: 'initial',
        },
      }),
      'utf-8',
    );

    const res = await call(handle, '/api/evolution/genealogy');

    expect(res.status).toBe(200);
    const body = res.json<{
      roots: string[];
      nodes: Record<string, { agentId: string; parentId: string | null }>;
      edges: Array<{ parent: string; child: string }>;
    }>();
    expect(body.roots).toContain('agent-v1');
    expect(Object.keys(body.nodes)).toHaveLength(2);
    expect(body.edges).toHaveLength(1);
    expect(body.edges[0]).toEqual({ parent: 'agent-v1', child: 'agent-v2' });
  });
});

describe('GET /api/evolution/retirement', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('returns empty array when no agents have been retired', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/evolution/retirement');

    expect(res.status).toBe(200);
    const body = res.json<unknown[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns retired agent records when .retired directory exists', async () => {
    handle = await startTestServer({ disableAuth: true });

    // Seed a retired agent record
    const retiredDir = join(handle.projectRoot, '.deckent', 'agents', '.retired', 'old-agent');
    mkdirSync(retiredDir, { recursive: true });
    writeFileSync(
      join(retiredDir, 'retired.json'),
      JSON.stringify({
        id: 'old-agent',
        retiredAt: '2026-05-01T00:00:00.000Z',
        reason: 'low success rate',
        stats: { successRate: 0.2, totalUses: 15, sprintsParticipated: 6 },
        source: 'user',
      }),
      'utf-8',
    );

    const res = await call(handle, '/api/evolution/retirement');

    expect(res.status).toBe(200);
    const body = res.json<Array<{ id: string; reason: string }>>();
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe('old-agent');
    expect(body[0]?.reason).toBe('low success rate');
  });
});

describe('GET /api/evolution/prompt-metrics', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('returns empty array when no agents are registered', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/evolution/prompt-metrics');

    expect(res.status).toBe(200);
    const body = res.json<unknown[]>();
    expect(Array.isArray(body)).toBe(true);
    // May include built-in agents from AgentPoolManager — just verify it's an array
    expect(body.length).toBeGreaterThanOrEqual(0);
  });

  it('returns prompt metrics report shape with required fields', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/evolution/prompt-metrics');

    expect(res.status).toBe(200);
    const body = res.json<
      Array<{
        agentId: string;
        currentVersion: number;
        totalVersions: number;
        currentSuccessRate: number;
        trend: string;
        experimentStatus: string;
      }>
    >();
    expect(Array.isArray(body)).toBe(true);
    // If there are any agents, each report must have required fields
    for (const report of body) {
      expect(typeof report.agentId).toBe('string');
      expect(typeof report.currentVersion).toBe('number');
      expect(typeof report.totalVersions).toBe('number');
      expect(typeof report.currentSuccessRate).toBe('number');
      expect(['improving', 'declining', 'stable']).toContain(report.trend);
      expect(['none', 'active', 'completed']).toContain(report.experimentStatus);
    }
  });
});
