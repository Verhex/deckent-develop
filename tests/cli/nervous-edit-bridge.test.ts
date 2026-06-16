// tests/cli/nervous-edit-bridge.test.ts
//
// Hermetic tests for /nervous edit in handleNervousSlash (APPROVE-007b).
// All file I/O uses tmpdir — no reads from the project .deckent/ tree.
// Sprint 280 Task 280-008.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleNervousSlash, getPendingNervous } from '../../src/cli/commands/chat-nervous-bridge.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'nervous-edit-test-'));
}

function writePending(root: string, items: NervousNotification[]): void {
  mkdirSync(join(root, '.deckent', 'nervous'), { recursive: true });
  writeFileSync(
    join(root, '.deckent', 'nervous', 'nervous-pending.json'),
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
    createdAt: '2026-06-11T00:00:00.000Z',
    detectorId: 'test-detector',
    actions: [{ id: 'TEST_ACTION', policy: 'suggest-5m' } as unknown as NervousNotification['actions'][number]],
    timeoutMs: 300000,
    ...overrides,
  };
}

function ipcPendingFiles(root: string): string[] {
  const dir = join(root, '.deckent', 'nervous', 'nervous-ipc', 'pending');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json'));
}

function readFirstIpcFile(root: string): Record<string, unknown> {
  const dir = join(root, '.deckent', 'nervous', 'nervous-ipc', 'pending');
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 0) throw new Error('No IPC files found');
  return JSON.parse(readFileSync(join(dir, files[0]!), 'utf-8')) as Record<string, unknown>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleNervousSlash — edit (APPROVE-007b)', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('edit with kv args writes IPC file with modifiedPayload', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const result = handleNervousSlash(['edit', n.id, 'reason=approved', 'priority=high'], root, false);

    // IPC file created
    expect(ipcPendingFiles(root)).toHaveLength(1);
    const ipcRecord = readFirstIpcFile(root);
    expect(ipcRecord['notificationId']).toBe(n.id);
    expect(ipcRecord['decision']).toBe('accepted');
    expect(ipcRecord['modifiedPayload']).toEqual({ reason: 'approved', priority: 'high' });
    // Removed from pending
    expect(getPendingNervous(root)).toHaveLength(0);
    // Success message
    expect(result).toContain('TEST_ACTION');
  });

  it('edit with JSON payload writes IPC file with modifiedPayload', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const payload = JSON.stringify({ reason: 'ok', count: 3 });
    const result = handleNervousSlash(['edit', n.id, payload], root, false);

    expect(ipcPendingFiles(root)).toHaveLength(1);
    const ipcRecord = readFirstIpcFile(root);
    expect(ipcRecord['modifiedPayload']).toEqual({ reason: 'ok', count: 3 });
    expect(result).toContain('TEST_ACTION');
  });

  it('edit removes notification from pending after IPC write', () => {
    const n = makeNotification();
    writePending(root, [n]);

    handleNervousSlash(['edit', n.id, 'k=v'], root, false);

    expect(getPendingNervous(root)).toHaveLength(0);
  });

  it('edit with unknown id returns honest error message (en)', () => {
    writePending(root, [makeNotification()]);

    const result = handleNervousSlash(['edit', 'nonexistent-id'], root, false, 'en');

    expect(result).toContain('not found');
    expect(ipcPendingFiles(root)).toHaveLength(0);
  });

  it('edit with unknown id returns honest error message (tr)', () => {
    writePending(root, [makeNotification()]);

    const result = handleNervousSlash(['edit', 'nonexistent-id'], root, false, 'tr');

    expect(result).toContain('bulunamadı');
    expect(ipcPendingFiles(root)).toHaveLength(0);
  });

  it('edit with missing payload args returns error without crashing', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const result = handleNervousSlash(['edit', n.id], root, false, 'en');

    expect(result).toContain('payload');
    // REPL must not crash — result is a non-empty string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Notification NOT removed (edit failed before write)
    expect(getPendingNervous(root)).toHaveLength(1);
    // No IPC file written
    expect(ipcPendingFiles(root)).toHaveLength(0);
  });

  it('edit with invalid JSON returns error without crashing', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const result = handleNervousSlash(['edit', n.id, '{broken json'], root, false, 'en');

    expect(result).toContain('invalid');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    // Notification NOT removed
    expect(getPendingNervous(root)).toHaveLength(1);
    expect(ipcPendingFiles(root)).toHaveLength(0);
  });

  it('edit with invalid kv arg returns error without crashing', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const result = handleNervousSlash(['edit', n.id, 'no-equals-sign'], root, false, 'en');

    expect(result).toContain('invalid');
    expect(typeof result).toBe('string');
    expect(getPendingNervous(root)).toHaveLength(1);
    expect(ipcPendingFiles(root)).toHaveLength(0);
  });

  it('i18n: success message differs between en and tr', () => {
    const nEn = makeNotification({ id: 'aaaa-en-0000' });
    const nTr = makeNotification({ id: 'aaaa-tr-0000' });

    const root2 = makeTmpRoot();
    try {
      writePending(root, [nEn]);
      writePending(root2, [nTr]);

      const enResult = handleNervousSlash(['edit', nEn.id, 'k=v'], root, false, 'en');
      const trResult = handleNervousSlash(['edit', nTr.id, 'k=v'], root2, false, 'tr');

      // Both succeed
      expect(enResult).toContain('TEST_ACTION');
      expect(trResult).toContain('TEST_ACTION');
      // Translations differ
      expect(enResult).not.toBe(trResult);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it('edit with missing id returns id-required error', () => {
    const result = handleNervousSlash(['edit'], root, false, 'en');
    expect(result).toContain('id');
    expect(result).toContain('required');
  });

  it('edit TTY mode wraps success in ANSI green', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const result = handleNervousSlash(['edit', n.id, 'k=v'], root, true);

    expect(result).toContain('\x1b[');
    expect(result).toContain('TEST_ACTION');
  });
});
