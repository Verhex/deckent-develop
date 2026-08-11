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
import { dirname, join } from 'node:path';
import { writeAuditEvent } from '../../core/audit-writer.js';
import {
  resolveCallerTenant,
  type VerifiedPrincipal,
} from '../../core/principal.js';
import type { Executor } from '../../nervous/executor.js';
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
  /** Optional nervous Executor delegate — accept/reject also calls resolveApproval. */
  executor?: Pick<Executor, 'resolveApproval'>;
  /** Verified caller identity supplied by the approval ingress. */
  principal?: VerifiedPrincipal;
  /** Refuse a principal without a tenant claim instead of using solo `local`. */
  strictTenantIsolation?: boolean;
}

const isoNow = (): string => new Date().toISOString();

/**
 * Build an ApprovalGate that queues `needs_approval` triggers and waits for
 * an external accept/reject call. Repeated request() calls on an unresolved
 * trigger return `pending` indefinitely — the runtime audits + halts the cycle.
 */
export function makeApprovalGate(opts: ApprovalGateOptions = {}): ApprovalGateAdapter {
  const now = opts.now ?? isoNow;
  const pendingMap = new Map<string, PendingApproval>();
  const resolved = new Map<string, ApprovalDecision>();

  // Cross-process decision channel — sibling of pending.json unless overridden.
  const decisionsPath =
    opts.decisionsPath ??
    (opts.pendingPath
      ? join(dirname(opts.pendingPath), 'decisions.json')
      : undefined);

  type DecisionMap = Record<string, ApprovalDecision>;

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

  function recordDecision(triggerId: string, decision: ApprovalDecision): void {
    const map = loadDecisions();
    map[scopedKey(callerTenant(), triggerId)] = decision;
    writeDecisions(map);
  }

  function clearDecision(triggerId: string): void {
    if (!decisionsPath) return;
    const map = loadDecisions();
    const key = scopedKey(callerTenant(), triggerId);
    if (key in map) {
      delete map[key];
      writeDecisions(map);
    }
  }

  if (opts.pendingPath && existsSync(opts.pendingPath)) {
    try {
      const data = JSON.parse(readFileSync(opts.pendingPath, 'utf-8'));
      if (Array.isArray(data)) {
        for (const item of data as PendingApproval[]) {
          if (item?.triggerId) pendingMap.set(entryKey(item), item);
        }
      }
    } catch {
      // Corrupt file — treat as empty queue.
    }
  }

  /** APPROVAL-001 T1: the authoritative known-pending set is the on-disk
   *  pending.json (a separate approve/reject PROCESS wrote it), unioned with the
   *  in-memory pendingMap for the same-process case. Re-read fresh so a request
   *  added after construction is honoured. */
  function isKnownPending(triggerId: string): boolean {
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
    if (isKnownPending(triggerId)) return;
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
      const tenantId = callerTenant();
      const key = scopedKey(tenantId, trigger.id);
      // A decision may arrive in-memory (same-process accept/reject) OR on disk
      // (a separate `autonomous approve/reject` process) — check both.
      let decision = resolved.get(key);
      if (!decision || decision.outcome === 'pending') {
        const onDisk = loadDecisions()[key];
        if (onDisk && onDisk.outcome !== 'pending') decision = onDisk;
      }
      if (decision && decision.outcome !== 'pending') {
        resolved.delete(key);
        pendingMap.delete(key);
        clearDecision(trigger.id);
        persist();
        return Promise.resolve(decision);
      }
      // 🔴 INVARIANT: stays pending until external accept/reject.
      if (!pendingMap.has(key)) {
        pendingMap.set(key, {
          triggerId: trigger.id,
          action: trigger.action,
          requestedBy: trigger.requestedBy,
          enqueuedAt: now(),
          ...(tenantId === 'local' ? {} : { tenantId }),
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
      const decision: ApprovalDecision = {
        outcome: 'approved',
        reason: reason ?? 'user accepted',
      };
      resolved.set(scopedKey(callerTenant(), triggerId), decision);
      recordDecision(triggerId, decision); // cross-process channel
      opts.executor?.resolveApproval(triggerId, 'accepted');
    },

    reject(triggerId: string, reason?: string): void {
      guardKnownPending(triggerId);
      const decision: ApprovalDecision = {
        outcome: 'rejected',
        reason: reason ?? 'user rejected',
      };
      resolved.set(scopedKey(callerTenant(), triggerId), decision);
      recordDecision(triggerId, decision); // cross-process channel
      opts.executor?.resolveApproval(triggerId, 'rejected');
    },

    pending(): readonly PendingApproval[] {
      const tenantId = callerTenant();
      return [...pendingMap.values()].filter((entry) => entryTenant(entry) === tenantId);
    },

    takeResolved(): AutonomousTrigger | null {
      // Disk-backed (cross-process): the human decision was written by a
      // separate `autonomous approve/reject` process, so consult decisions.json
      // — NOT the in-memory `resolved` map (which is empty in the loop process).
      const decisions = loadDecisions();
      for (const entry of pendingMap.values()) {
        if (entryTenant(entry) !== callerTenant()) continue;
        const decision = decisions[entryKey(entry)];
        if (decision && decision.outcome !== 'pending') {
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
  };
}
