// ─── Federated approval inbox (APPROVAL-SURFACE-UNIFICATION-001, slice D1) ──
//
// READ-ONLY federation: one listing that surfaces every pending decision in
// the system — broker-native requests plus every scattered second-layer store
// (confirmations, autonomous triggers, nervous proposals, panic markers,
// checkpoints, bot action parks, gateway pairings) — each row tagged with its
// typed ORIGIN and the CURRENT decision command for that surface.
//
// D1 contract (design §3.3): federation BEFORE migration. This module never
// decides, never mutates, never migrates a decision path — it only makes the
// whole inbox visible in one place so a user or an AI stops guessing WHERE to
// answer WHAT. Decision-path migration onto the broker is D2's job.
//
// Every reader is FAIL-SOFT: a missing store yields no rows; a corrupt file
// yields a typed `unreadable` row (visible, never a crash, never silently
// hidden) — an inbox that throws on one bad file hides every other pending
// decision behind it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { listPendingConfirmationsReadOnly } from './confirmation-store.js';
import { parseGatewayPairingStore } from '../connectors/gateway/gateway-access.js';
import { migrateApprovalLifecycleRecord } from './approval-lifecycle-migration.js';
import { resolveApprovalLifecyclePolicy } from './approval-lifecycle-policy.js';

/** Typed origin classes for federated rows (design §3.1 vocabulary subset). */
export type FederatedOrigin =
  | 'confirmation'
  | 'autonomous-trigger'
  | 'nervous'
  | 'panic-guard'
  | 'checkpoint'
  | 'bot-action'
  | 'gateway-pairing';

export interface FederatedPendingItem {
  readonly origin: FederatedOrigin;
  readonly id: string;
  /** Short human summary (already-resolved text from the source record). */
  readonly summary: string;
  /** i18n key of the decision-command hint for this surface. */
  readonly decideHintKey: string;
  readonly requestedAt?: string;
  readonly expiresAt?: string;
  readonly tenantId?: string;
  readonly projectPath?: string;
  readonly riskTier?: 'routine' | 'elevated' | 'critical';
  readonly lifecycleStage?: 'initial' | 'renotify' | 'alternate-channel' | 'park-alert' | 'expired';
  readonly lifecycleGeneration?: string;
  readonly policySnapshotDigest?: string;
  readonly sourceRequestDigest?: string;
  readonly sourceContractVersion?: '1.0' | '2.0';
  readonly sourceSchema?: string;
  readonly sourceReference?: string;
  readonly quarantined?: boolean;
  readonly lifecycleReasonCode?: string;
  /** Typed read fault — the row is a visibility marker, not a decidable item. */
  readonly unreadable?: boolean;
}

function readJsonArray(path: string): { rows: unknown[]; fault: boolean } {
  if (!existsSync(path)) return { rows: [], fault: false };
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return Array.isArray(data) ? { rows: data, fault: false } : { rows: [], fault: true };
  } catch {
    return { rows: [], fault: true };
  }
}

function readJsonValue(path: string): { value: unknown; fault: boolean } {
  if (!existsSync(path)) return { value: undefined, fault: false };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf-8')) as unknown, fault: false };
  } catch {
    return { value: undefined, fault: true };
  }
}

function faultRow(origin: FederatedOrigin, id: string, decideHintKey: string): FederatedPendingItem {
  return { origin, id, summary: 'unreadable store', decideHintKey, unreadable: true };
}

function confirmationRows(projectRoot: string): FederatedPendingItem[] {
  try {
    return listPendingConfirmationsReadOnly(projectRoot).map(request => ({
      origin: 'confirmation' as const,
      id: request.id,
      summary: `${request.adapter} · ${request.kind}·${request.verdict} · task ${request.taskId} — ${request.statements[0] ?? '-'}`,
      decideHintKey: 'approvals.federated.hint_confirmation',
      requestedAt: request.requestedAt,
      expiresAt: request.expiresAt,
      tenantId: request.approval.tenantId,
      riskTier: request.approval.riskTier,
      lifecycleStage: request.approval.slaStage,
      lifecycleGeneration: request.approval.lifecycleGeneration,
      policySnapshotDigest: request.approval.policySnapshotDigest,
      sourceRequestDigest: request.approval.source.requestDigest,
      sourceContractVersion: request.approval.source.contractVersion,
      sourceReference: request.approval.source.reference,
    }));
  } catch {
    return [faultRow('confirmation', 'confirmations-store', 'approvals.federated.hint_confirmation')];
  }
}

