import {
  canonicalTaskAttemptCustodyJson,
  taskAttemptCustodyDigest,
  type Sha256Digest,
  type TaskAttemptCustodyArtifactReceiptV2,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
  type TaskAttemptCustodyStore,
} from '../core/task-attempt-custody-store.js';
import {
  settleProductionWiringResultEvidence,
  type ProductionWiringHostConsumerExecutionEvidence,
  type ProductionWiringHostConsumerExecutionEvidenceV1,
  type ProductionWiringHostConsumerExecutionEvidenceV2,
  type ProductionWiringResultSettlementDecision,
} from '../core/task-result-settlement.js';
import type { ProductionWiringPlanEvidence, Task } from '../core/task-types.js';
import type { TaskResultV2 } from '../core/task-result-schema.js';
import type { ExactAcceptedTaskResultAuthorityMetadata } from './task-result-authority.js';
import {
  parseProductionWiringHostProofRunReceipt,
  productionWiringHostProofTaskWriteScopeDigest,
  runProductionWiringHostProof,
  type ProductionWiringHostProofCommandRunner,
  type ProductionWiringHostProofRunReceiptV1,
} from './production-wiring-host-proof-runner.js';

const ARTIFACT_CLASS = 'production-wiring-host-settlement' as const;
const OBSERVATION_SCHEMA_VERSION = 1 as const;
const OBSERVATION_SCHEMA_VERSION_V2 = 2 as const;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface ExactProductionWiringHostObservationSetV1 {
  readonly affectedIngresses: readonly Readonly<{
    readonly ingressId: string;
    readonly evidenceRefs: readonly string[];
  }>[];
  readonly enablementAuthority: Readonly<{
    readonly authorityId: string;
    readonly mechanism: string;
    readonly evidenceRefs: readonly string[];
  }>;
  readonly proofTargets: readonly Readonly<{
    readonly proofTargetId: string;
    readonly kind: string;
    readonly evidenceRefs: readonly string[];
  }>[];
}

export interface ExactProductionWiringHostObservationRequestV1 {
  readonly schemaVersion: typeof OBSERVATION_SCHEMA_VERSION;
  readonly kind: 'exact-production-wiring-host-observation-request-v1';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly acceptedResultPredecessorDigest: Sha256Digest;
  readonly acceptedResultOccurredAt: string;
  readonly resultDigest: Sha256Digest;
  readonly plan: ProductionWiringPlanEvidence;
}

export interface ExactProductionWiringEffectAuthorityV1 {
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly landingArtifactReceiptDigest: Sha256Digest;
  readonly landingReceiptDigest: Sha256Digest;
  readonly effectLandingChainDigest: Sha256Digest;
  readonly effectDecisionDigest: Sha256Digest;
  readonly transactionDigest: Sha256Digest;
  readonly finalManifestDigest: Sha256Digest;
  readonly committedAt: string;
  readonly releasedAt: string;
}

export interface ExactProductionWiringHostObservationRequestV2 {
  readonly schemaVersion: typeof OBSERVATION_SCHEMA_VERSION_V2;
  readonly kind: 'exact-production-wiring-host-observation-request-v2';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly acceptedResultPredecessorDigest: Sha256Digest;
  readonly acceptedResultOccurredAt: string;
  readonly resultDigest: Sha256Digest;
  readonly effectAuthority: ExactProductionWiringEffectAuthorityV1;
  readonly taskWriteScope: Readonly<{
    readonly directories: readonly string[];
    readonly filesWrite: readonly string[];
  }>;
  readonly plan: Extract<ProductionWiringPlanEvidence, { readonly version: 2 }>;
}

export type ExactProductionWiringHostObservationRequest =
  | ExactProductionWiringHostObservationRequestV1
  | ExactProductionWiringHostObservationRequestV2;

export type ExactProductionWiringHostObserverDecisionV1 =
  | Readonly<{
      readonly state: 'observed';
      readonly observedAt: string;
      readonly observerId: string;
      readonly consumerId: string;
      readonly observationSet: ExactProductionWiringHostObservationSetV1;
    }>
  | Readonly<{
      readonly state: 'hold';
      readonly reasonCode: string;
    }>;

export type ExactProductionWiringHostObserverDecisionV2 =
  | Readonly<{
      readonly state: 'observed';
      readonly observedAt: string;
      readonly observerId: string;
      readonly consumerId: string;
      readonly proofRun: ProductionWiringHostProofRunReceiptV1;
    }>
  | Readonly<{ readonly state: 'hold'; readonly reasonCode: string }>;

export type ExactProductionWiringHostObserverDecision =
  | ExactProductionWiringHostObserverDecisionV1
  | ExactProductionWiringHostObserverDecisionV2;

/**
 * Trusted host-composition port. It is deliberately absent by default: worker
 * bytes and controller callers cannot turn a declared consumer into execution.
 */
export type ExactProductionWiringHostObserver = (
  request: ExactProductionWiringHostObservationRequest,
) => ExactProductionWiringHostObserverDecision
  | Promise<ExactProductionWiringHostObserverDecision>;

export interface ExactProductionWiringHostSettlementReceiptV1 {
  readonly schemaVersion: typeof OBSERVATION_SCHEMA_VERSION;
  readonly kind: 'exact-production-wiring-host-settlement-v1';
  readonly state: 'production-wired';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly acceptedResultPredecessorDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly contractDigest: string;
  readonly workerEvidenceDigest: Sha256Digest;
  readonly observerId: string;
  readonly observationSet: ExactProductionWiringHostObservationSetV1;
  readonly observationSetDigest: Sha256Digest;
  readonly hostConsumerExecution: ProductionWiringHostConsumerExecutionEvidenceV1;
  readonly hostConsumerExecutionDigest: Sha256Digest;
  readonly observedAt: string;
  readonly settlementDigest: Sha256Digest;
}

