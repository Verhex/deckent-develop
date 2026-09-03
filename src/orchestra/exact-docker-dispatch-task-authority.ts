import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';

import {
  canonicalTaskAttemptCustodyJson,
  type Sha256Digest,
  type TaskAttemptCustodyPolicyV2,
} from '../core/task-attempt-custody-store.js';
import {
  validateProductionWiringHostProofAdapterAdmission,
} from '../core/production-wiring-host-proof.js';
import {
  TaskStatus,
  createGoNoGoCriterionItem,
  createPostSettlementPlanProjection,
  createProductionWiringPlanEvidence,
  createRunPolicyPlanAuthority,
  deriveProductionWiringApplicability,
  productionWiringVerifierAssetWriteScopeOverlap,
  type Task,
} from '../core/task-types.js';
import { assertExecutionLandingPolicyConfig } from '../core/execution-budget-policy.js';
import { parsePromptCostCanaryTaskAuthority } from '../core/prompt-cost-canary-task-authority.js';
import { TASK_KINDS } from '../core/work-model.js';
import { validateTaskId } from '../core/validators.js';
import {
  parseExactNormalTaskApprovedMaterialV3,
  type ExactNormalTaskApprovedMaterialV3,
  type ExactTaskEvaluationPolicyAuthorityV2,
} from './exact-evaluation-policy-authority.js';

const REQUIRED_TASK_KEYS = Object.freeze([
  'id', 'title', 'description', 'model', 'effort', 'priority', 'reason', 'scope',
  'dependencies', 'goNogo', 'status', 'assignedWorker',
] as const);

const OPTIONAL_TASK_KEYS = Object.freeze([
  'verification', 'promptCompilePlanId', 'type', 'sprintId', 'isPriorityFix', 'fixForTaskId',
  'provider', 'forceModel', 'forceEffort', 'forceAgent', 'forceSkills', 'excludeAgent',
  'excludeSkills', 'authMode', 'backend', 'modelEffort', 'fixMode', 'smoke', 'assignedAgent',
  'assignedSkills', 'estimatedTokens', 'routingMeta', 'actor', 'budget', 'budgetPolicy',
  'productionWiring', 'productionWiringApplicability', 'runPolicy', 'promptCostCanary',
  'postSettlementProjection', 'createdAt',
  'updatedAt',
] as const);

export const EXACT_DOCKER_DISPATCH_TASK_KEYS = Object.freeze([
  ...REQUIRED_TASK_KEYS,
  ...OPTIONAL_TASK_KEYS,
] as const);

export interface ExactDockerDispatchTaskSnapshotAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-dispatch-task-snapshot-authority-v2';
  readonly dispatchRequestId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly task: Task;
  readonly taskDigest: Sha256Digest;
  readonly approved: ExactNormalTaskApprovedMaterialV3;
  readonly approvedDigest: Sha256Digest;
  readonly sprintId: string;
  readonly evaluationPolicy: ExactTaskEvaluationPolicyAuthorityV2;
  readonly lineage: unknown;
  readonly lineageDigest: Sha256Digest;
  /** Opaque canonical bytes; provider/prompt/execution semantics remain backend-owned. */
  readonly dispatch: unknown;
  readonly snapshotSha256: Sha256Digest;
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) return null;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every(key => keys.includes(key))
    || keys.some(key => typeof key !== 'string' || !allowed.has(key))
  ) return null;
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    if (descriptor.value === undefined) return null;
    record[key] = descriptor.value;
  }
  return record;
}

/**
 * Producer boundary for ordinary in-memory Task objects. TypeScript callers may
 * materialize optional fields as own properties whose value is undefined; those
 * fields have no JSON meaning and must not enter immutable dispatch material.
 * Persisted material continues to use exactRecord and rejects undefined values.
 */
function exactDefinedRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) return null;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  const allowed = new Set([...required, ...optional]);
  if (
    !required.every(key => keys.includes(key))
    || keys.some(key => typeof key !== 'string' || !allowed.has(key))
  ) return null;
  const requiredSet = new Set(required);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    if (descriptor.value === undefined) {
      if (requiredSet.has(key)) return null;
      continue;
    }
    record[key] = descriptor.value;
  }
  return record;
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'string');
}

