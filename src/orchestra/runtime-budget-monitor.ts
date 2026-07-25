import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { TASKS_DIR } from '../core/constants.js';
import { normalizeGlobalScopePlatform, resolveGlobalScopePaths } from '../core/global-scope-resolver.js';
import {
  LiveExecutionBudgetGuard,
  hasLiveUsageCeiling,
  type LiveBudgetDecision,
  type LiveUsageGuardState,
} from '../core/live-execution-budget.js';
import type { StreamLogEvent } from '../core/log-event.js';
import type { TaskResult } from '../core/task-types.js';
import type { ExecutionBudget } from '../core/work-model.js';

export const RUNTIME_BUDGET_STOP_SUFFIX = '.budget-stop.json';
export const RUNTIME_BUDGET_USAGE_SUFFIX = '.budget-usage.json';

export interface RuntimeBudgetStopEvidence {
  version: 2;
  projectId: string;
  taskId: string;
  attemptId: string;
  budgetFingerprint: string;
  backend: string;
  state: 'exceeded';
  budget: ExecutionBudget;
  decision: LiveBudgetDecision;
  stoppedAt: string;
  /** Stop marker is primary; terminal usage is the durable corruption fallback. */
  evidenceSource?: 'stop-marker' | 'terminal-usage-fallback';
}

export interface RuntimeBudgetUsageEvidence {
  version: 2;
  projectId: string;
  taskId: string;
  attemptId: string;
  budgetFingerprint: string;
  backend: string;
  terminal: boolean;
  budget: ExecutionBudget;
  decision: LiveBudgetDecision;
  guardState: LiveUsageGuardState;
  updatedAt: string;
}

interface RuntimeBudgetCurrentPointer {
  version: 1;
  projectId: string;
  taskId: string;
  attemptId: string;
  budgetFingerprint: string;
  updatedAt: string;
}

const BUDGET_FIELDS = [
  'maxUsd',
  'maxTokens',
  'maxTurns',
  'maxInputTokens',
  'maxOutputTokens',
  'maxCacheReadTokens',
  'maxCacheCreationTokens',
  'maxContextTokens',
] as const;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function budgetFingerprint(budget: ExecutionBudget): string {
  return sha256(JSON.stringify(Object.fromEntries(
    BUDGET_FIELDS.filter(field => budget[field] !== undefined).map(field => [field, budget[field]]),
  )));
}

/** Host-owned state root: outside the project bind mount used by Docker workers. */
export function resolveRuntimeBudgetLedgerDir(projectRoot: string): string {
  const platform = normalizeGlobalScopePlatform(process.platform, process.env);
  const stateDir = resolveGlobalScopePaths(platform, process.env).stateDir;
  return join(stateDir, 'runtime', 'execution-budgets', sha256(canonicalProjectRoot(projectRoot)));
}

function taskLedgerDir(projectRoot: string, taskId: string): string {
  return join(resolveRuntimeBudgetLedgerDir(projectRoot), `task-${sha256(taskId).slice(0, 32)}`);
}

function projectId(projectRoot: string): string {
  return sha256(canonicalProjectRoot(projectRoot));
}

function validateBudget(value: unknown): ExecutionBudget | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Execution budget must be an object. Spawn blocked before provider work.');
  }
  const raw = value as Record<string, unknown>;
  const budget: ExecutionBudget = {};
  for (const field of BUDGET_FIELDS) {
    const candidate = raw[field];
    if (candidate === undefined) continue;
    if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
      throw new Error(`Execution budget ${field} must be a non-negative finite number. Spawn blocked before provider work.`);
    }
    budget[field] = candidate;
  }
  return budget;
}

/**
 * Resolve budget at the execution boundary, not only from caller plumbing.
 * This closes direct `deckent spawn`/recovery paths that already persisted the
 * Task but did not forward its budget in spawn options.
 */
