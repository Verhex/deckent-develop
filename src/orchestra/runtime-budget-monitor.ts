import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson } from '../core/audit-writer.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import type { ExecutionLandingProviderSequenceV1 } from '../core/execution-landing-checkpoint.js';
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
import type { ExecutionLandingPolicyConfig } from '../core/config-types.js';

export const RUNTIME_BUDGET_STOP_SUFFIX = '.budget-stop.json';
export const RUNTIME_BUDGET_USAGE_SUFFIX = '.budget-usage.json';
export const RUNTIME_BUDGET_LANDING_SUFFIX = '.budget-landing.json';
export const RUNTIME_BUDGET_OBSERVATION_SUFFIX = '.budget-observation.json';

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
  /** Counter projection may advance after containment while the provider exits. */
  counterEvidenceSource?: 'stop-marker' | 'terminal-usage';
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

export interface RuntimeBudgetLandingEvidence {
  version: 2;
  projectId: string;
  taskId: string;
  attemptId: string;
  budgetFingerprint: string;
  backend: string;
  state: 'landing-requested';
  budget: ExecutionBudget;
  decision: LiveBudgetDecision;
  providerSequence: ExecutionLandingProviderSequenceV1;
  requestedAt: string;
}

export interface RuntimeBudgetObservationEvidence {
  version: 1;
  projectId: string;
  taskId: string;
  attemptId: string;
  budgetFingerprint: string;
  backend: string;
  observationIndex: number;
  providerSequence: number;
  previousObservationDigest: string | null;
  observationDigest: string;
  decisionState: LiveBudgetDecision['state'];
  observation: NonNullable<LiveBudgetDecision['observation']>;
  appliedDelta: NonNullable<LiveBudgetDecision['appliedDelta']>;
  countersAfter: LiveBudgetDecision['counters'];
  measurableEventsAfter: number;
  incrementalUsageEventsAfter: number;
  consecutiveCacheReadEvents: number;
  repeatedReadDetected: boolean;
  observedAt: string;
}

export type RuntimeBudgetCounterScope = 'lineage' | 'attempt';

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
 * Validate the immutable host spawn envelope at the execution boundary.
 *
 * `.tasks/task-*.json` is worker-visible and may be mounted read-write by an
 * execution backend. It is therefore evidence/projection, never budget
 * authority. A missing host envelope remains missing so the applicable
 * provider/backend admission can fail closed without manufacturing policy.
 */
export function resolveHostExecutionBudget(
  projectRoot: string,
  taskId: string,
  explicit?: ExecutionBudget,
): ExecutionBudget | undefined {
  const budget = validateBudget(explicit);
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

function landingPath(projectRoot: string, taskId: string, attemptId: string): string {
  return join(taskLedgerDir(projectRoot, taskId), 'attempts', attemptId, `landing${RUNTIME_BUDGET_LANDING_SUFFIX}`);
}

function observationDir(projectRoot: string, taskId: string, attemptId: string): string {
  return join(taskLedgerDir(projectRoot, taskId), 'attempts', attemptId, 'observations');
}

function observationPath(
  projectRoot: string,
  taskId: string,
  attemptId: string,
  observationIndex: number,
): string {
  return join(
    observationDir(projectRoot, taskId, attemptId),
    `${String(observationIndex).padStart(12, '0')}${RUNTIME_BUDGET_OBSERVATION_SUFFIX}`,
  );
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

function writeLandingAtomic(projectRoot: string, evidence: RuntimeBudgetLandingEvidence): void {
  const finalPath = landingPath(projectRoot, evidence.taskId, evidence.attemptId);
  const parent = dirname(finalPath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(evidence, null, 2), { encoding: 'utf-8', mode: 0o600 });
    const fileFd = openSync(tmpPath, 'r');
    try { fsyncSync(fileFd); } finally { closeSync(fileFd); }
    try {
      linkSync(tmpPath, finalPath);
      try {
        const dirFd = openSync(parent, 'r');
        try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      } catch { /* directory fsync is unsupported on some platforms */ }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let existing: RuntimeBudgetLandingEvidence | null = null;
      try {
        existing = JSON.parse(readFileSync(finalPath, 'utf-8')) as RuntimeBudgetLandingEvidence;
      } catch { /* conflict below */ }
      if (
        !existing
        || existing.version !== evidence.version
        || existing.projectId !== evidence.projectId
        || existing.taskId !== evidence.taskId
        || existing.attemptId !== evidence.attemptId
        || existing.budgetFingerprint !== evidence.budgetFingerprint
        || JSON.stringify(existing.decision) !== JSON.stringify(evidence.decision)
      ) {
        throw createExecutionAuthorityError(
          `Conflicting immutable runtime budget landing evidence: ${finalPath}`,
        );
      }
    }
  } finally {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best effort */ }
  }
}

