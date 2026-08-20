// ─── Decision federation bridge (D2a, design §3.3) ──────────────────────────
//
// Migrates the DECISION path of the first two scattered origins —
// `confirmation` (cnf-*) and `checkpoint` — onto the runtime-wide
// ApprovalBroker, closing their auth asymmetry: a checkpoint used to settle
// by an unauthenticated file mutation and a confirmation by a bare TTY
// phrase; through this bridge both are decided by the broker's live-session
// ingress (interactive TTY re-authentication + MAC-signed envelope), and the
// settled decision is written BACK into the legacy store so every existing
// consumer (sprint-lifecycle checkpoint poll, confirmation settle readers)
// keeps working unchanged.
//
// Mirroring is LAZY and idempotent: the legacy pending item is submitted to
// the broker under its OWN id at decide time (duplicate submits are
// tolerated); the broker's mandatory expiry gives the mirrored request a
// bounded decision window (D4 normalizes legacy TTLs; until then the window
// is per-mirror). Origins beyond these two stay on their own surfaces until
// D2b — the bridge refuses them with a typed miss, never guesses.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';

import type { ApprovalBroker } from '../core/approval-broker.js';
import type { ApprovalRequest } from '../core/approval-contract.js';
import { settleConfirmation, readConfirmation } from '../core/confirmation-store.js';
import type { FederatedPendingItem } from '../core/approval-inbox-federation.js';
import { makeApprovalGate } from './autonomous/approval-adapter.js';
import { NervousIpcQueue } from '../nervous/ipc-queue.js';

/** Origins whose decision path this bridge federates today (D2a+D2b-1).
 * panic-guard stays out deliberately: it is a safety floor with its own
 * explicit surface; bot-action/gateway-pairing wait for their D2b-2 turn. */
export const DECISION_FEDERATED_ORIGINS = Object.freeze(
  ['confirmation', 'checkpoint', 'nervous', 'autonomous-trigger'] as const);
export type DecisionFederatedOrigin = (typeof DECISION_FEDERATED_ORIGINS)[number];

export function isDecisionFederatedOrigin(
  origin: FederatedPendingItem['origin'],
): origin is DecisionFederatedOrigin {
  return (DECISION_FEDERATED_ORIGINS as readonly string[]).includes(origin);
}

/** Bounded decision window for a lazily mirrored legacy item (D4 interim). */
const MIRROR_DECISION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Idempotently mirror a federated pending item into the broker under its own
 * id. Returns the live broker request (fresh or pre-existing). Throws only
 * on non-duplicate submit failures — a duplicate means an earlier mirror
 * already carries the decision authority for this id.
 */
export function mirrorFederatedItemToBroker(
  broker: ApprovalBroker,
  item: FederatedPendingItem,
  input: { readonly tenantId: string; readonly now?: Date },
): ApprovalRequest {
  const existing = broker.getRequest(item.id);
  if (existing) return existing;
  const now = input.now ?? new Date();
  try {
    return broker.submit({
      id: item.id,
      requester: { role: 'brain', instanceId: `decision-federation:${item.origin}` },
      summary: item.summary.slice(0, 200),
      details: {
        schemaVersion: 1,
        kind: 'decision-federation-mirror',
        origin: item.origin,
        legacyId: item.id,
      },
      scopeId: item.origin,
      scope: 'lifecycle',
      risk: 'medium',
      policy: 'require-approval',
      defaultAction: 'deny',
      tenantId: input.tenantId,
      userId: userInfo().username,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + MIRROR_DECISION_WINDOW_MS).toISOString(),
      maskedArgs: null,
      rawArgsRef: null,
    });
  } catch (error) {
    // A concurrent mirror can win the first write; the stored request is
    // then the authority. Anything else propagates.
    const raced = broker.getRequest(item.id);
    if (raced) return raced;
    throw error;
  }
}

export type SettleBackOutcome =
  | { readonly state: 'settled'; readonly origin: DecisionFederatedOrigin }
  | { readonly state: 'failed'; readonly reason: string };

/**
 * Write the broker-made decision BACK into the legacy store so existing
 * consumers observe it exactly as before the migration.
 */
export async function settleFederatedDecision(
  projectRoot: string,
  origin: DecisionFederatedOrigin,
  legacyId: string,
  action: 'allow' | 'deny',
  reason: string,
): Promise<SettleBackOutcome> {
  if (origin === 'confirmation') {
    const found = readConfirmation(projectRoot, legacyId);
    if (!found || found.state !== 'pending') {
      return { state: 'failed', reason: 'confirmation-not-pending' };
    }
    settleConfirmation(projectRoot, legacyId, {
      verdict: action === 'allow' ? 'CONFIRMED' : 'FAILED',
      decidedBy: 'human',
      reason,
      decidedAt: new Date().toISOString(),
    });
    return { state: 'settled', origin };
  }
  if (origin === 'nervous') {
    // ABSORB the nervous decision channel: the same IPC queue the CLI/MCP
    // accept path writes — the executor's poll loop picks it up unchanged.
    try {
      const queue = new NervousIpcQueue(projectRoot);
      await queue.writeApproval({
        notificationId: legacyId,
        decision: action === 'allow' ? 'accepted' : 'rejected',
        reason,
      });
      return { state: 'settled', origin };
    } catch {
      return { state: 'failed', reason: 'nervous-ipc-write-failed' };
    }
  }
  if (origin === 'autonomous-trigger') {
    // ABSORB the autonomous gate authority: guardKnownPending + audit +
    // decisions.json format all live there; a forged/stale id is refused
    // fail-closed by UnknownApprovalRequestError.
    try {
      const gate = makeApprovalGate({
        pendingPath: join(projectRoot, '.deckent', 'autonomous', 'pending.json'),
      });
      if (action === 'allow') gate.accept(legacyId, reason);
      else gate.reject(legacyId, reason);
      return { state: 'settled', origin };
    } catch (error) {
      return {
        state: 'failed',
        reason: error instanceof Error && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'autonomous-gate-failed',
      };
    }
  }
  // checkpoint — the legacy id IS the file basename; the sprint-lifecycle
  // poll reads `status`, so the write shape must stay byte-compatible.
  const path = join(projectRoot, '.deckent', 'checkpoints', `${legacyId}.json`);
  if (!existsSync(path)) return { state: 'failed', reason: 'checkpoint-file-missing' };
  try {
    const record = JSON.parse(readFileSync(path, 'utf-8')) as { status?: string };
    if (record.status !== 'pending') return { state: 'failed', reason: 'checkpoint-not-pending' };
    record.status = action === 'allow' ? 'approved' : 'rejected';
    writeFileSync(path, JSON.stringify(record, null, 2), 'utf-8');
    return { state: 'settled', origin };
  } catch {
    return { state: 'failed', reason: 'checkpoint-file-unreadable' };
  }
}