export function resolveTaskExecutionBudget(
  projectRoot: string,
  taskId: string,
  explicit?: ExecutionBudget,
): ExecutionBudget | undefined {
  let budget: ExecutionBudget | undefined;
  if (explicit !== undefined) {
    budget = validateBudget(explicit);
  } else {
    const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskPath)) return undefined;
    let task: unknown;
    try {
      task = JSON.parse(readFileSync(taskPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Cannot read persisted task budget for ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const record = task !== null && typeof task === 'object' && !Array.isArray(task)
      ? task as Record<string, unknown>
      : null;
    budget = validateBudget(record?.budget);
  }
  if (budget) {
    const priorStop = readRuntimeBudgetExhaustion(projectRoot, taskId);
    if (priorStop?.budgetFingerprint === budgetFingerprint(budget)) {
      throw new Error(`Task ${taskId} already exhausted its runtime budget in attempt ${priorStop.attemptId}. Spawn blocked before provider work.`);
    }
  }
  return budget;
}

function currentPath(projectRoot: string, taskId: string): string {
  return join(taskLedgerDir(projectRoot, taskId), 'current.json');
}

function markerPath(projectRoot: string, taskId: string, attemptId: string): string {
  return join(taskLedgerDir(projectRoot, taskId), 'attempts', attemptId, `stop${RUNTIME_BUDGET_STOP_SUFFIX}`);
}

function usagePath(projectRoot: string, taskId: string, attemptId: string): string {
  return join(taskLedgerDir(projectRoot, taskId), 'attempts', attemptId, `usage${RUNTIME_BUDGET_USAGE_SUFFIX}`);
}

function writeJsonAtomic(finalPath: string, evidence: unknown): void {
  mkdirSync(dirname(finalPath), { recursive: true, mode: 0o700 });
  const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(evidence, null, 2), { encoding: 'utf-8', mode: 0o600 });
    renameSync(tmpPath, finalPath);
  } finally {
    if (existsSync(tmpPath)) {
      try { unlinkSync(tmpPath); } catch { /* best-effort orphan cleanup */ }
    }
  }
}

function writeMarkerAtomic(projectRoot: string, evidence: RuntimeBudgetStopEvidence): void {
  writeJsonAtomic(markerPath(projectRoot, evidence.taskId, evidence.attemptId), evidence);
}

function writeUsageAtomic(projectRoot: string, evidence: RuntimeBudgetUsageEvidence): void {
  writeJsonAtomic(usagePath(projectRoot, evidence.taskId, evidence.attemptId), evidence);
  const pointer: RuntimeBudgetCurrentPointer = {
    version: 1,
    projectId: evidence.projectId,
    taskId: evidence.taskId,
    attemptId: evidence.attemptId,
    budgetFingerprint: evidence.budgetFingerprint,
    updatedAt: evidence.updatedAt,
  };
  writeJsonAtomic(currentPath(projectRoot, evidence.taskId), pointer);
}