function observationDigestFor(
  evidence: Omit<RuntimeBudgetObservationEvidence, 'observationDigest'>,
): string {
  return sha256(canonicalJson(evidence));
}

function isNonNegativeFiniteRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return keys.every(
    key => typeof record[key] === 'number'
      && Number.isFinite(record[key])
      && record[key] >= 0,
  );
}

function isRuntimeBudgetObservationEvidence(
  value: unknown,
  expected: {
    projectId: string;
    taskId: string;
    attemptId: string;
    observationIndex: number;
    previousObservationDigest: string | null;
  },
): value is RuntimeBudgetObservationEvidence {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  const observation = evidence.observation as Record<string, unknown> | undefined;
  const appliedDelta = evidence.appliedDelta;
  const countersAfter = evidence.countersAfter;
  const validObservationCounts = observation !== undefined
    && isNonNegativeFiniteRecord(
      observation.counts,
      ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens'],
    );
  const validAppliedDelta = isNonNegativeFiniteRecord(
    appliedDelta,
    ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens'],
  );
  const validCounters = isNonNegativeFiniteRecord(
    countersAfter,
    [
      'turns',
      'inputTokens',
      'outputTokens',
      'cacheReadTokens',
      'cacheCreationTokens',
      'totalTokens',
      'maxContextTokens',
    ],
  );
  const consecutive = evidence.consecutiveCacheReadEvents;
  const repeated = evidence.repeatedReadDetected;
  const appliedCacheReadTokens = validAppliedDelta
    ? appliedDelta['cacheReadTokens']!
    : 0;
  const expectedRepeated = validAppliedDelta
    && appliedCacheReadTokens > 0
    && typeof consecutive === 'number'
    && consecutive >= 2;
  return evidence.version === 1
    && evidence.projectId === expected.projectId
    && evidence.taskId === expected.taskId
    && evidence.attemptId === expected.attemptId
    && typeof evidence.budgetFingerprint === 'string'
    && /^[a-f0-9]{64}$/.test(evidence.budgetFingerprint)
    && typeof evidence.backend === 'string'
    && evidence.backend.length > 0
    && evidence.observationIndex === expected.observationIndex
    && Number.isInteger(evidence.providerSequence)
    && (evidence.providerSequence as number) > 0
    && evidence.previousObservationDigest === expected.previousObservationDigest
    && typeof evidence.observationDigest === 'string'
    && /^[a-f0-9]{64}$/.test(evidence.observationDigest)
    && (
      evidence.decisionState === 'within-budget'
      || evidence.decisionState === 'landing-requested'
      || evidence.decisionState === 'exceeded'
      || evidence.decisionState === 'unmeasurable'
    )
    && observation !== undefined
    && typeof observation.dedupeKey === 'string'
    && observation.dedupeKey.length > 0
    && (observation.mode === 'incremental' || observation.mode === 'cumulative')
    && validObservationCounts
    && typeof observation.contextTokens === 'number'
    && Number.isFinite(observation.contextTokens)
    && observation.contextTokens >= 0
    && typeof observation.countsAsTurn === 'boolean'
    && (
      observation.reportedTurns === undefined
      || (
        typeof observation.reportedTurns === 'number'
        && Number.isInteger(observation.reportedTurns)
        && observation.reportedTurns >= 0
      )
    )
    && validAppliedDelta
    && validCounters
    && typeof evidence.measurableEventsAfter === 'number'
    && Number.isInteger(evidence.measurableEventsAfter)
    && evidence.measurableEventsAfter >= evidence.observationIndex
    && typeof evidence.incrementalUsageEventsAfter === 'number'
    && Number.isInteger(evidence.incrementalUsageEventsAfter)
    && evidence.incrementalUsageEventsAfter >= 0
    && evidence.incrementalUsageEventsAfter <= evidence.measurableEventsAfter
    && typeof consecutive === 'number'
    && Number.isInteger(consecutive)
    && consecutive >= 0
    && typeof repeated === 'boolean'
    && repeated === expectedRepeated
    && typeof evidence.observedAt === 'string'
    && Number.isFinite(Date.parse(evidence.observedAt));
}

