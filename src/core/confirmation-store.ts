// ─── Confirmation Store (Evaluation Surface adapter runtime, ADR-G-040) ─────
// Confirmation requests are durable lifecycle-v2 approval records. The settled
// directory is an append-only tombstone set: expiry parks as UNDECIDABLE and an
// explicit later attempt/generation creates a successor without deleting it.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { TASK_KINDS, type TaskKind } from './work-model.js';
import {
  DECIDABLE_VERDICTS,
  type ConfirmationAdapter,
  type DecidableVerdict,
} from './acceptance-matrix.js';
import { DeckentError } from './errors.js';
import type { NormativeVerdict } from './verdict-types.js';
import {
  APPROVAL_CONTRACT_V1_VERSION,
  APPROVAL_CONTRACT_V2_VERSION,
  validateApprovalRequest,
  validateStoredApprovalRequest,
  type ApprovalRequestV2,
} from './approval-contract.js';
import type { ResolvedApprovalLifecycleConfig } from './config-types.js';
import {
  applyApprovalLifecycleProfileTransition,
  approvalLifecycleProfileDigest,
  resolveApprovalLifecyclePolicy,
  resolveApprovalTimeout,
  resolveEffectiveApprovalExpiry,
  resolveEffectiveApprovalRiskTier,
  type ApprovalLifecycleClock,
} from './approval-lifecycle-policy.js';
import { createJsonFileFirstWriterWins } from './approval-file-cas.js';

const CONFIRMATIONS_DIR = join('.deckent', 'runtime', 'confirmations');
const SHA256_HEX = /^[a-f0-9]{64}$/u;

export interface ConfirmationIdentity {
  readonly attemptId: string;
  readonly generation: number;
  readonly sourceDigest: string;
  readonly evidenceDigest: string;
  readonly revisionDigest: string;
}

export interface ConfirmationRequest {
  readonly id: string;
  readonly sprintId: string;
  readonly taskId: string;
  readonly itemIds: readonly string[];
  readonly kind: TaskKind;
  readonly verdict: DecidableVerdict;
  readonly adapter: ConfirmationAdapter;
  readonly statements: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly requestedAt: string;
  readonly source: 'acceptance-matrix';
  readonly authorProvider?: string;
  /** Optional only on source-compatible acceptance intents and legacy reads. */
  readonly identity?: ConfirmationIdentity;
  readonly expiresAt?: string;
  readonly approval?: ApprovalRequestV2;
}

export interface LifecycleConfirmationRequest extends ConfirmationRequest {
  readonly identity: ConfirmationIdentity;
  readonly expiresAt: string;
  readonly approval: ApprovalRequestV2;
}

export interface ConfirmationOutcome {
  readonly verdict: Extract<NormativeVerdict, 'CONFIRMED' | 'FAILED' | 'UNDECIDABLE'>;
  readonly decidedBy: ConfirmationAdapter | 'system:expiry';
  readonly reason: string;
  readonly receipt?: string;
  readonly decidedAt: string;
  readonly closureReason?: 'expired';
  readonly parked?: true;
}

export interface SettledConfirmation extends LifecycleConfirmationRequest {
  readonly outcome: ConfirmationOutcome;
}

export type ConfirmationQuarantineReason =
  | 'unreadable-json'
  | 'invalid-confirmation-contract'
  | 'invalid-lifecycle-envelope'
  | 'filename-id-mismatch';

export interface ConfirmationQuarantineEntry {
  readonly file: string;
  readonly sourceReference: string;
  readonly reasonCode: ConfirmationQuarantineReason;
  readonly observedAt: string;
}

export interface ConfirmationStoreOptions {
  readonly lifecycle?: ResolvedApprovalLifecycleConfig;
  readonly clock?: ApprovalLifecycleClock;
}

export interface CreateConfirmationOptions extends ConfirmationStoreOptions {
  readonly identity?: ConfirmationIdentity;
  readonly tenantId?: string;
  readonly userId?: string;
}

function pendingDir(projectRoot: string): string {
  return join(projectRoot, CONFIRMATIONS_DIR, 'pending');
}

function settledDir(projectRoot: string): string {
  return join(projectRoot, CONFIRMATIONS_DIR, 'settled');
}

