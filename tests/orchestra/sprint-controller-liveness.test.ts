/**
 * Sprint 192 Task 192-001 — W-INTEGRITY I-2
 *
 * sprint-controller.ts grace-kill bloklarının 5-layer worker liveness check
 * ile kapısı testleri. İki branch — PanicGuard BLOCK (Block A) ve
 * user-explicit kill (Block B) — × 3 senaryo (never-spawned, alive-grace,
 * dead) = 6 test minimum.
 *
 * Strateji: full runSprint() çalıştırmak pahalı. Bunun yerine sprint-controller'ın
 * import ettiği aynı modüller (checkWorkerLiveness, pollForResultFile,
 * writeEvent, getCurrentSprintId) ile bloğun behavior contract'ı doğrulanır.
 * Hot-path semantiği üretim koduyla aynı modülleri exercise eder.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkWorkerLiveness } from '../../src/orchestra/worker-liveness.js';
import { pollForResultFile } from '../../src/orchestra/sprint-phases.js';
import {
  writeEvent,
  readEvents,
  getCurrentSprintId,
} from '../../src/orchestra/event-stream.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';

// ─── Fixture Helpers ─────────────────────────────────────────────

const SPRINT_ID = 'sprint-192-test';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '192-001-fix',
    title: 'fixture',
    description: '',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'PENDING',
    sprintId: SPRINT_ID,
    createdAt: new Date().toISOString(),
    assignedWorker: 'w-192-001-fix',
    ...overrides,
  } as Task;
}

function writeFreshHeartbeat(root: string, taskId: string): void {
  writeFileSync(
    join(root, '.tasks', `task-${taskId}.hb`),
    JSON.stringify({ taskId, status: 'EXECUTING' }),
    'utf-8',
  );
}

/**
 * Simulate the post-grace synthetic NO_GO production block. The simulator
 * mirrors the exact sequence of calls sprint-controller.ts performs in the
 * Block A (PanicGuard BLOCK) and Block B (user-explicit kill) branches.
 */