function readCurrent(projectRoot: string, taskId: string): RuntimeBudgetCurrentPointer | null {
  try {
    const parsed = JSON.parse(readFileSync(currentPath(projectRoot, taskId), 'utf-8')) as RuntimeBudgetCurrentPointer;
    if (
      parsed.version !== 1
      || parsed.projectId !== projectId(projectRoot)
      || parsed.taskId !== taskId
      || !parsed.attemptId
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readRuntimeBudgetStop(
  projectRoot: string,
  taskId: string,
): RuntimeBudgetStopEvidence | null {
  try {
    const current = readCurrent(projectRoot, taskId);
    if (!current) return null;
    const parsed = JSON.parse(readFileSync(markerPath(projectRoot, taskId, current.attemptId), 'utf-8')) as RuntimeBudgetStopEvidence;
    if (
      parsed.version !== 2
      || parsed.projectId !== current.projectId
      || parsed.taskId !== taskId
      || parsed.attemptId !== current.attemptId
      || parsed.budgetFingerprint !== current.budgetFingerprint
      || parsed.state !== 'exceeded'
      || !parsed.decision
      || parsed.decision.state !== 'exceeded'
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readRuntimeBudgetUsage(
  projectRoot: string,
  taskId: string,
): RuntimeBudgetUsageEvidence | null {
  try {
    const current = readCurrent(projectRoot, taskId);
    if (!current) return null;
    const parsed = JSON.parse(readFileSync(usagePath(projectRoot, taskId, current.attemptId), 'utf-8')) as RuntimeBudgetUsageEvidence;
    if (
      parsed.version !== 2
      || parsed.projectId !== current.projectId
      || parsed.taskId !== taskId
      || parsed.attemptId !== current.attemptId
      || parsed.budgetFingerprint !== current.budgetFingerprint
      || typeof parsed.terminal !== 'boolean'
      || !parsed.decision
      || parsed.guardState?.version !== 1
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read durable exhaustion without making the stop marker a single point of
 * failure. A terminal host-owned usage snapshot whose decision is exactly
 * `exceeded` proves the same fact; unmeasurable/non-terminal evidence never
 * becomes an exhaustion claim.
 */
export function readRuntimeBudgetExhaustion(
  projectRoot: string,
  taskId: string,
): RuntimeBudgetStopEvidence | null {
  const marker = readRuntimeBudgetStop(projectRoot, taskId);
  if (marker) return { ...marker, evidenceSource: 'stop-marker' };
  const usage = readRuntimeBudgetUsage(projectRoot, taskId);
  if (!usage?.terminal || usage.decision.state !== 'exceeded') return null;
  return {
    version: 2,
    projectId: usage.projectId,
    taskId: usage.taskId,
    attemptId: usage.attemptId,
    budgetFingerprint: usage.budgetFingerprint,
    backend: usage.backend,
    state: 'exceeded',
    budget: usage.budget,
    decision: usage.decision,
    stoppedAt: usage.updatedAt,
    evidenceSource: 'terminal-usage-fallback',
  };
}

export async function waitForTerminalRuntimeBudgetUsage(
  projectRoot: string,
  taskId: string,
  timeoutMs: number,
  pollMs = 50,
): Promise<RuntimeBudgetUsageEvidence | null> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  do {
    const evidence = readRuntimeBudgetUsage(projectRoot, taskId);
    if (evidence?.terminal) return evidence;
    if (Date.now() >= deadline) return null;
    await new Promise<void>(resolve => setTimeout(resolve, pollMs));
  } while (true);
}

/**
 * Owns one task's in-flight guard. The marker is persisted before termination;
 * termination is exactly-once even if the provider repeats a usage block.
 */
export class RuntimeBudgetMonitor {
  private readonly guard: LiveExecutionBudgetGuard;
  private readonly attemptId: string;
  private readonly projectId: string;
  private readonly budgetFingerprint: string;
  private stopped = false;
  private lastUsageFingerprint = '';
  private observationFailureReason: string | null = null;

  constructor(private readonly input: {
    projectRoot: string;
    taskId: string;
    backend: string;
    budget: ExecutionBudget;
    now?: () => string;
    onStop: (evidence: RuntimeBudgetStopEvidence) => void;
  }) {
    this.projectId = projectId(input.projectRoot);
    this.budgetFingerprint = budgetFingerprint(input.budget);
    const previousStop = readRuntimeBudgetExhaustion(input.projectRoot, input.taskId);
    if (previousStop?.budgetFingerprint === this.budgetFingerprint) {
      throw new Error(`Task ${input.taskId} already exhausted its runtime budget in attempt ${previousStop.attemptId}. Spawn blocked before provider work.`);
    }
    const previous = readRuntimeBudgetUsage(input.projectRoot, input.taskId);
    const resumingAttempt = previous !== null
      && previous.terminal === false
      && previous.budgetFingerprint === this.budgetFingerprint;
    this.attemptId = resumingAttempt ? previous.attemptId : randomUUID();
    const restored = previous
      ? {
          ...previous.guardState,
          // A coordinator restart resumes the same attempt and must retain
          // dedupe identities. A deliberate later retry carries consumption
          // but starts a fresh provider-call identity space.
          seenDedupeKeys: resumingAttempt ? previous.guardState.seenDedupeKeys : [],
        }
      : undefined;
    this.guard = new LiveExecutionBudgetGuard(input.budget, restored);
  }

  observe(event: StreamLogEvent): LiveBudgetDecision {
    const decision = this.guard.observe(event);
    if (decision.state !== 'exceeded' || this.stopped) {
      this.persistUsage(decision, decision.state === 'exceeded');
      return decision;
    }
    this.stopped = true;
    const evidence: RuntimeBudgetStopEvidence = {
      version: 2,
      projectId: this.projectId,
      taskId: this.input.taskId,
      attemptId: this.attemptId,
      budgetFingerprint: this.budgetFingerprint,
      backend: this.input.backend,
      state: 'exceeded',
      budget: this.input.budget,
      decision,
      stoppedAt: this.input.now?.() ?? new Date().toISOString(),
    };
    try {
      this.persistUsage(decision, true);
      writeMarkerAtomic(this.input.projectRoot, evidence);
    } finally {
      // Containment outranks observability: even a read-only/full filesystem
      // must not let a known-over-budget worker continue spending.
      this.input.onStop(evidence);
    }
    return decision;
  }

  settle(): RuntimeBudgetUsageEvidence {
    const decision = this.terminalDecision();
    return this.persistUsage(decision, true);
  }

  /**
   * Persist loss of the incremental provider stream as terminally
   * unmeasurable. Partial counters remain evidence, but they can no longer be
   * mistaken for complete within-budget usage by a later settle call.
   */
  failObservation(error: Error): RuntimeBudgetUsageEvidence {
    if (!this.observationFailureReason) {
      this.observationFailureReason = `runtime usage observer failed: ${error.message}`;
    }
    return this.persistUsage(this.terminalDecision(), true);
  }

  private terminalDecision(): LiveBudgetDecision {
    const snapshot = this.guard.snapshot();
    if (!this.observationFailureReason) return snapshot;
    return {
      ...snapshot,
      state: 'unmeasurable',
      reasons: [...snapshot.reasons, this.observationFailureReason],
    };
  }

  private persistUsage(decision: LiveBudgetDecision, terminal: boolean): RuntimeBudgetUsageEvidence {
    const evidence: RuntimeBudgetUsageEvidence = {
      version: 2,
      projectId: this.projectId,
      taskId: this.input.taskId,
      attemptId: this.attemptId,
      budgetFingerprint: this.budgetFingerprint,
      backend: this.input.backend,
      terminal,
      budget: this.input.budget,
      decision,
      guardState: this.guard.exportState(),
      updatedAt: this.input.now?.() ?? new Date().toISOString(),
    };
    const fingerprint = JSON.stringify({ terminal, state: decision.state, counters: decision.counters });
    if (fingerprint !== this.lastUsageFingerprint) {
      writeUsageAtomic(this.input.projectRoot, evidence);
      this.lastUsageFingerprint = fingerprint;
    }
    return evidence;
  }
}

export function createRuntimeBudgetMonitor(input: {
  projectRoot: string;
  taskId: string;
  backend: string;
  budget?: ExecutionBudget;
  now?: () => string;
  onStop: (evidence: RuntimeBudgetStopEvidence) => void;
}): RuntimeBudgetMonitor | null {
  if (!hasLiveUsageCeiling(input.budget)) return null;
  return new RuntimeBudgetMonitor({
    projectRoot: input.projectRoot,
    taskId: input.taskId,
    backend: input.backend,
    budget: input.budget!,
    ...(input.now ? { now: input.now } : {}),
    onStop: input.onStop,
  });
}

/** A budget circuit-breaker marker vetoes any worker-authored success. */
export function applyRuntimeBudgetStopToResult(
  projectRoot: string,
  taskId: string,
  result: TaskResult,
): RuntimeBudgetStopEvidence | null {
  const evidence = readRuntimeBudgetExhaustion(projectRoot, taskId);
  if (!evidence) return null;
  result.selfAssessment = 'NO_GO';
  result.testsPassed = false;
  const reason = evidence.decision.reasons.join('; ');
  const prefix = `Runtime budget circuit breaker stopped the worker: ${reason}.`;
  if (!result.notes.includes(prefix)) result.notes = `${prefix} ${result.notes}`.trim();
  return evidence;
}
