// ═══ run-flow-controller.applyRunCompletion tests (TERM5-CTRL, sprint-427 task 5) ═══
//
// Covers the controller's new completion channel: a flowId-correlated
// `RunCompletionInfo` (run-completion-watch.ts — the SAME type run.tsx's
// wireBgTurnsProducer already consumes from `createRunCompletionWatch`'s
// `onComplete`) drives DETACHED_RUNNING -> COMPLETED / FAILED through the
// EXISTING `reduceRunFlow` (orchestra/run-flow-reducer.ts) — never a
// hand-rolled state mutation.
//
// Hermetic trajectory setup mirrors tests/cli/run-flow-mount.test.ts's own
// "startApproved() trajectory" describe block exactly: real
// generatePlanPreview/compileRunProposal (only orchestra/brain.js's
// planSprint/readContext mocked), a fake `spawnStart` (no real sprint ever
// spawns), and REAL run-flow-store.ts functions against a tmpdir root.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../src/orchestra/brain.js', () => ({
  planSprint: vi.fn(),
  readContext: vi.fn(),
}));

import { planSprint, readContext } from '../../src/orchestra/brain.js';
import { createRunFlowController, type RunFlowControllerDeps } from '../../src/cli/repl/run-flow-controller.js';
import type { RunHandle } from '../../src/orchestra/run-job-service.js';
import type { RunCompletionInfo } from '../../src/cli/repl/run-completion-watch.js';
import { SprintStatus, SprintPhase, TaskStatus } from '../../src/core/types.js';
import type { Sprint, Task, ResolvedConfig, BrainContext } from '../../src/core/types.js';

const mockPlanSprint = vi.mocked(planSprint);
const mockReadContext = vi.mocked(readContext);

// ─── Fixtures (mirrors tests/cli/run-flow-mount.test.ts's own style) ──────

function makeConfig(): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'sonnet',
      haiku_allowed: true, brain_planning: 'auto',
    },
    modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/mock/root',
    version: '1.0.0', auto_docs: { tier1: true, tier2: true, tier3: false },
  } as ResolvedConfig;
}

function makeBrainContext(): BrainContext {
  return {
    directives: '', memory: '', retro: '', debt: [], patterns: '', decisions: '',
    existingTasks: [], projectState: { gitStatus: '', fileTree: [] },
  };
}

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '001-001', title: 'Do the thing', description: 'Do the thing well.', model: 'sonnet',
    effort: 'normal', priority: 'NORMAL', reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING, sprintId: 'sprint-001', createdAt: new Date(0).toISOString(),
    ...overrides,
  } as Task;
}

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-001', number: 1,
    status: SprintStatus.PLANNING, phase: SprintPhase.PLAN,
    tasks: [makeTask()], workers: ['w-001-001'],
    ...overrides,
  };
}

function completion(overrides?: Partial<RunCompletionInfo>): RunCompletionInfo {
  return { jobId: 'job-1', status: 'COMPLETE', ...overrides };
}

