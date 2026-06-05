// tests/cli/chat-nervous-bridge.test.ts
//
// Hermetic tests for chat-nervous-bridge.ts.
// All file I/O uses tmpdir — no reads from the project .deckent/ tree.
// Sprint 223 Task 223-007.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getPendingNervous,
  renderNervousPrompt,
  handleNervousSlash,
} from '../../src/cli/commands/chat-nervous-bridge.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'nervous-bridge-test-'));
}

function ensureDeckentDir(root: string): string {
  const dir = join(root, '.deckent');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function writePending(root: string, items: NervousNotification[]): void {
  ensureDeckentDir(root);
  writeFileSync(
    join(root, '.deckent', 'nervous-pending.json'),
    JSON.stringify(items, null, 2) + '\n',
    'utf-8',
  );
}

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    type: 'test-type',
    title: 'Test notification',
    message: 'A test message',
    severity: 'warning',
    createdAt: '2026-06-02T10:00:00.000Z',
    detectorId: 'test-detector',
    actions: [{ id: 'TEST_ACTION', policy: 'suggest-5m' } as unknown as NervousNotification['actions'][number]],
    timeoutMs: 300000,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getPendingNervous', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('returns empty array when no pending file exists', () => {
    const result = getPendingNervous(root);
    expect(result).toEqual([]);
  });

  it('reads notifications from .deckent/nervous-pending.json', () => {
    const n = makeNotification();
    writePending(root, [n]);
    const result = getPendingNervous(root);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(n.id);
    expect(result[0]?.detectorId).toBe('test-detector');
  });

  it('returns empty array on corrupted JSON', () => {
    ensureDeckentDir(root);
    writeFileSync(join(root, '.deckent', 'nervous-pending.json'), '{ broken json', 'utf-8');
    const result = getPendingNervous(root);
    expect(result).toEqual([]);
  });

  it('returns empty array when file contains non-array JSON', () => {
    ensureDeckentDir(root);
    writeFileSync(
      join(root, '.deckent', 'nervous-pending.json'),
      JSON.stringify({ not: 'an-array' }),
      'utf-8',
    );
    const result = getPendingNervous(root);
    expect(result).toEqual([]);
  });
});

describe('renderNervousPrompt', () => {
  it('returns empty string when no pending items', () => {
    expect(renderNervousPrompt([], true)).toBe('');
    expect(renderNervousPrompt([], false)).toBe('');
  });

  it('returns plain summary on non-TTY', () => {
    const n = makeNotification();
    const result = renderNervousPrompt([n], false);
    expect(result).toContain('[nervous]');
    expect(result).toContain('1 pending');
    // No ANSI escape codes in non-TTY output
    expect(result).not.toContain('\x1b[');
  });

  it('returns ANSI-styled banner on TTY', () => {
    const n = makeNotification();
    const result = renderNervousPrompt([n], true);
    expect(result).toContain('⚡');
    expect(result).toContain('nervous');
    // Should contain ANSI codes
    expect(result).toContain('\x1b[');
    // Should include detectorId
    expect(result).toContain('test-detector');
  });

  it('includes accept/reject hint on TTY', () => {
    const n = makeNotification();
    const result = renderNervousPrompt([n], true);
    expect(result).toContain('accept');
    expect(result).toContain('reject');
  });
});

describe('handleNervousSlash', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('lists pending notifications (no-arg defaults to list)', () => {
    const n = makeNotification();
    writePending(root, [n]);
    const result = handleNervousSlash([], root, false);
    expect(result).toContain(n.id.slice(0, 12));
    expect(result).toContain('test-detector');
  });

  it('reports "bekleyen yok" when pending is empty on list', () => {
    const result = handleNervousSlash(['list'], root, false, 'tr');
    expect(result).toContain('bekleyen');
  });

  it('accept removes notification from pending file', () => {
    const n = makeNotification();
    writePending(root, [n]);
    const result = handleNervousSlash(['accept', n.id], root, false);
    expect(result).toContain('accepted');
    // Pending file should now be empty
    const remaining = getPendingNervous(root);
    expect(remaining).toHaveLength(0);
  });

  it('reject removes notification from pending file', () => {
    const n = makeNotification();
    writePending(root, [n]);
    const result = handleNervousSlash(['reject', n.id], root, false);
    expect(result).toContain('rejected');
    const remaining = getPendingNervous(root);
    expect(remaining).toHaveLength(0);
  });

  it('accept by partial id prefix works', () => {
    const n = makeNotification();
    writePending(root, [n]);
    // Use first 8 chars as partial id
    handleNervousSlash(['accept', n.id.slice(0, 8)], root, false);
    expect(getPendingNervous(root)).toHaveLength(0);
  });

  it('appends to history on accept', () => {
    const n = makeNotification();
    writePending(root, [n]);
    handleNervousSlash(['accept', n.id], root, false);
    const histPath = join(root, '.deckent', 'nervous-history.jsonl');
    expect(existsSync(histPath)).toBe(true);
    const lines = readFileSync(histPath, 'utf-8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const record = JSON.parse(lines[0]!);
    expect(record.decision).toBe('accepted');
    expect(record.notificationId).toBe(n.id);
  });

  it('appends to history on reject', () => {
    const n = makeNotification();
    writePending(root, [n]);
    handleNervousSlash(['reject', n.id], root, false);
    const histPath = join(root, '.deckent', 'nervous-history.jsonl');
    const lines = readFileSync(histPath, 'utf-8').trim().split('\n').filter(Boolean);
    const record = JSON.parse(lines[0]!);
    expect(record.decision).toBe('rejected');
  });

  it('returns error when id missing for accept', () => {
    const result = handleNervousSlash(['accept'], root, false, 'tr');
    expect(result).toContain('id gerekli');
  });

  it('returns error when notification not found', () => {
    writePending(root, [makeNotification()]);
    const result = handleNervousSlash(['accept', 'nonexistent-id'], root, false, 'tr');
    expect(result).toContain('bulunamadı');
  });

  it('returns ANSI-colored output on accept in TTY mode', () => {
    const n = makeNotification();
    writePending(root, [n]);
    const result = handleNervousSlash(['accept', n.id], root, true);
    expect(result).toContain('\x1b[');
    expect(result).toContain('accepted');
  });

  it('pending-yok → silent empty on list (no TTY)', () => {
    // When no pending file exists, list returns quiet message
    const result = handleNervousSlash(['list'], root, false, 'tr');
    expect(result).toContain('bekleyen');
    // Should NOT throw, not show error codes
    expect(result).not.toContain('[error]');
  });
});
