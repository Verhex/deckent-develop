// src/orchestra/autonomous/approval-adapter.ts
//
// ApprovalGate adapter — wraps the nervous approval queue (Executor pending
// pattern + 224-008 file-shape compat) into the ApprovalGate DI interface
// consumed by autonomous-runtime.ts.
// Sprint 226 Task 226-003.
//
// 🔴 INVARIANT — NO AUTO-APPROVE
// Every needs_approval trigger stays `pending` until an external accept()
// or reject() call resolves it. No code path inside this module produces
// an `approved` outcome without a prior explicit accept() invocation.
//
// Refs:
//   ADR-037 (RBAC) — needs_approval routes here; never auto-cleared
//   ADR-040 (Nervous System) — Executor.resolveApproval inspiration for accept/reject
//   ADR-008 (Brain centrality) — wraps nervous/executor type; no brain imports

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { createJsonFileFirstWriterWins } from '../../core/approval-file-cas.js';
import type { ApprovalRisk } from '../../core/approval-contract.js';
import type {
  ApprovalRiskTier,
  ResolvedApprovalLifecycleConfig,
} from '../../core/config-types.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import {
  DEFAULT_APPROVAL_LIFECYCLE_POLICY,
  resolveEffectiveApprovalRiskTier,
} from '../../core/approval-lifecycle-policy.js';
import {
  migrateApprovalLifecycleRecord,
  type MigratedApprovalLifecycleMetadata,
} from '../../core/approval-lifecycle-migration.js';
import {
  resolveCallerTenant,
  type VerifiedPrincipal,
} from '../../core/principal.js';
import type { Executor } from '../../nervous/executor.js';
import type { EffectClass } from '../rubric-registry.js';
import type { BacklogEntry } from './backlog-types.js';
import { computeEntryEffectClass } from './policy-gate.js';
import type {
  ApprovalDecision,
  ApprovalGate,
  AutonomousTrigger,
} from '../autonomous-runtime.js';

/** A trigger currently parked in the approval queue. */
export interface PendingApproval {
  triggerId: string;
  action: string;
  requestedBy: string;
  enqueuedAt: string;
  /** Tenant authority for enterprise callers. Absent means legacy solo `local`. */
  tenantId?: string;
  /** Persisted execution-effect authority. Legacy rows derive this on read only. */
  effectClass?: EffectClass;
  /** Persisted legacy compatibility risk used by the canonical tier resolver. */
  risk?: ApprovalRisk;
  /** Additive authoritative tier; it may never be lower than `risk`. */
  riskTier?: ApprovalRiskTier;
  /** Immutable lifecycle bytes derived from the original `enqueuedAt` clock. */
  lifecycle?: MigratedApprovalLifecycleMetadata;
  /**
   * Full parked trigger, stored so the loop can REPLAY it once a decision is
   * recorded (APPROVE-006 run-on-approve). Optional for backward compat with
   * older 4-field pending.json entries — takeResolved() reconstructs a minimal
   * trigger when absent.
   */
  trigger?: AutonomousTrigger;
}

export interface ApprovalGateAdapter extends ApprovalGate {
  /** Resolve a pending trigger as approved (user-driven). */
  accept(triggerId: string, reason?: string): void;
  /** Resolve a pending trigger as rejected (user-driven). */
  reject(triggerId: string, reason?: string): void;
  /** Snapshot of currently-pending approvals. */
  pending(): readonly PendingApproval[];
  /**
   * Return a parked trigger whose decision is recorded ON DISK (cross-process),
   * so the trigger source can re-emit it and the cycle's request() consumes the
   * decision (APPROVE-006). Returns ONLY decided triggers — never an undecided
   * park (which would busy-loop the zero-sleep active path). Does NOT consume:
   * request() removes the pending entry + decision when it applies them.
   */
  takeResolved(): AutonomousTrigger | null;
  /** Settle a broker-projected timeout back into the legacy store without replay. */
  settleTimeout(triggerId: string, decidedAt?: string): boolean;
  /**
   * Read the tenant-scoped per-request FWW terminal authority without mutating
   * pending state or the compatibility projection. Federation uses this after
   * restart to distinguish an already-settled timeout from a human winner.
   */
  readTerminal(triggerId: string): DurableAutonomousDecision | null;
}

