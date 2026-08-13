import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { ApprovalBroker, type ApprovalRequestInput } from './approval-broker.js';
import type { ApprovalDecision, ApprovalRequest, RequesterRole } from './approval-contract.js';
import {
  ApprovalDecisionAuthority,
  approvalRequestDigest,
} from './approval-decision-ingress.js';
import { createJsonFileFirstWriterWins } from './approval-file-cas.js';
import { normalizeGlobalScopePlatform, resolveGlobalScopePaths } from './global-scope-resolver.js';
import type { ExecutionLandingPolicyConfig } from './config-types.js';
import type { ExecutionBudget } from './work-model.js';
import {
  AttendedExecutionProposalStore,
  attendedExecutionProposalSha256,
  type AttendedExecutionProposalDigests,
} from './attended-execution-proposal.js';
import {
  isProviderEvidenceProbeSubject,
  type ProviderEvidenceProbeSubject,
} from './provider-evidence-probe-contract.js';

export const ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION = 2 as const;
export const ATTENDED_EXECUTION_APPROVAL_KIND = 'attended-execution-hard-stop' as const;
export const ATTENDED_EXECUTION_DISPATCH_CLAIM_SCHEMA_VERSION = 1 as const;
export const ATTENDED_EXECUTION_DISPATCH_CLAIM_KIND = 'attended-execution-dispatch-claim' as const;
export const PROVIDER_EVIDENCE_PROBE_APPROVAL_KIND = 'provider-evidence-probe' as const;
export const OPERATION_SUBJECT_CLAIM_SCHEMA_VERSION = 1 as const;

export interface ProviderEvidenceProbeApprovalRequestDetailsV1 {
  readonly schemaVersion: 1;
  readonly kind: typeof PROVIDER_EVIDENCE_PROBE_APPROVAL_KIND;
  readonly subject: ProviderEvidenceProbeSubject;
  readonly subjectDigest: string;
}

export interface SubmitProviderEvidenceProbeApprovalInput {
  readonly requester: { readonly role: RequesterRole; readonly instanceId: string };
  readonly userId: string;
  readonly summary: string;
  readonly subject: ProviderEvidenceProbeSubject;
  readonly createdAt?: string;
}

export interface ProviderEvidenceProbeApprovalClaimV1 {
  readonly schemaVersion: typeof OPERATION_SUBJECT_CLAIM_SCHEMA_VERSION;
  readonly kind: 'provider-evidence-probe-claim';
  readonly claimId: string;
  readonly requestId: string;
  readonly subjectDigest: string;
  readonly subject: ProviderEvidenceProbeSubject;
  readonly evidenceRef: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly claimedAt: string;
}

export interface AttendedExecutionApprovalPolicyBindingV1 {
  readonly profileRef: string;
  readonly policyDigest: string;
  readonly landing: Readonly<ExecutionLandingPolicyConfig>;
}

export interface AttendedExecutionApprovalBindingV2 extends AttendedExecutionProposalDigests {
  readonly schemaVersion: typeof ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION;
  readonly proposalDigest: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly provider: string;
  readonly model: string;
  readonly backend: string;
  readonly budget: Readonly<ExecutionBudget>;
  readonly policy: AttendedExecutionApprovalPolicyBindingV1;
  readonly expiresAt: string;
}

export interface AttendedExecutionApprovalExpectedDispatch {
  readonly proposalDigest: string;
  readonly taskDigest: string;
  readonly promptDigest: string;
  readonly scopeDigest: string;
  readonly acceptanceDigest: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly runId: string;
  readonly taskId: string;
  readonly provider: string;
  readonly model: string;
  readonly backend: string;
  readonly budget: Readonly<ExecutionBudget>;
  readonly policy: AttendedExecutionApprovalPolicyBindingV1;
}

export interface AttendedExecutionApprovalRequestDetailsV2 {
  readonly schemaVersion: typeof ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION;
  readonly kind: typeof ATTENDED_EXECUTION_APPROVAL_KIND;
  readonly binding: AttendedExecutionApprovalBindingV2;
  readonly bindingDigest: string;
}

export interface AttendedExecutionApprovalReceiptV2 {
  readonly schemaVersion: typeof ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION;
  readonly kind: typeof ATTENDED_EXECUTION_APPROVAL_KIND;
  readonly receiptId: string;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly decisionDigest: string;
  readonly binding: AttendedExecutionApprovalBindingV2;
  readonly bindingDigest: string;
  readonly claimedAt: string;
}