function quarantineDir(projectRoot: string): string {
  return join(projectRoot, CONFIRMATIONS_DIR, 'quarantine');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function confirmationContentDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function assertIdentity(identity: unknown): asserts identity is ConfirmationIdentity {
  if (!isPlainObject(identity)
    || Object.keys(identity).some(key => ![
      'attemptId', 'generation', 'sourceDigest', 'evidenceDigest', 'revisionDigest',
    ].includes(key))
    || typeof identity['attemptId'] !== 'string'
    || !identity['attemptId'].trim()
    || identity['attemptId'].length > 96
    || !Number.isSafeInteger(identity['generation'])
    || Number(identity['generation']) < 0
    || typeof identity['sourceDigest'] !== 'string'
    || !SHA256_HEX.test(identity['sourceDigest'])
    || typeof identity['evidenceDigest'] !== 'string'
    || !SHA256_HEX.test(identity['evidenceDigest'])
    || typeof identity['revisionDigest'] !== 'string'
    || !SHA256_HEX.test(identity['revisionDigest'])) {
    throw new DeckentError('E_CONFIRMATION_IDENTITY_INVALID', 'confirmation identity is invalid');
  }
}

function derivedIdentity(
  request: Omit<ConfirmationRequest, 'id' | 'expiresAt' | 'approval'>,
): ConfirmationIdentity {
  const sourceDigest = confirmationContentDigest({
    source: request.source,
    sprintId: request.sprintId,
    taskId: request.taskId,
    kind: request.kind,
    verdict: request.verdict,
    adapter: request.adapter,
  });
  return {
    attemptId: `legacy:${request.sprintId}:${request.taskId}`,
    generation: 0,
    sourceDigest,
    evidenceDigest: confirmationContentDigest(request.evidenceRequirements),
    revisionDigest: confirmationContentDigest({
      itemIds: [...request.itemIds].sort(),
      statements: request.statements,
    }),
  };
}

/** Identity includes exact content lineage plus the explicit successor key. */
export function confirmationRequestId(
  input: Pick<ConfirmationRequest, 'sprintId' | 'taskId' | 'itemIds' | 'adapter'>
    & { readonly identity?: ConfirmationIdentity },
): string {
  const identity = input.identity ?? {
    attemptId: `legacy:${input.sprintId}:${input.taskId}`,
    generation: 0,
    sourceDigest: confirmationContentDigest([input.sprintId, input.taskId, input.adapter]),
    evidenceDigest: confirmationContentDigest([]),
    revisionDigest: confirmationContentDigest([...input.itemIds].sort()),
  };
  assertIdentity(identity);
  const digest = confirmationContentDigest({
    sprintId: input.sprintId,
    taskId: input.taskId,
    itemIds: [...input.itemIds].sort(),
    adapter: input.adapter,
    identity,
  }).slice(0, 32);
  return `cnf-${digest}`;
}

function compatibilityLifecycle(): ResolvedApprovalLifecycleConfig {
  return resolveApprovalLifecyclePolicy({ enabled: true });
}

function buildLifecycleRecord(
  id: string,
  request: Omit<ConfirmationRequest, 'id' | 'expiresAt' | 'approval'>,
  identity: ConfirmationIdentity,
  lifecycle: ResolvedApprovalLifecycleConfig,
  options: CreateConfirmationOptions,
  sourceVersion: typeof APPROVAL_CONTRACT_V1_VERSION | typeof APPROVAL_CONTRACT_V2_VERSION,
): LifecycleConfirmationRequest {
  assertIdentity(identity);
  const profile = lifecycle.profiles.confirmation;
  const clock = options.clock ?? (() => new Date());
  const expiry = resolveEffectiveApprovalExpiry({ createdAt: request.requestedAt, profile, clock });
  const riskTier = resolveEffectiveApprovalRiskTier({
    origin: 'confirmation',
    producerRisk: request.kind === 'security' ? 'critical' : 'medium',
    securitySensitive: request.kind === 'security',
    policy: lifecycle,
  });
  const lifecycleProfile = { ...profile, slaMs: [...profile.slaMs] as [number, number, number] };
  const policySnapshotDigest = approvalLifecycleProfileDigest('confirmation', lifecycleProfile);
  const approvalCandidate = {
    version: APPROVAL_CONTRACT_V2_VERSION,
    id,
    requester: { role: 'brain' as const, instanceId: identity.attemptId },
    summary: (request.statements[0] ?? `${request.kind}:${request.verdict}`).slice(0, 200),
    details: {
      kind: 'confirmation',
      sprintId: request.sprintId,
      taskId: request.taskId,
      sourceDigest: identity.sourceDigest,
      evidenceDigest: identity.evidenceDigest,
      revisionDigest: identity.revisionDigest,
    },
    scopeId: `${request.sprintId}:${request.taskId}`,
    scope: 'lifecycle' as const,
    risk: request.kind === 'security' ? 'critical' as const : 'medium' as const,
    policy: 'require-approval' as const,
    defaultAction: 'defer' as const,
    tenantId: options.tenantId ?? 'local',
    userId: options.userId ?? 'system:acceptance-matrix',
    createdAt: request.requestedAt,
    expiresAt: expiry.expiresAt,
    origin: 'confirmation' as const,
    riskTier,
    blocking: lifecycleProfile.blocking,
    lifecycleProfile,
    policySnapshotDigest,
    source: {
      contractVersion: sourceVersion,
      requestDigest: identity.sourceDigest,
      reference: `confirmation-source:${identity.sourceDigest}`,
    },
    lifecycleGeneration: `${identity.attemptId}:${identity.generation}`,
    slaStage: 'initial' as const,
  };
  const parsed = validateApprovalRequest(approvalCandidate);
  if (!parsed.ok || parsed.value.version !== APPROVAL_CONTRACT_V2_VERSION) {
    throw new DeckentError(
      'E_CONFIRMATION_LIFECYCLE_INVALID',
      `confirmation lifecycle envelope is invalid: ${parsed.ok ? 'wrong-version' : parsed.errors.join('; ')}`,
    );
  }
  return { ...request, id, identity, expiresAt: expiry.expiresAt, approval: parsed.value };
}

function sameRecord(left: LifecycleConfirmationRequest, right: LifecycleConfirmationRequest): boolean {
  return confirmationContentDigest(left) === confirmationContentDigest(right);
}

/** Create one lifecycle-v2 request; absent or disabled policy holds fail-closed. */
export function createConfirmationRequest(
  projectRoot: string,
  request: Omit<ConfirmationRequest, 'id' | 'expiresAt' | 'approval'>,
  options: CreateConfirmationOptions = {},
): { id: string; created: boolean } {
  const lifecycle = options.lifecycle ?? resolveApprovalLifecyclePolicy();
  if (!lifecycle.enabled) {
    throw new DeckentError(
      'E_CONFIRMATION_LIFECYCLE_DISABLED',
      'approval lifecycle is disabled; confirmation pending creation is held',
    );
  }
  const identity = options.identity ?? request.identity ?? derivedIdentity(request);
  const id = confirmationRequestId({ ...request, identity });
  const record = buildLifecycleRecord(
    id,
    request,
    identity,
    lifecycle,
    options,
    options.identity === undefined && request.identity === undefined
      ? APPROVAL_CONTRACT_V1_VERSION
      : APPROVAL_CONTRACT_V2_VERSION,
  );
  const pendingPath = join(pendingDir(projectRoot), `${id}.json`);
  const settledPath = join(settledDir(projectRoot), `${id}.json`);
  const existingPath = existsSync(settledPath) ? settledPath : existsSync(pendingPath) ? pendingPath : null;
  if (existingPath) {
    const existing = readNormalizedFile(projectRoot, existingPath, options, false);
    if (!existing || !sameRecord(existing.request, record)) {
      throw new DeckentError('E_CONFIRMATION_ID_COLLISION', `confirmation identity collision: ${id}`);
    }
    return { id, created: false };
  }
  mkdirSync(pendingDir(projectRoot), { recursive: true, mode: 0o700 });
  const created = createJsonFileFirstWriterWins(pendingPath, record);
  if (!created) {
    const existing = readNormalizedFile(projectRoot, pendingPath, options, false);
    if (!existing || !sameRecord(existing.request, record)) {
      throw new DeckentError('E_CONFIRMATION_ID_COLLISION', `confirmation identity collision: ${id}`);
    }
  }
  return { id, created };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function baseConfirmation(value: Record<string, unknown>): value is Record<string, unknown> & ConfirmationRequest {
  return typeof value['id'] === 'string'
    && /^cnf-(?:[a-f0-9]{16}|[a-f0-9]{32})$/u.test(value['id'])
    && typeof value['sprintId'] === 'string'
    && value['sprintId'].length > 0
    && typeof value['taskId'] === 'string'
    && value['taskId'].length > 0
    && isStringArray(value['itemIds'])
    && TASK_KINDS.includes(value['kind'] as TaskKind)
    && DECIDABLE_VERDICTS.includes(value['verdict'] as DecidableVerdict)
    && ['deterministic', 'code', 'llm', 'human'].includes(String(value['adapter']))
    && isStringArray(value['statements'])
    && value['statements'].length > 0
    && isStringArray(value['evidenceRequirements'])
    && isUtcTimestamp(value['requestedAt'])
    && value['source'] === 'acceptance-matrix'
    && (value['authorProvider'] === undefined || typeof value['authorProvider'] === 'string');
}

function parseOutcome(value: unknown): ConfirmationOutcome | undefined {
  if (!isPlainObject(value)
    || Object.keys(value).some(key => ![
      'verdict', 'decidedBy', 'reason', 'receipt', 'decidedAt', 'closureReason', 'parked',
    ].includes(key))
    || !['CONFIRMED', 'FAILED', 'UNDECIDABLE'].includes(String(value['verdict']))
    || !['deterministic', 'code', 'llm', 'human', 'system:expiry'].includes(String(value['decidedBy']))
    || typeof value['reason'] !== 'string'
    || value['reason'].trim().length === 0
    || !isUtcTimestamp(value['decidedAt'])
    || (value['receipt'] !== undefined && typeof value['receipt'] !== 'string')) {
    return undefined;
  }
  const systemExpiry = value['decidedBy'] === 'system:expiry';
  const parkedExpiry = systemExpiry && value['verdict'] === 'UNDECIDABLE';
  const deniedExpiry = systemExpiry && value['verdict'] === 'FAILED';
  if (systemExpiry !== (value['closureReason'] === 'expired')
    || (systemExpiry && !parkedExpiry && !deniedExpiry)
    || parkedExpiry !== (value['parked'] === true)
    || (!systemExpiry && value['verdict'] === 'UNDECIDABLE')
    || (!systemExpiry && (value['closureReason'] !== undefined || value['parked'] !== undefined))) {
    return undefined;
  }
  return value as unknown as ConfirmationOutcome;
}

function quarantine(
  projectRoot: string,
  filePath: string,
  reasonCode: ConfirmationQuarantineReason,
  clock: ApprovalLifecycleClock,
): void {
  const observedAt = clock().toISOString();
  const file = filePath.split(/[\\/]/u).pop() ?? 'unknown.json';
  const digest = confirmationContentDigest([filePath, reasonCode]).slice(0, 16);
  const dir = quarantineDir(projectRoot);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const sourceReference = `confirmation-quarantine:${file}:${digest}`;
  createJsonFileFirstWriterWins(join(dir, `${file}.${digest}.quarantine.json`), {
    file, sourceReference, reasonCode, observedAt,
  });
  const bytesPath = join(dir, `${file}.${digest}.source.json`);
  if (!existsSync(bytesPath) && existsSync(filePath)) {
    try { renameSync(filePath, bytesPath); } catch { /* receipt retains the typed origin */ }
  }
}

function normalizeLegacyRecord(
  value: Record<string, unknown> & ConfirmationRequest,
  options: ConfirmationStoreOptions,
  exactSourceDigest: string,
): LifecycleConfirmationRequest {
  const rawWithoutEnvelope = Object.fromEntries(
    Object.entries(value).filter(([key]) => !['id', 'outcome', 'expiresAt', 'approval'].includes(key)),
  ) as unknown as Omit<ConfirmationRequest, 'id' | 'expiresAt' | 'approval'>;
  const derived = derivedIdentity(rawWithoutEnvelope);
  const identity: ConfirmationIdentity = {
    ...derived,
    sourceDigest: exactSourceDigest,
  };
  return buildLifecycleRecord(
    value.id,
    rawWithoutEnvelope,
    identity,
    options.lifecycle ?? compatibilityLifecycle(),
    { ...options, clock: options.clock ?? (() => new Date(value.requestedAt)) },
    APPROVAL_CONTRACT_V1_VERSION,
  );
}

function readNormalizedFile(
  projectRoot: string,
  filePath: string,
  options: ConfirmationStoreOptions,
  quarantineInvalid: boolean,
): { request: LifecycleConfirmationRequest; outcome?: ConfirmationOutcome } | null {
  const clock = options.clock ?? (() => new Date());
  let parsed: unknown;
  let sourceBytes: string;
  try {
    sourceBytes = readFileSync(filePath, 'utf-8');
    parsed = JSON.parse(sourceBytes);
  } catch {
    if (quarantineInvalid) quarantine(projectRoot, filePath, 'unreadable-json', clock);
    return null;
  }
  if (!isPlainObject(parsed) || !baseConfirmation(parsed)) {
    if (quarantineInvalid) quarantine(projectRoot, filePath, 'invalid-confirmation-contract', clock);
    return null;
  }
  let request: LifecycleConfirmationRequest;
  if (parsed['approval'] === undefined) {
    try {
      request = normalizeLegacyRecord(
        parsed,
        options,
        createHash('sha256').update(sourceBytes).digest('hex'),
      );
    } catch {
      if (quarantineInvalid) quarantine(projectRoot, filePath, 'invalid-lifecycle-envelope', clock);
      return null;
    }
  } else {
    const allowedV2Fields = [
      'id', 'sprintId', 'taskId', 'itemIds', 'kind', 'verdict', 'adapter',
      'statements', 'evidenceRequirements', 'requestedAt', 'source', 'authorProvider',
      'identity', 'expiresAt', 'approval', 'outcome',
    ];
    const approval = validateStoredApprovalRequest(parsed['approval']);
    if (!approval.ok || approval.value.version !== APPROVAL_CONTRACT_V2_VERSION
      || !isPlainObject(parsed['identity'])
      || typeof parsed['expiresAt'] !== 'string'
      || Object.keys(parsed).some(key => !allowedV2Fields.includes(key))) {
      if (quarantineInvalid) quarantine(projectRoot, filePath, 'invalid-lifecycle-envelope', clock);
      return null;
    }
    request = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key !== 'outcome'),
    ) as unknown as LifecycleConfirmationRequest;
    try { assertIdentity(request.identity); } catch {
      if (quarantineInvalid) quarantine(projectRoot, filePath, 'invalid-lifecycle-envelope', clock);
      return null;
    }
    if (request.id !== request.approval.id
      || request.id !== confirmationRequestId(request)
      || request.requestedAt !== request.approval.createdAt
      || request.expiresAt !== request.approval.expiresAt
      || request.approval.origin !== 'confirmation'
      || request.approval.scopeId !== `${request.sprintId}:${request.taskId}`
      || request.approval.requester.instanceId !== request.identity.attemptId
      || request.approval.lifecycleGeneration !== `${request.identity.attemptId}:${request.identity.generation}`
      || request.approval.source.requestDigest !== request.identity.sourceDigest
      || request.approval.source.reference !== `confirmation-source:${request.identity.sourceDigest}`
      || request.approval.details['kind'] !== 'confirmation'
      || request.approval.details['sprintId'] !== request.sprintId
      || request.approval.details['taskId'] !== request.taskId
      || request.approval.details['sourceDigest'] !== request.identity.sourceDigest
      || request.approval.details['evidenceDigest'] !== request.identity.evidenceDigest
      || request.approval.details['revisionDigest'] !== request.identity.revisionDigest) {
      if (quarantineInvalid) quarantine(projectRoot, filePath, 'invalid-lifecycle-envelope', clock);
      return null;
    }
  }
  const filename = filePath.split(/[\\/]/u).pop();
  if (filename && filename !== `${request.id}.json`) {
    if (quarantineInvalid) quarantine(projectRoot, filePath, 'filename-id-mismatch', clock);
    return null;
  }
  const outcome = parsed['outcome'] === undefined ? undefined : parseOutcome(parsed['outcome']);
  if (parsed['outcome'] !== undefined && !outcome) {
    if (quarantineInvalid) quarantine(projectRoot, filePath, 'invalid-confirmation-contract', clock);
    return null;
  }
  return { request, ...(outcome ? { outcome } : {}) };
}

