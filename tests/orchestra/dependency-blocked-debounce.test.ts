// ═══ DEPENDENCY_BLOCKED Event Spam Debounce — Sprint 183 W1-2 ═══════
// Sprint 182 dogfood emitted 550+ events, 95% spam: every wave.respawn
// tick re-emitted BRAIN→WORKER:DEPENDENCY_BLOCKED for still-blocked tasks.
// Fix: state-change-only emit — first call writes, subsequent identical
// (taskId, sorted unresolvedDeps) calls are suppressed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeEvent,
  readEvents,
  CHANNELS,
  clearDependencyBlockedState,
  emitDependencyBlockedIfChanged,
  _getDependencyBlockedStateForTest,
} from '../../src/orchestra/event-stream.js';

describe('DEPENDENCY_BLOCKED event spam debounce', () => {
  let testRoot: string;
  const sprintId = 'sprint-183';
  const channel = CHANNELS.DEPENDENCY_BLOCKED;

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `deckent-dep-blocked-debounce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    // Fresh state for every test — module-level Map must not leak between cases.
    clearDependencyBlockedState();
  });

  afterEach(() => {
    clearDependencyBlockedState();
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  // ─── Case 1: initial emit ────────────────────────────────────────
  it('initial emit — first call for a (taskId, deps) tuple writes the event', () => {
    const event = writeEvent(
      testRoot,
      sprintId,
      'brain',
      'worker',
      channel,
      { taskId: 'T1', unresolvedDeps: ['A', 'B'], reason: 'dependencies not yet DONE' },
    );

    expect(event).not.toBeNull();
    expect(event!.channel).toBe(channel);

    const events = readEvents(testRoot, sprintId, { channel });
    expect(events).toHaveLength(1);
    expect((events[0]!.payload as { taskId: string }).taskId).toBe('T1');
  });

  // ─── Case 2: state-change emit ───────────────────────────────────
  it('state-change emit — when unresolvedDeps changes for same taskId, a new event IS emitted', () => {
    // First emit: deps [A, B]
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: ['A', 'B'],
      reason: 'dependencies not yet DONE',
    });

    // Dep A resolves, now only B is unresolved → state changed → MUST emit
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: ['B'],
      reason: 'dependencies not yet DONE',
    });

    const events = readEvents(testRoot, sprintId, { channel });
    expect(events).toHaveLength(2);
    expect((events[0]!.payload as { unresolvedDeps: string[] }).unresolvedDeps).toEqual(['A', 'B']);
    expect((events[1]!.payload as { unresolvedDeps: string[] }).unresolvedDeps).toEqual(['B']);
  });

  // ─── Case 3: spam suppress (CRITICAL) ────────────────────────────
  it('spam suppress — repeated identical unresolvedDeps for same taskId does NOT emit duplicates', () => {
    const payload = {
      taskId: 'T1',
      unresolvedDeps: ['A', 'B'],
      reason: 'dependencies not yet DONE',
    };

    // Simulate 100 wave.respawn ticks emitting the same blocked state
    for (let i = 0; i < 100; i++) {
      writeEvent(testRoot, sprintId, 'brain', 'worker', channel, payload);
    }

    const events = readEvents(testRoot, sprintId, { channel });
    // Only ONE event should be written; 99 should be suppressed
    expect(events).toHaveLength(1);
  });

  // ─── Case 4: order-independent hash ──────────────────────────────
  it('order-independence — [A,B] and [B,A] are treated as the same blocked state', () => {
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: ['A', 'B'],
    });
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: ['B', 'A'],
    });

    const events = readEvents(testRoot, sprintId, { channel });
    expect(events).toHaveLength(1);
  });

  // ─── Case 5: explicit clearDependencyBlockedState ───────────────
  it('clearDependencyBlockedState — explicit clear allows next emit for same taskId', () => {
    const payload = { taskId: 'T1', unresolvedDeps: ['A'] };

    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, payload);
    // Second identical call: suppressed
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, payload);
    expect(readEvents(testRoot, sprintId, { channel })).toHaveLength(1);

    // Clear → next identical call MUST emit
    clearDependencyBlockedState(sprintId, 'T1');
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, payload);
    expect(readEvents(testRoot, sprintId, { channel })).toHaveLength(2);
  });

  // ─── Case 6: zero-deps auto-clear ───────────────────────────────
  it('zero-deps auto-clear — emit with empty unresolvedDeps removes the entry', () => {
    // T1 blocked on [A]
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: ['A'],
    });

    // Dep resolves — emit with empty deps (auto-clears state)
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: [],
    });

    // T1 blocked again later on [A] — fresh state, MUST emit
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, {
      taskId: 'T1',
      unresolvedDeps: ['A'],
    });

    // Internal state confirms entry was cleared and re-set
    const state = _getDependencyBlockedStateForTest();
    expect(state.get(sprintId)?.get('T1')).toBeDefined();

    // All three emissions happened (no spam suppression because each is a state change)
    const events = readEvents(testRoot, sprintId, { channel });
    expect(events).toHaveLength(3);
  });

  // ─── Case 7: cross-task isolation ───────────────────────────────
  it('cross-task isolation — T1 dedupe state does not block T2 emission', () => {
    const deps = ['A', 'B'];
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, { taskId: 'T1', unresolvedDeps: deps });
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, { taskId: 'T2', unresolvedDeps: deps });

    // Spam suppress for both — second emit on each is no-op
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, { taskId: 'T1', unresolvedDeps: deps });
    writeEvent(testRoot, sprintId, 'brain', 'worker', channel, { taskId: 'T2', unresolvedDeps: deps });

    const events = readEvents(testRoot, sprintId, { channel });
    expect(events).toHaveLength(2);
    const taskIds = events.map(e => (e.payload as { taskId: string }).taskId).sort();
    expect(taskIds).toEqual(['T1', 'T2']);
  });

  // ─── Case 8: explicit helper emitDependencyBlockedIfChanged ──────
  it('emitDependencyBlockedIfChanged — explicit API mirrors writeEvent dedupe semantics', () => {
    const e1 = emitDependencyBlockedIfChanged(testRoot, sprintId, 'brain', 'worker', {
      taskId: 'T1',
      unresolvedDeps: ['A'],
    });
    const e2 = emitDependencyBlockedIfChanged(testRoot, sprintId, 'brain', 'worker', {
      taskId: 'T1',
      unresolvedDeps: ['A'],
    });
    const e3 = emitDependencyBlockedIfChanged(testRoot, sprintId, 'brain', 'worker', {
      taskId: 'T1',
      unresolvedDeps: ['A', 'B'],
    });

    expect(e1).not.toBeNull();
    expect(e2).toBeNull(); // dedup suppressed
    expect(e3).not.toBeNull(); // state change → fresh emit

    const events = readEvents(testRoot, sprintId, { channel });
    expect(events).toHaveLength(2);
  });
});
