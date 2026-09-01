// ─── Canonical Worker-Ingress Result Assembly ────────────────────────────────
// Sprint-661 closure: extracted from result-assembler.ts so the Docker
// settlement path (spawn-backend-docker) can consume the canonical ingress
// boundary without pulling result-assembler's sprint-utils dependency into
// the CLI/orchestra SCC (ADR-G-041 layer gate; scc-growth fix 2026-08-24).
// This module may import ONLY from core/.

import {
  createProductionTaskResultV2,
  validateTaskResult,
  AssemblerError,
  type TaskResultV1,
  type TaskResultV2,
  type TaskResultAttemptCustodySourceBindingV2,
  type TaskResultAttemptCustodyBindingV2,
  type FileChange,
} from '../core/task-result-schema.js';
import type { CanonicalJsonBounds } from '../core/task-attempt-custody-store.js';
import {
  parseExecutionEffectResultProjectionV1,
  parseTaskAttemptEffectLandingBindingV2,
  type ExecutionEffectResultProjectionV1,
  type TaskAttemptEffectLandingBindingV2,
} from '../core/execution-effect-persistence-contract.js';
import { canonicalJson } from '../core/audit-writer.js';
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import type { ProviderBillingEvidence } from '../core/provider-billing-evidence.js';

export interface CanonicalIngressAuthority {
  readonly taskId: string;
  readonly workerId: string;
  readonly provider: string;
  readonly model: string;
  readonly sprintId?: string;
  readonly promptCompilePlanId?: string;
  readonly verificationCommands?: readonly string[];
  readonly attempt?: number;
  readonly isPriorityFix?: boolean;
  readonly fixForTaskId?: string | null;
}

export interface CanonicalIngressCustodyAuthority {
  readonly attemptCustody: TaskResultAttemptCustodySourceBindingV2;
  readonly hostWorkArtifact: TaskResultAttemptCustodyBindingV2['hostWorkAttribution'];
  readonly jsonBounds: CanonicalJsonBounds;
  readonly hostEffectAuthority: CanonicalIngressEffectAuthorityV1;
  readonly hostTerminalBilling: Readonly<{
    readonly evidence: ProviderBillingEvidence;
    readonly evidenceDigest: `sha256:${string}`;
    readonly providerStreamReceiptDigest: `sha256:${string}`;
    readonly billingMode: 'api' | 'subscription';
  }>;
  readonly hostWorkAuthority: Readonly<{
    readonly filesChanged: readonly FileChange[];
    readonly totalLinesAdded: number;
    readonly totalLinesRemoved: number;
    readonly workAttribution: Readonly<{
      readonly state: 'VERIFIED';
      readonly attemptId: string;
      readonly baselineRef: string;
      readonly baselineSha256: string;
      readonly scopeDigest: string;
    }>;
    readonly providerExitObservationReceiptDigest: `sha256:${string}`;
    readonly evidenceDigest: `sha256:${string}`;
  }>;
  readonly hostPromptDeliveryAuthority: Readonly<{
    readonly promptDeliveryAttribution: Readonly<{ readonly state: 'CURRENT' }>;
    readonly agentId: string | null;
    readonly skillIds: readonly string[];
    readonly promptCompilePlanId: string;
    readonly receiptIdentity: `prompt-delivery-receipt:sha256:${string}`;
    readonly promptDeliveryAuthorityDigest: `sha256:${string}`;
    readonly basePromptSha256: `sha256:${string}`;
    readonly segmentManifestDigest: `sha256:${string}`;
    readonly taskSnapshotSha256: `sha256:${string}`;
    readonly providerInvocationDigest: `sha256:${string}`;
    readonly providerStartObservationReceiptDigest: `sha256:${string}`;
    readonly providerStartObservationEvidenceDigest: `sha256:${string}`;
    readonly executionCommitNonceSha256: `sha256:${string}`;
    readonly bindingDigest: `sha256:${string}`;
  }>;
}

