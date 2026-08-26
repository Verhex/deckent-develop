// src/connectors/gateway/gateway-access.ts
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  approvalLifecycleProfileDigest,
  resolveEffectiveApprovalExpiry,
  resolveEffectiveApprovalRiskTier,
  resolveApprovalTimeout,
  type ApprovalLifecycleClock,
} from '../../core/approval-lifecycle-policy.js';
import {
  ApprovalFileCasError,
  enforcePrivateApprovalFile,
  readRevisionedJson,
  replaceRevisionedJson,
  withApprovalFileLock,
  type ApprovalFileAclOptions,
} from '../../core/approval-file-cas.js';
import type {
  ApprovalLifecycleBlockingScope,
  ApprovalRiskTier,
  ResolvedApprovalLifecycleConfig,
  ResolvedApprovalLifecycleProfile,
} from '../../core/config-types.js';
import type { ChannelBinding } from '../identity/principal-resolver.js';
import { gatewayHome } from './gateway-paths.js';

const GATEWAY_PAIRING_AUTHORITY_VERSION = 2 as const;
const GATEWAY_PAIRING_SOURCE_VERSION = 'gateway-pairing/2' as const;

export type GatewayPairingTerminalState = 'APPROVED' | 'REJECTED' | 'EXPIRED';
export type GatewayPairingState = 'PENDING' | GatewayPairingTerminalState;

export interface GatewayPairingSource {
  readonly contractVersion: typeof GATEWAY_PAIRING_SOURCE_VERSION;
  readonly requestDigest: string;
  readonly reference: string;
}

/** Canonical durable record. The opaque id is authority; shortCode is only a human alias. */
export interface GatewayPairingRecord {
  readonly schemaVersion: typeof GATEWAY_PAIRING_AUTHORITY_VERSION;
  readonly pairingId: string;
  readonly shortCode: string;
  readonly chatKey: string;
  readonly tenantId: string;
  readonly projectPath: string;
  readonly origin: 'gateway-pairing';
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly riskTier: ApprovalRiskTier;
  readonly blocking: ApprovalLifecycleBlockingScope;
  readonly timeoutDisposition: 'deny-expire';
  readonly lifecycleProfile: ResolvedApprovalLifecycleProfile;
  readonly policySnapshotDigest: string;
  readonly lifecycleGeneration: string;
  readonly slaStage: 'initial';
  readonly source: GatewayPairingSource;
  readonly state: GatewayPairingState;
  readonly decidedAt?: string;
  readonly lateDecisionAt?: string;
  readonly lateDecision?: 'approve' | 'reject';
}

/** Crash-atomic terminal evidence written in the same CAS revision as expiry. */
export interface GatewayPairingTimeoutReceipt {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly tenantId: string;
  readonly projectPath: string;
  readonly sourceReference: string;
  readonly origin: 'gateway-pairing';
  readonly lifecycleGeneration: string;
  readonly actor: 'system:expiry';
  readonly kind: 'timeout-disposition';
  readonly action: 'deny';
  readonly terminalState: 'EXPIRED';
  readonly riskTier: 'critical';
  readonly expiresAt: string;
  readonly decidedAt: string;
  readonly authoredPolicyDigest: string;
  readonly appliedPolicyDigest: string;
  readonly replayAllowed: false;
  readonly accessGrantAllowed: false;
}

export interface PendingPairing extends GatewayPairingRecord {
  readonly state: 'PENDING';
  /** Backward-compatible presentation alias; never a durable identity. */
  readonly code: string;
}

export interface LegacyGatewayPairing {
  readonly pairingId: string;
  readonly code: string;
  readonly chatKey: string;
  readonly requestedAt?: string;
  readonly state: 'QUARANTINED';
  readonly reasonCode: 'legacy-lifecycle-metadata-missing';
}

export interface GatewayPairingParseResult {
  readonly records: readonly GatewayPairingRecord[];
  readonly legacy: readonly LegacyGatewayPairing[];
  readonly fault: boolean;
}