export interface SubmitAttendedExecutionApprovalInput {
  readonly requester: {
    readonly role: RequesterRole;
    readonly instanceId: string;
  };
  readonly userId: string;
  readonly summary: string;
  readonly binding: AttendedExecutionApprovalBindingV2;
  readonly createdAt?: string;
}

export interface AttendedExecutionApprovalAuthorityOptions {
  readonly receiptStoreDir?: string;
  readonly proposalStoreDir?: string;
  readonly dispatchClaimStoreDir?: string;
  readonly operationClaimStoreDir?: string;
  readonly now?: () => Date;
}

export interface AttendedExecutionDispatchClaimV1 {
  readonly schemaVersion: typeof ATTENDED_EXECUTION_DISPATCH_CLAIM_SCHEMA_VERSION;
  readonly kind: typeof ATTENDED_EXECUTION_DISPATCH_CLAIM_KIND;
  readonly dispatchClaimId: string;
  readonly receiptId: string;
  readonly requestId: string;
  readonly bindingDigest: string;
  readonly proposalDigest: string;
  readonly attemptId: string;
  readonly backend: string;
  readonly claimedAt: string;
}

export type AttendedExecutionDispatchAuthorization =
  | {
      readonly kind: 'dispatch-authorized';
      readonly grant: VerifiedAttendedExecutionApproval;
      readonly dispatchClaim: AttendedExecutionDispatchClaimV1;
    }
  | {
      readonly kind: 'adoption-required';
      readonly receipt: AttendedExecutionApprovalReceiptV2;
      readonly dispatchClaim: AttendedExecutionDispatchClaimV1;
    };

export type AttendedExecutionApprovalErrorCode =
  | 'INVALID_BINDING'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_MISMATCH'
  | 'DECISION_NOT_FOUND'
  | 'DECISION_NOT_ALLOWED'
  | 'DECISION_UNTRUSTED'
  | 'APPROVAL_ALREADY_CONSUMED'
  | 'RECEIPT_CORRUPT'
  | 'DISPATCH_ADOPTION_REQUIRED'
  | 'DISPATCH_CLAIM_CORRUPT';

export class AttendedExecutionApprovalError extends Error {
  constructor(
    readonly code: AttendedExecutionApprovalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AttendedExecutionApprovalError';
  }
}

const SHA256_RE = /^[a-f0-9]{64}$/u;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERIFIED_GRANT_TOKEN = Symbol('attended-execution-approval-grant');
const verifiedGrants = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value ?? null;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Deterministic request id for a provider-evidence-probe subject — the same
 * digest {@link AttendedExecutionApprovalAuthority.submitProviderEvidenceProbe}
 * derives, exported so a concurrent contender hitting the broker's
 * first-writer-wins duplicate refusal can adopt the existing request instead
 * of failing its preparation chain.
 */
export function providerEvidenceProbeApprovalRequestId(
  subject: ProviderEvidenceProbeSubject,
): string {
  return `aprp-${sha256(canonicalJson(subject))}`;
}

function canonicalProjectRoot(projectRoot: string): string {
  try {
    const canonical = realpathSync.native(projectRoot);
    return typeof canonical === 'string' && canonical.length > 0
      ? canonical
      : resolve(projectRoot);
  } catch {
    return resolve(projectRoot);
  }
}

function assertHostAuthorityOutsideProject(projectRoot: string, storeDir: string): void {
  const project = canonicalProjectRoot(projectRoot);
  const candidate = resolve(storeDir);
  const rel = relative(project, candidate);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new AttendedExecutionApprovalError(
      'INVALID_BINDING',
      'Attended execution approval receipts must be stored outside the worker-mounted project',
    );
  }
}

function assertIdentity(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 512
    || value !== value.trim()
    || /[\r\n\0]/u.test(value)) {
    throw new AttendedExecutionApprovalError(
      'INVALID_BINDING',
      `${field} must be a non-empty bounded identity`,
    );
  }
}

function assertFinitePositiveNumber(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', `${field} must be a positive finite number`);
  }
}

