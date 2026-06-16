// ═══ Event Stream NOTIFY Channel Tests ══════════════════════════
// Sprint 145 — Task 005: CHANNELS.NOTIFY writeEvent Wire
// Updated Sprint 148: uses writeEvent + CHANNELS.NOTIFY directly

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeEvent,
  readEvents,
  CHANNELS,
} from '../../src/orchestra/event-stream.js';

/** Helper: emit a NOTIFY event (equivalent to the planned emitNotify function). */
function emitNotify(
  projectRoot: string,
  sprintId: string,
  level: 'info' | 'warn' | 'error',
  title: string,
  body: string,
  meta?: Record<string, unknown>,
): void {
  writeEvent(projectRoot, sprintId, 'deckent', 'user', CHANNELS.NOTIFY, {
    level,
    title,
    body,
    meta,
  });
}

describe('NOTIFY channel via writeEvent', () => {
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

  it('should write event with channel === CHANNELS.NOTIFY', () => {
    emitNotify(testRoot, sprintId, 'info', 'Phase: SPAWN', '3 workers spawned');

    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(1);
    const event = events[0]!;
    expect(event.channel).toBe(CHANNELS.NOTIFY);
    expect(event.channel).toBe('DECKENT→USER:NOTIFY');
  });

  it('should write correct payload structure (level, title, body)', () => {
    const level = 'warn' as const;
    const title = 'Phase: EVALUATE';
    const body = '2 DONE, 1 NO_GO';
    const meta = { goCount: 2, noGoCount: 1 };

    emitNotify(testRoot, sprintId, level, title, body, meta);

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

  it('should set source=deckent and target=user', () => {
    emitNotify(testRoot, sprintId, 'info', 'Test', 'Body');

    const events = readEvents(testRoot, sprintId);
    expect(events[0]!.source).toBe('deckent');
    expect(events[0]!.target).toBe('user');
  });

  it('should work without meta argument', () => {
    emitNotify(testRoot, sprintId, 'error', 'Error', 'Something went wrong');

    const events = readEvents(testRoot, sprintId);
    expect(events.length).toBe(1);
    const payload = events[0]!.payload as { meta?: unknown };
    expect(payload.meta).toBeUndefined();
  });

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

  it('should produce JSONL lines containing NOTIFY channel', () => {
    emitNotify(testRoot, sprintId, 'info', 'Sprint complete', 'All done');

    const eventsFile = join(testRoot, '.deckent', 'recently-works', `${sprintId}-events.jsonl`);
    const raw = readFileSync(eventsFile, 'utf-8');
    expect(raw).toContain('"DECKENT→USER:NOTIFY"');
  });

  it('should accept info, warn, and error levels', () => {
    emitNotify(testRoot, sprintId, 'info', 'Info', 'info body');
    emitNotify(testRoot, sprintId, 'warn', 'Warn', 'warn body');
    emitNotify(testRoot, sprintId, 'error', 'Error', 'error body');

    const events = readEvents(testRoot, sprintId);
    const levels = events.map(e => (e.payload as { level: string }).level);
    expect(levels).toEqual(['info', 'warn', 'error']);
  });
});

describe('NOTIFY channel integration', () => {
  it('should export writeEvent and CHANNELS from event-stream module', async () => {
    const mod = await import('../../src/orchestra/event-stream.js');
    expect(typeof mod.writeEvent).toBe('function');
    expect(mod.CHANNELS).toBeDefined();
    expect(mod.CHANNELS.NOTIFY).toBe('DECKENT→USER:NOTIFY');
  });
});
