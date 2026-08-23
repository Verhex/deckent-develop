import { createHash, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';

import { ApprovalBrokerError, type ApprovalBroker } from './approval-broker.js';
import type { ApprovalRequest } from './approval-contract.js';
import {
  approvalRequestDigest,
  type ApprovalDecisionAuthority,
  type ApprovalDecisionCommand,
  type ApprovalDecisionIngress,
  type ApprovalDecisionIngressOutcome,
} from './approval-decision-ingress.js';
import {
  applyProviderExecutionObservationMigration,
  ProviderExecutionObservationMigrationError,
  type ProviderExecutionObservationMigrationApplyResult,
  type ProviderExecutionObservationMigrationAuthority,
  type ProviderExecutionObservationMigrationBounds,
  type ProviderExecutionObservationMigrationClock,
  type ProviderExecutionObservationMigrationIds,
  type ProviderExecutionObservationMigrationPlan,
} from './provider-execution-observation-migration.js';

const KIND = 'provider-execution-observation-migration' as const;
const SCHEMA_VERSION = 1 as const;
const SHA256 = /^[a-f0-9]{64}$/u;

type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function canonical(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (isJsonArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
}

function digest(value: JsonValue | string): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}

function bindingCanonicalValue(
  binding: ProviderExecutionObservationMigrationApprovalBinding,
): JsonValue {
  return {
    schemaVersion: binding.schemaVersion,
    kind: binding.kind,
    projectId: binding.projectId,
    tenantId: binding.tenantId,
    migrationId: binding.migrationId,
    relativeDatabasePath: binding.relativeDatabasePath,
    databasePreimageDigest: binding.databasePreimageDigest,
    sourceSchemaDigest: binding.sourceSchemaDigest,
    sourceRowLineageDigest: binding.sourceRowLineageDigest,
    planDigest: binding.planDigest,
    generation: binding.generation,
    expiresAt: binding.expiresAt,
    timeout: binding.timeout,
  };
}

function equalDigest(left: string, right: string): boolean {
  return SHA256.test(left) && SHA256.test(right)
    && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export type ProviderExecutionObservationMigrationApprovalTimeout = 'deny' | 'park';

export interface ProviderExecutionObservationMigrationApprovalBinding {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly kind: typeof KIND;
  readonly projectId: string;
  readonly tenantId: string;
  readonly migrationId: string;
  readonly relativeDatabasePath: string;
  readonly databasePreimageDigest: string;
  readonly sourceSchemaDigest: string;
  readonly sourceRowLineageDigest: string;
  readonly planDigest: string;
  readonly generation: string;
  readonly expiresAt: string;
  readonly timeout: ProviderExecutionObservationMigrationApprovalTimeout;
}

export type ProviderExecutionObservationMigrationApprovalErrorCode =
  | 'INVALID_BINDING'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_MISMATCH'
  | 'DECISION_NOT_FOUND'
  | 'DECISION_NOT_ALLOWED'
  | 'DECISION_UNTRUSTED'
  | 'SELF_APPROVAL'
  | 'STALE_DECISION';

export class ProviderExecutionObservationMigrationApprovalError extends Error {
  constructor(readonly code: ProviderExecutionObservationMigrationApprovalErrorCode) {
    super(code);
    this.name = 'ProviderExecutionObservationMigrationApprovalError';
  }
}

export interface ProviderExecutionObservationMigrationApprovalOptions {
  readonly broker: ApprovalBroker;
  /**
   * Optional canonical live-session ingress for callers that expose decision
   * delegation through this bridge. Production migration submit/apply wiring
   * deliberately leaves decisions to `deckent approvals decide`.
   */
  readonly decisionIngress?: ApprovalDecisionIngress;
  readonly decisionAuthority: ApprovalDecisionAuthority;
  readonly projectRoot: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly requester: Readonly<{ role: 'brain' | 'worker' | 'auditor' | 'nervous' | 'connector'; instanceId: string }>;
  readonly generation: string;
  readonly expiresAt: string;
  readonly timeout: ProviderExecutionObservationMigrationApprovalTimeout;
  readonly now?: () => Date;
}

export type ProviderExecutionObservationMigrationApprovalApplyResult =
  | { readonly kind: 'applied'; readonly result: ProviderExecutionObservationMigrationApplyResult; readonly requestDigest: string }
  | { readonly kind: 'replay'; readonly result: ProviderExecutionObservationMigrationApplyResult; readonly requestDigest: string };

export type ProviderExecutionObservationMigrationApprovalSubmitResult =
  | { readonly kind: 'submitted'; readonly request: ApprovalRequest; readonly requestDigest: string }
  | { readonly kind: 'replay'; readonly request: ApprovalRequest; readonly requestDigest: string };

/** Stable project identity; no tenant or machine-specific path is disclosed in the request id. */
export function providerExecutionObservationMigrationProjectId(projectRoot: string): string {
  return digest(resolve(projectRoot));
}

export function providerExecutionObservationMigrationDatabasePreimageDigest(
  plan: ProviderExecutionObservationMigrationPlan,
): string {
  return digest({
    relativeDatabasePath: plan.projectPath.relativeDatabasePath,
    sourceDatabaseBytes: plan.sourceDatabaseBytes,
    sourceRowCount: plan.sourceRowCount,
    sourceRowLineageDigest: plan.sourceRowLineageDigest,
    sourceSchemaDigest: plan.sourceSchemaDigest,
  });
}

function bindingFor(
  plan: ProviderExecutionObservationMigrationPlan,
  options: ProviderExecutionObservationMigrationApprovalOptions,
): ProviderExecutionObservationMigrationApprovalBinding {
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    projectId: providerExecutionObservationMigrationProjectId(options.projectRoot),
    tenantId: options.tenantId,
    migrationId: plan.migrationId,
    relativeDatabasePath: plan.projectPath.relativeDatabasePath,
    databasePreimageDigest: providerExecutionObservationMigrationDatabasePreimageDigest(plan),
    sourceSchemaDigest: plan.sourceSchemaDigest,
    sourceRowLineageDigest: plan.sourceRowLineageDigest,
    planDigest: plan.planDigest,
    generation: options.generation,
    expiresAt: options.expiresAt,
    timeout: options.timeout,
  });
}

