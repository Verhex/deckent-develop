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

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';

import type { ApprovalBroker } from '../core/approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from '../core/approval-contract.js';
import {
  createPrivateJsonFileFirstWriterWins,
  isApprovalFileAclHold,
  type ApprovalFileAclOptions,
} from '../core/approval-file-cas.js';
import type { ApprovalTimeoutReceipt } from '../core/approval-store.js';
import {
  approvalLifecycleProfileDigest,
  maxApprovalRiskTier,
  resolveApprovalLifecyclePolicy,
} from '../core/approval-lifecycle-policy.js';
import { readConfirmation } from '../core/confirmation-store.js';
import type { ResolvedApprovalLifecycleConfig } from '../core/config-types.js';
import type { FederatedPendingItem } from '../core/approval-inbox-federation.js';
import { makeApprovalGate } from './autonomous/approval-adapter.js';
import {
  loadGatewayAccess,
  parseGatewayPairingStore,
} from '../connectors/gateway/gateway-access.js';
import { gatewayHome } from '../connectors/gateway/gateway-paths.js';
import { NervousIpcQueue } from '../nervous/ipc-queue.js';
import {
  reconcileAcceptanceConfirmation,
  type AcceptanceConfirmationServiceDeps,
  type AcceptanceServiceResult,
} from './acceptance-confirmation-service.js';
import {
  openAcceptanceConfirmationComposition,
} from './acceptance-confirmation-composition.js';
import type { AcceptanceConfirmationReceipt } from '../core/acceptance-confirmation-contract.js';

/** Origins whose decision path this bridge federates today (D2a+D2b-1).
 * panic-guard stays out deliberately: it is a safety floor with its own
 * explicit surface; bot-action/gateway-pairing wait for their D2b-2 turn. */
export const DECISION_FEDERATED_ORIGINS = Object.freeze(
  ['confirmation', 'checkpoint', 'nervous', 'autonomous-trigger', 'gateway-pairing'] as const);
export type DecisionFederatedOrigin = (typeof DECISION_FEDERATED_ORIGINS)[number];

export function isDecisionFederatedOrigin(
  origin: FederatedPendingItem['origin'],
): origin is DecisionFederatedOrigin {
  return (DECISION_FEDERATED_ORIGINS as readonly string[]).includes(origin);
}

function digestFederatedSource(item: FederatedPendingItem): string {
  return createHash('sha256').update(JSON.stringify({
    origin: item.origin,
    id: item.id,
    requestedAt: item.requestedAt ?? null,
    expiresAt: item.expiresAt ?? null,
    tenantId: item.tenantId ?? null,
    projectPath: item.projectPath ?? null,
    lifecycleGeneration: item.lifecycleGeneration ?? null,
    policySnapshotDigest: item.policySnapshotDigest ?? null,
    sourceRequestDigest: item.sourceRequestDigest ?? null,
    sourceContractVersion: item.sourceContractVersion ?? null,
    sourceSchema: item.sourceSchema ?? null,
    sourceReference: item.sourceReference ?? null,
  })).digest('hex');
}

function assertFederatedMirrorIdentity(
  request: ApprovalRequest,
  item: FederatedPendingItem,
  tenantId: string,
  sourceDigest: string,
): void {
  if (request.id !== item.id
    || request.tenantId !== tenantId
    || request.details['kind'] !== 'decision-federation-mirror'
    || request.details['origin'] !== item.origin
    || request.details['legacyId'] !== item.id
    || request.details['federationProjectionDigest'] !== digestFederatedSource(item)
    || request.details['sourceLifecycleGeneration'] !== (item.lifecycleGeneration ?? null)
    || request.details['sourcePolicySnapshotDigest'] !== (item.policySnapshotDigest ?? null)
    || request.details['sourceRequestDigest'] !== sourceDigest
    || request.details['sourceSchema'] !== (item.sourceSchema ?? null)
    || request.details['sourceReference'] !== (item.sourceReference ?? null)
    || request.details['sourceProjectionPredecessor'] !== digestFederatedSource(item)
    || (request.version === '2.0'
      && (request.source.contractVersion !== (item.sourceContractVersion ?? '1.0')
        || request.source.requestDigest !== sourceDigest
        || request.source.reference !== (item.sourceReference ?? `federated:${item.origin}:${item.id}`)
        || request.lifecycleGeneration !== (item.lifecycleGeneration
          ?? `federated-${digestFederatedSource(item).slice(0, 24)}`)))) {
    throw new Error(`federated mirror identity collision: ${item.id}`);
  }
}

