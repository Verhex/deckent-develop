import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { validateApprovalRequest, type ApprovalDecision, type ApprovalRequest } from '../../../src/core/approval-contract.js';
import type { ApprovalAuthorityRuntimeOpenResult } from '../../../src/core/approval-authority-runtime.js';
import type {
  ApprovalAppliedLifecycleView,
  ApprovalTimeoutReceipt,
} from '../../../src/core/approval-store.js';
import {
  createApprovalTerminalCommand,
  pauseTerminalInputForHandoff,
} from '../../../src/cli/repl/approval-terminal-command.js';

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  const parsed = validateApprovalRequest({
    id: 'approval-command-1',
    requester: { role: 'worker', instanceId: 'worker-1' },
    summary: 'bounded test approval',
    details: {},
    scopeId: 'scope-1',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'tenant-a',
    userId: 'operator-a',
    createdAt: '2026-09-07T12:00:00.000Z',
    expiresAt: '2026-09-07T13:00:00.000Z',
    ...overrides,
  });
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.value;
}

function decision(req: ApprovalRequest, action: 'allow' | 'deny' = 'allow'): ApprovalDecision {
  return {
    requestId: req.id,
    decision: action,
    decidedBy: req.userId,
    channel: 'local-terminal',
    decidedAt: '2026-09-07T12:01:00.000Z',
    reason: '',
  };
}

function timeoutDecision(req: ApprovalRequest): ApprovalDecision {
  return {
    requestId: req.id,
    decision: 'deny',
    decidedBy: 'system:expiry',
    channel: 'ttl-expire',
    decidedAt: '2026-09-07T13:00:00.000Z',
    closureReason: 'expired',
  };
}

function timeoutReceipt(req: ApprovalRequest): ApprovalTimeoutReceipt {
  return {
    schemaVersion: 1,
    requestId: req.id,
    tenantId: req.tenantId,
    scopeId: req.scopeId,
    sourceReference: req.version === '2.0' ? req.source.reference : `approval-request:${req.id}`,
    origin: req.version === '2.0' ? req.origin : 'broker-native',
    lifecycleGeneration: req.version === '2.0' ? req.lifecycleGeneration : 'legacy-v1',
    actor: 'system:expiry',
    kind: 'timeout-disposition',
    action: 'deny',
    terminalState: 'EXPIRED',
    riskTier: req.version === '2.0' ? req.riskTier : 'critical',
    expiresAt: req.expiresAt,
    decidedAt: '2026-09-07T13:00:00.000Z',
    authoredPolicyDigest: req.version === '2.0' ? req.policySnapshotDigest : 'a'.repeat(64),
    appliedPolicyDigest: req.version === '2.0' ? req.policySnapshotDigest : 'a'.repeat(64),
    replayAllowed: false,
    accessGrantAllowed: false,
  };
}

function lifecycleRequest(): ApprovalRequest {
  const base = request({ id: 'approval-command-v2' });
  return {
    ...base,
    version: '2.0',
    origin: 'broker-native',
    riskTier: 'critical',
    blocking: 'request',
    lifecycleProfile: {
      ttlMs: 3_600_000,
      slaMs: [60_000, 120_000, 180_000],
      riskTier: 'critical',
      timeoutDisposition: 'deny-expire',
      blocking: 'request',
    },
    policySnapshotDigest: 'b'.repeat(64),
    source: {
      contractVersion: '2.0',
      requestDigest: 'c'.repeat(64),
      reference: 'approval-source:v2',
    },
    lifecycleGeneration: 'generation-2',
    slaStage: 'initial',
  };
}

function child(onSpawn?: () => void, close: { code: number | null; signal: NodeJS.Signals | null } = { code: 0, signal: null }): ChildProcess {
  const emitter = new EventEmitter() as ChildProcess;
  Object.assign(emitter, {
    kill: vi.fn(() => true),
    pid: 42,
  });
  queueMicrotask(() => {
    onSpawn?.();
    emitter.emit('close', close.code, close.signal);
  });
  return emitter;
}

