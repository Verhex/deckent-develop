import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';

import {
  inspectProviderExecutionObservationMigration,
  safeProviderExecutionObservationProjectPath,
  type ProviderExecutionObservationMigrationBounds,
  type ProviderExecutionObservationMigrationInspection,
} from './provider-execution-observation-migration.js';
import {
  PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
  ProviderExecutionObservationStore,
  ProviderExecutionObservationStoreError,
  type ProviderExecutionExactOpenInterval,
  type StoredProviderExecutionInterval,
} from './provider-execution-observation-store.js';
import {
  createTaskResultSettlementRefForAttempt,
  readClosedTaskResultSettlement,
  readTaskResultSettlementClosure,
  taskResultSettlementClosureDigest,
  taskResultSettlementDigest,
} from './task-result-settlement.js';

const VERSION = 1 as const;
const HEX_256 = /^[a-f0-9]{64}$/u;

export class ProviderExecutionObservationReconciliationError extends Error {
  constructor(readonly code: 'SOURCE_NOT_FOUND' | 'DISCOVERY_BOUND_EXCEEDED' | 'INVALID_PLAN' | 'CONCURRENT_CHANGE', message: string) {
    super(message);
    this.name = 'ProviderExecutionObservationReconciliationError';
  }
}
export interface ProviderExecutionObservationReconciliationBounds extends ProviderExecutionObservationMigrationBounds { readonly maxOpenIntervals?: number; }
export interface ProviderExecutionObservationReconciliationInventory {
  readonly version: typeof VERSION; readonly projectRoot: string; readonly relativeDatabasePath: string;
  readonly databaseLineage: ProviderExecutionObservationMigrationInspection;
  readonly activeOpenIntervals: readonly StoredProviderExecutionInterval[]; readonly activeOpenCount: number;
}
export interface ProviderExecutionObservationRetirementCandidate extends ProviderExecutionExactOpenInterval { readonly settlementDigest: string; readonly closureDigest: string; }
export interface ProviderExecutionObservationReconciliationPlan {
  readonly version: typeof VERSION; readonly projectRoot: string; readonly relativeDatabasePath: string;
  /** Legacy single-run filter identity; empty when planning all discovered runs. */
  readonly canonicalRunId: string;
  /** Exact digest-bound selection scope: null means all runs; an array is a sorted unique explicit filter. */
  readonly runFilter: readonly string[] | null;
  /** Sorted unique run identities derived from the exact digest-bound candidates. */
  readonly runIds: readonly string[];
  readonly databaseSchemaDigest: string; readonly databaseLineageDigest: string;
  readonly activeOpenCount: number; readonly candidates: readonly ProviderExecutionObservationRetirementCandidate[]; readonly planDigest: string;
}
export interface ProviderExecutionObservationReconciliationApplyResult {
  readonly state: 'applied' | 'replayed'; readonly planDigest: string; readonly beforeActiveOpenCount: number;
  readonly afterActiveOpenCount: number; readonly retiredCount: number;
}
function canonical(value: unknown): string {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('Unsupported canonical value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}
function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function sameDigest(left: string, right: string): boolean {
  return HEX_256.test(left) && HEX_256.test(right) && timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function maximum(bounds: ProviderExecutionObservationReconciliationBounds): number {
  const value = bounds.maxOpenIntervals ?? 1_000;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) throw new TypeError('maxOpenIntervals must be 1..100000');
  return value;
}
/** Derived runIds are excluded; the exact selection mode remains digest-bound through runFilter. */
function body(plan: Omit<ProviderExecutionObservationReconciliationPlan, 'planDigest' | 'runIds'>) {
  return { version: plan.version, projectRoot: plan.projectRoot, relativeDatabasePath: plan.relativeDatabasePath,
    canonicalRunId: plan.canonicalRunId, runFilter: plan.runFilter, databaseSchemaDigest: plan.databaseSchemaDigest,
    databaseLineageDigest: plan.databaseLineageDigest, activeOpenCount: plan.activeOpenCount, candidates: plan.candidates };
}
function exact(interval: StoredProviderExecutionInterval): ProviderExecutionExactOpenInterval | null {
  if (interval.runId === null || interval.ownership !== 'run-owned') return null;
  return { executionId: interval.executionId, runId: interval.runId, taskId: interval.taskId, attemptId: interval.attemptId,
    providerPrincipalDigest: interval.providerPrincipalDigest, fence: interval.fence };
}
function candidate(projectRoot: string, interval: StoredProviderExecutionInterval): ProviderExecutionObservationRetirementCandidate | null {
  const open = exact(interval);
  if (!open) return null;
  try {
    const ref = createTaskResultSettlementRefForAttempt(projectRoot, open.taskId, open.attemptId);
    const settlement = readClosedTaskResultSettlement(ref);
    const closure = readTaskResultSettlementClosure(ref);
    return settlement && closure ? Object.freeze({ ...open, settlementDigest: taskResultSettlementDigest(settlement), closureDigest: taskResultSettlementClosureDigest(closure) }) : null;
  } catch { return null; }
}
function selectedRunIds(input: { readonly canonicalRunId?: string; readonly runIds?: readonly string[] }): {
  readonly filter: ReadonlySet<string> | null; readonly canonicalRunId: string; readonly runFilter: readonly string[] | null;
} {
  if (input.canonicalRunId !== undefined && input.runIds !== undefined) throw new TypeError('canonicalRunId and runIds filters cannot be combined');
  if (input.canonicalRunId !== undefined) {
    if (input.canonicalRunId.trim() === '') throw new TypeError('canonicalRunId must be non-empty');
    const runFilter = Object.freeze([input.canonicalRunId]);
    return { filter: new Set(runFilter), canonicalRunId: input.canonicalRunId, runFilter };
  }
  if (input.runIds === undefined) return { filter: null, canonicalRunId: '', runFilter: null };
  const values = input.runIds.map(runId => {
    if (typeof runId !== 'string' || runId.trim() === '') throw new TypeError('runIds must contain only non-empty strings');
    return runId;
  });
  const runFilter = Object.freeze([...new Set(values)].sort());
  return { filter: new Set(runFilter), canonicalRunId: '', runFilter };
}
/** Read-only, bounded inventory of every currently active durable interval. */
export function inventoryProviderExecutionObservationReconciliation(input: {
  readonly projectRoot: string; readonly relativeDatabasePath?: string; readonly bounds?: ProviderExecutionObservationReconciliationBounds;
}): ProviderExecutionObservationReconciliationInventory {
  const relativeDatabasePath = input.relativeDatabasePath ?? PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH;
  const path = safeProviderExecutionObservationProjectPath(input.projectRoot, relativeDatabasePath);
  if (!existsSync(path.databasePath)) throw new ProviderExecutionObservationReconciliationError('SOURCE_NOT_FOUND', 'Observation database does not exist');
  const bounds = input.bounds ?? {};
  const databaseLineage = inspectProviderExecutionObservationMigration(path, bounds);
  const store = new ProviderExecutionObservationStore(input.projectRoot, { dbPath: path.databasePath, readOnly: true });
  try {
    let activeOpenIntervals: StoredProviderExecutionInterval[];
    try { activeOpenIntervals = store.listActiveOpenIntervals(maximum(bounds)); }
    catch (error) {
      if (error instanceof ProviderExecutionObservationStoreError && error.code === 'OPEN_RETENTION_EXCEEDED') {
        throw new ProviderExecutionObservationReconciliationError('DISCOVERY_BOUND_EXCEEDED', error.message);
      }
      throw error;
    }
    return Object.freeze({ version: VERSION, projectRoot: path.projectRoot, relativeDatabasePath, databaseLineage,
      activeOpenIntervals: Object.freeze(activeOpenIntervals), activeOpenCount: activeOpenIntervals.length });
  } finally { store.close(); }
}
/** Deterministically select every exact host-settled, closed, run-owned interval, optionally narrowed to explicit runs. */
export function planProviderExecutionObservationReconciliation(input: {
  readonly inventory: ProviderExecutionObservationReconciliationInventory; readonly canonicalRunId?: string; readonly runIds?: readonly string[];
}): ProviderExecutionObservationReconciliationPlan {
  const selection = selectedRunIds(input);
  const candidates = input.inventory.activeOpenIntervals
    .map(interval => candidate(input.inventory.projectRoot, interval))
    .filter((value): value is ProviderExecutionObservationRetirementCandidate => value !== null)
    .filter(value => selection.filter === null || selection.filter.has(value.runId))
    .sort((left, right) => left.runId.localeCompare(right.runId) || left.executionId.localeCompare(right.executionId));
  const runIds = Object.freeze([...new Set(candidates.map(value => value.runId))].sort());
  const result = { version: VERSION, projectRoot: input.inventory.projectRoot, relativeDatabasePath: input.inventory.relativeDatabasePath,
    canonicalRunId: selection.canonicalRunId, runFilter: selection.runFilter,
    databaseSchemaDigest: input.inventory.databaseLineage.schemaDigest,
    databaseLineageDigest: input.inventory.databaseLineage.rowLineageDigest, activeOpenCount: input.inventory.activeOpenCount,
    candidates: Object.freeze(candidates) } as const;
  return Object.freeze({ ...result, runIds, planDigest: digest(result) });
}
/** Fresh-revalidate exact preimages before retiring only plan candidates through store authority. */
export function applyProviderExecutionObservationReconciliation(input: {
  readonly plan: ProviderExecutionObservationReconciliationPlan; readonly bounds?: ProviderExecutionObservationReconciliationBounds;
}): ProviderExecutionObservationReconciliationApplyResult {
  if (!sameDigest(input.plan.planDigest, digest(body(input.plan)))) throw new ProviderExecutionObservationReconciliationError('INVALID_PLAN', 'Plan digest does not match its exact preimage');
  const expectedRunIds = [...new Set(input.plan.candidates.map(value => value.runId))].sort();
  if (canonical(input.plan.runIds) !== canonical(expectedRunIds)) throw new ProviderExecutionObservationReconciliationError('INVALID_PLAN', 'Plan run identities do not match candidate preimages');
  const expectedFilter = input.plan.runFilter === null ? null : [...new Set(input.plan.runFilter)].sort();
  if (canonical(input.plan.runFilter) !== canonical(expectedFilter)
    || (input.plan.canonicalRunId !== '' && canonical(input.plan.runFilter) !== canonical([input.plan.canonicalRunId]))) {
    throw new ProviderExecutionObservationReconciliationError('INVALID_PLAN', 'Plan run filter is not a canonical exact selection scope');
  }
  const path = safeProviderExecutionObservationProjectPath(input.plan.projectRoot, input.plan.relativeDatabasePath);
  const replayStore = new ProviderExecutionObservationStore(input.plan.projectRoot, { dbPath: path.databasePath, readOnly: true });
  try {
    const alreadyRetired = input.plan.candidates.length > 0 && input.plan.candidates.every(candidate => replayStore
      .listIntervals(candidate.providerPrincipalDigest).some(interval => interval.executionId === candidate.executionId
        && interval.runId === candidate.runId && interval.taskId === candidate.taskId
        && interval.attemptId === candidate.attemptId && interval.fence === candidate.fence && interval.retired));
    if (alreadyRetired) {
      const count = replayStore.listActiveOpenIntervals(maximum(input.bounds ?? {})).length;
      return Object.freeze({ state: 'replayed', planDigest: input.plan.planDigest,
        beforeActiveOpenCount: count, afterActiveOpenCount: count, retiredCount: 0 });
    }
  } finally { replayStore.close(); }
  const inventory = inventoryProviderExecutionObservationReconciliation({ projectRoot: input.plan.projectRoot,
    relativeDatabasePath: input.plan.relativeDatabasePath, bounds: input.bounds });
  if (!sameDigest(inventory.databaseLineage.schemaDigest, input.plan.databaseSchemaDigest)
    || !sameDigest(inventory.databaseLineage.rowLineageDigest, input.plan.databaseLineageDigest)) {
    throw new ProviderExecutionObservationReconciliationError('CONCURRENT_CHANGE', 'Observation DB lineage changed since planning');
  }
  const fresh = planProviderExecutionObservationReconciliation({
    inventory,
    canonicalRunId: input.plan.canonicalRunId || undefined,
    runIds: input.plan.canonicalRunId === '' ? input.plan.runFilter ?? undefined : undefined,
  });
  if (!sameDigest(fresh.planDigest, input.plan.planDigest)) throw new ProviderExecutionObservationReconciliationError('CONCURRENT_CHANGE', 'Plan candidates or active preimage changed since planning');
  if (input.plan.candidates.length === 0) return Object.freeze({ state: 'replayed', planDigest: input.plan.planDigest,
    beforeActiveOpenCount: inventory.activeOpenCount, afterActiveOpenCount: inventory.activeOpenCount, retiredCount: 0 });
  const store = new ProviderExecutionObservationStore(input.plan.projectRoot, { dbPath: path.databasePath });
  try {
    let retiredCount: number;
    try { retiredCount = store.retireExactOpenIntervals(input.plan.candidates); }
    catch (error) {
      if (error instanceof ProviderExecutionObservationStoreError) throw new ProviderExecutionObservationReconciliationError('CONCURRENT_CHANGE', error.message);
      throw error;
    }
    return Object.freeze({ state: 'applied', planDigest: input.plan.planDigest, beforeActiveOpenCount: inventory.activeOpenCount,
      afterActiveOpenCount: store.listActiveOpenIntervals(maximum(input.bounds ?? {})).length, retiredCount });
  } finally { store.close(); }
}
export const inspectProviderExecutionObservationReconciliation = inventoryProviderExecutionObservationReconciliation;
