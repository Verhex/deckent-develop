/**
 * tests/cli/finalize-refinalize.test.ts
 *
 * Sprint 268 Task 268-002 — FINALIZE fix üçlüsü (live bugs from the
 * sprint-267 `finalize --force` re-run, 2026-06-10):
 *
 * 1. FINALIZE-RECOUNT — re-finalizing an already-finalized sprint re-counted
 *    agent/skill stats (uses+N, success+0). Fixes under test:
 *    (a) success detection uses `evaluationDecision ?? selfAssessment`
 *        (DONE / GO_WITH_TECH_DEBT = success) in buildSprintFromTasks;
 *    (b) double stats recording is guarded — V1 via the per-entity
 *        `stats.lastUsedInSprint === sprintId` pre-scan, V2 via the durable
 *        `learnings.recentSprints` marker.
 * 2. FINALIZE-ARCHIVE-BLIND — finalize only saw `.tasks/`; archived tasks in
 *    `.brain/archive/<sprintId>-tasks/` dropped from totals ("5/5" instead of
 *    "6/6") and their results read as missing (synthetic NO_GO). Duration was
 *    a dishonest 0ms. Fixes: archive-aware merged collection (id-dedupe,
 *    `.tasks/` priority) + startedAt recovery + honest 'unknown' duration.
 * 3. Orphan-state — finalize must stamp `.deckent/sprint-state.json` as
 *    COMPLETE/COMPLETE and clear `.deckent/pids/<sprint>.pid` (+ never stamp
 *    a DIFFERENT sprint's live state file).
 *
 * Hermetic: every test runs in its own tmpdir; no reads of gitignored local
 * state; the self-audit gate's tsc/vitest/git subprocesses are mocked out
 * (node:child_process), heavyweight doc/DB writers are mocked via
 * importOriginal partial mocks. No spawnSync reaches a real binary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (heavy / dangerous bits only — fs stays REAL on tmpdir) ──

// Kills runSelfAuditGate's `npx tsc` / `npx vitest`, `git diff`, and the
// sync-manifest spawn — no real subprocess may run inside a unit test.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' }),
  spawn: vi.fn(),
}));

// Code-verify reconciliation must not shell out / read git state.
vi.mock('../../src/monitor/auditor.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  tryCodeVerifiedDone: vi.fn().mockResolvedValue({ triggered: false, verified: false }),
  writeCodeVerifiedResult: vi.fn().mockResolvedValue(undefined),
}));

// notify() resolves adapters from process state — keep it inert.
vi.mock('../../src/core/notify.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notify: vi.fn().mockResolvedValue(undefined),
}));

// Post-finalize hook chain (memory export / identity regen / adr insert) is
// out of scope for these tests.
vi.mock('../../src/core/identity-generator.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runPostFinalizeHooks: vi.fn().mockResolvedValue({
    memoryExport: null, identityRegen: null, adrInsert: null,
    ruleRegenCalled: false, errors: [],
  }),
}));

// Doc/DB writers: mocked no-ops; pure helpers (calculateMetrics,
// buildAgentPerformance, …) stay REAL via importOriginal.
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

// CLI root resolution → per-test tmpdir.
let currentRoot = '/tmp/unset';
vi.mock('../../src/cli/helpers/process.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveProjectRoot: vi.fn(() => currentRoot),
}));

// loadConfig must not consult ~/.deckent (hermeticity) — deterministic {}.
vi.mock('../../src/core/config.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadConfig: vi.fn().mockResolvedValue({}),
}));

import { Command } from 'commander';
import { TaskEvaluation, SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, ResolvedConfig } from '../../src/core/types.js';
import { buildSprintFromTasks, registerFinalize } from '../../src/cli/commands/finalize.js';
import { finalizeSprint, persistFinalSprintState } from '../../src/orchestra/sprint-finalizer.js';

// The end-to-end finalize tests run the full finalizeSprint pipeline (real
// better-sqlite3 memory.db I/O, archive, decay) — sometimes twice (double-finalize).
// spawnSync is mocked (no real subprocess), but the DB-heavy pipeline legitimately
// exceeds vitest's 10s default under CI parallel load. Bump the file-wide timeout so
// these heavy-but-correct tests don't flake on slow/loaded machines.
vi.setConfig({ testTimeout: 45_000 });

// ─── Fixture Helpers ─────────────────────────────────────────────────

const SPRINT_ID = 'sprint-900';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'fixture task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'done', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: 'DONE',
    sprintId: SPRINT_ID,
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  } as unknown as Task;
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/x.ts'],
    linesAdded: 10,
    linesRemoved: 1,
    testsPassed: true,
    coverage: 95,
    selfAssessment: 'DONE',
    notes: 'ok',
    ...overrides,
  } as TaskResult;
}

function writeTaskFixture(dir: string, task: Task): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
}

function writeResultFixture(dir: string, result: TaskResult): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `task-${result.taskId}.result`), JSON.stringify(result, null, 2), 'utf-8');
}

function archiveDir(root: string, sprintId = SPRINT_ID): string {
  return join(root, '.brain', 'archive', `${sprintId}-tasks`);
}

function seedAgent(root: string, id: string): string {
  const dir = join(root, '.deckent', 'agents', id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'agent.json');
  writeFileSync(p, JSON.stringify({
    id, name: id, source: 'user', enabled: true,
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
  }, null, 2), 'utf-8');
  return p;
}

function seedSkill(root: string, id: string): string {
  const dir = join(root, '.deckent', 'skills', id);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, 'manifest.json');
  writeFileSync(p, JSON.stringify({
    id, name: id, enabled: true,
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '', successCount: 0 },
  }, null, 2), 'utf-8');
  return p;
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

// born-605 (405-003): finalizer stats artık gitignored sidecar'a yazar
// (.deckent/stats/catalog-stats.json) — manifest'ler dokunulmaz. Disk-okuyan
// bu E2E, kaynağı sidecar'a çevirir (görülen değerler birebir aynı).
function readSidecarStats(root: string, kind: 'agents' | 'skills', id: string): { totalUses: number; successRate: number; lastUsedInSprint: string } {
  const ledger = readJson<{ agents: Record<string, never>; skills: Record<string, never> }>(
    join(root, '.deckent', 'stats', 'catalog-stats.json'),
  );
  return (ledger[kind] as Record<string, { totalUses: number; successRate: number; lastUsedInSprint: string }>)[id]!;
}

function makeSprint(tasks: Task[], overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: SPRINT_ID,
    number: 900,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: '2026-06-10T00:00:00.000Z',
    completedAt: '2026-06-10T00:10:00.000Z',
    ...overrides,
  } as Sprint;
}

const finalizeOpts = {
  skipDecay: true,
  skipHooks: true,
  skipMemoryExport: true,
  skipIdentityRegen: true,
  onRuleRegen: async (): Promise<void> => { /* no-op */ },
};