function effectiveExpiresAt(
  request: LifecycleConfirmationRequest,
  lifecycle?: ResolvedApprovalLifecycleConfig,
): string {
  const applied = effectiveProfile(request, lifecycle);
  return new Date(Math.min(
    Date.parse(request.expiresAt),
    Date.parse(request.requestedAt) + applied.ttlMs,
  )).toISOString();
}

function effectiveProfile(
  request: LifecycleConfirmationRequest,
  lifecycle?: ResolvedApprovalLifecycleConfig,
) {
  const current = lifecycle?.profiles.confirmation ?? request.approval.lifecycleProfile;
  return applyApprovalLifecycleProfileTransition(request.approval.lifecycleProfile, current).profile;
}

function publishSettlement(
  projectRoot: string,
  request: LifecycleConfirmationRequest,
  outcome: ConfirmationOutcome,
): { record: SettledConfirmation; won: boolean } {
  if (!parseOutcome(outcome)) {
    throw new DeckentError('E_CONFIRMATION_OUTCOME_INVALID', `confirmation ${request.id} outcome is invalid`);
  }
  const settledPath = join(settledDir(projectRoot), `${request.id}.json`);
  mkdirSync(settledDir(projectRoot), { recursive: true, mode: 0o700 });
  const record: SettledConfirmation = { ...request, outcome };
  const won = createJsonFileFirstWriterWins(settledPath, record);
  if (won) {
    try { unlinkSync(join(pendingDir(projectRoot), `${request.id}.json`)); } catch { /* settled wins reads */ }
    return { record, won };
  }
  const existing = readNormalizedFile(projectRoot, settledPath, {}, false);
  if (!existing?.outcome) {
    throw new DeckentError('E_CONFIRMATION_SETTLEMENT_INVALID', `confirmation ${request.id} settlement is invalid`);
  }
  return { record: { ...existing.request, outcome: existing.outcome }, won };
}

