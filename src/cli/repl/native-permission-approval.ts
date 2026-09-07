import type { NativePermissionInvocation, NativePermissionLifetime } from '../../agent/native-permission-binding.js';
import { bindNativePermissionIntent, permittedNativePermissionLifetimes } from '../../agent/native-permission-binding.js';
import type { PermissionRequestEvent } from '../../agent/events.js';
import type { PermissionResponse } from '../../agent/loop.js';
import type { NativeToolApprovalClassification } from '../../agent/tools/types.js';
import type { ApprovalBroker } from '../../core/approval-broker.js';
import type { ApprovalTerminalDecisionAdapter } from './approval-terminal-command.js';
import { approvalLifecycleProfileDigest, resolveEffectiveApprovalRiskTier } from '../../core/approval-lifecycle-policy.js';
import type { ResolvedApprovalLifecycleConfig } from '../../core/config-types.js';
import { isApprovalFileAclHold } from '../../core/approval-file-cas.js';
import { redactSensitive } from '../../core/redact-sensitive.js';

export interface NativePermissionIntent {
  readonly invocation: NativePermissionInvocation;
  readonly tool: string;
  readonly resource: string;
  readonly actorId: string;
  readonly lifetimes: readonly NativePermissionLifetime[];
}

export interface NativePermissionApprovalServiceOptions {
  readonly broker: ApprovalBroker;
  readonly decisionAdapter: ApprovalTerminalDecisionAdapter;
  readonly intentController: NativePermissionIntentController;
  readonly lifecycle: ResolvedApprovalLifecycleConfig;
  readonly actorId: string;
  readonly tenantId: string;
  readonly summary: (tool: string) => string;
  readonly retireLocalRequest?: (requestId: string) => void;
  readonly now?: () => Date;
  readonly id?: () => string;
}

