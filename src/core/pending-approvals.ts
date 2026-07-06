// ═══ Pending-approval reader — the durable hub, read by every surface ════════
// W4 (cross-surface notify/approval): a pure, surface-agnostic reader of the
// durable pending-approval files so `deckent status`, `deckent watch`, and the
// dashboard all derive the SAME "N pending, run this command" from one source of
// truth — instead of each re-implementing (and drifting). core/ home so both the
// CLI helpers and the api/ endpoints can consume it without an ADR-008 inversion.
// Fail-safe: a missing/corrupt file yields [] (never throws).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NERVOUS_PENDING_FILE } from './constants.js';

export interface PendingApproval {
  /** Which gate parked this approval. */
  kind: 'nervous' | 'autonomous';
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
  const path = join(projectRoot, '.deckent', 'autonomous', 'pending.json');
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

/**
 * All currently-parked approvals across surfaces — nervous (`deckent nervous
 * accept/reject`) AND autonomous (`deckent autonomous approve/reject`) — merged
 * from one reader so every surface (`deckent status`, `status --follow`, the
 * dashboard, MCP) shows the SAME unified list with the correct per-kind command.
 */
export function readPendingApprovals(projectRoot: string): PendingApproval[] {
  return [...readNervous(projectRoot), ...readAutonomous(projectRoot)];
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
