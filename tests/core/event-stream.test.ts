import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCurrentSprintId, rotateEventFileIfLarge } from '../../src/core/event-stream.js';

// R4-SPRINTID (Sprint 318) — faithful regression for the canonical core
// getCurrentSprintId. The PRE-FIX core version read sprint-state.json ONLY and
// IGNORED sprint-active.json; scenario (a) below is RED on that old code and
// GREEN after the active→state upgrade (verified pre-fix red / post-fix green
// via git stash). Real filesystem (tmpdir) — pure I/O module, no mocks.
describe('core/event-stream getCurrentSprintId (canonical active→state)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-event-stream-sprintid-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('(a) returns sprint-active.json sprintId when present — old core IGNORED this (pre-fix RED)', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-state-id' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.deckent', 'sprint-active.json'),
      JSON.stringify({ sprintId: 'sprint-active-id' }),
      'utf-8',
    );
    // Canonical: sprint-active.json overrides. Old core/event-stream returned
    // 'sprint-state-id' here (ignored the active file) → this asserts the fix.
    expect(getCurrentSprintId(root)).toBe('sprint-active-id');
  });

  it('(b) falls back to sprint-state.json when sprint-active.json absent', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-138', phase: 'EXECUTE' }),
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBe('sprint-138');
  });

  it('(c) returns null when neither sprint-active.json nor sprint-state.json exist', () => {
    expect(getCurrentSprintId(root)).toBeNull();
  });

  it('(d) falls back to sprint-state.json when sprint-active.json is malformed JSON', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-state-id' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.deckent', 'sprint-active.json'),
      'INVALID JSON <<<',
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBe('sprint-state-id');
  });

  it('(e) falls back to sprint-state.json when sprint-active.json sprintId is empty', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-state-id' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.deckent', 'sprint-active.json'),
      JSON.stringify({ sprintId: '' }),
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBe('sprint-state-id');
  });

  it('returns null when sprint-state.json is malformed JSON', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      'not valid json {{{',
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBeNull();
  });
});

// B-AUTONOMOUS-LOG (Sprint 318) — bound the long-lived 'autonomous' event stream
// (grew to 19MB / 56,920 lines unrotated). rotateEventFileIfLarge rotates to `.1`
// past the cap. Real filesystem (tmpdir).
describe('rotateEventFileIfLarge — B-AUTONOMOUS-LOG rotation', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'deckent-event-rotate-')); });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('rotates to .1 when the file exceeds the cap', () => {
    const p = join(root, 'autonomous-events.jsonl');
    writeFileSync(p, 'x'.repeat(200), 'utf-8'); // 200 bytes
    const rotated = rotateEventFileIfLarge(p, 100); // cap 100 → over
    expect(rotated).toBe(true);
    expect(existsSync(`${p}.1`)).toBe(true);
    expect(existsSync(p)).toBe(false); // fresh file starts on next append
    expect(statSync(`${p}.1`).size).toBe(200);
  });

  it('does NOT rotate when under the cap (per-sprint small files)', () => {
    const p = join(root, 'sprint-318-events.jsonl');
    writeFileSync(p, 'small', 'utf-8');
    expect(rotateEventFileIfLarge(p, 10 * 1024 * 1024)).toBe(false);
    expect(existsSync(`${p}.1`)).toBe(false);
    expect(existsSync(p)).toBe(true);
  });

  it('missing file → no-op, no throw', () => {
    expect(rotateEventFileIfLarge(join(root, 'nope.jsonl'), 1)).toBe(false);
  });
});

// ── 671-008 ────────────────────────────────────────────────────────────────
// Two hardening pins for src/core/event-stream.ts. Real filesystem (tmpdir),
// no spawn, no fs mocks — the failure is forced with a real EISDIR fixture.
import { vi } from 'vitest';
import {
  writeEvent,
  writeEventDetailed,
  readSequence,
  getLastEventWriteFailure,
  CHANNELS,
} from '../../src/core/event-stream.js';

const RECENT_WORKS = join('.deckent', 'recently-works');

