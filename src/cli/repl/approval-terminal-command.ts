import { spawn, type ChildProcess } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  openApprovalAuthorityRuntime,
  type ApprovalAuthorityRuntimeOpenResult,
} from '../../core/approval-authority-runtime.js';
import {
  approvalRequestDigest,
} from '../../core/approval-decision-ingress.js';
import type {
  ApprovalAppliedLifecycleView,
  ApprovalTimeoutReceipt,
} from '../../core/approval-store.js';
import type {
  ApprovalAction,
  ApprovalDecision,
  ApprovalRequest,
} from '../../core/approval-contract.js';
import { approvalLookupIdSchema } from '../../core/approval-contract.js';

export type ApprovalTerminalFailureKind = 'hold' | 'expired' | 'cancelled' | 'untrusted';

export interface ApprovalTerminalObservedDecision {
  readonly action: ApprovalAction;
  readonly channel: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
}

export type ApprovalTerminalDecisionResult =
  | { readonly kind: 'accepted'; readonly decision: ApprovalDecision }
  | {
    readonly kind: ApprovalTerminalFailureKind;
    readonly reasonCode: string;
    readonly observedDecision?: ApprovalTerminalObservedDecision;
  };

export type ApprovalTerminalCrossDecisionResult =
  | { readonly kind: 'trusted'; readonly decision: ApprovalDecision }
  | { readonly kind: 'expired'; readonly decision: ApprovalDecision }
  | { readonly kind: 'deferred'; readonly decision: ApprovalDecision }
  | { readonly kind: 'escalated'; readonly decision: ApprovalDecision }
  | { readonly kind: 'untrusted'; readonly reasonCode: string; readonly decision?: ApprovalDecision };

/** Ink's public callback-form `suspendTerminal` surface, kept Ink-free here. */
export type ApprovalTerminalSuspender = (callback: () => void | Promise<void>) => Promise<void>;

export interface ApprovalTerminalDecisionAdapter {
  decide(
    request: ApprovalRequest,
    action: 'allow' | 'deny',
    suspendTerminal: ApprovalTerminalSuspender,
  ): Promise<ApprovalTerminalDecisionResult>;
  verifyCrossDecision(
    request: ApprovalRequest,
    decision: ApprovalDecision,
  ): Promise<ApprovalTerminalCrossDecisionResult>;
}

interface SpawnOptions {
  readonly cwd: string;
  readonly stdio: 'inherit';
  readonly windowsHide: boolean;
}

export interface ApprovalTerminalCommandOptions {
  readonly projectRoot: string;
  readonly tenantId: string;
  readonly entryPath?: string;
  readonly execPath?: string;
  readonly isInteractiveTerminal?: () => boolean;
  readonly now?: () => Date;
  readonly openRuntime?: (input: {
    projectRoot: string;
    tenantId: string;
  }) => ApprovalAuthorityRuntimeOpenResult;
  readonly pauseTerminalInput?: () => Promise<void>;
  readonly spawnProcess?: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess;
}

interface ChildOutcome {
  readonly kind: 'exit' | 'error' | 'expired' | 'unreaped';
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly errorName?: string;
}

interface AuthoritySnapshot {
  readonly request: ApprovalRequest;
  readonly decision?: ApprovalDecision;
}

type SnapshotResult =
  | { readonly kind: 'ok'; readonly snapshot: AuthoritySnapshot }
  | { readonly kind: 'hold' | 'expired' | 'untrusted'; readonly reasonCode: string; readonly decision?: ApprovalDecision };

const CHILD_REAP_GRACE_MS = 1_000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const APPROVAL_CANCELLED_EXIT_CODE = 130;

function observed(decision: ApprovalDecision | undefined): ApprovalTerminalObservedDecision | undefined {
  return decision && {
    action: decision.decision,
    channel: decision.channel,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
  };
}

function defaultEntryPath(): string {
  return fileURLToPath(new URL('../entry.js', import.meta.url));
}

/**
 * Finish Ink's current readable callback and listener-removal bookkeeping,
 * then cross Node's public stdin pause boundary before a child inherits the
 * terminal. Ink remains the sole owner of resuming input after suspension.
 */
export async function pauseTerminalInputForHandoff(
  input: Pick<NodeJS.ReadStream, 'pause'>,
): Promise<void> {
  await new Promise<void>((resolve) => process.nextTick(resolve));
  input.pause();
  await new Promise<void>((resolve) => process.nextTick(resolve));
}