async function runFinalizeCli(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerFinalize(program);
  try {
    await program.parseAsync(['node', 'test', 'finalize', ...args]);
  } catch { /* exitOverride */ }
}

// ─── Tests ───────────────────────────────────────────────────────────

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-268-002-'));
  currentRoot = root;
});

afterEach(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* non-fatal */ }
  vi.clearAllMocks();
});

describe('buildSprintFromTasks — evaluationDecision ?? selfAssessment success detection (FINALIZE-RECOUNT 1a)', () => {
  it('evaluationDecision empty + selfAssessment=DONE → counted as success (DONE), even with testsPassed=false', () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001'));
    // Crash-recovered worker results carry no evaluationDecision and may
    // have testsPassed=false metadata — the recorded self-assessment wins.
    writeResultFixture(tasksDir, makeResult('900-001', { testsPassed: false, coverage: 0 }));

    const { evaluations } = buildSprintFromTasks(root);
    expect(evaluations.get('900-001')).toBe(TaskEvaluation.DONE);
  });

  it('evaluationDecision wins over selfAssessment (Brain decision is authoritative)', () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001'));
    writeResultFixture(tasksDir, makeResult('900-001', {
      selfAssessment: 'DONE',
      evaluationDecision: 'GO_WITH_TECH_DEBT',
    }));

    const { evaluations } = buildSprintFromTasks(root);
    expect(evaluations.get('900-001')).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('non-terminal selfAssessment (TIMEOUT_WITH_WORK) falls back to evaluateResultSync re-grading', () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001'));
    writeResultFixture(tasksDir, makeResult('900-001', {
      selfAssessment: 'TIMEOUT_WITH_WORK' as unknown as TaskResult['selfAssessment'],
      testsPassed: false,
    }));

    const { evaluations } = buildSprintFromTasks(root);
    // evaluateResultSync: !testsPassed → NO_GO (fallback path exercised)
    expect(evaluations.get('900-001')).toBe(TaskEvaluation.NO_GO);
  });

  it('missing result still evaluates to NO_GO', () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001'));

    const { evaluations } = buildSprintFromTasks(root);
    expect(evaluations.get('900-001')).toBe(TaskEvaluation.NO_GO);
  });
});

