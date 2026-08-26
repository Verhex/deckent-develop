import { createHash } from 'node:crypto';

import type { ApprovalRisk } from './approval-contract.js';
import type {
  ApprovalLifecycleBlockingScope,
  ApprovalLifecycleOrigin,
  ApprovalLifecycleStage,
  ApprovalRiskTier,
  ApprovalTimeoutDisposition,
  ResolvedApprovalLifecycleConfig,
  ResolvedApprovalLifecycleProfile,
} from './config-types.js';
import {
  approvalLifecycleProfileDigest,
  mapLegacyApprovalRisk,
  resolveEffectiveApprovalExpiry,
  resolveEffectiveApprovalRiskTier,
} from './approval-lifecycle-policy.js';

export type ApprovalLifecycleMigrationReason =
  | 'missing-source-timestamp'
  | 'invalid-source-timestamp'
  | 'producer-expiry-not-after-source'
  | 'source-not-serializable';

export interface ApprovalLifecycleQuarantine {
  readonly state: 'quarantined';
  readonly origin: ApprovalLifecycleOrigin;
  readonly tenantId: string;
  readonly sourceReference: string;
  readonly sourceDigest: string | null;
  readonly reasonCode: ApprovalLifecycleMigrationReason;
}

export interface MigratedApprovalLifecycleMetadata {
  readonly state: 'migrated';
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly origin: ApprovalLifecycleOrigin;
  readonly tenantId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly riskTier: ApprovalRiskTier;
  readonly blocking: ApprovalLifecycleBlockingScope;
  readonly timeoutDisposition: ApprovalTimeoutDisposition;
  readonly lifecycleGeneration: string;
  readonly slaStage: ApprovalLifecycleStage;
  readonly policySnapshotDigest: string;
  readonly lifecycleProfile: ResolvedApprovalLifecycleProfile;
  readonly sourceReference: string;
  readonly sourceDigest: string;
}

export type ApprovalLifecycleMigrationResult =
  | ApprovalLifecycleQuarantine
  | MigratedApprovalLifecycleMetadata;

export interface MigrateApprovalLifecycleRecordInput {
  readonly origin: ApprovalLifecycleOrigin;
  readonly tenantId: string;
  readonly sourceReference: string;
  readonly sourceRecord: unknown;
  readonly sourceTimestamp: unknown;
  readonly producerExpiresAt?: string | null;
  readonly producerRisk?: ApprovalRisk;
  readonly securitySensitive?: boolean;
  readonly destructive?: boolean;
  readonly riskTagged?: boolean;
  readonly policy: ResolvedApprovalLifecycleConfig;
}

function canonical(value: unknown, seen = new Set<object>()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item, seen)).join(',')}]`;
  if (typeof value === 'object') {
    if (seen.has(value as object)) throw new TypeError('cyclic source');
    seen.add(value as object);
    const result = `{${Object.keys(value as Record<string, unknown>).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], seen)}`)
      .join(',')}}`;
    seen.delete(value as object);
    return result;
  }
  throw new TypeError('unsupported source value');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function quarantine(
  input: MigrateApprovalLifecycleRecordInput,
  sourceDigest: string | null,
  reasonCode: ApprovalLifecycleMigrationReason,
): ApprovalLifecycleQuarantine {
  return {
    state: 'quarantined',
    origin: input.origin,
    tenantId: input.tenantId,
    sourceReference: input.sourceReference,
    sourceDigest,
    reasonCode,
  };
}

/**
 * Deterministically project a legacy record into lifecycle metadata. The only
 * time authority is the original source timestamp: sweep/read time is not an
 * input and therefore cannot reset age. Invalid clocks are quarantined with
 * durable source lineage rather than silently becoming new pending work.
 */
export function migrateApprovalLifecycleRecord(
  input: MigrateApprovalLifecycleRecordInput,
): ApprovalLifecycleMigrationResult {
  let sourceBytes: string;
  try {
    sourceBytes = canonical(input.sourceRecord);
  } catch {
    return quarantine(input, null, 'source-not-serializable');
  }
  const sourceDigest = sha256(sourceBytes);
  if (typeof input.sourceTimestamp !== 'string' || input.sourceTimestamp.trim() === '') {
    return quarantine(input, sourceDigest, 'missing-source-timestamp');
  }
  const createdAtMs = Date.parse(input.sourceTimestamp);
  if (!Number.isFinite(createdAtMs)) {
    return quarantine(input, sourceDigest, 'invalid-source-timestamp');
  }
  const createdAt = new Date(createdAtMs).toISOString();
  const profile = input.policy.profiles[input.origin];
  let expiresAt: string;
  try {
    expiresAt = resolveEffectiveApprovalExpiry({
      createdAt,
      producerExpiresAt: input.producerExpiresAt,
      profile,
      clock: () => new Date(createdAt),
    }).expiresAt;
  } catch {
    return quarantine(input, sourceDigest, 'producer-expiry-not-after-source');
  }
  const riskTier = input.producerRisk === undefined
    ? profile.riskTier
    : resolveEffectiveApprovalRiskTier({
      origin: input.origin,
      producerRisk: input.producerRisk,
      policy: input.policy,
      securitySensitive: input.securitySensitive,
      destructive: input.destructive,
      riskTagged: input.riskTagged,
    });
  const identityDigest = sha256(canonical({
    origin: input.origin,
    tenantId: input.tenantId,
    sourceReference: input.sourceReference,
    sourceDigest,
  }));
  return {
    state: 'migrated',
    schemaVersion: 1,
    requestId: `legacy-${identityDigest}`,
    origin: input.origin,
    tenantId: input.tenantId,
    createdAt,
    expiresAt,
    riskTier,
    blocking: profile.blocking,
    timeoutDisposition: profile.timeoutDisposition,
    lifecycleGeneration: `legacy-${identityDigest}`,
    slaStage: 'initial',
    policySnapshotDigest: approvalLifecycleProfileDigest(input.origin, profile),
    lifecycleProfile: { ...profile, slaMs: [...profile.slaMs] },
    sourceReference: input.sourceReference,
    sourceDigest,
  };
}

/** Compatibility helper used by read views that only need the legacy floor. */
export function migrateLegacyRiskTier(risk: ApprovalRisk): ApprovalRiskTier {
  return mapLegacyApprovalRisk(risk);
}
