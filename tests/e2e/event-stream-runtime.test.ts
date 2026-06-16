// ═══ Event Stream Runtime E2E Tests ════════════════════════════════════════
// Sprint 139 — Task 044: Full pipeline proof
//
// Goals:
//   1. writeEvent → readEvents → reconstructState full pipeline tests
//   2. ≥13 distinct channels across a simulated sprint lifecycle
//   3. Event volume simulation (50+ events = real sprint scale)
//   4. Fail-safe & edge case coverage
//
// ADR-035 Protocol Version 1.0 compliance.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeEvent,
  readEvents,
  reconstructState,
  readSequence,
  getCurrentSprintId,
  CHANNELS,
} from '../../src/orchestra/event-stream.js';
import type { DeckentEvent, ReconstructedState } from '../../src/orchestra/event-stream.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRoot(): string {
  const root = join(
    tmpdir(),
    `deckent-e2e-event-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  return root;
}

function cleanupRoot(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Simulate a complete sprint lifecycle emitting events from all roles.
 * Returns the number of events written.
 */
function simulateFullSprintLifecycle(root: string, sprintId: string): number {
  let count = 0;

  // ── PLAN phase ──
  const w = (source: string, target: string, channel: string, payload: unknown) => {
    writeEvent(root, sprintId, source, target, channel, payload);
    count++;
  };

  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN', sprintId });

  // Brain assigns 5 tasks
  for (let i = 1; i <= 5; i++) {
    w('brain', `worker-${i}`, CHANNELS.TASK_ASSIGN, {
      taskId: `${sprintId}-T${i.toString().padStart(3, '0')}`,
      model: 'sonnet',
      effort: 'normal',
      scope: { directories: [`src/module-${i}/`] },
    });
  }

  // ── SPAWN phase ──
  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'SPAWN', sprintId });

  // ── EXECUTE phase ──
  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EXECUTE', sprintId });

  // Workers emit heartbeats (3 per task = 15 total)
  for (let i = 1; i <= 5; i++) {
    const taskId = `${sprintId}-T${i.toString().padStart(3, '0')}`;
    for (let hb = 1; hb <= 3; hb++) {
      w('worker', 'brain', CHANNELS.HEARTBEAT, {
        workerId: `w-${sprintId}-${i}`,
        taskId,
        sequence: hb,
        phase: 'EXECUTING',
        state: hb === 1 ? 'reading task' : hb === 2 ? 'writing code' : 'running tests',
      });
    }
  }

  // One worker asks a question (checkpoint)
  w('worker', 'brain', CHANNELS.QUESTION, {
    taskId: `${sprintId}-T002`,
    question: 'Should I also update the tests in tests/module-2/?',
    context: 'Scope says src/module-2/ only but tests rely on the module',
  });

  // Brain answers
  w('brain', 'worker', CHANNELS.ANSWER, {
    taskId: `${sprintId}-T002`,
    answer: 'Yes, update the tests — scope includes test parity',
  });

  // Workers complete tasks — mixed outcomes
  const outcomes = ['DONE', 'DONE', 'GO_WITH_TECH_DEBT', 'DONE', 'NO_GO'] as const;
  for (let i = 1; i <= 5; i++) {
    const taskId = `${sprintId}-T${i.toString().padStart(3, '0')}`;
    const selfAssessment = outcomes[i - 1]!;
    w('worker', 'brain', CHANNELS.RESULT, {
      taskId,
      selfAssessment,
      filesChanged: [`src/module-${i}/index.ts`, `tests/module-${i}/index.test.ts`],
      rubricScores: { correctness: 85, test_coverage: 80, scope_compliance: 100, documentation: 70 },
    });
    // Every completed task requests auditor verification
    w('worker', 'auditor', CHANNELS.CODE_VERIFY_REQUEST, {
      taskId,
      filesChanged: [`src/module-${i}/index.ts`],
      evidence: `tsc passed, vitest: 12/12 pass`,
    });
  }

  // ── EVALUATE phase ──
  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EVALUATE', sprintId });

  // Auditor emits verification results
  const verdicts = ['PASS', 'PASS', 'DOWNGRADE', 'PASS', 'FAIL'] as const;
  for (let i = 1; i <= 5; i++) {
    const taskId = `${sprintId}-T${i.toString().padStart(3, '0')}`;
    w('auditor', 'brain', CHANNELS.VERIFICATION_RESULT, {
      taskId,
      verdict: verdicts[i - 1],
      reason: verdicts[i - 1] === 'DOWNGRADE'
        ? '3 tests still failing'
        : verdicts[i - 1] === 'FAIL'
        ? 'No result file written'
        : 'All tests pass',
    });
  }

  // Auditor detects a scope collision between T003 and T004
  w('auditor', 'brain', CHANNELS.SCOPE_COLLISION_DETECTED, {
    taskIds: [`${sprintId}-T003`, `${sprintId}-T004`],
    files: ['src/module-3/shared.ts'],
    detectedAt: new Date().toISOString(),
  });

  // Auditor gate
  w('auditor', 'brain', CHANNELS.GATE_COMPUTED, {
    sprintId,
    overallGate: 'WARNING',
    passCount: 3,
    failCount: 1,
    techDebtCount: 1,
  });

  // Brain emits metrics
  w('brain', '*', CHANNELS.METRIC_EMITTED, {
    name: 'sprint.summary',
    sprintId,
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 1,
    coveragePercent: 82.5,
  });

  w('brain', '*', CHANNELS.METRIC_EMITTED, {
    name: 'sprint.duration',
    value: 3421000,
    sprintId,
  });

  // ── FIX phase — brain re-assigns the failed task ──
  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'FIX', sprintId });
  w('brain', 'worker', CHANNELS.FIX_REQUEST, {
    taskId: `${sprintId}-T005`,
    reason: 'NO_GO — no result file written',
    maxAttempts: 2,
  });

  // ── RETRO phase ──
  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'RETRO', sprintId });

  // Auditor emits load report
  w('auditor', 'brain', CHANNELS.LOAD_REPORT_WRITTEN, {
    sprintId,
    reportPath: `docs/audits/${sprintId}/load-test-report.md`,
    totalWorkers: 5,
    peakConcurrency: 3,
  });

  // Notification to user
  w('deckent', 'user', CHANNELS.NOTIFY, {
    message: `Sprint ${sprintId} complete — 4/5 tasks done`,
    severity: 'info',
    sprintId,
  });

  // ── CLEANUP phase ──
  w('brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'CLEANUP', sprintId });

  return count;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('event-stream runtime e2e', () => {
  let testRoot: string;
  const sprintId = 'sprint-e2e-test';

  beforeEach(() => {
    testRoot = makeRoot();
  });

  afterEach(() => {
    cleanupRoot(testRoot);
  });

  // ─── Test 1: Full pipeline — writeEvent → readEvents → reconstructState ──

  it('full pipeline: writeEvent → readEvents → reconstructState correctly aggregates sprint state', () => {
    // Arrange — simulate a realistic sprint
    const totalWritten = simulateFullSprintLifecycle(testRoot, sprintId);

    // Act — reconstruct state from event stream
    const events = readEvents(testRoot, sprintId);
    const state = reconstructState(testRoot, sprintId);

    // Assert — counts
    expect(events.length).toBe(totalWritten);
    expect(state.totalEvents).toBe(totalWritten);

    // Phase changes reconstructed
    expect(state.phaseChanges.length).toBeGreaterThanOrEqual(6); // PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, CLEANUP

    // Task results: 5 worker RESULT events + 5 auditor VERIFICATION_RESULT events
    // VERIFICATION_RESULT overwrites RESULT entries for same taskId (latest wins)
    expect(state.taskResults.size).toBe(5);

    // Collision detected
    expect(state.collisions).toHaveLength(1);
    expect(state.collisions[0]!.taskIds).toContain(`${sprintId}-T003`);

    // Metrics (sprint.summary has name but value is undefined; sprint.duration has both)
    const durationMetric = state.metrics.find(m => m.name === 'sprint.duration');
    expect(durationMetric).toBeDefined();
    expect(durationMetric!.value).toBe(3421000);

    // Sequence is monotonic and complete
    expect(state.lastSequence).toBe(totalWritten);
  });

  // ─── Test 2: ≥13 distinct channels across a sprint simulation ───────────

  it('sprint simulation uses ≥13 distinct channels (ADR-035 must-have coverage)', () => {
    simulateFullSprintLifecycle(testRoot, sprintId);

    const events = readEvents(testRoot, sprintId);
    const distinctChannels = new Set(events.map(e => e.channel));

    // Required minimum per Sprint 139 Must-Have criterion 4
    expect(distinctChannels.size).toBeGreaterThanOrEqual(13);

    // All 13+ from ADR-035 base that a typical sprint exercises:
    const expectedChannels = [
      CHANNELS.SPRINT_PHASE_CHANGE,
      CHANNELS.TASK_ASSIGN,
      CHANNELS.HEARTBEAT,
      CHANNELS.RESULT,
      CHANNELS.CODE_VERIFY_REQUEST,
      CHANNELS.VERIFICATION_RESULT,
      CHANNELS.SCOPE_COLLISION_DETECTED,
      CHANNELS.GATE_COMPUTED,
      CHANNELS.METRIC_EMITTED,
      CHANNELS.QUESTION,
      CHANNELS.ANSWER,
      CHANNELS.FIX_REQUEST,
      CHANNELS.LOAD_REPORT_WRITTEN,
      CHANNELS.NOTIFY,
    ];

    for (const ch of expectedChannels) {
      expect(distinctChannels.has(ch), `Missing channel: ${ch}`).toBe(true);
    }
  });

  // ─── Test 3: Event volume — 50+ events from full sprint simulation ───────

  it('full sprint simulation produces ≥50 events (real sprint scale)', () => {
    const totalWritten = simulateFullSprintLifecycle(testRoot, sprintId);

    expect(totalWritten).toBeGreaterThanOrEqual(50);

    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(totalWritten);

    // All events have protocol_version 1.0
    expect(events.every(e => e.protocol_version === '1.0')).toBe(true);
  });

  // ─── Test 4: Sequence integrity across a full sprint ─────────────────────

  it('sequence numbers are strictly monotonic across all events in full sprint', () => {
    simulateFullSprintLifecycle(testRoot, sprintId);

    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBeGreaterThan(0);

    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1]!;
      const curr = events[i]!;
      expect(curr.sequence).toBe(prev.sequence + 1);
    }

    // readSequence reflects final value
    expect(readSequence(testRoot, sprintId)).toBe(events.length);
  });

  // ─── Test 5: Incremental read with afterSequence for streaming consumers ─

  it('afterSequence filter enables incremental streaming reads', () => {
    // Simulate first batch (brain spawns phase)
    const spawnEvents = 7;
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN' });
    for (let i = 1; i <= 5; i++) {
      writeEvent(testRoot, sprintId, 'brain', `worker-${i}`, CHANNELS.TASK_ASSIGN, { taskId: `T${i}` });
    }
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EXECUTE' });

    const firstBatch = readEvents(testRoot, sprintId);
    expect(firstBatch.length).toBe(spawnEvents);
    const cursor = firstBatch[firstBatch.length - 1]!.sequence;

    // Simulate second batch (workers execute)
    for (let i = 1; i <= 5; i++) {
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: `T${i}`, sequence: 1 });
      writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, {
        taskId: `T${i}`,
        selfAssessment: 'DONE',
      });
    }

    // Read only events after the cursor
    const newEvents = readEvents(testRoot, sprintId, { afterSequence: cursor });
    expect(newEvents.length).toBe(10); // 5 HB + 5 RESULT

    // Verify they are all from workers
    expect(newEvents.every(e => e.source === 'worker')).toBe(true);
  });

  // ─── Test 6: Multi-source filtering on large event stream ────────────────

  it('can filter by source/channel on a large event stream without performance issues', () => {
    simulateFullSprintLifecycle(testRoot, sprintId);

    // Filter by source
    const brainEvents = readEvents(testRoot, sprintId, { source: 'brain' });
    const workerEvents = readEvents(testRoot, sprintId, { source: 'worker' });
    const auditorEvents = readEvents(testRoot, sprintId, { source: 'auditor' });
    const deckentEvents = readEvents(testRoot, sprintId, { source: 'deckent' });

    expect(brainEvents.length).toBeGreaterThan(0);
    expect(workerEvents.length).toBeGreaterThan(0);
    expect(auditorEvents.length).toBeGreaterThan(0);
    expect(deckentEvents.length).toBeGreaterThan(0);

    // Total across sources = total events
    const allEvents = readEvents(testRoot, sprintId);
    expect(brainEvents.length + workerEvents.length + auditorEvents.length + deckentEvents.length)
      .toBe(allEvents.length);

    // Filter heartbeats specifically
    const heartbeats = readEvents(testRoot, sprintId, { channel: CHANNELS.HEARTBEAT });
    expect(heartbeats.length).toBe(15); // 5 tasks × 3 heartbeats

    // All heartbeats are from worker
    expect(heartbeats.every(e => e.source === 'worker')).toBe(true);
  });

  // ─── Test 7: Fail-safe on partial write (malformed JSONL) ────────────────

  it('handles a corrupted sprint event file without crashing (partial write safety)', () => {
    // Write valid events
    writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN' });
    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: 'T1', sequence: 1 });

    // Manually corrupt the JSONL file (simulates Docker SIGKILL partial write)
    const eventsPath = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    const existing = readFileSync(eventsPath, 'utf-8');
    writeFileSync(eventsPath, existing + '{PARTIAL_CORRUPTION\n', 'utf-8');

    writeEvent(testRoot, sprintId, 'worker', 'brain', CHANNELS.RESULT, { taskId: 'T1', selfAssessment: 'DONE' });

    // Should read valid events, skip malformed line, no exception
    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(3); // 2 valid before + 1 after corruption
    expect(events[0]!.channel).toBe(CHANNELS.SPRINT_PHASE_CHANGE);
    expect(events[2]!.channel).toBe(CHANNELS.RESULT);
  });

  // ─── Test 8: reconstructState — phase change ordering ────────────────────

  it('reconstructState captures phase change ordering from PLAN→CLEANUP', () => {
    const phases = ['PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'CLEANUP'];
    for (const phase of phases) {
      writeEvent(testRoot, sprintId, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase });
    }

    const state = reconstructState(testRoot, sprintId);
    expect(state.phaseChanges.length).toBe(8);
    expect(state.phaseChanges.map(p => p.phase)).toEqual(phases);
    expect(state.lastSequence).toBe(8);
  });

  // ─── Test 9: Multi-sprint isolation — events from different sprints don't cross ──

  it('events from different sprint IDs are isolated from each other', () => {
    const sprintA = 'sprint-e2e-A';
    const sprintB = 'sprint-e2e-B';

    writeEvent(testRoot, sprintA, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN' });
    writeEvent(testRoot, sprintA, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'EXECUTE' });
    writeEvent(testRoot, sprintB, 'brain', '*', CHANNELS.SPRINT_PHASE_CHANGE, { phase: 'PLAN' });
    writeEvent(testRoot, sprintB, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: 'T1' });
    writeEvent(testRoot, sprintB, 'worker', 'brain', CHANNELS.HEARTBEAT, { taskId: 'T2' });

    const eventsA = readEvents(testRoot, sprintA);
    const eventsB = readEvents(testRoot, sprintB);

    expect(eventsA.length).toBe(2);
    expect(eventsB.length).toBe(3);

    // Sequences are independent per sprint
    expect(readSequence(testRoot, sprintA)).toBe(2);
    expect(readSequence(testRoot, sprintB)).toBe(3);

    // State reconstruction is also isolated
    const stateA = reconstructState(testRoot, sprintA);
    const stateB = reconstructState(testRoot, sprintB);
    expect(stateA.sprintId).toBe(sprintA);
    expect(stateB.sprintId).toBe(sprintB);
    expect(stateA.totalEvents).toBe(2);
    expect(stateB.totalEvents).toBe(3);
  });

  // ─── Test 10: getCurrentSprintId integration with event writes ───────────

  it('getCurrentSprintId → writeEvent integration writes to the active sprint stream', () => {
    // Write sprint-state.json with active sprint
    writeFileSync(
      join(testRoot, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId, phase: 'EXECUTE' }),
      'utf-8',
    );

    const activeSprintId = getCurrentSprintId(testRoot);
    expect(activeSprintId).toBe(sprintId);

    // Use the dynamically resolved sprint ID to write events
    writeEvent(testRoot, activeSprintId!, 'brain', '*', CHANNELS.METRIC_EMITTED, {
      name: 'worker.count',
      value: 5,
    });

    const events = readEvents(testRoot, sprintId);
    expect(events).toHaveLength(1);
    expect(events[0]!.channel).toBe(CHANNELS.METRIC_EMITTED);
  });
});