function runtime(
  req: ApprovalRequest,
  currentDecision: () => ApprovalDecision | undefined,
  validation: { ok: true } | { ok: false; reason: 'missing-authorization' } = { ok: true },
  receipt: ApprovalTimeoutReceipt | null = null,
  lifecycle?: ApprovalAppliedLifecycleView,
): ApprovalAuthorityRuntimeOpenResult {
  return {
    state: 'ready',
    authorityEvidenceRef: 'approval-authority:test',
    service: {
      broker: {
        getRequest: (id: string) => id === req.id ? req : undefined,
        getDecision: (id: string) => id === req.id ? currentDecision() : undefined,
        getTimeoutReceipt: (id: string) => id === req.id ? receipt : null,
      },
      store: {
        load: () => ({
          pending: [],
          approved: [],
          denied: [],
          expired: [{ request: req, decision: currentDecision() ?? null, ...(lifecycle ? { lifecycle } : {}) }],
          quarantined: [],
        }),
      },
      decisionAuthority: { validate: () => validation },
      close: vi.fn(),
    },
  } as unknown as ApprovalAuthorityRuntimeOpenResult;
}

const suspend = async (callback: () => void | Promise<void>): Promise<void> => { await callback(); };
const pauseTerminalInput = async (): Promise<void> => {};

