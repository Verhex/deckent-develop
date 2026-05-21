// ─── Verify Task Pattern Redesign — Post-Sprint Smoke Runner ──────────
// Sprint 182 W2-3 (Task 182-006): Verify tasks (e.g. CI parity sweep,
// vitest sweep verification) must observe upstream deliverables on disk.
// Pre-fix: verify tasks could be spawned mid-sprint before upstream LAND,
// producing empty/false-positive results (181-003 GO_WITH_TECH_DEBT).
//
// Fix: Verify tasks run AFTER sprint COMPLETE phase via a dedicated
// post-sprint smoke runner. Trigger contract:
//   • triggered === true iff all NON-verify tasks reached DONE / GO_WITH_TECH_DEBT
//   • upstreamDeliverables reflects the on-disk state AT smoke time
//     (i.e. upstream task outputs are guaranteed visible)
//
// 2 test cases per W2-3 GO criteria.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  classifyVerifyTasks,
  shouldTriggerPostSprintSmoke,
  runPostSprintSmoke,
  type SmokeTaskResult,
} from '../../src/orchestra/post-sprint-smoke.js';
import {
  SprintPhase,
  SprintStatus,
  TaskEvaluation,
} from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(tasks: Task[]): Sprint {
  return {
    id: 'sprint-182',
    number: 182,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks,
    workers: [],
    startedAt: '2026-05-21T00:00:00.000Z',
    completedAt: '2026-05-21T01:00:00.000Z',
  };
}