/**
 * Idempotently mirror a federated pending item into the broker under its own
 * id. Returns the live broker request (fresh or pre-existing). Throws only
 * on non-duplicate submit failures — a duplicate means an earlier mirror
 * already carries the decision authority for this id.
 */
export async function mirrorFederatedItemToBroker(
  broker: ApprovalBroker,
  item: FederatedPendingItem,
  input: { readonly tenantId: string; readonly now?: Date },
): Promise<ApprovalRequest> {
  const projectionDigest = digestFederatedSource(item);
  const sourceDigest = item.sourceRequestDigest ?? projectionDigest;
  const existing = broker.getRequest(item.id);
  if (existing) {
    assertFederatedMirrorIdentity(existing, item, input.tenantId, sourceDigest);
    return existing;
  }
  const now = input.now ?? new Date();
  const origin = item.origin === 'confirmation'
    ? 'confirmation'
    : item.origin === 'autonomous-trigger'
      ? 'autonomous-trigger'
      : item.origin === 'gateway-pairing'
        ? 'gateway-pairing'
        : 'broker-native';
  const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
  const profile = lifecycle.profiles[origin];
  const createdAtMs = item.requestedAt === undefined ? now.getTime() : Date.parse(item.requestedAt);
  if (!Number.isFinite(createdAtMs)) throw new Error(`invalid federated source timestamp: ${item.id}`);
  const producerExpiryMs = item.expiresAt === undefined ? Number.POSITIVE_INFINITY : Date.parse(item.expiresAt);
  if (item.expiresAt !== undefined && !Number.isFinite(producerExpiryMs)) {
    throw new Error(`invalid federated producer expiry: ${item.id}`);
  }
  const expiresAtMs = Math.min(producerExpiryMs, createdAtMs + profile.ttlMs);
  const riskTier = maxApprovalRiskTier(profile.riskTier, item.riskTier ?? 'routine');
  const risk = riskTier === 'critical' ? 'critical' : riskTier === 'elevated' ? 'high' : 'low';
  try {
    const submitted = await broker.submitLifecycle({
      id: item.id,
      version: '2.0',
      requester: { role: 'brain', instanceId: `decision-federation:${item.origin}` },
      summary: item.summary.slice(0, 200),
      details: {
        schemaVersion: 1,
        kind: 'decision-federation-mirror',
        origin: item.origin,
        legacyId: item.id,
        federationProjectionDigest: projectionDigest,
        sourceLifecycleGeneration: item.lifecycleGeneration ?? null,
        sourcePolicySnapshotDigest: item.policySnapshotDigest ?? null,
        sourceRequestDigest: sourceDigest,
        sourceSchema: item.sourceSchema ?? null,
        // Retain both lineage links instead of collapsing them into the
        // request digest: the origin reference and the projection predecessor.
        sourceReference: item.sourceReference ?? null,
        sourceProjectionPredecessor: projectionDigest,
      },
      scopeId: item.origin,
      scope: 'lifecycle',
      risk,
      policy: 'require-approval',
      defaultAction: 'deny',
      tenantId: input.tenantId,
      userId: userInfo().username,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      maskedArgs: null,
      rawArgsRef: null,
      origin,
      riskTier,
      blocking: profile.blocking,
      lifecycleProfile: profile,
      policySnapshotDigest: approvalLifecycleProfileDigest(origin, profile),
      source: {
        contractVersion: item.sourceContractVersion ?? '1.0',
        requestDigest: sourceDigest,
        reference: item.sourceReference ?? `federated:${item.origin}:${item.id}`,
      },
      lifecycleGeneration: item.lifecycleGeneration ?? `federated-${projectionDigest.slice(0, 24)}`,
      slaStage: item.lifecycleStage ?? 'initial',
    });
    if (isApprovalFileAclHold(submitted)) {
      throw new Error(`federated mirror private-store HOLD: ${submitted.reasonCode}`);
    }
    return submitted;
  } catch (error) {
    // A concurrent mirror can win the first write; the stored request is
    // then the authority. Anything else propagates.
    const raced = broker.getRequest(item.id);
    if (raced) {
      assertFederatedMirrorIdentity(raced, item, input.tenantId, sourceDigest);
      return raced;
    }
    throw error;
  }
}