function autonomousRows(projectRoot: string): FederatedPendingItem[] {
  const path = join(projectRoot, '.deckent', 'autonomous', 'pending.json');
  const { rows, fault } = readJsonArray(path);
  const lifecyclePolicy = resolveApprovalLifecyclePolicy({ enabled: true });
  const observedAt = Date.now();
  const items = rows.flatMap<FederatedPendingItem>(entry => {
    const record = entry as {
      triggerId?: string;
      action?: string;
      requestedBy?: string;
      enqueuedAt?: string;
      tenantId?: string;
      risk?: 'none' | 'low' | 'medium' | 'high' | 'critical';
      lifecycle?: {
        state?: string;
        expiresAt?: string;
        riskTier?: 'routine' | 'elevated' | 'critical';
        slaStage?: 'initial' | 'renotify' | 'alternate-channel' | 'park-alert' | 'expired';
        lifecycleGeneration?: string;
        policySnapshotDigest?: string;
        sourceReference?: string;
        sourceDigest?: string;
      };
    };
    if (typeof record?.triggerId !== 'string') return [];
    const persisted = record.lifecycle;
    const lifecycle = persisted?.state === 'migrated'
      && typeof persisted.expiresAt === 'string'
      && Number.isFinite(Date.parse(persisted.expiresAt))
      && typeof persisted.lifecycleGeneration === 'string'
      && typeof persisted.policySnapshotDigest === 'string'
      && typeof persisted.sourceReference === 'string'
      && typeof persisted.sourceDigest === 'string'
      && ['routine', 'elevated', 'critical'].includes(String(persisted.riskTier))
      && ['initial', 'renotify', 'alternate-channel', 'park-alert', 'expired'].includes(String(persisted.slaStage))
      ? {
          state: 'migrated' as const,
          expiresAt: persisted.expiresAt,
          riskTier: persisted.riskTier!,
          slaStage: persisted.slaStage!,
          lifecycleGeneration: persisted.lifecycleGeneration,
          policySnapshotDigest: persisted.policySnapshotDigest,
          sourceReference: persisted.sourceReference,
          sourceDigest: persisted.sourceDigest,
        }
      : migrateApprovalLifecycleRecord({
          origin: 'autonomous-trigger',
          tenantId: record.tenantId ?? 'local',
          sourceReference: `autonomous-pending:${record.tenantId ?? 'local'}:${record.triggerId}`,
          sourceRecord: entry,
          sourceTimestamp: record.enqueuedAt,
          producerRisk: record.risk,
          policy: lifecyclePolicy,
        });
    if (lifecycle.state === 'quarantined') {
      return [{
        origin: 'autonomous-trigger' as const,
        id: record.triggerId,
        summary: `${record.action ?? '?'} (by ${record.requestedBy ?? '?'})`,
        decideHintKey: 'approvals.federated.hint_autonomous',
        ...(record.enqueuedAt ? { requestedAt: record.enqueuedAt } : {}),
        tenantId: record.tenantId ?? 'local',
        quarantined: true,
        lifecycleReasonCode: lifecycle.reasonCode,
        sourceReference: lifecycle.sourceReference,
      }];
    }
    if (observedAt >= Date.parse(lifecycle.expiresAt)) return [];
    return [{
      origin: 'autonomous-trigger' as const,
      id: record.triggerId,
      summary: `${record.action ?? '?'} (by ${record.requestedBy ?? '?'})`,
      decideHintKey: 'approvals.federated.hint_autonomous',
      ...(record.enqueuedAt ? { requestedAt: record.enqueuedAt } : {}),
      expiresAt: lifecycle.expiresAt,
      tenantId: record.tenantId ?? 'local',
      riskTier: lifecycle.riskTier,
      lifecycleStage: lifecycle.slaStage,
      lifecycleGeneration: lifecycle.lifecycleGeneration,
      policySnapshotDigest: lifecycle.policySnapshotDigest,
      sourceRequestDigest: lifecycle.sourceDigest,
      sourceContractVersion: '1.0',
      sourceSchema: 'autonomous-pending/1',
      sourceReference: lifecycle.sourceReference,
    }];
  });
  if (fault) items.push(faultRow('autonomous-trigger', 'pending.json', 'approvals.federated.hint_autonomous'));
  return items;
}

function nervousRows(projectRoot: string): FederatedPendingItem[] {
  const path = join(projectRoot, '.deckent', 'nervous', 'nervous-pending.json');
  const { rows, fault } = readJsonArray(path);
  const items: FederatedPendingItem[] = rows.flatMap(entry => {
    const record = entry as { id?: string; shortCode?: string; title?: string; message?: string; createdAt?: string };
    if (typeof record?.id !== 'string') return [];
    return [{
      origin: 'nervous' as const,
      // Real notification id (D2b-1): the DE1 short-code generator addresses
      // every row uniformly, so the legacy nervous 5-char code is no longer
      // used as an identity — it stays visible in the summary as an alias.
      id: record.id,
      summary: (record.title ?? record.message ?? record.id)
        + (record.shortCode ? ` [${record.shortCode}]` : ''),
      decideHintKey: 'approvals.federated.hint_nervous',
      ...(record.createdAt ? { requestedAt: record.createdAt } : {}),
    }];
  });
  if (fault) items.push(faultRow('nervous', 'nervous-pending.json', 'approvals.federated.hint_nervous'));
  return items;
}

function panicRows(projectRoot: string): FederatedPendingItem[] {
  const dir = join(projectRoot, '.deckent', 'panic-ipc', 'pending');
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter(name => name.endsWith('.json'))
      .map(name => ({
        origin: 'panic-guard' as const,
        id: `panic:${name.replace(/\.json$/u, '')}`,
        summary: name,
        decideHintKey: 'approvals.federated.hint_panic',
      }));
  } catch {
    return [faultRow('panic-guard', 'panic-ipc', 'approvals.federated.hint_panic')];
  }
}

