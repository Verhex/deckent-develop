import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createJsonFileFirstWriterWins } from './approval-file-cas.js';
import { normalizeGlobalScopePlatform, resolveGlobalScopePaths } from './global-scope-resolver.js';
import {
  assertExecutionBudgetShape,
  hasLiveUsageCeiling,
} from './live-execution-budget.js';
import type { ExecutionBudget, TaskKind } from './work-model.js';

export const EXECUTION_ADMISSION_SCHEMA_VERSION = 1 as const;

export type ExecutionAdmissionRole = 'brain' | 'worker' | 'auditor';
export type ExecutionAdmissionMode = 'attended' | 'unattended';
export type ExecutionAdmissionEvidenceState = 'known' | 'unknown' | 'stale' | 'unavailable';
export type ExecutionAdmissionDecision = 'allow' | 'hold';

export interface ExecutionAdmissionSelection {
  readonly provider: string | null;
  readonly model: string | null;
}

export interface ExecutionAdmissionEvidence {
  readonly state: ExecutionAdmissionEvidenceState;
  readonly evidenceRefs: readonly string[];
}

export interface ExecutionAdmissionFallbackAttempt {
  readonly sequence: number;
  readonly provider: string;
  readonly model: string;
  readonly accepted: boolean;
  readonly reasonCode: string;
  readonly reachabilityEvidenceRef: string | null;
  readonly limitEvidenceRefs: readonly string[];
}

export interface ExecutionAdmissionInput {
  readonly tenantId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly callId: string;
  readonly attemptId: string;
  readonly role: ExecutionAdmissionRole;
  readonly taskKind?: TaskKind;
  readonly mode: ExecutionAdmissionMode;
  readonly configured: ExecutionAdmissionSelection;
  readonly requested: ExecutionAdmissionSelection;
  readonly resolved: ExecutionAdmissionSelection;
  readonly authMode: 'subscription' | 'api' | 'hybrid' | 'local' | 'unknown';
  readonly configuredBackend: string;
  readonly resolvedBackend: string;
  readonly fallbackChain: readonly ExecutionAdmissionFallbackAttempt[];
  readonly reachability: ExecutionAdmissionEvidence;
  readonly limits: ExecutionAdmissionEvidence;
  readonly receiptRef: string | null;
  readonly approvalEvidenceRef: string | null;
  readonly budgetProfileRef: string | null;
  readonly budgetPolicyDigest: string | null;
  readonly budget: ExecutionBudget | null;
  readonly decision: ExecutionAdmissionDecision;
  readonly reasonCode: string;
  readonly createdAt?: string;
}

export interface StoredExecutionAdmission extends Omit<ExecutionAdmissionInput, 'createdAt'> {
  readonly schemaVersion: typeof EXECUTION_ADMISSION_SCHEMA_VERSION;
  readonly admissionId: string;
  readonly projectId: string;
  readonly createdAt: string;
  readonly payloadFingerprint: string;
  readonly manifestDigest: string;
}

export interface ExecutionAdmissionPermit {
  readonly schemaVersion: typeof EXECUTION_ADMISSION_SCHEMA_VERSION;
  readonly admissionId: string;
  readonly admissionRef: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly callId: string;
  readonly attemptId: string;
  readonly manifestDigest: string;
}

export interface ExecutionAdmissionDeclaration {
  readonly manifest: StoredExecutionAdmission;
  readonly created: boolean;
  readonly permit: ExecutionAdmissionPermit | null;
}

export interface ExecutionAdmissionDispatchClaim {
  readonly schemaVersion: typeof EXECUTION_ADMISSION_SCHEMA_VERSION;
  readonly admissionId: string;
  readonly manifestDigest: string;
  readonly executorId: string;
  readonly dispatchEvidenceRef: string;
  readonly claimedAt: string;
}

export interface ExecutionAdmissionClaimResult {
  readonly granted: boolean;
  readonly claim: ExecutionAdmissionDispatchClaim;
}

export type ExecutionAdmissionErrorCode =
  | 'INVALID_INPUT'
  | 'ADMISSION_CONFLICT'
  | 'ADMISSION_NOT_FOUND'
  | 'ADMISSION_CORRUPT'
  | 'PERMIT_MISMATCH'
  | 'DISPATCH_CLAIM_CORRUPT';

export class ExecutionAdmissionError extends Error {
  constructor(
    readonly code: ExecutionAdmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExecutionAdmissionError';
  }
}

