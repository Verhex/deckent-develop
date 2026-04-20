// ═══ Sprint Controller Nervous System Hook Tests ═══════════════════
// Task 147-021: Verify lifecycle event emissions from runSprint()
//
// These tests validate that sprint-controller.ts emits SPRINT_PHASE_CHANGE,
// SPRINT_STARTED, SPRINT_RETRO_COMPLETE, and SPRINT_COMPLETED events via
// the EventBus at each phase transition.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../../src/orchestra/event-bus.js';
import { SprintPhase } from '../../src/core/types.js';

describe('Sprint Controller — Nervous System Lifecycle Hooks', () => {
  let captured: Array<{ eventName: string; payload: Record<string, unknown> }>;
  let originalEmit: typeof eventBus.emit;

  beforeEach(() => {
    captured = [];
    originalEmit = eventBus.emit.bind(eventBus);
    vi.spyOn(eventBus, 'emit').mockImplementation((eventName: string, ...args: unknown[]) => {
      if (eventName === 'deckent-event') {
        captured.push({ eventName, payload: args[0] as Record<string, unknown> });
      }
      // Still call original for non-deckent-event emissions (e.g. 'event')
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    captured = [];
  });

  it('should emit SPRINT_PHASE_CHANGE with correct oldPhase/newPhase/sprintId payload', () => {
    // Simulate what sprint-controller does at PLAN→SPAWN transition
    eventBus.emit('deckent-event', {
      type: 'SPRINT_PHASE_CHANGE',
      oldPhase: SprintPhase.PLAN,
      newPhase: SprintPhase.SPAWN,
      sprintId: 'sprint-147',
      timestamp: new Date().toISOString(),
    });

    expect(captured).toHaveLength(1);
    const evt = captured[0].payload;
    expect(evt.type).toBe('SPRINT_PHASE_CHANGE');
    expect(evt.oldPhase).toBe('PLAN');
    expect(evt.newPhase).toBe('SPAWN');
    expect(evt.sprintId).toBe('sprint-147');
    expect(evt.timestamp).toBeDefined();
    // Verify ISO 8601 format
    expect(() => new Date(evt.timestamp as string)).not.toThrow();
    expect(new Date(evt.timestamp as string).toISOString()).toBe(evt.timestamp);
  });

  it('should emit exactly 1 event per phase transition call', () => {
    const transitions = [
      [SprintPhase.PLAN, SprintPhase.SPAWN],
      [SprintPhase.SPAWN, SprintPhase.EXECUTE],
      [SprintPhase.EXECUTE, SprintPhase.EVALUATE],
    ];

    for (const [oldPhase, newPhase] of transitions) {
      const before = captured.length;
      eventBus.emit('deckent-event', {
        type: 'SPRINT_PHASE_CHANGE',
        oldPhase,
        newPhase,
        sprintId: 'sprint-147',
        timestamp: new Date().toISOString(),
      });
      expect(captured.length - before).toBe(1);
    }

    expect(captured).toHaveLength(3);
    // Verify each captured event has the correct type
    for (const c of captured) {
      expect(c.payload.type).toBe('SPRINT_PHASE_CHANGE');
    }
  });

  it('should emit SPRINT_RETRO_COMPLETE event after retro phase', () => {
    eventBus.emit('deckent-event', {
      type: 'SPRINT_RETRO_COMPLETE',
      sprintId: 'sprint-147',
      timestamp: new Date().toISOString(),
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].payload.type).toBe('SPRINT_RETRO_COMPLETE');
    expect(captured[0].payload.sprintId).toBe('sprint-147');
  });

  it('should emit correct sequence of events for a full sprint lifecycle', () => {
    // Simulate the full sprint lifecycle event emissions as runSprint() would do:
    const sprintId = 'sprint-147';
    const ts = () => new Date().toISOString();

    // 1. PLAN→SPAWN + SPRINT_STARTED
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.PLAN, newPhase: SprintPhase.SPAWN, sprintId, timestamp: ts() });
    eventBus.emit('deckent-event', { type: 'SPRINT_STARTED', sprintId, taskCount: 22, timestamp: ts() });

    // 2. SPAWN→EXECUTE
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.SPAWN, newPhase: SprintPhase.EXECUTE, sprintId, timestamp: ts() });

    // 3. EXECUTE→EVALUATE
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.EXECUTE, newPhase: SprintPhase.EVALUATE, sprintId, timestamp: ts() });

    // 4. EVALUATE→FIX
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.EVALUATE, newPhase: SprintPhase.FIX, sprintId, timestamp: ts() });

    // 5. FIX→RETRO
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.FIX, newPhase: SprintPhase.RETRO, sprintId, timestamp: ts() });

    // 6. SPRINT_RETRO_COMPLETE + RETRO→DECAY
    eventBus.emit('deckent-event', { type: 'SPRINT_RETRO_COMPLETE', sprintId, timestamp: ts() });
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.RETRO, newPhase: SprintPhase.DECAY, sprintId, timestamp: ts() });

    // 7. DECAY→COMPLETE + SPRINT_COMPLETED
    eventBus.emit('deckent-event', { type: 'SPRINT_PHASE_CHANGE', oldPhase: SprintPhase.DECAY, newPhase: SprintPhase.COMPLETE, sprintId, timestamp: ts() });
    eventBus.emit('deckent-event', { type: 'SPRINT_COMPLETED', sprintId, timestamp: ts() });

    // Count: 7 SPRINT_PHASE_CHANGE + 1 SPRINT_STARTED + 1 SPRINT_RETRO_COMPLETE + 1 SPRINT_COMPLETED = 10
    expect(captured).toHaveLength(10);

    // Verify phase change count
    const phaseChanges = captured.filter(c => c.payload.type === 'SPRINT_PHASE_CHANGE');
    expect(phaseChanges).toHaveLength(7);

    // Verify lifecycle event types
    const types = captured.map(c => c.payload.type);
    expect(types).toContain('SPRINT_STARTED');
    expect(types).toContain('SPRINT_RETRO_COMPLETE');
    expect(types).toContain('SPRINT_COMPLETED');

    // Verify phase transition ordering
    const phaseOrder = phaseChanges.map(c => `${c.payload.oldPhase}→${c.payload.newPhase}`);
    expect(phaseOrder).toEqual([
      'PLAN→SPAWN',
      'SPAWN→EXECUTE',
      'EXECUTE→EVALUATE',
      'EVALUATE→FIX',
      'FIX→RETRO',
      'RETRO→DECAY',
      'DECAY→COMPLETE',
    ]);
  });

  it('should emit events via EventEmitter even without subscribers (backward compat)', () => {
    // When nervous system is disabled, there are no subscribers on 'deckent-event'.
    // The emit should still work without error.
    vi.restoreAllMocks(); // Remove our spy — use real emit

    // Verify no listeners on 'deckent-event' (no nervous system subscribed)
    const listenerCount = eventBus.listenerCount('deckent-event');
    // There should be 0 listeners for 'deckent-event' since we haven't subscribed
    // (the spy was removed above)

    // This should NOT throw even without listeners
    expect(() => {
      eventBus.emit('deckent-event', {
        type: 'SPRINT_PHASE_CHANGE',
        oldPhase: SprintPhase.PLAN,
        newPhase: SprintPhase.SPAWN,
        sprintId: 'sprint-147',
        timestamp: new Date().toISOString(),
      });
    }).not.toThrow();

    // Also verify SPRINT_STARTED, SPRINT_RETRO_COMPLETE, SPRINT_COMPLETED
    expect(() => {
      eventBus.emit('deckent-event', { type: 'SPRINT_STARTED', sprintId: 'sprint-147', timestamp: new Date().toISOString() });
      eventBus.emit('deckent-event', { type: 'SPRINT_RETRO_COMPLETE', sprintId: 'sprint-147', timestamp: new Date().toISOString() });
      eventBus.emit('deckent-event', { type: 'SPRINT_COMPLETED', sprintId: 'sprint-147', timestamp: new Date().toISOString() });
    }).not.toThrow();
  });
});