describe('buildSprintFromTasks — archive-aware collection (FINALIZE-ARCHIVE-BLIND)', () => {
  it('archived task is included in totals and its archived .result lifts the synthetic NO_GO', () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001'));
    writeResultFixture(tasksDir, makeResult('900-001'));
    // sprint-267 live scenario: CLEANUP already archived one task + result
    const arch = archiveDir(root);
    writeTaskFixture(arch, makeTask('900-002'));
    writeResultFixture(arch, makeResult('900-002'));

    const { tasks, evaluations } = buildSprintFromTasks(root);
    expect(tasks.map(t => t.id).sort()).toEqual(['900-001', '900-002']);
    expect(evaluations.get('900-002')).toBe(TaskEvaluation.DONE); // not synthetic NO_GO
  });

  it('id-dedupe: .tasks/ wins over archive on collision (tasks AND results)', () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001', { title: 'live copy' }));
    writeResultFixture(tasksDir, makeResult('900-001', { notes: 'live result' }));
    const arch = archiveDir(root);
    writeTaskFixture(arch, makeTask('900-001', { title: 'archived copy' }));
    writeResultFixture(arch, makeResult('900-001', { notes: 'archived result' }));

    const { tasks, results } = buildSprintFromTasks(root);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe('live copy');
    expect(results).toHaveLength(1);
    expect(results[0]!.notes).toBe('live result');
  });

  it('explicit --sprint filter resolves the archive even when .tasks/ is empty', () => {
    const arch = archiveDir(root);
    writeTaskFixture(arch, makeTask('900-001'));
    writeResultFixture(arch, makeResult('900-001'));

    const { sprintId, tasks, evaluations } = buildSprintFromTasks(root, SPRINT_ID);
    expect(sprintId).toBe(SPRINT_ID);
    expect(tasks).toHaveLength(1);
    expect(evaluations.get('900-001')).toBe(TaskEvaluation.DONE);
  });
});

describe('finalizeSprint — double-finalize stats idempotency (FINALIZE-RECOUNT 1b)', () => {
  it('V1: second finalize does not re-count agent/skill uses (lastUsedInSprint pre-scan)', async () => {
    const agentPath = seedAgent(root, 'test-agent-268');
    const skillPath = seedSkill(root, 'test-skill-268');
    const tasks = [
      makeTask('900-001', { assignedAgent: 'test-agent-268', assignedSkills: ['test-skill-268'] }),
      makeTask('900-002', { assignedAgent: 'test-agent-268', assignedSkills: ['test-skill-268'] }),
    ];
    const evaluations = new Map<string, TaskEvaluation>([
      ['900-001', TaskEvaluation.DONE],
      ['900-002', TaskEvaluation.DONE],
    ]);
    const results = [makeResult('900-001'), makeResult('900-002')];

    // First finalize — the same agent serving BOTH tasks must count both
    // uses (pre-scan must not skip mid-run stamps).
    await finalizeSprint(root, makeSprint(tasks), evaluations, results, finalizeOpts);

    const afterFirst = readSidecarStats(root, 'agents', 'test-agent-268');
    expect(afterFirst.totalUses).toBe(2);
    expect(afterFirst.successRate).toBe(1);
    expect(afterFirst.lastUsedInSprint).toBe(SPRINT_ID);

    // Re-finalize (the sprint-267 `finalize --force` re-run) — idempotent.
    await finalizeSprint(root, makeSprint(tasks), evaluations, results, finalizeOpts);

    const afterSecond = readSidecarStats(root, 'agents', 'test-agent-268');
    expect(afterSecond.totalUses).toBe(2); // NOT 4
    expect(afterSecond.successRate).toBe(1); // NOT 0.5

    const skillAfter = readSidecarStats(root, 'skills', 'test-skill-268');
    expect(skillAfter.totalUses).toBe(2);
    expect(skillAfter.successRate).toBe(1);
  });

  it('V2: second finalize skips recordOutcome via the recentSprints marker', async () => {
    seedAgent(root, 'test-agent-268');
    seedSkill(root, 'test-skill-268');
    const tasks = [
      makeTask('900-001', { assignedAgent: 'test-agent-268', assignedSkills: ['test-skill-268'] }),
      makeTask('900-002', { assignedAgent: 'test-agent-268', assignedSkills: ['test-skill-268'] }),
    ];
    const evaluations = new Map<string, TaskEvaluation>([
      ['900-001', TaskEvaluation.DONE],
      ['900-002', TaskEvaluation.DONE],
    ]);
    const results = [makeResult('900-001'), makeResult('900-002')];
    const v2Opts = { ...finalizeOpts, config: { routing_engine: 'v2' } as unknown as ResolvedConfig };

    await finalizeSprint(root, makeSprint(tasks), evaluations, results, v2Opts);

    const learningsPath = join(root, '.deckent', 'routing', 'learnings.json');
    const first = readJson<{
      totalOutcomes: number;
      recentSprints: string[];
      agentPerformance: Record<string, { totalTasks: number; successCount: number }>;
    }>(learningsPath);
    expect(first.recentSprints).toContain(SPRINT_ID);
    expect(first.totalOutcomes).toBe(2);
    expect(first.agentPerformance['test-agent-268']!.totalTasks).toBe(2);
    expect(first.agentPerformance['test-agent-268']!.successCount).toBe(2);

    await finalizeSprint(root, makeSprint(tasks), evaluations, results, v2Opts);

    const second = readJson<{
      totalOutcomes: number;
      agentPerformance: Record<string, { totalTasks: number; successCount: number }>;
    }>(learningsPath);
    expect(second.totalOutcomes).toBe(2); // NOT 4
    expect(second.agentPerformance['test-agent-268']!.totalTasks).toBe(2);
    expect(second.agentPerformance['test-agent-268']!.successCount).toBe(2);
  });

  it('jobs summary reports duration honestly: real when startedAt known, "unknown" when not', async () => {
    const tasks = [makeTask('900-001')];
    const evaluations = new Map<string, TaskEvaluation>([['900-001', TaskEvaluation.DONE]]);
    const results = [makeResult('900-001')];
    const jobPath = join(root, '.deckent', 'runtime', 'jobs', `${SPRINT_ID}.json`);

    // startedAt known → real duration string, never 'unknown'
    await finalizeSprint(root, makeSprint(tasks), evaluations, results, finalizeOpts);
    const withStart = readJson<{ metrics: { duration: string; durationMs: number } }>(jobPath);
    expect(withStart.metrics.duration).not.toBe('unknown');
    expect(withStart.metrics.durationMs).toBeGreaterThan(0);

    // startedAt unrecoverable → honest 'unknown' (sprint-267 wrote 0ms)
    await finalizeSprint(
      root,
      makeSprint(tasks, { startedAt: undefined, completedAt: undefined }),
      evaluations, results, finalizeOpts,
    );
    const withoutStart = readJson<{ metrics: { duration: string } }>(jobPath);
    expect(withoutStart.metrics.duration).toBe('unknown');
  });
});

