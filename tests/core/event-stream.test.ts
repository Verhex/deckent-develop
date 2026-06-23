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
