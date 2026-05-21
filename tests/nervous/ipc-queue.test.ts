// tests/nervous/ipc-queue.test.ts
//
// W2-2 — Sprint 180 Task 5. NERVOUS-TODO §11.2 Step E.
// File-based IPC queue tests (5): write + read + resolved move
// + concurrent IPC race + backward-compat MCP nervous_accept inactive.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { NervousIpcQueue } from '../../src/nervous/ipc-queue.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nervous-ipc-'));
  return dir;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('NervousIpcQueue', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = makeTempRoot();
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  // Test 1: writeApproval → 1 file in pending dir with correct content
  it('writeApproval writes a JSON request file to pending dir', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    const file = await queue.writeApproval({
      notificationId: 'ns-test-001',
      decision: 'accepted',
      reason: 'manual approve',
    });

    expect(existsSync(file)).toBe(true);
    expect(file.includes(queue.getPendingDir())).toBe(true);

    const files = readdirSync(queue.getPendingDir());
    expect(files).toHaveLength(1);

    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
    expect(parsed.notificationId).toBe('ns-test-001');
    expect(parsed.decision).toBe('accepted');
    expect(parsed.reason).toBe('manual approve');
    expect(typeof parsed.requestedAt).toBe('string');
  });

  // Test 2: readPending returns previously written entries
  it('readPending returns all pending approval requests', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    await queue.writeApproval({ notificationId: 'ns-a', decision: 'accepted' });
    await queue.writeApproval({
      notificationId: 'ns-b',
      decision: 'rejected',
      reason: 'too risky',
    });

    const items = await queue.readPending();
    expect(items).toHaveLength(2);

    const byId = new Map(items.map(i => [i.request.notificationId, i.request]));
    expect(byId.get('ns-a')?.decision).toBe('accepted');
    expect(byId.get('ns-b')?.decision).toBe('rejected');
    expect(byId.get('ns-b')?.reason).toBe('too risky');
  });

  // Test 3: markResolved moves file from pending to resolved dir
  it('markResolved relocates the pending file to resolved dir', async () => {
    const queue = new NervousIpcQueue(tempRoot);
    const file = await queue.writeApproval({
      notificationId: 'ns-move',
      decision: 'accepted',
    });

    await queue.markResolved(file);

    expect(existsSync(file)).toBe(false);
    expect(readdirSync(queue.getPendingDir())).toHaveLength(0);

    const resolvedFiles = readdirSync(queue.getResolvedDir());
    expect(resolvedFiles).toHaveLength(1);

    const resolvedPath = join(queue.getResolvedDir(), resolvedFiles[0]!);
    const parsed = JSON.parse(readFileSync(resolvedPath, 'utf-8')) as Record<string, unknown>;
    expect(parsed.notificationId).toBe('ns-move');
  });

  // Test 4: concurrent writes for the same notification id produce unique files
  // — no data loss under race conditions
  it('handles concurrent writeApproval calls without losing data', async () => {
    const queue = new NervousIpcQueue(tempRoot);

    await Promise.all([
      queue.writeApproval({ notificationId: 'ns-race', decision: 'accepted' }),
      queue.writeApproval({ notificationId: 'ns-race', decision: 'rejected' }),
      queue.writeApproval({ notificationId: 'ns-other', decision: 'accepted' }),
    ]);

    const files = readdirSync(queue.getPendingDir());
    expect(files).toHaveLength(3);

    const items = await queue.readPending();
    expect(items).toHaveLength(3);
    const decisions = items.map(i => `${i.request.notificationId}:${i.request.decision}`).sort();
    expect(decisions).toEqual([
      'ns-other:accepted',
      'ns-race:accepted',
      'ns-race:rejected',
    ]);
  });

  // Test 5: MCP nervous_accept with nervous_system.enabled=false does NOT
  // write to IPC queue (backward-compat stub history-only behavior)
  it('MCP nervous_accept skips IPC write when nervous_system disabled', async () => {
    // Arrange: project root with nervous_system.enabled=false
    mkdirSync(join(tempRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(tempRoot, '.deckent', 'config.json'),
      JSON.stringify({ nervous_system: { enabled: false, mode: 'balanced' } }),
      'utf-8',
    );

    const { handleNervousAccept } = await import('../../src/mcp/tools/nervous.js');

    const result = await handleNervousAccept({
      id: 'ns-disabled-test',
      root: tempRoot,
    });

    // Stub response: accepted true, but NO IPC queue write
    expect(result.accepted).toBe(true);
    expect(result.queued).toBe(false);

    const queue = new NervousIpcQueue(tempRoot);
    const pending = await queue.readPending();
    expect(pending).toHaveLength(0);

    // Now flip enabled=true and confirm IPC write happens
    writeFileSync(
      join(tempRoot, '.deckent', 'config.json'),
      JSON.stringify({ nervous_system: { enabled: true, mode: 'balanced' } }),
      'utf-8',
    );

    const resultEnabled = await handleNervousAccept({
      id: 'ns-enabled-test',
      root: tempRoot,
    });
    expect(resultEnabled.accepted).toBe(true);
    expect(resultEnabled.queued).toBe(true);

    const pendingAfter = await queue.readPending();
    expect(pendingAfter).toHaveLength(1);
    expect(pendingAfter[0]!.request.notificationId).toBe('ns-enabled-test');
    expect(pendingAfter[0]!.request.decision).toBe('accepted');
  });

  // Test 6 (Sprint 180 W2-2 fix): startPolling invokes the handler for each
  // pending entry, relocates the consumed file to resolved/, and stops cleanly
  // when the handle is disposed.
  it('startPolling drives handler and moves processed files; dispose stops the loop', async () => {
    const queue = new NervousIpcQueue(tempRoot);

    await queue.writeApproval({ notificationId: 'ns-poll-a', decision: 'accepted' });
    await queue.writeApproval({ notificationId: 'ns-poll-b', decision: 'rejected', reason: 'no-op' });

    const seen: string[] = [];
    const handle = queue.startPolling((req) => {
      seen.push(`${req.notificationId}:${req.decision}`);
    }, 25);

    // Allow a few ticks to consume both pending entries.
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      if (seen.length >= 2 && readdirSync(queue.getPendingDir()).length === 0) {
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }

    handle.dispose();

    expect(seen.sort()).toEqual(['ns-poll-a:accepted', 'ns-poll-b:rejected']);
    expect(readdirSync(queue.getPendingDir())).toHaveLength(0);
    expect(readdirSync(queue.getResolvedDir())).toHaveLength(2);

    // After dispose, new pending entries are NOT consumed.
    await queue.writeApproval({ notificationId: 'ns-poll-c', decision: 'accepted' });
    await new Promise((r) => setTimeout(r, 100));
    expect(seen.find((s) => s.startsWith('ns-poll-c'))).toBeUndefined();
    expect(readdirSync(queue.getPendingDir())).toHaveLength(1);
  });
});
