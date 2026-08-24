import { createHash, timingSafeEqual } from 'node:crypto';

import { ApprovalBroker, ApprovalBrokerError } from './approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from './approval-contract.js';
import { ApprovalDecisionAuthority, approvalRequestDigest } from './approval-decision-ingress.js';
import {
  applyProviderExecutionObservationReconciliation,
  type ProviderExecutionObservationReconciliationApplyResult,
  type ProviderExecutionObservationReconciliationBounds,
  type ProviderExecutionObservationReconciliationPlan,
} from './provider-execution-observation-reconciliation.js';

const VERSION = 1 as const;
const HEX_256 = /^[a-f0-9]{64}$/u;
const VERIFIED_CLAIM_TOKEN = Symbol('provider-execution-observation-reconciliation-approval-claim');
const verifiedClaims = new WeakSet<object>();

export type ProviderExecutionObservationReconciliationApprovalErrorCode =
  | 'INVALID_BINDING'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_MISMATCH'
  | 'DECISION_NOT_FOUND'
  | 'DECISION_NOT_ALLOWED'
  | 'DECISION_UNTRUSTED'
  | 'SELF_APPROVAL'
  | 'STALE_DECISION';

export class ProviderExecutionObservationReconciliationApprovalError extends Error {
  constructor(readonly code: ProviderExecutionObservationReconciliationApprovalErrorCode, message: string) {
    super(message);
    this.name = 'ProviderExecutionObservationReconciliationApprovalError';
  }
}

export interface ProviderExecutionObservationReconciliationApprovalSubject {
  readonly schemaVersion: typeof VERSION;
  readonly kind: 'provider-execution-observation-reconciliation';
  readonly projectId: string;
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly generation: string;
  readonly relativeDatabasePath: string;
  readonly databaseSchemaDigest: string;
  readonly databaseLineageDigest: string;
  readonly planDigest: string;
  readonly candidateCount: number;
  readonly holdCount: number;
  readonly expiresAt: string;
}

/** Serializable lineage embedded in a durable receipt after capability verification. */
export interface ProviderExecutionObservationReconciliationApprovalClaim {
  readonly schemaVersion: typeof VERSION;
  readonly kind: 'provider-execution-observation-reconciliation-approval';
  readonly requestId: string;
  readonly requestDigest: string;
  readonly decisionDigest: string;
  readonly subjectDigest: string;
  readonly decidedAt: string;
  readonly authorityRef: string;
}

/** In-memory capability emitted only after live authorization is revalidated at apply time. */
export class VerifiedProviderExecutionObservationReconciliationApprovalClaim
implements ProviderExecutionObservationReconciliationApprovalClaim {
  readonly schemaVersion: typeof VERSION;
  readonly kind: 'provider-execution-observation-reconciliation-approval';
  readonly requestId: string;
  readonly requestDigest: string;
  readonly decisionDigest: string;
  readonly subjectDigest: string;
  readonly decidedAt: string;
  readonly authorityRef: string;

  constructor(claim: ProviderExecutionObservationReconciliationApprovalClaim, token: symbol) {
    if (token !== VERIFIED_CLAIM_TOKEN) {
      throw new ProviderExecutionObservationReconciliationApprovalError(
        'DECISION_UNTRUSTED', 'Verified reconciliation approval claims can only be issued by approval authority',
      );
    }
    this.schemaVersion = claim.schemaVersion;
    this.kind = claim.kind;
    this.requestId = claim.requestId;
    this.requestDigest = claim.requestDigest;
    this.decisionDigest = claim.decisionDigest;
    this.subjectDigest = claim.subjectDigest;
    this.decidedAt = claim.decidedAt;
    this.authorityRef = claim.authorityRef;
    verifiedClaims.add(this);
    Object.freeze(this);
  }
}

export function isVerifiedProviderExecutionObservationReconciliationApprovalClaim(
  claim: ProviderExecutionObservationReconciliationApprovalClaim,
): claim is VerifiedProviderExecutionObservationReconciliationApprovalClaim {
  return verifiedClaims.has(claim);
}

export function providerExecutionObservationReconciliationApprovalDecisionDigest(
  decision: ApprovalDecision,
): string {
  return digest(decision);
}

