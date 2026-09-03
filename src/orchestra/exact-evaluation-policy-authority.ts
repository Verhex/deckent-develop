import { types as nodeTypes } from 'node:util';

import {
  canonicalTaskAttemptCustodyJson,
  taskAttemptCustodyDigest,
  type Sha256Digest,
  type TaskAttemptCustodyPolicyV2,
} from '../core/task-attempt-custody-store.js';
import {
  DECIDABLE_VERDICTS,
  normalizeAcceptanceOverride,
  resolveAcceptance,
  type AcceptanceAction,
  type AcceptanceMatrixOverride,
  type ConfirmationAdapter,
  type DecidableVerdict,
} from '../core/acceptance-matrix.js';
import type { EvaluationRubric, RubricCriterion, Task } from '../core/task-types.js';
import type { RubricTaskType, TaskKind } from '../core/work-model.js';
import {
  getRubric,
  resolveCanonicalTaskKind,
  resolveRubricTaskType,
} from './rubric-registry.js';

const RUBRIC_REGISTRY_REVISION = 'rubric-registry-v1' as const;
const RUBRIC_DIGEST_DOMAIN = 'exact-task-rubric-authority-v2';
const ACCEPTANCE_DIGEST_DOMAIN = 'exact-task-acceptance-authority-v2';
const POLICY_DIGEST_DOMAIN = 'exact-task-evaluation-policy-authority-v2';

export type ExactEvaluationPolicyFailureCode =
  | 'INVALID_EXACT_EVALUATION_CONFIG'
  | 'UNSUPPORTED_EXACT_EVALUATION_RUBRIC_OVERRIDE'
  | 'INVALID_EXACT_ACCEPTANCE_POLICY'
  | 'INVALID_EXACT_EVALUATION_POLICY';

export class ExactEvaluationPolicyFailure extends Error {
  readonly code: ExactEvaluationPolicyFailureCode;

  constructor(code: ExactEvaluationPolicyFailureCode) {
    super(code);
    this.name = 'ExactEvaluationPolicyFailure';
    this.code = code;
  }
}

export interface ExactResolvedRubricAuthorityV2 {
  readonly registryRevision: typeof RUBRIC_REGISTRY_REVISION;
  readonly rubricTaskType: RubricTaskType;
  readonly criteria: readonly Readonly<RubricCriterion>[];
  readonly passingScore: number;
  readonly maxRetries: number;
  readonly rubricDigest: Sha256Digest;
}

export interface ExactResolvedAcceptanceCellV2 {
  readonly action: AcceptanceAction;
  readonly adapter: ConfirmationAdapter | null;
  readonly source: 'default' | 'override';
}

export interface ExactResolvedAcceptanceAuthorityV2 {
  readonly enforcement: 'observe' | 'enforce';
  readonly row: Readonly<Record<DecidableVerdict, ExactResolvedAcceptanceCellV2>>;
  readonly acceptanceDigest: Sha256Digest;
}

export interface ExactTaskEvaluationPolicyAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-task-evaluation-policy-authority-v2';
  readonly producer: 'host-resolved-dispatch';
  readonly sprintId: string;
  readonly taskId: string;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly taskKind: TaskKind;
  readonly rubric: ExactResolvedRubricAuthorityV2;
  readonly acceptance: ExactResolvedAcceptanceAuthorityV2;
  readonly policyDigest: Sha256Digest;
}

export interface ExactNormalTaskApprovedMaterialV3 {
  readonly schemaVersion: 3;
  readonly kind: 'normal-task-approved-material';
  readonly sprintId: string;
  readonly taskId: string;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly evaluationPolicy: ExactTaskEvaluationPolicyAuthorityV2;
}

export interface ExactEvaluationPolicyConfig {
  readonly evaluation_rubric?: Partial<EvaluationRubric>;
  readonly acceptance_matrix?: AcceptanceMatrixOverride;
  readonly acceptance_enforcement?: 'observe' | 'enforce';
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
  ) return null;
  let ownKeys: readonly PropertyKey[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  if (ownKeys.length !== keys.length) return null;
  const expected = new Set(keys);
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== 'string' || !expected.has(key)) return null;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return null;
    }
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    record[key] = descriptor.value;
  }
  return record;
}