export interface ExactProductionWiringHostSettlementReceiptV2 {
  readonly schemaVersion: typeof OBSERVATION_SCHEMA_VERSION_V2;
  readonly kind: 'exact-production-wiring-host-settlement-v2';
  readonly state: 'production-wired';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly acceptedResultPredecessorDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly contractDigest: string;
  readonly hostProofProgramDigest: string;
  readonly workerEvidenceDigest: Sha256Digest;
  readonly effectAuthority: ExactProductionWiringEffectAuthorityV1;
  readonly effectAuthorityDigest: Sha256Digest;
  readonly observerId: string;
  readonly proofRun: ProductionWiringHostProofRunReceiptV1;
  readonly hostConsumerExecution: ProductionWiringHostConsumerExecutionEvidenceV2;
  readonly hostConsumerExecutionDigest: Sha256Digest;
  readonly observedAt: string;
  readonly settlementDigest: Sha256Digest;
}

export type ExactProductionWiringHostSettlementReceipt =
  | ExactProductionWiringHostSettlementReceiptV1
  | ExactProductionWiringHostSettlementReceiptV2;

export type ExactProductionWiringHostSettlementRead =
  | Readonly<{
      readonly state: 'current';
      readonly receipt: ExactProductionWiringHostSettlementReceipt;
      readonly artifactReceipt: TaskAttemptCustodyArtifactReceiptV2;
      readonly decision: Extract<ProductionWiringResultSettlementDecision, {
        readonly state: 'PRODUCTION_WIRED';
      }>;
    }>
  | Readonly<{ readonly state: 'not-required' }>
  | Readonly<{ readonly state: 'hold'; readonly reasonCode: string }>;

export interface ExactProductionWiringHostObserverOptions {
  readonly projectRoot: string;
  readonly image: string;
  readonly platform?: NodeJS.Platform;
  readonly isWsl2?: boolean;
  readonly dockerExecutable?: string;
  readonly commandRunner?: ProductionWiringHostProofCommandRunner;
  readonly now?: () => string;
}

/** Normal production composition for V2 plans; V1 is historical read-only. */
export function createExactProductionWiringHostObserver(
  options: ExactProductionWiringHostObserverOptions,
): ExactProductionWiringHostObserver {
  return async request => {
    if (request.schemaVersion !== OBSERVATION_SCHEMA_VERSION_V2
      || request.kind !== 'exact-production-wiring-host-observation-request-v2'
      || request.plan.version !== 2) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-plan-version-unsupported' });
    }
    const run = await runProductionWiringHostProof({
      program: request.plan.contract.hostProofProgram,
      attemptBinding: Object.freeze({
        projectRootSha256: request.identity.projectRootSha256,
        projectId: request.identity.projectId,
        taskId: request.identity.taskId,
        attemptId: request.identity.attemptId,
        generation: request.identity.generation,
        acceptedResultChainDigest: request.acceptedResultChainDigest,
        effectLandingReceiptDigest: request.effectAuthority.landingReceiptDigest,
        effectLandingChainDigest: request.effectAuthority.effectLandingChainDigest,
      }),
      taskWriteScope: request.taskWriteScope,
    }, options);
    if (run.state === 'hold') return run;
    return Object.freeze({
      state: 'observed' as const,
      observedAt: run.receipt.observedAt,
      observerId: 'deckent:docker-readonly-host-proof-v1',
      consumerId: request.plan.contract.canonicalConsumer.consumerId,
      proofRun: run.receipt,
    });
  };
}

function sameIdentity(
  left: TaskAttemptCustodyIdentityV2,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function nonBlankRefs(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0
    && value.every(ref => typeof ref === 'string' && ref.trim().length > 0);
}

function validateObservationSet(
  value: unknown,
  plan: ProductionWiringPlanEvidence,
): ExactProductionWiringHostObservationSetV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const set = value as ExactProductionWiringHostObservationSetV1;
  if (!Array.isArray(set.affectedIngresses)
    || set.affectedIngresses.length !== plan.contract.affectedIngresses.length
    || !Array.isArray(set.proofTargets)
    || set.proofTargets.length !== plan.contract.proofTargets.length
    || !set.enablementAuthority || typeof set.enablementAuthority !== 'object') return null;
  const ingressById = new Map(set.affectedIngresses.map(entry => [entry.ingressId, entry]));
  const proofById = new Map(set.proofTargets.map(entry => [entry.proofTargetId, entry]));
  if (ingressById.size !== set.affectedIngresses.length
    || proofById.size !== set.proofTargets.length
    || plan.contract.affectedIngresses.some(expected => {
      const actual = ingressById.get(expected.ingressId);
      return !actual || !nonBlankRefs(actual.evidenceRefs);
    })
    || set.enablementAuthority.authorityId
      !== plan.contract.enablementAuthority.authorityId
    || set.enablementAuthority.mechanism
      !== plan.contract.enablementAuthority.mechanism
    || !nonBlankRefs(set.enablementAuthority.evidenceRefs)
    || plan.contract.proofTargets.some(expected => {
      const actual = proofById.get(expected.proofTargetId);
      return !actual || actual.kind !== expected.kind || !nonBlankRefs(actual.evidenceRefs);
    })) return null;
  return set;
}

function observationEvidenceRefs(set: ExactProductionWiringHostObservationSetV1): readonly string[] {
  return Object.freeze([
    ...set.affectedIngresses.flatMap(entry => entry.evidenceRefs),
    ...set.enablementAuthority.evidenceRefs,
    ...set.proofTargets.flatMap(entry => entry.evidenceRefs),
  ]);
}

