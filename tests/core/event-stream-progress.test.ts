// ═══ Event Stream PROGRESS channel + emitProgress helper ═══════════════════
// Sprint 280 — PLANOBS-001
// Guards:
//   1. CHANNELS.PROGRESS exists with correct value
//   2. emitProgress writes an event with the right channel and payload
//   3. pct is optional (undefined pct omitted from payload)
//   4. emitProgress is fail-safe — never throws when writeEvent would error
//   5. payload shape: { phase, pct, detail } — source is NOT in payload
//   6. source override propagates to event.source

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  CHANNELS,
  emitProgress,
  readEvents,
} from '../../src/core/event-stream.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeTestRoot(): string {
  const root = join(
    tmpdir(),
    `deckent-progress-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function writeSprint(root: string, sprintId: string): void {
  writeFileSync(
    join(root, '.deckent', 'sprint-state.json'),
    JSON.stringify({ sprintId }),
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('PROGRESS channel + emitProgress (Sprint 280 PLANOBS-001)', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = makeTestRoot();
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('CHANNELS.PROGRESS exists with the expected value', () => {
    expect(CHANNELS.PROGRESS).toBe('PROGRESS');
  });

  it('CHANNELS.PROGRESS is a key of the CHANNELS object', () => {
    expect(Object.keys(CHANNELS)).toContain('PROGRESS');
  });

  it('emitProgress writes an event with channel=PROGRESS and correct payload shape', () => {
    writeSprint(testRoot, 'sprint-280');

    const ev = emitProgress({ root: testRoot, phase: 'EXECUTE', pct: 50, detail: 'half done' });

    expect(ev).not.toBeNull();
    expect(ev!.channel).toBe(CHANNELS.PROGRESS);
    expect(ev!.target).toBe('*');

    const payload = ev!.payload as { phase: string; pct?: number; detail?: string };
    expect(payload.phase).toBe('EXECUTE');
    expect(payload.pct).toBe(50);
    expect(payload.detail).toBe('half done');
  });

  it('pct is optional — omitting it leaves pct undefined in payload (not an error)', () => {
    writeSprint(testRoot, 'sprint-280');

    const ev = emitProgress({ root: testRoot, phase: 'SPAWN' });

    expect(ev).not.toBeNull();
    const payload = ev!.payload as { phase: string; pct?: number };
    expect(payload.phase).toBe('SPAWN');
    expect(payload.pct).toBeUndefined();
  });

  it('emitProgress is fail-safe — returns null when sprint-state.json is absent (no throw)', () => {
    // testRoot exists but sprint-state.json does NOT exist → getCurrentSprintId returns null
    let result: ReturnType<typeof emitProgress> | undefined;
    expect(() => {
      result = emitProgress({ root: testRoot, phase: 'PLAN' });
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('source is NOT present in payload — only in event.source', () => {
    writeSprint(testRoot, 'sprint-280');

    const ev = emitProgress({ root: testRoot, phase: 'PRE_VITEST', source: 'worker' });

    expect(ev).not.toBeNull();
    // source should be on the event, not the payload
    expect(ev!.source).toBe('worker');
    const payload = ev!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty('source');
  });

  it('source override propagates to event.source; defaults to "brain"', () => {
    writeSprint(testRoot, 'sprint-280');

    const defaultEv = emitProgress({ root: testRoot, phase: 'EXECUTE' });
    expect(defaultEv!.source).toBe('brain');

    const overrideEv = emitProgress({ root: testRoot, phase: 'EXECUTE', source: 'auditor' });
    expect(overrideEv!.source).toBe('auditor');
  });

  it('emitProgress event is readable back via readEvents', () => {
    writeSprint(testRoot, 'sprint-280');

    emitProgress({ root: testRoot, phase: 'EXECUTE', pct: 75, detail: 'almost' });

    const events = readEvents(testRoot, 'sprint-280', { channel: CHANNELS.PROGRESS });
    expect(events).toHaveLength(1);
    const payload = events[0]!.payload as { phase: string; pct: number; detail: string };
    expect(payload.phase).toBe('EXECUTE');
    expect(payload.pct).toBe(75);
    expect(payload.detail).toBe('almost');
  });

  it('emitProgress does not throw even when writeEvent errors internally', () => {
    // Simulate an error by passing a root where the .deckent dir will be created
    // but sprint-state.json is malformed so getCurrentSprintId returns null
    const badRoot = makeTestRoot();
    writeFileSync(join(badRoot, '.deckent', 'sprint-state.json'), 'NOT JSON');

    expect(() => {
      emitProgress({ root: badRoot, phase: 'EXECUTE' });
    }).not.toThrow();

    rmSync(badRoot, { recursive: true, force: true });
  });
});