function isBinding(value: unknown): value is ProviderExecutionObservationMigrationApprovalBinding {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.schemaVersion === SCHEMA_VERSION && v.kind === KIND
    && typeof v.projectId === 'string' && SHA256.test(v.projectId)
    && typeof v.tenantId === 'string' && v.tenantId.length > 0
    && typeof v.migrationId === 'string' && typeof v.relativeDatabasePath === 'string'
    && typeof v.databasePreimageDigest === 'string' && SHA256.test(v.databasePreimageDigest)
    && typeof v.sourceSchemaDigest === 'string' && SHA256.test(v.sourceSchemaDigest)
    && typeof v.sourceRowLineageDigest === 'string' && SHA256.test(v.sourceRowLineageDigest)
    && typeof v.planDigest === 'string' && SHA256.test(v.planDigest)
    && typeof v.generation === 'string' && v.generation.length > 0
    && typeof v.expiresAt === 'string' && Number.isFinite(Date.parse(v.expiresAt))
    && (v.timeout === 'deny' || v.timeout === 'park');
}

function requestMatchesBinding(
  request: ApprovalRequest,
  expected: ProviderExecutionObservationMigrationApprovalBinding,
  expectedDigest: string,
): boolean {
  const details = request.details;
  const stored = details.binding;
  return request.id === `peoma-${expectedDigest}`
    && isBinding(stored)
    && details.schemaVersion === SCHEMA_VERSION
    && details.kind === KIND
    && details.bindingDigest === expectedDigest
    && canonical(bindingCanonicalValue(stored)) === canonical(bindingCanonicalValue(expected))
    && request.scopeId === expected.projectId
    && request.scope === 'lifecycle'
    && request.tenantId === expected.tenantId
    && request.risk === 'critical'
    && request.policy === 'require-approval'
    && request.defaultAction === (expected.timeout === 'deny' ? 'deny' : 'defer')
    && request.expiresAt === expected.expiresAt;
}

/**
 * Migration-specific adapter over the canonical ApprovalBroker and decision
 * ingress. It can author requests and verify/apply them, but cannot mint a
 * decision. In particular, critical migrations have no auto-approval path.
 */
export class ProviderExecutionObservationMigrationApprovalBridge {
  private readonly now: () => Date;

  constructor(private readonly options: ProviderExecutionObservationMigrationApprovalOptions) {
    this.now = options.now ?? (() => new Date());
    if (!options.tenantId || !options.userId || !options.generation
      || options.requester.instanceId === options.userId
      || !Number.isFinite(Date.parse(options.expiresAt))) {
      throw new ProviderExecutionObservationMigrationApprovalError('INVALID_BINDING');
    }
  }