/** Store-verified terminal effect authority supplied by the production spawn boundary. */
export interface CanonicalIngressEffectAuthorityV1 {
  readonly projection: ExecutionEffectResultProjectionV1;
  readonly binding: TaskAttemptEffectLandingBindingV2;
}

/**
 * Canonical worker-ingress boundary used by normal Docker settlement, recovery,
 * evaluation and finalization. Compatibility fields are parsed once here; the
 * returned value is always the strict, defaulted TaskResultV1 dialect.
 */
export function assembleCanonicalIngressResult(
  ingress: Record<string, unknown>,
  authority: CanonicalIngressAuthority,
): TaskResultV1 {
  const claimedChanges = Array.isArray(ingress['filesChanged']) ? ingress['filesChanged'] : [];
  const totalAdded = nonnegativeInteger(ingress['totalLinesAdded'])
    ?? nonnegativeInteger(ingress['linesAdded']) ?? 0;
  const totalRemoved = nonnegativeInteger(ingress['totalLinesRemoved'])
    ?? nonnegativeInteger(ingress['linesRemoved']) ?? 0;
  const filesChanged: FileChange[] = claimedChanges.flatMap((entry, index) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const change = entry as Record<string, unknown>;
      if (typeof change['path'] !== 'string') return [];
      const status = change['status'];
      return [{
        path: change['path'],
        status: status === 'added' || status === 'deleted' ? status : 'modified',
        linesAdded: nonnegativeInteger(change['linesAdded']) ?? 0,
        linesRemoved: nonnegativeInteger(change['linesRemoved']) ?? 0,
      }];
    }
    if (typeof entry !== 'string') return [];
    return [{
      path: entry,
      status: 'modified' as const,
      linesAdded: index === 0 ? totalAdded : 0,
      linesRemoved: index === 0 ? totalRemoved : 0,
    }];
  });
  const verification = ingress['testVerification'] && typeof ingress['testVerification'] === 'object'
    ? ingress['testVerification'] as Record<string, unknown>
    : undefined;
  const outcome = verification?.['outcome'] === 'PASSED' || verification?.['outcome'] === 'FAILED'
    || verification?.['outcome'] === 'NOT_EXECUTED'
    ? verification['outcome']
    : ingress['testsPassed'] === true ? 'PASSED' : ingress['testsPassed'] === false ? 'FAILED' : 'NOT_EXECUTED';
  const applicability = verification?.['applicability'] === 'OPTIONAL'
    || verification?.['applicability'] === 'NOT_APPLICABLE'
    ? verification['applicability'] : 'REQUIRED';
  const usage = ingress['tokenUsage'] && typeof ingress['tokenUsage'] === 'object'
    ? ingress['tokenUsage'] as Record<string, unknown> : {};
  const inputTokens = nonnegativeInteger(usage['inputTokens']) ?? 0;
  const outputTokens = nonnegativeInteger(usage['outputTokens']) ?? 0;
  const cacheReadTokens = nonnegativeInteger(usage['cacheReadTokens']) ?? 0;
  const cacheCreationTokens = nonnegativeInteger(usage['cacheCreationTokens']) ?? 0;
  const source = usage['source'] === 'provider-adapter' || usage['source'] === 'host-runtime-budget'
    ? usage['source'] : 'tokenizer-fallback';
  const tsc = ingress['tsc'] && typeof ingress['tsc'] === 'object'
    ? ingress['tsc'] as Record<string, unknown> : undefined;
  const candidate = {
    schemaVersion: '1.0' as const,
    taskId: authority.taskId,
    workerId: authority.workerId,
    provider: authority.provider,
    model: authority.model,
    ...(authority.sprintId ? { sprintId: authority.sprintId } : {}),
    ...(authority.promptCompilePlanId
      ? { promptCompilePlanId: authority.promptCompilePlanId }
      : {}),
    isPriorityFix: authority.isPriorityFix ?? false,
    fixForTaskId: authority.fixForTaskId ?? null,
    filesChanged,
    totalLinesAdded: totalAdded,
    totalLinesRemoved: totalRemoved,
    diskVerified: ingress['workAttribution'] !== undefined,
    boundaryViolations: Array.isArray(ingress['boundaryViolations']) ? ingress['boundaryViolations'] : [],
    ...(ingress['workAttribution'] ? { workAttribution: ingress['workAttribution'] } : {}),
    ...(ingress['workerWorkClaim'] ? { workerWorkClaim: ingress['workerWorkClaim'] } : {}),
    ...(ingress['promptDeliveryAttribution'] ? { promptDeliveryAttribution: ingress['promptDeliveryAttribution'] } : {}),
    // Host-authored xverify terminal observation must survive the strict
    // cutover — dropping it broke every cross-provider verifier run
    // (framing-invalid regression 2026-08-24).
    ...(ingress['hostTerminalProjection'] ? { hostTerminalProjection: ingress['hostTerminalProjection'] } : {}),
    tokenUsage: {
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
      totalTokens: nonnegativeInteger(usage['totalTokens'])
        ?? inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
      source,
    },
    cost: ingress['cost'] && typeof ingress['cost'] === 'object'
      ? ingress['cost']
      : { usd: 0, pricingSource: 'docker-settlement-pending' },
    tests: {
      passed: outcome === 'PASSED' ? 1 : 0,
      failed: outcome === 'FAILED' ? 1 : 0,
      total: outcome === 'NOT_EXECUTED' ? 0 : 1,
      coverage: typeof ingress['coverage'] === 'number' ? ingress['coverage'] : null,
      command: Array.isArray(verification?.['commands'])
        ? (verification['commands'] as string[]).join(' && ') || null : null,
      orchestratorVerified: false,
      applicability,
      outcome,
    },
    tsc: {
      clean: typeof tsc?.['clean'] === 'boolean' ? tsc['clean'] : false,
      errors: nonnegativeInteger(tsc?.['errors']) ?? 0,
    },
    selfAssessment: ingress['selfAssessment'],
    criteriaEvidence: Array.isArray(ingress['criteriaEvidence']) ? ingress['criteriaEvidence'] : [],
    testVerification: {
      applicability,
      outcome,
      commands: authority.verificationCommands
        ? [...authority.verificationCommands]
        : Array.isArray(verification?.['commands'])
          ? (verification['commands'] as unknown[])
            .filter((command): command is string => typeof command === 'string')
          : [],
    },
    techDebtCriterionIds: Array.isArray(ingress['techDebtCriterionIds'])
      ? ingress['techDebtCriterionIds']
        .filter((value): value is string => typeof value === 'string')
      : [],
    notes: typeof ingress['notes'] === 'string' ? ingress['notes'] : '',
    agent: typeof ingress['agentId'] === 'string' ? ingress['agentId'] : null,
    skills: Array.isArray(ingress['skillIds'])
      ? ingress['skillIds'].filter((value): value is string => typeof value === 'string') : [],
    attempt: authority.attempt ?? 1,
    ...(ingress['productionWiringEvidence']
      ? { productionWiringEvidence: ingress['productionWiringEvidence'] }
      : {}),
    ...(ingress['runPolicyEvidence']
      ? { runPolicyEvidence: ingress['runPolicyEvidence'] }
      : {}),
  };
  const validated = validateTaskResult(candidate);
  if (!validated.ok) {
    throw new AssemblerError(
      `worker ingress for task ${authority.taskId} failed canonical assembly: ${validated.errors.join('; ')}`,
      validated.missingFields,
      validated.errors,
    );
  }
  return validated.value;
}

