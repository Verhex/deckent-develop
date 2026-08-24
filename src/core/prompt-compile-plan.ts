import { createHash } from 'node:crypto';
import type { CriterionApplicability, GoNoGoCriterionItem, TaskScope } from './task-types.js';

export const VERIFICATION_EXECUTION_OUTCOME = Object.freeze({
  PASSED: 'PASSED', FAILED: 'FAILED', NOT_EXECUTED: 'NOT_EXECUTED',
} as const);
export type VerificationExecutionOutcome = typeof VERIFICATION_EXECUTION_OUTCOME[keyof typeof VERIFICATION_EXECUTION_OUTCOME];

export interface ScopedVerificationCommand { readonly command: string; readonly scope: readonly string[]; }
export interface CriterionEvidence {
  readonly criterionId: string;
  readonly outcome: 'MET' | 'UNMET' | 'UNVERIFIED';
  readonly evidence: readonly string[];
}
export interface TestVerification {
  readonly applicability: CriterionApplicability;
  readonly outcome: VerificationExecutionOutcome;
  readonly commands: readonly ScopedVerificationCommand[];
}
export interface PromptCompilePlan {
  readonly version: 1;
  readonly planId: string;
  readonly criteria: readonly Readonly<GoNoGoCriterionItem>[];
  readonly criteriaEvidence: readonly Readonly<CriterionEvidence>[];
  readonly verification: Readonly<TestVerification>;
  readonly scope: Readonly<{ readonly directories: readonly string[]; readonly filesRead: readonly string[]; readonly filesWrite: readonly string[] }>;
  readonly rolePolicyIdentity: string;
}
export interface PromptCompilePlanInput {
  readonly criteria: readonly GoNoGoCriterionItem[];
  readonly criteriaEvidence?: readonly CriterionEvidence[];
  readonly verificationCommands?: readonly ScopedVerificationCommand[];
  readonly testApplicability: CriterionApplicability;
  readonly scope: TaskScope;
  readonly rolePolicyIdentity: string;
}

function normalizeText(value: string, label: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new TypeError(`${label} must not be empty`);
  return normalized;
}
function uniqueSorted(values: readonly string[]): string[] {
  return Object.freeze([...new Set(values.map(value => normalizeText(value, 'value')))].sort((a, b) => a.localeCompare(b))) as string[];
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  return JSON.stringify(value);
}
function canonicalCriterion(item: GoNoGoCriterionItem): Readonly<GoNoGoCriterionItem> {
  return Object.freeze({ id: normalizeText(item.id, 'criterion ID'), polarity: item.polarity, statement: normalizeText(item.statement, 'criterion statement'), evidenceRequirements: uniqueSorted(item.evidenceRequirements) });
}

/** Builds the immutable, deterministically ordered prompt-compilation IR. */
export function createPromptCompilePlan(input: PromptCompilePlanInput): PromptCompilePlan {
  const criteria = Object.freeze(input.criteria.map(canonicalCriterion).sort((a, b) => a.id.localeCompare(b.id)));
  const ids = new Set<string>();
  for (const criterion of criteria) {
    if (ids.has(criterion.id)) throw new TypeError(`duplicate criterion ID: ${criterion.id}`);
    ids.add(criterion.id);
  }
  const evidenceById = new Map<string, CriterionEvidence>();
  for (const item of input.criteriaEvidence ?? []) {
    if (!ids.has(item.criterionId)) throw new TypeError(`criteriaEvidence references unknown criterion ID: ${item.criterionId}`);
    if (evidenceById.has(item.criterionId)) throw new TypeError(`duplicate criteriaEvidence for criterion ID: ${item.criterionId}`);
    evidenceById.set(item.criterionId, item);
  }
  const criteriaEvidence = Object.freeze(criteria.map(criterion => {
    const item = evidenceById.get(criterion.id);
    return Object.freeze({ criterionId: criterion.id, outcome: item?.outcome ?? 'UNVERIFIED', evidence: uniqueSorted(item?.evidence ?? []) });
  }));
  const commands = Object.freeze((input.verificationCommands ?? []).map(item => Object.freeze({ command: normalizeText(item.command, 'verification command'), scope: uniqueSorted(item.scope) })).sort((a, b) => a.command.localeCompare(b.command) || canonicalJson(a.scope).localeCompare(canonicalJson(b.scope))));
  const scope = Object.freeze({ directories: uniqueSorted(input.scope.directories), filesRead: uniqueSorted(input.scope.filesRead), filesWrite: uniqueSorted(input.scope.filesWrite) });
  const rolePolicyIdentity = normalizeText(input.rolePolicyIdentity, 'role policy identity');
  const payload = { version: 1 as const, criteria, criteriaEvidence, verification: Object.freeze({ applicability: input.testApplicability, outcome: VERIFICATION_EXECUTION_OUTCOME.NOT_EXECUTED, commands }), scope, rolePolicyIdentity };
  const planId = `prompt-compile-plan:sha256:${createHash('sha256').update(canonicalJson(payload)).digest('hex')}`;
  return Object.freeze({ ...payload, planId });
}

/** Boolean compatibility projection; applicability never changes an observed outcome. */
export function projectTestsPassed(verification: Pick<TestVerification, 'outcome'>): boolean {
  return verification.outcome === VERIFICATION_EXECUTION_OUTCOME.PASSED;
}

/** GO_WITH_TECH_DEBT is valid only when every open item is an exact plan ID. */
export function hasExactTechDebtCriterionIds(
  plan: Pick<PromptCompilePlan, 'criteria'>,
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  openCriterionIds: readonly string[] | undefined,
): boolean {
  if (selfAssessment !== 'GO_WITH_TECH_DEBT') return openCriterionIds === undefined || openCriterionIds.length === 0;
  if (openCriterionIds === undefined || openCriterionIds.length === 0) return false;
  const planIds = new Set(plan.criteria.map(item => item.id));
  return new Set(openCriterionIds).size === openCriterionIds.length
    && openCriterionIds.every(id => planIds.has(id));
}
