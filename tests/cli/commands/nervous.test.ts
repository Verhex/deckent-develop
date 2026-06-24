// tests/cli/commands/nervous.test.ts
//
// Unit tests for `deckent nervous edit` IPC-gate serialization.
// Covers:
//   - race-repro: two concurrent edit calls when poller alive → both routed via IPC (not direct)
//   - IPC routing when executor is alive (no direct pending/history write)
//   - direct-write fallback when no poller (no IPC write)
//   - not-found returns exitCode=1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { NervousNotification } from '../../../src/core/nervous-types.js';
import { NERVOUS_PENDING_FILE, NERVOUS_HISTORY_FILE, NERVOUS_IPC_DIR, NERVOUS_DIR } from '../../../src/core/constants.js';

// ─── Hermetic tmpdir helpers ─────────────────────────────────────────────────

function createTmpRoot(): string {
  const root = join(tmpdir(), `nervous-edit-test-${randomUUID().slice(0, 8)}`);
  mkdirSync(join(root, NERVOUS_DIR), { recursive: true });
  return root;
}

function makePendingNotification(id: string): NervousNotification {
  return {
    id,
    shortCode: id.slice(0, 4),
    detectorId: 'test-detector',
    severity: 'info',
    message: 'test notification',
    actions: [{ id: `action-${id}`, type: 'suggest', description: 'do something' }],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    acknowledged: false,
  };
}

function writePending(root: string, notifications: NervousNotification[]): void {
  const path = join(root, NERVOUS_PENDING_FILE);
  writeFileSync(path, JSON.stringify(notifications, null, 2), 'utf-8');
}

function readPending(root: string): NervousNotification[] {
  const path = join(root, NERVOUS_PENDING_FILE);
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf-8')) as NervousNotification[];
}

function readIpcPending(root: string): string[] {
  const dir = join(root, NERVOUS_IPC_DIR, 'pending');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json'));
}

function readHistory(root: string): string[] {
  const path = join(root, NERVOUS_HISTORY_FILE);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(Boolean);
}

function writeHeartbeat(root: string, ts?: number): void {
  const dir = join(root, NERVOUS_IPC_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'heartbeat'), String(ts ?? Date.now()), 'utf-8');
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/nervous/observer.js', () => ({
  getActiveDirectivesProtection: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/cli/commands/config-nervous.js', () => ({
  handleEnableNervous: vi.fn(),
}));

