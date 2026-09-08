import type { PlannerResult } from '../core/types.js';
import { posix } from 'node:path';
import type { GoNoGoCriterionItem } from '../core/task-types.js';
import {
  normalizeExecutionWriteScopePolicy,
  type ExecutionWriteScopePolicy,
} from '../core/execution-write-scope-policy.js';
import { deriveExecutionTopology } from '../core/execution-topology.js';
import { isRealPathCandidate } from '../core/task-builder-scope.js';
import { lintScopeSatisfiability } from './scope-satisfiability.js';

export const PLANNER_PLAN_CONTRACT_SCHEMA_VERSION = 1 as const;

/** Explicit file predicates mean presence, not semantic truth. Only identical
 * complete any-of domains conflict; partial overlap is not a contradiction. */
export function findContradictoryFileCriteria(
  items: readonly GoNoGoCriterionItem[] = [],
): readonly { goId: string; noGoId: string }[] {
  const domains = new Map<string, { go: string[]; noGo: string[] }>();
  for (const item of items) {
    const paths: string[] = [];
    for (const requirement of item.evidenceRequirements) {
      const match = /^file:(.*)$/su.exec(requirement);
      if (!match) break;
      let value: unknown;
      try { value = JSON.parse(match[1]!); } catch { break; }
      if (typeof value !== 'string' || !value || value !== value.trim()
        || /[\n\\]/u.test(value) || /^[A-Za-z]:/u.test(value)
        || posix.isAbsolute(value) || posix.normalize(value) !== value
        || value === '.' || value.startsWith('../')) break;
      paths.push(value);
    }
    if (paths.length === 0 || paths.length !== item.evidenceRequirements.length) continue;
    const key = JSON.stringify([...new Set(paths)].sort());
    const domain = domains.get(key) ?? { go: [], noGo: [] };
    domain[item.polarity === 'go' ? 'go' : 'noGo'].push(item.id);
    domains.set(key, domain);
  }
  return [...domains.values()].flatMap(domain => domain.go.flatMap(goId =>
    domain.noGo.map(noGoId => ({ goId, noGoId }))));
}

export interface PlannerTaskCardinalityContract {
  readonly min: number;
  readonly max: number;
  readonly basis: 'single-exact-write' | 'intent-decomposition';
}

/** Host-authored planner boundary. Provider/model/worker identity and runtime
 * concurrency deliberately do not participate in task cardinality. */
export interface PlannerPlanContract {
  readonly schemaVersion: typeof PLANNER_PLAN_CONTRACT_SCHEMA_VERSION;
  readonly taskCardinality: PlannerTaskCardinalityContract;
  readonly writeScopePolicy?: ExecutionWriteScopePolicy;
}

const DEFAULT_TASK_CARDINALITY = Object.freeze({
  min: 1,
  max: 5,
  basis: 'intent-decomposition' as const,
});

export function derivePlannerPlanContract(
  writeScopePolicy?: ExecutionWriteScopePolicy,
): PlannerPlanContract {
  const normalized = writeScopePolicy
    ? normalizeExecutionWriteScopePolicy(writeScopePolicy)
    : undefined;
  const taskCardinality = normalized?.filesWrite.length === 1
    ? Object.freeze({ min: 1, max: 1, basis: 'single-exact-write' as const })
    : DEFAULT_TASK_CARDINALITY;
  return Object.freeze({
    schemaVersion: PLANNER_PLAN_CONTRACT_SCHEMA_VERSION,
    taskCardinality,
    ...(normalized ? { writeScopePolicy: normalized } : {}),
  });
}

function topologyIssue(
  finding: ReturnType<typeof deriveExecutionTopology>['findings'][number],
): string {
  const subject = finding.path ?? finding.ref ?? 'none';
  return `topology:${finding.code}:${subject}:slots-${finding.slots.join(',')}`;
}

/** Secret-safe, deterministic rejection reasons for a parsed model proposal.
 * Model reasoning/output bytes never enter this list. The final preview still
 * runs the same canonical gates; this is an earlier repair opportunity, not an
 * override. */