export interface GatewayPairingRequestScope {
  readonly tenantId: string;
  readonly projectPath: string;
  /** Already-resolved config authority. Gateway code never owns a timing/risk table. */
  readonly lifecycle: ResolvedApprovalLifecycleConfig;
  readonly lifecycleGeneration: string;
  readonly sourceReference?: string;
}

export type GatewayPairingRequestResult =
  | { readonly state: 'PENDING'; readonly pairingId: string; readonly code: string; readonly expiresAt: string; readonly reused: boolean }
  | { readonly state: 'HOLD'; readonly reasonCode: 'lifecycle-disabled' | 'invalid-scope' | 'alias-exhausted' };

export type GatewayPairingDecisionResult =
  | { readonly state: 'APPROVED'; readonly pairingId: string; readonly chatKey: string; readonly projectPath: string }
  | { readonly state: 'REJECTED'; readonly pairingId: string }
  | { readonly state: 'EXPIRED'; readonly pairingId: string; readonly expiresAt: string }
  | { readonly state: 'CLOSED'; readonly pairingId: string; readonly terminalState: GatewayPairingTerminalState }
  | { readonly state: 'NOT_FOUND' }
  | { readonly state: 'HOLD'; readonly reasonCode: 'scope-mismatch' | 'legacy-quarantined' };

interface GatewayPairingQuarantine {
  readonly sourceReference: string;
  readonly reasonCode: 'legacy-lifecycle-metadata-missing';
  readonly shortCode?: string;
  readonly chatKey?: string;
  readonly requestedAt?: string;
}

interface GatewayPairingAuthority {
  readonly schemaVersion: typeof GATEWAY_PAIRING_AUTHORITY_VERSION;
  readonly pairings: Record<string, GatewayPairingRecord>;
  readonly aliases: Record<string, string>;
  readonly grants: Record<string, string[]>;
  readonly quarantine: Record<string, GatewayPairingQuarantine>;
  readonly timeoutReceipts: Record<string, GatewayPairingTimeoutReceipt>;
}

interface AuthorityRead {
  readonly revision: number;
  readonly state: GatewayPairingAuthority;
  readonly fault: boolean;
}

export interface GatewayAccess {
  isAuthorized(chatKey: string, projectPath: string): boolean;
  isAuthorizedFresh(chatKey: string, projectPath: string): Promise<boolean>;
  authorize(chatKey: string, projectPath: string): Promise<void>;
  revoke(chatKey: string, projectPath: string): Promise<void>;
  requestPairing(chatKey: string, scope: GatewayPairingRequestScope): Promise<GatewayPairingRequestResult>;
  decidePairing(
    code: string,
    decision: 'approve' | 'reject',
    expectedScope?: { readonly tenantId?: string; readonly projectPath?: string },
  ): Promise<GatewayPairingDecisionResult>;
  /** Compatibility projection. New decision surfaces use decidePairing for typed closure. */
  approvePairing(code: string, projectPath: string): Promise<{ chatKey: string } | null>;
  /** Compatibility projection. New decision surfaces use decidePairing for typed closure. */
  rejectPairing(code: string): Promise<boolean>;
  listPairings(): PendingPairing[];
  sweepExpiredPairings(): Promise<number>;
  getPairingTimeoutReceipt(pairingId: string): GatewayPairingTimeoutReceipt | null;
  getBinding(chatKey: string): ChannelBinding | null;
  setBinding(chatKey: string, binding: ChannelBinding): Promise<void>;
}

