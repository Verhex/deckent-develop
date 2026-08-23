import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { canonicalJson } from './audit-writer.js';
import {
  DECKENT_DIR,
  RECENT_WORKS_DIR,
  RUN_STATUS_READ_MODEL_FILE,
  SPRINT_STATE_FILE,
  TASKS_DIR,
} from './constants.js';
import {
  projectLogicalProgress,
  type LogicalProgressLineage,
  type LogicalProgressStatus,
} from './logical-progress-projection.js';
import { readProviderConcurrencyRuntime } from './provider-concurrency-runtime-reader.js';
import {
  PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH,
  ProviderExecutionObservationStore,
} from './provider-execution-observation-store.js';
import type { ProviderConcurrencyRuntimeProjection } from './provider-limit-admission.js';
import { readCanonicalRunStatus, type CanonicalRunStatus } from './run-status-authority.js';
import { projectTerminalPublicationStatus } from './sprint-terminal-publication-status.js';
import { resolveTaskLineageRootId } from './task-lineage.js';
import { TaskStatus, type Task } from './types.js';
import { inspectTaskResultSettlementAuthority } from './task-result-settlement.js';
import { classifyTaskArtifact } from './task-artifact-classifier.js';

export const RUN_STATUS_READ_MODEL_SCHEMA_VERSION = 1 as const;

export type RunStatusReadModelHoldReason =
  | 'authority-conflict'
  | 'malformed-task-artifact'
  | 'unresolved-provider-observation';

export interface RunStatusReadModelHold {
  readonly reasonCode: RunStatusReadModelHoldReason;
  readonly evidenceRef: string;
  readonly detail: string;
}

export interface CanonicalRunLogicalProgress {
  readonly done: number;
  readonly active: number;
  readonly blocked: number;
  readonly total: number;
  readonly attemptCount: number;
  readonly lineages: readonly LogicalProgressLineage[];
}

export interface CanonicalRunStatusReadModel {
  readonly schemaVersion: typeof RUN_STATUS_READ_MODEL_SCHEMA_VERSION;
  readonly revision: number;
  /** Exact coordinator lease or terminal generation; null only for IDLE. */
  readonly runGeneration: string | null;
  readonly publishedAt: string;
  readonly authority: CanonicalRunStatus;
  readonly logicalProgress: CanonicalRunLogicalProgress;
  readonly providerConcurrency: readonly ProviderConcurrencyRuntimeProjection[];
  readonly terminalPublication: ReturnType<typeof projectTerminalPublicationStatus>;
  readonly holds: readonly RunStatusReadModelHold[];
  readonly modelDigest: string;
}

interface RawSprintState {
  readonly sprintId?: unknown;
  readonly taskIds?: unknown;
}

interface RawPidAuthority {
  readonly leaseId?: unknown;
  readonly startToken?: unknown;
}

export interface CanonicalRunStatusReadModelBuildInput {
  readonly authority: CanonicalRunStatus;
  readonly tasks: readonly Task[];
  readonly logicalProgress?: CanonicalRunLogicalProgress;
  readonly providerConcurrency: readonly ProviderConcurrencyRuntimeProjection[];
  readonly terminalPublication: ReturnType<typeof projectTerminalPublicationStatus>;
  readonly runGeneration: string | null;
  readonly holds?: readonly RunStatusReadModelHold[];
  readonly previous?: CanonicalRunStatusReadModel | null;
  readonly publishedAt: string;
}

export class RunStatusReadModelError extends Error {
  constructor(
    readonly code: 'INVALID_MODEL' | 'DIGEST_MISMATCH' | 'PERSIST_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'RunStatusReadModelError';
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  } catch {
    return null;
  }
}

function taskStatus(status: Task['status']): LogicalProgressStatus {
  if (status === TaskStatus.DONE) return 'done';
  if (
    status === TaskStatus.CLAIMED
    || status === TaskStatus.EXECUTING
    || status === TaskStatus.TESTING
    || status === TaskStatus.DOCUMENTING
  ) return 'active';
  return 'blocked';
}

