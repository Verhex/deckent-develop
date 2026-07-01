// ─── WorkerApprovalGate — worker-side gate for the runtime-wide ApprovalBroker ─
// Governs: strategic-pivot §11.3 ("WorkerApprovalGate: riskli tool/action oncesi
// broker'dan karar bekler") + ADR-G-020 (authority). Built directly on
// ApprovalBroker (APR-1, sprint-351 task 351-005) — this module owns ZERO broker
// internals; it depends only on a narrow structural surface ({@link
// ApprovalBrokerLike}) so a hermetic in-memory fake can stand in for the real,
// file-backed `ApprovalBroker` in tests — no real broker I/O required to exercise
// this gate's own logic.
//
// Design tenets:
//  • guard(action) is the ONLY entrypoint a worker calls before a risky action —
//    it masks args (never forwards a raw value), submits the request, and
//    resolves to a plain 'allow' | 'deny' verdict.
//  • auto-approve settles INSTANTLY — the gate itself calls `decide()` right
//    after `submit()`, so `awaitDecision()` resolves without ever touching the
//    timeout path (a policy that already cleared the action must not make a
//    worker wait on I/O).
//  • Every other policy value awaits an externally-supplied decision (the
//    "decide-resume" path — some other actor, e.g. a terminal/dashboard/relay
//    channel, calls the broker's `decide()`).
//  • A worker must NEVER block forever on a policy decision (§11.7: "terminal
//    kapaliysa run sonsuza kadar takilmasin") — a timeout race invokes the
//    injected {@link FallbackResolver} seam. APR-FALLBACK (a separate, not-yet-
//    built work item) owns the REAL terminal-aware resolver; this module only
//    owns the seam + a fail-closed default ({@link DENY_FALLBACK_RESOLVER}).
//  • The fallback's decision is submitted back via `decide()` so the broker's
//    own store/audit-trail/event stream settles too — a race against an
//    external decide() that lands first is resolved in favor of whatever the
//    broker ACTUALLY settled on, never overridden by a stale fallback guess.

import { randomUUID } from 'node:crypto';
import type {
  ApprovalAction,
  ApprovalPolicy,
  ApprovalRisk,
  ApprovalScope,
  Requester,
} from './approval-contract.js';
import type { ApprovalRequestInput, ApprovalDecisionInput } from './approval-broker.js';
import type { ApprovalRequest, ApprovalDecision } from './approval-contract.js';
import { maskArgs } from './approval-masking.js';

// ─── Broker seam (structural — real ApprovalBroker satisfies this) ──────────

/**
 * The narrow slice of {@link import('./approval-broker.js').ApprovalBroker} this
 * gate needs. A structural interface (not the concrete class) so tests can
 * supply a plain in-memory fake — the real `ApprovalBroker`'s public methods
 * already satisfy this shape, requiring zero production wiring changes.
 */
export interface ApprovalBrokerLike {
  submit(request: ApprovalRequestInput): ApprovalRequest;
  decide(id: string, input: ApprovalDecisionInput): ApprovalDecision;
  awaitDecision(id: string): Promise<ApprovalDecision>;
}

// ─── FallbackResolver seam (APR-FALLBACK builds the real resolver later) ─────

/** Context handed to a {@link FallbackResolver} when a decision hasn't arrived
 *  before the gate's timeout elapses. */
export interface FallbackContext {
  requestId: string;
  summary: string;
  scope: ApprovalScope;
  risk: ApprovalRisk;
  policy: ApprovalPolicy;
  defaultAction: ApprovalAction;
}

/**
 * Injectable seam invoked exactly once, only on timeout. APR-FALLBACK (docs/
 * MASTER-PLAN.md row 35, still ⬜) owns the real terminal/dashboard/API-escalation
 * resolver; this gate needs only this narrow contract so it never blocks a
 * worker forever in the meantime.
 */
export type FallbackResolver = (ctx: FallbackContext) => ApprovalAction | Promise<ApprovalAction>;

/** Fail-closed default: a worker must never proceed on a risky action just
 *  because nobody answered in time. */
export const DENY_FALLBACK_RESOLVER: FallbackResolver = () => 'deny';

// ─── Gate input / output ─────────────────────────────────────────────────────

export type GateVerdict = 'allow' | 'deny';

/** What a worker describes about the action it's about to take. Everything
 *  needed to build a full {@link ApprovalRequestInput} except the fields the
 *  gate itself owns (id/requester/tenantId/userId/createdAt/expiresAt). */
export interface WorkerActionDescriptor {
  summary: string;
  details: Record<string, unknown>;
  scopeId: string;
  scope: ApprovalScope;
  risk: ApprovalRisk;
  policy: ApprovalPolicy;
  defaultAction: ApprovalAction;
  /** Raw args for the action, if any. Masked via `approval-masking.maskArgs()`
   *  before ever reaching the request — the raw value itself never passes
   *  through the gate. */
  rawArgs?: Record<string, unknown>;
}