/**
 * Promote one canonical worker ingress into the exact-attempt production
 * dialect. The custody binding is supplied only by the host capture boundary;
 * an identically named worker field is ignored by the V1 assembler and cannot
 * replace this authority.
 */
export function assembleCanonicalIngressResultV2(
  ingress: Record<string, unknown>,
  authority: CanonicalIngressAuthority,
  custody: CanonicalIngressCustodyAuthority,
): TaskResultV2 {
  const effectAuthority = exactEffectAuthority(custody.hostEffectAuthority);
  const projection = effectAuthority === null ? null
    : parseExecutionEffectResultProjectionV1(effectAuthority.projection);
  const effectLandingBinding = effectAuthority === null ? null
    : parseTaskAttemptEffectLandingBindingV2(effectAuthority.binding);
  const custodyIdentity = custody.attemptCustody.identity;
  const hostWorkArtifact = custody.hostWorkArtifact;
  if (projection === null || effectLandingBinding === null
    || effectLandingBinding.identity.projectId !== custodyIdentity.projectId
    || effectLandingBinding.identity.taskId !== custodyIdentity.taskId
    || effectLandingBinding.identity.attemptId !== custodyIdentity.attemptId
    || effectLandingBinding.identity.generation !== custodyIdentity.generation
    || effectLandingBinding.identity.taskId !== authority.taskId
    || effectLandingBinding.admissionReceiptDigest
      !== custody.attemptCustody.admissionReceiptDigest
    || effectLandingBinding.custodyPolicyDigest !== custody.attemptCustody.policyDigest
    || effectLandingBinding.disposition !== projection.disposition
    || effectLandingBinding.effectDecisionDigest !== projection.effectDecisionDigest
    || effectLandingBinding.transactionDigest !== projection.transactionDigest
    || hostWorkArtifact.artifactClass !== 'host-work-attribution'
    || hostWorkArtifact.artifactKey !== `host-work-${custodyIdentity.attemptId}`
    || !/^sha256:[a-f0-9]{64}$/u.test(hostWorkArtifact.artifactReceiptDigest)
    || !/^sha256:[a-f0-9]{64}$/u.test(hostWorkArtifact.artifactSha256)
    || !Number.isSafeInteger(hostWorkArtifact.byteLength)
    || hostWorkArtifact.byteLength < 0
    || (authority.attempt !== undefined && authority.attempt !== custodyIdentity.generation)) {
    throw new AssemblerError('Host execution effect authority is invalid', [], [
      'effect projection/binding identity, admission, policy or terminal mismatch',
    ]);
  }
  const billingDigest = `sha256:${createHash('sha256')
    .update(canonicalJson(custody.hostTerminalBilling.evidence)).digest('hex')}`;
  if (billingDigest !== custody.hostTerminalBilling.evidenceDigest
    || custody.hostTerminalBilling.evidence.provider !== authority.provider
    || !/^sha256:[a-f0-9]{64}$/u.test(custody.hostTerminalBilling.providerStreamReceiptDigest)) {
    throw new AssemblerError('Host terminal billing authority is invalid', [], [
      'provider billing evidence/stream binding mismatch',
    ]);
  }
  const {
    evidenceDigest: hostWorkEvidenceDigest,
    ...hostWorkEvidence
  } = custody.hostWorkAuthority;
  const derivedHostWorkEvidenceDigest = `sha256:${createHash('sha256')
    .update(canonicalJson(hostWorkEvidence)).digest('hex')}`;
  const hostFiles = validateHostWorkFiles(custody.hostWorkAuthority.filesChanged);
  const measuredProjectionEffects = projection.effects.filter(
    effect => effect.lineMetrics === 'REQUIRED',
  );
  const comparePathStatus = (
    left: Readonly<{ readonly path: string; readonly status: string }>,
    right: Readonly<{ readonly path: string; readonly status: string }>,
  ): number => left.path < right.path ? -1 : left.path > right.path ? 1
    : left.status < right.status ? -1 : left.status > right.status ? 1 : 0;
  const projectedPathStatuses = measuredProjectionEffects.map(effect => Object.freeze({
    path: effect.path,
    status: effect.status,
  })).sort(comparePathStatus);
  const hostPathStatuses = hostFiles?.map(change => Object.freeze({
    path: change.path,
    status: change.status,
  })).sort(comparePathStatus) ?? null;
  const hostFilesByPath = hostFiles === null
    ? null : new Map(hostFiles.map(change => [change.path, change] as const));
  const hostLinesAdded = hostFiles?.reduce((total, change) => total + change.linesAdded, 0) ?? -1;
  const hostLinesRemoved = hostFiles?.reduce((total, change) => total + change.linesRemoved, 0) ?? -1;
  const noChange = projection.disposition === 'COMMITTED_NO_CHANGE';
  if (hostWorkEvidenceDigest !== derivedHostWorkEvidenceDigest
    || hostFiles === null || hostPathStatuses === null
    || canonicalJson(hostPathStatuses) !== canonicalJson(projectedPathStatuses)
    || hostLinesAdded !== custody.hostWorkAuthority.totalLinesAdded
    || hostLinesRemoved !== custody.hostWorkAuthority.totalLinesRemoved
    || (noChange && hostFiles.length !== 0)
    || noChange !== (projection.effectCount === 0)
    || noChange !== (projection.decisionEffectCount === 0)
    || !/^sha256:[a-f0-9]{64}$/u.test(
      custody.hostWorkAuthority.providerExitObservationReceiptDigest,
    )
    || custody.hostWorkAuthority.workAttribution.state !== 'VERIFIED'
    || custody.hostWorkAuthority.workAttribution.attemptId
      !== custody.attemptCustody.identity.attemptId
    || !/^[a-f0-9]{64}$/u.test(custody.hostWorkAuthority.workAttribution.baselineSha256)
    || !/^[a-f0-9]{64}$/u.test(custody.hostWorkAuthority.workAttribution.scopeDigest)
    || !Number.isSafeInteger(custody.hostWorkAuthority.totalLinesAdded)
    || custody.hostWorkAuthority.totalLinesAdded < 0
    || !Number.isSafeInteger(custody.hostWorkAuthority.totalLinesRemoved)
    || custody.hostWorkAuthority.totalLinesRemoved < 0) {
    throw new AssemblerError('Host work attribution authority is invalid', [], [
      'host work evidence binding mismatch',
    ]);
  }
  const {
    bindingDigest: promptBindingDigest,
    ...promptBindingBody
  } = custody.hostPromptDeliveryAuthority;
  const derivedPromptBindingDigest = `sha256:${createHash('sha256')
    .update(canonicalJson(promptBindingBody)).digest('hex')}`;
  const promptSkills = custody.hostPromptDeliveryAuthority.skillIds;
  if (promptBindingDigest !== derivedPromptBindingDigest
    || custody.hostPromptDeliveryAuthority.promptDeliveryAttribution.state !== 'CURRENT'
    || custody.hostPromptDeliveryAuthority.promptCompilePlanId
      !== authority.promptCompilePlanId
    || !/^prompt-delivery-receipt:sha256:[a-f0-9]{64}$/u.test(
      custody.hostPromptDeliveryAuthority.receiptIdentity,
    )
    || [
      custody.hostPromptDeliveryAuthority.promptDeliveryAuthorityDigest,
      custody.hostPromptDeliveryAuthority.basePromptSha256,
      custody.hostPromptDeliveryAuthority.segmentManifestDigest,
      custody.hostPromptDeliveryAuthority.taskSnapshotSha256,
      custody.hostPromptDeliveryAuthority.providerInvocationDigest,
      custody.hostPromptDeliveryAuthority.providerStartObservationReceiptDigest,
      custody.hostPromptDeliveryAuthority.providerStartObservationEvidenceDigest,
      custody.hostPromptDeliveryAuthority.executionCommitNonceSha256,
      promptBindingDigest,
    ].some(digest => !/^sha256:[a-f0-9]{64}$/u.test(digest))
    || (custody.hostPromptDeliveryAuthority.agentId !== null
      && (typeof custody.hostPromptDeliveryAuthority.agentId !== 'string'
        || custody.hostPromptDeliveryAuthority.agentId.length === 0
        || Buffer.byteLength(custody.hostPromptDeliveryAuthority.agentId, 'utf8') > 256))
    || promptSkills.length > 512
    || promptSkills.some(id => typeof id !== 'string' || id.length === 0
      || Buffer.byteLength(id, 'utf8') > 256)
    || canonicalJson(promptSkills)
      !== canonicalJson([...new Set(promptSkills)]
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0))) {
    throw new AssemblerError('Host prompt delivery authority is invalid', [], [
      'prompt delivery receipt/start/commit binding mismatch',
    ]);
  }
  const workerClaimedFiles = Array.isArray(ingress['filesChanged'])
    ? ingress['filesChanged'].flatMap((entry) => {
        if (typeof entry === 'string') return [entry];
        if (entry && typeof entry === 'object' && !Array.isArray(entry)
          && typeof (entry as Record<string, unknown>)['path'] === 'string') {
          return [(entry as Record<string, string>)['path']!];
        }
        return [];
      })
    : [];
  const workerLinesAdded = nonnegativeInteger(ingress['totalLinesAdded'])
    ?? nonnegativeInteger(ingress['linesAdded']) ?? null;
  const workerLinesRemoved = nonnegativeInteger(ingress['totalLinesRemoved'])
    ?? nonnegativeInteger(ingress['linesRemoved']) ?? null;
  const {
    filesChanged: _workerFilesChanged,
    totalLinesAdded: _workerTotalLinesAdded,
    totalLinesRemoved: _workerTotalLinesRemoved,
    linesAdded: _workerLinesAdded,
    linesRemoved: _workerLinesRemoved,
    diskVerified: _workerDiskVerified,
    boundaryViolations: _workerBoundaryViolations,
    workAttribution: _workerWorkAttribution,
    workerWorkClaim: _workerWorkClaim,
    promptDeliveryAttribution: _workerPromptDeliveryAttribution,
    hostTerminalProjection: _workerHostTerminalProjection,
    agentId: _workerAgentId,
    skillIds: _workerSkillIds,
    attemptCustody: _workerAttemptCustody,
    providerBilling: _workerProviderBilling,
    effectLanding: _workerEffectLanding,
    effectProjection: _workerEffectProjection,
    executionEffects: _workerExecutionEffects,
    hostEffectAuthority: _workerHostEffectAuthority,
    landingReceipt: _workerLandingReceipt,
    effectDecision: _workerEffectDecision,
    effectResultProjection: _workerEffectResultProjection,
    effectLandingBinding: _workerEffectLandingBinding,
    tokenUsage: _workerTokenUsage,
    cost: _workerCost,
    ...workerObservedIngress
  } = ingress;
  const usage = Object.values(custody.hostTerminalBilling.evidence.modelUsage).reduce<{
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }>(
    (total, model) => ({
      inputTokens: total.inputTokens + (model.inputTokens ?? 0),
      outputTokens: total.outputTokens + (model.outputTokens ?? 0),
      cacheReadTokens: total.cacheReadTokens + (model.cacheReadTokens ?? 0),
      cacheCreationTokens: total.cacheCreationTokens + (model.cacheCreationTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  );
  const authoritativeIngress = Object.freeze({
    ...workerObservedIngress,
    filesChanged: projection.effects.map(effect => {
      const measured = effect.lineMetrics === 'REQUIRED'
        ? hostFilesByPath?.get(effect.path) : null;
      return Object.freeze({
        path: effect.path,
        status: effect.status,
        linesAdded: measured?.linesAdded ?? 0,
        linesRemoved: measured?.linesRemoved ?? 0,
      });
    }),
    totalLinesAdded: custody.hostWorkAuthority.totalLinesAdded,
    totalLinesRemoved: custody.hostWorkAuthority.totalLinesRemoved,
    linesAdded: custody.hostWorkAuthority.totalLinesAdded,
    linesRemoved: custody.hostWorkAuthority.totalLinesRemoved,
    // The Store projection is available only after full private-workspace
    // containment and a COMMITTED landing. Worker-authored disk or boundary
    // fields are deliberately excluded above and cannot mint this truth.
    diskVerified: true,
    boundaryViolations: Object.freeze([]),
    workAttribution: custody.hostWorkAuthority.workAttribution,
    workerWorkClaim: Object.freeze({
      filesChanged: Object.freeze(workerClaimedFiles),
      linesAdded: workerLinesAdded,
      linesRemoved: workerLinesRemoved,
      mismatch: canonicalJson([...workerClaimedFiles].sort())
          !== canonicalJson(projection.effects.map(effect => effect.path).sort())
        || (workerLinesAdded !== null
          && workerLinesAdded !== custody.hostWorkAuthority.totalLinesAdded)
        || (workerLinesRemoved !== null
          && workerLinesRemoved !== custody.hostWorkAuthority.totalLinesRemoved),
    }),
    promptDeliveryAttribution:
      custody.hostPromptDeliveryAuthority.promptDeliveryAttribution,
    agentId: custody.hostPromptDeliveryAuthority.agentId,
    skillIds: custody.hostPromptDeliveryAuthority.skillIds,
    tokenUsage: Object.freeze({
      ...usage,
      totalTokens: usage.inputTokens + usage.outputTokens
        + usage.cacheReadTokens + usage.cacheCreationTokens,
      source: 'provider-adapter',
    }),
    cost: custody.hostTerminalBilling.billingMode === 'api'
      ? Object.freeze({
          usd: custody.hostTerminalBilling.evidence.providerReportedUsd,
          currency: 'USD',
          billingMode: 'api',
          pricingSource: 'provider-envelope',
          isLocal: false,
        })
      : Object.freeze({
          usd: 0,
          currency: 'USD',
          referenceUsd: custody.hostTerminalBilling.evidence.providerReportedUsd,
          billingMode: 'subscription',
          pricingSource: 'provider-envelope-reference',
          isLocal: false,
        }),
  });
  const canonical = assembleCanonicalIngressResult(authoritativeIngress, {
    ...authority,
    attempt: custody.attemptCustody.identity.generation,
  });
  const {
    effectLanding: _sourceEffectLanding,
    hostWorkAttribution: _sourceHostWorkAttribution,
    ...sourceAttemptCustody
  } =
    custody.attemptCustody;
  return createProductionTaskResultV2({
    result: {
      ...(canonical as unknown as Record<string, unknown>),
      providerBilling: custody.hostTerminalBilling.evidence,
    },
    attemptCustody: Object.freeze({
      ...sourceAttemptCustody,
      effectLanding: effectLandingBinding,
      hostWorkAttribution: hostWorkArtifact,
    }),
    jsonBounds: custody.jsonBounds,
  });
}

function exactEffectAuthority(value: unknown): CanonicalIngressEffectAuthorityV1 | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || nodeTypes.isProxy(value)) {
    return null;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null
    || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).sort().join(',') !== 'binding,projection') return null;
  const projection = descriptors['projection'];
  const binding = descriptors['binding'];
  return projection && binding && 'value' in projection && 'value' in binding
    && projection.enumerable === true && binding.enumerable === true
    ? { projection: projection.value, binding: binding.value } as CanonicalIngressEffectAuthorityV1
    : null;
}

