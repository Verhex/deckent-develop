import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativePermissionInvocation, permittedNativePermissionLifetimes } from '../../../src/agent/native-permission-binding.js';
import type { PermissionRequestEvent } from '../../../src/agent/events.js';
import { resolveApprovalLifecyclePolicy } from '../../../src/core/approval-lifecycle-policy.js';
import { ApprovalBroker } from '../../../src/core/approval-broker.js';
import type { ApprovalTerminalDecisionAdapter } from '../../../src/cli/repl/approval-terminal-command.js';
import {
  createNativePermissionApprovalService,
  createNativePermissionIntentController,
} from '../../../src/cli/repl/native-permission-approval.js';

function event(): PermissionRequestEvent {
  return Object.freeze({
    type: 'permission-request', id: 'call-1', tool: 'deckent_bash', resource: 'npm test', tier: 'confirm',
    approval: Object.freeze({ scope: 'shell-exec', risk: 'medium', scopeId: 'deckent_bash', resource: 'npm test' }),
    maskedArgs: Object.freeze({ cmd: 'npm test' }),
    invocation: createNativePermissionInvocation({
      sessionId: 'session-1', sessionInstanceId: 'instance-1', turnGeneration: 1,
      invocationId: 'invocation-1', callId: 'call-1', tool: 'deckent_bash',
      rawArgs: { cmd: 'npm test' }, tier: 'confirm', elevated: false, nested: false,
    }),
  });
}