export interface WorkerApprovalGateOptions {
  broker: ApprovalBrokerLike;
  /** The requesting worker's identity — fixed for the gate's lifetime. */
  requester: Requester;
  tenantId: string;
  userId: string;
  /** Wait ceiling before the injected fallback resolver decides. Default 5 minutes
   *  (no APR-family timeout config exists yet — mirrors this codebase's own
   *  "suggest-5m" high-risk convention, nervous-types.ts). */
  timeoutMs?: number;
  /** Injectable seam — resolves a decision on timeout. Defaults to {@link DENY_FALLBACK_RESOLVER}. */
  fallbackResolver?: FallbackResolver;
  /** Clock seam for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Id generator seam for deterministic tests. Defaults to `randomUUID`. */
  idFactory?: () => string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

/**
 * Worker-side gate for the runtime-wide ApprovalBroker (APR-WORKERGATE,
 * docs/MASTER-PLAN.md row 34). One instance per worker; `guard()` is called
 * once per risky action before it executes.
 */
export class WorkerApprovalGate {
  private readonly broker: ApprovalBrokerLike;
  private readonly requester: Requester;
  private readonly tenantId: string;
  private readonly userId: string;
  private readonly timeoutMs: number;
  private readonly fallbackResolver: FallbackResolver;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(opts: WorkerApprovalGateOptions) {
    this.broker = opts.broker;
    this.requester = opts.requester;
    this.tenantId = opts.tenantId;
    this.userId = opts.userId;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fallbackResolver = opts.fallbackResolver ?? DENY_FALLBACK_RESOLVER;
    this.now = opts.now ?? (() => new Date());
    this.idFactory = opts.idFactory ?? randomUUID;
  }

  /**
   * Gate a risky action. Submits an `ApprovalRequest` built from `action`
   * (raw args masked, never forwarded raw) and resolves to `'allow'` only when
   * the settled decision is exactly `'allow'` — `'deny'`/`'defer'`/`'escalate'`
   * all yield `'deny'` (fail-closed).
   */
  async guard(action: WorkerActionDescriptor): Promise<GateVerdict> {
    const id = this.idFactory();
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.timeoutMs);

    const requestInput: ApprovalRequestInput = {
      id,
      requester: this.requester,
      summary: action.summary,
      details: action.details,
      scopeId: action.scopeId,
      scope: action.scope,
      risk: action.risk,
      policy: action.policy,
      defaultAction: action.defaultAction,
      tenantId: this.tenantId,
      userId: this.userId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      maskedArgs: action.rawArgs ? maskArgs(action.rawArgs) : null,
      rawArgsRef: null,
    };

    const request = this.broker.submit(requestInput);

    if (request.policy === 'auto-approve') {
      const decision = this.broker.decide(request.id, {
        decision: 'allow',
        decidedBy: 'system',
        channel: 'auto-approve',
        decidedAt: this.now().toISOString(),
        reason: 'policy: auto-approve',
      });
      return toVerdict(decision.decision);
    }

    const decision = await this.awaitDecisionOrFallback(request.id, action);
    return toVerdict(decision);
  }

  /** Race the broker's external decision against the timeout. On timeout,
   *  invoke the fallback resolver and settle the broker with its verdict. */
  private awaitDecisionOrFallback(
    requestId: string,
    action: WorkerActionDescriptor,
  ): Promise<ApprovalAction> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.resolveViaFallback(requestId, action).then(resolve, reject);
      }, this.timeoutMs);

      this.broker.awaitDecision(requestId).then(
        (decision) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(decision.decision);
        },
        (err: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  /** Invoke the fallback resolver and settle the broker with its verdict. If
   *  the broker was ALREADY settled in the race window (an external decide()
   *  landed just before this call), defer to that real decision instead —
   *  never override a genuine decision with a stale fallback guess. */
  private async resolveViaFallback(
    requestId: string,
    action: WorkerActionDescriptor,
  ): Promise<ApprovalAction> {
    const fallbackAction = await this.fallbackResolver({
      requestId,
      summary: action.summary,
      scope: action.scope,
      risk: action.risk,
      policy: action.policy,
      defaultAction: action.defaultAction,
    });

    try {
      const decision = this.broker.decide(requestId, {
        decision: fallbackAction,
        decidedBy: 'system',
        channel: 'fallback',
        decidedAt: this.now().toISOString(),
        reason: 'timeout — fallback resolver',
      });
      return decision.decision;
    } catch {
      const decision = await this.broker.awaitDecision(requestId);
      return decision.decision;
    }
  }
}

function toVerdict(action: ApprovalAction): GateVerdict {
  return action === 'allow' ? 'allow' : 'deny';
}