function artifactKey(
  authority: ExactAcceptedTaskResultAuthorityMetadata,
  plan: ProductionWiringPlanEvidence,
  policy: TaskAttemptCustodyPolicyV2,
  effectAuthority?: ExactProductionWiringEffectAuthorityV1,
): string {
  return `production-wiring-${taskAttemptCustodyDigest(
    'exact-production-wiring-host-settlement-key',
    {
      identity: authority.identity,
      acceptedResultChainDigest: authority.acceptedResultChainDigest,
      contractDigest: plan.contractDigest,
      ...(plan.version === 2 ? {
        hostProofProgramDigest: plan.hostProofProgramDigest,
        effectLandingReceiptDigest: effectAuthority?.landingReceiptDigest ?? null,
        effectLandingChainDigest: effectAuthority?.effectLandingChainDigest ?? null,
      } : {}),
    },
    policy.jsonBounds,
  ).slice('sha256:'.length)}`;
}

function workerEvidenceDigest(
  result: TaskResultV2,
  policy: TaskAttemptCustodyPolicyV2,
): Sha256Digest {
  return taskAttemptCustodyDigest(
    'exact-production-wiring-worker-evidence',
    result.productionWiringEvidence ?? null,
    policy.jsonBounds,
  );
}

function readEffectAuthority(input: {
  readonly result: TaskResultV2;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactProductionWiringEffectAuthorityV1 | null {
  const binding = input.result.attemptCustody.effectLanding;
  const identity = input.result.attemptCustody.identity;
  try {
    const verified = input.custodyStore.readVerifiedEffectLanding({
      identity,
      policy: input.policy,
      artifactKey: binding.landingArtifactKey,
    });
    const chain = input.custodyStore.readChain(identity, input.policy, 'effect-landing');
    if (!verified || !chain
      || verified.landing.state !== 'committed'
      || verified.landing.admissionReceiptDigest
        !== input.result.attemptCustody.admissionReceiptDigest
      || verified.landing.policyDigest !== input.result.attemptCustody.policyDigest
      || verified.landing.receiptDigest !== binding.landingReceiptDigest
      || verified.landing.disposition !== binding.disposition
      || verified.landing.effectDecisionDigest !== binding.effectDecisionDigest
      || verified.landing.transactionDigest !== binding.transactionDigest
      || chain.stage !== 'effect-landing'
      || chain.artifactKey !== binding.landingArtifactKey
      || chain.artifactReceiptDigest !== binding.landingArtifactReceiptDigest
      || chain.receiptDigest !== binding.effectLandingChainDigest
      || chain.occurredAt !== verified.landing.releasedAt) return null;
    return Object.freeze({
      disposition: verified.landing.disposition,
      landingArtifactReceiptDigest: binding.landingArtifactReceiptDigest,
      landingReceiptDigest: verified.landing.receiptDigest,
      effectLandingChainDigest: chain.receiptDigest,
      effectDecisionDigest: verified.landing.effectDecisionDigest,
      transactionDigest: verified.landing.transactionDigest,
      finalManifestDigest: verified.verifiedBundle.final.digest as Sha256Digest,
      committedAt: verified.landing.committedAt,
      releasedAt: verified.landing.releasedAt,
    });
  } catch {
    return null;
  }
}

function parseReceiptV1(
  value: unknown,
  authority: ExactAcceptedTaskResultAuthorityMetadata,
  task: Task,
  result: TaskResultV2,
  policy: TaskAttemptCustodyPolicyV2,
): ExactProductionWiringHostSettlementReceiptV1 | null {
  const plan = task.productionWiring;
  if (!plan || value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  const expectedKeys = [
    'schemaVersion', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
    'acceptedResultArtifactReceiptDigest', 'acceptedResultChainDigest', 'resultDigest',
    'acceptedResultPredecessorDigest', 'contractDigest', 'workerEvidenceDigest',
    'observerId', 'observationSet', 'observationSetDigest',
    'hostConsumerExecution', 'hostConsumerExecutionDigest', 'observedAt',
    'settlementDigest',
  ];
  if (keys.length !== expectedKeys.length
    || keys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))) return null;
  const identity = record.identity as TaskAttemptCustodyIdentityV2;
  const host = record.hostConsumerExecution as ProductionWiringHostConsumerExecutionEvidenceV1;
  const observationSet = validateObservationSet(record.observationSet, plan);
  if (record.schemaVersion !== OBSERVATION_SCHEMA_VERSION
    || record.kind !== 'exact-production-wiring-host-settlement-v1'
    || record.state !== 'production-wired'
    || !identity || !sameIdentity(identity, authority.identity)
    || record.admissionReceiptDigest !== authority.admissionReceiptDigest
    || record.policyDigest !== policy.policyDigest
    || record.acceptedResultArtifactReceiptDigest
      !== authority.acceptedResultRef.artifactReceiptDigest
    || record.acceptedResultChainDigest !== authority.acceptedResultChainDigest
    || !isDigest(record.acceptedResultPredecessorDigest)
    || record.resultDigest !== authority.resultDigest
    || record.contractDigest !== plan.contractDigest
    || record.workerEvidenceDigest !== workerEvidenceDigest(result, policy)
    || typeof record.observerId !== 'string' || record.observerId.trim().length === 0
    || observationSet === null
    || !isDigest(record.observationSetDigest)
    || record.observationSetDigest !== taskAttemptCustodyDigest(
      'exact-production-wiring-host-observation-set',
      observationSet,
      policy.jsonBounds,
    )
    || !host || host.version !== 1 || host.observedBy !== 'host'
    || host.contractDigest !== plan.contractDigest
    || host.consumerId !== plan.contract.canonicalConsumer.consumerId
    || JSON.stringify(host.evidenceRefs)
      !== JSON.stringify(observationEvidenceRefs(observationSet))
    || !isDigest(record.hostConsumerExecutionDigest)
    || record.hostConsumerExecutionDigest !== taskAttemptCustodyDigest(
      'exact-production-wiring-host-consumer-execution',
      host,
      policy.jsonBounds,
    )
    || !isTimestamp(record.observedAt)
    || !isDigest(record.settlementDigest)) return null;
  const body = { ...record };
  delete body.settlementDigest;
  if (record.settlementDigest !== taskAttemptCustodyDigest(
    'exact-production-wiring-host-settlement',
    body,
    policy.jsonBounds,
  )) return null;
  try {
    canonicalTaskAttemptCustodyJson(record, policy.jsonBounds);
  } catch {
    return null;
  }
  return record as unknown as ExactProductionWiringHostSettlementReceiptV1;
}

function expectedV2TargetKeys(plan: Extract<ProductionWiringPlanEvidence, { version: 2 }>): Set<string> {
  return new Set([
    `producer:${plan.contract.producer.producerId}`,
    `canonical-consumer:${plan.contract.canonicalConsumer.consumerId}`,
    ...plan.contract.affectedIngresses.map(entry => `affected-ingress:${entry.ingressId}`),
    `enablement-authority:${plan.contract.enablementAuthority.authorityId}`,
    ...plan.contract.proofTargets.map(entry => `proof-target:${entry.proofTargetId}`),
  ]);
}

function validateProofRun(
  value: unknown,
  plan: Extract<ProductionWiringPlanEvidence, { version: 2 }>,
  task: Task,
  authority: ExactAcceptedTaskResultAuthorityMetadata,
  effectAuthority: ExactProductionWiringEffectAuthorityV1,
): ProductionWiringHostProofRunReceiptV1 | null {
  const receipt = parseProductionWiringHostProofRunReceipt(value);
  if (!receipt || receipt.programDigest !== plan.hostProofProgramDigest
    || receipt.attemptBinding.projectRootSha256 !== authority.identity.projectRootSha256
    || receipt.attemptBinding.projectId !== authority.identity.projectId
    || receipt.attemptBinding.taskId !== authority.identity.taskId
    || receipt.attemptBinding.attemptId !== authority.identity.attemptId
    || receipt.attemptBinding.generation !== authority.identity.generation
    || receipt.attemptBinding.acceptedResultChainDigest !== authority.acceptedResultChainDigest
    || receipt.attemptBinding.effectLandingReceiptDigest !== effectAuthority.landingReceiptDigest
    || receipt.attemptBinding.effectLandingChainDigest !== effectAuthority.effectLandingChainDigest
    || receipt.taskWriteScopeDigest !== productionWiringHostProofTaskWriteScopeDigest({
      directories: task.scope?.directories ?? [],
      filesWrite: task.scope?.filesWrite ?? [],
    })) return null;
  const platformPlan = plan.contract.hostProofProgram.platforms.find(
    row => row.platform === receipt.platform,
  );
  if (!platformPlan || platformPlan.state !== 'supported'
    || platformPlan.runnerAdapterId !== receipt.runnerAdapterId) return null;
  const plannedGroups = new Map<string, typeof platformPlan.probes>();
  for (const probe of platformPlan.probes) {
    plannedGroups.set(probe.observationGroupId, Object.freeze([
      ...(plannedGroups.get(probe.observationGroupId) ?? []), probe,
    ]));
  }
  const receiptGroups = new Map(receipt.groupReceipts.map(group => [
    group.observationGroupId, group,
  ]));
  if (receiptGroups.size !== receipt.groupReceipts.length
    || receiptGroups.size !== plannedGroups.size) return null;
  const assetByPath = new Map(plan.contract.hostProofProgram.verifierAssets.map(asset => [
    asset.path, asset,
  ]));
  for (const [groupId, probes] of plannedGroups) {
    const expectedGroup = probes[0]!;
    const observedGroup = receiptGroups.get(groupId);
    if (!observedGroup || observedGroup.schemaId !== expectedGroup.expectation.schemaId
      || observedGroup.harnessPath !== expectedGroup.harnessPath
      || observedGroup.verifierAssets.length !== expectedGroup.verifierAssetPaths.length) return null;
    for (let index = 0; index < expectedGroup.verifierAssetPaths.length; index += 1) {
      const path = expectedGroup.verifierAssetPaths[index]!;
      const declared = assetByPath.get(path);
      const observedAsset = observedGroup.verifierAssets[index];
      if (!declared || !observedAsset || observedAsset.path !== path
        || observedAsset.sha256 !== declared.sha256
        || observedAsset.role !== declared.role) return null;
    }
  }
  const observations = new Map(receipt.targetObservations.map(entry => [entry.probeId, entry]));
  if (observations.size !== receipt.targetObservations.length
    || observations.size !== platformPlan.probes.length) return null;
  for (const probe of platformPlan.probes) {
    const observedProbe = observations.get(probe.probeId);
    if (!observedProbe || observedProbe.observationGroupId !== probe.observationGroupId
      || observedProbe.target.kind !== probe.target.kind
      || observedProbe.target.targetId !== probe.target.targetId) return null;
  }
  const expected = expectedV2TargetKeys(plan);
  const observed = new Set(receipt.targetObservations.map(entry => (
    `${entry.target.kind}:${entry.target.targetId}`
  )));
  if (observed.size !== receipt.targetObservations.length
    || observed.size !== expected.size
    || [...expected].some(key => !observed.has(key))) return null;
  return receipt;
}

function sameEffectAuthority(
  left: ExactProductionWiringEffectAuthorityV1,
  right: ExactProductionWiringEffectAuthorityV1,
  policy: TaskAttemptCustodyPolicyV2,
): boolean {
  return Buffer.from(canonicalTaskAttemptCustodyJson(left, policy.jsonBounds))
    .equals(Buffer.from(canonicalTaskAttemptCustodyJson(right, policy.jsonBounds)));
}

function parseReceiptV2(
  value: unknown,
  authority: ExactAcceptedTaskResultAuthorityMetadata,
  task: Task,
  result: TaskResultV2,
  effectAuthority: ExactProductionWiringEffectAuthorityV1,
  policy: TaskAttemptCustodyPolicyV2,
): ExactProductionWiringHostSettlementReceiptV2 | null {
  const plan = task.productionWiring;
  if (!plan || plan.version !== 2 || value === null || typeof value !== 'object'
    || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    'schemaVersion', 'kind', 'state', 'identity', 'admissionReceiptDigest', 'policyDigest',
    'acceptedResultArtifactReceiptDigest', 'acceptedResultChainDigest',
    'acceptedResultPredecessorDigest', 'resultDigest', 'contractDigest',
    'hostProofProgramDigest', 'workerEvidenceDigest', 'effectAuthority',
    'effectAuthorityDigest', 'observerId', 'proofRun', 'hostConsumerExecution',
    'hostConsumerExecutionDigest', 'observedAt', 'settlementDigest',
  ];
  if (Reflect.ownKeys(record).length !== expectedKeys.length
    || Reflect.ownKeys(record).some(key => typeof key !== 'string'
      || !expectedKeys.includes(key))) return null;
  const identity = record.identity as TaskAttemptCustodyIdentityV2;
  const effect = record.effectAuthority as ExactProductionWiringEffectAuthorityV1;
  const proofRun = validateProofRun(record.proofRun, plan, task, authority, effectAuthority);
  const host = record.hostConsumerExecution as ProductionWiringHostConsumerExecutionEvidence;
  const evidenceRefs = proofRun?.targetObservations.map(entry => entry.evidenceRef) ?? [];
  if (record.schemaVersion !== 2 || record.kind !== 'exact-production-wiring-host-settlement-v2'
    || record.state !== 'production-wired' || !identity || !sameIdentity(identity, authority.identity)
    || record.admissionReceiptDigest !== authority.admissionReceiptDigest
    || record.policyDigest !== policy.policyDigest
    || record.acceptedResultArtifactReceiptDigest
      !== authority.acceptedResultRef.artifactReceiptDigest
    || record.acceptedResultChainDigest !== authority.acceptedResultChainDigest
    || !isDigest(record.acceptedResultPredecessorDigest)
    || record.resultDigest !== authority.resultDigest
    || record.contractDigest !== plan.contractDigest
    || record.hostProofProgramDigest !== plan.hostProofProgramDigest
    || record.workerEvidenceDigest !== workerEvidenceDigest(result, policy)
    || !effect || !sameEffectAuthority(effect, effectAuthority, policy)
    || !isDigest(record.effectAuthorityDigest)
    || record.effectAuthorityDigest !== taskAttemptCustodyDigest(
      'exact-production-wiring-effect-authority', effectAuthority, policy.jsonBounds,
    )
    || typeof record.observerId !== 'string' || record.observerId.trim().length === 0
    || !proofRun
    || !host || host.version !== 2 || host.observedBy !== 'host'
    || host.contractDigest !== plan.contractDigest
    || host.hostProofProgramDigest !== plan.hostProofProgramDigest
    || host.consumerId !== plan.contract.canonicalConsumer.consumerId
    || host.effectLandingReceiptDigest !== effectAuthority.landingReceiptDigest
    || host.effectLandingChainDigest !== effectAuthority.effectLandingChainDigest
    || host.proofRunDigest !== proofRun.proofRunDigest
    || JSON.stringify(host.evidenceRefs) !== JSON.stringify(evidenceRefs)
    || !isDigest(record.hostConsumerExecutionDigest)
    || record.hostConsumerExecutionDigest !== taskAttemptCustodyDigest(
      'exact-production-wiring-host-consumer-execution-v2', host, policy.jsonBounds,
    )
    || record.observedAt !== proofRun.observedAt || !isTimestamp(record.observedAt)
    || !isDigest(record.settlementDigest)) return null;
  const body = { ...record };
  delete body.settlementDigest;
  if (record.settlementDigest !== taskAttemptCustodyDigest(
    'exact-production-wiring-host-settlement-v2', body, policy.jsonBounds,
  )) return null;
  try { canonicalTaskAttemptCustodyJson(record, policy.jsonBounds); } catch { return null; }
  return record as unknown as ExactProductionWiringHostSettlementReceiptV2;
}

export function readExactProductionWiringHostSettlement(input: {
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly task: Task;
  readonly result: TaskResultV2;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactProductionWiringHostSettlementRead {
  const plan = input.task.productionWiring;
  if (!plan) return Object.freeze({ state: 'not-required' as const });
  let acceptedArtifact: ReturnType<TaskAttemptCustodyStore['readArtifactReceipt']>;
  let acceptedChain: ReturnType<TaskAttemptCustodyStore['readChain']>;
  try {
    acceptedArtifact = input.custodyStore.readArtifactReceipt({
      identity: input.acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: 'canonical-accepted-result',
      artifactKey: input.acceptedAuthority.acceptedResultRef.artifactKey,
    });
    acceptedChain = input.custodyStore.readChain(
      input.acceptedAuthority.identity,
      input.policy,
      'accepted-result',
    );
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'accepted-chain-unavailable' });
  }
  if (!acceptedArtifact || !acceptedChain
    || acceptedArtifact.receiptDigest
      !== input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest
    || acceptedChain.receiptDigest !== input.acceptedAuthority.acceptedResultChainDigest
    || acceptedChain.artifactReceiptDigest !== acceptedArtifact.receiptDigest
    || acceptedChain.artifactKey !== acceptedArtifact.artifactKey) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'accepted-chain-unavailable' });
  }
  const effectAuthority = plan.version === 2 ? readEffectAuthority(input) : undefined;
  if (plan.version === 2 && !effectAuthority) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'effect-landing-authority-unavailable' });
  }
  if (effectAuthority && acceptedChain.predecessorDigest !== effectAuthority.effectLandingChainDigest) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'effect-landing-predecessor-mismatch' });
  }
  const key = artifactKey(
    input.acceptedAuthority, plan, input.policy, effectAuthority ?? undefined,
  );
  let artifactReceipt: ReturnType<TaskAttemptCustodyStore['readArtifactReceipt']>;
  try {
    artifactReceipt = input.custodyStore.readArtifactReceipt({
      identity: input.acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: ARTIFACT_CLASS,
      artifactKey: key,
    });
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observation-replay-mismatch' });
  }
  if (!artifactReceipt) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observation-unavailable' });
  }
  let artifact: ReturnType<TaskAttemptCustodyStore['readVerifiedArtifact']>;
  try {
    artifact = input.custodyStore.readVerifiedArtifact({
      identity: input.acceptedAuthority.identity,
      policy: input.policy,
      artifactClass: ARTIFACT_CLASS,
      artifactKey: key,
      receiptDigest: artifactReceipt.receiptDigest,
    });
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observation-replay-mismatch' });
  }
  let decoded: unknown;
  try {
    decoded = artifact ? JSON.parse(Buffer.from(artifact.bytes).toString('utf8')) : null;
  } catch {
    decoded = null;
  }
  const receipt = plan.version === 2
    ? parseReceiptV2(
        decoded,
        input.acceptedAuthority,
        input.task,
        input.result,
        effectAuthority!,
        input.policy,
      )
    : parseReceiptV1(
        decoded,
        input.acceptedAuthority,
        input.task,
        input.result,
        input.policy,
      );
  if (!artifact || !receipt || artifact.receipt.receiptDigest !== artifactReceipt.receiptDigest
    || artifact.receipt.capturedAt !== receipt.observedAt
    || receipt.acceptedResultPredecessorDigest !== acceptedChain.predecessorDigest
    || Date.parse(receipt.observedAt) < Date.parse(acceptedArtifact.capturedAt)
    || Date.parse(receipt.observedAt) < Date.parse(acceptedChain.occurredAt)
    || Date.parse(receipt.observedAt) > Date.now() + MAX_FUTURE_SKEW_MS) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observation-replay-mismatch' });
  }
  const decision = settleProductionWiringResultEvidence({
    plan,
    workerEvidence: input.result.productionWiringEvidence,
    hostConsumerExecution: receipt.hostConsumerExecution,
  });
  if (decision.state !== 'PRODUCTION_WIRED'
    || decision.contractDigest !== receipt.contractDigest
    || (plan.version === 2 && (
      receipt.schemaVersion !== 2
      || decision.hostProofProgramDigest !== plan.hostProofProgramDigest
      || decision.effectLandingReceiptDigest !== effectAuthority!.landingReceiptDigest
      || decision.effectLandingChainDigest !== effectAuthority!.effectLandingChainDigest
      || decision.proofRunDigest !== receipt.proofRun.proofRunDigest
    ))
    || JSON.stringify(decision.evidenceRefs) !== JSON.stringify(receipt.hostConsumerExecution.evidenceRefs)) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-settlement-revalidation-mismatch' });
  }
  return Object.freeze({ state: 'current' as const, receipt, artifactReceipt, decision });
}