function expireRequest(
  projectRoot: string,
  request: LifecycleConfirmationRequest,
  at: Date,
  lifecycle?: ResolvedApprovalLifecycleConfig,
): SettledConfirmation {
  const profile = effectiveProfile(request, lifecycle);
  const timeout = resolveApprovalTimeout({
    origin: 'confirmation',
    profile,
    riskTier: resolveEffectiveApprovalRiskTier({
      origin: 'confirmation',
      producerRisk: request.approval.risk,
      securitySensitive: request.kind === 'security',
      policy: { enabled: true, profiles: { ...resolveApprovalLifecyclePolicy().profiles, confirmation: profile } },
    }),
  });
  if (timeout.action === 'proceed-warn') {
    throw new DeckentError('E_CONFIRMATION_TIMEOUT_POLICY', 'confirmation timeout policy may never proceed');
  }
  return publishSettlement(projectRoot, request, {
    verdict: timeout.action === 'deny' ? 'FAILED' : 'UNDECIDABLE',
    decidedBy: 'system:expiry',
    reason: 'timeout-disposition',
    decidedAt: at.toISOString(),
    closureReason: 'expired',
    ...(timeout.action === 'park' ? { parked: true as const } : {}),
  }).record;
}

export function sweepExpiredConfirmations(
  projectRoot: string,
  options: ConfirmationStoreOptions = {},
): string[] {
  const dir = pendingDir(projectRoot);
  if (!existsSync(dir)) return [];
  const clock = options.clock ?? (() => new Date());
  const at = clock();
  const expired: string[] = [];
  for (const name of readdirSync(dir).filter(file => file.endsWith('.json'))) {
    const loaded = readNormalizedFile(projectRoot, join(dir, name), options, true);
    if (!loaded || existsSync(join(settledDir(projectRoot), `${loaded.request.id}.json`))) continue;
    if (at.getTime() >= Date.parse(effectiveExpiresAt(loaded.request, options.lifecycle))) {
      expireRequest(projectRoot, loaded.request, at, options.lifecycle);
      expired.push(loaded.request.id);
    }
  }
  return expired;
}

