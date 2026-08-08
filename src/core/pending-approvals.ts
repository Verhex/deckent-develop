// ═══ Pending-approval reader — the durable hub, read by every surface ════════
// W4 (cross-surface notify/approval): a pure, surface-agnostic reader of the
// durable pending-approval files so `deckent status`, `deckent watch`, and the
// dashboard all derive the SAME "N pending, run this command" from one source of
// truth — instead of each re-implementing (and drifting). core/ home so both the
// CLI helpers and the api/ endpoints can consume it without an ADR-008 inversion.
// Fail-safe: a missing/corrupt file yields [] (never throws).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR, NERVOUS_PENDING_FILE, autonomousPendingPath } from './constants.js';
import { ApprovalStore } from './approval-store.js';
import { readCanonicalRunStatus } from './run-status-authority.js';

export interface PendingApproval {
  /** Which gate parked this approval. */
  kind: 'nervous' | 'autonomous' | 'recovery';
  /** Stable id used by the accept/reject command. */
  id: string;
  /** Human-readable title for display. */
  title: string;
  /** The exact command an operator runs to approve. */
  acceptCommand: string;
  /** The exact command an operator runs to reject. */
  rejectCommand: string;
}

/** Read parked nervous approvals from `.deckent/nervous/nervous-pending.json`
 *  (NervousNotification[] shape — we read only id/title, no nervous import). */