describe('persistFinalSprintState — orphan-state cleanup (bug 3)', () => {
  function seedState(sprintId: string): string {
    const dir = join(root, '.deckent');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'sprint-state.json');
    writeFileSync(p, JSON.stringify({
      sprintId, phase: 'EXECUTE', status: 'ACTIVE',
      startedAt: '2026-06-10T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z',
      taskIds: [],
    }, null, 2), 'utf-8');
    return p;
  }

  function seedPid(sprintId: string): string {
    const dir = join(root, '.deckent', 'pids');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `${sprintId}.pid`);
    writeFileSync(p, JSON.stringify({ pid: 999999, sprintId, startedAt: '2026-06-10T00:00:00.000Z' }), 'utf-8');
    return p;
  }

  it('stamps sprint-state COMPLETE/COMPLETE and clears the dead pid marker', () => {
    const statePath = seedState(SPRINT_ID);
    const pidPath = seedPid(SPRINT_ID);

    persistFinalSprintState(root, makeSprint([]));

    const state = readJson<{ status: string; phase: string }>(statePath);
    expect(state.status).toBe(SprintStatus.COMPLETE);
    expect(state.phase).toBe(SprintPhase.COMPLETE);
    expect(existsSync(pidPath)).toBe(false);
  });

  it('does NOT stamp a different sprint\'s state file (sprintId mismatch guard)', () => {
    const statePath = seedState('sprint-901'); // another (possibly live) sprint
    const pidPath = seedPid(SPRINT_ID);

    persistFinalSprintState(root, makeSprint([]));

    // The foreign state file is untouched…
    const state = readJson<{ sprintId: string; status: string }>(statePath);
    expect(state.sprintId).toBe('sprint-901');
    expect(state.status).toBe('ACTIVE');
    // …while THIS sprint's pid marker is still cleaned.
    expect(existsSync(pidPath)).toBe(false);
  });
});