export function createNativePermissionApprovalService(options: NativePermissionApprovalServiceOptions) {
  return async function decide(
    request: PermissionRequestEvent,
    classification: NativeToolApprovalClassification,
    lifetimes: readonly NativePermissionLifetime[],
    maskedArgs: Readonly<Record<string, unknown>> | null,
    signal: AbortSignal,
    validateRequest: (request: PermissionRequestEvent) => boolean,
  ): Promise<PermissionResponse> {
    const canonicalLifetimes = permittedNativePermissionLifetimes(request.invocation);
    const classificationMatches = classification.scope === request.approval.scope
      && classification.risk === request.approval.risk
      && classification.scopeId === request.approval.scopeId
      && classification.resource === request.approval.resource
      && classification.resource === request.resource;
    if (signal.aborted || !validateRequest(request) || !classificationMatches
      || lifetimes.length !== canonicalLifetimes.length
      || lifetimes.some((lifetime, index) => lifetime !== canonicalLifetimes[index])) {
      return { decision: 'hold', reasonCode: 'NATIVE_PERMISSION_STALE' };
    }
    const intentPromise = options.intentController.request({
      invocation: request.invocation,
      tool: request.tool,
      resource: redactSensitive(classification.resource),
      actorId: options.actorId,
      lifetimes,
    });
    const intent = await new Promise<NativePermissionIntentResult>((resolve) => {
      const abort = () => {
        options.intentController.cancel();
        resolve({ kind: 'cancelled', reasonCode: 'NATIVE_PERMISSION_INTENT_CANCELLED' });
      };
      signal.addEventListener('abort', abort, { once: true });
      void intentPromise.then((result) => {
        signal.removeEventListener('abort', abort);
        resolve(result);
      });
      if (signal.aborted) abort();
    });
    if (intent.kind === 'cancelled' || signal.aborted || !validateRequest(request)) {
      return { decision: 'hold', reasonCode: 'NATIVE_PERMISSION_INTENT_CANCELLED' };
    }
    const binding = bindNativePermissionIntent(request.invocation, intent.lifetime, request.resource);
    const createdAt = options.now?.() ?? new Date();
    const profile = options.lifecycle.profiles['broker-native'];
    const riskTier = resolveEffectiveApprovalRiskTier({
      origin: 'broker-native',
      producerRisk: classification.risk,
      policy: options.lifecycle,
    });
    const approvalRequest = {
      id: options.id?.() ?? request.invocation.invocationId,
      version: '2.0' as const,
      requester: { role: 'worker' as const, instanceId: request.invocation.sessionInstanceId },
      summary: options.summary(request.tool),
      details: { nativePermission: binding },
      scopeId: classification.scopeId,
      scope: classification.scope,
      risk: classification.risk,
      policy: 'require-approval' as const,
      defaultAction: 'deny' as const,
      tenantId: options.tenantId,
      userId: options.actorId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + profile.ttlMs).toISOString(),
      maskedArgs: maskedArgs === null ? null : { ...maskedArgs },
      rawArgsRef: null,
      origin: 'broker-native' as const,
      riskTier,
      blocking: profile.blocking,
      lifecycleProfile: profile,
      policySnapshotDigest: approvalLifecycleProfileDigest('broker-native', profile),
      source: {
        contractVersion: '2.0' as const,
        requestDigest: request.invocation.invocationArgsDigest,
        reference: `native-permission:${request.invocation.invocationId}`,
      },
      lifecycleGeneration: `${request.invocation.sessionInstanceId}:${request.invocation.turnGeneration}`,
      slaStage: 'initial' as const,
    };
    const published = await options.broker.submitLifecycle(approvalRequest);
    if (isApprovalFileAclHold(published)) return { decision: 'hold', reasonCode: published.reasonCode };
    try {
      const decision = await options.broker.awaitDecision(published.id, { signal });
      if (signal.aborted) return { decision: 'hold', reasonCode: 'NATIVE_PERMISSION_WAIT_CANCELLED' };
      if (!validateRequest(request)) return { decision: 'hold', reasonCode: 'NATIVE_PERMISSION_STALE' };
      const verified = await options.decisionAdapter.verifyCrossDecision(published, decision, { signal });
      if (signal.aborted) return { decision: 'hold', reasonCode: 'NATIVE_PERMISSION_WAIT_CANCELLED' };
      if (!validateRequest(request)) return { decision: 'hold', reasonCode: 'NATIVE_PERMISSION_STALE' };
      if (verified.kind !== 'trusted') return {
        decision: 'hold',
        reasonCode: verified.kind === 'untrusted'
          ? verified.reasonCode
          : `NATIVE_PERMISSION_DECISION_${verified.kind.toUpperCase()}`,
      };
      return verified.decision.decision === 'allow'
        ? { decision: intent.lifetime, binding }
        : { decision: 'deny', binding };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        options.retireLocalRequest?.(published.id);
      }
      return { decision: 'hold', reasonCode: error instanceof DOMException && error.name === 'AbortError'
        ? 'NATIVE_PERMISSION_WAIT_CANCELLED'
        : 'NATIVE_PERMISSION_DECISION_UNAVAILABLE' };
    }
  };
}
export type NativePermissionIntentResult =
  | { readonly kind: 'selected'; readonly lifetime: NativePermissionLifetime }
  | { readonly kind: 'cancelled'; readonly reasonCode: 'NATIVE_PERMISSION_INTENT_CANCELLED' };
export interface NativePermissionIntentController {
  request(intent: NativePermissionIntent): Promise<NativePermissionIntentResult>;
  current(): NativePermissionIntent | null;
  choose(lifetime: NativePermissionLifetime): boolean;
  cancel(): boolean;
  subscribe(listener: (intent: NativePermissionIntent | null) => void): () => void;
}

export function createNativePermissionIntentController(): NativePermissionIntentController {
  let active: { intent: NativePermissionIntent; resolve: (result: NativePermissionIntentResult) => void } | undefined;
  const listeners = new Set<(intent: NativePermissionIntent | null) => void>();
  const publish = (): void => { for (const listener of listeners) listener(active?.intent ?? null); };
  const settle = (result: NativePermissionIntentResult): boolean => {
    const pending = active;
    if (!pending) return false;
    active = undefined;
    pending.resolve(result);
    publish();
    return true;
  };
  return {
    request(intent) {
      if (active) return Promise.resolve({ kind: 'cancelled', reasonCode: 'NATIVE_PERMISSION_INTENT_CANCELLED' });
      return new Promise((resolve) => {
        active = { intent: Object.freeze({ ...intent, lifetimes: Object.freeze([...intent.lifetimes]) }), resolve };
        publish();
      });
    },
    current: () => active?.intent ?? null,
    choose: (lifetime) => active?.intent.lifetimes.includes(lifetime) === true
      && settle({ kind: 'selected', lifetime }),
    cancel: () => settle({ kind: 'cancelled', reasonCode: 'NATIVE_PERMISSION_INTENT_CANCELLED' }),
    subscribe(listener) {
      listeners.add(listener);
      listener(active?.intent ?? null);
      return () => { listeners.delete(listener); };
    },
  };
}