export interface LoadGatewayAccessOptions {
  allowlistPath?: string;
  pairingsPath?: string;
  bindingsPath?: string;
  genCode?: () => string;
  genPairingId?: () => string;
  clock?: ApprovalLifecycleClock;
  /** Legacy test seam; clock is authoritative when both are present. */
  now?: () => string;
  aclOptions?: ApprovalFileAclOptions;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function isLifecycleProfile(value: unknown): value is ResolvedApprovalLifecycleProfile {
  if (!isObject(value) || !Array.isArray(value['slaMs']) || value['slaMs'].length !== 3) return false;
  const [first, second, third] = value['slaMs'];
  return Number.isSafeInteger(value['ttlMs'])
    && Number(value['ttlMs']) > 0
    && [first, second, third].every((entry) => Number.isSafeInteger(entry) && Number(entry) > 0)
    && Number(first) < Number(second)
    && Number(second) < Number(third)
    && Number(third) < Number(value['ttlMs'])
    && value['riskTier'] === 'critical'
    && value['timeoutDisposition'] === 'deny-expire'
    && value['blocking'] === 'security';
}

function isCanonicalRecord(value: unknown): value is GatewayPairingRecord {
  if (!isObject(value)) return false;
  if (!(value['schemaVersion'] === GATEWAY_PAIRING_AUTHORITY_VERSION
    && typeof value['pairingId'] === 'string'
    && typeof value['shortCode'] === 'string'
    && typeof value['chatKey'] === 'string'
    && typeof value['tenantId'] === 'string'
    && typeof value['projectPath'] === 'string'
    && value['origin'] === 'gateway-pairing'
    && isIso(value['createdAt'])
    && isIso(value['expiresAt'])
    && value['riskTier'] === 'critical'
    && value['blocking'] === 'security'
    && value['timeoutDisposition'] === 'deny-expire'
    && isLifecycleProfile(value['lifecycleProfile'])
    && isDigest(value['policySnapshotDigest'])
    && typeof value['lifecycleGeneration'] === 'string'
    && value['lifecycleGeneration'].length > 0
    && value['slaStage'] === 'initial'
    && isObject(value['source'])
    && value['source']['contractVersion'] === GATEWAY_PAIRING_SOURCE_VERSION
    && isDigest(value['source']['requestDigest'])
    && typeof value['source']['reference'] === 'string'
    && ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(String(value['state'])))) return false;
  if ((value['lateDecisionAt'] !== undefined || value['lateDecision'] !== undefined)
    && !(isIso(value['lateDecisionAt']) && ['approve', 'reject'].includes(String(value['lateDecision'])))) return false;
  const profile = value['lifecycleProfile'];
  return value['blocking'] === profile.blocking
    && value['riskTier'] === profile.riskTier
    && value['timeoutDisposition'] === profile.timeoutDisposition
    && Date.parse(value['expiresAt']) > Date.parse(value['createdAt'])
    && Date.parse(value['expiresAt']) <= Date.parse(value['createdAt']) + profile.ttlMs
    && value['policySnapshotDigest'] === approvalLifecycleProfileDigest('gateway-pairing', profile);
}

function isTimeoutReceipt(value: unknown): value is GatewayPairingTimeoutReceipt {
  return isObject(value)
    && value['schemaVersion'] === 1
    && typeof value['requestId'] === 'string'
    && typeof value['tenantId'] === 'string'
    && typeof value['projectPath'] === 'string'
    && typeof value['sourceReference'] === 'string'
    && value['origin'] === 'gateway-pairing'
    && typeof value['lifecycleGeneration'] === 'string'
    && value['actor'] === 'system:expiry'
    && value['kind'] === 'timeout-disposition'
    && value['action'] === 'deny'
    && value['terminalState'] === 'EXPIRED'
    && value['riskTier'] === 'critical'
    && isIso(value['expiresAt'])
    && isIso(value['decidedAt'])
    && isDigest(value['authoredPolicyDigest'])
    && isDigest(value['appliedPolicyDigest'])
    && value['replayAllowed'] === false
    && value['accessGrantAllowed'] === false;
}

function legacyRow(value: unknown, key?: string): LegacyGatewayPairing | null {
  if (!isObject(value)) return null;
  const code = typeof value['code'] === 'string'
    ? value['code']
    : typeof value['shortCode'] === 'string'
      ? value['shortCode']
      : key;
  if (!code || typeof value['chatKey'] !== 'string') return null;
  return {
    pairingId: code,
    code,
    chatKey: value['chatKey'],
    ...(isIso(value['requestedAt']) ? { requestedAt: value['requestedAt'] } : {}),
    state: 'QUARANTINED',
    reasonCode: 'legacy-lifecycle-metadata-missing',
  };
}

/**
 * One side-effect-free parser for revisioned production state, unwrapped object
 * maps and the historical array fixture. Legacy rows stay visible but cannot grant.
 */
export function parseGatewayPairingStore(input: unknown): GatewayPairingParseResult {
  let value = input;
  if (isObject(value) && Number.isSafeInteger(value['revision']) && 'value' in value) value = value['value'];
  if (isObject(value) && value['schemaVersion'] === GATEWAY_PAIRING_AUTHORITY_VERSION && isObject(value['pairings'])) {
    const rawRows = Object.entries(value['pairings']);
    const records = rawRows.flatMap(([, row]) => isCanonicalRecord(row) ? [row] : []);
    const quarantineRows = isObject(value['quarantine']) ? Object.entries(value['quarantine']) : [];
    const legacy = quarantineRows.flatMap(([id, row]) => {
      if (!isObject(row)
        || row['reasonCode'] !== 'legacy-lifecycle-metadata-missing'
        || typeof row['shortCode'] !== 'string'
        || typeof row['chatKey'] !== 'string') return [];
      return [{
        pairingId: id,
        code: row['shortCode'],
        chatKey: row['chatKey'],
        ...(isIso(row['requestedAt']) ? { requestedAt: row['requestedAt'] } : {}),
        state: 'QUARANTINED' as const,
        reasonCode: 'legacy-lifecycle-metadata-missing' as const,
      }];
    });
    return {
      records,
      legacy,
      fault: records.length !== rawRows.length || legacy.length !== quarantineRows.length,
    };
  }

  const entries: Array<[string | undefined, unknown]> = Array.isArray(value)
    ? value.map((row) => [undefined, row])
    : isObject(value)
      ? Object.entries(value)
      : [];
  const records: GatewayPairingRecord[] = [];
  const legacy: LegacyGatewayPairing[] = [];
  let invalid = !Array.isArray(value) && !isObject(value);
  for (const [key, row] of entries) {
    if (isCanonicalRecord(row)) records.push(row);
    else {
      const parsed = legacyRow(row, key);
      if (parsed) legacy.push(parsed);
      else invalid = true;
    }
  }
  return { records, legacy, fault: invalid };
}

function emptyAuthority(grants: Record<string, string[]> = {}): GatewayPairingAuthority {
  return {
    schemaVersion: GATEWAY_PAIRING_AUTHORITY_VERSION,
    pairings: {},
    aliases: {},
    grants,
    quarantine: {},
    timeoutReceipts: {},
  };
}

function normalizeGrants(value: unknown): Record<string, string[]> {
  if (!isObject(value)) return {};
  const grants: Record<string, string[]> = {};
  for (const [projectPath, chatKeys] of Object.entries(value)) {
    if (Array.isArray(chatKeys)) grants[projectPath] = [...new Set(chatKeys.filter((entry): entry is string => typeof entry === 'string'))];
  }
  return grants;
}

function normalizeAuthority(value: unknown): GatewayPairingAuthority | null {
  if (!isObject(value)
    || value['schemaVersion'] !== GATEWAY_PAIRING_AUTHORITY_VERSION
    || !isObject(value['pairings'])
    || !isObject(value['aliases'])
    || !isObject(value['grants'])
    || !isObject(value['quarantine'])) return null;
  const pairings: Record<string, GatewayPairingRecord> = {};
  for (const [id, row] of Object.entries(value['pairings'])) {
    if (!isCanonicalRecord(row) || row.pairingId !== id) return null;
    pairings[id] = row;
  }
  const aliases: Record<string, string> = {};
  for (const [code, id] of Object.entries(value['aliases'])) {
    if (typeof id !== 'string' || !pairings[id] || pairings[id].shortCode !== code) return null;
    aliases[code] = id;
  }
  if (Object.keys(aliases).length !== Object.keys(pairings).length
    || Object.values(pairings).some((record) => aliases[record.shortCode] !== record.pairingId)) return null;
  const quarantine: Record<string, GatewayPairingQuarantine> = {};
  for (const [id, row] of Object.entries(value['quarantine'])) {
    if (!isObject(row) || row['reasonCode'] !== 'legacy-lifecycle-metadata-missing' || typeof row['sourceReference'] !== 'string') return null;
    quarantine[id] = row as unknown as GatewayPairingQuarantine;
  }
  const timeoutReceipts: Record<string, GatewayPairingTimeoutReceipt> = {};
  const rawReceipts = value['timeoutReceipts'];
  // Compatibility: early v2 authorities predate the additive receipt map.
  if (rawReceipts !== undefined && !isObject(rawReceipts)) return null;
  for (const [id, row] of Object.entries(isObject(rawReceipts) ? rawReceipts : {})) {
    const record = pairings[id];
    if (!record
      || record.state !== 'EXPIRED'
      || !isTimeoutReceipt(row)
      || row.requestId !== id
      || row.tenantId !== record.tenantId
      || row.projectPath !== record.projectPath
      || row.sourceReference !== record.source.reference
      || row.lifecycleGeneration !== record.lifecycleGeneration
      || row.expiresAt !== record.expiresAt
      || row.authoredPolicyDigest !== record.policySnapshotDigest
      || row.appliedPolicyDigest !== record.policySnapshotDigest) return null;
    timeoutReceipts[id] = row;
  }
  return {
    schemaVersion: GATEWAY_PAIRING_AUTHORITY_VERSION,
    pairings,
    aliases,
    grants: normalizeGrants(value['grants']),
    quarantine,
    timeoutReceipts,
  };
}

function cloneAuthority(value: GatewayPairingAuthority): GatewayPairingAuthority {
  return {
    schemaVersion: GATEWAY_PAIRING_AUTHORITY_VERSION,
    pairings: { ...value.pairings },
    aliases: { ...value.aliases },
    grants: Object.fromEntries(Object.entries(value.grants).map(([key, rows]) => [key, [...rows]])),
    quarantine: { ...value.quarantine },
    timeoutReceipts: { ...value.timeoutReceipts },
  };
}

function readJsonFile(path: string): { value: unknown; exists: boolean; fault: boolean } {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) as unknown, exists: true, fault: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { value: undefined, exists: false, fault: false };
    return { value: undefined, exists: true, fault: true };
  }
}

function shortCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function stableDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, 'utf-8')) as T; } catch { return fallback; }
}

async function writeJson(path: string, obj: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf-8', mode: 0o600 });
  await rename(tmp, path);
}

export async function loadGatewayAccess(opts: LoadGatewayAccessOptions = {}): Promise<GatewayAccess> {
  const allowlistPath = opts.allowlistPath ?? join(gatewayHome(), 'allowlist.json');
  const pairingsPath = opts.pairingsPath ?? join(gatewayHome(), 'pairings.json');
  const bindingsPath = opts.bindingsPath ?? join(gatewayHome(), 'bindings.json');
  const genCode = opts.genCode ?? shortCode;
  const genPairingId = opts.genPairingId ?? ((): string => `gwp-${randomUUID()}`);
  const clock: ApprovalLifecycleClock = opts.clock
    ?? (opts.now ? () => new Date(opts.now!()) : () => new Date());
  const bindings = await readJson<Record<string, ChannelBinding>>(bindingsPath, {});

  function readAuthority(): AuthorityRead {
    const revisioned = readRevisionedJson<unknown>(pairingsPath);
    if (revisioned) {
      const state = normalizeAuthority(revisioned.value);
      return { revision: revisioned.revision, state: state ?? emptyAuthority(), fault: state === null };
    }
    const legacyAllowlistFile = readJsonFile(allowlistPath);
    if (legacyAllowlistFile.fault) return { revision: 0, state: emptyAuthority(), fault: true };
    const legacyAllowlist = normalizeGrants(legacyAllowlistFile.value);
    const raw = readJsonFile(pairingsPath);
    if (raw.fault) return { revision: 0, state: emptyAuthority(), fault: true };
    if (!raw.exists) return { revision: 0, state: emptyAuthority(legacyAllowlist), fault: false };
    const parsed = parseGatewayPairingStore(raw.value);
    const state = emptyAuthority(legacyAllowlist);
    for (const record of parsed.records) {
      state.pairings[record.pairingId] = record;
      state.aliases[record.shortCode] = record.pairingId;
    }
    for (const legacy of parsed.legacy) {
      state.quarantine[legacy.pairingId] = {
        sourceReference: `legacy-pairing:${legacy.code}`,
        reasonCode: legacy.reasonCode,
        shortCode: legacy.code,
        chatKey: legacy.chatKey,
        ...(legacy.requestedAt ? { requestedAt: legacy.requestedAt } : {}),
      };
    }
    return { revision: 0, state, fault: parsed.fault };
  }

  async function mutate<T>(callback: (state: GatewayPairingAuthority, observedAt: Date) => { result: T; changed: boolean }): Promise<T> {
    return await withApprovalFileLock(pairingsPath, async () => {
      const fresh = readAuthority();
      if (fresh.fault) {
        throw new ApprovalFileCasError('revision-conflict', 'gateway pairing authority is unreadable; repair or quarantine it before mutation');
      }
      const state = cloneAuthority(fresh.state);
      const observedAt = clock();
      if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
        throw new Error('gateway pairing lifecycle clock returned an invalid Date');
      }
      const transition = callback(state, observedAt);
      if (transition.changed) await replaceRevisionedJson(pairingsPath, fresh.revision, state, opts.aclOptions);
      return transition.result;
    });
  }

  function timeoutReceipt(
    record: GatewayPairingRecord,
    decidedAt: string,
  ): GatewayPairingTimeoutReceipt {
    return {
      schemaVersion: 1,
      requestId: record.pairingId,
      tenantId: record.tenantId,
      projectPath: record.projectPath,
      sourceReference: record.source.reference,
      origin: 'gateway-pairing',
      lifecycleGeneration: record.lifecycleGeneration,
      actor: 'system:expiry',
      kind: 'timeout-disposition',
      action: 'deny',
      terminalState: 'EXPIRED',
      riskTier: 'critical',
      expiresAt: record.expiresAt,
      decidedAt,
      authoredPolicyDigest: record.policySnapshotDigest,
      appliedPolicyDigest: record.policySnapshotDigest,
      replayAllowed: false,
      accessGrantAllowed: false,
    };
  }

  function expirePending(
    state: GatewayPairingAuthority,
    observedAt: Date,
  ): { readonly expiredCount: number; readonly changed: boolean } {
    let expiredCount = 0;
    let changed = false;
    for (const [pairingId, record] of Object.entries(state.pairings)) {
      if (record.state === 'EXPIRED' && !state.timeoutReceipts[pairingId]) {
        const decidedAt = record.decidedAt ?? observedAt.toISOString();
        state.timeoutReceipts[pairingId] = timeoutReceipt(record, decidedAt);
        changed = true;
        continue;
      }
      if (record.state !== 'PENDING' || observedAt.getTime() < Date.parse(record.expiresAt)) continue;
      const decidedAt = observedAt.toISOString();
      state.pairings[pairingId] = { ...record, state: 'EXPIRED', decidedAt };
      state.timeoutReceipts[pairingId] = timeoutReceipt(record, decidedAt);
      expiredCount += 1;
      changed = true;
    }
    return { expiredCount, changed };
  }

  const access: GatewayAccess = {
    isAuthorized(chatKey, projectPath) {
      const fresh = readAuthority();
      if (fresh.fault) return false;
      return (fresh.state.grants[projectPath] ?? []).includes(chatKey);
    },
    async isAuthorizedFresh(chatKey, projectPath) {
      const file = readJsonFile(pairingsPath);
      if (file.exists) {
        const acl = await enforcePrivateApprovalFile(pairingsPath, opts.aclOptions);
        if (acl.state === 'HOLD') {
          throw new ApprovalFileCasError(acl.reasonCode, `gateway pairing authority ACL is not proven: ${acl.reasonCode}`);
        }
      }
      return access.isAuthorized(chatKey, projectPath);
    },
    async authorize(chatKey, projectPath) {
      await mutate((state) => {
        const list = state.grants[projectPath] ?? [];
        if (list.includes(chatKey)) return { result: undefined, changed: false };
        state.grants[projectPath] = [...list, chatKey];
        return { result: undefined, changed: true };
      });
    },
    async revoke(chatKey, projectPath) {
      await mutate((state) => {
        const list = state.grants[projectPath] ?? [];
        if (!list.includes(chatKey)) return { result: undefined, changed: false };
        state.grants[projectPath] = list.filter((entry) => entry !== chatKey);
        return { result: undefined, changed: true };
      });
    },
    async requestPairing(chatKey, scope) {
      if (!scope.lifecycle.enabled) return { state: 'HOLD', reasonCode: 'lifecycle-disabled' };
      if (!chatKey || !scope.tenantId || !scope.projectPath
        || !scope.lifecycleGeneration) {
        return { state: 'HOLD', reasonCode: 'invalid-scope' };
      }
      const profile = scope.lifecycle.profiles['gateway-pairing'];
      const riskTier = resolveEffectiveApprovalRiskTier({
        origin: 'gateway-pairing', producerRisk: 'critical', policy: scope.lifecycle,
      });
      const timeout = resolveApprovalTimeout({ origin: 'gateway-pairing', profile, riskTier });
      if (riskTier !== 'critical' || timeout.action !== 'deny' || timeout.accessGrantAllowed
        || profile.timeoutDisposition !== 'deny-expire') {
        return { state: 'HOLD', reasonCode: 'invalid-scope' };
      }
      return await mutate<GatewayPairingRequestResult>((state, observedAt) => {
        const expired = expirePending(state, observedAt);
        const existing = Object.values(state.pairings).find((record) => record.state === 'PENDING'
          && observedAt.getTime() < Date.parse(record.expiresAt)
          && record.chatKey === chatKey
          && record.tenantId === scope.tenantId
          && record.projectPath === scope.projectPath);
        if (existing) {
          return {
            result: { state: 'PENDING', pairingId: existing.pairingId, code: existing.shortCode, expiresAt: existing.expiresAt, reused: true },
            changed: expired.changed,
          };
        }
        let code = '';
        for (let attempt = 0; attempt < 128; attempt += 1) {
          const candidate = genCode();
          if (candidate && !state.aliases[candidate]
            && !Object.values(state.quarantine).some((row) => row.shortCode === candidate)) {
            code = candidate;
            break;
          }
        }
        if (!code) return { result: { state: 'HOLD', reasonCode: 'alias-exhausted' }, changed: expired.changed };
        let pairingId = '';
        for (let attempt = 0; attempt < 128; attempt += 1) {
          const candidate = genPairingId();
          if (candidate && !state.pairings[candidate] && !state.quarantine[candidate]) {
            pairingId = candidate;
            break;
          }
        }
        if (!pairingId) return { result: { state: 'HOLD', reasonCode: 'alias-exhausted' }, changed: expired.changed };
        const createdAt = observedAt.toISOString();
        const expiry = resolveEffectiveApprovalExpiry({ createdAt, profile, clock: () => observedAt });
        const policySnapshotDigest = approvalLifecycleProfileDigest('gateway-pairing', profile);
        const sourceReference = scope.sourceReference ?? `gateway-pairing:${scope.tenantId}:${scope.projectPath}`;
        const requestDigest = stableDigest({ pairingId, chatKey, tenantId: scope.tenantId, projectPath: scope.projectPath, createdAt, sourceReference });
        const record: GatewayPairingRecord = {
          schemaVersion: GATEWAY_PAIRING_AUTHORITY_VERSION,
          pairingId,
          shortCode: code,
          chatKey,
          tenantId: scope.tenantId,
          projectPath: scope.projectPath,
          origin: 'gateway-pairing',
          createdAt,
          expiresAt: expiry.expiresAt,
          riskTier,
          blocking: profile.blocking,
          timeoutDisposition: 'deny-expire',
          lifecycleProfile: { ...profile, slaMs: [...profile.slaMs] },
          policySnapshotDigest,
          lifecycleGeneration: scope.lifecycleGeneration,
          slaStage: 'initial',
          source: { contractVersion: GATEWAY_PAIRING_SOURCE_VERSION, requestDigest, reference: sourceReference },
          state: 'PENDING',
        };
        state.pairings[pairingId] = record;
        state.aliases[code] = pairingId;
        return {
          result: { state: 'PENDING', pairingId, code, expiresAt: expiry.expiresAt, reused: false },
          changed: true,
        };
      });
    },
    async decidePairing(code, decision, expectedScope = {}) {
      return await mutate<GatewayPairingDecisionResult>((state, observedAt) => {
        const pairingId = state.aliases[code];
        if (!pairingId) {
          const quarantined = Object.values(state.quarantine).some((row) => row.shortCode === code);
          return {
            result: quarantined
              ? { state: 'HOLD', reasonCode: 'legacy-quarantined' }
              : { state: 'NOT_FOUND' },
            changed: false,
          };
        }
        const record = state.pairings[pairingId];
        if (!record) return { result: { state: 'NOT_FOUND' }, changed: false };
        if (record.state !== 'PENDING') {
          let changed = record.lateDecisionAt === undefined;
          if (record.state === 'EXPIRED' && !state.timeoutReceipts[pairingId]) {
            state.timeoutReceipts[pairingId] = timeoutReceipt(
              record,
              record.decidedAt ?? observedAt.toISOString(),
            );
            changed = true;
          }
          if (record.lateDecisionAt === undefined) {
            state.pairings[pairingId] = {
              ...record,
              lateDecisionAt: observedAt.toISOString(),
              lateDecision: decision,
            };
          }
          return { result: { state: 'CLOSED', pairingId, terminalState: record.state }, changed };
        }
        if (observedAt.getTime() >= Date.parse(record.expiresAt)) {
          const decidedAt = observedAt.toISOString();
          state.pairings[pairingId] = { ...record, state: 'EXPIRED', decidedAt };
          state.timeoutReceipts[pairingId] = timeoutReceipt(record, decidedAt);
          return { result: { state: 'EXPIRED', pairingId, expiresAt: record.expiresAt }, changed: true };
        }
        if ((expectedScope.tenantId !== undefined && expectedScope.tenantId !== record.tenantId)
          || (expectedScope.projectPath !== undefined && expectedScope.projectPath !== record.projectPath)) {
          return { result: { state: 'HOLD', reasonCode: 'scope-mismatch' }, changed: false };
        }
        if (decision === 'reject') {
          state.pairings[pairingId] = { ...record, state: 'REJECTED', decidedAt: observedAt.toISOString() };
          return { result: { state: 'REJECTED', pairingId }, changed: true };
        }
        const grants = state.grants[record.projectPath] ?? [];
        if (!grants.includes(record.chatKey)) state.grants[record.projectPath] = [...grants, record.chatKey];
        state.pairings[pairingId] = { ...record, state: 'APPROVED', decidedAt: observedAt.toISOString() };
        return {
          result: { state: 'APPROVED', pairingId, chatKey: record.chatKey, projectPath: record.projectPath },
          changed: true,
        };
      });
    },
    async approvePairing(code, projectPath) {
      const result = await access.decidePairing(code, 'approve', { projectPath });
      return result.state === 'APPROVED' ? { chatKey: result.chatKey } : null;
    },
    async rejectPairing(code) {
      const result = await access.decidePairing(code, 'reject');
      return result.state === 'REJECTED';
    },
    listPairings() {
      const fresh = readAuthority();
      if (fresh.fault) return [];
      const observedAt = clock().getTime();
      return Object.values(fresh.state.pairings)
        .filter((record): record is GatewayPairingRecord & { state: 'PENDING' } =>
          record.state === 'PENDING' && observedAt < Date.parse(record.expiresAt))
        .map((record) => ({ ...record, code: record.shortCode }));
    },
    async sweepExpiredPairings() {
      return await mutate((state, observedAt) => {
        const sweep = expirePending(state, observedAt);
        return { result: sweep.expiredCount, changed: sweep.changed };
      });
    },
    getPairingTimeoutReceipt(pairingId) {
      const fresh = readAuthority();
      if (fresh.fault) return null;
      return fresh.state.timeoutReceipts[pairingId] ?? null;
    },
    getBinding(chatKey) { return bindings[chatKey] ?? null; },
    async setBinding(chatKey, binding) { bindings[chatKey] = binding; await writeJson(bindingsPath, bindings); },
  };
  return access;
}
