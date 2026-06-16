// ═══ EventBus Tests ═════════════════════════════════════════════════
// Sprint 145 — Task 145-003: EventBus Abstraction + Subscribe API

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventBus, eventBus as singletonBus } from '../../src/orchestra/event-bus.js';
import type { DeckentEvent, ChannelCode } from '../../src/orchestra/event-stream.js';
import { CHANNELS, writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Helpers ────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DeckentEvent> = {}): DeckentEvent {
  return {
    timestamp: '2026-04-20T10:00:00.000Z',
    sequence: 1,
    protocol_version: '1.0',
    source: 'brain',
    target: '*',
    channel: CHANNELS.SPRINT_PHASE_CHANGE,
    payload: { phase: 'EXECUTE' },
    ...overrides,
  };
}

describe('EventBus', () => {
  let bus: EventBus;
  let testRoot: string;
  const sprintId = 'sprint-145';

  beforeEach(() => {
    bus = new EventBus();
    testRoot = join(tmpdir(), `deckent-event-bus-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testRoot, '.deckent', 'recently-works'), { recursive: true });
  });

  afterEach(() => {
    bus.unwatchAll();
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── Test 1: publish → subscribe direct call ──────────────────

  it('should deliver published event to subscriber', () => {
    const received: DeckentEvent[] = [];
    bus.subscribe(sprintId, undefined, (event) => {
      received.push(event);
    });

    const event = makeEvent();
    bus.publish(event, sprintId);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  // ─── Test 2: subscribe channels filter ────────────────────────

  it('should filter events by channel — NOTIFY only skips PHASE events', () => {
    const received: DeckentEvent[] = [];
    bus.subscribe(sprintId, [CHANNELS.NOTIFY as ChannelCode], (event) => {
      received.push(event);
    });

    // Publish a PHASE event → should be filtered out
    bus.publish(makeEvent({ channel: CHANNELS.SPRINT_PHASE_CHANGE }), sprintId);

    // Publish a NOTIFY event → should pass through
    const notifyEvent = makeEvent({ channel: CHANNELS.NOTIFY });
    bus.publish(notifyEvent, sprintId);

    expect(received).toHaveLength(1);
    expect(received[0]!.channel).toBe(CHANNELS.NOTIFY);
  });

  // ─── Test 3: subscribe sprintId filter ────────────────────────

  it('should filter events by sprintId — sprint-144 subscriber ignores sprint-145 events', () => {
    const received: DeckentEvent[] = [];
    bus.subscribe('sprint-144', undefined, (event) => {
      received.push(event);
    });

    // Publish event for sprint-145 → should be filtered out
    bus.publish(makeEvent(), 'sprint-145');

    // Publish event for sprint-144 → should pass through
    bus.publish(makeEvent({ sequence: 2 }), 'sprint-144');

    expect(received).toHaveLength(1);
    expect(received[0]!.sequence).toBe(2);
  });

  // ─── Test 4: unsubscribe stops delivery ───────────────────────

  it('should not deliver events after unsubscribe is called', () => {
    const received: DeckentEvent[] = [];
    const unsubscribe = bus.subscribe(sprintId, undefined, (event) => {
      received.push(event);
    });

    bus.publish(makeEvent(), sprintId);
    expect(received).toHaveLength(1);

    unsubscribe();

    bus.publish(makeEvent({ sequence: 2 }), sprintId);
    expect(received).toHaveLength(1); // still 1, not 2
  });

  // ─── Test 5: publish error — handler exception swallowed ──────

  it('should swallow subscriber exceptions without breaking event flow', () => {
    const received: DeckentEvent[] = [];

    // First subscriber throws
    bus.subscribe(sprintId, undefined, () => {
      throw new Error('subscriber crash');
    });

    // Second subscriber should still receive events
    bus.subscribe(sprintId, undefined, (event) => {
      received.push(event);
    });

    // Should not throw
    expect(() => bus.publish(makeEvent(), sprintId)).not.toThrow();

    // Second subscriber got the event
    expect(received).toHaveLength(1);
  });

  // ─── Test 6: tail() reads last N events correctly ─────────────

  it('should return last N events from JSONL file via tail()', async () => {
    // Write 8 events to JSONL
    const filePath = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    for (let i = 1; i <= 8; i++) {
      const event = makeEvent({ sequence: i, payload: { index: i } });
      appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf-8');
    }

    const last5 = await bus.tail(testRoot, sprintId, 5);

    expect(last5).toHaveLength(5);
    expect((last5[0]!.payload as { index: number }).index).toBe(4);
    expect((last5[4]!.payload as { index: number }).index).toBe(8);
  });

  // ─── Test 7: tail() empty/missing file → [] ──────────────────

  it('should return empty array for missing file via tail()', async () => {
    const result = await bus.tail(testRoot, 'sprint-nonexistent', 10);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty file via tail()', async () => {
    const filePath = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    appendFileSync(filePath, '', 'utf-8');

    const result = await bus.tail(testRoot, sprintId, 10);
    expect(result).toEqual([]);
  });

  // ─── Test 8: writeEvent integration → eventBus.publish called ─

  it.skip('should publish events when writeEvent() is called (integration)', () => {
    const received: DeckentEvent[] = [];

    const unsubscribe = singletonBus.subscribe(sprintId, undefined, (event) => {
      received.push(event);
    });

    try {
      // writeEvent should trigger eventBus.publish internally
      const written = writeEvent(
        testRoot, sprintId, 'brain', '*',
        CHANNELS.SPRINT_PHASE_CHANGE,
        { phase: 'SPAWN' },
      );

      expect(written).not.toBeNull();
      expect(received).toHaveLength(1);
      expect(received[0]!.channel).toBe(CHANNELS.SPRINT_PHASE_CHANGE);
      expect((received[0]!.payload as { phase: string }).phase).toBe('SPAWN');
    } finally {
      unsubscribe();
    }
  });

  // ─── Test 9: unwatchAll cleans up watchers ────────────────────

  it('should clean up all file watchers on unwatchAll()', () => {
    // Create the JSONL file first so watch doesn't fail
    const filePath = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    appendFileSync(filePath, '', 'utf-8');

    const watcher = bus.watchFile(testRoot, sprintId);
    expect(watcher).toBeDefined();
    expect(bus.subscriberCount).toBe(0); // watchers are not subscriptions

    bus.unwatchAll();
    // After unwatchAll, calling it again should be a no-op (no errors)
    expect(() => bus.unwatchAll()).not.toThrow();
  });

  // ─── Test 10: multiple subscribers receive same event ─────────

  it('should deliver event to all matching subscribers', () => {
    const received1: DeckentEvent[] = [];
    const received2: DeckentEvent[] = [];

    bus.subscribe(sprintId, undefined, (event) => received1.push(event));
    bus.subscribe(sprintId, undefined, (event) => received2.push(event));

    bus.publish(makeEvent(), sprintId);

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  // ─── Test 11: wildcard sprintId subscriber receives all ───────

  it('should deliver all events to wildcard (*) sprintId subscriber', () => {
    const received: DeckentEvent[] = [];
    bus.subscribe('*', undefined, (event) => received.push(event));

    bus.publish(makeEvent(), 'sprint-144');
    bus.publish(makeEvent({ sequence: 2 }), 'sprint-145');
    bus.publish(makeEvent({ sequence: 3 }), 'sprint-146');

    expect(received).toHaveLength(3);
  });

  // ─── Test 12: async subscriber error is swallowed ─────────────

  it('should swallow async subscriber rejections', async () => {
    const received: DeckentEvent[] = [];

    bus.subscribe(sprintId, undefined, async () => {
      throw new Error('async boom');
    });
    bus.subscribe(sprintId, undefined, (event) => received.push(event));

    // Should not throw
    expect(() => bus.publish(makeEvent(), sprintId)).not.toThrow();
    expect(received).toHaveLength(1);
  });

  // ─── Test 13: subscriberCount diagnostic ──────────────────────

  it('should track subscriber count correctly', () => {
    expect(bus.subscriberCount).toBe(0);

    const unsub1 = bus.subscribe(sprintId, undefined, () => {});
    const unsub2 = bus.subscribe(sprintId, undefined, () => {});
    expect(bus.subscriberCount).toBe(2);

    unsub1();
    expect(bus.subscriberCount).toBe(1);

    unsub2();
    expect(bus.subscriberCount).toBe(0);
  });

  // ─── Test 14: publish without sprintId delivers to all ────────

  it('should deliver event to all subscribers when sprintId is not provided', () => {
    const received: DeckentEvent[] = [];
    bus.subscribe('sprint-144', undefined, (event) => received.push(event));

    // publish without sprintId context → no filtering, all subscribers get it
    bus.publish(makeEvent());

    expect(received).toHaveLength(1);
  });

  // ─── Test 15: tail() skips malformed lines ────────────────────

  it('should skip malformed JSON lines in tail()', async () => {
    const filePath = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    appendFileSync(filePath, JSON.stringify(makeEvent({ sequence: 1 })) + '\n', 'utf-8');
    appendFileSync(filePath, 'not valid json\n', 'utf-8');
    appendFileSync(filePath, JSON.stringify(makeEvent({ sequence: 3 })) + '\n', 'utf-8');

    const result = await bus.tail(testRoot, sprintId, 10);
    expect(result).toHaveLength(2);
    expect(result[0]!.sequence).toBe(1);
    expect(result[1]!.sequence).toBe(3);
  });

  // ─── Test 16: EventEmitter 'event' raw event ─────────────────

  it('should emit raw event on EventEmitter for direct listeners', () => {
    const received: DeckentEvent[] = [];
    bus.on('event', (event: DeckentEvent) => received.push(event));

    bus.publish(makeEvent(), sprintId);

    expect(received).toHaveLength(1);
  });

  // ─── Test 17: watchFile detects new events (integration) ──────

  it('should detect new JSONL lines via watchFile', async () => {
    const filePath = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    // Create file with initial content
    appendFileSync(filePath, JSON.stringify(makeEvent({ sequence: 1 })) + '\n', 'utf-8');

    const received: DeckentEvent[] = [];
    bus.subscribe('*', undefined, (event) => received.push(event));

    // Start watching
    bus.watchFile(testRoot, sprintId);

    // Append new event after a short delay
    await new Promise(resolve => setTimeout(resolve, 50));
    const newEvent = makeEvent({ sequence: 2, payload: { phase: 'EVALUATE' } });
    appendFileSync(filePath, JSON.stringify(newEvent) + '\n', 'utf-8');

    // Wait for fs.watch to trigger
    await new Promise(resolve => setTimeout(resolve, 300));

    // Should have received the new event via watchFile → publish
    expect(received.length).toBeGreaterThanOrEqual(1);
    const lastReceived = received[received.length - 1]!;
    expect(lastReceived.sequence).toBe(2);
    expect((lastReceived.payload as { phase: string }).phase).toBe('EVALUATE');
  });
});