export interface ExecutionAdmissionStoreOptions {
  /** Hermetic test seam. Production callers must use the host-global default. */
  readonly storeDir?: string;
  readonly now?: () => string;
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const EVIDENCE_STATES = new Set<ExecutionAdmissionEvidenceState>([
  'known', 'unknown', 'stale', 'unavailable',
]);
const AUTH_MODES = new Set(['subscription', 'api', 'hybrid', 'local', 'unknown']);
const ROLES = new Set<ExecutionAdmissionRole>(['brain', 'worker', 'auditor']);
const MODES = new Set<ExecutionAdmissionMode>(['attended', 'unattended']);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function assertIdentity(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || /[\r\n\0]/.test(value)) {
    throw new ExecutionAdmissionError('INVALID_INPUT', `${field} must be a non-empty bounded identity`);
  }
}

function cloneSelection(value: ExecutionAdmissionSelection, field: string): ExecutionAdmissionSelection {
  for (const key of ['provider', 'model'] as const) {
    const candidate = value?.[key];
    if (candidate !== null) assertIdentity(candidate, `${field}.${key}`);
  }
  return Object.freeze({ provider: value.provider, model: value.model });
}

function cloneRefs(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values)) {
    throw new ExecutionAdmissionError('INVALID_INPUT', `${field} must be an array`);
  }
  const seen = new Set<string>();
  const result = values.map((value, index) => {
    assertIdentity(value, `${field}[${index}]`);
    if (seen.has(value)) {
      throw new ExecutionAdmissionError('INVALID_INPUT', `${field} contains duplicate evidence ref '${value}'`);
    }
    seen.add(value);
    return value;
  });
  return Object.freeze(result);
}

function cloneEvidence(value: ExecutionAdmissionEvidence, field: string): ExecutionAdmissionEvidence {
  if (!value || !EVIDENCE_STATES.has(value.state)) {
    throw new ExecutionAdmissionError('INVALID_INPUT', `${field}.state is invalid`);
  }
  return Object.freeze({ state: value.state, evidenceRefs: cloneRefs(value.evidenceRefs, `${field}.evidenceRefs`) });
}

function cloneBudget(value: ExecutionBudget): ExecutionBudget {
  assertExecutionBudgetShape(value, 'execution-admission');
  return Object.freeze({ ...value });
}