  submit(plan: ProviderExecutionObservationMigrationPlan): ProviderExecutionObservationMigrationApprovalSubmitResult {
    if (resolve(plan.projectPath.projectRoot) !== resolve(this.options.projectRoot)
      || Date.parse(this.options.expiresAt) <= this.now().getTime()) {
      throw new ProviderExecutionObservationMigrationApprovalError('INVALID_BINDING');
    }
    const binding = bindingFor(plan, this.options);
    const bindingDigest = digest(bindingCanonicalValue(binding));
    const id = `peoma-${bindingDigest}`;
    try {
      const request = this.options.broker.submit({
      id,
      requester: this.options.requester,
      summary: 'Approve provider execution observation database migration',
      details: { schemaVersion: SCHEMA_VERSION, kind: KIND, binding, bindingDigest },
      scopeId: binding.projectId,
      scope: 'lifecycle',
      risk: 'critical',
      policy: 'require-approval',
      defaultAction: binding.timeout === 'deny' ? 'deny' : 'defer',
      tenantId: binding.tenantId,
      userId: this.options.userId,
      createdAt: this.now().toISOString(),
      expiresAt: binding.expiresAt,
      maskedArgs: {
        relativeDatabasePath: binding.relativeDatabasePath,
        databasePreimageDigest: binding.databasePreimageDigest,
        planDigest: binding.planDigest,
        generation: binding.generation,
      },
      rawArgsRef: null,
      });
      return { kind: 'submitted', request, requestDigest: approvalRequestDigest(request) };
    } catch (error) {
      if (!(error instanceof ApprovalBrokerError) || error.code !== 'APR_DUPLICATE_ID') throw error;
      const winner = this.options.broker.getRequest(id);
      if (!winner || !requestMatchesBinding(winner, binding, bindingDigest)) {
        throw new ProviderExecutionObservationMigrationApprovalError('REQUEST_MISMATCH');
      }
      return { kind: 'replay', request: winner, requestDigest: approvalRequestDigest(winner) };
    }
  }

  /** All decisions, including replays, go through live re-authentication and MAC ingress. */
  decide(command: ApprovalDecisionCommand): Promise<ApprovalDecisionIngressOutcome> {
    if (!this.options.decisionIngress) {
      throw new ProviderExecutionObservationMigrationApprovalError('DECISION_UNTRUSTED');
    }
    return this.options.decisionIngress.decide(command);
  }

  apply(input: {
    readonly requestId: string;
    readonly plan: ProviderExecutionObservationMigrationPlan;
    readonly clock: ProviderExecutionObservationMigrationClock;
    readonly ids: ProviderExecutionObservationMigrationIds;
    readonly bounds?: ProviderExecutionObservationMigrationBounds;
  }): ProviderExecutionObservationMigrationApprovalApplyResult {
    const request = this.options.broker.getRequest(input.requestId);
    if (!request) throw new ProviderExecutionObservationMigrationApprovalError('REQUEST_NOT_FOUND');
    const expected = bindingFor(input.plan, this.options);
    const expectedDigest = digest(bindingCanonicalValue(expected));
    if (!requestMatchesBinding(request, expected, expectedDigest)) {
      throw new ProviderExecutionObservationMigrationApprovalError('REQUEST_MISMATCH');
    }
    const decision = this.options.broker.getDecision(input.requestId);
    if (!decision) throw new ProviderExecutionObservationMigrationApprovalError('DECISION_NOT_FOUND');
    if (decision.decision !== 'allow' || decision.closureReason !== undefined) {
      throw new ProviderExecutionObservationMigrationApprovalError('DECISION_NOT_ALLOWED');
    }
    if (decision.decidedBy === request.requester.instanceId) {
      throw new ProviderExecutionObservationMigrationApprovalError('SELF_APPROVAL');
    }
    const validation = this.options.decisionAuthority.validate(request, decision, this.now());
    if (!validation.ok) throw new ProviderExecutionObservationMigrationApprovalError('DECISION_UNTRUSTED');
    const exactRequestDigest = approvalRequestDigest(request);
    if (!equalDigest(validation.authorization.requestDigest, exactRequestDigest)) {
      throw new ProviderExecutionObservationMigrationApprovalError('STALE_DECISION');
    }
    const authority: ProviderExecutionObservationMigrationAuthority = {
      decision: 'allow', authorityId: `approval:${request.id}`,
      migrationId: input.plan.migrationId, planDigest: input.plan.planDigest,
      projectRoot: input.plan.projectPath.projectRoot,
      relativeDatabasePath: input.plan.projectPath.relativeDatabasePath,
      sourceSchemaDigest: input.plan.sourceSchemaDigest,
      sourceRowLineageDigest: input.plan.sourceRowLineageDigest,
      expiresAt: new Date(Math.min(
        Date.parse(request.expiresAt), Date.parse(validation.authorization.authExpiresAt),
      )).toISOString(),
    };
    try {
      const result = applyProviderExecutionObservationMigration({
        plan: input.plan, authority, clock: input.clock, ids: input.ids, bounds: input.bounds,
      });
      return { kind: result.state === 'already-current' ? 'replay' : 'applied', result, requestDigest: exactRequestDigest };
    } catch (error) {
      if (error instanceof ProviderExecutionObservationMigrationError
        && (error.code === 'AUTHORITY_EXPIRED' || error.code === 'AUTHORITY_MISMATCH')) {
        throw new ProviderExecutionObservationMigrationApprovalError('STALE_DECISION');
      }
      throw error;
    }
  }
}