function canonicalBytes(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): Uint8Array | null {
  try {
    return canonicalTaskAttemptCustodyJson(value, policy.jsonBounds);
  } catch {
    return null;
  }
}

function rawDigest(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalDigest(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): Sha256Digest | null {
  const bytes = canonicalBytes(value, policy);
  return bytes === null ? null : rawDigest(bytes);
}

/** Raw SHA-256 of policy-canonical JSON; shared with producer material refs. */
export function exactDockerDispatchCanonicalDigest(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): Sha256Digest {
  const digest = canonicalDigest(value, policy);
  if (digest === null) throw new TypeError('invalid exact Docker canonical material');
  return digest;
}

function canonicalEqual(
  left: unknown,
  right: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): boolean {
  const leftBytes = canonicalBytes(left, policy);
  const rightBytes = canonicalBytes(right, policy);
  return leftBytes !== null
    && rightBytes !== null
    && Buffer.from(leftBytes).equals(Buffer.from(rightBytes));
}

function deepFreezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreezeJson(entry);
    Object.freeze(value);
  }
  return value;
}

function validateScope(value: unknown): boolean {
  const scope = exactRecord(value, ['directories', 'filesRead', 'filesWrite']);
  return scope !== null
    && stringArray(scope.directories)
    && stringArray(scope.filesRead)
    && stringArray(scope.filesWrite);
}