function normalizeInput(input: ExecutionAdmissionInput): Omit<ExecutionAdmissionInput, 'createdAt'> & { createdAt: string } {
  for (const [field, value] of [
    ['tenantId', input.tenantId],
    ['runId', input.runId],
    ['taskId', input.taskId],
    ['callId', input.callId],
    ['attemptId', input.attemptId],
    ['configuredBackend', input.configuredBackend],
    ['resolvedBackend', input.resolvedBackend],
    ['reasonCode', input.reasonCode],
  ] as const) assertIdentity(value, field);
  if (!ROLES.has(input.role)) throw new ExecutionAdmissionError('INVALID_INPUT', 'role is invalid');
  if (!MODES.has(input.mode)) throw new ExecutionAdmissionError('INVALID_INPUT', 'mode is invalid');
  if (!AUTH_MODES.has(input.authMode)) throw new ExecutionAdmissionError('INVALID_INPUT', 'authMode is invalid');
  if (input.decision !== 'allow' && input.decision !== 'hold') {
    throw new ExecutionAdmissionError('INVALID_INPUT', 'decision is invalid');
  }

  const configured = cloneSelection(input.configured, 'configured');
  const requested = cloneSelection(input.requested, 'requested');
  const resolved = cloneSelection(input.resolved, 'resolved');
  const reachability = cloneEvidence(input.reachability, 'reachability');
  const limits = cloneEvidence(input.limits, 'limits');
  const fallbackChain = input.fallbackChain.map((attempt, index) => {
    if (attempt.sequence !== index + 1) {
      throw new ExecutionAdmissionError('INVALID_INPUT', 'fallbackChain sequence must be contiguous and one-based');
    }
    assertIdentity(attempt.provider, `fallbackChain[${index}].provider`);
    assertIdentity(attempt.model, `fallbackChain[${index}].model`);
    assertIdentity(attempt.reasonCode, `fallbackChain[${index}].reasonCode`);
    if (attempt.reachabilityEvidenceRef !== null) {
      assertIdentity(attempt.reachabilityEvidenceRef, `fallbackChain[${index}].reachabilityEvidenceRef`);
    }
    return Object.freeze({
      ...attempt,
      limitEvidenceRefs: cloneRefs(attempt.limitEvidenceRefs, `fallbackChain[${index}].limitEvidenceRefs`),
    });
  });
  const acceptedFallbacks = fallbackChain.filter(attempt => attempt.accepted);
  if (acceptedFallbacks.length > 1) {
    throw new ExecutionAdmissionError('INVALID_INPUT', 'fallbackChain may contain at most one accepted attempt');
  }
  const budget = input.budget === null ? null : cloneBudget(input.budget);
  for (const [field, value] of [
    ['receiptRef', input.receiptRef],
    ['approvalEvidenceRef', input.approvalEvidenceRef],
    ['budgetProfileRef', input.budgetProfileRef],
  ] as const) {
    if (value !== null) assertIdentity(value, field);
  }
  if (input.budgetPolicyDigest !== null && !SHA256_RE.test(input.budgetPolicyDigest)) {
    throw new ExecutionAdmissionError('INVALID_INPUT', 'budgetPolicyDigest must be a SHA-256 hex digest');
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new ExecutionAdmissionError('INVALID_INPUT', 'createdAt must be an ISO-compatible timestamp');
  }

  if (input.decision === 'allow') {
    if (!budget || !hasLiveUsageCeiling(budget) || budget.maxUsd !== undefined) {
      throw new ExecutionAdmissionError(
        'INVALID_INPUT',
        'allow requires measured token/cache/context/turn ceilings; live USD-only admission is unsupported',
      );
    }
    if (resolved.provider === null || resolved.model === null) {
      throw new ExecutionAdmissionError('INVALID_INPUT', 'allow requires exact resolved provider and model');
    }
    if (input.receiptRef === null || input.budgetProfileRef === null || input.budgetPolicyDigest === null) {
      throw new ExecutionAdmissionError('INVALID_INPUT', 'allow requires receiptRef, budgetProfileRef, and budgetPolicyDigest');
    }
    if (reachability.state !== 'known' || reachability.evidenceRefs.length === 0) {
      throw new ExecutionAdmissionError('INVALID_INPUT', 'allow requires known reachability evidence');
    }
    const acceptedFallback = acceptedFallbacks[0];
    if (!acceptedFallback
      || acceptedFallbacks.length !== 1
      || acceptedFallback.provider !== resolved.provider
      || acceptedFallback.model !== resolved.model) {
      throw new ExecutionAdmissionError('INVALID_INPUT', 'allow requires one accepted fallback attempt matching resolved identity');
    }
    if (input.mode === 'unattended') {
      if (limits.state !== 'known' || limits.evidenceRefs.length === 0) {
        throw new ExecutionAdmissionError('INVALID_INPUT', 'unattended allow requires known limit evidence');
      }
    } else {
      if (input.approvalEvidenceRef === null) {
        throw new ExecutionAdmissionError('INVALID_INPUT', 'attended allow requires approvalEvidenceRef');
      }
      if (limits.state === 'known' && limits.evidenceRefs.length === 0) {
        throw new ExecutionAdmissionError('INVALID_INPUT', 'known limit state requires evidence refs');
      }
      if (limits.state !== 'known' && limits.state !== 'unknown') {
        throw new ExecutionAdmissionError('INVALID_INPUT', 'attended allow accepts only known or explicitly approved unknown limit state');
      }
    }
  } else if (acceptedFallbacks.length !== 0) {
    throw new ExecutionAdmissionError('INVALID_INPUT', 'hold admission cannot carry an accepted fallback attempt');
  }

  return Object.freeze({
    ...input,
    configured,
    requested,
    resolved,
    fallbackChain: Object.freeze(fallbackChain),
    reachability,
    limits,
    budget,
    createdAt,
  });
}

function payloadWithoutTime(normalized: ReturnType<typeof normalizeInput>): Omit<typeof normalized, 'createdAt'> {
  const { createdAt: _createdAt, ...payload } = normalized;
  return payload;
}

function permitFrom(manifest: StoredExecutionAdmission): ExecutionAdmissionPermit | null {
  if (manifest.decision !== 'allow') return null;
  return Object.freeze({
    schemaVersion: EXECUTION_ADMISSION_SCHEMA_VERSION,
    admissionId: manifest.admissionId,
    admissionRef: `execution-admission:${manifest.admissionId}`,
    projectId: manifest.projectId,
    taskId: manifest.taskId,
    callId: manifest.callId,
    attemptId: manifest.attemptId,
    manifestDigest: manifest.manifestDigest,
  });
}

function manifestPayload(manifest: StoredExecutionAdmission): Omit<StoredExecutionAdmission, 'manifestDigest'> {
  const { manifestDigest: _manifestDigest, ...payload } = manifest;
  return payload;
}

/** Host-global, append-only execution admission authority. */
export class ExecutionAdmissionStore {
  readonly projectId: string;
  readonly storeDir: string;
  private readonly now: () => string;

