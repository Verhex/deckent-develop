// ═══ Pending-approval reader — the durable hub, read by every surface ════════
// W4 (cross-surface notify/approval): a pure, surface-agnostic reader of the
// durable pending-approval files so `deckent status`, `deckent watch`, and the
// dashboard all derive the SAME "N pending, run this command" from one source of
// truth — instead of each re-implementing (and drifting). core/ home so both the
// CLI helpers and the api/ endpoints can consume it without an ADR-008 inversion.
// Fail-safe: a missing/corrupt file yields [] (never throws).

import { existsSync, readFileSync } from 'node:fs';
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