function normalizeBudget(value: unknown): Readonly<ExecutionBudget> {
  if (!isRecord(value)) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'budget must be an object');
  }
  const allowed = new Set([
    'maxUsd',
    'maxTokens',
    'maxInputTokens',
    'maxOutputTokens',
    'maxCacheReadTokens',
    'maxCacheCreationTokens',
    'maxContextTokens',
    'maxTurns',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', `budget.${key} is not supported`);
    }
  }
  const budget = value as ExecutionBudget;
  for (const key of allowed) {
    assertFinitePositiveNumber(budget[key as keyof ExecutionBudget], `budget.${key}`);
  }
  if (Object.keys(value).length === 0) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'budget requires at least one ceiling');
  }
  return Object.freeze({ ...budget });
}

function normalizeLandingPolicy(value: unknown): Readonly<ExecutionLandingPolicyConfig> {
  if (!isRecord(value)) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'policy must be an object');
  }
  const allowed = new Set([
    'reserve_ratio',
    'attended_unsupported',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', `policy.${key} is not supported`);
    }
  }
  const reserveRatio = value.reserve_ratio;
  if (typeof reserveRatio !== 'number'
    || !Number.isFinite(reserveRatio)
    || reserveRatio <= 0
    || reserveRatio >= 1) {
    throw new AttendedExecutionApprovalError(
      'INVALID_BINDING',
      'policy.reserve_ratio must be greater than 0 and less than 1',
    );
  }
  if (value.attended_unsupported !== 'allow-hard-stop') {
    throw new AttendedExecutionApprovalError(
      'INVALID_BINDING',
      'policy.attended_unsupported must be allow-hard-stop',
    );
  }
  return Object.freeze({
    reserve_ratio: reserveRatio,
    attended_unsupported: 'allow-hard-stop',
  });
}

function normalizePolicy(value: unknown): AttendedExecutionApprovalPolicyBindingV1 {
  if (!isRecord(value)) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'policy must be an object');
  }
  const exactKeys = new Set(['profileRef', 'policyDigest', 'landing']);
  for (const key of Object.keys(value)) {
    if (!exactKeys.has(key)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', `policy.${key} is not supported`);
    }
  }
  assertIdentity(value.profileRef, 'policy.profileRef');
  if (typeof value.policyDigest !== 'string' || !SHA256_RE.test(value.policyDigest)) {
    throw new AttendedExecutionApprovalError(
      'INVALID_BINDING',
      'policy.policyDigest must be a lowercase SHA-256 digest',
    );
  }
  return Object.freeze({
    profileRef: value.profileRef,
    policyDigest: value.policyDigest,
    landing: normalizeLandingPolicy(value.landing),
  });
}

function normalizeBinding(value: unknown): AttendedExecutionApprovalBindingV2 {
  if (!isRecord(value)) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'approval binding must be an object');
  }
  const exactKeys = new Set([
    'schemaVersion',
    'proposalDigest',
    'taskDigest',
    'promptDigest',
    'scopeDigest',
    'acceptanceDigest',
    'tenantId',
    'projectId',
    'runId',
    'taskId',
    'attemptId',
    'provider',
    'model',
    'backend',
    'budget',
    'policy',
    'expiresAt',
  ]);
  for (const key of Object.keys(value)) {
    if (!exactKeys.has(key)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', `approval binding.${key} is not supported`);
    }
  }
  if (value.schemaVersion !== ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'approval binding schemaVersion is invalid');
  }
  for (const key of [
    'proposalDigest',
    'taskDigest',
    'promptDigest',
    'scopeDigest',
    'acceptanceDigest',
  ] as const) {
    if (typeof value[key] !== 'string' || !SHA256_RE.test(value[key])) {
      throw new AttendedExecutionApprovalError(
        'INVALID_BINDING',
        `approval binding.${key} must be a lowercase SHA-256 digest`,
      );
    }
  }
  for (const key of [
    'tenantId',
    'projectId',
    'runId',
    'taskId',
    'provider',
    'model',
    'backend',
  ] as const) {
    assertIdentity(value[key], `approval binding.${key}`);
  }
  assertIdentity(value.attemptId, 'approval binding.attemptId');
  if (!UUID_RE.test(value.attemptId)) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'approval binding.attemptId must be a UUID');
  }
  assertIdentity(value.expiresAt, 'approval binding.expiresAt');
  if (!Number.isFinite(Date.parse(value.expiresAt))) {
    throw new AttendedExecutionApprovalError('INVALID_BINDING', 'approval binding.expiresAt must be ISO-compatible');
  }
  return Object.freeze({
    schemaVersion: ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION,
    proposalDigest: value.proposalDigest as string,
    taskDigest: value.taskDigest as string,
    promptDigest: value.promptDigest as string,
    scopeDigest: value.scopeDigest as string,
    acceptanceDigest: value.acceptanceDigest as string,
    tenantId: value.tenantId as string,
    projectId: value.projectId as string,
    runId: value.runId as string,
    taskId: value.taskId as string,
    attemptId: value.attemptId,
    provider: value.provider as string,
    model: value.model as string,
    backend: value.backend as string,
    budget: normalizeBudget(value.budget),
    policy: normalizePolicy(value.policy),
    expiresAt: value.expiresAt,
  });
}