describe('native permission approval service', () => {
  it('selects intent before publishing and verifies the canonical decision', async () => {
    const controller = createNativePermissionIntentController();
    const submitted: unknown[] = [];
    const broker = {
      async submitLifecycle(request: unknown) { submitted.push(request); return request; },
      async awaitDecision(requestId: string) {
        return { requestId, decision: 'allow', decidedBy: 'operator', channel: 'terminal', decidedAt: new Date().toISOString() };
      },
    };
    let releaseVerification!: () => void;
    const verificationHeld = new Promise<void>((resolve) => { releaseVerification = resolve; });
    const adapter = { verifyCrossDecision: vi.fn(async (
      _request: Parameters<ApprovalTerminalDecisionAdapter['verifyCrossDecision']>[0],
      decision: Parameters<ApprovalTerminalDecisionAdapter['verifyCrossDecision']>[1],
      options: Parameters<ApprovalTerminalDecisionAdapter['verifyCrossDecision']>[2],
    ) => {
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      await verificationHeld;
      return { kind: 'trusted' as const, decision };
    }) } as unknown as ApprovalTerminalDecisionAdapter & { verifyCrossDecision: ReturnType<typeof vi.fn> };
    const decide = createNativePermissionApprovalService({
      broker: broker as never, decisionAdapter: adapter as never, intentController: controller,
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }), actorId: 'operator', tenantId: 'tenant-1',
      summary: (tool) => `summary:${tool}`, now: () => new Date('2026-09-07T20:00:00.000Z'),
    });
    const request = event();
    const pending = decide(request, request.approval, permittedNativePermissionLifetimes(request.invocation), request.maskedArgs, new AbortController().signal, () => true);
    expect(submitted).toHaveLength(0);
    expect(controller.choose('session')).toBe(true);
    await vi.waitFor(() => expect(adapter.verifyCrossDecision).toHaveBeenCalledOnce());
    releaseVerification();
    await expect(pending).resolves.toMatchObject({ decision: 'session', binding: { requestedLifetime: 'session' } });
    expect(submitted).toHaveLength(1);
    expect(adapter.verifyCrossDecision).toHaveBeenCalledOnce();
  });

  it('retires the local intent on abort without publishing a decision', async () => {
    const controller = createNativePermissionIntentController();
    const submitLifecycle = vi.fn();
    const decide = createNativePermissionApprovalService({
      broker: { submitLifecycle } as never, decisionAdapter: {} as never, intentController: controller,
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }), actorId: 'operator', tenantId: 'tenant-1',
      summary: () => 'summary',
    });
    const request = event();
    const abort = new AbortController();
    const pending = decide(request, request.approval, permittedNativePermissionLifetimes(request.invocation), request.maskedArgs, abort.signal, () => true);
    abort.abort();
    await expect(pending).resolves.toEqual({ decision: 'hold', reasonCode: 'NATIVE_PERMISSION_INTENT_CANCELLED' });
    expect(controller.current()).toBeNull();
    expect(submitLifecycle).not.toHaveBeenCalled();
  });

  it('keeps a published durable request pending while abort retires only its local view', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deckent-native-permission-'));
    try {
      const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
      const broker = new ApprovalBroker(root, { lifecycle });
      const controller = createNativePermissionIntentController();
      const retired: string[] = [];
      const decide = createNativePermissionApprovalService({
        broker,
        decisionAdapter: { verifyCrossDecision: vi.fn() } as never,
        intentController: controller,
        lifecycle,
        actorId: 'operator',
        tenantId: 'tenant-1',
        summary: () => 'summary',
        retireLocalRequest: (id) => retired.push(id),
      });
      const request = event();
      const abort = new AbortController();
      const pending = decide(
        request,
        request.approval,
        permittedNativePermissionLifetimes(request.invocation),
        request.maskedArgs,
        abort.signal,
        () => true,
      );
      expect(controller.choose('once')).toBe(true);
      await vi.waitFor(() => expect(broker.getRequest('invocation-1')).not.toBeNull());
      abort.abort();
      await expect(pending).resolves.toEqual({ decision: 'hold', reasonCode: 'NATIVE_PERMISSION_WAIT_CANCELLED' });
      expect(broker.getRequest('invocation-1')).not.toBeNull();
      expect(broker.getDecision('invocation-1')).toBeNull();
      expect(retired).toEqual(['invocation-1']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps an untrusted cross-channel decision as HOLD', async () => {
    const controller = createNativePermissionIntentController();
    const decide = createNativePermissionApprovalService({
      broker: {
        async submitLifecycle(request: unknown) { return request; },
        async awaitDecision(requestId: string) {
          return { requestId, decision: 'allow', decidedBy: 'forged', channel: 'terminal', decidedAt: new Date().toISOString() };
        },
      } as never,
      decisionAdapter: { verifyCrossDecision: vi.fn(async () => ({
        kind: 'untrusted', reasonCode: 'terminal-restoration-unconfirmed',
      })) } as never,
      intentController: controller,
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      actorId: 'operator', tenantId: 'tenant-1', summary: () => 'summary',
    });
    const request = event();
    const pending = decide(request, request.approval, permittedNativePermissionLifetimes(request.invocation), request.maskedArgs, new AbortController().signal, () => true);
    expect(controller.choose('once')).toBe(true);
    await expect(pending).resolves.toEqual({ decision: 'hold', reasonCode: 'terminal-restoration-unconfirmed' });
  });

  it.each(['expired', 'deferred', 'escalated'] as const)('maps trusted terminal disposition %s to a stable HOLD code', async (kind) => {
    const controller = createNativePermissionIntentController();
    const decide = createNativePermissionApprovalService({
      broker: {
        async submitLifecycle(request: unknown) { return request; },
        async awaitDecision(requestId: string) {
          return { requestId, decision: 'deny', decidedBy: 'system', channel: 'terminal', decidedAt: new Date().toISOString() };
        },
      } as never,
      decisionAdapter: { verifyCrossDecision: vi.fn(async (_request, decision) => ({ kind, decision })) } as never,
      intentController: controller,
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      actorId: 'operator', tenantId: 'tenant-1', summary: () => 'summary',
    });
    const request = event();
    const pending = decide(request, request.approval, permittedNativePermissionLifetimes(request.invocation), request.maskedArgs, new AbortController().signal, () => true);
    expect(controller.choose('once')).toBe(true);
    await expect(pending).resolves.toEqual({
      decision: 'hold', reasonCode: `NATIVE_PERMISSION_DECISION_${kind.toUpperCase()}`,
    });
  });

  it('does not release a late trusted decision after the turn was cancelled', async () => {
    const controller = createNativePermissionIntentController();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const verifyCrossDecision = vi.fn(async (
      _request: Parameters<ApprovalTerminalDecisionAdapter['verifyCrossDecision']>[0],
      decision: Parameters<ApprovalTerminalDecisionAdapter['verifyCrossDecision']>[1],
    ) => {
      await held;
      return { kind: 'trusted', decision };
    });
    const decide = createNativePermissionApprovalService({
      broker: {
        async submitLifecycle(request: unknown) { return request; },
        async awaitDecision(requestId: string) {
          return { requestId, decision: 'allow', decidedBy: 'operator', channel: 'terminal', decidedAt: new Date().toISOString() };
        },
      } as never,
      decisionAdapter: { verifyCrossDecision } as never,
      intentController: controller,
      lifecycle: resolveApprovalLifecyclePolicy({ enabled: true }),
      actorId: 'operator', tenantId: 'tenant-1', summary: () => 'summary',
    });
    const request = event();
    const abort = new AbortController();
    const pending = decide(request, request.approval, permittedNativePermissionLifetimes(request.invocation), request.maskedArgs, abort.signal, () => true);
    expect(controller.choose('once')).toBe(true);
    await vi.waitFor(() => expect(verifyCrossDecision).toHaveBeenCalledOnce());
    abort.abort();
    release();
    await expect(pending).resolves.toEqual({ decision: 'hold', reasonCode: 'NATIVE_PERMISSION_WAIT_CANCELLED' });
  });
});
