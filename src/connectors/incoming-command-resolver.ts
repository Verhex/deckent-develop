/**
 * BOT-002 — approval command resolver (§4G).
 *
 * Owns gate routing for the inbound command router: given an id + action, find
 * the OWNING approval gate and resolve it DURABLY. Two gates, checked in order:
 *
 *   1. autonomous — `.deckent/autonomous/pending.json`. Resolved via the approval
 *      adapter's accept/reject, which records the decision in the sibling
 *      decisions.json (cross-process; the running loop applies it on next re-eval).
 *   2. nervous — `.deckent/nervous-pending.json`. Resolved via the IPC queue
 *      (writeApproval), a durable file the executor poller consumes now or on its
 *      next start.
 *
 * Route by ownership, never blind-try both (avoids wrong-gate / double-resolve).
 * Idempotent: accept/reject and writeApproval are both safe to repeat (platforms
 * re-send). Neither gate owns it → 'not-found' (router acks "unknown/expired").
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NERVOUS_PENDING_FILE } from '../core/constants.js';
import { autonomousPendingPath } from '../core/constants.js';
import { makeApprovalGate } from '../orchestra/autonomous/approval-adapter.js';
import { NervousIpcQueue } from '../nervous/ipc-queue.js';
import { getMessage } from '../cli/helpers/messages.js';
import type { ApprovalAction, CommandResolver, ResolveOutcome } from './incoming-command-router.js';

/** Minimal shape the resolver needs from a nervous pending entry. */
export interface NervousPendingLike {
  readonly id: string;
  /** Short, human-typeable approval code — lets the operator approve over Telegram
   *  with `approve <code>` instead of the UUID (proposer-minted, persisted in pending). */
  readonly shortCode?: string;
  /** Human-readable title — surfaced in the ack so the user sees WHAT they decided. */
  readonly title?: string;
}

export interface CommandResolverDeps {
  /** Read nervous pending notifications (default: nervous-pending.json on disk). */
  readonly readNervousPending?: (root: string) => readonly NervousPendingLike[];
  /** Deliver a nervous decision durably (default: NervousIpcQueue.writeApproval). */
  readonly writeNervousApproval?: (root: string, id: string, action: ApprovalAction) => Promise<void>;
}

function readNervousPendingFile(root: string): NervousPendingLike[] {
  const path = join(root, NERVOUS_PENDING_FILE);
  if (!existsSync(path)) return [];
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(data)
      ? (data.filter((n): n is NervousPendingLike => !!n && typeof (n as { id?: unknown }).id === 'string'))
      : [];
  } catch {
    return []; // corrupt/partial → treat as empty (no false ownership)
  }
}

/** Build a context-rich resolved outcome so the ack says WHAT was decided, not
 *  just the id (e.g. "✅ Onaylandı: dz-9 — autonomous.execute (system:verify)"). */
function resolvedWith(action: ApprovalAction, id: string, what: string, lang: string): ResolveOutcome {
  const key = action === 'approve' ? 'bot.approve_ack_ctx' : 'bot.reject_ack_ctx';
  return { status: 'resolved', reply: getMessage(key, lang, { id, what }) };
}

async function writeNervousApprovalReal(root: string, id: string, action: ApprovalAction): Promise<void> {
  await new NervousIpcQueue(root).writeApproval({
    notificationId: id,
    decision: action === 'approve' ? 'accepted' : 'rejected',
  });
}

/**
 * Build a CommandResolver bound to a project root. Disk-backed by default; the
 * nervous seams are injectable for hermetic routing tests.
 */
export function makeCommandResolver(
  root: string,
  deps: CommandResolverDeps = {},
  lang = 'en',
): CommandResolver {
  const readNervous = deps.readNervousPending ?? readNervousPendingFile;
  const writeNervous = deps.writeNervousApproval ?? writeNervousApprovalReal;

  return async (id: string, action: ApprovalAction): Promise<ResolveOutcome> => {
    // 1. Autonomous gate — durable decisions.json (sibling of pending.json).
    const gate = makeApprovalGate({
      pendingPath: autonomousPendingPath(root),
    });
    const owned = gate.pending().find((p) => p.triggerId === id || p.triggerId.startsWith(id));
    if (owned) {
      if (action === 'approve') gate.accept(owned.triggerId);
      else gate.reject(owned.triggerId);
      // The ack carries the action + who requested it, so the user knows what
      // they just decided (not a bare "Approved dz-9").
      const what = owned.requestedBy ? `${owned.action} (${owned.requestedBy})` : owned.action;
      return resolvedWith(action, owned.triggerId, what, lang);
    }

    // 2. Nervous gate — durable IPC, consumed by the executor poller. Match the
    //    full id, an id-prefix, OR the short approval code (phone-friendly).
    const match = readNervous(root).find(
      (n) => n.id === id || n.id.startsWith(id) || n.shortCode === id.toLowerCase(),
    );
    if (match) {
      await writeNervous(root, match.id, action);
      return resolvedWith(action, match.id, match.title ?? match.id, lang);
    }

    return 'not-found';
  };
}
