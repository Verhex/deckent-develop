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
}

export interface ApprovalGateAdapter extends ApprovalGate {
  /** Resolve a pending trigger as approved (user-driven). */
  accept(triggerId: string, reason?: string): void;
  /** Resolve a pending trigger as rejected (user-driven). */
  reject(triggerId: string, reason?: string): void;
  /** Snapshot of currently-pending approvals. */
  pending(): readonly PendingApproval[];
}

export interface ApprovalGateOptions {
  /** Optional file path for persisting the pending queue (224-008 shape). */
  pendingPath?: string;
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
    map[triggerId] = decision;
    writeDecisions(map);
  }

  function clearDecision(triggerId: string): void {
    if (!decisionsPath) return;
    const map = loadDecisions();
    if (triggerId in map) {
      delete map[triggerId];
      writeDecisions(map);
    }
  }

  if (opts.pendingPath && existsSync(opts.pendingPath)) {
    try {
      const data = JSON.parse(readFileSync(opts.pendingPath, 'utf-8'));
      if (Array.isArray(data)) {
        for (const item of data as PendingApproval[]) {
          if (item?.triggerId) pendingMap.set(item.triggerId, item);
        }
      }
    } catch {
      // Corrupt file — treat as empty queue.
    }
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
      // A decision may arrive in-memory (same-process accept/reject) OR on disk
      // (a separate `autonomous approve/reject` process) — check both.
      let decision = resolved.get(trigger.id);
      if (!decision || decision.outcome === 'pending') {
        const onDisk = loadDecisions()[trigger.id];
        if (onDisk && onDisk.outcome !== 'pending') decision = onDisk;
      }
      if (decision && decision.outcome !== 'pending') {
        resolved.delete(trigger.id);
        pendingMap.delete(trigger.id);
        clearDecision(trigger.id);
        persist();
        return Promise.resolve(decision);
      }
      // 🔴 INVARIANT: stays pending until external accept/reject.
      if (!pendingMap.has(trigger.id)) {
        pendingMap.set(trigger.id, {
          triggerId: trigger.id,
          action: trigger.action,
          requestedBy: trigger.requestedBy,
          enqueuedAt: now(),
        });
        persist();
      }
      return Promise.resolve({
        outcome: 'pending',
        reason: 'awaiting human approval',
      });
    },

    accept(triggerId: string, reason?: string): void {
      const decision: ApprovalDecision = {
        outcome: 'approved',
        reason: reason ?? 'user accepted',
      };
      resolved.set(triggerId, decision);
      recordDecision(triggerId, decision); // cross-process channel
      opts.executor?.resolveApproval(triggerId, 'accepted');
    },

    reject(triggerId: string, reason?: string): void {
      const decision: ApprovalDecision = {
        outcome: 'rejected',
        reason: reason ?? 'user rejected',
      };
      resolved.set(triggerId, decision);
      recordDecision(triggerId, decision); // cross-process channel
      opts.executor?.resolveApproval(triggerId, 'rejected');
    },

    pending(): readonly PendingApproval[] {
      return [...pendingMap.values()];
    },
  };
}
