// ═══ emitNotify Tests ════════════════════════════════════════════
// Sprint 145 — Task 005: CHANNELS.NOTIFY writeEvent Emit Wire

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  emitNotify,
  readEvents,
  CHANNELS,
} from '../../src/orchestra/event-stream.js';
import type { DeckentEvent } from '../../src/orchestra/event-stream.js';

describe('emitNotify', () => {
  let testRoot: string;
  const sprintId = 'sprint-145';

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `deckent-notify-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── Test 1: emitNotify writes event with NOTIFY channel ────────

  it('should write event with channel === CHANNELS.NOTIFY', () => {
    // Arrange — fresh sprint dir

    // Act
    emitNotify(testRoot, sprintId, 'info', 'Phase: SPAWN', '3 workers spawned');

    // Assert — read JSONL and check last event
    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(1);
    const event = events[0]!;
    expect(event.channel).toBe(CHANNELS.NOTIFY);
    expect(event.channel).toBe('DECKENT→USER:NOTIFY');
  });

  // ─── Test 2: payload structure is correct ───────────────────────

  it('should write correct payload structure (level, title, body)', () => {
    // Arrange
    const level = 'warn' as const;
    const title = 'Phase: EVALUATE';
    const body = '2 DONE, 1 NO_GO';
    const meta = { goCount: 2, noGoCount: 1 };

    // Act
    emitNotify(testRoot, sprintId, level, title, body, meta);

    // Assert
    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(1);
    const payload = events[0]!.payload as {
      level: string;
      title: string;
      body: string;
      meta?: Record<string, unknown>;
    };
    expect(payload.level).toBe(level);
    expect(payload.title).toBe(title);
    expect(payload.body).toBe(body);
    expect(payload.meta).toEqual(meta);
  });

  // ─── Test 3: source and target fields ───────────────────────────

  it('should set source=deckent and target=user', () => {
    emitNotify(testRoot, sprintId, 'info', 'Test', 'Body');

    const events = readEvents(testRoot, sprintId);
    expect(events[0]!.source).toBe('deckent');
    expect(events[0]!.target).toBe('user');
  });

  // ─── Test 4: meta is optional (undefined by default) ────────────

  it('should work without meta argument', () => {
    emitNotify(testRoot, sprintId, 'error', 'Error', 'Something went wrong');

    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(1);
    const payload = events[0]!.payload as { meta?: unknown };
    expect(payload.meta).toBeUndefined();
  });

  // ─── Test 5: multiple calls accumulate in JSONL ─────────────────

  it('should accumulate multiple NOTIFY events in JSONL', () => {
    emitNotify(testRoot, sprintId, 'info', 'Phase: SPAWN', 'spawned');
    emitNotify(testRoot, sprintId, 'info', 'Phase: EVALUATE', 'evaluated');
    emitNotify(testRoot, sprintId, 'info', 'Phase: RETRO', 'retro done');
    emitNotify(testRoot, sprintId, 'info', 'Phase: CLEANUP', 'cleaned');

    const events = readEvents(testRoot, sprintId, { channel: CHANNELS.NOTIFY });
    expect(events.length).toBe(4);
    const titles = events.map(e => (e.payload as { title: string }).title);
    expect(titles).toContain('Phase: SPAWN');
    expect(titles).toContain('Phase: EVALUATE');
    expect(titles).toContain('Phase: RETRO');
    expect(titles).toContain('Phase: CLEANUP');
  });

  // ─── Test 6: JSONL raw file contains "NOTIFY" string ────────────

  it('should produce JSONL lines containing NOTIFY channel', () => {
    emitNotify(testRoot, sprintId, 'info', 'Sprint complete', 'All done');

    const eventsFile = join(testRoot, '.deckent', `${sprintId}-events.jsonl`);
    const raw = readFileSync(eventsFile, 'utf-8');
    expect(raw).toContain('"DECKENT→USER:NOTIFY"');
  });

  // ─── Test 7: all level values are accepted ───────────────────────

  it('should accept info, warn, and error levels', () => {
    emitNotify(testRoot, sprintId, 'info', 'Info', 'info body');
    emitNotify(testRoot, sprintId, 'warn', 'Warn', 'warn body');
    emitNotify(testRoot, sprintId, 'error', 'Error', 'error body');

    const events = readEvents(testRoot, sprintId);
    const levels = events.map(e => (e.payload as { level: string }).level);
    expect(levels).toEqual(['info', 'warn', 'error']);
  });
});

// ─── Integration: sprint-controller.ts imports emitNotify ────────

describe('sprint-controller emitNotify integration', () => {
  it('should export emitNotify from event-stream module', async () => {
    // Verify the function is exported and callable
    const mod = await import('../../src/orchestra/event-stream.js');
    expect(typeof mod.emitNotify).toBe('function');
  });

  it('should have emitNotify imported in sprint-controller source', async () => {
    // Verify sprint-controller.ts imports emitNotify (static code check)
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/orchestra/sprint-controller.ts', 'utf-8');
    expect(src).toMatch(/import.*emitNotify.*from.*event-stream/);
  });

  it('should have emitNotify calls in SPAWN, EVALUATE, RETRO, CLEANUP phases', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/orchestra/sprint-controller.ts', 'utf-8');

    // Count emitNotify calls
    const calls = (src.match(/emitNotify\(/g) ?? []).length;
    expect(calls).toBeGreaterThanOrEqual(4);

    // Check phase labels present
    expect(src).toContain("'Phase: SPAWN'");
    expect(src).toContain("'Phase: EVALUATE'");
    expect(src).toContain("'Phase: RETRO'");
    expect(src).toContain("'Phase: CLEANUP'");
  });
});