async function ensureV2ProductionWiringHostSettlement(input: {
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly task: Task;
  readonly result: TaskResultV2;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly observer: ExactProductionWiringHostObserver;
  readonly acceptedArtifact: TaskAttemptCustodyArtifactReceiptV2;
  readonly acceptedChain: NonNullable<ReturnType<TaskAttemptCustodyStore['readChain']>>;
}): Promise<ExactProductionWiringHostSettlementRead> {
  const plan = input.task.productionWiring;
  if (!plan || plan.version !== 2) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-plan-version-unsupported' });
  }
  const effectAuthority = readEffectAuthority(input);
  if (!effectAuthority) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'effect-landing-authority-unavailable' });
  }
  if (input.acceptedChain.predecessorDigest !== effectAuthority.effectLandingChainDigest) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'effect-landing-predecessor-mismatch' });
  }
  let observed: ExactProductionWiringHostObserverDecision;
  try {
    observed = await input.observer(Object.freeze({
      schemaVersion: OBSERVATION_SCHEMA_VERSION_V2,
      kind: 'exact-production-wiring-host-observation-request-v2',
      identity: Object.freeze({ ...input.acceptedAuthority.identity }),
      acceptedResultArtifactReceiptDigest:
        input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest,
      acceptedResultChainDigest: input.acceptedAuthority.acceptedResultChainDigest,
      acceptedResultPredecessorDigest: input.acceptedChain.predecessorDigest,
      acceptedResultOccurredAt: input.acceptedArtifact.capturedAt,
      resultDigest: input.acceptedAuthority.resultDigest,
      effectAuthority,
      taskWriteScope: Object.freeze({
        directories: Object.freeze([...(input.task.scope?.directories ?? [])]),
        filesWrite: Object.freeze([...(input.task.scope?.filesWrite ?? [])]),
      }),
      plan: JSON.parse(Buffer.from(canonicalTaskAttemptCustodyJson(
        plan, input.policy.jsonBounds,
      )).toString('utf8')) as Extract<ProductionWiringPlanEvidence, { version: 2 }>,
    }));
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observer-failed' });
  }
  if (observed.state !== 'observed' || !('proofRun' in observed)
    || observed.consumerId !== plan.contract.canonicalConsumer.consumerId
    || observed.observerId !== 'deckent:docker-readonly-host-proof-v1'
    || !isTimestamp(observed.observedAt)
    || observed.observedAt !== observed.proofRun.observedAt
    || Date.parse(observed.observedAt) < Date.parse(input.acceptedArtifact.capturedAt)
    || Date.parse(observed.observedAt) < Date.parse(input.acceptedChain.occurredAt)
    || Date.parse(observed.observedAt) < Date.parse(effectAuthority.releasedAt)
    || Date.parse(observed.observedAt) > Date.now() + MAX_FUTURE_SKEW_MS) {
    return Object.freeze({
      state: 'hold' as const,
      reasonCode: observed.state === 'hold' ? observed.reasonCode : 'host-observation-invalid',
    });
  }
  const proofRun = validateProofRun(
    observed.proofRun, plan, input.task, input.acceptedAuthority, effectAuthority,
  );
  if (!proofRun) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-proof-run-invalid' });
  }
  const evidenceRefs = Object.freeze(proofRun.targetObservations.map(entry => entry.evidenceRef));
  const hostConsumerExecution: ProductionWiringHostConsumerExecutionEvidenceV2 = Object.freeze({
    version: 2,
    contractDigest: plan.contractDigest,
    hostProofProgramDigest: plan.hostProofProgramDigest,
    observedBy: 'host',
    consumerId: observed.consumerId,
    effectLandingReceiptDigest: effectAuthority.landingReceiptDigest,
    effectLandingChainDigest: effectAuthority.effectLandingChainDigest,
    proofRunDigest: proofRun.proofRunDigest,
    evidenceRefs,
  });
  const decision = settleProductionWiringResultEvidence({
    plan,
    workerEvidence: input.result.productionWiringEvidence,
    hostConsumerExecution,
  });
  if (decision.state !== 'PRODUCTION_WIRED') {
    return Object.freeze({ state: 'hold' as const, reasonCode: decision.reason });
  }
  const body = Object.freeze({
    schemaVersion: OBSERVATION_SCHEMA_VERSION_V2,
    kind: 'exact-production-wiring-host-settlement-v2' as const,
    state: 'production-wired' as const,
    identity: Object.freeze({ ...input.acceptedAuthority.identity }),
    admissionReceiptDigest: input.acceptedAuthority.admissionReceiptDigest,
    policyDigest: input.policy.policyDigest,
    acceptedResultArtifactReceiptDigest:
      input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest,
    acceptedResultChainDigest: input.acceptedAuthority.acceptedResultChainDigest,
    acceptedResultPredecessorDigest: input.acceptedChain.predecessorDigest,
    resultDigest: input.acceptedAuthority.resultDigest,
    contractDigest: plan.contractDigest,
    hostProofProgramDigest: plan.hostProofProgramDigest,
    workerEvidenceDigest: workerEvidenceDigest(input.result, input.policy),
    effectAuthority,
    effectAuthorityDigest: taskAttemptCustodyDigest(
      'exact-production-wiring-effect-authority', effectAuthority, input.policy.jsonBounds,
    ),
    observerId: observed.observerId,
    proofRun,
    hostConsumerExecution,
    hostConsumerExecutionDigest: taskAttemptCustodyDigest(
      'exact-production-wiring-host-consumer-execution-v2',
      hostConsumerExecution,
      input.policy.jsonBounds,
    ),
    observedAt: observed.observedAt,
  });
  const receipt: ExactProductionWiringHostSettlementReceiptV2 = Object.freeze({
    ...body,
    settlementDigest: taskAttemptCustodyDigest(
      'exact-production-wiring-host-settlement-v2', body, input.policy.jsonBounds,
    ),
  });
  const key = artifactKey(input.acceptedAuthority, plan, input.policy, effectAuthority);
  try {
    input.custodyStore.publishHostArtifact({
      identity: input.acceptedAuthority.identity,
      policy: input.policy,
      admissionReceiptDigest: input.acceptedAuthority.admissionReceiptDigest,
      artifactClass: ARTIFACT_CLASS,
      artifactKey: key,
      capturedAt: observed.observedAt,
      bytes: canonicalTaskAttemptCustodyJson(receipt, input.policy.jsonBounds),
    });
  } catch {
    const adopted = readExactProductionWiringHostSettlement(input);
    return adopted.state === 'current'
      ? adopted
      : Object.freeze({ state: 'hold' as const, reasonCode: 'host-observation-publication-failed' });
  }
  return readExactProductionWiringHostSettlement(input);
}

