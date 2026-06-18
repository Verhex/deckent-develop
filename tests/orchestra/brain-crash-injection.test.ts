// ═══ Brain Crash Injection Integration Tests ═════════════════════════
// Sprint 162 Task 3 (T-007). Five crash scenarios that prove the Sprint
// 160-162 stability work survives the failure modes it was designed for:
//
//   S1: SIGTERM mid-EXECUTE → checkpoint + .result enables resume-evaluate
//   S2: unhandledRejection carries an API key → redactSensitive scrubs it
//   S4: sprint-state.json desync + checkpoint @EVALUATE → recovery re-syncs
//   S5: Missing checkpoint → readCheckpoint returns null (fresh-start, no
//       false positive)
//   S6: writeEvaluationAudit throws → runEvaluatePhase still completes
//       (fail-soft wire, T-003 verified)
//
// NOTE: S3 (Double-MCP singleton race) retired by MCP-W1 — coexistence is
// now covered by the writer-lease tests (tests/mcp/writer-lease*.test.ts).
//
// Heavy collaborators around runEvaluatePhase are mocked so the suite
// stays a unit-of-integration test: the public APIs and on-disk artifacts
// are real, but we do not spin up workers, providers, or the auditor.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SprintPhase, SprintStatus, TaskEvaluation, TaskStatus,
} from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';
import { DECKENT_DIR, TASKS_DIR, EVALUATIONS_DIR } from '../../src/core/constants.js';

// ─── Mocks (must register before sprint-phases imports) ────────────────

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true }),
  parseTscErrorFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-spawner.js', () => ({
  applyCascadeToSprint: vi.fn().mockReturnValue({
    decision: { shouldCascade: false, category: 'RUNTIME' },
    blockedTaskIds: [],
  }),
  applyUnblockToSprint: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-162-crash'),
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  evaluateWithRubric: vi.fn(() => ({
    decision: 'DONE',
    totalScore: 90,
    rubricScores: [
      { criterion: 'correctness', score: 92, passed: true, reason: 'tests pass' },
      { criterion: 'test_coverage', score: 85, passed: true, reason: 'coverage 85%' },
      { criterion: 'scope_compliance', score: 100, passed: true, reason: 'scope ok' },
      { criterion: 'documentation', score: 80, passed: true, reason: 'notes present' },
    ],
    retryCount: 0,
  })),
}));

vi.mock('../../src/orchestra/sprint-controller.js', async () => {
  const utils = await import('../../src/orchestra/sprint-utils.js');
  return {
    BrainError: class BrainError extends Error {
      constructor(msg: string, public phase: string) { super(msg); }
    },
    readContext: vi.fn().mockReturnValue({ memory: '', retro: '', patterns: '', debt: '' }),
    planSprint: vi.fn().mockResolvedValue({
      id: 'sprint-162-crash', number: 162, tasks: [], workers: [],
      phase: SprintPhase.PLAN, status: SprintStatus.PLANNING, startedAt: '',
    }),
    writeSprintState: utils.writeSprintState,
    spawnWorkers: vi.fn().mockResolvedValue([]),
    buildSpawnRetryHint: vi.fn().mockReturnValue(''),
    waitForResults: vi.fn().mockResolvedValue([]),
    finalizeSprint: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
  };
});

// Audit-trail mock: factory + handles allow re-binding per test.
const writeEvaluationAuditMock = vi.fn();
vi.mock('../../src/orchestra/evaluation-audit-trail.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/orchestra/evaluation-audit-trail.js')>(
    '../../src/orchestra/evaluation-audit-trail.ts',
  );
  return {
    ...actual,
    writeEvaluationAudit: (...args: unknown[]) => writeEvaluationAuditMock(...args),
  };
});

// ─── Imports of modules under test (post-mock) ────────────────────────

import { redactSensitive } from '../../src/orchestra/sensitive-redactor.js';
import {
  writeCheckpoint, readCheckpoint, writePhaseCheckpoint,
  restoreSprintFromCheckpoint,
} from '../../src/orchestra/sprint-checkpoint.js';
import { writeSprintState, readSprintState } from '../../src/orchestra/sprint-utils.js';
import {
  persistPhaseTransition,
  runEvaluatePhase,
} from '../../src/orchestra/sprint-phases.js';
import {
  writeEvaluationAudit as realWriteEvaluationAudit,
} from '../../src/orchestra/evaluation-audit-trail.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeProjectRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `deckent-${prefix}-`));
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  return root;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'Test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'crash injection',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status,
  };
}

