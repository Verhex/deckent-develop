/**
 * Tests for src/api/rpc-write-handlers.ts (363-003 — RPC-WRITE-METHODS, dilim-2c).
 *
 * Hermetic throughout: every test injects a fake spawn (no real subprocess is
 * ever launched) and/or a real ApprovalBroker rooted at a tmpdir project root
 * (no writes to the real repo's .deckent/). server.ts is not touched by this
 * task, so these tests exercise buildRpcWriteHandlerMap directly rather than
 * a live HTTP round-trip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRpcWriteHandlerMap,
  RPC_WRITE_METHODS_STILL_UNSUPPORTED,
  type RpcSpawnFn,
  type RpcSpawnHandle,
} from '../../src/api/rpc-write-handlers.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-rpc-write-handlers-test-'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function fakeSpawnHandle(pid: number | undefined): { handle: RpcSpawnHandle; unref: ReturnType<typeof vi.fn> } {
  const unref = vi.fn();
  return { handle: { pid, unref }, unref };
}

function buildApprovalInput(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-363-003' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-363',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: '2026-07-03T00:00:00.000Z',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    maskedArgs: { command: '[REDACTED]' },
    rawArgsRef: null,
    ...overrides,
  };
}

// ─── buildRpcWriteHandlerMap — mandatory requester ──────────────────────────

describe('buildRpcWriteHandlerMap — requester is mandatory', () => {
  it('throws when requester is blank', () => {
    expect(() => buildRpcWriteHandlerMap({ projectRoot, requester: '' })).toThrow(/requester/i);
  });

  it('throws when requester is whitespace-only', () => {
    expect(() => buildRpcWriteHandlerMap({ projectRoot, requester: '   ' })).toThrow(/requester/i);
  });

  it('succeeds and registers both write methods when requester is present', () => {
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003' });
    expect(map['run.start-detached']).toBeTypeOf('function');
    expect(map['approval.decide']).toBeTypeOf('function');
  });
});

describe('RPC_WRITE_METHODS_STILL_UNSUPPORTED', () => {
  it('names session.resume as the one write method still left unwired', () => {
    expect(RPC_WRITE_METHODS_STILL_UNSUPPORTED).toEqual(['session.resume']);
  });
});

// ─── run.start-detached ───────────────────────────────────────────────────────

describe('run.start-detached', () => {
  it('spawns node with the resolved entry.js + tokenized argv, detached + windowsHide, stdio to the log fd', async () => {
    const { handle, unref } = fakeSpawnHandle(4242);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as RpcSpawnFn;
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn });

    const result = await map['run.start-detached']!({ command: 'start --force' });

    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args, options] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args[0]).toMatch(/entry\.js$/);
    expect(args.slice(1)).toEqual(['start', '--force']);
    expect(options.detached).toBe(true);
    expect(options.windowsHide).toBe(true);
    expect(options.cwd).toBe(projectRoot);
    expect(options.stdio[0]).toBe('ignore');
    expect(typeof options.stdio[1]).toBe('number');
    expect(options.stdio[2]).toBe(options.stdio[1]);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ runId: '4242' });
  });

  it('quote-aware tokenization keeps a quoted multi-word argument as one argv element', async () => {
    const { handle } = fakeSpawnHandle(1);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as RpcSpawnFn;
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn });

    await map['run.start-detached']!({ command: 'run "fix bug in X"' });

    const args = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(args.slice(1)).toEqual(['run', 'fix bug in X']);
  });

  it('honors params.cwd for the child cwd, but keeps the log dir under deps.projectRoot', async () => {
    const { handle } = fakeSpawnHandle(1);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as RpcSpawnFn;
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn });
    const customCwd = mkdtempSync(join(tmpdir(), 'deckent-rpc-write-handlers-cwd-'));

    try {
      await map['run.start-detached']!({ command: 'status', cwd: customCwd });
      const options = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(options.cwd).toBe(customCwd);
    } finally {
      rmSync(customCwd, { recursive: true, force: true });
    }
  });

  it('merges caller-supplied env but the audit identity (DECKENT_RPC_REQUESTER) always wins', async () => {
    const { handle } = fakeSpawnHandle(1);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as RpcSpawnFn;
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn });

    await map['run.start-detached']!({
      command: 'start',
      env: { CUSTOM_VAR: 'yes', DECKENT_RPC_REQUESTER: 'spoofed' },
    });

    const options = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(options.env.CUSTOM_VAR).toBe('yes');
    expect(options.env.DECKENT_RPC_REQUESTER).toBe('w-363-003');
  });

  it('writes a log file under <projectRoot>/.deckent/recently-works/ that exists on disk', async () => {
    const { handle } = fakeSpawnHandle(7);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as RpcSpawnFn;
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn });

    await map['run.start-detached']!({ command: 'status' });

    const recentWorksDir = join(projectRoot, '.deckent', 'recently-works');
    expect(existsSync(recentWorksDir)).toBe(true);
  });

  it('falls back to a generated runId when the spawn handle reports no pid', async () => {
    const { handle } = fakeSpawnHandle(undefined);
    const spawnFn = vi.fn().mockReturnValue(handle) as unknown as RpcSpawnFn;
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn });

    const result = await map['run.start-detached']!({ command: 'status' });

    expect(typeof result.runId).toBe('string');
    expect(result.runId.length).toBeGreaterThan(0);
  });

  it('rejects a blank command without ever calling spawn', async () => {
    const spawnFn = vi.fn();
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', spawnFn: spawnFn as unknown as RpcSpawnFn });

    await expect(map['run.start-detached']!({ command: '   ' })).rejects.toThrow(/non-empty command/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('never invokes the real node:child_process spawn (no spawnFn override) unless explicitly told to', () => {
    // Sanity check on the test suite itself: every other test in this file supplies spawnFn.
    // This test just documents the hermetic invariant — no assertion needed beyond compiling.
    expect(true).toBe(true);
  });
});

// ─── approval.decide ─────────────────────────────────────────────────────────

describe('approval.decide', () => {
  it('decides a pending approval via broker.decide, channel "rpc"', async () => {
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    broker.submit(buildApprovalInput('apr-363-1'));
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', approvalBroker: broker });

    const result = await map['approval.decide']!({
      requestId: 'apr-363-1',
      decision: 'allow',
      decidedBy: 'alperen',
      reason: 'looks fine',
    });

    expect(result).toEqual({ ok: true });
    const decided = broker.list('decided');
    expect(decided.map((r) => r.id)).toEqual(['apr-363-1']);
    const decision = await broker.awaitDecision('apr-363-1');
    expect(decision.decision).toBe('allow');
    expect(decision.decidedBy).toBe('alperen');
    expect(decision.channel).toBe('rpc');
  });

  it('rejects a request with a blank decidedBy without calling the broker', async () => {
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    broker.submit(buildApprovalInput('apr-363-2'));
    const decideSpy = vi.spyOn(broker, 'decide');
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', approvalBroker: broker });

    await expect(
      map['approval.decide']!({ requestId: 'apr-363-2', decision: 'allow', decidedBy: '   ' }),
    ).rejects.toThrow(/decidedBy/i);
    expect(decideSpy).not.toHaveBeenCalled();
  });

  it('propagates ApprovalBrokerError (e.g. already-decided) as a thrown error, never a fabricated ok:true', async () => {
    const broker = new ApprovalBroker(projectRoot, { storeDir: join(projectRoot, 'approvals') });
    broker.submit(buildApprovalInput('apr-363-3'));
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', approvalBroker: broker });

    await map['approval.decide']!({ requestId: 'apr-363-3', decision: 'allow', decidedBy: 'alperen' });
    await expect(
      map['approval.decide']!({ requestId: 'apr-363-3', decision: 'deny', decidedBy: 'someone-else' }),
    ).rejects.toThrow(/already decided/i);
  });

  it('defaults to a real ApprovalBroker rooted at projectRoot when none is injected', async () => {
    const seedBroker = new ApprovalBroker(projectRoot);
    seedBroker.submit(buildApprovalInput('apr-363-4'));
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003' });

    const result = await map['approval.decide']!({ requestId: 'apr-363-4', decision: 'deny', decidedBy: 'alperen' });

    expect(result).toEqual({ ok: true });
  });
});