function taskSequence(task: Task): number | undefined {
  const timestamp = task.updatedAt ?? task.createdAt;
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function projectCanonicalRunLogicalProgress(
  tasks: readonly Task[],
): CanonicalRunLogicalProgress {
  const tasksById = new Map(tasks.map(task => [task.id, task]));
  const projected = projectLogicalProgress({
    attempts: tasks.map(task => {
      const sequence = taskSequence(task);
      return {
        id: task.id,
        logicalTaskId: resolveTaskLineageRootId(task, tasksById),
        status: taskStatus(task.status),
        ...(task.isPriorityFix && task.fixForTaskId
          ? { fixForAttemptId: task.fixForTaskId }
          : {}),
        ...(sequence !== undefined ? { sequence } : {}),
      };
    }),
  });
  if (!projected.ok) {
    throw new RunStatusReadModelError(
      'INVALID_MODEL',
      `Canonical logical progress rejected task lineage: ${projected.diagnostic}`,
    );
  }
  return projected.projection;
}

function semanticPayload(input: Omit<CanonicalRunStatusReadModel, 'revision' | 'publishedAt' | 'modelDigest'>) {
  return input;
}

export function buildCanonicalRunStatusReadModel(
  input: CanonicalRunStatusReadModelBuildInput,
): CanonicalRunStatusReadModel {
  const base = {
    schemaVersion: RUN_STATUS_READ_MODEL_SCHEMA_VERSION,
    runGeneration: input.runGeneration,
    authority: input.authority,
    logicalProgress: input.logicalProgress ?? projectCanonicalRunLogicalProgress(input.tasks),
    providerConcurrency: Object.freeze([...input.providerConcurrency]),
    terminalPublication: input.terminalPublication,
    holds: Object.freeze([...(input.holds ?? [])]),
  } as const;
  const modelDigest = sha256(canonicalJson(semanticPayload(base)));
  if (input.previous?.modelDigest === modelDigest) return input.previous;
  return Object.freeze({
    ...base,
    revision: (input.previous?.revision ?? 0) + 1,
    publishedAt: input.publishedAt,
    modelDigest,
  });
}

function expectedTaskIds(projectRoot: string, sprintId: string | null): ReadonlySet<string> {
  if (!sprintId) return new Set();
  const raw = readJson(join(projectRoot, SPRINT_STATE_FILE)) as RawSprintState | null;
  if (raw?.sprintId !== sprintId || !Array.isArray(raw.taskIds)) return new Set();
  return new Set(raw.taskIds.filter((value): value is string => typeof value === 'string'));
}

export function loadCanonicalRunTasks(
  projectRoot: string,
  authority: CanonicalRunStatus,
): { readonly tasks: readonly Task[]; readonly holds: readonly RunStatusReadModelHold[] } {
  if (!authority.sprintId) return { tasks: Object.freeze([]), holds: Object.freeze([]) };
  const taskDirectory = join(projectRoot, TASKS_DIR);
  if (!existsSync(taskDirectory)) return { tasks: Object.freeze([]), holds: Object.freeze([]) };
  const expected = expectedTaskIds(projectRoot, authority.sprintId);
  const tasks: Task[] = [];
  const holds: RunStatusReadModelHold[] = [];
  for (const file of readdirSync(taskDirectory).sort()) {
    if (!file.startsWith('task-') || !file.endsWith('.json')) continue;
    const path = join(taskDirectory, file);
    let content: string;
    try {
      content = readFileSync(path, 'utf-8');
    } catch {
      holds.push({
        reasonCode: 'malformed-task-artifact',
        evidenceRef: `task-artifact:${file}`,
        detail: 'Task artifact is unreadable',
      });
      continue;
    }
    const classification = classifyTaskArtifact(file, content);
    if (classification.kind === 'non-task-artifact') {
      if (
        classification.reason === 'malformed-content'
        || classification.reason === 'invalid-task-record'
        || classification.reason === 'task-id-mismatch'
      ) {
        holds.push({
          reasonCode: 'malformed-task-artifact',
          evidenceRef: `task-artifact:${file}`,
          detail: `Task artifact failed identity validation: ${classification.reason}`,
        });
      }
      continue;
    }
    const raw = JSON.parse(content) as Task;
    if (raw.sprintId === authority.sprintId || expected.has(raw.id)) tasks.push(raw as Task);
  }
  return { tasks: Object.freeze(tasks), holds: Object.freeze(holds) };
}

function readRunGeneration(projectRoot: string, authority: CanonicalRunStatus): string | null {
  if (!authority.sprintId) return null;
  const pid = readJson(
    join(projectRoot, DECKENT_DIR, 'pids', `${authority.sprintId}.pid`),
  ) as RawPidAuthority | null;
  if (typeof pid?.leaseId === 'string' && pid.leaseId.length > 0) return `lease:${pid.leaseId}`;
  if (typeof pid?.startToken === 'string' && pid.startToken.length > 0) {
    return `kernel:${sha256(pid.startToken)}`;
  }
  const receipt = projectTerminalPublicationStatus(projectRoot, authority).receipt;
  return receipt ? `terminal:${receipt.coordinatorGeneration}` : null;
}

function projectionHolds(
  projectRoot: string,
  authority: CanonicalRunStatus,
  providerConcurrency: readonly ProviderConcurrencyRuntimeProjection[],
  currentTaskIds: ReadonlySet<string>,
  currentAttemptIdsByTaskId: ReadonlyMap<string, ReadonlySet<string>>,
): RunStatusReadModelHold[] {
  const holds: RunStatusReadModelHold[] = authority.conflicts.map(conflict => ({
    reasonCode: 'authority-conflict',
    evidenceRef: `run-status-conflict:${conflict.surface}:${conflict.sprintId ?? 'none'}`,
    detail: conflict.value,
  }));
  if (!authority.sprintId) return holds;

  const databasePath = join(projectRoot, PROVIDER_EXECUTION_OBSERVATION_DATABASE_PATH);
  if (!existsSync(databasePath)) return holds;
  const store = new ProviderExecutionObservationStore(projectRoot, {
    dbPath: databasePath,
    readOnly: true,
  });
  const anomalousOpenIntervalsByPrincipal = new Map<string, number>();
  try {
    for (const provider of providerConcurrency) {
      const count = store.listIntervals(provider.providerPrincipalDigest).filter(interval => {
        if (interval.end !== null || interval.retired) return false;
        if (interval.ownership !== 'run-owned' || interval.runId !== authority.sprintId) return false;
        if (!currentTaskIds.has(interval.taskId)) return true;
        return !(currentAttemptIdsByTaskId.get(interval.taskId)?.has(interval.attemptId) ?? false);
      }).length;
      if (count > 0) anomalousOpenIntervalsByPrincipal.set(provider.providerPrincipalDigest, count);
    }
  } finally {
    store.close();
  }
  for (const provider of providerConcurrency) {
    const anomalousOpenIntervals = anomalousOpenIntervalsByPrincipal.get(
      provider.providerPrincipalDigest,
    ) ?? 0;
    if (anomalousOpenIntervals === 0) continue;
    holds.push({
      reasonCode: 'unresolved-provider-observation',
      evidenceRef: `provider-principal:${provider.providerPrincipalDigest}`,
      detail: `${anomalousOpenIntervals} open observation(s) owned by the current run are outside its exact task/attempt set`,
    });
  }
  return holds;
}

function terminalLogicalProgress(
  projectRoot: string,
  authority: CanonicalRunStatus,
  terminalPublication: ReturnType<typeof projectTerminalPublicationStatus>,
): CanonicalRunLogicalProgress | null {
  if (!authority.sprintId || !terminalPublication.receipt) return null;
  const raw = readJson(join(
    projectRoot,
    RECENT_WORKS_DIR,
    `${authority.sprintId}-terminal-receipt.json`,
  )) as {
    readonly terminalOutcome?: unknown;
    readonly receipt?: unknown;
    readonly logicalProgress?: unknown;
  } | null;
  if (
    !raw
    || raw.terminalOutcome !== terminalPublication.receipt.terminalOutcome
    || canonicalJson(raw.receipt) !== canonicalJson(terminalPublication.receipt)
    || !raw.logicalProgress
    || typeof raw.logicalProgress !== 'object'
  ) return null;
  const progress = raw.logicalProgress as CanonicalRunLogicalProgress;
  if (
    ![progress.done, progress.active, progress.blocked, progress.total, progress.attemptCount]
      .every(value => Number.isSafeInteger(value) && value >= 0)
    || !Array.isArray(progress.lineages)
    || progress.total !== progress.lineages.length
    || progress.done + progress.active + progress.blocked !== progress.total
    || progress.attemptCount !== progress.lineages.reduce(
      (sum, lineage) => sum + lineage.attemptCount,
      0,
    )
  ) return null;
  return Object.freeze(progress);
}

export function resolveCanonicalRunStatusReadModelPath(projectRoot: string): string {
  return join(projectRoot, RUN_STATUS_READ_MODEL_FILE);
}

export function readCanonicalRunStatusReadModel(
  projectRoot: string,
): CanonicalRunStatusReadModel | null {
  const raw = readJson(resolveCanonicalRunStatusReadModelPath(projectRoot));
  if (raw === null) return null;
  const model = raw as CanonicalRunStatusReadModel;
  if (
    model.schemaVersion !== RUN_STATUS_READ_MODEL_SCHEMA_VERSION
    || !Number.isSafeInteger(model.revision)
    || model.revision < 1
    || typeof model.modelDigest !== 'string'
  ) {
    throw new RunStatusReadModelError('INVALID_MODEL', 'Persisted run status read model is malformed');
  }
  const { revision: _revision, publishedAt: _publishedAt, modelDigest, ...semantic } = model;
  if (sha256(canonicalJson(semantic)) !== modelDigest) {
    throw new RunStatusReadModelError('DIGEST_MISMATCH', 'Persisted run status read model digest mismatch');
  }
  return Object.freeze(model);
}

export function runStatusReadModelMatchesAuthority(
  model: CanonicalRunStatusReadModel,
  authority: CanonicalRunStatus,
): boolean {
  return canonicalJson(model.authority) === canonicalJson(authority);
}

export function publishCanonicalRunStatusReadModel(
  projectRoot: string,
  options: { readonly publishedAt?: string; readonly authority?: CanonicalRunStatus } = {},
): CanonicalRunStatusReadModel {
  const authority = options.authority ?? readCanonicalRunStatus(projectRoot);
  const loaded = loadCanonicalRunTasks(projectRoot, authority);
  const currentTaskIds = new Set(loaded.tasks.map(task => task.id));
  const currentAttemptIdsByTaskId = new Map<string, ReadonlySet<string>>();
  for (const task of loaded.tasks) {
    const settlement = inspectTaskResultSettlementAuthority(projectRoot, task.id);
    currentAttemptIdsByTaskId.set(
      task.id,
      settlement.state === 'dispatched' && settlement.ref
        ? new Set([settlement.ref.attemptId])
        : new Set(),
    );
  }
  const providerConcurrency = readProviderConcurrencyRuntime(projectRoot, {
    currentTaskIds,
    currentAttemptIdsByTaskId,
  });
  const terminalPublication = projectTerminalPublicationStatus(projectRoot, authority);
  const exactTerminalProgress = terminalLogicalProgress(
    projectRoot,
    authority,
    terminalPublication,
  );
  const previous = readCanonicalRunStatusReadModel(projectRoot);
  const model = buildCanonicalRunStatusReadModel({
    authority,
    tasks: loaded.tasks,
    ...(exactTerminalProgress ? { logicalProgress: exactTerminalProgress } : {}),
    providerConcurrency,
    terminalPublication,
    runGeneration: readRunGeneration(projectRoot, authority),
    holds: [
      ...loaded.holds,
      ...projectionHolds(
        projectRoot,
        authority,
        providerConcurrency,
        currentTaskIds,
        currentAttemptIdsByTaskId,
      ),
    ],
    previous,
    publishedAt: options.publishedAt ?? new Date().toISOString(),
  });
  if (model === previous) return model;
  const path = resolveCanonicalRunStatusReadModelPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${process.pid}.${randomUUID()}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(model, null, 2)}\n`, 'utf-8');
    renameSync(temporary, path);
    const persisted = readCanonicalRunStatusReadModel(projectRoot);
    if (!persisted || persisted.modelDigest !== model.modelDigest) {
      throw new RunStatusReadModelError('PERSIST_FAILED', 'Run status read model readback failed');
    }
    return persisted;
  } catch (error) {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* preserve original failure */ }
    if (error instanceof RunStatusReadModelError) throw error;
    throw new RunStatusReadModelError(
      'PERSIST_FAILED',
      `Run status read model publication failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