function makeSprint(
  id: string,
  tasks: Task[],
  phase: SprintPhase = SprintPhase.EXECUTE,
  status: SprintStatus = SprintStatus.ACTIVE,
): Sprint {
  return {
    id,
    number: parseInt(id.replace(/^sprint-/, ''), 10) || 162,
    status,
    phase,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: '2026-05-12T20:00:00.000Z',
  };
}

function makeResult(taskId: string): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/foo.ts'],
    linesAdded: 12,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 88,
    selfAssessment: 'DONE',
    notes: 'crash injection result',
  };
}

function writeTaskJson(root: string, task: Task): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
    'utf-8',
  );
}

function writeTaskResult(root: string, taskId: string): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.result`),
    JSON.stringify(makeResult(taskId), null, 2),
    'utf-8',
  );
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('Sprint 162 T-007 — Brain crash injection integration', () => {
  let root: string;

  beforeEach(() => {
    root = makeProjectRoot('crash-injection');
    writeEvaluationAuditMock.mockImplementation((...args: unknown[]) =>
      (realWriteEvaluationAudit as (...a: unknown[]) => unknown)(...args));
    vi.clearAllMocks();
    // Restore default behavior after clearAllMocks
    writeEvaluationAuditMock.mockImplementation((...args: unknown[]) =>
      (realWriteEvaluationAudit as (...a: unknown[]) => unknown)(...args));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── S1: SIGTERM mid-EXECUTE ─────────────────────────────────────────
  it('S1: SIGTERM mid-EXECUTE — restoreSprintFromCheckpoint returns action=resume-evaluate', () => {
    const sprintId = 'sprint-162-crash';
    const t1 = makeTask('162-901', TaskStatus.DONE);
    const t2 = makeTask('162-902', TaskStatus.EXECUTING);
    writeTaskJson(root, t1);
    writeTaskJson(root, t2);
    const sprint = makeSprint(sprintId, [t1, t2], SprintPhase.EXECUTE);

    // Brain emits a checkpoint mid-EXECUTE.
    const cp = writeCheckpoint(root, sprint, 17);
    expect(cp).not.toBeNull();
    expect(cp!.completedTasks).toContain('162-901');
    expect(cp!.activeWorkers.map(w => w.taskId)).toContain('162-902');

    // Worker 162-902 finishes flushing .result just before SIGTERM hits.
    writeTaskResult(root, '162-902');

    // Brain restart loop discovers the checkpoint and resumes EVALUATE.
    const recovery = restoreSprintFromCheckpoint(root, sprintId);
    expect(recovery.restored).toBe(true);
    expect(recovery.action).toBe('resume-evaluate');
    expect(recovery.staleTasksWithResult).toEqual(['162-902']);
    expect(recovery.staleTasksMarkedNoGo).toEqual([]);
    expect(recovery.restoredSprint).toBeDefined();
    expect(recovery.restoredSprint!.tasks.map(t => t.id).sort())
      .toEqual(['162-901', '162-902']);
    // 162-902 status preserved (had .result) — not auto-marked NO_GO.
    const restored902 = recovery.restoredSprint!.tasks.find(t => t.id === '162-902');
    expect(restored902!.status).toBe(TaskStatus.EXECUTING);
  });

  // ─── S2: unhandledRejection with API key ─────────────────────────────
  it('S2: unhandledRejection carrying API key — redactSensitive scrubs it (T-001)', () => {
    const leaked = 'sk-ant-' + 'A'.repeat(48);
    const rejection = new Error(
      `Worker spawn failed: ANTHROPIC_API_KEY=${leaked} cmd=run worker`,
    );
    rejection.stack = [
      'Error: spawn failed',
      `    at WorkerSpawner (auth: Bearer ${leaked})`,
      '    at process._tickCallback (internal/process/next_tick.js:189:7)',
    ].join('\n');

    const redacted = redactSensitive(rejection);

    expect(redacted.name).toBe('Error');
    expect(redacted.message).not.toContain(leaked);
    expect(redacted.message).toContain('[REDACTED]');
    // Env-var pattern strips both the key value and the surrounding key=value.
    // The redactor's downstream api_key pattern is case-insensitive — match
    // either casing so the assertion is robust to ordering of replacements.
    expect(redacted.message.toLowerCase()).toContain('anthropic_api_key=[redacted]');
    expect(redacted.stack).toBeDefined();
    expect(redacted.stack!).not.toContain(leaked);
    // Stack frames containing >100 chars after a colon are collapsed by the
    // `redactLongContent` pass — match either the per-pattern Bearer
    // replacement or the length-based collapse marker.
    expect(redacted.stack!).toMatch(/Bearer \[REDACTED\]|\[REDACTED:\d+ chars\]/);
  });

  // ─── S4: sprint-state desync + checkpoint @EVALUATE ──────────────────
  it('S4: state.json desync + checkpoint @EVALUATE — restoreSprintFromCheckpoint re-syncs state.json (T-003 + T-004)', () => {
    const sprintId = 'sprint-162-crash';
    const t1 = makeTask('162-911', TaskStatus.DONE);
    const t2 = makeTask('162-912', TaskStatus.EXECUTING);
    writeTaskJson(root, t1);
    writeTaskJson(root, t2);

    // Reproduce Sprint 159 forensic: state.json frozen at SPAWN/PLANNING
    // while the brain has actually crossed into EVALUATE.
    const stale = makeSprint(sprintId, [t1, t2], SprintPhase.SPAWN, SprintStatus.PLANNING);
    writeSprintState(root, stale);
    let onDisk = readSprintState(root);
    expect(onDisk?.phase).toBe(SprintPhase.SPAWN);

    // Authoritative checkpoint says we crashed during EVALUATE.
    const evaluating = makeSprint(sprintId, [t1, t2], SprintPhase.EVALUATE, SprintStatus.EVALUATING);
    writePhaseCheckpoint(root, evaluating, SprintPhase.EVALUATE, 7);
    // Worker 162-912 had a result on disk before the crash.
    writeTaskResult(root, '162-912');

    // T-004 + T-003: restoreSprintFromCheckpoint re-syncs state.json.
    const recovery = restoreSprintFromCheckpoint(root, sprintId);
    expect(recovery.restored).toBe(true);
    expect(recovery.action).toBe('resume-evaluate');
    expect(recovery.staleTasksWithResult).toContain('162-912');

    onDisk = readSprintState(root);
    expect(onDisk?.phase).toBe(SprintPhase.EVALUATE);
    expect(onDisk?.status).toBe(SprintStatus.EVALUATING);
  });

  // ─── S5: Missing checkpoint — action 'fresh' ─────────────────────────
  it('S5: No checkpoint file — restoreSprintFromCheckpoint returns action=fresh (no false-positive)', () => {
    const sprintId = 'sprint-162-crash';
    // No checkpoint, no .deckent state — pristine boot.
    expect(readCheckpoint(root, sprintId)).toBeNull();

    const recovery = restoreSprintFromCheckpoint(root, sprintId);
    expect(recovery.restored).toBe(false);
    expect(recovery.action).toBe('fresh');
    expect(recovery.restoredSprint).toBeUndefined();
    expect(recovery.staleTasksWithResult).toEqual([]);
    expect(recovery.staleTasksMarkedNoGo).toEqual([]);
  });

  // ─── S6: writeEvaluationAudit fail-soft ──────────────────────────────
  it('S6: writeEvaluationAudit throws — runEvaluatePhase still completes (T-003 fail-soft)', async () => {
    writeEvaluationAuditMock.mockImplementation(() => {
      throw new Error('disk full — synthetic audit write failure');
    });

    const sprintId = 'sprint-162-crash';
    const task = makeTask('162-921', TaskStatus.EXECUTING);
    const sprint = makeSprint(sprintId, [task], SprintPhase.EXECUTE, SprintStatus.ACTIVE);
    const evaluations = new Map<string, TaskEvaluation>();

    // The wire is wrapped in try/catch (sprint-phases.ts L782-797).
    // A throwing audit MUST NOT propagate out of runEvaluatePhase.
    await expect(
      runEvaluatePhase(root, sprint, [makeResult('162-921')], evaluations),
    ).resolves.toBeUndefined();

    expect(writeEvaluationAuditMock).toHaveBeenCalled();
    expect(evaluations.get('162-921')).toBe(TaskEvaluation.DONE);

    // Per-task audit JSON must NOT have been created (write failed).
    const auditPath = join(root, EVALUATIONS_DIR, sprintId, '162-921-attempt-1.json');
    expect(existsSync(auditPath)).toBe(false);

    // Phase transition still reached disk despite the audit failure —
    // T-003 observability wire is independent of audit-trail wire.
    const state = readSprintState(root);
    expect(state?.phase).toBe(SprintPhase.EVALUATE);
    expect(state?.status).toBe(SprintStatus.EVALUATING);
  });
});