/**
 * APPROVAL-001 T1: a decision was submitted for a request the gate has never
 * seen pending. A valid flow never produces this — it is a forged/stale
 * approval, so it is refused fail-closed (no decision is persisted) and the
 * attempt is written to the durable audit trail.
 */
export class UnknownApprovalRequestError extends Error {
  readonly code = 'APR_UNKNOWN_REQUEST' as const;
  constructor(public readonly triggerId: string) {
    super(`approval refused: trigger '${triggerId}' is not a known pending request (forged/stale decision rejected)`);
    this.name = 'UnknownApprovalRequestError';
  }
}

export type ClosedAutonomousApprovalReason = 'expired' | 'already-terminal' | 'quarantined';

/** Typed direct-surface result for a known request that is no longer actionable. */
export class ClosedApprovalRequestError extends Error {
  readonly code = 'APR_APPROVAL_CLOSED' as const;
  constructor(
    public readonly triggerId: string,
    public readonly reasonCode: ClosedAutonomousApprovalReason,
    public readonly expiresAt: string | null = null,
  ) {
    super(`approval refused: trigger '${triggerId}' is closed (${reasonCode})`);
    this.name = 'ClosedApprovalRequestError';
  }
}

export interface ApprovalGateOptions {
  /** Optional file path for persisting the pending queue (224-008 shape). */
  pendingPath?: string;
  /** APPROVAL-001 T1: project root for the durable audit trail of refused
   *  unknown-ID decisions. When absent, the refusal still fails closed but
   *  the audit record is skipped (fail-soft on audit, never on the guard). */
  projectRoot?: string;
  /**
   * Optional file path for persisting cross-process decisions. Defaults to a
   * `decisions.json` sibling of pendingPath. This is the channel that lets a
   * separate `deckent autonomous approve/reject` process resolve the running
   * loop's gate: accept()/reject() record the human decision here, and request()
   * re-reads it on every cycle. (APPROVE-001, MASTER-PLAN §4G.)
   */
  decisionsPath?: string;
  /** Optional clock override for deterministic tests. */
  now?: () => string;
  /** Resolved lifecycle authority. Existing durable rows still drain when disabled. */
  lifecycle?: ResolvedApprovalLifecycleConfig;
  /** Optional nervous Executor delegate — accept/reject also calls resolveApproval. */
  executor?: Pick<Executor, 'resolveApproval'>;
  /** Verified caller identity supplied by the approval ingress. */
  principal?: VerifiedPrincipal;
  /** Refuse a principal without a tenant claim instead of using solo `local`. */
  strictTenantIsolation?: boolean;
}

const isoNow = (): string => new Date().toISOString();

const ACTIVE_COMPATIBILITY_LIFECYCLE: ResolvedApprovalLifecycleConfig = {
  enabled: true,
  profiles: DEFAULT_APPROVAL_LIFECYCLE_POLICY.profiles,
};

interface AutonomousApprovalWork {
  readonly kind?: BacklogEntry['kind'];
  readonly spec?: BacklogEntry['spec'] | Record<string, unknown> | null;
  readonly policy?: BacklogEntry['policy'] | 'auto';
}

/** One production classifier shared by autonomous-v1 and Mission-v2 producers. */
export function autonomousApprovalEffectClass(work: AutonomousApprovalWork | undefined): EffectClass {
  if (!work) return 'reversible';
  return computeEntryEffectClass({
    id: 'approval-effect-classification',
    title: 'approval-effect-classification',
    kind: work.kind ?? 'task',
    spec: (work.spec ?? {}) as BacklogEntry['spec'],
    policy: work.policy ?? 'approval-required',
    trigger: { type: 'one-off' },
    status: 'parked',
    lastRun: null,
    lastResult: null,
  });
}

export function autonomousApprovalRisk(
  effectClass: EffectClass,
  riskTagged: boolean,
): ApprovalRisk {
  return riskTagged || effectClass === 'critical-irreversible' ? 'critical' : 'high';
}

export interface DurableAutonomousDecision extends ApprovalDecision {
  readonly schemaVersion?: 1;
  readonly triggerId?: string;
  readonly tenantId?: string;
  readonly decidedAt?: string;
  readonly kind?: 'human' | 'timeout' | 'quarantine';
  readonly closureReason?: 'expired';
  readonly expiresAt?: string;
  readonly replayAllowed?: false;
}