/** Revalidate durable replay lineage without requiring a still-live interactive session. */
export function assertProviderExecutionObservationReconciliationReplayApproval(input: {
  readonly request: ApprovalRequest | null;
  readonly decision: ApprovalDecision | null;
  readonly approvalId: string;
  readonly planDigest: string;
  readonly claim: ProviderExecutionObservationReconciliationApprovalClaim;
}): void {
  const bound = input.request ? requestSubject(input.request) : null;
  const subjectDigest = input.request ? requestSubjectDigest(input.request) : null;
  if (!input.request || !input.decision || !bound || !subjectDigest
    || bound.planDigest !== input.planDigest || input.request.id !== input.approvalId
    || input.decision.requestId !== input.approvalId || input.decision.decision !== 'allow'
    || input.decision.closureReason !== undefined || input.claim.requestId !== input.approvalId
    || input.claim.requestDigest !== approvalRequestDigest(input.request)
    || input.claim.decisionDigest
      !== providerExecutionObservationReconciliationApprovalDecisionDigest(input.decision)
    || input.claim.subjectDigest !== subjectDigest) {
    throw new ProviderExecutionObservationReconciliationApprovalError(
      'REQUEST_MISMATCH', 'Approval request or decision lineage does not match reconciliation receipt',
    );
  }
}

export type ProviderExecutionObservationReconciliationAuthorizedApplyResult =
  ProviderExecutionObservationReconciliationApplyResult & {
    readonly claim: VerifiedProviderExecutionObservationReconciliationApprovalClaim;
  };

export type ProviderExecutionObservationReconciliationApprovalApplyResult =
  | ProviderExecutionObservationReconciliationAuthorizedApplyResult
  | {
      /** No reconciliation was applied; this branch can never be published as a receipt. */
      readonly state: 'hold';
      readonly reasonCode: 'missing-authorization';
    };

export interface SubmitProviderExecutionObservationReconciliationApprovalInput {
  readonly plan: ProviderExecutionObservationReconciliationPlan;
  readonly tenantId: string;
  /** The actor who initiated reconciliation; this actor may not approve it. */
  readonly requestedBy: string;
  /** The only human identity eligible to decide this request through live ingress. */
  readonly approverUserId: string;
  readonly generation: string;
  readonly expiresAt: string;
  readonly requester: { readonly role: 'brain' | 'worker' | 'auditor' | 'nervous' | 'connector'; readonly instanceId: string };
  readonly summary?: string;
  readonly createdAt?: string;
}

export interface ApplyProviderExecutionObservationReconciliationApprovalInput {
  readonly requestId: string;
  readonly plan: ProviderExecutionObservationReconciliationPlan;
  readonly tenantId: string;
  readonly requestedBy: string;
  readonly generation: string;
  readonly expiresAt: string;
  readonly bounds?: ProviderExecutionObservationReconciliationBounds;
}