function requestDetails(request: ApprovalRequest): AttendedExecutionApprovalRequestDetailsV2 {
  const details = request.details;
  if (!isRecord(details)
    || details.schemaVersion !== ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION
    || details.kind !== ATTENDED_EXECUTION_APPROVAL_KIND
    || typeof details.bindingDigest !== 'string'
    || !SHA256_RE.test(details.bindingDigest)) {
    throw new AttendedExecutionApprovalError(
      'REQUEST_MISMATCH',
      'Approval request does not carry a valid attended-execution binding',
    );
  }
  const binding = normalizeBinding(details.binding);
  const bindingDigest = sha256(canonicalJson(binding));
  if (bindingDigest !== details.bindingDigest) {
    throw new AttendedExecutionApprovalError(
      'REQUEST_MISMATCH',
      'Approval request binding digest mismatch',
    );
  }
  return Object.freeze({
    schemaVersion: ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION,
    kind: ATTENDED_EXECUTION_APPROVAL_KIND,
    binding,
    bindingDigest,
  });
}

function decisionDigest(decision: ApprovalDecision): string {
  return sha256(canonicalJson(decision));
}

function exactDispatchMatches(
  binding: AttendedExecutionApprovalBindingV2,
  expected: AttendedExecutionApprovalExpectedDispatch,
): boolean {
  return binding.proposalDigest === expected.proposalDigest
    && binding.taskDigest === expected.taskDigest
    && binding.promptDigest === expected.promptDigest
    && binding.scopeDigest === expected.scopeDigest
    && binding.acceptanceDigest === expected.acceptanceDigest
    && binding.tenantId === expected.tenantId
    && binding.projectId === expected.projectId
    && binding.runId === expected.runId
    && binding.taskId === expected.taskId
    && binding.provider === expected.provider
    && binding.model === expected.model
    && binding.backend === expected.backend
    && canonicalJson(binding.budget) === canonicalJson(expected.budget)
    && canonicalJson(binding.policy) === canonicalJson(expected.policy);
}

export class VerifiedAttendedExecutionApproval {
  readonly receipt: AttendedExecutionApprovalReceiptV2;

  constructor(
    receipt: AttendedExecutionApprovalReceiptV2,
    token: symbol,
  ) {
    if (token !== VERIFIED_GRANT_TOKEN) {
      throw new AttendedExecutionApprovalError(
        'DECISION_UNTRUSTED',
        'Verified attended execution grants can only be issued by the approval authority',
      );
    }
    this.receipt = receipt;
    verifiedGrants.add(this);
    Object.freeze(this);
  }
}

export function assertVerifiedAttendedExecutionApproval(
  grant: VerifiedAttendedExecutionApproval | undefined,
  expected: AttendedExecutionApprovalExpectedDispatch,
): asserts grant is VerifiedAttendedExecutionApproval {
  if (!grant || !verifiedGrants.has(grant) || !exactDispatchMatches(grant.receipt.binding, expected)) {
    throw new AttendedExecutionApprovalError(
      'REQUEST_MISMATCH',
      'Attended execution requires an exact verified approval receipt',
    );
  }
}

export function attendedExecutionProjectId(projectRoot: string): string {
  return sha256(canonicalProjectRoot(projectRoot));
}