describe('finalize CLI — end-to-end re-finalize pipeline (tmpdir)', () => {
  it('--force counts archived tasks, recovers startedAt from sprint-state, stamps terminal state, clears pid', async () => {
    // Live .tasks/ task + archived task (sprint-267 "5/5 instead of 6/6")
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001', { assignedAgent: 'test-agent-268' }));
    writeResultFixture(tasksDir, makeResult('900-001'));
    const arch = archiveDir(root);
    writeTaskFixture(arch, makeTask('900-002', { assignedAgent: 'test-agent-268' }));
    writeResultFixture(arch, makeResult('900-002'));
    seedAgent(root, 'test-agent-268');

    // Recoverable start: sprint-state of THIS sprint, started 2 minutes ago
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const stateDir = join(root, '.deckent');
    mkdirSync(stateDir, { recursive: true });
    const statePath = join(stateDir, 'sprint-state.json');
    writeFileSync(statePath, JSON.stringify({
      sprintId: SPRINT_ID, phase: 'EXECUTE', status: 'ACTIVE',
      startedAt, updatedAt: startedAt, taskIds: ['900-001', '900-002'],
    }, null, 2), 'utf-8');
    const pidDir = join(stateDir, 'pids');
    mkdirSync(pidDir, { recursive: true });
    const pidPath = join(pidDir, `${SPRINT_ID}.pid`);
    writeFileSync(pidPath, JSON.stringify({ pid: 999999, sprintId: SPRINT_ID, startedAt }), 'utf-8');

    await runFinalizeCli(['--force']);

    // Archive-aware totals: 2/2, not 1/1
    const job = readJson<{ metrics: { totalTasks: number; done: number; duration: string; durationMs: number } }>(
      join(root, '.deckent', 'runtime', 'jobs', `${SPRINT_ID}.json`),
    );
    expect(job.metrics.totalTasks).toBe(2);
    expect(job.metrics.done).toBe(2);
    // Duration recovered from sprint-state (≥ 2 minutes), not 0ms/'unknown'
    expect(job.metrics.duration).not.toBe('unknown');
    expect(job.metrics.durationMs).toBeGreaterThanOrEqual(110_000);
    // Terminal state + pid cleanup (orphan-state fix)
    const state = readJson<{ status: string; phase: string }>(statePath);
    expect(state.status).toBe(SprintStatus.COMPLETE);
    expect(state.phase).toBe(SprintPhase.COMPLETE);
    expect(existsSync(pidPath)).toBe(false);
    // Stats recorded exactly once for the sprint (V1 default path) —
    // born-605: sidecar-ledger'dan okunur (manifest artık stats taşımaz).
    const agent = readSidecarStats(root, 'agents', 'test-agent-268');
    expect(agent.totalUses).toBe(2);
    expect(agent.successRate).toBe(1);
  });

  it('without recoverable startedAt the duration is "unknown" and a foreign sprint-state is preserved', async () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001'));
    writeResultFixture(tasksDir, makeResult('900-001'));

    // sprint-state belongs to ANOTHER sprint — must be neither used for
    // duration nor stamped COMPLETE.
    const stateDir = join(root, '.deckent');
    mkdirSync(stateDir, { recursive: true });
    const statePath = join(stateDir, 'sprint-state.json');
    writeFileSync(statePath, JSON.stringify({
      sprintId: 'sprint-901', phase: 'EXECUTE', status: 'ACTIVE',
      startedAt: '2026-06-09T00:00:00.000Z', updatedAt: '2026-06-09T00:00:00.000Z',
      taskIds: [],
    }, null, 2), 'utf-8');

    await runFinalizeCli(['--force']);

    const job = readJson<{ metrics: { duration: string } }>(
      join(root, '.deckent', 'runtime', 'jobs', `${SPRINT_ID}.json`),
    );
    expect(job.metrics.duration).toBe('unknown');

    const state = readJson<{ sprintId: string; status: string }>(statePath);
    expect(state.sprintId).toBe('sprint-901');
    expect(state.status).toBe('ACTIVE');
  });

  it('double CLI finalize --force keeps agent stats idempotent end-to-end', async () => {
    const tasksDir = join(root, '.tasks');
    writeTaskFixture(tasksDir, makeTask('900-001', { assignedAgent: 'test-agent-268' }));
    writeResultFixture(tasksDir, makeResult('900-001'));
    const agentPath = seedAgent(root, 'test-agent-268');

    await runFinalizeCli(['--force']);
    await runFinalizeCli(['--force']);

    const agent = readSidecarStats(root, 'agents', 'test-agent-268');
    expect(agent.totalUses).toBe(1); // NOT 2 — re-finalize is stats-idempotent
    expect(agent.successRate).toBe(1);
  });
});
