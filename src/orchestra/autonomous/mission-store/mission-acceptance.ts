import { createHash } from 'node:crypto';

import type { InvocationReceiptRef } from '../../../core/invocation-receipt.js';
import type { Mission, WorkItem } from './mission-types.js';

export const GOAL_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

export interface GoalAcceptanceCriterionV1 {
  id: string;
  text: string;
  critical: boolean;
}

export interface GoalAcceptanceContractV1 {
  schemaVersion: typeof GOAL_ACCEPTANCE_SCHEMA_VERSION;
  criteria: readonly GoalAcceptanceCriterionV1[];
  authoredAt: string;
  authoredBy: {
    surface: 'cli' | 'api' | 'connector' | 'system' | 'unknown';
    actorId: string | null;
  };
  digest: string;
}

export type GoalAcceptanceVerdict = 'met' | 'unmet' | 'unknown';
export type GoalAcceptanceOutcome = 'accepted' | 'rejected' | 'unknown';

/** Raw evaluator claim. Evidence refs are untrusted until host projection. */
export interface GoalAcceptanceEvaluation {
  outcome: GoalAcceptanceOutcome;
  criteria: readonly {
    criterionId: string;
    verdict: GoalAcceptanceVerdict;
    evidenceRefs: readonly string[];
    rationale: string;
  }[];
  evaluator: {
    role: 'brain';
    instanceId: string | null;
  };
  invocationReceiptRef: InvocationReceiptRef | null;
  decidedAt: string;
}

/** Host-resolved pointer to one immutable WorkItem terminal result snapshot. */
export interface GoalAcceptanceWorkItemEvidence {
  kind: 'work-item-result';
  ref: string;
  workItemId: string;
  status: WorkItem['status'];
  resultOk: boolean;
  resultDigest: string;
}

export interface MissionAcceptanceDecisionV1 {
  schemaVersion: typeof GOAL_ACCEPTANCE_SCHEMA_VERSION;
  missionId: string;
  contractDigest: string;
  round: number;
  outcome: GoalAcceptanceOutcome;
  criteria: readonly {
    criterionId: string;
    verdict: GoalAcceptanceVerdict;
    evidenceRefs: readonly string[];
    evidence: readonly GoalAcceptanceWorkItemEvidence[];
    rationale: string;
  }[];
  evaluator: GoalAcceptanceEvaluation['evaluator'];
  invocationReceiptRef: InvocationReceiptRef | null;
  decidedAt: string;
  decisionDigest: string;
}

export interface MissionAcceptanceDecisionRecord {
  decision: MissionAcceptanceDecisionV1;
  validationErrors: readonly string[];
  effectiveOutcome: GoalAcceptanceOutcome;
  createdAt: string;
}