export function createAttendedExecutionApprovalBinding(input: Omit<
  AttendedExecutionApprovalBindingV2,
  'schemaVersion' | 'attemptId' | 'proposalDigest'
> & { readonly attemptId?: string }): AttendedExecutionApprovalBindingV2 {
  const candidate = {
    schemaVersion: ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION,
    ...input,
    attemptId: input.attemptId ?? randomUUID(),
  };
  return normalizeBinding({
    ...candidate,
    proposalDigest: attendedExecutionProposalSha256({
      kind: ATTENDED_EXECUTION_APPROVAL_KIND,
      binding: candidate,
    }),
  });
}

export class AttendedExecutionApprovalAuthority {
  readonly receiptStoreDir: string;
  readonly proposalStoreDir: string;
  readonly dispatchClaimStoreDir: string;
  readonly operationClaimStoreDir: string;
  private readonly proposalStore: AttendedExecutionProposalStore;
  private readonly now: () => Date;

  constructor(
    readonly projectRoot: string,
    private readonly broker: ApprovalBroker,
    private readonly decisions: ApprovalDecisionAuthority,
    options: AttendedExecutionApprovalAuthorityOptions = {},
  ) {
    const projectId = attendedExecutionProjectId(projectRoot);
    const platform = normalizeGlobalScopePlatform(process.platform, process.env);
    const stateDir = resolveGlobalScopePaths(platform, process.env).stateDir;
    this.receiptStoreDir = options.receiptStoreDir
      ?? join(stateDir, 'runtime', 'attended-execution-approvals', projectId, 'receipts');
    this.proposalStoreDir = options.proposalStoreDir
      ?? join(stateDir, 'runtime', 'attended-execution-approvals', projectId, 'proposals');
    this.dispatchClaimStoreDir = options.dispatchClaimStoreDir
      ?? join(stateDir, 'runtime', 'attended-execution-approvals', projectId, 'dispatch-claims');
    this.operationClaimStoreDir = options.operationClaimStoreDir
      ?? join(stateDir, 'runtime', 'attended-execution-approvals', projectId, 'operation-claims');
    this.now = options.now ?? (() => new Date());
    assertHostAuthorityOutsideProject(projectRoot, this.receiptStoreDir);
    assertHostAuthorityOutsideProject(projectRoot, this.proposalStoreDir);
    assertHostAuthorityOutsideProject(projectRoot, this.dispatchClaimStoreDir);
    assertHostAuthorityOutsideProject(projectRoot, this.operationClaimStoreDir);
    mkdirSync(this.receiptStoreDir, { recursive: true, mode: 0o700 });
    mkdirSync(this.dispatchClaimStoreDir, { recursive: true, mode: 0o700 });
    mkdirSync(this.operationClaimStoreDir, { recursive: true, mode: 0o700 });
    this.proposalStore = new AttendedExecutionProposalStore(projectRoot, this.proposalStoreDir);
  }

  submitProviderEvidenceProbe(input: SubmitProviderEvidenceProbeApprovalInput): ApprovalRequest {
    if (!isProviderEvidenceProbeSubject(input.subject)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', 'Invalid provider-evidence-probe subject');
    }
    if (input.subject.projectId !== attendedExecutionProjectId(this.projectRoot)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', 'Probe subject projectId does not match authority project');
    }
    const createdAt = input.createdAt ?? this.now().toISOString();
    if (Date.parse(input.subject.ttl.startsAt) > Date.parse(createdAt)
      || Date.parse(input.subject.ttl.expiresAt) <= Date.parse(createdAt)) {
      throw new AttendedExecutionApprovalError('INVALID_BINDING', 'Probe subject TTL does not contain request creation');
    }
    const subject = Object.freeze(structuredClone(input.subject));
    const subjectDigest = sha256(canonicalJson(subject));
    return this.broker.submit({
      id: `aprp-${subjectDigest}`,
      requester: input.requester,
      summary: input.summary,
      details: { schemaVersion: 1, kind: PROVIDER_EVIDENCE_PROBE_APPROVAL_KIND, subject, subjectDigest },
      scopeId: subject.projectId,
      scope: 'network',
      risk: 'high',
      policy: 'require-approval',
      defaultAction: 'deny',
      tenantId: subject.tenantId,
      userId: input.userId,
      createdAt,
      expiresAt: subject.ttl.expiresAt,
      maskedArgs: {
        provider: subject.provider,
        model: subject.model,
        backendScope: subject.backendScope,
        executionProfileRef: subject.executionProfileRef,
      },
      rawArgsRef: null,
    });
  }