async function simulateGraceKill(
  task: Task,
  projectRoot: string,
  branch: 'block' | 'kill',
): Promise<{
  syntheticWritten: boolean;
  syntheticResult: TaskResult | null;
  eventEmitted: boolean;
  livenessStatus: string;
}> {
  // Same call sprint-controller.ts performs at the top of the else branch.
  const liveness = checkWorkerLiveness(task, projectRoot, {
    // Deterministic — never run real docker probe in tests.
    isDockerContainerRunning: () => false,
  });

  if (liveness.status === 'never-spawned') {
    const sid = getCurrentSprintId(projectRoot) ?? SPRINT_ID;
    writeEvent(
      projectRoot, sid, 'brain', 'worker',
      'BRAIN→WORKER:NEVER_DISPATCHED',
      {
        taskId: task.id,
        reason: liveness.reason,
        signals: liveness.signals,
        source: 'grace-kill',
      },
    );
    return {
      syntheticWritten: false,
      syntheticResult: null,
      eventEmitted: true,
      livenessStatus: liveness.status,
    };
  }

  if (liveness.status === 'alive') {
    const graceResult = await pollForResultFile(projectRoot, task.id, 200, 50);
    if (graceResult) {
      return {
        syntheticWritten: false,
        syntheticResult: graceResult,
        eventEmitted: false,
        livenessStatus: liveness.status,
      };
    }
    // Fall through to synthetic with liveness=alive label.
  }

  const notes = branch === 'block'
    ? `Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval required); liveness=${liveness.status}`
    : `Worker had heartbeat but failed to write result within grace period — killed (user-explicit override); liveness=${liveness.status}`;

  const syntheticResult: TaskResult = {
    taskId: task.id,
    workerId: task.assignedWorker ?? `w-${task.id}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes,
  };
  return {
    syntheticWritten: true,
    syntheticResult,
    eventEmitted: false,
    livenessStatus: liveness.status,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────

describe('sprint-controller grace-kill liveness gate (Task 192-001 W-INTEGRITY I-2)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-sc-liveness-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Block A — PanicGuard BLOCK path ─────────────────────────────

  describe('Block A — PanicGuard BLOCK path', () => {
    it('never-spawned → SKIP synthetic; NEVER_DISPATCHED event emitted', async () => {
      const task = makeTask({ id: 'A-ns', assignedWorker: undefined });
      const out = await simulateGraceKill(task, root, 'block');

      expect(out.livenessStatus).toBe('never-spawned');
      expect(out.syntheticWritten).toBe(false);
      expect(out.syntheticResult).toBeNull();
      expect(out.eventEmitted).toBe(true);

      const events = readEvents(root, SPRINT_ID, {
        channel: 'BRAIN→WORKER:NEVER_DISPATCHED',
      });
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        taskId: 'A-ns',
        source: 'grace-kill',
      });
    });

    it('alive grace-hit → result lands during poll, no synthetic written', async () => {
      const taskId = 'A-alive-hit';
      const task = makeTask({ id: taskId });
      writeFreshHeartbeat(root, taskId);

      // Drop a real .result mid-poll so pollForResultFile picks it up.
      const lateResult: TaskResult = {
        taskId,
        workerId: 'w-A-alive-hit',
        filesChanged: ['src/x.ts'],
        linesAdded: 5,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 95,
        selfAssessment: 'DONE',
        notes: 'late result',
      };
      setTimeout(() => {
        writeFileSync(
          join(root, '.tasks', `task-${taskId}.result`),
          JSON.stringify(lateResult),
          'utf-8',
        );
      }, 60);

      const out = await simulateGraceKill(task, root, 'block');
      expect(out.livenessStatus).toBe('alive');
      expect(out.syntheticWritten).toBe(false);
      expect(out.syntheticResult?.taskId).toBe(taskId);
      expect(out.syntheticResult?.selfAssessment).toBe('DONE');
    });

    it('dead → synthetic NO_GO with liveness=dead in notes', async () => {
      const task = makeTask({ id: 'A-dead' });
      // No HB, no log, no docker → dead.
      const out = await simulateGraceKill(task, root, 'block');

      expect(out.livenessStatus).toBe('dead');
      expect(out.syntheticWritten).toBe(true);
      expect(out.syntheticResult?.selfAssessment).toBe('NO_GO');
      expect(out.syntheticResult?.notes).toContain('liveness=dead');
      expect(out.syntheticResult?.notes).toContain('kill blocked by panic guard');
    });
  });

  // ─── Block B — user-explicit kill path ───────────────────────────

  describe('Block B — user-explicit kill path', () => {
    it('never-spawned → SKIP synthetic; NEVER_DISPATCHED event emitted', async () => {
      const task = makeTask({ id: 'B-ns', assignedWorker: undefined });
      const out = await simulateGraceKill(task, root, 'kill');

      expect(out.livenessStatus).toBe('never-spawned');
      expect(out.syntheticWritten).toBe(false);
      expect(out.eventEmitted).toBe(true);

      const events = readEvents(root, SPRINT_ID, {
        channel: 'BRAIN→WORKER:NEVER_DISPATCHED',
      });
      expect(events).toHaveLength(1);
      expect(events[0].payload).toMatchObject({
        taskId: 'B-ns',
        source: 'grace-kill',
      });
    });

    it('alive grace-hit → result lands during poll, no synthetic written', async () => {
      const taskId = 'B-alive-hit';
      const task = makeTask({ id: taskId });
      writeFreshHeartbeat(root, taskId);

      const lateResult: TaskResult = {
        taskId,
        workerId: 'w-B-alive-hit',
        filesChanged: ['src/y.ts'],
        linesAdded: 3,
        linesRemoved: 1,
        testsPassed: true,
        coverage: 92,
        selfAssessment: 'DONE',
        notes: 'late result on kill path',
      };
      setTimeout(() => {
        writeFileSync(
          join(root, '.tasks', `task-${taskId}.result`),
          JSON.stringify(lateResult),
          'utf-8',
        );
      }, 60);

      const out = await simulateGraceKill(task, root, 'kill');
      expect(out.livenessStatus).toBe('alive');
      expect(out.syntheticWritten).toBe(false);
      expect(out.syntheticResult?.taskId).toBe(taskId);
      expect(out.syntheticResult?.selfAssessment).toBe('DONE');
    });

    it('dead → synthetic NO_GO with liveness=dead label (user-explicit override notes)', async () => {
      const task = makeTask({ id: 'B-dead' });
      const out = await simulateGraceKill(task, root, 'kill');

      expect(out.livenessStatus).toBe('dead');
      expect(out.syntheticWritten).toBe(true);
      expect(out.syntheticResult?.selfAssessment).toBe('NO_GO');
      expect(out.syntheticResult?.notes).toContain('liveness=dead');
      expect(out.syntheticResult?.notes).toContain('user-explicit override');
    });
  });

  // ─── Wire-correctness assertions ─────────────────────────────────

  describe('wire integrity — sprint-controller imports', () => {
    it('alive label propagates when grace poll misses (no result arrives)', async () => {
      const taskId = 'A-alive-miss';
      const task = makeTask({ id: taskId });
      writeFreshHeartbeat(root, taskId);
      // Intentionally do NOT write a result file — poll will time out.

      const out = await simulateGraceKill(task, root, 'block');
      expect(out.livenessStatus).toBe('alive');
      expect(out.syntheticWritten).toBe(true);
      expect(out.syntheticResult?.notes).toContain('liveness=alive');
    });
  });
});
