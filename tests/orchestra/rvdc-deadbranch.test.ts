/**
 * tests/orchestra/rvdc-deadbranch.test.ts
 *
 * ROUTE-V1-DEADBRANCH-COLLAPSE (ADR-G-006 follow-up; sprint-351 task 351-010).
 *
 * Pins that sprint-finalizer.ts's agent/skill stats path is now V2/learnings.json
 * ONLY. The dead `if (routing_engine !== 'v2') { ... } else { ... }` branch
 * (~61 lines, direct agent.json write) was collapsed — not merely defaulted
 * around — so:
 *
 * 1. A stale/garbage `routing_engine` config value (e.g. the removed 'v1',
 *    ROUTE-V1-PURGE) can no longer route into a special-cased legacy path —
 *    there is no branch left to take it. Behavior must be IDENTICAL to 'v2'.
 * 2. The v2-default flow (no config at all) records each task's outcome to
 *    learnings.json exactly once — no double-count from a parallel writer.
 *
 * Hermetic: real fs on a per-test tmpdir (no gitignored state, no mocked-out
 * business logic) — mirrors tests/cli/finalize-refinalize.test.ts's pattern,
 * which already exercises the same finalizeSprint pipeline end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (heavy / dangerous bits only — fs stays REAL on tmpdir) ──
// Mirrors tests/cli/finalize-refinalize.test.ts: finalizeSprint's self-audit
// gate (10b) shells out to `npx tsc` / `npx vitest` via spawnSync — must
// never reach a real binary inside a unit test.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  spawn: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tryCodeVerifiedDone: vi.fn().mockResolvedValue({ triggered: false, verified: false }),
  writeCodeVerifiedResult: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/notify.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/identity-generator.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runPostFinalizeHooks: vi.fn().mockResolvedValue({
    memoryExport: null, identityRegen: null, adrInsert: null,
    ruleRegenCalled: false, errors: [],
  }),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  writeRetrospective: vi.fn().mockReturnValue({
    dbAttempted: true, sprintLogWritten: true, retroWritten: true,
    memoryWritten: true, dbError: null,
  }),
  appendRetroSection: vi.fn().mockReturnValue(true),
  writeSprintLog: vi.fn(),
  updateProjectDocs: vi.fn(),
  archiveDirectives: vi.fn(),
  archiveOrphanTasks: vi.fn().mockReturnValue(0),
}));

import { TaskEvaluation, SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import { finalizeSprint } from '../../src/orchestra/sprint-finalizer.js';

// Same real better-sqlite3/fs pipeline as finalize-refinalize.test.ts — slow
// but correct; matches its file-wide timeout bump.
vi.setConfig({ testTimeout: 45_000 });

// ─── Fixture Helpers ─────────────────────────────────────────────────

const SPRINT_ID = 'sprint-901';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'fixture task',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: 'DONE',
    sprintId: SPRINT_ID,
    createdAt: '2026-07-01T00:00:00.000Z',
    assignedAgent: 'rvdc-agent',
    ...overrides,
  } as unknown as Task;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/x.ts'],
    linesAdded: 5,
    linesRemoved: 1,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'ok',
    ...overrides,
  } as TaskResult;
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: SPRINT_ID,
    number: 901,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: '2026-07-01T00:00:00.000Z',
    completedAt: '2026-07-01T00:10:00.000Z',
  } as Sprint;
}

function seedAgent(root: string, id: string): string {
  const dir = join(root, '.deckent', 'agents', id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'agent.json');
  writeFileSync(p, JSON.stringify(createAgentDefinition({
    id,
    name: id,
    source: 'user',
    enabled: true,
    preferredModel: 'claude-sonnet-5',
  }), null, 2), 'utf-8');
  return p;
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

const finalizeOpts = {
  skipDecay: true,
  skipHooks: true,
  skipMemoryExport: true,
  skipIdentityRegen: true,
  onRuleRegen: async (): Promise<void> => { /* no-op */ },
};

// ─── Tests ───────────────────────────────────────────────────────────

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-rvdc-'));
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* non-fatal */ }
  vi.clearAllMocks();
});

describe('sprint-finalizer — ROUTE-V1-DEADBRANCH-COLLAPSE (351-010)', () => {
  it('a stale non-v2 routing_engine value behaves IDENTICALLY to v2 (no branch left to special-case it)', async () => {
    seedAgent(root, 'rvdc-agent');
    const tasks = [makeTask('901-001')];
    const evaluations = new Map<string, TaskEvaluation>([['901-001', TaskEvaluation.DONE]]);
    const results = [makeResult('901-001')];
    // 'v1' has not been a config-valid value since ROUTE-V1-PURGE, but
    // finalizeSprint reads opts.config.routing_engine via a raw cast and
    // pre-collapse would have routed this into the legacy direct-write
    // branch. Post-collapse there is no branch to take it — it MUST land
    // on the same learnings.json path as 'v2'.
    const staleOpts = { ...finalizeOpts, config: { routing_engine: 'v1' } as unknown as ResolvedConfig };

    await finalizeSprint(root, makeSprint(tasks), evaluations, results, staleOpts);

    const learningsPath = join(root, '.deckent', 'routing', 'learnings.json');
    const learnings = readJson<{ totalOutcomes: number; recentSprints: string[] }>(learningsPath);
    expect(learnings.recentSprints).toContain(SPRINT_ID);
    expect(learnings.totalOutcomes).toBe(1);
  });

  it('v2-default flow (no config) records each task outcome to learnings.json exactly once', async () => {
    const agentPath = seedAgent(root, 'rvdc-agent');
    expect(readJson<{ preferredModel: string }>(agentPath).preferredModel).toBe('claude-sonnet-5');
    const tasks = [makeTask('901-001'), makeTask('901-002')];
    const evaluations = new Map<string, TaskEvaluation>([
      ['901-001', TaskEvaluation.DONE],
      ['901-002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const results = [makeResult('901-001'), makeResult('901-002')];

    await finalizeSprint(root, makeSprint(tasks), evaluations, results, finalizeOpts);

    const learningsPath = join(root, '.deckent', 'routing', 'learnings.json');
    const learnings = readJson<{
      totalOutcomes: number;
      agentPerformance: Record<string, { totalTasks: number }>;
    }>(learningsPath);
    expect(learnings.totalOutcomes).toBe(2);
    expect(learnings.agentPerformance['rvdc-agent']!.totalTasks).toBe(2);

    // The 8d2 learnings→stats sync is the SOLE writer of totalUses — never
    // double-incremented by a parallel V1 direct-write. born-605 (405-003):
    // stats artık gitignored sidecar-ledger'da; manifest dokunulmaz kalır.
    const ledger = readJson<{ agents: Record<string, { totalUses: number }> }>(
      join(root, '.deckent', 'stats', 'catalog-stats.json'),
    );
    expect(ledger.agents['rvdc-agent']!.totalUses).toBe(2);
  });
});