describe('createRunFlowController — applyRunCompletion() (TERM5-CTRL, 427-005)', () => {
  let tick = 0;
  const nowFn = (): string => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString();
  let root: string;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    tick = 0;
    mockReadContext.mockReturnValue(makeBrainContext());
    mockPlanSprint.mockReturnValue(makeSprint() as any);
    root = mkdtempSync(join(tmpdir(), 'run-flow-controller-complete-test-'));
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    errorSpy.mockRestore();
  });

  function makeControllerDeps(spawnStart?: RunFlowControllerDeps['spawnStart']) {
    return {
      root,
      config: makeConfig(),
      now: nowFn,
      generateFlowId: () => 'flow-1',
      ...(spawnStart ? { spawnStart } : {}),
    };
  }

  async function driveToDetachedRunning(jobId = 'fake-job-1') {
    const spawnStart = vi.fn((_sprint: Sprint, flowId: string): RunHandle => ({
      flowId, jobId, logRef: '/fake/log.log',
    }));
    const controller = createRunFlowController(makeControllerDeps(spawnStart));
    await controller.proposeRun('Ship the thing');
    controller.approve({ id: 'alperen' });
    const started = controller.startApproved!();
    expect(started.state).toBe('DETACHED_RUNNING');
    return controller;
  }

  it('DETACHED_RUNNING + status COMPLETE -> COMPLETED via the reducer', async () => {
    const controller = await driveToDetachedRunning();

    const result = controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'COMPLETE' }));

    expect(result.state).toBe('COMPLETED');
    expect(controller.getContext().state).toBe('COMPLETED');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('DETACHED_RUNNING + status FAILED -> FAILED via the reducer, failureReason from event.error', async () => {
    const controller = await driveToDetachedRunning();

    const result = controller.applyRunCompletion!(
      completion({ flowId: 'flow-1', status: 'FAILED', error: 'worker crashed' }),
    );

    expect(result.state).toBe('FAILED');
    expect(result.failureReason).toBe('worker crashed');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('FAILED with no event.error -> a synthesized, non-empty fallback failureReason', async () => {
    const controller = await driveToDetachedRunning('job-xyz');

    const result = controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'FAILED', jobId: 'job-xyz' }));

    expect(result.state).toBe('FAILED');
    expect(result.failureReason).toBeTruthy();
    expect(result.failureReason).toContain('job-xyz');
  });

  it('wrong-flow event: context unchanged, ignored with a loud console.error', async () => {
    const controller = await driveToDetachedRunning();
    const before = controller.getContext();

    const result = controller.applyRunCompletion!(completion({ flowId: 'some-other-flow', status: 'COMPLETE' }));

    expect(result).toBe(before);
    expect(result.state).toBe('DETACHED_RUNNING');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toContain('run-flow-controller');
  });

  it('event with flowId unset while controller has no active flow: ignored with a loud console.error', () => {
    const controller = createRunFlowController(makeControllerDeps());
    const before = controller.getContext();

    const result = controller.applyRunCompletion!(completion({ status: 'COMPLETE' }));

    expect(result).toBe(before);
    expect(result.state).toBe('COLLECTING');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('idempotent: applying the same COMPLETE event twice — the second call is a silent no-op', async () => {
    const controller = await driveToDetachedRunning();

    const first = controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'COMPLETE' }));
    const second = controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'COMPLETE' }));

    expect(first.state).toBe('COMPLETED');
    expect(second).toBe(first);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('idempotent: a stray FAILED event replayed against an already-COMPLETED flow is also a silent no-op (state-based guard, not event-identity)', async () => {
    const controller = await driveToDetachedRunning();
    const completed = controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'COMPLETE' }));

    const result = controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'FAILED', error: 'late failure' }));

    expect(result).toBe(completed);
    expect(result.state).toBe('COMPLETED');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a genuinely invalid transition (context still AWAITING_APPROVAL) propagates the reducer\'s typed RunFlowTransitionError, not swallowed', async () => {
    const controller = createRunFlowController(makeControllerDeps());
    await controller.proposeRun('Ship the thing');
    expect(controller.getContext().state).toBe('AWAITING_APPROVAL');

    expect(() => controller.applyRunCompletion!(completion({ flowId: 'flow-1', status: 'COMPLETE' })))
      .toThrow(/cannot apply 'RUN_COMPLETED'/);
  });

  it('existing propose/approve/reject/startApproved surface is unchanged by this addition', async () => {
    const controller = await driveToDetachedRunning();
    expect(typeof controller.proposeRun).toBe('function');
    expect(typeof controller.approve).toBe('function');
    expect(typeof controller.reject).toBe('function');
    expect(typeof controller.startApproved).toBe('function');
    expect(typeof controller.applyRunCompletion).toBe('function');
  });
});