  constructor(projectRoot: string, options: ExecutionAdmissionStoreOptions = {}) {
    this.projectId = sha256(canonicalProjectRoot(projectRoot));
    const platform = normalizeGlobalScopePlatform(process.platform, process.env);
    const stateDir = resolveGlobalScopePaths(platform, process.env).stateDir;
    this.storeDir = options.storeDir
      ?? join(stateDir, 'runtime', 'execution-admissions', this.projectId);
    this.now = options.now ?? (() => new Date().toISOString());
    mkdirSync(this.storeDir, { recursive: true, mode: 0o700 });
  }

  private manifestPath(admissionId: string): string {
    return join(this.storeDir, `${admissionId}.manifest.json`);
  }

  private claimPath(admissionId: string): string {
    return join(this.storeDir, `${admissionId}.dispatch.json`);
  }

  declare(input: ExecutionAdmissionInput): ExecutionAdmissionDeclaration {
    const normalized = normalizeInput({ ...input, createdAt: input.createdAt ?? this.now() });
    const identity = {
      tenantId: normalized.tenantId,
      projectId: this.projectId,
      runId: normalized.runId,
      taskId: normalized.taskId,
      callId: normalized.callId,
      attemptId: normalized.attemptId,
    };
    const admissionId = `xad-${sha256(canonicalJson(identity))}`;
    const payloadFingerprint = sha256(canonicalJson(payloadWithoutTime(normalized)));
    const unsigned = {
      schemaVersion: EXECUTION_ADMISSION_SCHEMA_VERSION,
      admissionId,
      projectId: this.projectId,
      ...normalized,
      payloadFingerprint,
    };
    const manifest: StoredExecutionAdmission = Object.freeze({
      ...unsigned,
      manifestDigest: sha256(canonicalJson(unsigned)),
    });
    const path = this.manifestPath(admissionId);
    const created = createJsonFileFirstWriterWins(path, manifest);
    if (!created) {
      const existing = this.readById(admissionId);
      if (existing.payloadFingerprint !== payloadFingerprint) {
        throw new ExecutionAdmissionError(
          'ADMISSION_CONFLICT',
          `Execution admission identity ${admissionId} already has a different immutable payload`,
        );
      }
      return { manifest: existing, created: false, permit: permitFrom(existing) };
    }
    return { manifest, created: true, permit: permitFrom(manifest) };
  }

  read(admissionRef: string): StoredExecutionAdmission {
    const prefix = 'execution-admission:';
    if (!admissionRef.startsWith(prefix)) {
      throw new ExecutionAdmissionError('ADMISSION_NOT_FOUND', 'Execution admission ref is invalid');
    }
    return this.readById(admissionRef.slice(prefix.length));
  }

  verify(
    permit: ExecutionAdmissionPermit,
    expected?: {
      readonly taskId?: string;
      readonly provider?: string;
      readonly model?: string;
      readonly backend?: string;
      readonly budget?: ExecutionBudget;
      readonly receiptRef?: string;
      readonly budgetPolicyDigest?: string;
    },
  ): StoredExecutionAdmission {
    if (permit.schemaVersion !== EXECUTION_ADMISSION_SCHEMA_VERSION
      || permit.projectId !== this.projectId
      || permit.admissionRef !== `execution-admission:${permit.admissionId}`) {
      throw new ExecutionAdmissionError('PERMIT_MISMATCH', 'Execution admission permit identity mismatch');
    }
    const manifest = this.readById(permit.admissionId);
    if (manifest.decision !== 'allow'
      || manifest.manifestDigest !== permit.manifestDigest
      || manifest.taskId !== permit.taskId
      || manifest.callId !== permit.callId
      || manifest.attemptId !== permit.attemptId) {
      throw new ExecutionAdmissionError('PERMIT_MISMATCH', 'Execution admission permit does not match the durable manifest');
    }
    const mismatched = expected && (
      (expected.taskId !== undefined && expected.taskId !== manifest.taskId)
      || (expected.provider !== undefined && expected.provider !== manifest.resolved.provider)
      || (expected.model !== undefined && expected.model !== manifest.resolved.model)
      || (expected.backend !== undefined && expected.backend !== manifest.resolvedBackend)
      || (expected.receiptRef !== undefined && expected.receiptRef !== manifest.receiptRef)
      || (expected.budgetPolicyDigest !== undefined && expected.budgetPolicyDigest !== manifest.budgetPolicyDigest)
      || (expected.budget !== undefined && canonicalJson(expected.budget) !== canonicalJson(manifest.budget))
    );
    if (mismatched) {
      throw new ExecutionAdmissionError('PERMIT_MISMATCH', 'Execution admission permit failed exact dispatch matching');
    }
    return manifest;
  }