function writeObservationAtomic(
  projectRoot: string,
  evidence: RuntimeBudgetObservationEvidence,
): void {
  const finalPath = observationPath(
    projectRoot,
    evidence.taskId,
    evidence.attemptId,
    evidence.observationIndex,
  );
  const parent = dirname(finalPath);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmpPath = `${finalPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmpPath, JSON.stringify(evidence, null, 2), { encoding: 'utf-8', mode: 0o600 });
    const fileFd = openSync(tmpPath, 'r');
    try { fsyncSync(fileFd); } finally { closeSync(fileFd); }
    try {
      linkSync(tmpPath, finalPath);
      try {
        const dirFd = openSync(parent, 'r');
        try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      } catch { /* directory fsync is unsupported on some platforms */ }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let existing: unknown = null;
      try { existing = JSON.parse(readFileSync(finalPath, 'utf-8')); } catch { /* conflict below */ }
      if (canonicalJson(existing) !== canonicalJson(evidence)) {
        throw createExecutionAuthorityError(
          `Conflicting immutable runtime budget observation evidence: ${finalPath}`,
        );
      }
    }
  } finally {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* best effort */ }
  }
}

export function readRuntimeBudgetObservations(
  projectRoot: string,
  taskId: string,
  attemptId?: string,
): RuntimeBudgetObservationEvidence[] {
  const resolvedAttemptId = attemptId ?? readCurrent(projectRoot, taskId)?.attemptId;
  if (!resolvedAttemptId) return [];
  const directory = observationDir(projectRoot, taskId, resolvedAttemptId);
  if (!existsSync(directory)) return [];
  const files = readdirSync(directory)
    .filter(file => file.endsWith(RUNTIME_BUDGET_OBSERVATION_SUFFIX))
    .sort();
  const observations: RuntimeBudgetObservationEvidence[] = [];
  let previousObservationDigest: string | null = null;
  const expectedProjectId = projectId(projectRoot);
  for (let offset = 0; offset < files.length; offset += 1) {
    const observationIndex = offset + 1;
    const expectedName =
      `${String(observationIndex).padStart(12, '0')}${RUNTIME_BUDGET_OBSERVATION_SUFFIX}`;
    const file = files[offset]!;
    if (file !== expectedName) {
      throw createExecutionAuthorityError(
        `Runtime budget observation chain is non-contiguous at index ${observationIndex}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(directory, file), 'utf-8'));
    } catch {
      throw createExecutionAuthorityError(
        `Runtime budget observation evidence is unreadable at index ${observationIndex}`,
      );
    }
    if (!isRuntimeBudgetObservationEvidence(parsed, {
      projectId: expectedProjectId,
      taskId,
      attemptId: resolvedAttemptId,
      observationIndex,
      previousObservationDigest,
    })) {
      throw createExecutionAuthorityError(
        `Runtime budget observation evidence is invalid at index ${observationIndex}`,
      );
    }
    const { observationDigest, ...digestPayload } = parsed;
    if (observationDigestFor(digestPayload) !== observationDigest) {
      throw createExecutionAuthorityError(
        `Runtime budget observation digest mismatch at index ${observationIndex}`,
      );
    }
    observations.push(parsed);
    previousObservationDigest = parsed.observationDigest;
  }
  return observations;
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
      || (parsed.guardState?.version !== 1 && parsed.guardState?.version !== 2)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readRuntimeBudgetLandingRequest(
  projectRoot: string,
  taskId: string,
): RuntimeBudgetLandingEvidence | null {
  try {
    const current = readCurrent(projectRoot, taskId);
    if (!current) return null;
    const parsed = JSON.parse(
      readFileSync(landingPath(projectRoot, taskId, current.attemptId), 'utf-8'),
    ) as RuntimeBudgetLandingEvidence;
    if (
      parsed.version !== 2
      || parsed.projectId !== current.projectId
      || parsed.taskId !== taskId
      || parsed.attemptId !== current.attemptId
      || parsed.budgetFingerprint !== current.budgetFingerprint
      || parsed.state !== 'landing-requested'
      || !parsed.decision
      || parsed.decision.state !== 'landing-requested'
      || !parsed.providerSequence
      || !Number.isInteger(parsed.providerSequence.firstSequence)
      || !Number.isInteger(parsed.providerSequence.lastSequence)
      || !Number.isInteger(parsed.providerSequence.eventCount)
      || parsed.providerSequence.firstSequence < 1
      || parsed.providerSequence.lastSequence < parsed.providerSequence.firstSequence
      || parsed.providerSequence.eventCount < 1
      || !/^[a-f0-9]{64}$/.test(parsed.providerSequence.eventDigest)
      || typeof parsed.requestedAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.requestedAt))
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
  const usage = readRuntimeBudgetUsage(projectRoot, taskId);
  if (marker) {
    const exactTerminalUsage = usage?.terminal === true
      && usage.decision.state === 'exceeded'
      && usage.projectId === marker.projectId
      && usage.taskId === marker.taskId
      && usage.attemptId === marker.attemptId
      && usage.budgetFingerprint === marker.budgetFingerprint;
    return {
      ...marker,
      ...(exactTerminalUsage
        ? { decision: { ...marker.decision, counters: usage.decision.counters } }
        : {}),
      evidenceSource: 'stop-marker',
      counterEvidenceSource: exactTerminalUsage ? 'terminal-usage' : 'stop-marker',
    };
  }
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
    counterEvidenceSource: 'terminal-usage',
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
  private landingRequested = false;
  private lastUsageFingerprint = '';
  private firstProviderSequence = 0;
  private lastProviderSequence = 0;
  private providerEventCount = 0;
  private providerEventDigest = '';
  private observationCount = 0;
  private lastObservationDigest: string | null = null;

  constructor(private readonly input: {
    projectRoot: string;
    taskId: string;
    attemptId?: string;
    backend: string;
    budget: ExecutionBudget;
    landingPolicy?: ExecutionLandingPolicyConfig;
    landingAlreadySatisfied?: boolean;
    /** `attempt` is reserved for checkpoint-subtracted continuation budgets. */
    counterScope?: RuntimeBudgetCounterScope;
    now?: () => string;
    onLandingRequested?: (evidence: RuntimeBudgetLandingEvidence) => void;
    onStop: (evidence: RuntimeBudgetStopEvidence) => void;
  }) {
    this.projectId = projectId(input.projectRoot);
    this.budgetFingerprint = budgetFingerprint(input.budget);
    if (
      input.attemptId !== undefined
      && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(input.attemptId)
    ) {
      throw createExecutionAuthorityError('Runtime budget attemptId must be a UUID');
    }
    const previousStop = readRuntimeBudgetExhaustion(input.projectRoot, input.taskId);
    if (previousStop?.budgetFingerprint === this.budgetFingerprint) {
      throw new Error(`Task ${input.taskId} already exhausted its runtime budget in attempt ${previousStop.attemptId}. Spawn blocked before provider work.`);
    }
    const previous = readRuntimeBudgetUsage(input.projectRoot, input.taskId);
    const resumingAttempt = previous !== null
      && previous.terminal === false
      && previous.budgetFingerprint === this.budgetFingerprint
      && (input.attemptId === undefined || previous.attemptId === input.attemptId);
    this.attemptId = input.attemptId ?? (resumingAttempt ? previous.attemptId : randomUUID());
    const priorObservations = readRuntimeBudgetObservations(
      input.projectRoot,
      input.taskId,
      this.attemptId,
    );
    this.observationCount = priorObservations.length;
    this.lastObservationDigest = priorObservations.at(-1)?.observationDigest ?? null;
    this.landingRequested = input.landingAlreadySatisfied === true
      || readRuntimeBudgetLandingRequest(input.projectRoot, input.taskId)
        ?.attemptId === this.attemptId;
    let restored: LiveUsageGuardState | undefined =
      previous && (resumingAttempt || input.counterScope !== 'attempt')
      ? {
          ...previous.guardState,
          // A coordinator restart resumes the same attempt and must retain
          // dedupe identities. A deliberate later retry carries consumption
          // but starts a fresh provider-call identity space. A continuation
          // already receives a checkpoint-subtracted remaining budget, so a
          // new continuation attempt must not apply parent counters twice.
          seenDedupeKeys: resumingAttempt ? previous.guardState.seenDedupeKeys : [],
        }
      : undefined;
    const journalHead = priorObservations.at(-1);
    if (
      journalHead
      && (
        previous?.attemptId !== this.attemptId
        || journalHead.measurableEventsAfter > (restored?.measurableEvents ?? 0)
      )
    ) {
      restored = {
        version: 2,
        counters: { ...journalHead.countersAfter },
        seenDedupeKeys: priorObservations.map(item => item.observation.dedupeKey),
        measurableEvents: journalHead.measurableEventsAfter,
        incrementalUsageEvents: journalHead.incrementalUsageEventsAfter,
        consecutiveCacheReadEvents: journalHead.consecutiveCacheReadEvents,
        lastAppliedDelta: { ...journalHead.appliedDelta },
      };
    }
    this.guard = new LiveExecutionBudgetGuard(
      input.budget,
      restored,
      input.landingAlreadySatisfied ? undefined : input.landingPolicy,
    );
  }

  observe(event: StreamLogEvent, providerSequence?: number): LiveBudgetDecision {
    const sequence = providerSequence ?? this.lastProviderSequence + 1;
    if (!Number.isInteger(sequence) || sequence < 1 || sequence <= this.lastProviderSequence) {
      throw createExecutionAuthorityError(
        'Runtime budget provider event sequence must be strictly increasing',
      );
    }
    this.firstProviderSequence ||= sequence;
    this.lastProviderSequence = sequence;
    this.providerEventCount += 1;
    this.providerEventDigest = sha256(canonicalJson({
      previous: this.providerEventDigest || null,
      sequence,
      event,
    }));
    const decision = this.guard.observe(event);
    let observationError: unknown;
    try {
      this.persistObservation(decision, sequence);
    } catch (error) {
      observationError = error;
    }
    if (decision.state === 'landing-requested' && !this.landingRequested) {
      this.persistUsage(decision, false);
      const evidence: RuntimeBudgetLandingEvidence = {
        version: 2,
        projectId: this.projectId,
        taskId: this.input.taskId,
        attemptId: this.attemptId,
        budgetFingerprint: this.budgetFingerprint,
        backend: this.input.backend,
        state: 'landing-requested',
        budget: this.input.budget,
        decision,
        providerSequence: {
          firstSequence: this.firstProviderSequence,
          lastSequence: this.lastProviderSequence,
          eventCount: this.providerEventCount,
          eventDigest: this.providerEventDigest,
        },
        requestedAt: this.input.now?.() ?? new Date().toISOString(),
      };
      writeLandingAtomic(this.input.projectRoot, evidence);
      this.landingRequested = true;
      this.input.onLandingRequested?.(evidence);
      if (observationError) throw observationError;
      return decision;
    }
    if (decision.state !== 'exceeded' || this.stopped) {
      this.persistUsage(decision, decision.state === 'exceeded');
      if (observationError) throw observationError;
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
    if (observationError) throw observationError;
    return decision;
  }

  settle(): RuntimeBudgetUsageEvidence {
    const decision = this.guard.snapshot();
    return this.persistUsage(decision, true);
  }

  private persistObservation(decision: LiveBudgetDecision, providerSequence: number): void {
    if (!decision.observation || !decision.appliedDelta) return;
    const observationIndex = this.observationCount + 1;
    const guardState = this.guard.exportState();
    const digestPayload: Omit<RuntimeBudgetObservationEvidence, 'observationDigest'> = {
      version: 1,
      projectId: this.projectId,
      taskId: this.input.taskId,
      attemptId: this.attemptId,
      budgetFingerprint: this.budgetFingerprint,
      backend: this.input.backend,
      observationIndex,
      providerSequence,
      previousObservationDigest: this.lastObservationDigest,
      decisionState: decision.state,
      observation: decision.observation,
      appliedDelta: decision.appliedDelta,
      countersAfter: decision.counters,
      measurableEventsAfter: guardState.measurableEvents,
      incrementalUsageEventsAfter: guardState.incrementalUsageEvents,
      consecutiveCacheReadEvents: decision.consecutiveCacheReadEvents,
      repeatedReadDetected:
        decision.appliedDelta.cacheReadTokens > 0
        && decision.consecutiveCacheReadEvents >= 2,
      observedAt: this.input.now?.() ?? new Date().toISOString(),
    };
    const evidence: RuntimeBudgetObservationEvidence = {
      ...digestPayload,
      observationDigest: observationDigestFor(digestPayload),
    };
    writeObservationAtomic(this.input.projectRoot, evidence);
    this.observationCount = observationIndex;
    this.lastObservationDigest = evidence.observationDigest;
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
  attemptId?: string;
  backend: string;
  budget?: ExecutionBudget;
  landingPolicy?: ExecutionLandingPolicyConfig;
  landingAlreadySatisfied?: boolean;
  counterScope?: RuntimeBudgetCounterScope;
  now?: () => string;
  onLandingRequested?: (evidence: RuntimeBudgetLandingEvidence) => void;
  onStop: (evidence: RuntimeBudgetStopEvidence) => void;
}): RuntimeBudgetMonitor | null {
  if (!hasLiveUsageCeiling(input.budget)) return null;
  return new RuntimeBudgetMonitor({
    projectRoot: input.projectRoot,
    taskId: input.taskId,
    ...(input.attemptId ? { attemptId: input.attemptId } : {}),
    backend: input.backend,
    budget: input.budget!,
    ...(input.landingPolicy ? { landingPolicy: input.landingPolicy } : {}),
    ...(input.landingAlreadySatisfied ? { landingAlreadySatisfied: true } : {}),
    ...(input.counterScope ? { counterScope: input.counterScope } : {}),
    ...(input.now ? { now: input.now } : {}),
    ...(input.onLandingRequested ? { onLandingRequested: input.onLandingRequested } : {}),
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
