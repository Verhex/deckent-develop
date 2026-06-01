/**
 * E2E tests for GET /api/routing/distribution endpoint (Sprint 210, Task 211-011).
 *
 * Boots a real server against a temp project root and exercises:
 * 1. Endpoint returns correct distribution shape with populated learnings.json
 * 2. Empty state (no learnings.json) → zeros + empty arrays
 * 3. Auth gate: missing token → 401
 * 4. Imbalance detection: single agent >80% → warnings populated
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  startTestServer,
  call,
  type TestServerHandle,
} from './test-server-helper.js';

const ENDPOINT = '/api/routing/distribution';

describe('GET /api/routing/distribution', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('returns distribution data with correct shape when learnings.json exists', async () => {
    handle = await startTestServer({ disableAuth: true });

    mkdirSync(join(handle.projectRoot, '.deckent', 'routing'), { recursive: true });
    writeFileSync(
      join(handle.projectRoot, '.deckent', 'routing', 'learnings.json'),
      JSON.stringify({
        agentPerformance: {
          refactorer: { totalTasks: 8 },
          'bug-fixer': { totalTasks: 2 },
        },
        skillPerformance: {
          'typescript-expert': { totalTasks: 5 },
        },
        totalOutcomes: 10,
      }),
    );

    const res = await call(handle, ENDPOINT);

    expect(res.status).toBe(200);
    const body = res.json<{
      agents: { entries: Array<{ id: string; tasks: number; pct: number }>; total: number };
      skills: { entries: Array<{ id: string; tasks: number; pct: number }>; total: number };
      warnings: string[];
      totalOutcomes: number;
    }>();

    // agents distribution
    expect(body.agents.total).toBe(10);
    expect(body.agents.entries).toHaveLength(2);
    const refactorer = body.agents.entries.find((e) => e.id === 'refactorer');
    expect(refactorer).toBeDefined();
    expect(refactorer?.tasks).toBe(8);
    expect(refactorer?.pct).toBe(80);

    // skills distribution
    expect(body.skills.total).toBe(5);
    expect(body.skills.entries).toHaveLength(1);
    expect(body.skills.entries[0]?.id).toBe('typescript-expert');

    expect(body.totalOutcomes).toBe(10);
    expect(Array.isArray(body.warnings)).toBe(true);
  });

  it('returns empty state when learnings.json does not exist', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, ENDPOINT);

    expect(res.status).toBe(200);
    const body = res.json<{
      agents: { entries: unknown[]; total: number };
      skills: { entries: unknown[]; total: number };
      warnings: unknown[];
      totalOutcomes: number;
    }>();

    expect(body.agents.entries).toHaveLength(0);
    expect(body.agents.total).toBe(0);
    expect(body.skills.entries).toHaveLength(0);
    expect(body.skills.total).toBe(0);
    expect(body.warnings).toHaveLength(0);
    expect(body.totalOutcomes).toBe(0);
  });

  it('returns 401 when no auth token is configured and auth is not disabled', async () => {
    handle = await startTestServer();
    // No token, no disableAuth → auth middleware returns 401

    const res = await call(handle, ENDPOINT);
    expect(res.status).toBe(401);
  });

  it('detects imbalance and populates warnings when a single agent exceeds 80%', async () => {
    handle = await startTestServer({ disableAuth: true });

    mkdirSync(join(handle.projectRoot, '.deckent', 'routing'), { recursive: true });
    writeFileSync(
      join(handle.projectRoot, '.deckent', 'routing', 'learnings.json'),
      JSON.stringify({
        agentPerformance: {
          refactorer: { totalTasks: 90 },
          'doc-writer': { totalTasks: 10 },
        },
        skillPerformance: {},
        totalOutcomes: 100,
      }),
    );

    const res = await call(handle, ENDPOINT);
    expect(res.status).toBe(200);
    const body = res.json<{ warnings: string[] }>();
    expect(body.warnings.length).toBeGreaterThan(0);
    expect(body.warnings[0]).toMatch(/refactorer/);
    expect(body.warnings[0]).toMatch(/90%/);
  });
});