function canonical(value: unknown): string {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('Unsupported canonical approval value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }

function sameDigest(left: string, right: string): boolean {
  return HEX_256.test(left) && HEX_256.test(right) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function projectId(projectRoot: string): string { return digest({ projectRoot }); }

function planBody(plan: ProviderExecutionObservationReconciliationPlan): Record<string, unknown> {
  return {
    version: plan.version, projectRoot: plan.projectRoot, relativeDatabasePath: plan.relativeDatabasePath,
    canonicalRunId: plan.canonicalRunId, runFilter: plan.runFilter, databaseSchemaDigest: plan.databaseSchemaDigest,
    databaseLineageDigest: plan.databaseLineageDigest, activeOpenCount: plan.activeOpenCount, candidates: plan.candidates,
  };
}

function assertPlan(plan: ProviderExecutionObservationReconciliationPlan): void {
  if (!sameDigest(plan.planDigest, digest(planBody(plan)))) {
    throw new ProviderExecutionObservationReconciliationApprovalError('INVALID_BINDING', 'Reconciliation plan digest does not match its exact preimage');
  }
}

function subject(input: {
  plan: ProviderExecutionObservationReconciliationPlan; tenantId: string; requestedBy: string; generation: string; expiresAt: string;
}): ProviderExecutionObservationReconciliationApprovalSubject {
  assertPlan(input.plan);
  if (!input.tenantId.trim() || !input.requestedBy.trim() || !input.generation.trim()
    || !Number.isFinite(Date.parse(input.expiresAt))) {
    throw new ProviderExecutionObservationReconciliationApprovalError('INVALID_BINDING', 'Reconciliation approval identity, generation, and expiry must be present');
  }
  const candidateCount = input.plan.candidates.length;
  const holdCount = input.plan.activeOpenCount - candidateCount;
  if (!Number.isSafeInteger(holdCount) || holdCount < 0) {
    throw new ProviderExecutionObservationReconciliationApprovalError('INVALID_BINDING', 'Reconciliation candidate and hold counts are inconsistent');
  }
  return Object.freeze({
    schemaVersion: VERSION, kind: 'provider-execution-observation-reconciliation', projectId: projectId(input.plan.projectRoot),
    tenantId: input.tenantId, requestedBy: input.requestedBy, generation: input.generation,
    relativeDatabasePath: input.plan.relativeDatabasePath, databaseSchemaDigest: input.plan.databaseSchemaDigest,
    databaseLineageDigest: input.plan.databaseLineageDigest, planDigest: input.plan.planDigest,
    candidateCount, holdCount, expiresAt: input.expiresAt,
  });
}

function requestSubject(request: ApprovalRequest): ProviderExecutionObservationReconciliationApprovalSubject | null {
  const details = request.details;
  if (!details || typeof details !== 'object') return null;
  const value = details as Record<string, unknown>;
  const candidate = value.subject;
  if (!candidate || typeof candidate !== 'object' || value.schemaVersion !== VERSION
    || value.kind !== 'provider-execution-observation-reconciliation' || typeof value.subjectDigest !== 'string') return null;
  const parsed = candidate as ProviderExecutionObservationReconciliationApprovalSubject;
  if (parsed.schemaVersion !== VERSION || parsed.kind !== 'provider-execution-observation-reconciliation'
    || !HEX_256.test(value.subjectDigest) || !sameDigest(digest(parsed), value.subjectDigest)) return null;
  return parsed;
}

function requestSubjectDigest(request: ApprovalRequest): string | null {
  const details = request.details;
  if (!details || typeof details !== 'object') return null;
  const subjectDigest = (details as Record<string, unknown>).subjectDigest;
  return typeof subjectDigest === 'string' && HEX_256.test(subjectDigest) ? subjectDigest : null;
}

/** Read/write-request adapter only: live decisions remain exclusively in ApprovalDecisionIngress. */
export class ProviderExecutionObservationReconciliationApprovalAuthority {
  private readonly now: () => Date;

  constructor(
    private readonly projectRoot: string,
    private readonly broker: ApprovalBroker,
    private readonly decisions: ApprovalDecisionAuthority,
    options: { readonly now?: () => Date } = {},
  ) { this.now = options.now ?? (() => new Date()); }

  submit(input: SubmitProviderExecutionObservationReconciliationApprovalInput): ApprovalRequest {
    const bound = subject(input);
    if (bound.projectId !== projectId(this.projectRoot) || input.approverUserId.trim() === '') {
      throw new ProviderExecutionObservationReconciliationApprovalError('INVALID_BINDING', 'Approval is not bound to this project or lacks an approver');
    }
    const createdAt = input.createdAt ?? this.now().toISOString();
    if (Date.parse(bound.expiresAt) <= Date.parse(createdAt)) {
      throw new ProviderExecutionObservationReconciliationApprovalError('INVALID_BINDING', 'Approval expiry must be after creation');
    }
    const subjectDigest = digest(bound);
    const id = `apr-reconciliation-${subjectDigest}`;
    const exact = (): ApprovalRequest => this.broker.submit({
      id, requester: input.requester, summary: input.summary ?? 'Approve provider execution observation reconciliation',
      details: { schemaVersion: VERSION, kind: bound.kind, subject: bound, subjectDigest },
      scopeId: bound.projectId, scope: 'lifecycle', risk: 'high', policy: 'require-approval', defaultAction: 'deny',
      tenantId: bound.tenantId, userId: input.approverUserId, createdAt, expiresAt: bound.expiresAt,
      maskedArgs: { generation: bound.generation, candidateCount: bound.candidateCount, holdCount: bound.holdCount, planDigest: bound.planDigest }, rawArgsRef: null,
    });
    try { return exact(); }
    catch (error) {
      if (!(error instanceof ApprovalBrokerError) || error.code !== 'APR_DUPLICATE_ID') throw error;
      const existing = this.broker.getRequest(id);
      if (!existing || canonical(requestSubject(existing)) !== canonical(bound)
        || existing.tenantId !== bound.tenantId || existing.userId !== input.approverUserId
        || existing.defaultAction !== 'deny' || existing.expiresAt !== bound.expiresAt) {
        throw new ProviderExecutionObservationReconciliationApprovalError('REQUEST_MISMATCH', 'Existing approval request differs from reconciliation binding');
      }
      return existing;
    }
  }

  apply(input: ApplyProviderExecutionObservationReconciliationApprovalInput): ProviderExecutionObservationReconciliationApprovalApplyResult {
    const expected = subject(input);
    if (expected.projectId !== projectId(this.projectRoot)) {
      throw new ProviderExecutionObservationReconciliationApprovalError('REQUEST_MISMATCH', 'Reconciliation approval belongs to another project');
    }
    const request = this.broker.getRequest(input.requestId);
    if (!request) throw new ProviderExecutionObservationReconciliationApprovalError('REQUEST_NOT_FOUND', 'Approval request was not found');
    const subjectDigest = requestSubjectDigest(request);
    if (canonical(requestSubject(request)) !== canonical(expected)
      || !subjectDigest || !sameDigest(subjectDigest, digest(expected))
      || request.scopeId !== expected.projectId || request.tenantId !== expected.tenantId
      || request.scope !== 'lifecycle' || request.policy !== 'require-approval' || request.defaultAction !== 'deny'
      || request.expiresAt !== expected.expiresAt) {
      throw new ProviderExecutionObservationReconciliationApprovalError('REQUEST_MISMATCH', 'Approval request does not exactly match reconciliation preimage');
    }
    const decision = this.broker.getDecision(input.requestId);
    if (!decision) throw new ProviderExecutionObservationReconciliationApprovalError('DECISION_NOT_FOUND', 'Approval request has no decision');
    if (decision.decision !== 'allow' || decision.closureReason !== undefined) {
      throw new ProviderExecutionObservationReconciliationApprovalError('DECISION_NOT_ALLOWED', 'Reconciliation requires an explicit live allow decision');
    }
    if (decision.decidedBy === expected.requestedBy) {
      throw new ProviderExecutionObservationReconciliationApprovalError('SELF_APPROVAL', 'The reconciliation requester may not approve their own request');
    }
    const trusted = this.decisions.validate(request, decision, this.now());
    if (!trusted.ok) {
      if (trusted.reason === 'missing-authorization') return Object.freeze({
        state: 'hold', reasonCode: 'missing-authorization',
      });
      if (trusted.reason === 'request-expired' || trusted.reason === 'session-expired') {
        throw new ProviderExecutionObservationReconciliationApprovalError('STALE_DECISION', `Approval decision is stale: ${trusted.reason}`);
      }
      throw new ProviderExecutionObservationReconciliationApprovalError('DECISION_UNTRUSTED', `Approval decision is not fresh and trusted: ${trusted.reason}`);
    }
    const requestDigest = approvalRequestDigest(request);
    if (!sameDigest(trusted.authorization.requestDigest, requestDigest)) {
      throw new ProviderExecutionObservationReconciliationApprovalError('STALE_DECISION', 'Validated authorization no longer binds the canonical request');
    }
    const claim = new VerifiedProviderExecutionObservationReconciliationApprovalClaim({
      schemaVersion: VERSION,
      kind: 'provider-execution-observation-reconciliation-approval',
      requestId: request.id,
      requestDigest,
      decisionDigest: providerExecutionObservationReconciliationApprovalDecisionDigest(decision),
      subjectDigest,
      decidedAt: decision.decidedAt,
      authorityRef: trusted.authorization.authorityRef,
    }, VERIFIED_CLAIM_TOKEN);
    return Object.freeze({ ...applyProviderExecutionObservationReconciliation({ plan: input.plan, bounds: input.bounds }), claim });
  }
}

export const submitProviderExecutionObservationReconciliationApproval = (
  authority: ProviderExecutionObservationReconciliationApprovalAuthority,
  input: SubmitProviderExecutionObservationReconciliationApprovalInput,
): ApprovalRequest => authority.submit(input);

export const applyProviderExecutionObservationReconciliationApproval = (
  authority: ProviderExecutionObservationReconciliationApprovalAuthority,
  input: ApplyProviderExecutionObservationReconciliationApprovalInput,
): ProviderExecutionObservationReconciliationApprovalApplyResult => authority.apply(input);