function canonical(value: unknown): string {
  const normalize = (nested: unknown): unknown => {
    if (Array.isArray(nested)) return nested.map(normalize);
    if (nested !== null && typeof nested === 'object') {
      return Object.fromEntries(Object.entries(nested as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return nested ?? null;
  };
  return JSON.stringify(normalize(value));
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function acceptanceContractPayload(contract: Omit<GoalAcceptanceContractV1, 'digest'>): unknown {
  return contract;
}

export function createGoalAcceptanceContract(
  exactCriterion: string,
  opts: {
    authoredAt?: string;
    authoredBy?: GoalAcceptanceContractV1['authoredBy'];
  } = {},
): GoalAcceptanceContractV1 {
  if (!exactCriterion.trim()) throw new Error('GOAL_ACCEPTANCE_INVALID: criterion must be non-empty');
  if (exactCriterion.length > 10_000) throw new Error('GOAL_ACCEPTANCE_INVALID: criterion exceeds 10000 characters');
  const authoredAt = opts.authoredAt ?? new Date().toISOString();
  if (!isIsoDate(authoredAt)) throw new Error('GOAL_ACCEPTANCE_INVALID: authoredAt must be ISO-8601');
  const authoredBy = opts.authoredBy ?? { surface: 'unknown', actorId: null };
  const criterion: GoalAcceptanceCriterionV1 = {
    id: `criterion-${digest(exactCriterion).slice(0, 24)}`,
    text: exactCriterion,
    critical: true,
  };
  const payload = {
    schemaVersion: GOAL_ACCEPTANCE_SCHEMA_VERSION,
    criteria: [criterion],
    authoredAt,
    authoredBy,
  } as const;
  return { ...payload, digest: digest(acceptanceContractPayload(payload)) };
}

export function validateGoalAcceptanceContract(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['contract must be an object'];
  const contract = value as Partial<GoalAcceptanceContractV1>;
  if (contract.schemaVersion !== GOAL_ACCEPTANCE_SCHEMA_VERSION) errors.push('unsupported schemaVersion');
  if (!Array.isArray(contract.criteria) || contract.criteria.length === 0) errors.push('criteria must be non-empty');
  else {
    const ids = new Set<string>();
    for (const criterion of contract.criteria) {
      if (!criterion || typeof criterion !== 'object') { errors.push('criterion must be an object'); continue; }
      if (typeof criterion.id !== 'string' || !criterion.id) errors.push('criterion id must be non-empty');
      else if (ids.has(criterion.id)) errors.push(`duplicate criterion ${criterion.id}`);
      else ids.add(criterion.id);
      if (typeof criterion.text !== 'string' || !criterion.text.trim()) errors.push(`criterion ${criterion.id ?? '?'} text must be non-empty`);
      if (criterion.critical !== true && criterion.critical !== false) errors.push(`criterion ${criterion.id ?? '?'} critical must be boolean`);
    }
  }
  if (!isIsoDate(contract.authoredAt)) errors.push('authoredAt must be ISO-8601');
  if (!contract.authoredBy || typeof contract.authoredBy !== 'object') errors.push('authoredBy is required');
  else {
    const allowed = new Set(['cli', 'api', 'connector', 'system', 'unknown']);
    if (!allowed.has(contract.authoredBy.surface)) errors.push('authoredBy.surface is invalid');
    if (contract.authoredBy.actorId !== null && (typeof contract.authoredBy.actorId !== 'string' || !contract.authoredBy.actorId)) {
      errors.push('authoredBy.actorId must be non-empty or null');
    }
  }
  if (typeof contract.digest !== 'string' || !/^[a-f0-9]{64}$/.test(contract.digest)) errors.push('digest is invalid');
  else {
    const { digest: _ignored, ...payload } = contract as GoalAcceptanceContractV1;
    if (digest(acceptanceContractPayload(payload)) !== contract.digest) errors.push('digest mismatch');
  }
  return errors;
}

/** Reads the immutable v1 contract. Absent means legacy; present-but-corrupt fails loud. */
export function readGoalAcceptanceContract(mission: Pick<Mission, 'spec'>): GoalAcceptanceContractV1 | null {
  const raw = mission.spec?.['acceptanceContract'];
  if (raw === undefined || raw === null) return null;
  const errors = validateGoalAcceptanceContract(raw);
  if (errors.length > 0) throw new Error(`GOAL_ACCEPTANCE_CONTRACT_INVALID: ${errors.join('; ')}`);
  return raw as GoalAcceptanceContractV1;
}

export function workItemEvidenceRef(itemId: string): string {
  return `work-item:${itemId}`;
}

function projectEvidence(items: readonly WorkItem[]): Map<string, GoalAcceptanceWorkItemEvidence> {
  const projected = new Map<string, GoalAcceptanceWorkItemEvidence>();
  for (const item of items) {
    if (!['done', 'failed', 'blocked'].includes(item.status) || item.lastResult === null) continue;
    const ref = workItemEvidenceRef(item.id);
    projected.set(ref, {
      kind: 'work-item-result',
      ref,
      workItemId: item.id,
      status: item.status,
      resultOk: item.lastResult.ok,
      resultDigest: digest({ workItemId: item.id, status: item.status, lastResult: item.lastResult }),
    });
  }
  return projected;
}

function decisionPayload(decision: Omit<MissionAcceptanceDecisionV1, 'decisionDigest'>): unknown {
  return decision;
}

export function buildMissionAcceptanceDecision(
  missionId: string,
  contract: GoalAcceptanceContractV1,
  round: number,
  evaluation: GoalAcceptanceEvaluation,
  items: readonly WorkItem[],
): MissionAcceptanceDecisionV1 {
  const available = projectEvidence(items);
  const payload = {
    schemaVersion: GOAL_ACCEPTANCE_SCHEMA_VERSION,
    missionId,
    contractDigest: contract.digest,
    round,
    outcome: evaluation.outcome,
    criteria: evaluation.criteria.map((criterion) => ({
      criterionId: criterion.criterionId,
      verdict: criterion.verdict,
      evidenceRefs: [...criterion.evidenceRefs],
      evidence: criterion.evidenceRefs.flatMap((ref) => {
        const resolved = available.get(ref);
        return resolved ? [resolved] : [];
      }),
      rationale: criterion.rationale,
    })),
    evaluator: evaluation.evaluator,
    invocationReceiptRef: evaluation.invocationReceiptRef,
    decidedAt: evaluation.decidedAt,
  } as const;
  return { ...payload, decisionDigest: digest(decisionPayload(payload)) };
}

function validReceiptRef(ref: InvocationReceiptRef | null): boolean {
  return ref !== null
    && ref.schemaVersion === 1
    && typeof ref.invocationId === 'string' && ref.invocationId.length > 0
    && typeof ref.tenantId === 'string' && ref.tenantId.length > 0
    && typeof ref.projectId === 'string' && ref.projectId.length > 0;
}

export function validateMissionAcceptanceDecision(
  decision: MissionAcceptanceDecisionV1,
  missionId: string,
  contract: GoalAcceptanceContractV1,
  round: number,
  items: readonly WorkItem[],
): string[] {
  const errors: string[] = [];
  if (decision.schemaVersion !== GOAL_ACCEPTANCE_SCHEMA_VERSION) errors.push('unsupported decision schemaVersion');
  if (decision.missionId !== missionId) errors.push('missionId mismatch');
  if (decision.contractDigest !== contract.digest) errors.push('contractDigest mismatch');
  if (decision.round !== round || !Number.isSafeInteger(decision.round) || decision.round < 0) errors.push('round mismatch');
  if (!['accepted', 'rejected', 'unknown'].includes(decision.outcome)) errors.push('outcome is invalid');
  if (!isIsoDate(decision.decidedAt)) errors.push('decidedAt must be ISO-8601');
  if (decision.evaluator?.role !== 'brain') errors.push('evaluator role must be brain');

  const claimed = new Map<string, MissionAcceptanceDecisionV1['criteria'][number]>();
  for (const criterion of decision.criteria) {
    if (claimed.has(criterion.criterionId)) errors.push(`duplicate criterion result ${criterion.criterionId}`);
    else claimed.set(criterion.criterionId, criterion);
  }
  const available = projectEvidence(items);
  for (const expected of contract.criteria) {
    const result = claimed.get(expected.id);
    if (!result) { errors.push(`missing criterion result ${expected.id}`); continue; }
    if (!['met', 'unmet', 'unknown'].includes(result.verdict)) errors.push(`invalid verdict ${expected.id}`);
    if (typeof result.rationale !== 'string' || !result.rationale.trim()) errors.push(`missing rationale ${expected.id}`);
    if (new Set(result.evidenceRefs).size !== result.evidenceRefs.length) errors.push(`duplicate evidence ref ${expected.id}`);
    if (result.evidence.length !== result.evidenceRefs.length) errors.push(`unknown evidence ref ${expected.id}`);
    for (const evidence of result.evidence) {
      const actual = available.get(evidence.ref);
      if (!actual || canonical(actual) !== canonical(evidence)) errors.push(`evidence digest mismatch ${evidence.ref}`);
    }
    if (decision.outcome === 'accepted' && expected.critical && result.verdict !== 'met') {
      errors.push(`critical criterion not met ${expected.id}`);
    }
    if (decision.outcome === 'accepted' && expected.critical && result.evidence.length === 0) {
      errors.push(`critical criterion has no evidence ${expected.id}`);
    }
    if (result.verdict === 'met'
      && !result.evidence.some((evidence) => evidence.status === 'done' && evidence.resultOk)) {
      errors.push(`met criterion has no successful work-item evidence ${expected.id}`);
    }
  }
  for (const criterionId of claimed.keys()) {
    if (!contract.criteria.some((criterion) => criterion.id === criterionId)) errors.push(`unknown criterion result ${criterionId}`);
  }
  const allCriticalMet = contract.criteria
    .filter((criterion) => criterion.critical)
    .every((criterion) => claimed.get(criterion.id)?.verdict === 'met');
  if (decision.outcome === 'rejected' && allCriticalMet) errors.push('rejected outcome contradicts met critical criteria');
  if (decision.outcome !== 'unknown') {
    if (!decision.evaluator.instanceId) errors.push(`${decision.outcome} decision requires evaluator instanceId`);
    if (!validReceiptRef(decision.invocationReceiptRef)) errors.push(`${decision.outcome} decision requires InvocationReceiptRef`);
  }
  if (!/^[a-f0-9]{64}$/.test(decision.decisionDigest)) errors.push('decisionDigest is invalid');
  else {
    const { decisionDigest: _ignored, ...payload } = decision;
    if (digest(decisionPayload(payload)) !== decision.decisionDigest) errors.push('decisionDigest mismatch');
  }
  return errors;
}

export function assertStoredMissionAcceptanceRecord(value: unknown): MissionAcceptanceDecisionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('MISSION_ACCEPTANCE_CORRUPT: record must be an object');
  }
  const record = value as MissionAcceptanceDecisionRecord;
  if (!record.decision || !Array.isArray(record.validationErrors)
    || !['accepted', 'rejected', 'unknown'].includes(record.effectiveOutcome)
    || !isIsoDate(record.createdAt)) {
    throw new Error('MISSION_ACCEPTANCE_CORRUPT: invalid record shape');
  }
  return record;
}
