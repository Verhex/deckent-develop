import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCurrentSprintId } from '../../src/core/event-stream.js';

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