function waitForChild(child: ChildProcess, expiresAt: string, now: () => Date): Promise<ChildOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let expired = false;
    let errorName: string | undefined;
    let expiryTimer: NodeJS.Timeout | undefined;
    let reapTimer: NodeJS.Timeout | undefined;
    let finalReapTimer: NodeJS.Timeout | undefined;
    const finish = (outcome: ChildOutcome): void => {
      if (settled) return;
      settled = true;
      if (expiryTimer) clearTimeout(expiryTimer);
      if (reapTimer) clearTimeout(reapTimer);
      if (finalReapTimer) clearTimeout(finalReapTimer);
      if (expired) {
        resolve({ kind: 'expired', code: outcome.code, signal: outcome.signal });
      } else if (errorName) {
        resolve({ kind: 'error', code: outcome.code, signal: outcome.signal, errorName });
      } else {
        resolve(outcome);
      }
    };
    const terminateExpiredChild = (): void => {
      if (settled || expired) return;
      expired = true;
      try { child.kill(); } catch { /* finite hard-kill path below */ }
      reapTimer = setTimeout(() => {
        if (settled) return;
        try { child.kill('SIGKILL'); } catch { /* typed unreaped outcome below */ }
        finalReapTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({ kind: 'unreaped', code: null, signal: null });
        }, CHILD_REAP_GRACE_MS);
        finalReapTimer.unref?.();
      }, CHILD_REAP_GRACE_MS);
      reapTimer.unref?.();
    };
    const scheduleExpiry = (): void => {
      const remainingMs = Date.parse(expiresAt) - now().getTime();
      if (remainingMs <= 0) {
        terminateExpiredChild();
        return;
      }
      expiryTimer = setTimeout(scheduleExpiry, Math.min(remainingMs, MAX_TIMER_DELAY_MS));
      expiryTimer.unref?.();
    };
    child.once('error', (error) => {
      errorName = error.name;
      // Spawn failures normally emit `close` next. Bound the exceptional
      // adapter that reports `error` without ever reporting process closure.
      reapTimer = setTimeout(() => finish({ kind: 'error', code: null, signal: null, errorName }), CHILD_REAP_GRACE_MS);
      reapTimer.unref?.();
    });
    child.once('close', (code, signal) => finish({ kind: 'exit', code, signal }));
    scheduleExpiry();
  });
}

function timeoutReceiptDecision(receipt: ApprovalTimeoutReceipt): ApprovalAction | null {
  if (receipt.action === 'proceed-warn') return 'allow';
  if (receipt.action === 'deny') return 'deny';
  if (receipt.action === 'park') return 'defer';
  return null;
}

function isBoundSystemExpiry(
  request: ApprovalRequest,
  decision: ApprovalDecision,
  receipt: ApprovalTimeoutReceipt | null,
  lifecycle: ApprovalAppliedLifecycleView | undefined,
): boolean {
  const sourceReference = request.version === '2.0'
    ? request.source.reference
    : `approval-request:${request.id}`;
  const receiptDecision = receipt === null ? null : timeoutReceiptDecision(receipt);
  const lifecycleMatches = request.version === '2.0'
    ? lifecycle !== undefined
      && receipt?.origin === lifecycle.origin
      && receipt.lifecycleGeneration === lifecycle.lifecycleGeneration
      && receipt.riskTier === lifecycle.riskTier
      && receipt.expiresAt === lifecycle.effectiveExpiresAt
      && receipt.authoredPolicyDigest === lifecycle.authoredPolicyDigest
      && receipt.appliedPolicyDigest === lifecycle.appliedPolicyDigest
    : lifecycle === undefined
      && receipt?.origin === 'broker-native'
      && receipt.lifecycleGeneration === 'legacy-v1'
      && receipt.expiresAt === request.expiresAt;
  return receipt !== null
    && lifecycleMatches
    && decision.channel === 'ttl-expire'
    && decision.decidedBy === 'system:expiry'
    && decision.closureReason === 'expired'
    && decision.requestId === request.id
    && receiptDecision !== null
    && decision.decision === receiptDecision
    && decision.decidedAt === receipt.decidedAt
    && receipt.schemaVersion === 1
    && receipt.requestId === request.id
    && receipt.tenantId === request.tenantId
    && receipt.scopeId === request.scopeId
    && receipt.sourceReference === sourceReference
    && receipt.actor === 'system:expiry'
    && receipt.kind === 'timeout-disposition'
    && (receipt.terminalState === 'UNDECIDABLE' || receipt.terminalState === 'EXPIRED')
    && (receipt.riskTier === 'routine' || receipt.riskTier === 'elevated' || receipt.riskTier === 'critical')
    && /^[a-f0-9]{64}$/u.test(receipt.authoredPolicyDigest)
    && /^[a-f0-9]{64}$/u.test(receipt.appliedPolicyDigest)
    && receipt.replayAllowed === false
    && receipt.accessGrantAllowed === false
    && Number.isFinite(Date.parse(receipt.expiresAt))
    && Number.isFinite(Date.parse(receipt.decidedAt))
    && Date.parse(receipt.expiresAt) <= Date.parse(receipt.decidedAt);
}