describe('671-008 (a) nextSequence self-healing when the seq sidecar is gone', () => {
  let root: string;
  const sprintId = 'sprint-671';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-event-seq-heal-'));
    mkdirSync(join(root, RECENT_WORKS), { recursive: true });
  });
  afterEach(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('continues from the max sequence in the event log instead of restarting at 1', () => {
    // Arrange: populated event log, sidecar deleted (the retention race).
    const eventsPath = join(root, RECENT_WORKS, `${sprintId}-events.jsonl`);
    const seqPath = join(root, RECENT_WORKS, `${sprintId}-seq`);
    const log = [1, 2, 7].map(sequence => JSON.stringify({
      timestamp: '2026-08-25T00:00:00.000Z',
      sequence,
      protocol_version: '1.0',
      source: 'brain',
      target: 'worker',
      channel: CHANNELS.TASK_ASSIGN,
      payload: { n: sequence },
    })).join('\n') + '\n';
    writeFileSync(eventsPath, log, 'utf-8');
    expect(existsSync(seqPath)).toBe(false);

    // Act: a late emitter writes after the sidecar vanished.
    const first = writeEvent(root, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, { late: true });
    const second = writeEvent(root, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, { late: true });

    // Assert: continuity from the log's high-water mark (7), never 1.
    expect(first?.sequence).toBe(8);
    expect(second?.sequence).toBe(9);
    expect(readSequence(root, sprintId)).toBe(9); // sidecar rebuilt at the recovered mark
  });

  it('still starts at 1 when neither sidecar nor event log exists', () => {
    const fresh = writeEvent(root, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, {});
    expect(fresh?.sequence).toBe(1);
  });
});

describe('671-008 (b) writeEvent I/O failure is visible and typed', () => {
  let root: string;
  const sprintId = 'sprint-671-fail';
  let prevDebug: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-event-write-fail-'));
    // Force a real I/O failure: a DIRECTORY where the JSONL file must be appended.
    mkdirSync(join(root, RECENT_WORKS, `${sprintId}-events.jsonl`), { recursive: true });
    prevDebug = process.env['DECKENT_DEBUG'];
    process.env['DECKENT_DEBUG'] = '1'; // debugLog records to stderr
  });
  afterEach(() => {
    if (prevDebug === undefined) delete process.env['DECKENT_DEBUG'];
    else process.env['DECKENT_DEBUG'] = prevDebug;
    vi.restoreAllMocks();
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('emits a debugLog record and a typed failure while writeEvent still returns null', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const legacy = writeEvent(root, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, { lost: true });
    const detailed = writeEventDetailed(root, sprintId, 'brain', 'worker', CHANNELS.TASK_ASSIGN, { lost: true });

    const records = stderrSpy.mock.calls
      .map(call => String(call[0]))
      .filter(line => line.includes('event-stream:writeEvent'));

    // Backward-compatible return contract: existing callers still observe null.
    expect(legacy).toBeNull();
    // Typed result describes the loss.
    expect(detailed.kind).toBe('failed');
    if (detailed.kind === 'failed') {
      expect(detailed.sprintId).toBe(sprintId);
      expect(detailed.channel).toBe(CHANNELS.TASK_ASSIGN);
      expect(detailed.reason.length).toBeGreaterThan(0);
      expect(detailed.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // The loss is recorded, not silent.
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(records[0]).toContain(`sprint=${sprintId}`);
    const last = getLastEventWriteFailure();
    expect(last?.sprintId).toBe(sprintId);
    expect(last?.kind).toBe('failed');
  });

  it('a healthy write is unaffected — same event object callers already receive', () => {
    const okRoot = mkdtempSync(join(tmpdir(), 'deckent-event-write-ok-'));
    try {
      const ev = writeEvent(okRoot, 'sprint-671-ok', 'brain', 'worker', CHANNELS.TASK_ASSIGN, { ok: true });
      expect(ev).not.toBeNull();
      expect(ev?.sequence).toBe(1);
      expect(ev?.protocol_version).toBe('1.0');
    } finally {
      try { rmSync(okRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
