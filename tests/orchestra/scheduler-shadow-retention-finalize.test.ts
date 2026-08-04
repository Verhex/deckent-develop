/**
 * tests/orchestra/scheduler-shadow-retention-finalize.test.ts — Task 430-004
 *
 * End-to-end proof that the 430-001/002/003 chain (config schema + retention
 * engine + finalize wiring, Step 12f in sprint-finalizer.ts) really works
 * TOGETHER via a REAL `finalizeSprint()` call — not a mock.
 *
 * Unlike sprint-finalizer.test.ts / finalize-sprint.test.ts (which fully mock
 * `node:fs` for wiring/control-flow tests), this file does NOT mock `node:fs` —
 * the whole point is verifying a real archive-move side effect on disk. The
 * only mock is `node:child_process` spawnSync, so finalizeSprint's Step 10b
 * (runSelfAuditGate) does not spawn a real `npx tsc`/`npx vitest` against a
 * tmp project root with no package.json (slow/flaky/unrelated to this task).
 *
 * Covers:
 *  (1) default retention (14d): old journal archived, new journal kept
 *  (2) `.deckent/config.json` scheduler_shadow_retention override (7d):
 *      a 10-day-old file (kept under default 14d) is archived under override
 *  (3) side-effect-free integration: SprintMetrics return value, Step 13 job
 *      summary, Step 12b orphan-task archive, Step 12e stale-handoff prune —
 *      all still run correctly alongside the new Step 12f call
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync, writeFileSync, existsSync, utimesSync, rmSync, readFileSync,
} from 'node:fs';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, TaskResult } from '../../src/core/types.js';

// Only fake the specific spawnSync calls that would otherwise spawn a real
// `npx tsc --noEmit` / `npx vitest run` (finalizeSprint Step 10b self-audit
// gate) against this tmp project root (no package.json/tsconfig — slow/
// flaky/unrelated to this task). Every other spawnSync call (Step 12b's
// `tar` pre-archive snapshot, Step 10's `git diff`) passes through to the
// REAL implementation — those are fast, and Step 12b's real tar snapshot is
// a precondition for archiveOrphanTasks actually running (same try/catch).
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args?: readonly string[], opts?: unknown) => {
      if (cmd === 'npx' && (args?.[0] === 'tsc' || args?.[0] === 'vitest')) {
        return { status: 0, stdout: '', stderr: '', pid: 0, output: [], signal: null };
      }
      return actual.spawnSync(cmd, args as string[], opts as Parameters<typeof actual.spawnSync>[2]);
    }),
  };
});

import { finalizeSprint } from '../../src/orchestra/sprint-finalizer.js';

// ─── Fixture helpers (mirrors makeSprint()/minimal TaskResult literals used
//     throughout tests/orchestra/sprint-finalizer.test.ts) ──────────────────

function makeSprint(id: string, number: number): Sprint {
  return {
    id,
    number,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
  };
}

function makeResult(taskId: string, selfAssessment: TaskResult['selfAssessment'] = 'DONE'): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/foo.ts'],
    linesAdded: 5,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment,
    notes: '',
    // Finalizer terminal-evidence gerçeği: attempt kimliği host-VERIFIED
    // workAttribution'dan gelir; attribution'sız bir result attemptId '' →
    // INVALID_IDENTITY hold → finalizeSprint TERMINAL_EVIDENCE_HOLD fırlatır.
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${taskId}-1`,
      baselineRef: `baseline-${taskId}`,
      scopeDigest: `scope-${taskId}`,
    },
  };
}

/** Minimal settled task — the fenced terminal receipt is only cleanup-eligible
 *  when at least one logical lineage settles (an empty sprint assembles as
 *  NO_LOGICAL_TASKS → BLOCKED → TERMINAL_RECEIPT_NOT_CLEANUP_ELIGIBLE). */
function makeSettledTask(taskId: string): Sprint['tasks'][number] {
  return {
    id: taskId, title: `Task ${taskId}`, description: '', model: 'sonnet',
    effort: 'normal', priority: 'HIGH', reason: '',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
  } as unknown as Sprint['tasks'][number];
}