/**
 * Reconcile an acceptance confirmation only after proving that the broker
 * mirror still represents the exact origin lineage. The canonical service
 * owns fresh terminal reads, decision-digest FWW, receipt ordering, and debt
 * reduction; this bridge never manufactures settlement state.
 */
export async function reconcileFederatedAcceptanceDecision(
  deps: AcceptanceConfirmationServiceDeps,
  brokerRequest: ApprovalRequest,
  item: FederatedPendingItem,
): Promise<AcceptanceServiceResult> {
  if (item.origin !== 'confirmation' || !item.tenantId) {
    return { state: 'HOLD', reasonCode: 'CONFIRMATION_LINEAGE_MISMATCH', receiptRef: `${item.id}:prepared` };
  }
  const sourceDigest = item.sourceRequestDigest ?? digestFederatedSource(item);
  try {
    assertFederatedMirrorIdentity(brokerRequest, item, item.tenantId, sourceDigest);
  } catch {
    return { state: 'HOLD', reasonCode: 'CONFIRMATION_LINEAGE_MISMATCH', receiptRef: `${item.id}:prepared` };
  }
  return reconcileAcceptanceConfirmation(deps, item.id);
}

export type SettleBackOutcome =
  | { readonly state: 'settled'; readonly origin: Exclude<DecisionFederatedOrigin, 'confirmation'> }
  | { readonly state: 'settled'; readonly origin: 'confirmation'; readonly receipt: AcceptanceConfirmationReceipt }
  | { readonly state: 'held'; readonly origin: 'confirmation'; readonly reason: string; readonly receiptRef: string }
  | { readonly state: 'failed'; readonly reason: string };

export interface FederatedConfirmationSettlementContext {
  readonly brokerRequest: ApprovalRequest;
  readonly item: FederatedPendingItem;
  readonly brokerDecision: ApprovalDecision;
  readonly lifecycle: ResolvedApprovalLifecycleConfig;
  readonly verifyBrokerDecision: (
    request: ApprovalRequest,
    decision: ApprovalDecision,
  ) => boolean;
}

export interface FederatedTimeoutSettleOptions {
  readonly gatewayPairingsPath?: string;
  readonly gatewayAllowlistPath?: string;
  readonly gatewayBindingsPath?: string;
  readonly aclOptions?: ApprovalFileAclOptions;
}

export type FederatedTimeoutSettleOutcome =
  | { readonly state: 'settled' | 'already-settled'; readonly origin: 'confirmation' | 'autonomous-trigger' | 'gateway-pairing' }
  | { readonly state: 'ignored'; readonly origin: 'broker-native' }
  | { readonly state: 'failed'; readonly reason: string };

interface FederatedTimeoutAck {
  readonly schemaVersion: 1;
  readonly kind: 'federated-timeout-settle-back';
  readonly requestId: string;
  readonly origin: 'confirmation' | 'autonomous-trigger' | 'gateway-pairing';
  readonly receiptDigest: string;
  readonly sourceReference: string;
  readonly settledAt: string;
}

