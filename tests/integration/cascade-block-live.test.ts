// ─── Integration Test: Cascade Block Live Evidence ──────────────────────────
// Sprint 139 Task 139-052 — Alperen Q5 Direktifi
//
// "Unit test yetmez, doğrulama kritik" — Bu integration test gerçek dosya I/O
// üzerinde çalışır. Mock kullanılmaz. Event stream'e gerçek yazma yapılır.
//
// Cascade block akışı:
//   1. Dummy task (task-139-dummy-inject) bilinçli NO_GO döner
//   2. cascadeBlockDependents çağrılır → bağımlı task PAUSED olur
//   3. DEPENDENCY_BLOCKED event stream'e yazılır
//   4. Dummy task "resolve" edilir → unblockDependents çağrılır
//   5. DEPENDENCY_UNBLOCKED event stream'e yazılır
//   6. readEvents ile her iki event doğrulanır

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildDependencyGraph,
  cascadeBlockDependents,
  unblockDependents,
  type CascadeTransitionEvent,
} from '../../src/orchestra/dependency-scheduler.js';
import {
  writeEvent,
  readEvents,
} from '../../src/orchestra/event-stream.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Create a minimal Task stub for testing. */
function makeTask(
  id: string,
  status: TaskStatus,
  dependencies: string[] = [],
): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Test task ${id}`,
    model: 'haiku' as const,
    effort: 'low' as const,
    priority: 'NORMAL' as const,
    reason: 'test',
    scope: {
      directories: ['tests/integration/'],
      filesRead: [],
      filesWrite: [],
    },
    dependencies,
    goNogo: {
      goCriteria: 'passes',
      noGoCriteria: 'fails',
      techDebtAcceptable: 'no',
    },
    status,
    sprintId: 'sprint-139',
    assignedAgent: 'test-writer',
    assignedSkills: [],
    provider: 'claude',
  };
}

/** Channel codes for cascade events as written by sprint-spawner. */
const CHANNEL_BLOCKED = 'BRAIN→WORKER:DEPENDENCY_BLOCKED';
const CHANNEL_UNBLOCKED = 'BRAIN→WORKER:DEPENDENCY_UNBLOCKED';

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Cascade Block Live Integration Test (Sprint 139 Task 052)', () => {
  let testRoot: string;
  const sprintId = 'sprint-139-cascade-live';

  beforeEach(() => {
    // Each test gets a fresh isolated temp dir — real file I/O, no mocks
    testRoot = join(tmpdir(), `deckent-cascade-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  // ─── Test 1: Dummy Injection + Cascade Block ────────────────────────────

  it('dummy NO_GO task triggers cascade block — DEPENDENCY_BLOCKED written to event stream', () => {
    // Arrange
    // Reproduce the Sprint 139 dummy-inject scenario:
    //   dummy-inject (NO_GO) ← dummy-dependent depends on it
    const dummyTask = makeTask('139-dummy-inject', TaskStatus.DONE); // already NO_GO/resolved
    const dependentTask = makeTask('139-dummy-dependent', TaskStatus.PENDING, ['139-dummy-inject']);

    const tasks: Task[] = [dummyTask, dependentTask];
    const graph = buildDependencyGraph(tasks, /* includeCollisions */ false);

    const blockedEvents: CascadeTransitionEvent[] = [];

    // Act — simulate NO_GO cascade
    // Mark dummy task as having "failed" (NO_GO) and cascade-block its dependent
    dummyTask.status = TaskStatus.NO_GO; // retroactively set to NO_GO for cascade
    const cascadeResult = cascadeBlockDependents(graph, '139-dummy-inject', tasks, (event) => {
      blockedEvents.push(event);
      // Write to real event stream (exactly as sprint-spawner does)
      writeEvent(
        testRoot,
        sprintId,
        'brain',
        'worker',
        CHANNEL_BLOCKED,
        {
          transition: event.transition,
          taskId: event.taskId,
          triggerTaskId: event.triggerTaskId,
          failureCategory: 'CODE',
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          blockedBy: '139-dummy-inject',
        },
      );
    });

    // Assert — cascade blocked the dependent
    expect(cascadeResult.totalBlocked).toBe(1);
    expect(cascadeResult.blockedTaskIds).toContain('139-dummy-dependent');
    expect(dependentTask.status).toBe(TaskStatus.PAUSED);

    // Assert — BLOCKED event written to event stream
    const events = readEvents(testRoot, sprintId, { channel: CHANNEL_BLOCKED });
    expect(events.length).toBeGreaterThanOrEqual(1);

    const blockedEvent = events.find(e => {
      const p = e.payload as { taskId?: string };
      return p?.taskId === '139-dummy-dependent';
    });
    expect(blockedEvent).toBeDefined();
    expect(blockedEvent?.channel).toBe(CHANNEL_BLOCKED);
    const payload = blockedEvent?.payload as { taskId: string; triggerTaskId: string; failureCategory: string };
    expect(payload.triggerTaskId).toBe('139-dummy-inject');
    expect(payload.failureCategory).toBe('CODE');

    // Assert — in-memory callback also fired
    expect(blockedEvents).toHaveLength(1);
    expect(blockedEvents[0]?.transition).toBe('BLOCKED');
    expect(blockedEvents[0]?.taskId).toBe('139-dummy-dependent');
  });

  // ─── Test 2: Cascade Unblock After Resolution ───────────────────────────

  it('after dummy task resolves — DEPENDENCY_UNBLOCKED written to event stream', () => {
    // Arrange — start from blocked state
    const dummyTask = makeTask('139-dummy-inject', TaskStatus.NO_GO);
    const dependentTask = makeTask('139-dummy-dependent', TaskStatus.PAUSED, ['139-dummy-inject']);

    const tasks: Task[] = [dummyTask, dependentTask];
    const graph = buildDependencyGraph(tasks, /* includeCollisions */ false);

    const unblockedEvents: CascadeTransitionEvent[] = [];

    // Simulate resolution: dummy task is now DONE (fix worker succeeded)
    dummyTask.status = TaskStatus.DONE;
    const doneTasks = new Set(['139-dummy-inject']);

    // Act
    const unblockResult = unblockDependents(
      graph,
      '139-dummy-inject',
      tasks,
      doneTasks,
      (event) => {
        unblockedEvents.push(event);
        writeEvent(
          testRoot,
          sprintId,
          'brain',
          'worker',
          CHANNEL_UNBLOCKED,
          {
            transition: event.transition,
            taskId: event.taskId,
            triggerTaskId: event.triggerTaskId,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            unblockedBy: '139-dummy-inject',
          },
        );
      },
    );

    // Assert — unblock succeeded
    expect(unblockResult.totalUnblocked).toBe(1);
    expect(unblockResult.unblockedTaskIds).toContain('139-dummy-dependent');
    expect(dependentTask.status).toBe(TaskStatus.PENDING);

    // Assert — UNBLOCKED event in event stream
    const events = readEvents(testRoot, sprintId, { channel: CHANNEL_UNBLOCKED });
    expect(events.length).toBeGreaterThanOrEqual(1);

    const unblockedEvent = events.find(e => {
      const p = e.payload as { taskId?: string };
      return p?.taskId === '139-dummy-dependent';
    });
    expect(unblockedEvent).toBeDefined();
    expect(unblockedEvent?.channel).toBe(CHANNEL_UNBLOCKED);
    const payload = unblockedEvent?.payload as { taskId: string; unblockedBy: string; transition: string };
    expect(payload.unblockedBy).toBe('139-dummy-inject');
    expect(payload.transition).toBe('UNBLOCKED');

    // In-memory callback
    expect(unblockedEvents[0]?.transition).toBe('UNBLOCKED');
  });

  // ─── Test 3: Full Lifecycle — BLOCKED then UNBLOCKED ───────────────────

  it('full cascade lifecycle: dummy inject → BLOCKED → resolve → UNBLOCKED (both events in stream)', () => {
    // Arrange
    const dummyTask = makeTask('139-dummy-inject', TaskStatus.PENDING);
    const dependentTask = makeTask('139-dummy-dependent', TaskStatus.PENDING, ['139-dummy-inject']);

    const tasks: Task[] = [dummyTask, dependentTask];
    const graph = buildDependencyGraph(tasks, /* includeCollisions */ false);

    // ── Phase 1: Dummy task intentionally fails (NO_GO) ──────────────────
    dummyTask.status = TaskStatus.NO_GO;

    cascadeBlockDependents(graph, '139-dummy-inject', tasks, (event) => {
      writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNEL_BLOCKED, {
        transition: event.transition,
        taskId: event.taskId,
        triggerTaskId: event.triggerTaskId,
        failureCategory: 'CODE',
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        blockedBy: '139-dummy-inject',
      });
    });

    // Assert Phase 1 — dependent is now PAUSED
    expect(dependentTask.status).toBe(TaskStatus.PAUSED);

    const blockedEvents = readEvents(testRoot, sprintId, { channel: CHANNEL_BLOCKED });
    expect(blockedEvents.length).toBeGreaterThanOrEqual(1);

    // ── Phase 2: Fix worker resolves the dummy task ───────────────────────
    dummyTask.status = TaskStatus.DONE;
    const doneTasks = new Set(['139-dummy-inject']);

    unblockDependents(graph, '139-dummy-inject', tasks, doneTasks, (event) => {
      writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNEL_UNBLOCKED, {
        transition: event.transition,
        taskId: event.taskId,
        triggerTaskId: event.triggerTaskId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        unblockedBy: '139-dummy-inject',
      });
    });

    // Assert Phase 2 — dependent is back to PENDING
    expect(dependentTask.status).toBe(TaskStatus.PENDING);

    const unblockedEvents = readEvents(testRoot, sprintId, { channel: CHANNEL_UNBLOCKED });
    expect(unblockedEvents.length).toBeGreaterThanOrEqual(1);

    // ── Final: Both event types exist in the stream ───────────────────────
    const allEvents = readEvents(testRoot, sprintId);
    const hasBlocked = allEvents.some(e => e.channel === CHANNEL_BLOCKED);
    const hasUnblocked = allEvents.some(e => e.channel === CHANNEL_UNBLOCKED);

    expect(hasBlocked).toBe(true);
    expect(hasUnblocked).toBe(true);

    // Event stream integrity — monotonic sequence
    const sequences = allEvents.map(e => e.sequence);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]!);
    }

    // Protocol version compliance (ADR-035)
    for (const event of allEvents) {
      expect(event.protocol_version).toBe('1.0');
    }
  });

  // ─── Test 4: Transitive Cascade — Chain Dependency Blocked ─────────────

  it('transitive cascade: A fails → B and C (both depending on A) are blocked', () => {
    // Arrange: A ← B ← C (chain)
    const taskA = makeTask('dummy-A', TaskStatus.NO_GO);
    const taskB = makeTask('dummy-B', TaskStatus.PENDING, ['dummy-A']);
    const taskC = makeTask('dummy-C', TaskStatus.PENDING, ['dummy-A', 'dummy-B']);

    const tasks: Task[] = [taskA, taskB, taskC];
    const graph = buildDependencyGraph(tasks, /* includeCollisions */ false);

    const blockedIds: string[] = [];

    // Act
    cascadeBlockDependents(graph, 'dummy-A', tasks, (event) => {
      blockedIds.push(event.taskId);
      writeEvent(testRoot, sprintId, 'brain', 'worker', CHANNEL_BLOCKED, {
        taskId: event.taskId,
        triggerTaskId: event.triggerTaskId,
        transition: event.transition,
        failureCategory: 'CODE',
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
      });
    });

    // Assert
    expect(blockedIds).toContain('dummy-B');
    expect(blockedIds).toContain('dummy-C');
    expect(taskB.status).toBe(TaskStatus.PAUSED);
    expect(taskC.status).toBe(TaskStatus.PAUSED);

    const events = readEvents(testRoot, sprintId, { channel: CHANNEL_BLOCKED });
    expect(events.length).toBe(2);
  });
});