  verifyAndClaimProviderEvidenceProbe(
    requestId: string,
    expected: ProviderEvidenceProbeSubject,
  ): ProviderEvidenceProbeApprovalClaimV1 {
    const request = this.broker.getRequest(requestId);
    if (!request) throw new AttendedExecutionApprovalError('REQUEST_NOT_FOUND', `Approval request ${requestId} was not found`);
    const details = request.details;
    if (!isRecord(details) || details.schemaVersion !== 1
      || details.kind !== PROVIDER_EVIDENCE_PROBE_APPROVAL_KIND
      || !isProviderEvidenceProbeSubject(details.subject)
      || typeof details.subjectDigest !== 'string'
      || !SHA256_RE.test(details.subjectDigest)
      || !isProviderEvidenceProbeSubject(expected)) {
      throw new AttendedExecutionApprovalError('REQUEST_MISMATCH', 'Approval request does not carry a valid provider-evidence-probe subject');
    }
    const subjectDigest = sha256(canonicalJson(details.subject));
    if (subjectDigest !== details.subjectDigest
      || canonicalJson(details.subject) !== canonicalJson(expected)
      || request.scope !== 'network'
      || request.policy !== 'require-approval'
      || request.defaultAction !== 'deny'
      || request.scopeId !== expected.projectId
      || request.tenantId !== expected.tenantId
      || request.expiresAt !== expected.ttl.expiresAt
      || expected.projectId !== attendedExecutionProjectId(this.projectRoot)) {
      throw new AttendedExecutionApprovalError('REQUEST_MISMATCH', 'Probe approval does not exactly match the expected operation subject');
    }
    const decision = this.broker.getDecision(requestId);
    if (!decision) throw new AttendedExecutionApprovalError('DECISION_NOT_FOUND', `Approval request ${requestId} has no decision`);
    if (decision.decision !== 'allow' || decision.closureReason !== undefined) {
      throw new AttendedExecutionApprovalError('DECISION_NOT_ALLOWED', `Approval request ${requestId} was not allowed`);
    }
    const validation = this.decisions.validate(request, decision, this.now());
    if (!validation.ok) {
      throw new AttendedExecutionApprovalError('DECISION_UNTRUSTED', `Provider evidence probe decision is not trusted: ${validation.reason}`);
    }
    const claim: ProviderEvidenceProbeApprovalClaimV1 = Object.freeze({
      schemaVersion: OPERATION_SUBJECT_CLAIM_SCHEMA_VERSION,
      kind: 'provider-evidence-probe-claim',
      claimId: `aprpc-${subjectDigest}`,
      requestId,
      subjectDigest,
      subject: details.subject,
      evidenceRef: `approval:${requestId}`,
      grantedAt: decision.decidedAt,
      expiresAt: new Date(Math.min(
        Date.parse(request.expiresAt),
        Date.parse(validation.authorization.authExpiresAt),
      )).toISOString(),
      claimedAt: this.now().toISOString(),
    });
    const path = join(this.operationClaimStoreDir, `${claim.claimId}.json`);
    if (!createJsonFileFirstWriterWins(path, claim)) {
      throw new AttendedExecutionApprovalError('APPROVAL_ALREADY_CONSUMED', `Provider evidence probe approval ${requestId} was already consumed`);
    }
    return claim;
  }

  submit(input: SubmitAttendedExecutionApprovalInput): ApprovalRequest {
    const binding = normalizeBinding(input.binding);
    if (binding.projectId !== attendedExecutionProjectId(this.projectRoot)) {
      throw new AttendedExecutionApprovalError(
        'INVALID_BINDING',
        'Approval binding projectId does not match the authority project',
      );
    }
    const createdAt = input.createdAt ?? this.now().toISOString();
    if (Date.parse(binding.expiresAt) <= Date.parse(createdAt)) {
      throw new AttendedExecutionApprovalError(
        'INVALID_BINDING',
        'Approval binding expiry must be after request creation',
      );
    }
    const bindingDigest = sha256(canonicalJson(binding));
    this.proposalStore.persist({
      proposalDigest: binding.proposalDigest,
      bindingDigest,
      digests: {
        taskDigest: binding.taskDigest,
        promptDigest: binding.promptDigest,
        scopeDigest: binding.scopeDigest,
        acceptanceDigest: binding.acceptanceDigest,
      },
      createdAt,
      expiresAt: binding.expiresAt,
    });
    const id = `aex-${bindingDigest}`;
    const request: ApprovalRequestInput = {
      id,
      requester: input.requester,
      summary: input.summary,
      details: {
        schemaVersion: ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION,
        kind: ATTENDED_EXECUTION_APPROVAL_KIND,
        binding,
        bindingDigest,
      },
      scopeId: binding.projectId,
      scope: 'lifecycle',
      risk: 'high',
      policy: 'require-approval',
      defaultAction: 'deny',
      tenantId: binding.tenantId,
      userId: input.userId,
      createdAt,
      expiresAt: binding.expiresAt,
      maskedArgs: {
        runId: binding.runId,
        taskId: binding.taskId,
        attemptId: binding.attemptId,
        provider: binding.provider,
        model: binding.model,
        backend: binding.backend,
        proposalDigest: binding.proposalDigest,
      },
      rawArgsRef: null,
    };
    return this.broker.submit(request);
  }