function timeoutReceiptDigest(receipt: ApprovalTimeoutReceipt): string {
  return createHash('sha256').update(JSON.stringify(receipt)).digest('hex');
}

function timeoutAckPath(projectRoot: string, receipt: ApprovalTimeoutReceipt): string {
  const key = createHash('sha256')
    .update(`${receipt.tenantId}\u0000${receipt.origin}\u0000${receipt.requestId}\u0000${receipt.lifecycleGeneration}`)
    .digest('hex');
  return join(projectRoot, '.deckent', 'approvals', 'federation-settle', `${key}.json`);
}

function hasMatchingTimeoutAck(projectRoot: string, receipt: ApprovalTimeoutReceipt): boolean {
  try {
    const parsed = JSON.parse(readFileSync(timeoutAckPath(projectRoot, receipt), 'utf8')) as Partial<FederatedTimeoutAck>;
    return parsed.schemaVersion === 1
      && parsed.kind === 'federated-timeout-settle-back'
      && parsed.requestId === receipt.requestId
      && parsed.origin === receipt.origin
      && parsed.receiptDigest === timeoutReceiptDigest(receipt)
      && parsed.sourceReference === receipt.sourceReference;
  } catch {
    return false;
  }
}

function parseTimeoutReceipt(value: unknown): ApprovalTimeoutReceipt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const receipt = value as Partial<ApprovalTimeoutReceipt>;
  if (receipt.schemaVersion !== 1
    || typeof receipt.requestId !== 'string'
    || typeof receipt.tenantId !== 'string'
    || typeof receipt.scopeId !== 'string'
    || typeof receipt.sourceReference !== 'string'
    || !['confirmation', 'autonomous-trigger', 'gateway-pairing', 'broker-native'].includes(String(receipt.origin))
    || typeof receipt.lifecycleGeneration !== 'string'
    || receipt.actor !== 'system:expiry'
    || receipt.kind !== 'timeout-disposition'
    || !['park', 'deny', 'proceed-warn'].includes(String(receipt.action))
    || !['UNDECIDABLE', 'EXPIRED'].includes(String(receipt.terminalState))
    || !['routine', 'elevated', 'critical'].includes(String(receipt.riskTier))
    || typeof receipt.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(receipt.expiresAt))
    || typeof receipt.decidedAt !== 'string'
    || !Number.isFinite(Date.parse(receipt.decidedAt))
    || typeof receipt.authoredPolicyDigest !== 'string'
    || typeof receipt.appliedPolicyDigest !== 'string'
    || receipt.replayAllowed !== false
    || receipt.accessGrantAllowed !== false) return null;
  return receipt as ApprovalTimeoutReceipt;
}

function expectedTimeoutSemantics(receipt: ApprovalTimeoutReceipt): boolean {
  if (receipt.origin === 'confirmation') {
    return receipt.action === 'park' && receipt.terminalState === 'UNDECIDABLE';
  }
  if (receipt.origin === 'autonomous-trigger') {
    return receipt.action === 'park' && receipt.terminalState === 'EXPIRED';
  }
  if (receipt.origin === 'gateway-pairing') {
    return receipt.action === 'deny' && receipt.terminalState === 'EXPIRED'
      && receipt.riskTier === 'critical';
  }
  return true;
}

async function publishTimeoutAck(
  projectRoot: string,
  receipt: ApprovalTimeoutReceipt,
  options: FederatedTimeoutSettleOptions,
): Promise<FederatedTimeoutSettleOutcome> {
  const result = await createPrivateJsonFileFirstWriterWins(
    timeoutAckPath(projectRoot, receipt),
    {
      schemaVersion: 1,
      kind: 'federated-timeout-settle-back',
      requestId: receipt.requestId,
      origin: receipt.origin as FederatedTimeoutAck['origin'],
      receiptDigest: timeoutReceiptDigest(receipt),
      sourceReference: receipt.sourceReference,
      settledAt: receipt.decidedAt,
    } satisfies FederatedTimeoutAck,
    options.aclOptions,
  );
  if (result.state === 'HOLD') return { state: 'failed', reason: result.reasonCode };
  return {
    state: result.created ? 'settled' : 'already-settled',
    origin: receipt.origin as FederatedTimeoutAck['origin'],
  };
}

