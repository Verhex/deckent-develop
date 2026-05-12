// ═══ Sprint 160 Stability E2E Smoke ═══════════════════════════════════
// Sprint 162 Task 3 (T-007). End-to-end proof that the Sprint 160–162
// Brain stability work persists the right artifacts during a mini-sprint:
//
//   E2E-1: state.json shows phase transitions PLAN → SPAWN → EVALUATE
//   E2E-2: checkpoint.eventStreamOffset > 0 after events.jsonl writes
//   E2E-3: events.jsonl sequence numbers are monotonically increasing
//
// This is a smoke test — no real worker spawn, no real provider. We drive
// the on-disk artifacts with the same public APIs that the Brain uses
// (persistPhaseTransition / writeEvent / writePhaseCheckpoint /
// computeEventStreamOffset) and assert the observer view.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SprintPhase, SprintStatus, TaskStatus,
} from '../../src/core/types.js';
import type { Sprint, Task } from '../../src/core/types.js';
import { DECKENT_DIR, TASKS_DIR } from '../../src/core/constants.js';
import {
  persistPhaseTransition,
} from '../../src/orchestra/sprint-phases.js';
import {
  writePhaseCheckpoint,
  readCheckpoint,
  computeEventStreamOffset,
} from '../../src/orchestra/sprint-checkpoint.js';
import { writeEvent, CHANNELS } from '../../src/orchestra/event-stream.js';
import { readSprintState } from '../../src/orchestra/sprint-utils.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makeProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-sprint-160-smoke-'));
  mkdirSync(join(root, DECKENT_DIR), { recursive: true });
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  return root;
}

function makeTask(id: string, status: TaskStatus = TaskStatus.PENDING): Task {
  return {
    id,
    title: `Smoke task ${id}`,
    description: 'mini-sprint dummy task',
    model: 'sonnet',
    effort: 'low',
    priority: 'NORMAL',
    reason: 'e2e smoke',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status,
  };
}

function makeSprint(id: string, tasks: Task[]): Sprint {
  return {
    id,
    number: parseInt(id.replace(/^sprint-/, ''), 10) || 160,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    startedAt: '2026-05-12T20:00:00.000Z',
  };
}

function readEventsJsonl(root: string, sprintId: string): Array<{ sequence: number; channel: string }> {
  const filePath = join(root, DECKENT_DIR, `${sprintId}-events.jsonl`);
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, 'utf-8');
  return raw
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l) as { sequence: number; channel: string });
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('Sprint 160 stability smoke — phase / checkpoint / event-stream', () => {
  let root: string;
  const sprintId = 'sprint-160';

  beforeEach(() => {
    root = makeProjectRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ─── E2E-1: phase transitions reach state.json ───────────────────────
  it('E2E-1: mini-sprint phase transitions are visible on state.json (PLAN → SPAWN → EVALUATE)', () => {
    const sprint = makeSprint(sprintId, [makeTask('160-001')]);

    // PLAN: Brain writes the initial state file.
    persistPhaseTransition(root, sprint, SprintPhase.PLAN, SprintStatus.PLANNING);
    let state = readSprintState(root);
    expect(state).not.toBeNull();
    expect(state!.sprintId).toBe(sprintId);
    expect(state!.phase).toBe(SprintPhase.PLAN);
    expect(state!.status).toBe(SprintStatus.PLANNING);
    expect(state!.taskIds).toEqual(['160-001']);

    // SPAWN: workers are dispatched.
    persistPhaseTransition(root, sprint, SprintPhase.SPAWN, SprintStatus.ACTIVE);
    state = readSprintState(root);
    expect(state!.phase).toBe(SprintPhase.SPAWN);
    expect(state!.status).toBe(SprintStatus.ACTIVE);

    // EVALUATE: results in, Brain scoring.
    persistPhaseTransition(root, sprint, SprintPhase.EVALUATE, SprintStatus.EVALUATING);
    state = readSprintState(root);
    expect(state!.phase).toBe(SprintPhase.EVALUATE);
    expect(state!.status).toBe(SprintStatus.EVALUATING);

    // `updatedAt` is refreshed at every transition — external observers can
    // rely on it to detect liveness (Sprint 159 forensic root cause: this
    // field froze while sprint kept advancing).
    expect(state!.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // ─── E2E-2: checkpoint reflects positive eventStreamOffset ───────────
  it('E2E-2: checkpoint.eventStreamOffset > 0 after events.jsonl writes', () => {
    const sprint = makeSprint(sprintId, [makeTask('160-001', TaskStatus.EXECUTING)]);

    // Brain emits a phase change + a worker assignment event — at minimum
    // two events should be persisted.
    writeEvent(root, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, {
      phase: 'SPAWN', sprintId,
    });
    writeEvent(root, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, {
      taskId: '160-001',
    });
    writeEvent(root, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, {
      taskId: '160-001', sequence: 1,
    });

    // Sprint 161 T-002: writePhaseCheckpoint without an explicit offset
    // computes it from the on-disk events.jsonl (source of truth).
    const cp = writePhaseCheckpoint(root, sprint, SprintPhase.EXECUTE);
    expect(cp).not.toBeNull();
    expect(cp!.eventStreamOffset).toBeGreaterThan(0);

    // Read-back round-trip preserves the offset.
    const readBack = readCheckpoint(root, sprintId);
    expect(readBack).not.toBeNull();
    expect(readBack!.eventStreamOffset).toBe(cp!.eventStreamOffset);

    // computeEventStreamOffset returns the same value standalone.
    expect(computeEventStreamOffset(root, sprintId)).toBe(cp!.eventStreamOffset);
  });

  // ─── E2E-3: events.jsonl sequence is monotonic ───────────────────────
  it('E2E-3: events.jsonl sequence numbers are monotonically increasing', () => {
    // Emit a mini-sprint's worth of events (mixed sources, 10 entries).
    const sequence: Array<[string, string, string, unknown]> = [
      ['brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN', sprintId }],
      ['brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'SPAWN', sprintId }],
      ['brain', 'worker', CHANNELS.TASK_ASSIGN, { taskId: '160-001' }],
      ['worker', 'brain', CHANNELS.HEARTBEAT, { taskId: '160-001', seq: 1 }],
      ['worker', 'brain', CHANNELS.HEARTBEAT, { taskId: '160-001', seq: 2 }],
      ['worker', 'brain', CHANNELS.RESULT, { taskId: '160-001' }],
      ['brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EVALUATE', sprintId }],
      ['brain', '*', CHANNELS.METRIC_EMITTED, { name: 'coverage', value: 88 }],
      ['brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'RETRO', sprintId }],
      ['brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'COMPLETE', sprintId }],
    ];

    for (const [src, tgt, ch, payload] of sequence) {
      writeEvent(root, sprintId, src, tgt, ch, payload);
    }

    const events = readEventsJsonl(root, sprintId);
    expect(events).toHaveLength(sequence.length);

    let prev = 0;
    for (const evt of events) {
      expect(typeof evt.sequence).toBe('number');
      expect(evt.sequence).toBeGreaterThan(prev);
      prev = evt.sequence;
    }

    // All sequence numbers should be unique and contiguous-ish — the
    // counter never goes backwards or repeats (Sprint 138 ADR-035 invariant).
    const numbers = events.map(e => e.sequence);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers[0]).toBeGreaterThanOrEqual(1);
    expect(numbers[numbers.length - 1]).toBeGreaterThanOrEqual(sequence.length);
  });
});