describe('createApprovalTerminalCommand', () => {
  it('lets the current readable callback unwind before crossing the public pause boundary', async () => {
    const input = new Readable({ read: () => {} });
    const order: string[] = [];
    let complete: (() => void) | undefined;
    const completed = new Promise<void>((resolve) => { complete = resolve; });
    input.once('pause', () => {
      order.push('pause-event');
      process.nextTick(() => order.push('pause-next-tick'));
    });
    const onReadable = (): void => {
      order.push('readable-callback');
      input.removeListener('readable', onReadable);
      void pauseTerminalInputForHandoff(input).then(() => {
        order.push('handoff-ready');
        complete?.();
      });
      order.push('readable-callback-return');
    };
    input.on('readable', onReadable);
    input.push('key');

    await completed;
    expect(order).toEqual([
      'readable-callback',
      'readable-callback-return',
      'pause-event',
      'pause-next-tick',
      'handoff-ready',
    ]);
    input.destroy();
  });

  it('runs only the fixed compiled approvals command and accepts only the fresh durable authorized match', async () => {
    const req = request();
    let durable: ApprovalDecision | undefined;
    const order: string[] = [];
    let completePause: (() => void) | undefined;
    const controlledPause = vi.fn(() => new Promise<void>((resolve) => {
      order.push('pause-start');
      completePause = () => {
        order.push('pause-complete');
        resolve();
      };
    }));
    const spawnProcess = vi.fn(() => {
      order.push('spawn');
      return child(() => {
        order.push('child-close');
        durable = decision(req);
      });
    });
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project',
      tenantId: 'tenant-a',
      entryPath: '/package/dist/cli/entry.js',
      execPath: '/node',
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      isInteractiveTerminal: () => true,
      openRuntime: () => runtime(req, () => durable),
      pauseTerminalInput: controlledPause,
      spawnProcess,
    });

    const outcome = adapter.decide(req, 'allow', async (callback) => {
      order.push('suspend-enter');
      await callback();
      order.push('suspend-exit');
    });
    await vi.waitFor(() => expect(controlledPause).toHaveBeenCalledOnce());
    expect(spawnProcess).not.toHaveBeenCalled();
    completePause?.();
    await expect(outcome).resolves.toMatchObject({
      kind: 'accepted', decision: { requestId: req.id, decision: 'allow' },
    });
    expect(order).toEqual(['suspend-enter', 'pause-start', 'pause-complete', 'spawn', 'child-close', 'suspend-exit']);
    expect(spawnProcess).toHaveBeenCalledExactlyOnceWith(
      '/node',
      ['/package/dist/cli/entry.js', 'approvals', 'decide', req.id, '--allow'],
      { cwd: '/project', stdio: 'inherit', windowsHide: false },
    );
  });

  it('fails closed before spawn without an inherited interactive TTY', async () => {
    const req = request();
    const spawnProcess = vi.fn();
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', isInteractiveTerminal: () => false, pauseTerminalInput, spawnProcess,
    });
    await expect(adapter.decide(req, 'deny', suspend)).resolves.toEqual({
      kind: 'hold', reasonCode: 'interactive-tty-unavailable',
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('reports nonzero-after-write as HOLD with the observed durable truth', async () => {
    const req = request();
    let durable: ApprovalDecision | undefined;
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => durable),
      pauseTerminalInput,
      spawnProcess: () => child(() => { durable = decision(req); }, { code: 1, signal: null }),
    });
    await expect(adapter.decide(req, 'allow', suspend)).resolves.toEqual({
      kind: 'hold',
      reasonCode: 'child-exit:1',
      observedDecision: {
        action: 'allow', channel: 'local-terminal', decidedBy: 'operator-a', decidedAt: '2026-09-07T12:01:00.000Z',
      },
    });
  });

  it('maps exit 130 to cancellation only without a durable winner', async () => {
    const req = request();
    const cancelled = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => undefined),
      pauseTerminalInput,
      spawnProcess: () => child(undefined, { code: 130, signal: null }),
    });
    await expect(cancelled.decide(req, 'allow', suspend)).resolves.toEqual({
      kind: 'cancelled', reasonCode: 'terminal-auth-cancelled',
    });

    let winner: ApprovalDecision | undefined;
    const spawnConflict = vi.fn(() => child(() => { winner = decision(req, 'deny'); }, { code: 130, signal: null }));
    const conflicted = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => winner),
      pauseTerminalInput,
      spawnProcess: spawnConflict,
    });
    await expect(conflicted.decide(req, 'allow', suspend)).resolves.toMatchObject({
      kind: 'hold',
      reasonCode: 'child-cancelled-after-durable-decision',
      observedDecision: { action: 'deny' },
    });
    expect(spawnConflict).toHaveBeenCalledOnce();
  });

  it('rejects unsafe positional ids and request digest drift without spawning', async () => {
    const req = request();
    const spawnProcess = vi.fn();
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', isInteractiveTerminal: () => true,
      openRuntime: () => runtime(request({ summary: 'different durable request' }), () => undefined),
      pauseTerminalInput,
      spawnProcess,
    });
    await expect(adapter.decide({ ...req, id: '--allow' }, 'allow', suspend)).resolves.toMatchObject({
      kind: 'untrusted', reasonCode: 'cli-request-id-unsafe',
    });
    await expect(adapter.decide(req, 'allow', suspend)).resolves.toMatchObject({
      kind: 'untrusted', reasonCode: 'request-identity-mismatch',
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('validates a cross-channel event against the exact durable row and authorization', async () => {
    const req = request();
    const durable = decision(req, 'deny');
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a',
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => durable),
      pauseTerminalInput,
    });
    await expect(adapter.verifyCrossDecision(req, durable)).resolves.toMatchObject({ kind: 'trusted' });
    await expect(adapter.verifyCrossDecision(req, { ...durable, channel: 'forged' })).resolves.toMatchObject({
      kind: 'untrusted', reasonCode: 'durable-decision-mismatch',
    });
    const unauthorized = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a',
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => durable, { ok: false, reason: 'missing-authorization' }),
      pauseTerminalInput,
    });
    await expect(unauthorized.verifyCrossDecision(req, durable)).resolves.toMatchObject({
      kind: 'untrusted', reasonCode: 'missing-authorization',
    });
  });

  it('accepts canonical expiry only with an exact request-bound timeout receipt', async () => {
    const req = lifecycleRequest();
    const durable = timeoutDecision(req);
    const receipt = timeoutReceipt(req);
    const lifecycle: ApprovalAppliedLifecycleView = {
      origin: req.version === '2.0' ? req.origin : 'broker-native',
      lifecycleGeneration: req.version === '2.0' ? req.lifecycleGeneration : 'legacy-v1',
      effectiveExpiresAt: req.expiresAt,
      riskTier: 'critical',
      authoredPolicyDigest: req.version === '2.0' ? req.policySnapshotDigest : receipt.authoredPolicyDigest,
      appliedPolicyDigest: receipt.appliedPolicyDigest,
      appliedProfile: req.version === '2.0' ? req.lifecycleProfile : {
        ttlMs: 3_600_000, slaMs: [60_000, 120_000, 180_000], riskTier: 'critical', timeoutDisposition: 'deny-expire', blocking: 'request',
      },
      policyTransitionChanged: false,
      weakeningIgnored: false,
    };
    const adapter = (candidate: ApprovalTimeoutReceipt) => createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a',
      now: () => new Date('2026-09-07T13:01:00.000Z'),
      openRuntime: () => runtime(req, () => durable, { ok: false, reason: 'missing-authorization' }, candidate, lifecycle),
      pauseTerminalInput,
    });

    await expect(adapter(receipt).verifyCrossDecision(req, durable)).resolves.toMatchObject({ kind: 'expired' });
    await expect(adapter({ ...receipt, expiresAt: '2026-09-07T12:59:59.000Z' }).verifyCrossDecision(req, durable))
      .resolves.toMatchObject({ kind: 'untrusted', reasonCode: 'missing-authorization' });
    await expect(adapter({ ...receipt, lifecycleGeneration: 'stale-generation' }).verifyCrossDecision(req, durable))
      .resolves.toMatchObject({ kind: 'untrusted', reasonCode: 'missing-authorization' });
    await expect(adapter({ ...receipt, action: 'fabricated' } as ApprovalTimeoutReceipt).verifyCrossDecision(req, durable))
      .resolves.toMatchObject({ kind: 'untrusted', reasonCode: 'missing-authorization' });
  });

  it('returns cancellation for a signalled child only when no durable decision exists', async () => {
    const req = request();
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => undefined),
      pauseTerminalInput,
      spawnProcess: () => child(undefined, { code: null, signal: 'SIGINT' }),
    });
    await expect(adapter.decide(req, 'deny', suspend)).resolves.toEqual({
      kind: 'cancelled', reasonCode: 'child-signal:SIGINT',
    });
    let durable: ApprovalDecision | undefined;
    const wroteThenSignalled = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => durable),
      pauseTerminalInput,
      spawnProcess: () => child(() => { durable = decision(req, 'deny'); }, { code: null, signal: 'SIGINT' }),
    });
    await expect(wroteThenSignalled.decide(req, 'deny', suspend)).resolves.toMatchObject({
      kind: 'hold',
      reasonCode: 'child-signal-after-durable-decision:SIGINT',
      observedDecision: { action: 'deny' },
    });
  });

  it('expires and reaps a child at the request deadline without claiming a decision', async () => {
    vi.useFakeTimers();
    try {
      let nowMs = Date.parse('2026-09-07T12:00:00.000Z');
      const req = request({
        createdAt: new Date(nowMs - 1_000).toISOString(),
        expiresAt: new Date(nowMs + 100).toISOString(),
      });
      const processHandle = new EventEmitter() as ChildProcess;
      const kill = vi.fn(() => {
        queueMicrotask(() => processHandle.emit('close', null, 'SIGTERM'));
        return true;
      });
      Object.assign(processHandle, { kill, pid: 43 });
      const adapter = createApprovalTerminalCommand({
        projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
        now: () => new Date(nowMs),
        openRuntime: () => runtime(req, () => undefined),
        pauseTerminalInput,
        spawnProcess: () => processHandle,
      });
      const outcome = adapter.decide(req, 'deny', suspend);
      nowMs += 101;
      await vi.advanceTimersByTimeAsync(101);
      await expect(outcome).resolves.toEqual({ kind: 'expired', reasonCode: 'request-expired' });
      expect(kill).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not treat a long-lived request as expired by Node timer overflow', async () => {
    const req = request({ expiresAt: '2099-09-07T13:00:00.000Z' });
    let durable: ApprovalDecision | undefined;
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => durable),
      pauseTerminalInput,
      spawnProcess: () => child(() => { durable = decision(req); }),
    });
    await expect(adapter.decide(req, 'allow', suspend)).resolves.toMatchObject({ kind: 'accepted' });
  });

  it('does not spawn when the suspended terminal input cannot reach the pause boundary', async () => {
    const req = request();
    const spawnProcess = vi.fn();
    const adapter = createApprovalTerminalCommand({
      projectRoot: '/project', tenantId: 'tenant-a', entryPath: '/entry.js', isInteractiveTerminal: () => true,
      now: () => new Date('2026-09-07T12:02:00.000Z'),
      openRuntime: () => runtime(req, () => undefined),
      pauseTerminalInput: async () => { throw new Error('pause failed'); },
      spawnProcess,
    });
    await expect(adapter.decide(req, 'allow', suspend)).resolves.toEqual({
      kind: 'hold', reasonCode: 'terminal-suspension-failed:Error',
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});