const FINALIZE_OPTS = {
  skipDecay: true,
  skipHooks: true,
  skipMemoryExport: true,
  skipIdentityRegen: true,
  onRuleRegen: async () => { /* no-op — irrelevant to this task's scope */ },
};

function createTmpProject(suffix: string): string {
  const dir = join(
    tmpdir(),
    `deckent-finalize-sched-shadow-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  );
  mkdirSync(join(dir, '.deckent', 'runtime', 'scheduler-shadow'), { recursive: true });
  mkdirSync(join(dir, '.brain'), { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function cleanupTmpProject(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/** Seed a scheduler-shadow journal backdated by `ageDays`. */
function seedJournal(root: string, filename: string, ageDays: number): void {
  const filePath = join(root, '.deckent', 'runtime', 'scheduler-shadow', filename);
  writeFileSync(filePath, '{"tick":1}\n');
  const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  utimesSync(filePath, mtime, mtime);
}

function schedShadowPath(root: string, filename: string): string {
  return join(root, '.deckent', 'runtime', 'scheduler-shadow', filename);
}

function schedShadowArchivePath(root: string, filename: string): string {
  return join(root, '.deckent', 'archive', 'scheduler-shadow', filename);
}

// ─── (1) Default retention — real finalizeSprint() call ──────────────────────

describe('scheduler-shadow retention — real finalizeSprint() integration', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('default'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('archives a stale journal and keeps a fresh one during a real finalizeSprint() call (default 14d)', async () => {
    seedJournal(tmpDir, 'sprint-old.jsonl', 20);
    seedJournal(tmpDir, 'sprint-new.jsonl', 0);

    const sprint = makeSprint('sprint-9001', 9001);
    sprint.tasks = [makeSettledTask('9001-001')];
    const evaluations = new Map<string, TaskEvaluation>([['9001-001', TaskEvaluation.DONE]]);

    await finalizeSprint(tmpDir, sprint, evaluations, [makeResult('9001-001')], FINALIZE_OPTS);

    expect(existsSync(schedShadowPath(tmpDir, 'sprint-old.jsonl'))).toBe(false);
    expect(existsSync(schedShadowArchivePath(tmpDir, 'sprint-old.jsonl'))).toBe(true);
    expect(existsSync(schedShadowPath(tmpDir, 'sprint-new.jsonl'))).toBe(true);
    expect(existsSync(schedShadowArchivePath(tmpDir, 'sprint-new.jsonl'))).toBe(false);
  }, 30_000);
});

// ─── (2) Config override read from real .deckent/config.json ────────────────

describe('scheduler-shadow retention — config override via real finalizeSprint()', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('override'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('a 10-day-old file (kept under default 14d) is archived once .deckent/config.json sets retention_days=7', async () => {
    writeFileSync(
      join(tmpDir, '.deckent', 'config.json'),
      JSON.stringify({ scheduler_shadow_retention: { retention_days: 7 } }, null, 2),
    );

    seedJournal(tmpDir, 'sprint-old.jsonl', 20);
    seedJournal(tmpDir, 'sprint-new.jsonl', 0);
    seedJournal(tmpDir, 'sprint-mid.jsonl', 10); // > default keep, but > 7d override → archive

    const sprint = makeSprint('sprint-9002', 9002);
    sprint.tasks = [makeSettledTask('9002-001')];
    const evaluations = new Map<string, TaskEvaluation>([['9002-001', TaskEvaluation.DONE]]);

    await finalizeSprint(tmpDir, sprint, evaluations, [makeResult('9002-001')], FINALIZE_OPTS);

    expect(existsSync(schedShadowArchivePath(tmpDir, 'sprint-old.jsonl'))).toBe(true);
    expect(existsSync(schedShadowArchivePath(tmpDir, 'sprint-mid.jsonl'))).toBe(true);
    expect(existsSync(schedShadowPath(tmpDir, 'sprint-mid.jsonl'))).toBe(false);
    expect(existsSync(schedShadowPath(tmpDir, 'sprint-new.jsonl'))).toBe(true);
  }, 30_000);
});

// ─── (3) Side-effect-free integration: everything else still runs ───────────

describe('scheduler-shadow retention — finalizeSprint side-effect-free integration', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTmpProject('integration'); });
  afterEach(() => cleanupTmpProject(tmpDir));

  it('SprintMetrics return value, Step 13 job summary, orphan-task archive, and stale-handoff prune all still run alongside Step 12f', async () => {
    seedJournal(tmpDir, 'sprint-old.jsonl', 20);
    seedJournal(tmpDir, 'sprint-new.jsonl', 0);

    // Orphan task file for Step 12b (archiveOrphanTasks) — task-<sprintNum>-*.result
    const orphanTaskFile = join(tmpDir, '.tasks', 'task-9003-001.result');
    writeFileSync(orphanTaskFile, JSON.stringify({ taskId: '9003-001', selfAssessment: 'DONE' }));

    // Stale handoff for Step 12e (pruneStaleHandoffs) — neither endpoint is in sprint.tasks
    const handoffsDir = join(tmpDir, '.tasks', 'handoffs');
    mkdirSync(handoffsDir, { recursive: true });
    const staleHandoffPath = join(handoffsDir, 'old-001-to-old-002.json');
    writeFileSync(staleHandoffPath, JSON.stringify({
      id: 'old-001-to-old-002', fromTaskId: 'old-001', toTaskId: 'old-002',
      artifacts: ['x.ts'], status: 'ready', createdAt: new Date().toISOString(),
    }));

    const sprint = makeSprint('sprint-9003', 9003);
    sprint.tasks = [
      { id: '9003-001', title: 'Task 1', description: '', model: 'sonnet', effort: 'normal', priority: 'HIGH', reason: '', scope: { directories: ['src/'], filesRead: [], filesWrite: [] }, dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' }, status: 'DONE' },
      { id: '9003-002', title: 'Task 2', description: '', model: 'sonnet', effort: 'normal', priority: 'HIGH', reason: '', scope: { directories: ['src/'], filesRead: [], filesWrite: [] }, dependencies: [], goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' }, status: 'DONE' },
    ] as Sprint['tasks'];

    const evaluations = new Map<string, TaskEvaluation>([
      ['9003-001', TaskEvaluation.DONE],
      ['9003-002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const results = [makeResult('9003-001', 'DONE'), makeResult('9003-002', 'GO_WITH_TECH_DEBT')];

    const metrics = await finalizeSprint(tmpDir, sprint, evaluations, results, FINALIZE_OPTS);

    // ── Step 12f (this task's chain) still archives the stale journal ──
    expect(existsSync(schedShadowArchivePath(tmpDir, 'sprint-old.jsonl'))).toBe(true);
    expect(existsSync(schedShadowPath(tmpDir, 'sprint-new.jsonl'))).toBe(true);

    // ── Return value (SprintMetrics) unaffected ──
    expect(metrics.totalTasks).toBe(2);
    expect(metrics.completedTasks).toBe(2);
    expect(metrics.techDebtTasks).toBe(1);
    expect(metrics.noGoTasks).toBe(0);

    // ── Step 13: job completion summary still written, metrics match ──
    const jobPath = join(tmpDir, '.deckent', 'runtime', 'jobs', 'sprint-9003.json');
    expect(existsSync(jobPath)).toBe(true);
    const jobData = JSON.parse(readFileSync(jobPath, 'utf-8')) as { metrics: { totalTasks: number; techDebt: number } };
    expect(jobData.metrics.totalTasks).toBe(2);
    expect(jobData.metrics.techDebt).toBe(1);

    // ── Step 12b: orphan task file physically archived ──
    expect(existsSync(orphanTaskFile)).toBe(false);
    const archivedOrphanPath = join(tmpDir, '.brain', 'archive', 'sprints', 'sprint-9003-tasks', 'task-9003-001.result');
    expect(existsSync(archivedOrphanPath)).toBe(true);

    // ── Step 12e: stale handoff (endpoints outside this sprint) pruned ──
    expect(existsSync(staleHandoffPath)).toBe(false);
  }, 30_000);
});
