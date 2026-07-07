// tests/cli/nervous-slash-applies.test.ts
//
// born-515 regression tests: `/nervous accept|reject` must actually reach the
// real nervous executor via the nervous-ipc channel (nervous/ipc-queue.ts)
// whenever one is live, and must NEVER log a fabricated 'success' outcome for
// an action it never executed. Mirrors the pattern already proven correct for
// the CLI equivalent in tests/cli/nervous-ipc-route.test.ts.
//
// Hermetic: tmpdir root only, sync fs, no network, no gitignored local state.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleNervousSlash, getPendingNervous } from '../../src/cli/commands/chat-nervous-bridge.js';
import { writeNervousHeartbeat } from '../../src/nervous/ipc-queue.js';
import type { NervousNotification } from '../../src/core/nervous-types.js';

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'nervous-slash-applies-'));
}

function writePending(root: string, items: NervousNotification[]): void {
  const dir = join(root, '.deckent', 'nervous');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'nervous-pending.json'), JSON.stringify(items, null, 2) + '\n', 'utf-8');
}

function makeNotification(overrides: Partial<NervousNotification> = {}): NervousNotification {
  return {
    id: 'aaaaaaaa-1111-1111-1111-000000000001',
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

function ipcPendingFiles(root: string): string[] {
  const dir = join(root, '.deckent', 'nervous', 'nervous-ipc', 'pending');
  return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : [];
}

function readIpcRecord(root: string, file: string): { notificationId: string; decision: string } {
  const raw = readFileSync(join(root, '.deckent', 'nervous', 'nervous-ipc', 'pending', file), 'utf-8');
  return JSON.parse(raw) as { notificationId: string; decision: string };
}

function readHistoryRecords(root: string): Array<{ decision: string; outcome: string; notificationId: string }> {
  const path = join(root, '.deckent', 'nervous', 'nervous-history.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

describe('/nervous accept|reject — reaches the real executor (born-515)', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('accept: routes to the nervous-ipc queue when the executor is alive (disk-check nervous-state)', () => {
    const n = makeNotification();
    writePending(root, [n]);
    writeNervousHeartbeat(root); // simulate a live executor poller

    const result = handleNervousSlash(['accept', n.id], root, false);

    const files = ipcPendingFiles(root);
    expect(files).toHaveLength(1);
    const record = readIpcRecord(root, files[0]!);
    expect(record.notificationId).toBe(n.id);
    expect(record.decision).toBe('accepted');

    expect(getPendingNervous(root)).toHaveLength(0);
    expect(result).toContain('accepted');
    expect(result.toLowerCase()).toContain('executor');
  });

  it('reject: routes to the nervous-ipc queue when the executor is alive (unblocks its parked decision)', () => {
    const n = makeNotification();
    writePending(root, [n]);
    writeNervousHeartbeat(root);

    const result = handleNervousSlash(['reject', n.id], root, false);

    const files = ipcPendingFiles(root);
    expect(files).toHaveLength(1);
    const record = readIpcRecord(root, files[0]!);
    expect(record.notificationId).toBe(n.id);
    expect(record.decision).toBe('rejected');

    expect(getPendingNervous(root)).toHaveLength(0);
    expect(result).toContain('rejected');
    expect(result.toLowerCase()).toContain('executor');
  });

  it('accept: does NOT write to nervous-ipc and does NOT claim a fabricated success when no executor is alive', () => {
    const n = makeNotification();
    writePending(root, [n]);
    // No heartbeat written — no live executor.

    const result = handleNervousSlash(['accept', n.id], root, false);

    expect(ipcPendingFiles(root)).toHaveLength(0);
    expect(getPendingNervous(root)).toHaveLength(0);

    const history = readHistoryRecords(root);
    expect(history).toHaveLength(1);
    expect(history[0]!.decision).toBe('accepted');
    // The core regression: this must never be 'success' — nothing was executed.
    expect(history[0]!.outcome).not.toBe('success');
    expect(history[0]!.outcome).toBe('pending');

    expect(result.toLowerCase()).toContain('no live');
  });

  it('reject: reports honestly when no executor is alive (no audit lie, no crash)', () => {
    const n = makeNotification();
    writePending(root, [n]);

    const result = handleNervousSlash(['reject', n.id], root, false);

    expect(ipcPendingFiles(root)).toHaveLength(0);
    const history = readHistoryRecords(root);
    expect(history).toHaveLength(1);
    expect(history[0]!.decision).toBe('rejected');
    expect(history[0]!.outcome).not.toBe('success');
    expect(result).toContain('rejected');
  });

  it('a stale (>5s old) heartbeat is treated as dead, same as no heartbeat', () => {
    const n = makeNotification();
    writePending(root, [n]);
    writeNervousHeartbeat(root);
    // Force the heartbeat to look stale by writing an old timestamp directly.
    const hbPath = join(root, '.deckent', 'nervous', 'nervous-ipc', 'heartbeat');
    writeFileSync(hbPath, String(Date.now() - 60_000), 'utf-8');

    const result = handleNervousSlash(['accept', n.id], root, false);

    expect(ipcPendingFiles(root)).toHaveLength(0);
    const history = readHistoryRecords(root);
    expect(history[0]!.outcome).toBe('pending');
    expect(result.toLowerCase()).toContain('no live');
  });
});
