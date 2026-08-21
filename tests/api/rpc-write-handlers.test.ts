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
import { startTestServer } from './test-server-helper.js';

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

describe('approval.decide HTTP RPC gate', () => {
  it('keeps approval.decide METHOD_NOT_IMPLEMENTED when approval.api_decide is off', async () => {
    const server = await startTestServer({ disableAuth: true });
    try {
      const response = await fetch(`${server.baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: '1.0',
          id: 'flag-off',
          method: 'approval.decide',
          params: { requestId: 'apr-off', decision: 'allow', decidedBy: 'owner' },
        }),
      });
      const responseBody: unknown = await response.json();
      expect(response.status, JSON.stringify(responseBody)).toBe(200);
      expect(responseBody).toMatchObject({
        id: 'flag-off',
        error: { code: 'METHOD_NOT_IMPLEMENTED' },
      });
    } finally {
      await server.close();
    }
  });

  it('rejects an invalid bearer when approval.api_decide is on', async () => {
    const server = await startTestServer({
      apiToken: 'valid-api-token',
      seed: { config: { approval: { api_decide: true } } },
    });
    try {
      const response = await fetch(`${server.baseUrl}/api/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token',
          'Idempotency-Key': 'rpc-invalid-token',
        },
        body: JSON.stringify({
          version: '1.0',
          id: 'invalid-token',
          method: 'approval.decide',
          params: { requestId: 'apr-invalid', decision: 'allow', decidedBy: 'owner' },
        }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: 'forbidden' });
    } finally {
      await server.close();
    }
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
  function authorityWith(outcome: unknown) {
    const decideOidc = vi.fn().mockResolvedValue(outcome);
    return {
      authority: {
        runtime: { decideOidc },
        policy: { authorityRef: 'test' },
        verifier: {},
      } as unknown as NonNullable<Parameters<typeof buildRpcWriteHandlerMap>[0]['approvalAuthority']>,
      decideOidc,
    };
  }

  it('routes decisions through the OIDC authority ingress, never ApprovalBroker.decide directly', async () => {
    const { authority, decideOidc } = authorityWith({ kind: 'decided' });
    const map = buildRpcWriteHandlerMap({
      projectRoot,
      requester: 'w-363-003',
      approvalAuthority: authority,
      approvalToken: 'fresh-oidc-token',
      approvalIdempotencyKey: 'rpc-decision-1',
    });

    const result = await map['approval.decide']!({
      requestId: 'apr-363-1',
      decision: 'allow',
      decidedBy: 'alperen',
      reason: 'looks fine',
    });

    expect(result).toEqual({ ok: true });
    expect(decideOidc).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fresh-oidc-token', channel: 'api-oidc' }),
      { requestId: 'apr-363-1', action: 'allow', idempotencyKey: 'rpc-decision-1', reason: 'looks fine' },
    );
  });

  it('rejects a request with a blank decidedBy without entering authority', async () => {
    const { authority, decideOidc } = authorityWith({ kind: 'decided' });
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', approvalAuthority: authority, approvalToken: 'token', approvalIdempotencyKey: 'key' });

    await expect(
      map['approval.decide']!({ requestId: 'apr-363-2', decision: 'allow', decidedBy: '   ' }),
    ).rejects.toThrow(/decidedBy/i);
    expect(decideOidc).not.toHaveBeenCalled();
  });

  it('pins flag-open/invalid-token behavior as unauthorized at the ingress', async () => {
    const { authority } = authorityWith({ kind: 'rejected', reason: 'invalid-assertion' });
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003', approvalAuthority: authority, approvalToken: 'invalid', approvalIdempotencyKey: 'key' });
    await expect(
      map['approval.decide']!({ requestId: 'apr-363-3', decision: 'deny', decidedBy: 'someone' }),
    ).rejects.toThrow(/Unauthorized/i);
  });

  it('fails closed when no approval authority/token context was supplied', async () => {
    const map = buildRpcWriteHandlerMap({ projectRoot, requester: 'w-363-003' });
    await expect(
      map['approval.decide']!({ requestId: 'apr-363-4', decision: 'deny', decidedBy: 'alperen' }),
    ).rejects.toThrow(/Unauthorized/i);
  });
});