function validateHostWorkFiles(value: unknown): readonly FileChange[] | null {
  if (!Array.isArray(value) || nodeTypes.isProxy(value)) return null;
  const paths = new Set<string>();
  const files: FileChange[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item) || nodeTypes.isProxy(item)) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (Object.keys(descriptors).sort().join(',')
      !== 'linesAdded,linesRemoved,path,status'
      || Object.values(descriptors).some(descriptor => !('value' in descriptor)
        || descriptor.enumerable !== true)) return null;
    const record = item as Record<string, unknown>;
    if (typeof record['path'] !== 'string' || paths.has(record['path'])
      || (record['status'] !== 'added' && record['status'] !== 'modified'
        && record['status'] !== 'deleted')
      || nonnegativeInteger(record['linesAdded']) === undefined
      || nonnegativeInteger(record['linesRemoved']) === undefined
      || (record['status'] === 'added' && record['linesRemoved'] !== 0)
      || (record['status'] === 'deleted' && record['linesAdded'] !== 0)) return null;
    paths.add(record['path']);
    files.push(Object.freeze({
      path: record['path'],
      status: record['status'],
      linesAdded: record['linesAdded'],
      linesRemoved: record['linesRemoved'],
    }) as FileChange);
  }
  return Object.freeze(files);
}
function nonnegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}