  verifyAndClaim(
    requestId: string,
    expected: AttendedExecutionApprovalExpectedDispatch,
  ): VerifiedAttendedExecutionApproval {
    const authorization = this.authorizeDispatch(requestId, expected);
    if (authorization.kind === 'adoption-required') {
      throw new AttendedExecutionApprovalError(
        'APPROVAL_ALREADY_CONSUMED',
        `Attended execution approval ${requestId} was already consumed; adopt or reconcile dispatch ${authorization.dispatchClaim.dispatchClaimId}`,
      );
    }
    return authorization.grant;
  }

  authorizeDispatch(
    requestId: string,
    expected: AttendedExecutionApprovalExpectedDispatch,
  ): AttendedExecutionDispatchAuthorization {
    const request = this.broker.getRequest(requestId);
    if (!request) {
      throw new AttendedExecutionApprovalError(
        'REQUEST_NOT_FOUND',
        `Attended execution approval request ${requestId} was not found`,
      );
    }
    const details = requestDetails(request);
    const binding = details.binding;
    const proposal = this.proposalStore.read(binding.proposalDigest);
    if (request.scope !== 'lifecycle'
      || request.policy !== 'require-approval'
      || request.defaultAction !== 'deny'
      || request.scopeId !== binding.projectId
      || request.tenantId !== binding.tenantId
      || request.expiresAt !== binding.expiresAt
      || binding.projectId !== attendedExecutionProjectId(this.projectRoot)
      || proposal.bindingDigest !== details.bindingDigest
      || proposal.taskDigest !== binding.taskDigest
      || proposal.promptDigest !== binding.promptDigest
      || proposal.scopeDigest !== binding.scopeDigest
      || proposal.acceptanceDigest !== binding.acceptanceDigest
      || proposal.expiresAt !== binding.expiresAt
      || !exactDispatchMatches(binding, expected)) {
      throw new AttendedExecutionApprovalError(
        'REQUEST_MISMATCH',
        'Attended execution approval request does not exactly match the final dispatch',
      );
    }
    const decision = this.broker.getDecision(requestId);
    if (!decision) {
      throw new AttendedExecutionApprovalError(
        'DECISION_NOT_FOUND',
        `Attended execution approval request ${requestId} has no decision`,
      );
    }
    if (decision.decision !== 'allow' || decision.closureReason !== undefined) {
      throw new AttendedExecutionApprovalError(
        'DECISION_NOT_ALLOWED',
        `Attended execution approval request ${requestId} was not allowed`,
      );
    }
    const validation = this.decisions.validate(request, decision, this.now());
    if (!validation.ok) {
      throw new AttendedExecutionApprovalError(
        'DECISION_UNTRUSTED',
        `Attended execution approval decision is not trusted: ${validation.reason}`,
      );
    }
    let receipt: AttendedExecutionApprovalReceiptV2 = Object.freeze({
      schemaVersion: ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION,
      kind: ATTENDED_EXECUTION_APPROVAL_KIND,
      receiptId: `aexr-${details.bindingDigest}`,
      requestId,
      requestDigest: approvalRequestDigest(request),
      decisionDigest: decisionDigest(decision),
      binding,
      bindingDigest: details.bindingDigest,
      claimedAt: this.now().toISOString(),
    });
    const receiptPath = join(this.receiptStoreDir, `${receipt.receiptId}.json`);
    if (!createJsonFileFirstWriterWins(receiptPath, receipt)) {
      if (!existsSync(receiptPath)) {
        throw new AttendedExecutionApprovalError(
          'RECEIPT_CORRUPT',
          'Attended execution approval receipt claim disappeared during verification',
        );
      }
      let existing: unknown;
      try {
        existing = JSON.parse(readFileSync(receiptPath, 'utf-8'));
      } catch {
        throw new AttendedExecutionApprovalError(
          'RECEIPT_CORRUPT',
          'Existing attended execution approval receipt is unreadable',
        );
      }
      if (!isRecord(existing)
        || existing.schemaVersion !== ATTENDED_EXECUTION_APPROVAL_SCHEMA_VERSION
        || existing.kind !== ATTENDED_EXECUTION_APPROVAL_KIND
        || existing.receiptId !== receipt.receiptId
        || existing.requestId !== receipt.requestId
        || existing.bindingDigest !== receipt.bindingDigest
        || existing.requestDigest !== receipt.requestDigest
        || existing.decisionDigest !== receipt.decisionDigest
        || canonicalJson(existing.binding) !== canonicalJson(receipt.binding)
        || typeof existing.claimedAt !== 'string'
        || !Number.isFinite(Date.parse(existing.claimedAt))) {
        throw new AttendedExecutionApprovalError(
          'RECEIPT_CORRUPT',
          'Existing attended execution approval receipt conflicts with the durable authority',
        );
      }
      receipt = Object.freeze({
        ...receipt,
        claimedAt: existing.claimedAt,
      });
    }
    const grant = new VerifiedAttendedExecutionApproval(receipt, VERIFIED_GRANT_TOKEN);
    const dispatchClaim: AttendedExecutionDispatchClaimV1 = Object.freeze({
      schemaVersion: ATTENDED_EXECUTION_DISPATCH_CLAIM_SCHEMA_VERSION,
      kind: ATTENDED_EXECUTION_DISPATCH_CLAIM_KIND,
      dispatchClaimId: `aexd-${receipt.bindingDigest}`,
      receiptId: receipt.receiptId,
      requestId: receipt.requestId,
      bindingDigest: receipt.bindingDigest,
      proposalDigest: receipt.binding.proposalDigest,
      attemptId: receipt.binding.attemptId,
      backend: receipt.binding.backend,
      claimedAt: this.now().toISOString(),
    });
    const dispatchClaimPath = join(
      this.dispatchClaimStoreDir,
      `${dispatchClaim.dispatchClaimId}.json`,
    );
    if (createJsonFileFirstWriterWins(dispatchClaimPath, dispatchClaim)) {
      return {
        kind: 'dispatch-authorized',
        grant,
        dispatchClaim,
      };
    }
    let existingClaim: unknown;
    try {
      existingClaim = JSON.parse(readFileSync(dispatchClaimPath, 'utf-8'));
    } catch {
      throw new AttendedExecutionApprovalError(
        'DISPATCH_CLAIM_CORRUPT',
        'Existing attended execution dispatch claim is unreadable',
      );
    }
    if (!isRecord(existingClaim)
      || existingClaim.schemaVersion !== ATTENDED_EXECUTION_DISPATCH_CLAIM_SCHEMA_VERSION
      || existingClaim.kind !== ATTENDED_EXECUTION_DISPATCH_CLAIM_KIND
      || existingClaim.dispatchClaimId !== dispatchClaim.dispatchClaimId
      || existingClaim.receiptId !== dispatchClaim.receiptId
      || existingClaim.requestId !== dispatchClaim.requestId
      || existingClaim.bindingDigest !== dispatchClaim.bindingDigest
      || existingClaim.proposalDigest !== dispatchClaim.proposalDigest
      || existingClaim.attemptId !== dispatchClaim.attemptId
      || existingClaim.backend !== dispatchClaim.backend
      || typeof existingClaim.claimedAt !== 'string'
      || !Number.isFinite(Date.parse(existingClaim.claimedAt))) {
      throw new AttendedExecutionApprovalError(
        'DISPATCH_CLAIM_CORRUPT',
        'Existing attended execution dispatch claim conflicts with the durable authority',
      );
    }
    return {
      kind: 'adoption-required',
      receipt,
      dispatchClaim: Object.freeze({
        ...dispatchClaim,
        claimedAt: existingClaim.claimedAt,
      }),
    };
  }
}