/**
 * Settle a broker-owned system timeout back into the legacy origin authority.
 * The legacy terminal state is verified before the private FWW ACK is written,
 * so a crash between origin settlement and ACK is safely retried after restart.
 */
export async function settleFederatedTimeoutReceipt(
  projectRoot: string,
  receipt: ApprovalTimeoutReceipt,
  options: FederatedTimeoutSettleOptions = {},
): Promise<FederatedTimeoutSettleOutcome> {
  if (receipt.origin === 'broker-native') return { state: 'ignored', origin: 'broker-native' };
  if (!expectedTimeoutSemantics(receipt)) {
    return { state: 'failed', reason: 'timeout-receipt-semantics-mismatch' };
  }
  if (hasMatchingTimeoutAck(projectRoot, receipt)) {
    return { state: 'already-settled', origin: receipt.origin };
  }
  const at = new Date(receipt.decidedAt);
  const clock = (): Date => new Date(at.getTime());

  if (receipt.origin === 'confirmation') {
    const found = readConfirmation(projectRoot, receipt.requestId, { clock });
    if (!found || found.state !== 'settled'
      || found.request.outcome.decidedBy !== 'system:expiry'
      || found.request.outcome.closureReason !== 'expired'
      || found.request.outcome.verdict !== 'UNDECIDABLE') {
      return { state: 'failed', reason: 'confirmation-timeout-not-settled' };
    }
    return await publishTimeoutAck(projectRoot, receipt, options);
  }

  if (receipt.origin === 'autonomous-trigger') {
    try {
      const gate = makeApprovalGate({
        pendingPath: join(projectRoot, '.deckent', 'autonomous', 'pending.json'),
        projectRoot,
        now: () => receipt.decidedAt,
        principal: {
          id: 'system:expiry',
          identityClass: 'service',
          assurance: 'unverified',
          provenance: 'scheduled',
          verifiedBy: 'durable-timeout-receipt',
          tenantId: receipt.tenantId,
        },
        strictTenantIsolation: true,
      });
      const existing = gate.readTerminal?.(receipt.requestId);
      if (!existing) gate.settleTimeout(receipt.requestId, receipt.decidedAt);
      const terminal = gate.readTerminal?.(receipt.requestId);
      if (!terminal || terminal.kind !== 'timeout'
        || terminal.closureReason !== 'expired'
        || terminal.replayAllowed !== false) {
        return { state: 'failed', reason: 'autonomous-timeout-not-settled' };
      }
    } catch (error) {
      return {
        state: 'failed',
        reason: error instanceof Error && 'code' in error
          ? String((error as { code: unknown }).code)
          : 'autonomous-timeout-settle-failed',
      };
    }
    return await publishTimeoutAck(projectRoot, receipt, options);
  }

  const home = gatewayHome();
  const pairingsPath = options.gatewayPairingsPath ?? join(home, 'pairings.json');
  try {
    const access = await loadGatewayAccess({
      pairingsPath,
      allowlistPath: options.gatewayAllowlistPath ?? join(home, 'allowlist.json'),
      bindingsPath: options.gatewayBindingsPath ?? join(home, 'bindings.json'),
      clock,
      aclOptions: options.aclOptions,
    });
    await access.sweepExpiredPairings();
    const parsed = parseGatewayPairingStore(JSON.parse(readFileSync(pairingsPath, 'utf8')) as unknown);
    const record = parsed.records.find((entry) => entry.pairingId === receipt.requestId);
    if (!record || record.state !== 'EXPIRED' || record.decidedAt !== receipt.decidedAt) {
      return { state: 'failed', reason: 'pairing-timeout-not-settled' };
    }
  } catch {
    return { state: 'failed', reason: 'pairing-timeout-settle-failed' };
  }
  return await publishTimeoutAck(projectRoot, receipt, options);
}