vi.mock('../../../src/nervous/recommendation-log.js', () => ({
  readRecommendations: vi.fn().mockReturnValue([]),
  dismissRecommendation: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock'),
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { print, printError } from '../../../src/cli/helpers/output.js';
import { resolveProjectRoot } from '../../../src/cli/helpers/process.js';
import { registerNervous } from '../../../src/cli/commands/nervous.js';
import { Command } from 'commander';

// ─── Test Runner ─────────────────────────────────────────────────────────────

async function runEdit(root: string, id: string): Promise<void> {
  vi.mocked(resolveProjectRoot).mockReturnValue(root);
  const program = new Command();
  program.exitOverride();
  registerNervous(program);
  try {
    await program.parseAsync(['node', 'test', 'nervous', 'edit', id]);
  } catch {
    // Commander exitOverride throws — swallow
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('nervous edit — IPC-gate serialization (two-writer race fix)', () => {
  let root: string;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    root = createTmpRoot();
  });

  afterEach(() => {
    process.exitCode = undefined;
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // ── not-found ──────────────────────────────────────────────────────────────

  it('sets exitCode=1 and calls printError when id is not found', async () => {
    writePending(root, []);
    await runEdit(root, 'nonexistent-id');
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  // ── direct-write fallback (no live executor) ────────────────────────────────

  it('writes to pending + history directly when no live executor', async () => {
    const notif = makePendingNotification('n-001');
    writePending(root, [notif]);
    // No heartbeat → isNervousPollerAlive returns false

    await runEdit(root, 'n-001');

    // pending.json should be empty (notification removed)
    const remaining = readPending(root);
    expect(remaining).toHaveLength(0);

    // history should have one entry
    const history = readHistory(root);
    expect(history).toHaveLength(1);
    const record = JSON.parse(history[0]!);
    expect(record.decision).toBe('accepted');
    expect(record.payload.modified).toBe(true);

    // IPC pending dir should be untouched
    expect(readIpcPending(root)).toHaveLength(0);
  });

  // ── IPC routing when executor alive ────────────────────────────────────────

  it('routes through NervousIpcQueue when poller is alive (does NOT write pending/history)', async () => {
    const notif = makePendingNotification('n-002');
    writePending(root, [notif]);
    writeHeartbeat(root); // fresh heartbeat → poller alive

    await runEdit(root, 'n-002');

    // pending.json must NOT be touched (single-writer: executor owns it)
    const remaining = readPending(root);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe('n-002');

    // history must NOT be written by CLI
    expect(readHistory(root)).toHaveLength(0);

    // IPC pending dir must have exactly one approval file
    const ipcFiles = readIpcPending(root);
    expect(ipcFiles).toHaveLength(1);

    // The IPC file should carry decision=accepted + modifiedPayload
    const ipcPath = join(root, NERVOUS_IPC_DIR, 'pending', ipcFiles[0]!);
    const ipcReq = JSON.parse(readFileSync(ipcPath, 'utf-8'));
    expect(ipcReq.decision).toBe('accepted');
    expect(ipcReq.notificationId).toBe('n-002');
    expect(ipcReq.modifiedPayload?.modified).toBe(true);
  });

  // ── race-repro: two concurrent edits when executor alive ───────────────────
  //
  // PRE-FIX behaviour (red): two concurrent handleEdit calls would each read
  // pending, splice, and write back → one splice is lost (last-writer-wins tear).
  //
  // POST-FIX behaviour (green): both calls route to NervousIpcQueue.writeApproval,
  // which uses unique filenames → two IPC files written, pending.json untouched.

  it('race-repro: two concurrent edits with live poller produce 2 IPC files, not a torn pending write', async () => {
    const n1 = makePendingNotification('race-001');
    const n2 = makePendingNotification('race-002');
    writePending(root, [n1, n2]);
    writeHeartbeat(root); // fresh heartbeat

    // Fire both concurrently — same as two simultaneous CLI invocations
    await Promise.all([
      runEdit(root, 'race-001'),
      runEdit(root, 'race-002'),
    ]);

    // pending.json must still have BOTH notifications (executor owns it)
    const remaining = readPending(root);
    expect(remaining).toHaveLength(2);

    // No history entries written by CLI
    expect(readHistory(root)).toHaveLength(0);

    // Two separate IPC approval files, one per edit
    const ipcFiles = readIpcPending(root);
    expect(ipcFiles).toHaveLength(2);

    const requests = ipcFiles.map(f =>
      JSON.parse(readFileSync(join(root, NERVOUS_IPC_DIR, 'pending', f), 'utf-8'))
    );
    const ids = requests.map((r: { notificationId: string }) => r.notificationId).sort();
    expect(ids).toEqual(['race-001', 'race-002']);
    for (const req of requests) {
      expect(req.decision).toBe('accepted');
      expect(req.modifiedPayload?.modified).toBe(true);
    }
  });

  // ── stale heartbeat falls back to direct-write ──────────────────────────────

  it('falls back to direct-write when heartbeat is stale (>5s old)', async () => {
    const notif = makePendingNotification('n-003');
    writePending(root, [notif]);
    // Write a stale heartbeat (6 seconds ago)
    writeHeartbeat(root, Date.now() - 6000);

    await runEdit(root, 'n-003');

    // Should have written directly
    const remaining = readPending(root);
    expect(remaining).toHaveLength(0);
    expect(readHistory(root)).toHaveLength(1);
    expect(readIpcPending(root)).toHaveLength(0);
  });
});