function checkpointRows(projectRoot: string): FederatedPendingItem[] {
  const dir = join(projectRoot, '.deckent', 'checkpoints');
  if (!existsSync(dir)) return [];
  try {
    const items: FederatedPendingItem[] = [];
    for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
      try {
        const record = JSON.parse(readFileSync(join(dir, name), 'utf-8')) as
          { status?: string; createdAt?: string };
        if (record?.status !== 'pending') continue;
        items.push({
          origin: 'checkpoint',
          id: name.replace(/\.json$/u, ''),
          summary: name.replace(/\.json$/u, ''),
          decideHintKey: 'approvals.federated.hint_checkpoint',
          ...(record.createdAt ? { requestedAt: record.createdAt } : {}),
        });
      } catch {
        items.push(faultRow('checkpoint', name, 'approvals.federated.hint_checkpoint'));
      }
    }
    return items;
  } catch {
    return [faultRow('checkpoint', 'checkpoints', 'approvals.federated.hint_checkpoint')];
  }
}

function botActionRows(projectRoot: string): FederatedPendingItem[] {
  const dir = join(projectRoot, '.deckent', 'bot-actions');
  if (!existsSync(dir)) return [];
  try {
    const items: FederatedPendingItem[] = [];
    for (const name of readdirSync(dir).filter(n => n.endsWith('.json'))) {
      try {
        const record = JSON.parse(readFileSync(join(dir, name), 'utf-8')) as
          { id?: string; tool?: string; parkedAt?: string; expiresAt?: string };
        if (typeof record?.id !== 'string') continue;
        items.push({
          origin: 'bot-action',
          id: record.id,
          summary: `${record.tool ?? '?'} (expires ${record.expiresAt ?? '?'})`,
          decideHintKey: 'approvals.federated.hint_bot',
          ...(record.parkedAt ? { requestedAt: record.parkedAt } : {}),
        });
      } catch {
        items.push(faultRow('bot-action', name, 'approvals.federated.hint_bot'));
      }
    }
    return items;
  } catch {
    return [faultRow('bot-action', 'bot-actions', 'approvals.federated.hint_bot')];
  }
}

function pairingRows(gatewayHomeDir: string | undefined): FederatedPendingItem[] {
  if (!gatewayHomeDir) return [];
  const { value, fault: readFault } = readJsonValue(join(gatewayHomeDir, 'pairings.json'));
  if (value === undefined && !readFault) return [];
  const parsed = parseGatewayPairingStore(value);
  const now = Date.now();
  const items: FederatedPendingItem[] = parsed.records
    .filter(record => record.state === 'PENDING' && now < Date.parse(record.expiresAt))
    .map(record => ({
      origin: 'gateway-pairing' as const,
      id: record.pairingId,
      summary: `chat ${record.chatKey}`,
      decideHintKey: 'approvals.federated.hint_pairing',
      requestedAt: record.createdAt,
      expiresAt: record.expiresAt,
      tenantId: record.tenantId,
      projectPath: record.projectPath,
      riskTier: record.riskTier,
      lifecycleStage: record.slaStage,
      lifecycleGeneration: record.lifecycleGeneration,
      policySnapshotDigest: record.policySnapshotDigest,
      sourceRequestDigest: record.source.requestDigest,
      sourceContractVersion: '1.0',
      sourceSchema: record.source.contractVersion,
      sourceReference: record.source.reference,
    }));
  for (const record of parsed.legacy) {
    items.push({
      origin: 'gateway-pairing',
      id: record.pairingId,
      summary: `chat ${record.chatKey}`,
      decideHintKey: 'approvals.federated.hint_pairing',
      ...(record.requestedAt ? { requestedAt: record.requestedAt } : {}),
      quarantined: true,
      lifecycleReasonCode: record.reasonCode,
    });
  }
  if (readFault || parsed.fault) items.push(faultRow('gateway-pairing', 'pairings.json', 'approvals.federated.hint_pairing'));
  return items;
}

export interface FederatedInboxOptions {
  /** Gateway home override (defaults to none — pairing rows skipped when absent). */
  readonly gatewayHomeDir?: string;
}

/**
 * Every pending decision OUTSIDE the broker, one row each, origin-tagged.
 * Broker-native pending requests are the caller's own listing (they already
 * render richly there); this function federates only the scattered stores.
 */
export function listFederatedPendingItems(
  projectRoot: string,
  options: FederatedInboxOptions = {},
): FederatedPendingItem[] {
  return [
    ...confirmationRows(projectRoot),
    ...autonomousRows(projectRoot),
    ...nervousRows(projectRoot),
    ...panicRows(projectRoot),
    ...checkpointRows(projectRoot),
    ...botActionRows(projectRoot),
    ...pairingRows(options.gatewayHomeDir),
  ].sort((a, b) => (a.requestedAt ?? '').localeCompare(b.requestedAt ?? ''));
}