export function listPendingConfirmations(
  projectRoot: string,
  options: ConfirmationStoreOptions = {},
): LifecycleConfirmationRequest[] {
  sweepExpiredConfirmations(projectRoot, options);
  const dir = pendingDir(projectRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .flatMap((name) => {
      const loaded = readNormalizedFile(projectRoot, join(dir, name), options, true);
      if (!loaded || existsSync(join(settledDir(projectRoot), `${loaded.request.id}.json`))) return [];
      return [loaded.request];
    })
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/**
 * Side-effect-free pending projection for read-only surfaces such as MCP.
 * Overdue, settled and invalid rows are omitted from the effective pending
 * view without publishing expiry tombstones or quarantine records.
 */
export function listPendingConfirmationsReadOnly(
  projectRoot: string,
  options: ConfirmationStoreOptions = {},
): LifecycleConfirmationRequest[] {
  const dir = pendingDir(projectRoot);
  if (!existsSync(dir)) return [];
  const clock = options.clock ?? (() => new Date());
  const observedAt = clock().getTime();
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .flatMap((name) => {
      const loaded = readNormalizedFile(projectRoot, join(dir, name), options, false);
      if (!loaded
        || existsSync(join(settledDir(projectRoot), `${loaded.request.id}.json`))
        || observedAt >= Date.parse(effectiveExpiresAt(loaded.request, options.lifecycle))) return [];
      return [loaded.request];
    })
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function listConfirmationQuarantine(projectRoot: string): ConfirmationQuarantineEntry[] {
  const dir = quarantineDir(projectRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.quarantine.json'))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(dir, name), 'utf-8')) as ConfirmationQuarantineEntry];
      } catch { return []; }
    })
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
}

export function readConfirmation(
  projectRoot: string,
  id: string,
  options: ConfirmationStoreOptions = {},
): { state: 'pending'; request: LifecycleConfirmationRequest }
  | { state: 'settled'; request: SettledConfirmation }
  | null {
  if (!/^cnf-(?:[a-f0-9]{16}|[a-f0-9]{32})$/u.test(id)) return null;
  const settledPath = join(settledDir(projectRoot), `${id}.json`);
  if (existsSync(settledPath)) {
    const loaded = readNormalizedFile(projectRoot, settledPath, options, true);
    return loaded?.outcome ? { state: 'settled', request: { ...loaded.request, outcome: loaded.outcome } } : null;
  }
  const pendingPath = join(pendingDir(projectRoot), `${id}.json`);
  if (!existsSync(pendingPath)) return null;
  const loaded = readNormalizedFile(projectRoot, pendingPath, options, true);
  if (!loaded) return null;
  const clock = options.clock ?? (() => new Date());
  const at = clock();
  if (at.getTime() >= Date.parse(effectiveExpiresAt(loaded.request, options.lifecycle))) {
    return { state: 'settled', request: expireRequest(projectRoot, loaded.request, at, options.lifecycle) };
  }
  return { state: 'pending', request: loaded.request };
}

/** Expiry-aware, first-writer-wins settlement. A late decision can never revive. */
export function settleConfirmation(
  projectRoot: string,
  id: string,
  outcome: ConfirmationOutcome,
  options: ConfirmationStoreOptions = {},
): SettledConfirmation {
  const existing = readConfirmation(projectRoot, id, options);
  if (!existing || existing.state !== 'pending') {
    const expired = existing?.state === 'settled' && existing.request.outcome.closureReason === 'expired';
    throw new DeckentError(
      expired ? 'E_CONFIRMATION_EXPIRED' : 'E_CONFIRMATION_NOT_PENDING',
      expired
        ? `confirmation ${id} expired and is parked as UNDECIDABLE`
        : `confirmation ${id} is not pending (unknown or already settled)`,
    );
  }
  const clock = options.clock ?? (() => new Date());
  const at = clock();
  if (at.getTime() >= Date.parse(effectiveExpiresAt(existing.request, options.lifecycle))) {
    expireRequest(projectRoot, existing.request, at, options.lifecycle);
    throw new DeckentError('E_CONFIRMATION_EXPIRED', `confirmation ${id} expired and is parked as UNDECIDABLE`);
  }
  const published = publishSettlement(projectRoot, existing.request, { ...outcome, decidedAt: at.toISOString() });
  if (!published.won) {
    const expired = published.record.outcome.closureReason === 'expired';
    throw new DeckentError(
      expired ? 'E_CONFIRMATION_EXPIRED' : 'E_CONFIRMATION_NOT_PENDING',
      `confirmation ${id} lost the first-writer settlement race`,
    );
  }
  return published.record;
}