function ownOptionalDataProperty(
  source: object,
  key: keyof ExactEvaluationPolicyConfig,
): unknown {
  if (nodeTypes.isProxy(source)) {
    throw new ExactEvaluationPolicyFailure('INVALID_EXACT_EVALUATION_CONFIG');
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(source, key);
  } catch {
    throw new ExactEvaluationPolicyFailure('INVALID_EXACT_EVALUATION_CONFIG');
  }
  if (descriptor === undefined) return undefined;
  if (!descriptor.enumerable || !('value' in descriptor)) {
    throw new ExactEvaluationPolicyFailure('INVALID_EXACT_EVALUATION_CONFIG');
  }
  return descriptor.value;
}

function canonicalClone<T>(value: T, policy: TaskAttemptCustodyPolicyV2): T {
  try {
    return JSON.parse(Buffer.from(
      canonicalTaskAttemptCustodyJson(value, policy.jsonBounds),
    ).toString('utf8')) as T;
  } catch {
    throw new ExactEvaluationPolicyFailure('INVALID_EXACT_EVALUATION_POLICY');
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function validRubricCriterion(value: unknown): value is RubricCriterion {
  const record = exactRecord(value, ['name', 'weight', 'threshold', 'evaluator']);
  return record !== null
    && typeof record.name === 'string'
    && record.name.length > 0
    && Buffer.byteLength(record.name, 'utf8') <= 256
    && typeof record.weight === 'number'
    && Number.isFinite(record.weight)
    && record.weight >= 0
    && record.weight <= 1
    && typeof record.threshold === 'number'
    && Number.isFinite(record.threshold)
    && record.threshold >= 0
    && record.threshold <= 100
    && ['auto', 'pattern', 'metric'].includes(String(record.evaluator));
}

function validResolvedRubric(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): value is ExactResolvedRubricAuthorityV2 {
  const record = exactRecord(value, [
    'registryRevision', 'rubricTaskType', 'criteria', 'passingScore', 'maxRetries',
    'rubricDigest',
  ]);
  if (
    record === null
    || record.registryRevision !== RUBRIC_REGISTRY_REVISION
    || !['audit', 'document-write', 'code-development'].includes(String(record.rubricTaskType))
    || !Array.isArray(record.criteria)
    || record.criteria.length < 1
    || record.criteria.length > 64
    || !record.criteria.every(validRubricCriterion)
    || new Set(record.criteria.map(criterion => criterion.name)).size !== record.criteria.length
    || typeof record.passingScore !== 'number'
    || !Number.isFinite(record.passingScore)
    || record.passingScore < 0
    || record.passingScore > 100
    || !Number.isSafeInteger(record.maxRetries)
    || Number(record.maxRetries) < 0
    || Number(record.maxRetries) > 3
    || !isDigest(record.rubricDigest)
  ) return false;
  const body = {
    registryRevision: record.registryRevision,
    rubricTaskType: record.rubricTaskType,
    criteria: record.criteria,
    passingScore: record.passingScore,
    maxRetries: record.maxRetries,
  };
  return taskAttemptCustodyDigest(RUBRIC_DIGEST_DOMAIN, body, policy.jsonBounds)
    === record.rubricDigest;
}

function validAcceptanceCell(value: unknown): value is ExactResolvedAcceptanceCellV2 {
  const record = exactRecord(value, ['action', 'adapter', 'source']);
  if (
    record === null
    || !['ACCEPT', 'ROUTE', 'REJECT'].includes(String(record.action))
    || !['default', 'override'].includes(String(record.source))
  ) return false;
  if (record.action === 'ROUTE') {
    return ['deterministic', 'code', 'llm', 'human'].includes(String(record.adapter));
  }
  return record.adapter === null;
}

function validResolvedAcceptance(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): value is ExactResolvedAcceptanceAuthorityV2 {
  const record = exactRecord(value, ['enforcement', 'row', 'acceptanceDigest']);
  const row = exactRecord(record?.row, DECIDABLE_VERDICTS);
  if (
    record === null
    || (record.enforcement !== 'observe' && record.enforcement !== 'enforce')
    || row === null
    || !DECIDABLE_VERDICTS.every(verdict => validAcceptanceCell(row[verdict]))
    || !isDigest(record.acceptanceDigest)
  ) return false;
  const body = { enforcement: record.enforcement, row };
  return taskAttemptCustodyDigest(ACCEPTANCE_DIGEST_DOMAIN, body, policy.jsonBounds)
    === record.acceptanceDigest;
}

/** Freeze the exact rubric and acceptance row before provider birth. */
export function createExactTaskEvaluationPolicyAuthority(input: {
  readonly sprintId: string;
  readonly task: Task;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly config?: ExactEvaluationPolicyConfig;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactTaskEvaluationPolicyAuthorityV2 {
  if (
    input.sprintId.length === 0
    || input.task.id.length === 0
    || !isDigest(input.dispatchTaskMaterialDigest)
  ) throw new ExactEvaluationPolicyFailure('INVALID_EXACT_EVALUATION_POLICY');

  const config = input.config;
  const customRubric = config === undefined
    ? undefined
    : ownOptionalDataProperty(config, 'evaluation_rubric');
  if (customRubric !== undefined) {
    throw new ExactEvaluationPolicyFailure('UNSUPPORTED_EXACT_EVALUATION_RUBRIC_OVERRIDE');
  }
  const rawEnforcement = config === undefined
    ? undefined
    : ownOptionalDataProperty(config, 'acceptance_enforcement');
  if (
    rawEnforcement !== undefined
    && rawEnforcement !== 'observe'
    && rawEnforcement !== 'enforce'
  ) throw new ExactEvaluationPolicyFailure('INVALID_EXACT_ACCEPTANCE_POLICY');
  const enforcement = rawEnforcement ?? 'observe';
  const rawOverride = config === undefined
    ? undefined
    : ownOptionalDataProperty(config, 'acceptance_matrix');
  let override: AcceptanceMatrixOverride | undefined;
  if (rawOverride !== undefined) {
    try {
      override = canonicalClone(rawOverride, input.policy) as AcceptanceMatrixOverride;
    } catch {
      throw new ExactEvaluationPolicyFailure('INVALID_EXACT_ACCEPTANCE_POLICY');
    }
    const normalized = normalizeAcceptanceOverride(override);
    if (normalized.rejected.length > 0) {
      throw new ExactEvaluationPolicyFailure('INVALID_EXACT_ACCEPTANCE_POLICY');
    }
    override = normalized.override;
  }

  const rubricSource = getRubric(input.task);
  const rubricBody = canonicalClone({
    registryRevision: RUBRIC_REGISTRY_REVISION,
    rubricTaskType: resolveRubricTaskType(input.task),
    criteria: rubricSource.criteria.map(criterion => ({ ...criterion })),
    passingScore: rubricSource.passingScore,
    maxRetries: rubricSource.maxRetries,
  }, input.policy);
  const rubric = deepFreeze({
    ...rubricBody,
    rubricDigest: taskAttemptCustodyDigest(
      RUBRIC_DIGEST_DOMAIN,
      rubricBody,
      input.policy.jsonBounds,
    ),
  }) as ExactResolvedRubricAuthorityV2;

  const taskKind = resolveCanonicalTaskKind(input.task);
  const row = Object.fromEntries(DECIDABLE_VERDICTS.map(verdict => {
    const resolved = resolveAcceptance(taskKind, verdict, override);
    return [verdict, {
      action: resolved.action,
      adapter: resolved.adapter ?? null,
      source: resolved.source,
    }];
  })) as Record<DecidableVerdict, ExactResolvedAcceptanceCellV2>;
  const acceptanceBody = canonicalClone({ enforcement, row }, input.policy);
  const acceptance = deepFreeze({
    ...acceptanceBody,
    acceptanceDigest: taskAttemptCustodyDigest(
      ACCEPTANCE_DIGEST_DOMAIN,
      acceptanceBody,
      input.policy.jsonBounds,
    ),
  }) as ExactResolvedAcceptanceAuthorityV2;
  const body = canonicalClone({
    schemaVersion: 2 as const,
    kind: 'exact-task-evaluation-policy-authority-v2' as const,
    producer: 'host-resolved-dispatch' as const,
    sprintId: input.sprintId,
    taskId: input.task.id,
    dispatchTaskMaterialDigest: input.dispatchTaskMaterialDigest,
    taskKind,
    rubric,
    acceptance,
  }, input.policy);
  const authority = deepFreeze({
    ...body,
    policyDigest: taskAttemptCustodyDigest(
      POLICY_DIGEST_DOMAIN,
      body,
      input.policy.jsonBounds,
    ),
  }) as ExactTaskEvaluationPolicyAuthorityV2;
  if (parseExactTaskEvaluationPolicyAuthority(authority, input.policy) === null) {
    throw new ExactEvaluationPolicyFailure('INVALID_EXACT_EVALUATION_POLICY');
  }
  return authority;
}

export function parseExactTaskEvaluationPolicyAuthority(
  value: unknown,
  policy: TaskAttemptCustodyPolicyV2,
): ExactTaskEvaluationPolicyAuthorityV2 | null {
  let snapshot: unknown;
  try {
    snapshot = canonicalClone(value, policy);
  } catch {
    return null;
  }
  const record = exactRecord(snapshot, [
    'schemaVersion', 'kind', 'producer', 'sprintId', 'taskId',
    'dispatchTaskMaterialDigest', 'taskKind', 'rubric', 'acceptance', 'policyDigest',
  ]);
  if (
    record === null
    || record.schemaVersion !== 2
    || record.kind !== 'exact-task-evaluation-policy-authority-v2'
    || record.producer !== 'host-resolved-dispatch'
    || typeof record.sprintId !== 'string'
    || record.sprintId.length === 0
    || typeof record.taskId !== 'string'
    || record.taskId.length === 0
    || !isDigest(record.dispatchTaskMaterialDigest)
    || typeof record.taskKind !== 'string'
    || !validResolvedRubric(record.rubric, policy)
    || !validResolvedAcceptance(record.acceptance, policy)
    || !isDigest(record.policyDigest)
  ) return null;
  const body = {
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    producer: record.producer,
    sprintId: record.sprintId,
    taskId: record.taskId,
    dispatchTaskMaterialDigest: record.dispatchTaskMaterialDigest,
    taskKind: record.taskKind,
    rubric: record.rubric,
    acceptance: record.acceptance,
  };
  if (taskAttemptCustodyDigest(POLICY_DIGEST_DOMAIN, body, policy.jsonBounds)
    !== record.policyDigest) return null;
  return deepFreeze(snapshot as ExactTaskEvaluationPolicyAuthorityV2);
}

export function createExactNormalTaskApprovedMaterialV3(input: {
  readonly sprintId: string;
  readonly task: Task;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly config?: ExactEvaluationPolicyConfig;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactNormalTaskApprovedMaterialV3 {
  return deepFreeze({
    schemaVersion: 3,
    kind: 'normal-task-approved-material',
    sprintId: input.sprintId,
    taskId: input.task.id,
    dispatchTaskMaterialDigest: input.dispatchTaskMaterialDigest,
    evaluationPolicy: createExactTaskEvaluationPolicyAuthority(input),
  });
}

export function parseExactNormalTaskApprovedMaterialV3(input: {
  readonly value: unknown;
  readonly expectedTask: Task;
  readonly expectedDispatchTaskMaterialDigest: Sha256Digest;
  readonly policy: TaskAttemptCustodyPolicyV2;
}): ExactNormalTaskApprovedMaterialV3 | null {
  let snapshot: unknown;
  try {
    snapshot = canonicalClone(input.value, input.policy);
  } catch {
    return null;
  }
  const record = exactRecord(snapshot, [
    'schemaVersion', 'kind', 'sprintId', 'taskId', 'dispatchTaskMaterialDigest',
    'evaluationPolicy',
  ]);
  const evaluationPolicy = parseExactTaskEvaluationPolicyAuthority(
    record?.evaluationPolicy,
    input.policy,
  );
  if (
    record === null
    || record.schemaVersion !== 3
    || record.kind !== 'normal-task-approved-material'
    || typeof record.sprintId !== 'string'
    || record.sprintId.length === 0
    || record.taskId !== input.expectedTask.id
    || record.dispatchTaskMaterialDigest !== input.expectedDispatchTaskMaterialDigest
    || evaluationPolicy === null
    || evaluationPolicy.sprintId !== record.sprintId
    || evaluationPolicy.taskId !== record.taskId
    || evaluationPolicy.dispatchTaskMaterialDigest !== record.dispatchTaskMaterialDigest
    || evaluationPolicy.taskKind !== resolveCanonicalTaskKind(input.expectedTask)
    || evaluationPolicy.rubric.rubricTaskType !== resolveRubricTaskType(input.expectedTask)
  ) return null;
  return deepFreeze(snapshot as ExactNormalTaskApprovedMaterialV3);
}