export function validatePlannerPlanContract(
  result: PlannerResult,
  contract: PlannerPlanContract,
  trackedFiles: readonly string[],
): readonly string[] {
  const issues = new Set<string>(validatePlannerClosedWriteScope(result, contract));
  const count = result.tasks.length;
  const { min, max } = contract.taskCardinality;
  if (count < min || count > max) {
    issues.add(`tasks:cardinality:expected-${min}-${max}:actual-${count}`);
  }

  result.tasks.forEach((task, index) => {
    for (const conflict of findContradictoryFileCriteria(task.goNogo.items)) {
      issues.add(`criteria:contradictory-file-presence:slot-${index + 1}:${conflict.goId}:${conflict.noGoId}`);
    }
    for (const finding of lintScopeSatisfiability({
      description: task.description,
      goCriteria: task.goNogo.goCriteria,
      filesWrite: task.scope.filesWrite,
      filesRead: task.scope.filesRead,
      directories: task.scope.directories,
      trackedFiles,
      criteria: task.goNogo.items,
    }).filter((candidate) => candidate.code === 'CRITERION_EVIDENCE_NOT_READABLE'
      || isRealPathCandidate(candidate.path))) {
      issues.add(`scope:${finding.code}:${finding.path}:slot-${index + 1}`);
    }
  });

  const topology = deriveExecutionTopology(
    result.tasks.map((task, index) => ({
      id: `planner-slot-${index + 1}`,
      title: task.title,
      dependencies: task.dependencies,
      scope: task.scope,
    })),
    { maxWorkers: Math.max(1, result.tasks.length) },
  );
  for (const finding of topology.findings) issues.add(topologyIssue(finding));

  return Object.freeze([...issues]);
}

/** Earliest fail-closed slice of the host plan contract. It deliberately runs
 * before production-wiring completion so an out-of-authority model write is
 * diagnosed as scope drift, never mistaken for a wiring identity request. */
export function validatePlannerClosedWriteScope(
  result: PlannerResult,
  contract: PlannerPlanContract,
): readonly string[] {
  if (!contract.writeScopePolicy) return Object.freeze([]);
  const allowedWrites = contract.writeScopePolicy.filesWrite;
  const allowlist = new Set(allowedWrites);
  const issues: string[] = [];
  result.tasks.forEach((task, index) => {
    if (task.scope.directories.length > 0) {
      issues.push(`scope:directory-write-authority-forbidden:slot-${index + 1}`);
    }
    task.scope.filesWrite.forEach((path, pathIndex) => {
      if (!allowlist.has(path)) {
        issues.push(`scope:write-outside-allowlist:slot-${index + 1}:index-${pathIndex + 1}`);
      }
    });
    if (
      contract.taskCardinality.basis === 'single-exact-write'
      && result.tasks.length === 1
      && (
        task.scope.filesWrite.length !== allowedWrites.length
        || task.scope.filesWrite.some((path, pathIndex) => path !== allowedWrites[pathIndex])
      )
    ) {
      issues.push(`scope:exact-write-list-mismatch:slot-${index + 1}`);
    }
  });
  return Object.freeze([...new Set(issues)]);
}

export function renderPlannerPlanContract(contract: PlannerPlanContract): string {
  const { min, max, basis } = contract.taskCardinality;
  const cardinality = min === max
    ? `Create exactly ${min} task${min === 1 ? '' : 's'}.`
    : `Create between ${min} and ${max} tasks; choose the smallest decomposition that preserves independent ownership and verifiable closure.`;
  const atomic = basis === 'single-exact-write'
    ? '\n- This is an atomic single-writer intent. Do not create a separate integration/test task; include verification in the same task.'
      + '\n- The single task scope.filesWrite MUST equal this exact list; never classify an analysis or inspection target as a write.'
      + '\n- The single task scope.directories MUST be []; directory selectors grant broad write authority and are forbidden by a closed file allowlist.'
      + '\n- Analysis-only paths belong in scope.filesRead and must remain unchanged.'
    : '';
  const writeScope = contract.writeScopePolicy
    ? `\n- Closed write allowlist (the plan may write no other tracked path): ${contract.writeScopePolicy.filesWrite.join(', ') || '(read-only)'}`
    : '';
  return `HOST PLAN CONTRACT:\n- ${cardinality}${atomic}${writeScope}`;
}
