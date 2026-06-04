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
import { dirname } from 'node:path';
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
      const decision = resolved.get(trigger.id);
      if (decision && decision.outcome !== 'pending') {
        resolved.delete(trigger.id);
        pendingMap.delete(trigger.id);
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
      resolved.set(triggerId, {
        outcome: 'approved',
        reason: reason ?? 'user accepted',
      });
      opts.executor?.resolveApproval(triggerId, 'accepted');
    },

    reject(triggerId: string, reason?: string): void {
      resolved.set(triggerId, {
        outcome: 'rejected',
        reason: reason ?? 'user rejected',
      });
      opts.executor?.resolveApproval(triggerId, 'rejected');
    },

    pending(): readonly PendingApproval[] {
      return [...pendingMap.values()];
    },
  };
}