export async function ensureExactProductionWiringHostSettlement(input: {
  readonly acceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
  readonly task: Task;
  readonly result: TaskResultV2;
  readonly custodyStore: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly observer?: ExactProductionWiringHostObserver;
}): Promise<ExactProductionWiringHostSettlementRead> {
  const plan = input.task.productionWiring;
  if (!plan) return Object.freeze({ state: 'not-required' as const });
  const existing = readExactProductionWiringHostSettlement(input);
  if (existing.state === 'current') return existing;
  if (!input.observer) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observer-unavailable' });
  }
  const acceptedArtifact = input.custodyStore.readArtifactReceipt({
    identity: input.acceptedAuthority.identity,
    policy: input.policy,
    artifactClass: 'canonical-accepted-result',
    artifactKey: input.acceptedAuthority.acceptedResultRef.artifactKey,
  });
  const acceptedChain = input.custodyStore.readChain(
    input.acceptedAuthority.identity,
    input.policy,
    'accepted-result',
  );
  if (!acceptedArtifact || !acceptedChain
    || acceptedArtifact.receiptDigest
      !== input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest
    || acceptedChain.receiptDigest !== input.acceptedAuthority.acceptedResultChainDigest
    || acceptedChain.artifactReceiptDigest !== acceptedArtifact.receiptDigest) {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'accepted-chain-unavailable' });
  }
  if (plan.version === 2) {
    return ensureV2ProductionWiringHostSettlement({
      ...input,
      observer: input.observer,
      acceptedArtifact,
      acceptedChain,
    });
  }
  let observed: ExactProductionWiringHostObserverDecision;
  try {
    observed = await input.observer(Object.freeze({
      schemaVersion: OBSERVATION_SCHEMA_VERSION,
      kind: 'exact-production-wiring-host-observation-request-v1',
      identity: Object.freeze({ ...input.acceptedAuthority.identity }),
      acceptedResultArtifactReceiptDigest:
        input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest,
      acceptedResultChainDigest: input.acceptedAuthority.acceptedResultChainDigest,
      acceptedResultPredecessorDigest: acceptedChain.predecessorDigest,
      acceptedResultOccurredAt: acceptedArtifact.capturedAt,
      resultDigest: input.acceptedAuthority.resultDigest,
      plan: JSON.parse(Buffer.from(canonicalTaskAttemptCustodyJson(
        plan,
        input.policy.jsonBounds,
      )).toString('utf8')) as ProductionWiringPlanEvidence,
    }));
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observer-failed' });
  }
  if (observed.state !== 'observed' || !('observationSet' in observed)
    || !isTimestamp(observed.observedAt)
    || Date.parse(observed.observedAt) < Date.parse(acceptedArtifact.capturedAt)
    || Date.parse(observed.observedAt) < Date.parse(acceptedChain.occurredAt)
    || Date.parse(observed.observedAt) > Date.now() + MAX_FUTURE_SKEW_MS
    || typeof observed.observerId !== 'string' || observed.observerId.trim().length === 0
    || observed.consumerId !== plan.contract.canonicalConsumer.consumerId
    || validateObservationSet(observed.observationSet, plan) === null) {
    return Object.freeze({
      state: 'hold' as const,
      reasonCode: observed.state === 'hold' ? observed.reasonCode : 'host-observation-invalid',
    });
  }
  const observationSet = validateObservationSet(observed.observationSet, plan)!;
  const evidenceRefs = observationEvidenceRefs(observationSet);
  const hostConsumerExecution = Object.freeze({
    version: 1 as const,
    contractDigest: plan.contractDigest,
    observedBy: 'host' as const,
    consumerId: observed.consumerId,
    evidenceRefs,
  });
  const decision = settleProductionWiringResultEvidence({
    plan,
    workerEvidence: input.result.productionWiringEvidence,
    hostConsumerExecution,
  });
  if (decision.state !== 'PRODUCTION_WIRED') {
    return Object.freeze({ state: 'hold' as const, reasonCode: decision.reason });
  }
  const body = Object.freeze({
    schemaVersion: OBSERVATION_SCHEMA_VERSION,
    kind: 'exact-production-wiring-host-settlement-v1' as const,
    state: 'production-wired' as const,
    identity: Object.freeze({ ...input.acceptedAuthority.identity }),
    admissionReceiptDigest: input.acceptedAuthority.admissionReceiptDigest,
    policyDigest: input.policy.policyDigest,
    acceptedResultArtifactReceiptDigest:
      input.acceptedAuthority.acceptedResultRef.artifactReceiptDigest,
    acceptedResultChainDigest: input.acceptedAuthority.acceptedResultChainDigest,
    acceptedResultPredecessorDigest: acceptedChain.predecessorDigest,
    resultDigest: input.acceptedAuthority.resultDigest,
    contractDigest: plan.contractDigest,
    workerEvidenceDigest: workerEvidenceDigest(input.result, input.policy),
    observerId: observed.observerId,
    observationSet,
    observationSetDigest: taskAttemptCustodyDigest(
      'exact-production-wiring-host-observation-set',
      observationSet,
      input.policy.jsonBounds,
    ),
    hostConsumerExecution,
    hostConsumerExecutionDigest: taskAttemptCustodyDigest(
      'exact-production-wiring-host-consumer-execution',
      hostConsumerExecution,
      input.policy.jsonBounds,
    ),
    observedAt: observed.observedAt,
  });
  const receipt: ExactProductionWiringHostSettlementReceiptV1 = Object.freeze({
    ...body,
    settlementDigest: taskAttemptCustodyDigest(
      'exact-production-wiring-host-settlement',
      body,
      input.policy.jsonBounds,
    ),
  });
  const key = artifactKey(input.acceptedAuthority, plan, input.policy);
  try {
    input.custodyStore.publishHostArtifact({
      identity: input.acceptedAuthority.identity,
      policy: input.policy,
      admissionReceiptDigest: input.acceptedAuthority.admissionReceiptDigest,
      artifactClass: ARTIFACT_CLASS,
      artifactKey: key,
      capturedAt: observed.observedAt,
      bytes: canonicalTaskAttemptCustodyJson(receipt, input.policy.jsonBounds),
    });
  } catch {
    return Object.freeze({ state: 'hold' as const, reasonCode: 'host-observation-publication-failed' });
  }
  return readExactProductionWiringHostSettlement(input);
}