function makeResult(taskId: string, filesChanged: string[] = []): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged,
    linesAdded: 10,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'fixture',
  };
}

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `verify-task-pattern-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpRoot, { recursive: true });
});

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* noop */ }
});

// ─── Test Case 1: post-sprint smoke trigger ──────────────────────────
// W2-3 GO criterion 1: smoke triggers ONLY when all non-verify tasks pass.
// Reproduces Sprint 181 race: if verify task ran inside the wave, primary
// W1 task could be PENDING/EXECUTING → race → empty verify. Post-sprint
// runner gates on the evaluations map and refuses to fire on incomplete
// upstream work.

describe('runPostSprintSmoke — trigger gating (W2-3 case 1)', () => {
  it('triggers verify tasks only after all primary tasks reach DONE/GWT, and skips when a primary task is NO_GO', async () => {
    // Arrange — three-task sprint: 2 primary (W1) + 1 verify (W1-3 sweep)
    const primaryA = makeTask({ id: '182-001', title: 'W1-1 mock hygiene fix' });
    const primaryB = makeTask({ id: '182-002', title: 'W1-2 SpawnBackendFactory mock chain' });
    const verifyTask = makeTask({
      id: '182-003',
      title: 'W1-3 — Full vitest sweep CI=true parity verify',
      description: 'Smoke verification only',
    });
    const sprint = makeSprint([primaryA, primaryB, verifyTask]);

    // Classify recognises the verify task by title heuristic
    const verifyCandidates = classifyVerifyTasks(sprint);
    expect(verifyCandidates.map(v => v.taskId)).toEqual(['182-003']);
    const verifyTaskIds = verifyCandidates.map(v => v.taskId);

    // (A) Both primaries DONE → smoke must trigger
    const passingEvals = new Map<string, TaskEvaluation>([
      ['182-001', TaskEvaluation.DONE],
      ['182-002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['182-003', TaskEvaluation.DONE],
    ]);
    const gateAllPass = shouldTriggerPostSprintSmoke(sprint, passingEvals, verifyTaskIds);
    expect(gateAllPass.triggered).toBe(true);

    // (B) One primary NO_GO → smoke must NOT trigger
    const failingEvals = new Map<string, TaskEvaluation>([
      ['182-001', TaskEvaluation.NO_GO],
      ['182-002', TaskEvaluation.DONE],
      ['182-003', TaskEvaluation.DONE],
    ]);
    const gateOneFail = shouldTriggerPostSprintSmoke(sprint, failingEvals, verifyTaskIds);
    expect(gateOneFail.triggered).toBe(false);
    expect(gateOneFail.reason).toMatch(/primary/i);

    // (C) End-to-end: runPostSprintSmoke honours the gate and dispatches the
    // injected smoke runner only when triggered, never on the failing branch.
    const calls: string[] = [];
    const smokeRunner = async (task: Task): Promise<SmokeTaskResult> => {
      calls.push(task.id);
      return {
        taskId: task.id,
        passed: true,
        output: 'smoke ok',
        filesObserved: [],
      };
    };

    const allPassResult = await runPostSprintSmoke(
      tmpRoot,
      sprint,
      passingEvals,
      [makeResult('182-001'), makeResult('182-002')],
      { verifyTaskIds, smokeRunner },
    );
    expect(allPassResult.triggered).toBe(true);
    expect(allPassResult.primaryTasksAllPassed).toBe(true);
    expect(allPassResult.verifyTasks).toHaveLength(1);
    expect(allPassResult.verifyTasks[0]!.taskId).toBe('182-003');
    expect(allPassResult.verifyTasks[0]!.passed).toBe(true);
    expect(calls).toEqual(['182-003']);

    const failResult = await runPostSprintSmoke(
      tmpRoot,
      sprint,
      failingEvals,
      [makeResult('182-001'), makeResult('182-002')],
      { verifyTaskIds, smokeRunner },
    );
    expect(failResult.triggered).toBe(false);
    expect(failResult.primaryTasksAllPassed).toBe(false);
    expect(failResult.verifyTasks).toHaveLength(0);
    // Smoke runner was NOT invoked when the gate failed
    expect(calls).toEqual(['182-003']);
  });
});

// ─── Test Case 2: W1 deliverable visible ─────────────────────────────
// W2-3 GO criterion 2: a verify task scheduled via the post-sprint smoke
// runner observes upstream W1 deliverables on disk. Reproduces the inverse
// of the Sprint 181 race — write the W1 deliverable AFTER the primary
// "executes" but BEFORE the smoke fires, then assert the smoke sees it.

describe('runPostSprintSmoke — W1 deliverable visibility (W2-3 case 2)', () => {
  it('aggregates upstream deliverables from primary results and the smoke runner can read them on disk', async () => {
    // Arrange
    const w1Primary = makeTask({
      id: '182-001',
      title: 'W1-1 Mock hygiene: orphan-cleaner-ipc renameSync',
      scope: {
        directories: ['tests/core/', 'tests/cli/'],
        filesRead: [],
        filesWrite: ['tests/core/orphan-cleaner-ipc.test.ts'],
      },
    });
    const w1Verify = makeTask({
      id: '182-003',
      title: 'W1-3 verify — vitest sweep CI parity',
    });
    const sprint = makeSprint([w1Primary, w1Verify]);

    // Simulate W1 having LANDED its deliverable to disk BEFORE the smoke fires.
    // This mirrors the post-sprint sequencing contract — smoke executes only
    // after EVALUATE/RETRO phases, so all upstream writes are visible.
    const deliverableRel = 'tests/core/orphan-cleaner-ipc.test.ts';
    const deliverableAbs = join(tmpRoot, deliverableRel);
    mkdirSync(join(tmpRoot, 'tests/core'), { recursive: true });
    writeFileSync(deliverableAbs, '// vi.mock node:fs renameSync added\n');

    const evaluations = new Map<string, TaskEvaluation>([
      ['182-001', TaskEvaluation.DONE],
      ['182-003', TaskEvaluation.DONE],
    ]);
    const results: TaskResult[] = [
      makeResult('182-001', [deliverableRel]),
    ];

    const verifyCandidates = classifyVerifyTasks(sprint);
    expect(verifyCandidates.map(v => v.taskId)).toEqual(['182-003']);

    // The smoke runner inspects the on-disk deliverable — proves visibility.
    const smokeRunner = async (task: Task, root: string): Promise<SmokeTaskResult> => {
      const observed: string[] = [];
      if (existsSync(join(root, deliverableRel))) observed.push(deliverableRel);
      return {
        taskId: task.id,
        passed: observed.length > 0,
        output: `verify saw ${observed.length} upstream deliverable(s)`,
        filesObserved: observed,
      };
    };

    // Act
    const smokeResult = await runPostSprintSmoke(
      tmpRoot,
      sprint,
      evaluations,
      results,
      { verifyTaskIds: verifyCandidates.map(v => v.taskId), smokeRunner },
    );

    // Assert
    expect(smokeResult.triggered).toBe(true);
    expect(smokeResult.upstreamDeliverables).toContain(deliverableRel);
    expect(smokeResult.verifyTasks).toHaveLength(1);
    expect(smokeResult.verifyTasks[0]!.passed).toBe(true);
    expect(smokeResult.verifyTasks[0]!.filesObserved).toEqual([deliverableRel]);
    expect(smokeResult.verifyTasks[0]!.output).toMatch(/1 upstream deliverable/);
  });
});