/**
 * Build an ApprovalGate that queues `needs_approval` triggers and waits for
 * an external accept/reject call. Repeated request() calls on an unresolved
 * trigger return `pending` indefinitely — the runtime audits + halts the cycle.
 */
export function makeApprovalGate(opts: ApprovalGateOptions = {}): ApprovalGateAdapter {
  const now = opts.now ?? isoNow;
  const lifecyclePolicy = opts.lifecycle ?? ACTIVE_COMPATIBILITY_LIFECYCLE;
  const pendingMap = new Map<string, PendingApproval>();
  const resolved = new Map<string, ApprovalDecision>();

  // Cross-process decision channel — sibling of pending.json unless overridden.
  const decisionsPath =
    opts.decisionsPath ??
    (opts.pendingPath
      ? join(dirname(opts.pendingPath), 'decisions.json')
      : undefined);

  type DecisionMap = Record<string, DurableAutonomousDecision>;

  const decisionAuthorityDir = decisionsPath ? `${decisionsPath}.d` : undefined;

  function callerTenant(): string {
    return resolveCallerTenant(
      opts.principal ?? { id: 'approval-ingress' },
      opts.strictTenantIsolation ?? false,
    );
  }

  function entryTenant(entry: PendingApproval): string {
    return entry.tenantId ?? 'local';
  }

  function scopedKey(tenantId: string, triggerId: string): string {
    return tenantId === 'local' ? triggerId : `${tenantId}:${triggerId}`;
  }

  function entryKey(entry: PendingApproval): string {
    return scopedKey(entryTenant(entry), entry.triggerId);
  }

  function decisionAuthorityPath(key: string): string | undefined {
    if (!decisionAuthorityDir) return undefined;
    const digest = createHash('sha256').update(key).digest('hex');
    return join(decisionAuthorityDir, `${digest}.json`);
  }

  function loadDecisions(): DecisionMap {
    if (!decisionsPath || !existsSync(decisionsPath)) return {};
    try {
      const data = JSON.parse(readFileSync(decisionsPath, 'utf-8'));
      return data && typeof data === 'object' ? (data as DecisionMap) : {};
    } catch {
      return {};
    }
  }

  function writeDecisions(map: DecisionMap): void {
    if (!decisionsPath) return;
    const dir = dirname(decisionsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(decisionsPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
  }

  function loadDurableDecision(key: string): DurableAutonomousDecision | undefined {
    const authorityPath = decisionAuthorityPath(key);
    if (authorityPath && existsSync(authorityPath)) {
      try {
        const value = JSON.parse(readFileSync(authorityPath, 'utf-8')) as DurableAutonomousDecision;
        if (value && typeof value === 'object' && value.outcome !== 'pending') return value;
      } catch {
        // An unreadable authority is never replaced; callers fail closed below.
        return {
          outcome: 'rejected',
          kind: 'timeout',
          closureReason: 'expired',
          replayAllowed: false,
        };
      }
    }
    return loadDecisions()[key];
  }

  function recordDecision(
    entry: PendingApproval,
    decision: DurableAutonomousDecision,
  ): { readonly created: boolean; readonly decision: DurableAutonomousDecision } {
    const key = entryKey(entry);
    const authorityPath = decisionAuthorityPath(key);
    if (authorityPath) {
      mkdirSync(dirname(authorityPath), { recursive: true });
      const created = createJsonFileFirstWriterWins(authorityPath, decision);
      const winner = loadDurableDecision(key) ?? decision;
      const map = loadDecisions();
      map[key] = winner.kind === 'human'
        ? { outcome: winner.outcome, ...(winner.reason === undefined ? {} : { reason: winner.reason }) }
        : winner;
      writeDecisions(map);
      return { created, decision: winner };
    }
    const map = loadDecisions();
    if (map[key]) return { created: false, decision: map[key] };
    map[key] = decision;
    writeDecisions(map);
    return { created: true, decision };
  }

  /** Remove only the compatibility projection; the per-request FWW authority remains. */
  function clearDecisionProjection(key: string): void {
    if (!decisionsPath) return;
    const map = loadDecisions();
    if (key in map) {
      delete map[key];
      writeDecisions(map);
    }
  }

  function reloadPending(): void {
    if (!opts.pendingPath) return;
    if (!existsSync(opts.pendingPath)) {
      pendingMap.clear();
      return;
    }
    try {
      const data = JSON.parse(readFileSync(opts.pendingPath, 'utf-8'));
      if (Array.isArray(data)) {
        pendingMap.clear();
        for (const item of data as PendingApproval[]) {
          if (item?.triggerId) pendingMap.set(entryKey(item), item);
        }
      }
    } catch {
      // Corrupt file — treat as empty queue.
      pendingMap.clear();
    }
  }

  reloadPending();

  function workFromTrigger(trigger: AutonomousTrigger | undefined): AutonomousApprovalWork | undefined {
    const entry = (trigger?.payload as { entry?: unknown } | undefined)?.entry;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    return entry as AutonomousApprovalWork;
  }

  function lifecycleFor(entry: PendingApproval) {
    if (entry.lifecycle?.state === 'migrated') return entry.lifecycle;
    const effectClass = entry.effectClass ?? autonomousApprovalEffectClass(workFromTrigger(entry.trigger));
    const work = workFromTrigger(entry.trigger);
    const riskTagged = work?.policy === 'risk-tagged';
    const risk = entry.risk ?? autonomousApprovalRisk(effectClass, riskTagged);
    return migrateApprovalLifecycleRecord({
      origin: 'autonomous-trigger',
      tenantId: entryTenant(entry),
      sourceReference: `autonomous-pending:${entryTenant(entry)}:${entry.triggerId}`,
      sourceRecord: entry,
      sourceTimestamp: entry.enqueuedAt,
      producerRisk: risk,
      destructive: effectClass === 'critical-irreversible',
      riskTagged,
      policy: lifecyclePolicy,
    });
  }

  function closedErrorFor(
    entry: PendingApproval,
    at: string = now(),
  ): ClosedApprovalRequestError | null {
    const lifecycle = lifecycleFor(entry);
    if (lifecycle.state === 'quarantined') {
      return new ClosedApprovalRequestError(entry.triggerId, 'quarantined');
    }
    if (Date.parse(at) >= Date.parse(lifecycle.expiresAt)) {
      return new ClosedApprovalRequestError(entry.triggerId, 'expired', lifecycle.expiresAt);
    }
    return null;
  }

  function timeoutDecision(entry: PendingApproval, decidedAt: string): DurableAutonomousDecision {
    const lifecycle = lifecycleFor(entry);
    return {
      outcome: 'rejected',
      schemaVersion: 1,
      triggerId: entry.triggerId,
      tenantId: entryTenant(entry),
      decidedAt,
      kind: 'timeout',
      closureReason: 'expired',
      ...(lifecycle.state === 'migrated' ? { expiresAt: lifecycle.expiresAt } : {}),
      replayAllowed: false,
    };
  }

  function quarantineDecision(entry: PendingApproval, decidedAt: string): DurableAutonomousDecision {
    return {
      outcome: 'rejected',
      schemaVersion: 1,
      triggerId: entry.triggerId,
      tenantId: entryTenant(entry),
      decidedAt,
      kind: 'quarantine',
      replayAllowed: false,
    };
  }

  function settleExpiredEntry(entry: PendingApproval, decidedAt: string): boolean {
    const key = entryKey(entry);
    const winner = recordDecision(entry, timeoutDecision(entry, decidedAt));
    if (winner.created || winner.decision.kind === 'timeout') {
      pendingMap.delete(key);
      persist();
    }
    return winner.created;
  }

  function sweepExpired(at: string = now()): void {
    reloadPending();
    for (const entry of [...pendingMap.values()]) {
      const closed = closedErrorFor(entry, at);
      if (closed?.reasonCode === 'expired') settleExpiredEntry(entry, at);
      else if (closed?.reasonCode === 'quarantined') {
        recordDecision(entry, quarantineDecision(entry, at));
        pendingMap.delete(entryKey(entry));
        persist();
      }
    }
  }

  /** APPROVAL-001 T1: the authoritative known-pending set is the on-disk
   *  pending.json (a separate approve/reject PROCESS wrote it), unioned with the
   *  in-memory pendingMap for the same-process case. Re-read fresh so a request
   *  added after construction is honoured. */
  function isKnownPending(triggerId: string): boolean {
    reloadPending();
    const tenantId = callerTenant();
    const inMemory = pendingMap.get(scopedKey(tenantId, triggerId));
    if (inMemory && entryTenant(inMemory) === tenantId) return true;
    if (opts.pendingPath && existsSync(opts.pendingPath)) {
      try {
        const data = JSON.parse(readFileSync(opts.pendingPath, 'utf-8'));
        if (Array.isArray(data)) {
          return (data as PendingApproval[]).some(
            (item) => item?.triggerId === triggerId && entryTenant(item) === tenantId,
          );
        }
      } catch {
        // Corrupt pending file must not weaken the guard — treat as no match.
      }
    }
    return false;
  }

  /** Fail closed on an unknown/forged trigger: persist NO decision and write the
   *  refused attempt to the durable audit trail (fail-soft on the audit itself). */
  function guardKnownPending(triggerId: string): void {
    const tenantId = callerTenant();
    const key = scopedKey(tenantId, triggerId);
    const terminal = (resolved.get(key) as DurableAutonomousDecision | undefined)
      ?? loadDurableDecision(key);
    if (terminal) {
      throw new ClosedApprovalRequestError(
        triggerId,
        terminal.kind === 'timeout' || terminal.closureReason === 'expired'
          ? 'expired'
          : terminal.kind === 'quarantine'
            ? 'quarantined'
            : 'already-terminal',
        terminal.expiresAt ?? null,
      );
    }
    if (isKnownPending(triggerId)) {
      const entry = pendingMap.get(key);
      if (entry) {
        const closed = closedErrorFor(entry);
        if (closed) {
          if (closed.reasonCode === 'expired') settleExpiredEntry(entry, now());
          throw closed;
        }
      }
      return;
    }
    if (opts.projectRoot) {
      try {
        writeAuditEvent(opts.projectRoot, 'autonomous', {
          tenantId: 'local',
          actor: 'approval-ingress',
          action: 'approval.unknown_request_rejected',
          target: triggerId,
          metadata: { reason: 'trigger is not a known pending request; forged/stale decision refused' },
        });
      } catch {
        // Audit is best-effort; the guard's refusal below is the hard authority.
      }
    }
    throw new UnknownApprovalRequestError(triggerId);
  }

  function persist(): void {
    if (!opts.pendingPath) return;
    const dir = dirname(opts.pendingPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(
      opts.pendingPath,
      JSON.stringify([...pendingMap.values()], null, 2) + '\n',
      'utf-8',
    );
  }

  return {
    request(trigger: AutonomousTrigger): Promise<ApprovalDecision> {
      reloadPending();
      const tenantId = callerTenant();
      const key = scopedKey(tenantId, trigger.id);
      // A decision may arrive in-memory (same-process accept/reject) OR on disk
      // (a separate `autonomous approve/reject` process) — check both.
      let decision = resolved.get(key);
      if (!decision || decision.outcome === 'pending') {
        const onDisk = loadDurableDecision(key);
        if (onDisk && onDisk.outcome !== 'pending') decision = onDisk;
      }
      if (decision && decision.outcome !== 'pending') {
        const durable = decision as DurableAutonomousDecision;
        if (durable.kind === 'timeout' || durable.closureReason === 'expired') {
          pendingMap.delete(key);
          persist();
          return Promise.resolve({ outcome: 'rejected', reason: 'approval-expired' });
        }
        if (!pendingMap.has(key)) {
          return Promise.resolve({ outcome: 'rejected', reason: 'approval-terminal-replay-refused' });
        }
        resolved.delete(key);
        pendingMap.delete(key);
        clearDecisionProjection(key);
        persist();
        return Promise.resolve(decision);
      }
      // 🔴 INVARIANT: stays pending until external accept/reject.
      if (!pendingMap.has(key)) {
        if (!lifecyclePolicy.enabled) {
          return Promise.resolve({ outcome: 'rejected', reason: 'approval-lifecycle-disabled' });
        }
        const enqueuedAt = now();
        const work = workFromTrigger(trigger);
        const effectClass = autonomousApprovalEffectClass(work);
        const riskTagged = work?.policy === 'risk-tagged';
        const risk = autonomousApprovalRisk(effectClass, riskTagged);
        const lifecycle = migrateApprovalLifecycleRecord({
          origin: 'autonomous-trigger',
          tenantId,
          sourceReference: `autonomous-pending:${tenantId}:${trigger.id}`,
          sourceRecord: { trigger, enqueuedAt, effectClass, risk },
          sourceTimestamp: enqueuedAt,
          producerRisk: risk,
          destructive: effectClass === 'critical-irreversible',
          riskTagged,
          policy: lifecyclePolicy,
        });
        if (lifecycle.state === 'quarantined') {
          return Promise.resolve({ outcome: 'rejected', reason: 'approval-lifecycle-quarantined' });
        }
        pendingMap.set(key, {
          triggerId: trigger.id,
          action: trigger.action,
          requestedBy: trigger.requestedBy,
          enqueuedAt,
          ...(tenantId === 'local' ? {} : { tenantId }),
          effectClass,
          risk,
          riskTier: resolveEffectiveApprovalRiskTier({
            origin: 'autonomous-trigger',
            producerRisk: risk,
            policy: lifecyclePolicy,
            destructive: effectClass === 'critical-irreversible',
            riskTagged,
          }),
          lifecycle,
          trigger,
        });
        persist();
      }
      return Promise.resolve({
        outcome: 'pending',
        reason: 'awaiting human approval',
      });
    },

    accept(triggerId: string, reason?: string): void {
      guardKnownPending(triggerId);
      const key = scopedKey(callerTenant(), triggerId);
      const entry = pendingMap.get(key)!;
      const decision: DurableAutonomousDecision = {
        outcome: 'approved',
        reason: reason ?? 'user accepted',
        schemaVersion: 1,
        triggerId,
        tenantId: callerTenant(),
        decidedAt: now(),
        kind: 'human',
      };
      const recorded = recordDecision(entry, decision);
      if (!recorded.created) {
        throw new ClosedApprovalRequestError(
          triggerId,
          recorded.decision.kind === 'timeout' ? 'expired' : 'already-terminal',
          recorded.decision.expiresAt ?? null,
        );
      }
      resolved.set(key, decision);
      opts.executor?.resolveApproval(triggerId, 'accepted');
    },

    reject(triggerId: string, reason?: string): void {
      guardKnownPending(triggerId);
      const key = scopedKey(callerTenant(), triggerId);
      const entry = pendingMap.get(key)!;
      const decision: DurableAutonomousDecision = {
        outcome: 'rejected',
        reason: reason ?? 'user rejected',
        schemaVersion: 1,
        triggerId,
        tenantId: callerTenant(),
        decidedAt: now(),
        kind: 'human',
      };
      const recorded = recordDecision(entry, decision);
      if (!recorded.created) {
        throw new ClosedApprovalRequestError(
          triggerId,
          recorded.decision.kind === 'timeout' ? 'expired' : 'already-terminal',
          recorded.decision.expiresAt ?? null,
        );
      }
      resolved.set(key, decision);
      opts.executor?.resolveApproval(triggerId, 'rejected');
    },

    pending(): readonly PendingApproval[] {
      sweepExpired();
      const tenantId = callerTenant();
      return [...pendingMap.values()].filter((entry) => entryTenant(entry) === tenantId);
    },

    takeResolved(): AutonomousTrigger | null {
      sweepExpired();
      // Disk-backed (cross-process): the human decision was written by a
      // separate `autonomous approve/reject` process, so consult decisions.json
      // — NOT the in-memory `resolved` map (which is empty in the loop process).
      const decisions = loadDecisions();
      for (const entry of pendingMap.values()) {
        if (entryTenant(entry) !== callerTenant()) continue;
        const decision = loadDurableDecision(entryKey(entry)) ?? decisions[entryKey(entry)];
        if (decision && decision.outcome !== 'pending'
          && decision.kind !== 'timeout'
          && decision.closureReason !== 'expired') {
          return (
            entry.trigger ?? {
              id: entry.triggerId,
              source: 'autonomous-redrive',
              action: entry.action,
              requestedBy: entry.requestedBy,
            }
          );
        }
      }
      return null;
    },

    settleTimeout(triggerId: string, decidedAt: string = now()): boolean {
      reloadPending();
      const key = scopedKey(callerTenant(), triggerId);
      const existing = loadDurableDecision(key);
      if (existing) return false;
      const entry = pendingMap.get(key);
      if (!entry) throw new UnknownApprovalRequestError(triggerId);
      return settleExpiredEntry(entry, decidedAt);
    },

    readTerminal(triggerId: string): DurableAutonomousDecision | null {
      const key = scopedKey(callerTenant(), triggerId);
      return loadDurableDecision(key) ?? null;
    },
  };
}