export function createApprovalTerminalCommand(
  options: ApprovalTerminalCommandOptions,
): ApprovalTerminalDecisionAdapter {
  const now = options.now ?? (() => new Date());
  const openRuntime = options.openRuntime ?? openApprovalAuthorityRuntime;
  const spawnProcess = options.spawnProcess
    ?? ((command, args, spawnOptions) => spawn(command, [...args], spawnOptions));
  const isInteractiveTerminal = options.isInteractiveTerminal
    ?? (() => process.stdin.isTTY === true && process.stdout.isTTY === true);
  const pauseTerminalInput = options.pauseTerminalInput
    ?? (() => pauseTerminalInputForHandoff(process.stdin));
  const entryPath = options.entryPath ?? defaultEntryPath();
  const execPath = options.execPath ?? process.execPath;

  const snapshot = (
    expected: ApprovalRequest,
    exactDecision?: ApprovalDecision,
  ): SnapshotResult => {
    let opened: ApprovalAuthorityRuntimeOpenResult;
    try {
      opened = openRuntime({
        projectRoot: options.projectRoot,
        tenantId: options.tenantId,
      });
    } catch (error) {
      return {
        kind: 'hold',
        reasonCode: `approval-authority-open-failed:${error instanceof Error ? error.name : 'unknown'}`,
      };
    }
    if (opened.state !== 'ready') {
      return { kind: 'hold', reasonCode: opened.reasonCode };
    }
    try {
      const request = opened.service.broker.getRequest(expected.id);
      const decision = opened.service.broker.getDecision(expected.id);
      if (!request) return { kind: 'hold', reasonCode: 'request-unavailable', ...(decision ? { decision } : {}) };
      if (request.id !== expected.id
        || request.tenantId !== options.tenantId
        || request.tenantId !== expected.tenantId
        || approvalRequestDigest(request) !== approvalRequestDigest(expected)) {
        return { kind: 'untrusted', reasonCode: 'request-identity-mismatch', ...(decision ? { decision } : {}) };
      }
      if (exactDecision && (!decision || !isDeepStrictEqual(decision, exactDecision))) {
        return { kind: 'untrusted', reasonCode: 'durable-decision-mismatch', ...(decision ? { decision } : {}) };
      }
      if (decision) {
        const timeoutReceipt = opened.service.broker.getTimeoutReceipt(expected.id);
        const storeSnapshot = opened.service.store.load();
        const lifecycle = [
          ...storeSnapshot.pending,
          ...storeSnapshot.approved,
          ...storeSnapshot.denied,
          ...storeSnapshot.expired,
        ].find(entry => entry.request.id === expected.id)?.lifecycle;
        if (isBoundSystemExpiry(request, decision, timeoutReceipt, lifecycle)) {
          return { kind: 'expired', reasonCode: 'request-expired', decision };
        }
        const validation = opened.service.decisionAuthority.validate(request, decision, now());
        if (!validation.ok) {
          return { kind: 'untrusted', reasonCode: validation.reason, decision };
        }
      }
      return { kind: 'ok', snapshot: { request, ...(decision ? { decision } : {}) } };
    } finally {
      opened.service.close();
    }
  };

  const inspectAfterChild = (
    request: ApprovalRequest,
    action: 'allow' | 'deny',
    child: ChildOutcome,
  ): ApprovalTerminalDecisionResult => {
    const after = snapshot(request);
    const durable = after.kind === 'ok' ? after.snapshot.decision : after.decision;
    if (child.kind === 'expired') {
      if (after.kind === 'expired') {
        return { kind: 'expired', reasonCode: after.reasonCode };
      }
      return durable
        ? { kind: 'hold', reasonCode: 'child-expired-after-durable-decision', observedDecision: observed(durable) }
        : { kind: 'expired', reasonCode: 'request-expired' };
    }
    if (child.kind === 'unreaped') {
      return {
        kind: 'hold',
        reasonCode: 'child-unreaped-after-expiry',
        ...(durable ? { observedDecision: observed(durable) } : {}),
      };
    }
    if (child.kind === 'error') {
      return {
        kind: 'hold',
        reasonCode: `child-error:${child.errorName ?? 'unknown'}`,
        ...(durable ? { observedDecision: observed(durable) } : {}),
      };
    }
    if (child.signal !== null) {
      return durable
        ? {
            kind: 'hold',
            reasonCode: `child-signal-after-durable-decision:${child.signal}`,
            observedDecision: observed(durable),
          }
        : { kind: 'cancelled', reasonCode: `child-signal:${child.signal}` };
    }
    if (child.code === APPROVAL_CANCELLED_EXIT_CODE) {
      if (durable) {
        return {
          kind: 'hold',
          reasonCode: 'child-cancelled-after-durable-decision',
          observedDecision: observed(durable),
        };
      }
      if (after.kind !== 'ok') return { kind: after.kind, reasonCode: after.reasonCode };
      return { kind: 'cancelled', reasonCode: 'terminal-auth-cancelled' };
    }
    if (child.code !== 0) {
      return {
        kind: 'hold',
        reasonCode: `child-exit:${String(child.code)}`,
        ...(durable ? { observedDecision: observed(durable) } : {}),
      };
    }
    if (after.kind !== 'ok') {
      return {
        kind: after.kind,
        reasonCode: after.reasonCode,
        ...(durable ? { observedDecision: observed(durable) } : {}),
      };
    }
    const decision = after.snapshot.decision;
    if (!decision) return { kind: 'hold', reasonCode: 'durable-decision-missing' };
    if (decision.decision !== action) {
      return {
        kind: 'hold',
        reasonCode: 'durable-action-conflict',
        observedDecision: observed(decision),
      };
    }
    return { kind: 'accepted', decision };
  };

  return {
    async decide(request, action, suspendTerminal) {
      if (!isInteractiveTerminal()) return { kind: 'hold', reasonCode: 'interactive-tty-unavailable' };
      if (!approvalLookupIdSchema.safeParse(request.id).success || request.id.startsWith('-')) {
        return { kind: 'untrusted', reasonCode: 'cli-request-id-unsafe' };
      }
      if (request.tenantId !== options.tenantId) return { kind: 'untrusted', reasonCode: 'tenant-mismatch' };
      const before = snapshot(request);
      if (before.kind !== 'ok') {
        return {
          kind: before.kind,
          reasonCode: before.reasonCode,
          ...(before.decision ? { observedDecision: observed(before.decision) } : {}),
        };
      }
      if (before.snapshot.decision) {
        return {
          kind: 'hold',
          reasonCode: 'request-already-decided',
          observedDecision: observed(before.snapshot.decision),
        };
      }
      if (now().getTime() >= Date.parse(before.snapshot.request.expiresAt)) {
        return { kind: 'expired', reasonCode: 'request-expired' };
      }

      let child: ChildOutcome | undefined;
      try {
        await suspendTerminal(async () => {
          await pauseTerminalInput();
          const processHandle = spawnProcess(
            execPath,
            [entryPath, 'approvals', 'decide', request.id, action === 'allow' ? '--allow' : '--deny'],
            { cwd: options.projectRoot, stdio: 'inherit', windowsHide: false },
          );
          child = await waitForChild(processHandle, before.snapshot.request.expiresAt, now);
        });
      } catch (error) {
        const after = snapshot(request);
        const durable = after.kind === 'ok' ? after.snapshot.decision : after.decision;
        return {
          kind: 'hold',
          reasonCode: `terminal-suspension-failed:${error instanceof Error ? error.name : 'unknown'}`,
          ...(durable ? { observedDecision: observed(durable) } : {}),
        };
      }
      if (!child) {
        const after = snapshot(request);
        const durable = after.kind === 'ok' ? after.snapshot.decision : after.decision;
        return {
          kind: 'hold',
          reasonCode: 'child-outcome-missing',
          ...(durable ? { observedDecision: observed(durable) } : {}),
        };
      }
      return inspectAfterChild(request, action, child);
    },

    async verifyCrossDecision(request, decision) {
      const verified = snapshot(request, decision);
      if (verified.kind === 'expired' && verified.decision) {
        return { kind: 'expired', decision: verified.decision };
      }
      if (verified.kind !== 'ok' || !verified.snapshot.decision) {
        return {
          kind: 'untrusted',
          reasonCode: verified.kind === 'ok' ? 'durable-decision-missing' : verified.reasonCode,
          ...(verified.kind !== 'ok' && verified.decision ? { decision: verified.decision } : {}),
        };
      }
      const durable = verified.snapshot.decision;
      if (durable.decision === 'defer') return { kind: 'deferred', decision: durable };
      if (durable.decision === 'escalate') return { kind: 'escalated', decision: durable };
      return { kind: 'trusted', decision: durable };
    },
  };
}