function readNervous(projectRoot: string): PendingApproval[] {
  const path = join(projectRoot, NERVOUS_PENDING_FILE);
  if (!existsSync(path)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(data)) return [];
    const out: PendingApproval[] = [];
    for (const n of data) {
      if (n && typeof n === 'object' && typeof (n as { id?: unknown }).id === 'string') {
        const id = (n as { id: string }).id;
        const title = typeof (n as { title?: unknown }).title === 'string' ? (n as { title: string }).title : id;
        out.push({
          kind: 'nervous',
          id,
          title,
          acceptCommand: `deckent nervous accept ${id}`,
          rejectCommand: `deckent nervous reject ${id}`,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Read parked autonomous triggers from `.deckent/autonomous/pending.json`
 *  (approval-adapter PendingApproval shape — triggerId/action/requestedBy). The
 *  operator resolves these with `deckent autonomous approve/reject <triggerId>`
 *  (note: `approve`, not `accept` — the autonomous CLI verb differs from nervous). */
function readAutonomous(projectRoot: string): PendingApproval[] {
  const path = autonomousPendingPath(projectRoot);
  if (!existsSync(path)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(data)) return [];
    const out: PendingApproval[] = [];
    for (const t of data) {
      if (t && typeof t === 'object' && typeof (t as { triggerId?: unknown }).triggerId === 'string') {
        const id = (t as { triggerId: string }).triggerId;
        const action = typeof (t as { action?: unknown }).action === 'string' ? (t as { action: string }).action : '';
        const requestedBy = typeof (t as { requestedBy?: unknown }).requestedBy === 'string' ? (t as { requestedBy: string }).requestedBy : '';
        const title = action ? (requestedBy ? `${action} — ${requestedBy}` : action) : id;
        out.push({
          kind: 'autonomous',
          id,
          title,
          acceptCommand: `deckent autonomous approve ${id}`,
          rejectCommand: `deckent autonomous reject ${id}`,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Project a parked run into the same actionable approval hub as Nervous and
 * autonomous asks. The approval action is the guarded continuation command
 * itself; rejection is the existing explicit force-finalize path. */
function readRecovery(projectRoot: string): PendingApproval[] {
  const authority = readCanonicalRunStatus(projectRoot);
  if (
    authority.lifecycle !== 'PAUSED'
    || !authority.sprintId
    || !authority.resumable
    || !authority.recoveryCommand
    || !authority.finalizeCommand
  ) {
    return [];
  }
  return [{
    kind: 'recovery',
    id: `resume:${authority.sprintId}`,
    title: authority.sprintId,
    acceptCommand: authority.recoveryCommand,
    rejectCommand: authority.finalizeCommand,
  }];
}

// ─── Runtime-wide sweep hook (EXPIRE-SWEEP wiring) ───────────────────────────
// `readPendingApprovals` is the acknowledged single source of truth every
// pending-approval surface (`deckent status`, `status --follow`, the dashboard,
// MCP) reads through — so it is the natural attach point for Task-1's
// `ApprovalStore.sweepExpired()` disk sweep, even though that sweep targets a
// SEPARATE store (`.deckent/approvals`, the runtime-wide ApprovalBroker/
// ApprovalStore, ADR-G-020) from this hub's own nervous/autonomous files. The
// sweep never filters or reshapes THIS function's return value — no CLI command
// exists today to accept/reject a runtime-wide entry from this hub's parked
// list (`deckent nervous accept` resolves against the nervous IPC queue only),
// so fabricating a merged entry here would show an operator a command that does
// nothing. The sweep is a fail-soft side effect that keeps the runtime store's
// OTHER consumers (dashboard `/api/approvals`, the relay, the bot-poll watcher)
// honest by writing overdue closures on every status/pending read.

/** Narrow sweep-only surface this hook depends on — satisfied structurally by a
 *  real `ApprovalStore` or a test fake that throws to prove fail-soft. */
export interface RuntimeApprovalSweepStore {
  sweepExpired(now?: Date): string[];
}

function defaultRuntimeApprovalStore(projectRoot: string): RuntimeApprovalSweepStore {
  // A read-only status/pending query must not create an empty approval store.
  // There is nothing to expire until the broker has materialized this
  // directory, so an absent store is an honest no-op.
  const storeDir = join(projectRoot, DECKENT_DIR, 'approvals');
  if (!existsSync(storeDir)) return { sweepExpired: () => [] };
  return new ApprovalStore(projectRoot);
}

/**
 * Sweep the runtime-wide ApprovalStore before a pending-approval read. Fail-soft:
 * a throwing/broken store is logged via `onSweepError` and swallowed — it must
 * never block `deckent status`, `deckent watch`, or the dashboard from reading
 * the durable hub below.
 */
export function sweepRuntimeApprovals(
  projectRoot: string,
  storeFactory: (root: string) => RuntimeApprovalSweepStore = defaultRuntimeApprovalStore,
  onSweepError: (error: unknown) => void = (error) =>
    console.error('[pending-approvals] runtime sweep failed:', error),
): void {
  try {
    storeFactory(projectRoot).sweepExpired();
  } catch (error) {
    onSweepError(error);
  }
}

/**
 * All currently-parked approvals across surfaces — nervous (`deckent nervous
 * accept/reject`) AND autonomous (`deckent autonomous approve/reject`) — merged
 * from one reader so every surface (`deckent status`, `status --follow`, the
 * dashboard, MCP) shows the SAME unified list with the correct per-kind command.
 */
export function readPendingApprovals(projectRoot: string): PendingApproval[] {
  sweepRuntimeApprovals(projectRoot);
  return [...readNervous(projectRoot), ...readAutonomous(projectRoot), ...readRecovery(projectRoot)];
}

// ─── Write-side lifecycle (W0-TRUTH, #491) ───────────────────────────────────
// Live lie (2026-07-06): `nervous accept` only enqueued to the executor IPC
// queue and never touched this durable hub, so entries survived for days and
// `deckent status` kept shouting "⏳ Bekleyen onaylar: N". These two helpers are
// the hub's write-side: same shape-tolerance as readNervous, never throw.

/**
 * Remove one parked nervous approval from the durable hub by id.
 * Returns true only when an entry was actually removed (honest result).
 */
export function removeNervousPending(projectRoot: string, id: string): boolean {
  const path = join(projectRoot, NERVOUS_PENDING_FILE);
  if (!existsSync(path)) return false;
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(data)) return false;
    const next = data.filter(n => !(n && typeof n === 'object' && (n as { id?: unknown }).id === id));
    if (next.length === data.length) return false;
    writeFileSync(path, JSON.stringify(next, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Prune entries whose own deadline (createdAt + timeoutMs) is in the past —
 * they can never be meaningfully accepted anymore, and leaving them makes every
 * status surface lie about actionable work. Returns the removed ids.
 */
export function pruneExpiredNervousPending(projectRoot: string, nowMs: number): string[] {
  const path = join(projectRoot, NERVOUS_PENDING_FILE);
  if (!existsSync(path)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    if (!Array.isArray(data)) return [];
    const removed: string[] = [];
    const kept = data.filter(n => {
      if (!n || typeof n !== 'object') return true;
      const e = n as { id?: unknown; createdAt?: unknown; timeoutMs?: unknown };
      if (typeof e.id !== 'string' || typeof e.createdAt !== 'string' || typeof e.timeoutMs !== 'number') return true;
      const created = Date.parse(e.createdAt);
      if (!Number.isFinite(created)) return true;
      if (created + e.timeoutMs < nowMs) { removed.push(e.id); return false; }
      return true;
    });
    if (removed.length > 0) writeFileSync(path, JSON.stringify(kept, null, 2), 'utf-8');
    return removed;
  } catch {
    return [];
  }
}
