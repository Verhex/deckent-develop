// ═══ Pending-approval reader — the durable hub, read by every surface ════════
// W4 (cross-surface notify/approval): a pure, surface-agnostic reader of the
// durable pending-approval files so `deckent status`, `deckent watch`, and the
// dashboard all derive the SAME "N pending, run this command" from one source of
// truth — instead of each re-implementing (and drifting). core/ home so both the
// CLI helpers and the api/ endpoints can consume it without an ADR-008 inversion.
// Fail-safe: a missing/corrupt file yields [] (never throws).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** Read parked nervous approvals from `.deckent/nervous-pending.json`
 *  (NervousNotification[] shape — we read only id/title, no nervous import). */
function readNervous(projectRoot: string): PendingApproval[] {
  const path = join(projectRoot, '.deckent', 'nervous-pending.json');
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

/**
 * All currently-parked approvals across surfaces. Nervous today; autonomous
 * joins once its accept/reject CLI lands (W5) — extend here so every surface
 * picks it up for free.
 */
export function readPendingApprovals(projectRoot: string): PendingApproval[] {
  return [...readNervous(projectRoot)];
}