function validateGoNogo(value: unknown, policy: TaskAttemptCustodyPolicyV2): boolean {
  const goNogo = exactRecord(
    value,
    ['goCriteria', 'noGoCriteria', 'techDebtAcceptable'],
    ['items'],
  );
  if (
    goNogo === null
    || typeof goNogo.goCriteria !== 'string'
    || typeof goNogo.noGoCriteria !== 'string'
    || typeof goNogo.techDebtAcceptable !== 'string'
    || (goNogo.items !== undefined && !Array.isArray(goNogo.items))
  ) return false;
  for (const candidate of (goNogo.items ?? []) as unknown[]) {
    const item = exactRecord(candidate, [
      'id', 'polarity', 'statement', 'evidenceRequirements',
    ]);
    if (
      item === null
      || !nonemptyString(item.id)
      || (item.polarity !== 'go' && item.polarity !== 'no-go')
      || !nonemptyString(item.statement)
      || !stringArray(item.evidenceRequirements)
    ) return false;
    try {
      const canonical = createGoNoGoCriterionItem({
        polarity: item.polarity,
        statement: item.statement,
        evidenceRequirements: item.evidenceRequirements,
      });
      if (
        canonical.id !== item.id
        || !canonicalEqual(canonical, item, policy)
      ) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function validateVerification(value: unknown): boolean {
  if (value === undefined) return true;
  const verification = exactRecord(value, ['version', 'source', 'commands']);
  return verification !== null
    && verification.version === 1
    && ['directive', 'planner', 'legacy-ingress'].includes(String(verification.source))
    && Array.isArray(verification.commands)
    && verification.commands.length <= 512
    && verification.commands.every(command => typeof command === 'string'
      && Buffer.byteLength(command, 'utf8') <= 16 * 1024);
}

function validateRoutingMeta(value: unknown): boolean {
  if (value === undefined) return true;
  const meta = exactRecord(value, [], [
    'taskDNA', 'confidence', 'routingVersion', 'workType', 'dominantDomain', 'provenance',
    'personaSlices', 'storySummary', 'skillEvidenceDigest', 'skillCatalogDigest',
    'skillDecisionDigest', 'escalation', 'policyTags', 'rerouteCount', 'overrideWarnings',
    'scopeDerivation',
  ]);
  if (meta === null) return false;
  for (const key of [
    'workType', 'dominantDomain', 'provenance', 'storySummary', 'skillEvidenceDigest',
    'skillCatalogDigest', 'skillDecisionDigest', 'escalation',
  ]) if (meta[key] !== undefined && typeof meta[key] !== 'string') return false;
  for (const key of ['personaSlices', 'policyTags', 'overrideWarnings']) {
    if (meta[key] !== undefined && !stringArray(meta[key])) return false;
  }
  if (meta.confidence !== undefined
    && typeof meta.confidence !== 'string'
    && (typeof meta.confidence !== 'number' || !Number.isFinite(meta.confidence))) return false;
  if (meta.routingVersion !== undefined && meta.routingVersion !== 'v2' && meta.routingVersion !== 'v3') {
    return false;
  }
  if (meta.rerouteCount !== undefined
    && (!Number.isSafeInteger(meta.rerouteCount) || Number(meta.rerouteCount) < 0)) return false;
  if (meta.scopeDerivation !== undefined) {
    const derivation = exactRecord(meta.scopeDerivation, ['extraFiles', 'extraDirs', 'reason']);
    if (derivation === null
      || !stringArray(derivation.extraFiles)
      || !stringArray(derivation.extraDirs)
      || typeof derivation.reason !== 'string') return false;
  }
  return true;
}

function validateActor(value: unknown): boolean {
  if (value === undefined) return true;
  const actor = exactRecord(value, ['id'], [
    'role', 'tenantId', 'identityClass', 'assurance', 'provenance',
  ]);
  if (actor === null || !nonemptyString(actor.id)) return false;
  for (const key of ['role', 'tenantId']) {
    if (actor[key] !== undefined && typeof actor[key] !== 'string') return false;
  }
  return (actor.identityClass === undefined
      || ['local', 'oidc', 'workload', 'connector', 'service'].includes(String(actor.identityClass)))
    && (actor.assurance === undefined
      || ['unverified', 'os-user', 'token-parsed', 'token-verified'].includes(String(actor.assurance)))
    && (actor.provenance === undefined
      || ['cli', 'mcp', 'chat', 'autonomous', 'webhook', 'scheduled', 'api', 'ide']
        .includes(String(actor.provenance)));
}

function validateBudget(value: unknown): boolean {
  if (value === undefined) return true;
  const budget = exactRecord(value, [], [
    'maxUsd', 'maxTokens', 'maxTurns', 'maxInputTokens', 'maxOutputTokens',
    'maxCacheReadTokens', 'maxCacheCreationTokens', 'maxContextTokens',
  ]);
  return budget !== null
    && Object.keys(budget).length > 0
    && Object.values(budget).every(entry => typeof entry === 'number'
      && Number.isFinite(entry) && entry >= 0);
}

const SHA256_HEX_RE = /^[a-f0-9]{64}$/u;

function sha256Hex(value: unknown): value is string {
  return typeof value === 'string' && SHA256_HEX_RE.test(value);
}

function validateBudgetPolicy(value: unknown): boolean {
  if (value === undefined) return true;
  const snapshot = exactRecord(value, [
    'state', 'role', 'resolvedProvider', 'executionCostClass', 'profileRef', 'admissionMode',
  ], [
    'taskKind', 'policyDigest', 'reasonCode', 'requiredContinuationTurns',
    'guaranteedContinuationTurns', 'finalOnlyUsage', 'landingPolicy',
    'approvalEvidenceRef', 'approvalProposal', 'requestedBudget',
  ]);
  if (
    snapshot === null
    || (snapshot.state !== 'allow' && snapshot.state !== 'hold')
    || !['brain', 'worker', 'auditor'].includes(String(snapshot.role))
    || !nonemptyString(snapshot.resolvedProvider)
    || !['remote', 'local'].includes(String(snapshot.executionCostClass))
    || !nonemptyString(snapshot.profileRef)
    || !['attended', 'unattended'].includes(String(snapshot.admissionMode))
    || (snapshot.taskKind !== undefined
      && !(TASK_KINDS as readonly unknown[]).includes(snapshot.taskKind))
    || (snapshot.policyDigest !== undefined && !sha256Hex(snapshot.policyDigest))
    || !validateBudget(snapshot.requestedBudget)
  ) return false;

  const holdReasons = [
    'budget-policy-missing',
    'role-profile-missing',
    'landing-policy-missing',
    'landing-turn-reserve-insufficient',
    'final-only-usage-authorization-missing',
  ];
  if (snapshot.state === 'allow') {
    if (
      !sha256Hex(snapshot.policyDigest)
      || snapshot.reasonCode !== undefined
      || snapshot.requiredContinuationTurns !== undefined
      || snapshot.guaranteedContinuationTurns !== undefined
    ) return false;
  } else if (
    !holdReasons.includes(String(snapshot.reasonCode))
    || snapshot.finalOnlyUsage !== undefined
    || snapshot.landingPolicy !== undefined
  ) return false;

  for (const key of ['requiredContinuationTurns', 'guaranteedContinuationTurns']) {
    if (snapshot[key] !== undefined
      && (!Number.isSafeInteger(snapshot[key]) || Number(snapshot[key]) < 0)) return false;
  }
  if (snapshot.reasonCode === 'landing-turn-reserve-insufficient'
    && (!Number.isSafeInteger(snapshot.requiredContinuationTurns)
      || Number(snapshot.requiredContinuationTurns) < 1
      || !Number.isSafeInteger(snapshot.guaranteedContinuationTurns)
      || Number(snapshot.guaranteedContinuationTurns) < 0)) return false;

  if (snapshot.finalOnlyUsage !== undefined) {
    const authorization = exactRecord(snapshot.finalOnlyUsage, [
      'maxWallClockSeconds', 'profileRef', 'policyDigest',
    ]);
    if (
      authorization === null
      || !Number.isSafeInteger(authorization.maxWallClockSeconds)
      || Number(authorization.maxWallClockSeconds) < 1
      || !nonemptyString(authorization.profileRef)
      || !sha256Hex(authorization.policyDigest)
    ) return false;
  }
  if (snapshot.landingPolicy !== undefined) {
    try {
      assertExecutionLandingPolicyConfig(snapshot.landingPolicy, 'task.budgetPolicy.landingPolicy');
    } catch {
      return false;
    }
  }
  if (snapshot.approvalEvidenceRef !== undefined
    && !nonemptyString(snapshot.approvalEvidenceRef)) return false;
  if (snapshot.approvalProposal !== undefined) {
    const proposal = exactRecord(snapshot.approvalProposal, [
      'taskDigest', 'promptDigest', 'scopeDigest', 'acceptanceDigest', 'proposalDigest',
    ]);
    if (proposal === null || Object.values(proposal).some(entry => !sha256Hex(entry))) return false;
  }
  return true;
}

function validateRunPolicy(value: unknown, policy: TaskAttemptCustodyPolicyV2): boolean {
  if (value === undefined) return true;
  const runPolicy = exactRecord(value, ['version', 'policyDigest', 'constraints'], ['sourceRef']);
  if (
    runPolicy === null
    || runPolicy.version !== 1
    || typeof runPolicy.policyDigest !== 'string'
    || !stringArray(runPolicy.constraints)
    || (runPolicy.sourceRef !== undefined && typeof runPolicy.sourceRef !== 'string')
  ) return false;
  try {
    return canonicalEqual(
      runPolicy,
      createRunPolicyPlanAuthority({
        constraints: runPolicy.constraints,
        ...(runPolicy.sourceRef !== undefined ? { sourceRef: runPolicy.sourceRef } : {}),
      }),
      policy,
    );
  } catch {
    return false;
  }
}

function validateProductionWiring(
  value: unknown,
  scope: Task['scope'],
  policy: TaskAttemptCustodyPolicyV2,
): boolean {
  if (value === undefined) return true;
  const wiring = exactRecord(value, [
    'version', 'contractDigest', 'hostProofProgramDigest', 'contract',
  ]);
  if (
    wiring === null
    || wiring.version !== 2
    || typeof wiring.contractDigest !== 'string'
    || typeof wiring.hostProofProgramDigest !== 'string'
    || !wiring.contract
    || typeof wiring.contract !== 'object'
    || (wiring.contract as { version?: unknown }).version !== 2
  ) return false;
  try {
    const canonical = createProductionWiringPlanEvidence(
      wiring.contract as Parameters<typeof createProductionWiringPlanEvidence>[0],
    );
    return canonical.version === 2
      && validateProductionWiringHostProofAdapterAdmission(
        canonical.contract.hostProofProgram,
      ).state === 'valid'
      && productionWiringVerifierAssetWriteScopeOverlap(scope, canonical) === null
      && canonicalEqual(
      wiring,
      canonical,
      policy,
    );
  } catch {
    return false;
  }
}

function validateProductionWiringApplicability(
  value: unknown,
  scope: Task['scope'],
  productionWiring: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): boolean {
  const applicability = exactRecord(value, ['state', 'reasonCode']);
  if (applicability === null) return false;
  const canonical = deriveProductionWiringApplicability(scope);
  if (!canonicalEqual(applicability, canonical, policy)) return false;
  return canonical.state !== 'required' || productionWiring !== undefined;
}

function validatePostSettlement(value: unknown, policy: TaskAttemptCustodyPolicyV2): boolean {
  if (value === undefined) return true;
  const projection = exactRecord(value, [
    'version', 'kind', 'contractDigest', 'ingress', 'scope', 'platformCapability', 'command',
  ]);
  if (projection === null || projection.version !== 1
    || projection.kind !== 'post-settlement-plan-projection') return false;
  try {
    return canonicalEqual(
      projection,
      createPostSettlementPlanProjection({
        ingress: projection.ingress,
        scope: projection.scope,
        platformCapability: projection.platformCapability,
        command: projection.command,
      } as Parameters<typeof createPostSettlementPlanProjection>[0]),
      policy,
    );
  } catch {
    return false;
  }
}

/** Parse one immutable exact-Docker Task material with no model-registry re-resolution. */
export function parseExactDockerDispatchTaskMaterial(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): Task | null {
  const bytes = canonicalBytes(value, policy);
  if (bytes === null) return null;
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return null;
  }
  const task = exactRecord(snapshot, REQUIRED_TASK_KEYS, OPTIONAL_TASK_KEYS);
  if (task === null) return null;
  try {
    validateTaskId(String(task.id));
  } catch {
    return null;
  }
  if (
    !nonemptyString(task.id)
    || !nonemptyString(task.title)
    || !nonemptyString(task.description)
    || !nonemptyString(task.model)
    || !['low', 'normal', 'high'].includes(String(task.effort))
    || !['CRITICAL', 'HIGH', 'NORMAL', 'LOW'].includes(String(task.priority))
    || typeof task.reason !== 'string'
    || !validateScope(task.scope)
    || !stringArray(task.dependencies)
    || !validateGoNogo(task.goNogo, policy)
    || !Object.values(TaskStatus).includes(task.status as TaskStatus)
    || !nonemptyString(task.assignedWorker)
    || !validateVerification(task.verification)
    || !validateRoutingMeta(task.routingMeta)
    || !validateActor(task.actor)
    || !validateBudget(task.budget)
    || !validateBudgetPolicy(task.budgetPolicy)
    || !validateRunPolicy(task.runPolicy, policy)
    || !validateProductionWiringApplicability(
      task.productionWiringApplicability,
      task.scope as Task['scope'],
      task.productionWiring,
      policy,
    )
    || !validateProductionWiring(task.productionWiring, task.scope as Task['scope'], policy)
    || (task.promptCostCanary !== undefined
      && parsePromptCostCanaryTaskAuthority(task.promptCostCanary) === null)
    || !validatePostSettlement(task.postSettlementProjection, policy)
  ) return null;
  const stringFields = [
    'promptCompilePlanId', 'sprintId', 'fixForTaskId', 'provider', 'forceModel', 'forceAgent',
    'modelEffort', 'assignedAgent', 'createdAt', 'updatedAt',
  ];
  if (stringFields.some(key => task[key] !== undefined && !nonemptyString(task[key]))) return null;
  for (const key of ['forceSkills', 'excludeAgent', 'excludeSkills', 'assignedSkills']) {
    if (task[key] !== undefined && !stringArray(task[key])) return null;
  }
  if (task.type !== undefined && !(TASK_KINDS as readonly unknown[]).includes(task.type)) return null;
  if (task.isPriorityFix !== undefined && typeof task.isPriorityFix !== 'boolean') return null;
  if (task.forceEffort !== undefined && !['low', 'normal', 'high'].includes(String(task.forceEffort))) {
    return null;
  }
  if (task.authMode !== undefined && task.authMode !== 'subscription' && task.authMode !== 'api') {
    return null;
  }
  if (task.backend !== undefined && !['docker', 'tmux', 'subprocess'].includes(String(task.backend))) {
    return null;
  }
  if (task.fixMode !== undefined
    && !['verify-only', 'amend', 're-implement'].includes(String(task.fixMode))) return null;
  if (task.estimatedTokens !== undefined
    && (!Number.isSafeInteger(task.estimatedTokens) || Number(task.estimatedTokens) < 0)) return null;
  if (task.smoke !== undefined) {
    const smoke = exactRecord(task.smoke, ['command', 'expect']);
    if (smoke === null || !nonemptyString(smoke.command) || typeof smoke.expect !== 'string') return null;
  }
  return deepFreezeJson(snapshot as Task);
}

/** Host producer: omit undefined optionals, derive scope truth, reject unknown data, bind worker. */
export function createExactDockerDispatchTaskMaterialAuthority(
  task: Task,
  assignedWorker: string,
  policy: TaskAttemptCustodyPolicyV2,
): Task {
  if (!nonemptyString(assignedWorker)) throw new TypeError('invalid exact Docker assigned worker');
  const source = exactDefinedRecord(task, REQUIRED_TASK_KEYS.filter(key => key !== 'assignedWorker'), [
    ...OPTIONAL_TASK_KEYS,
    'assignedWorker',
  ]);
  if (source === null) throw new TypeError('invalid exact Docker task material');
  const candidate = {
    ...source,
    assignedWorker,
    productionWiringApplicability: source.productionWiringApplicability
      ?? deriveProductionWiringApplicability(source.scope as Task['scope']),
  };
  const parsed = parseExactDockerDispatchTaskMaterial(candidate, policy);
  if (parsed === null) throw new TypeError('invalid exact Docker task material');
  return parsed;
}

/** Read only root/material/task authority; provider/prompt/execution remain backend-owned. */
export function parseExactDockerDispatchTaskSnapshotAuthority(
  bytes: Uint8Array,
  policy: TaskAttemptCustodyPolicyV2,
): ExactDockerDispatchTaskSnapshotAuthorityV2 | null {
  const limit = policy.artifactLimits['task-admission-snapshot'];
  if (bytes.byteLength < limit.minBytes || bytes.byteLength > limit.maxBytes) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return null;
  }
  const canonical = canonicalBytes(decoded, policy);
  if (canonical === null || !Buffer.from(canonical).equals(Buffer.from(bytes))) return null;
  const root = exactRecord(decoded, [
    'schemaVersion', 'kind', 'dispatchRequestId', 'projectId', 'taskId', 'material', 'dispatch',
  ]);
  const material = exactRecord(root?.material, [
    'approved', 'approvedSha256', 'dispatch', 'dispatchSha256', 'lineage', 'lineageSha256',
  ]);
  if (
    root === null
    || material === null
    || root.schemaVersion !== 2
    || root.kind !== 'exact-docker-dispatch-snapshot'
    || !nonemptyString(root.dispatchRequestId)
    || !nonemptyString(root.projectId)
    || !nonemptyString(root.taskId)
  ) return null;
  const task = parseExactDockerDispatchTaskMaterial(material.dispatch, policy);
  const approvedDigest = canonicalDigest(material.approved, policy);
  const taskDigest = canonicalDigest(material.dispatch, policy);
  const lineageDigest = canonicalDigest(material.lineage, policy);
  const approved = task === null || taskDigest === null
    ? null
    : parseExactNormalTaskApprovedMaterialV3({
        value: material.approved,
        expectedTask: task,
        expectedDispatchTaskMaterialDigest: taskDigest,
        policy,
      });
  if (
    task === null
    || approved === null
    || task.id !== root.taskId
    || approvedDigest === null
    || taskDigest === null
    || lineageDigest === null
    || material.approvedSha256 !== approvedDigest
    || material.dispatchSha256 !== taskDigest
    || material.lineageSha256 !== lineageDigest
  ) return null;
  return Object.freeze({
    schemaVersion: 2,
    kind: 'exact-docker-dispatch-task-snapshot-authority-v2',
    dispatchRequestId: root.dispatchRequestId,
    projectId: root.projectId,
    taskId: root.taskId,
    task,
    taskDigest,
    approved,
    approvedDigest,
    sprintId: approved.sprintId,
    evaluationPolicy: approved.evaluationPolicy,
    lineage: deepFreezeJson(material.lineage),
    lineageDigest,
    dispatch: deepFreezeJson(root.dispatch),
    snapshotSha256: rawDigest(bytes),
  });
}
