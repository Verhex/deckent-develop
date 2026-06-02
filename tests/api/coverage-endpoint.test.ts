/**
 * Tests for GET /api/coverage endpoint (Sprint 220, Task 220-008).
 *
 * Hermetic: all tests use startTestServer against a tmpdir project root.
 * No gitignored local state is ever read.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  startTestServer,
  call,
  type TestServerHandle,
} from './test-server-helper.js';

const SPRINT_MD_WITH_COVERAGE = [
  '# sprint-001',
  '',
  '## Metrics',
  '| Metric | Value |',
  '|--------|-------|',
  '| Total Tasks | 5 |',
  '| Completed | 4 |',
  '| Tech Debt | 0 |',
  '| No-Go | 1 |',
  '| Coverage | 85.0% |',
  '| Duration | 1200ms |',
  '',
].join('\n');

const SPRINT_MD_NO_COVERAGE = [
  '# sprint-002',
  '',
  '## Metrics',
  '| Metric | Value |',
  '|--------|-------|',
  '| Total Tasks | 3 |',
  '| Completed | 3 |',
  '| Tech Debt | 0 |',
  '| No-Go | 0 |',
  '| Duration | 500ms |',
  '',
].join('\n');

describe('GET /api/coverage', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('returns 200 with history and budget when no sprint logs exist (empty)', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/coverage');

    expect(res.status).toBe(200);
    const body = res.json<{ history: unknown[]; budget: { perSprint: null } }>();
    expect(Array.isArray(body.history)).toBe(true);
    expect(body.history).toHaveLength(0);
    expect(body.budget).toBeDefined();
    expect(body.budget.perSprint).toBeNull();
  });

  it('returns coverage data for each sprint log', async () => {
    handle = await startTestServer({ disableAuth: true });

    // Seed sprint logs
    const sprintsDir = join(handle.projectRoot, '.brain', 'sprints');
    mkdirSync(sprintsDir, { recursive: true });
    writeFileSync(join(sprintsDir, 'sprint-001.md'), SPRINT_MD_WITH_COVERAGE, 'utf-8');
    writeFileSync(join(sprintsDir, 'sprint-002.md'), SPRINT_MD_NO_COVERAGE, 'utf-8');

    const res = await call(handle, '/api/coverage');

    expect(res.status).toBe(200);
    const body = res.json<{
      history: Array<{ sprintId: string; coverage: string; tasks: string; completed: string }>;
      budget: { perSprint: null };
    }>();
    expect(body.history).toHaveLength(2);
    expect(body.history[0]?.sprintId).toBe('sprint-001');
    expect(body.history[0]?.coverage).toBe('85.0%');
    expect(body.history[0]?.tasks).toBe('5');
    expect(body.history[0]?.completed).toBe('4');
    // Sprint without coverage row returns fallback '-'
    expect(body.history[1]?.sprintId).toBe('sprint-002');
    expect(body.history[1]?.coverage).toBe('-');
  });

  it('returns budget.perSprint from config when api mode budget_per_sprint is set', async () => {
    handle = await startTestServer({
      disableAuth: true,
      seed: {
        config: {
          modes: {
            api: { budget_per_sprint: 7.5 },
          },
        },
      },
    });

    const res = await call(handle, '/api/coverage');

    expect(res.status).toBe(200);
    const body = res.json<{ history: unknown[]; budget: { perSprint: number } }>();
    expect(body.budget.perSprint).toBe(7.5);
  });

  it('is wired in server — does not 404', async () => {
    handle = await startTestServer({ disableAuth: true });

    const res = await call(handle, '/api/coverage');

    // Must be 200 (registered), not 404 (unregistered)
    expect(res.status).toBe(200);
    const body = res.json<{ history: unknown[] }>();
    expect('history' in body).toBe(true);
  });
});
