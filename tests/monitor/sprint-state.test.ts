import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCurrentSprintId } from '../../src/monitor/sprint-state.js';

// Use real filesystem (tmpdir) — no mocks needed for this pure I/O module
describe('getCurrentSprintId', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-sprint-state-test-'));
    mkdirSync(join(root, '.deckent'), { recursive: true });
  });

  // Cleanup after each test
  afterEach(() => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('(1) returns sprintId from sprint-state.json when it exists', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-135', phase: 'EXECUTE', status: 'ACTIVE' }),
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBe('sprint-135');
  });

  it('(2) returns null when neither sprint-state.json nor sprint-active.json exist', () => {
    // No files written — empty .deckent dir
    expect(getCurrentSprintId(root)).toBeNull();
  });

  it('(3) stale .dashboard is NOT consulted — sprint-active.json is the truth', () => {
    // Write a stale .dashboard pointing to old sprint
    writeFileSync(
      join(root, '.dashboard'),
      JSON.stringify({ sprint: { id: 'sprint-133' } }),
      'utf-8',
    );
    // Write sprint-state.json pointing to current sprint
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-134' }),
      'utf-8',
    );
    // getCurrentSprintId never reads .dashboard — should return sprint-134
    expect(getCurrentSprintId(root)).toBe('sprint-134');
  });

  it('(4) returns null when sprint-state.json has malformed JSON (parse fail → null)', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      'this is not valid JSON {{{',
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBeNull();
  });

  it('(5) prefers sprint-active.json over sprint-state.json when both exist', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-134' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.deckent', 'sprint-active.json'),
      JSON.stringify({ sprintId: 'sprint-135' }),
      'utf-8',
    );
    // sprint-active.json takes priority
    expect(getCurrentSprintId(root)).toBe('sprint-135');
  });

  it('(6) falls back to sprint-state.json when sprint-active.json has malformed JSON', () => {
    writeFileSync(
      join(root, '.deckent', 'sprint-state.json'),
      JSON.stringify({ sprintId: 'sprint-134' }),
      'utf-8',
    );
    writeFileSync(
      join(root, '.deckent', 'sprint-active.json'),
      'INVALID JSON <<<',
      'utf-8',
    );
    expect(getCurrentSprintId(root)).toBe('sprint-134');
  });
});