/** Retry durable timeout receipts that lost their settle-back ACK before a
 * previous process exited. Invalid receipt files are ignored, never mutated. */
export async function settlePendingFederatedTimeoutReceipts(
  projectRoot: string,
  options: FederatedTimeoutSettleOptions = {},
): Promise<FederatedTimeoutSettleOutcome[]> {
  const approvalDir = join(projectRoot, '.deckent', 'approvals');
  if (!existsSync(approvalDir)) return [];
  const receipts = readdirSync(approvalDir)
    .filter((name) => name.endsWith('.timeout.json'))
    .sort()
    .flatMap((name) => {
      try {
        const parsed = parseTimeoutReceipt(JSON.parse(readFileSync(join(approvalDir, name), 'utf8')) as unknown);
        return parsed ? [parsed] : [];
      } catch {
        return [];
      }
    });
  const results: FederatedTimeoutSettleOutcome[] = [];
  for (const receipt of receipts) results.push(await settleFederatedTimeoutReceipt(projectRoot, receipt, options));
  return results;
}

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
  confirmationContext?: FederatedConfirmationSettlementContext,
): Promise<SettleBackOutcome> {
  if (origin === 'confirmation') {
    if (!confirmationContext) {
      return { state: 'failed', reason: 'confirmation-authority-unavailable' };
    }
    const { brokerRequest, item, brokerDecision, lifecycle, verifyBrokerDecision } = confirmationContext;
    if (item.origin !== 'confirmation'
      || item.id !== legacyId
      || brokerRequest.id !== legacyId
      || brokerDecision.requestId !== legacyId
      || brokerDecision.decision !== action
      || !brokerDecision.authorization
      || !verifyBrokerDecision(brokerRequest, brokerDecision)) {
      return { state: 'failed', reason: 'confirmation-authority-invalid' };
    }
    try {
      assertFederatedMirrorIdentity(
        brokerRequest,
        item,
        item.tenantId ?? brokerRequest.tenantId,
        item.sourceRequestDigest ?? digestFederatedSource(item),
      );
    } catch {
      return { state: 'failed', reason: 'confirmation-lineage-mismatch' };
    }
    const decidedAt = brokerDecision.decidedAt;
    const clock = (): Date => new Date(decidedAt);
    const found = readConfirmation(projectRoot, legacyId, { lifecycle, clock });
    const lineage = found?.request.acceptanceLineage;
    if (!found || !lineage
      || lineage.tenantId !== brokerRequest.tenantId
      || (item.tenantId !== undefined && lineage.tenantId !== item.tenantId)) {
      return { state: 'failed', reason: 'confirmation-lineage-mismatch' };
    }
    const authorityReceipt = [
      'approval-decision',
      brokerDecision.authorization.integrityKeyId,
      brokerDecision.authorization.integrityMac,
    ].join(':');
    const composition = openAcceptanceConfirmationComposition({
      projectRoot,
      tenantId: lineage.tenantId,
      projectId: lineage.projectId,
      lifecycle,
      clock,
      verifyAuthority: candidate => candidate.confirmationId === legacyId
        && candidate.lineage.tenantId === lineage.tenantId
        && candidate.lineage.projectId === lineage.projectId
        && candidate.decidedAt === decidedAt
        && candidate.authorityReceipt === authorityReceipt,
    });
    try {
      const settled = await composition.decideAndSettle({
        confirmationId: legacyId,
        verdict: action === 'allow' ? 'CONFIRMED' : 'FAILED',
        decidedBy: 'human',
        reason,
        authorityReceipt,
      });
      if (settled.state === 'DONE') return { state: 'settled', origin, receipt: settled.receipt };
      return { state: 'held', origin, reason: settled.reasonCode, receiptRef: settled.receiptRef };
    } finally {
      composition.close();
    }
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