  claimDispatch(
    permit: ExecutionAdmissionPermit,
    input: { executorId: string; dispatchEvidenceRef: string; claimedAt?: string },
  ): ExecutionAdmissionClaimResult {
    const manifest = this.verify(permit);
    assertIdentity(input.executorId, 'executorId');
    assertIdentity(input.dispatchEvidenceRef, 'dispatchEvidenceRef');
    const claimedAt = input.claimedAt ?? this.now();
    if (!Number.isFinite(Date.parse(claimedAt))) {
      throw new ExecutionAdmissionError('INVALID_INPUT', 'claimedAt must be an ISO-compatible timestamp');
    }
    const claim: ExecutionAdmissionDispatchClaim = Object.freeze({
      schemaVersion: EXECUTION_ADMISSION_SCHEMA_VERSION,
      admissionId: manifest.admissionId,
      manifestDigest: manifest.manifestDigest,
      executorId: input.executorId,
      dispatchEvidenceRef: input.dispatchEvidenceRef,
      claimedAt,
    });
    const path = this.claimPath(manifest.admissionId);
    if (createJsonFileFirstWriterWins(path, claim)) return { granted: true, claim };
    let existing: ExecutionAdmissionDispatchClaim;
    try {
      existing = JSON.parse(readFileSync(path, 'utf-8')) as ExecutionAdmissionDispatchClaim;
    } catch {
      throw new ExecutionAdmissionError('DISPATCH_CLAIM_CORRUPT', 'Existing execution dispatch claim is unreadable');
    }
    if (existing.schemaVersion !== EXECUTION_ADMISSION_SCHEMA_VERSION
      || existing.admissionId !== manifest.admissionId
      || existing.manifestDigest !== manifest.manifestDigest
      || typeof existing.executorId !== 'string'
      || typeof existing.dispatchEvidenceRef !== 'string'
      || !Number.isFinite(Date.parse(existing.claimedAt))) {
      throw new ExecutionAdmissionError('DISPATCH_CLAIM_CORRUPT', 'Existing execution dispatch claim is invalid');
    }
    return { granted: false, claim: Object.freeze(existing) };
  }

  private readById(admissionId: string): StoredExecutionAdmission {
    if (!/^xad-[a-f0-9]{64}$/.test(admissionId)) {
      throw new ExecutionAdmissionError('ADMISSION_NOT_FOUND', 'Execution admission id is invalid');
    }
    const path = this.manifestPath(admissionId);
    if (!existsSync(path)) {
      throw new ExecutionAdmissionError('ADMISSION_NOT_FOUND', `Execution admission ${admissionId} does not exist`);
    }
    let manifest: StoredExecutionAdmission;
    try {
      manifest = JSON.parse(readFileSync(path, 'utf-8')) as StoredExecutionAdmission;
    } catch {
      throw new ExecutionAdmissionError('ADMISSION_CORRUPT', `Execution admission ${admissionId} is unreadable`);
    }
    const identity = {
      tenantId: manifest.tenantId,
      projectId: manifest.projectId,
      runId: manifest.runId,
      taskId: manifest.taskId,
      callId: manifest.callId,
      attemptId: manifest.attemptId,
    };
    const {
      schemaVersion: _schemaVersion,
      admissionId: _admissionId,
      projectId: _projectId,
      createdAt: _createdAt,
      payloadFingerprint: _payloadFingerprint,
      manifestDigest: _manifestDigest,
      ...authoritativePayload
    } = manifest;
    let normalizedFingerprint: string | null = null;
    try {
      const normalized = normalizeInput({ ...authoritativePayload, createdAt: manifest.createdAt });
      normalizedFingerprint = sha256(canonicalJson(payloadWithoutTime(normalized)));
    } catch {
      normalizedFingerprint = null;
    }
    if (manifest.schemaVersion !== EXECUTION_ADMISSION_SCHEMA_VERSION
      || manifest.admissionId !== admissionId
      || manifest.projectId !== this.projectId
      || admissionId !== `xad-${sha256(canonicalJson(identity))}`
      || !SHA256_RE.test(manifest.payloadFingerprint)
      || manifest.payloadFingerprint !== normalizedFingerprint
      || !SHA256_RE.test(manifest.manifestDigest)
      || sha256(canonicalJson(manifestPayload(manifest))) !== manifest.manifestDigest) {
      throw new ExecutionAdmissionError('ADMISSION_CORRUPT', `Execution admission ${admissionId} failed integrity validation`);
    }
    return Object.freeze(manifest);
  }
}
