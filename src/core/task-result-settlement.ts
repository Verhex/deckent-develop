import { createHash, randomUUID } from 'node:crypto';
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
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

import { deckentPath } from './state-paths.js';

export const TASK_RESULT_SETTLEMENT_SCHEMA_VERSION = 1 as const;
export const TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION = 1 as const;

export interface TaskResultSettlementRefV1 {
  schemaVersion: typeof TASK_RESULT_SETTLEMENT_SCHEMA_VERSION;
  taskId: string;
  backend: 'docker';
  projectRootSha256: string;
  attemptId: string;
}

export interface TaskResultSettlementAttemptV1 extends TaskResultSettlementRefV1 {
  state: 'pending';
  createdAt: string;
}

export interface TaskResultSettlementActiveClaimV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'claimed';
  claimedAt: string;
  previousClosureSha256: string | null;
}

export interface TaskResultSettlementPreparedV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'prepared';
  preparedAt: string;
  containerName: string;
  model: string;
  labels: Readonly<Record<string, string>>;
}

export interface TaskResultSettlementDispatchV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'dispatched';
  dispatchedAt: string;
  containerName: string;
  containerId: string;
  model: string;
  labels: Readonly<Record<string, string>>;
  preparedSha256: string;
}

export interface TaskResultSettlementClosureV1 extends TaskResultSettlementRefV1 {
  lifecycleVersion: typeof TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION;
  state: 'closed';
  closedAt: string;
  settlementSha256: string;
  containerDisposition: 'not-dispatched' | 'stopped-removed' | 'absent-after-exit';
  locksReleased: true;
  evidenceRef?: string;
}

export interface TaskResultSettlementV1 extends TaskResultSettlementRefV1 {
  state: 'settled';
  settledAt: string;
  exitCode: number | null;
  resultSha256: string;
  result: Record<string, unknown>;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const DOCKER_CONTAINER_PREFIX = 'deckent-w-';
export const DOCKER_ATTEMPT_LABELS = Object.freeze({
  managed: 'io.deckent.managed',
  project: 'io.deckent.project',
  task: 'io.deckent.task',
  attempt: 'io.deckent.attempt',
} as const);

export function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function dockerContainerNameFromAuthority(projectRootSha256: string, taskId: string): string {
  return `${DOCKER_CONTAINER_PREFIX}${projectRootSha256.slice(0, 12)}-${sha256(taskId).slice(0, 16)}`;
}

/** Docker names are daemon-global, so project and task authority both participate. */
export function dockerContainerNameForTask(projectRoot: string, taskId: string): string {
  return dockerContainerNameFromAuthority(
    sha256(canonicalProjectRoot(projectRoot)),
    taskId,
  );
}

export function dockerAttemptLabels(
  ref: TaskResultSettlementRefV1,
): Readonly<Record<string, string>> {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw new Error('Invalid Docker result settlement reference');
  }
  return Object.freeze({
    [DOCKER_ATTEMPT_LABELS.managed]: 'true',
    [DOCKER_ATTEMPT_LABELS.project]: ref.projectRootSha256,
    [DOCKER_ATTEMPT_LABELS.task]: sha256(ref.taskId),
    [DOCKER_ATTEMPT_LABELS.attempt]: ref.attemptId,
  });
}

function settlementProjectDir(projectRootSha256: string): string {
  return deckentPath(undefined, 'runtime', 'task-result-settlements', projectRootSha256);
}

function settlementTaskDir(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementProjectDir(ref.projectRootSha256), sha256(ref.taskId));
}

function settlementAttemptDir(ref: TaskResultSettlementRefV1): string {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw new Error('Invalid Docker result settlement reference');
  }
  return resolve(settlementTaskDir(ref), ref.attemptId);
}

function canonicalPathWithMissingLeaf(path: string): string {
  let existing = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) break;
    suffix.unshift(basename(existing));
    existing = parent;
  }
  let canonicalExisting: string;
  try { canonicalExisting = realpathSync.native(existing); } catch { canonicalExisting = existing; }
  return resolve(canonicalExisting, ...suffix);
}

function assertHostAuthorityOutsideProject(projectRoot: string, ref: TaskResultSettlementRefV1): void {
  const root = canonicalProjectRoot(projectRoot);
  const attemptDir = canonicalPathWithMissingLeaf(settlementAttemptDir(ref));
  const rel = relative(root, attemptDir);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(
      `Docker result settlement authority must be outside the worker-mounted project root: ${attemptDir}`,
    );
  }
}

export function createTaskResultSettlementRef(
  projectRoot: string,
  taskId: string,
): TaskResultSettlementRefV1 {
  const ref = Object.freeze({
    schemaVersion: TASK_RESULT_SETTLEMENT_SCHEMA_VERSION,
    taskId,
    backend: 'docker' as const,
    projectRootSha256: sha256(canonicalProjectRoot(projectRoot)),
    attemptId: randomUUID(),
  });
  assertHostAuthorityOutsideProject(projectRoot, ref);
  return ref;
}

export function assertTaskResultSettlementRef(
  projectRoot: string,
  taskId: string,
  ref: TaskResultSettlementRefV1,
): void {
  if (
    !hasValidRefShape(ref as unknown as Record<string, unknown>)
    || ref.taskId !== taskId
    || ref.projectRootSha256 !== sha256(canonicalProjectRoot(projectRoot))
  ) {
    throw new Error('Docker result settlement reference does not match project/task authority');
  }
  assertHostAuthorityOutsideProject(projectRoot, ref);
}

export function taskResultSettlementAttemptPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'attempt.json');
}

export function taskResultSettlementPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'settled.json');
}

export function taskResultSettlementPreparedPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'prepared.json');
}

export function taskResultSettlementDispatchPath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'dispatch.json');
}

export function taskResultSettlementClosurePath(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementAttemptDir(ref), 'closure.json');
}

function taskResultSettlementClaimsDir(ref: TaskResultSettlementRefV1): string {
  return resolve(settlementTaskDir(ref), 'claims');
}

export function taskResultSettlementClaimPath(
  ref: TaskResultSettlementRefV1,
  previousClosureSha256: string | null = null,
): string {
  if (previousClosureSha256 !== null && !/^[a-f0-9]{64}$/.test(previousClosureSha256)) {
    throw new Error('Invalid Docker result settlement closure digest');
  }
  return resolve(
    taskResultSettlementClaimsDir(ref),
    previousClosureSha256 === null ? 'root.json' : `${previousClosureSha256}.json`,
  );
}

function resultDigest(result: Record<string, unknown>): string {
  return sha256(JSON.stringify(result));
}

function sameRef(record: TaskResultSettlementRefV1, ref: TaskResultSettlementRefV1): boolean {
  return record.schemaVersion === ref.schemaVersion
    && record.taskId === ref.taskId
    && record.backend === ref.backend
    && record.projectRootSha256 === ref.projectRootSha256
    && record.attemptId === ref.attemptId;
}

function hasValidRefShape(record: Record<string, unknown>): boolean {
  return record.schemaVersion === TASK_RESULT_SETTLEMENT_SCHEMA_VERSION
    && typeof record.taskId === 'string'
    && record.taskId.length > 0
    && record.backend === 'docker'
    && typeof record.projectRootSha256 === 'string'
    && /^[a-f0-9]{64}$/.test(record.projectRootSha256)
    && typeof record.attemptId === 'string'
    && /^[0-9a-f-]{36}$/i.test(record.attemptId);
}

function hasExactAttemptLabels(
  value: unknown,
  ref: TaskResultSettlementRefV1,
): value is Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const labels = value as Record<string, unknown>;
  const expected = dockerAttemptLabels(ref);
  return Object.keys(labels).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, expectedValue]) => labels[key] === expectedValue);
}

function hasValidContainerIdentity(
  record: Record<string, unknown>,
  ref: TaskResultSettlementRefV1,
): boolean {
  return record.containerName === dockerContainerNameFromAuthority(ref.projectRootSha256, ref.taskId)
    && typeof record.model === 'string'
    && record.model.length > 0
    && hasExactAttemptLabels(record.labels, ref);
}

export function createTaskResultSettlement(input: {
  ref: TaskResultSettlementRefV1;
  exitCode: number | null;
  result: Record<string, unknown>;
  settledAt?: string;
}): TaskResultSettlementV1 {
  if (input.result.taskId !== input.ref.taskId) {
    throw new Error('Docker result settlement TaskResult does not match its attempt taskId');
  }
  return {
    ...input.ref,
    state: 'settled',
    settledAt: input.settledAt ?? new Date().toISOString(),
    exitCode: input.exitCode,
    resultSha256: resultDigest(input.result),
    result: input.result,
  };
}

export function parseTaskResultSettlementAttempt(
  value: unknown,
): TaskResultSettlementAttemptV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.state !== 'pending'
    || typeof record.createdAt !== 'string'
  ) return null;
  return record as unknown as TaskResultSettlementAttemptV1;
}

export function parseTaskResultSettlementActiveClaim(
  value: unknown,
): TaskResultSettlementActiveClaimV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'claimed'
    || typeof record.claimedAt !== 'string'
    || (record.previousClosureSha256 !== null
      && (typeof record.previousClosureSha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(record.previousClosureSha256)))
  ) return null;
  return record as unknown as TaskResultSettlementActiveClaimV1;
}

export function parseTaskResultSettlementPrepared(
  value: unknown,
): TaskResultSettlementPreparedV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ref = record as unknown as TaskResultSettlementRefV1;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'prepared'
    || typeof record.preparedAt !== 'string'
    || !hasValidContainerIdentity(record, ref)
  ) return null;
  return record as unknown as TaskResultSettlementPreparedV1;
}

export function parseTaskResultSettlementDispatch(
  value: unknown,
): TaskResultSettlementDispatchV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const ref = record as unknown as TaskResultSettlementRefV1;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'dispatched'
    || typeof record.dispatchedAt !== 'string'
    || typeof record.containerId !== 'string'
    || !/^[a-f0-9]{64}$/i.test(record.containerId)
    || typeof record.preparedSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.preparedSha256)
    || !hasValidContainerIdentity(record, ref)
  ) return null;
  return record as unknown as TaskResultSettlementDispatchV1;
}

export function parseTaskResultSettlementClosure(
  value: unknown,
): TaskResultSettlementClosureV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.lifecycleVersion !== TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION
    || record.state !== 'closed'
    || typeof record.closedAt !== 'string'
    || typeof record.settlementSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.settlementSha256)
    || !['not-dispatched', 'stopped-removed', 'absent-after-exit'].includes(String(record.containerDisposition))
    || record.locksReleased !== true
    || (record.evidenceRef !== undefined && typeof record.evidenceRef !== 'string')
  ) return null;
  return record as unknown as TaskResultSettlementClosureV1;
}

export function parseTaskResultSettlement(value: unknown): TaskResultSettlementV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    !hasValidRefShape(record)
    || record.state !== 'settled'
    || typeof record.settledAt !== 'string'
    || (record.exitCode !== null && (typeof record.exitCode !== 'number' || !Number.isInteger(record.exitCode)))
    || typeof record.resultSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(record.resultSha256)
    || !record.result
    || typeof record.result !== 'object'
    || Array.isArray(record.result)
    || (record.result as Record<string, unknown>).taskId !== record.taskId
    || record.resultSha256 !== resultDigest(record.result as Record<string, unknown>)
  ) return null;
  return record as unknown as TaskResultSettlementV1;
}

function publishJsonFirstWriter(
  path: string,
  value: unknown,
  acceptsExisting: (existing: unknown) => boolean,
): void {
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  let published = false;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
    const fileFd = openSync(tmp, 'r');
    try { fsyncSync(fileFd); } finally { closeSync(fileFd); }
    try {
      linkSync(tmp, path);
      published = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      let existing: unknown;
      try { existing = JSON.parse(readFileSync(path, 'utf-8')); } catch { existing = null; }
      if (!acceptsExisting(existing)) {
        throw new Error(`Conflicting immutable Docker result settlement already exists: ${path}`);
      }
    }
    if (published) {
      try {
        const dirFd = openSync(parent, 'r');
        try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      } catch { /* directory fsync is unsupported on some platforms */ }
    }
  } finally {
    try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
  }
}

/** Persist the exact attempt before any provider/backend side effect. */
export function writeTaskResultSettlementAttemptAtomic(
  ref: TaskResultSettlementRefV1,
  createdAt: string = new Date().toISOString(),
): void {
  const attempt: TaskResultSettlementAttemptV1 = { ...ref, state: 'pending', createdAt };
  publishJsonFirstWriter(
    taskResultSettlementAttemptPath(ref),
    attempt,
    (existing) => {
      const parsed = parseTaskResultSettlementAttempt(existing);
      return parsed !== null && sameRef(parsed, ref);
    },
  );
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

function closureDigest(closure: TaskResultSettlementClosureV1): string {
  return sha256(JSON.stringify(closure));
}

function preparedDigest(prepared: TaskResultSettlementPreparedV1): string {
  return sha256(JSON.stringify(prepared));
}

export function readTaskResultSettlementClosure(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementClosureV1 | null {
  const closure = parseTaskResultSettlementClosure(readJson(taskResultSettlementClosurePath(ref)));
  if (!closure || !sameRef(closure, ref)) return null;
  const settlement = readTaskResultSettlement(ref);
  return settlement && closure.settlementSha256 === sha256(JSON.stringify(settlement))
    ? closure
    : null;
}

function resolveTaskResultSettlementClaimChain(
  ref: TaskResultSettlementRefV1,
): {
  active: TaskResultSettlementActiveClaimV1 | null;
  latest: TaskResultSettlementActiveClaimV1 | null;
  nextPreviousClosureSha256: string | null;
  closedAttemptIds: ReadonlySet<string>;
} {
  let previousClosureSha256: string | null = null;
  let latest: TaskResultSettlementActiveClaimV1 | null = null;
  const closedAttemptIds = new Set<string>();
  const seenClaimPaths = new Set<string>();
  for (let depth = 0; depth < 1024; depth++) {
    const claimPath = taskResultSettlementClaimPath(ref, previousClosureSha256);
    if (seenClaimPaths.has(claimPath)) {
      throw new Error(`Cyclic Docker result settlement claim chain: ${claimPath}`);
    }
    seenClaimPaths.add(claimPath);
    if (!existsSync(claimPath)) {
      return { active: null, latest, nextPreviousClosureSha256: previousClosureSha256, closedAttemptIds };
    }
    const claim = parseTaskResultSettlementActiveClaim(readJson(claimPath));
    if (
      !claim
      || claim.projectRootSha256 !== ref.projectRootSha256
      || claim.taskId !== ref.taskId
      || claim.previousClosureSha256 !== previousClosureSha256
    ) {
      throw new Error(`Corrupt Docker result settlement claim chain: ${claimPath}`);
    }
    latest = claim;
    const closurePath = taskResultSettlementClosurePath(claim);
    if (!existsSync(closurePath)) {
      return { active: claim, latest, nextPreviousClosureSha256: previousClosureSha256, closedAttemptIds };
    }
    const closure = readTaskResultSettlementClosure(claim);
    if (!closure) {
      throw new Error(`Corrupt Docker result settlement closure: ${closurePath}`);
    }
    closedAttemptIds.add(claim.attemptId);
    previousClosureSha256 = closureDigest(closure);
  }
  throw new Error('Docker result settlement claim chain exceeds the bounded recovery depth');
}

export function readTaskResultSettlementActiveClaim(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementActiveClaimV1 | null {
  return resolveTaskResultSettlementClaimChain(ref).active;
}

/**
 * Resolve the exact host-owned lifecycle authority for one canonical project/task.
 * Active execution wins; after closure the immutable tail remains discoverable so
 * restart-time consumers do not need an in-memory settlementRef or raw `.result`.
 */
export function readLatestTaskResultSettlementRef(
  projectRoot: string,
  taskId: string,
): TaskResultSettlementRefV1 | null {
  const probe = createTaskResultSettlementRef(projectRoot, taskId);
  const chain = resolveTaskResultSettlementClaimChain(probe);
  const latest = chain.active ?? chain.latest;
  if (!latest) return null;
  assertTaskResultSettlementRef(projectRoot, taskId, latest);
  const attempt = parseTaskResultSettlementAttempt(
    readJson(taskResultSettlementAttemptPath(latest)),
  );
  if (!attempt || !sameRef(attempt, latest)) {
    throw new Error(
      `Corrupt Docker result settlement authority: ${taskResultSettlementAttemptPath(latest)}`,
    );
  }
  return Object.freeze({
    schemaVersion: latest.schemaVersion,
    taskId: latest.taskId,
    backend: latest.backend,
    projectRootSha256: latest.projectRootSha256,
    attemptId: latest.attemptId,
  });
}

/**
 * Claim the daemon-global project/task execution slot before any Docker side effect.
 * The claim chain is append-only. A closed claim's immutable digest selects the
 * next first-writer-wins slot, so no actor ever unlinks a newer owner's claim.
 */
export function claimTaskResultSettlementAttemptAtomic(
  ref: TaskResultSettlementRefV1,
  claimedAt: string = new Date().toISOString(),
): void {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw new Error('Invalid Docker result settlement reference');
  }
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  if (!attempt || !sameRef(attempt, ref)) {
    throw new Error('Docker result settlement claim has no matching durable pending attempt');
  }
  const chain = resolveTaskResultSettlementClaimChain(ref);
  if (chain.closedAttemptIds.has(ref.attemptId)) return;
  if (chain.active) {
    if (sameRef(chain.active, ref)) return;
    throw new Error(
      `Conflicting active Docker result settlement attempt: ${chain.active.taskId}/${chain.active.attemptId}`,
    );
  }

  const claim: TaskResultSettlementActiveClaimV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'claimed',
    claimedAt,
    previousClosureSha256: chain.nextPreviousClosureSha256,
  };
  publishJsonFirstWriter(
    taskResultSettlementClaimPath(ref, chain.nextPreviousClosureSha256),
    claim,
    (existing) => {
      const parsed = parseTaskResultSettlementActiveClaim(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.previousClosureSha256 === chain.nextPreviousClosureSha256;
    },
  );
}

function assertPendingAttemptAndClaim(ref: TaskResultSettlementRefV1): void {
  const attempt = parseTaskResultSettlementAttempt(readJson(taskResultSettlementAttemptPath(ref)));
  const claim = readTaskResultSettlementActiveClaim(ref);
  if (!attempt || !sameRef(attempt, ref) || !claim || !sameRef(claim, ref)) {
    throw new Error('Docker dispatch metadata has no matching durable pending attempt claim');
  }
}

export function writeTaskResultSettlementPreparedAtomic(
  ref: TaskResultSettlementRefV1,
  model: string,
  preparedAt: string = new Date().toISOString(),
): TaskResultSettlementPreparedV1 {
  assertPendingAttemptAndClaim(ref);
  if (!model.trim()) throw new Error('Docker dispatch model identity must be non-empty');
  const prepared: TaskResultSettlementPreparedV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'prepared',
    preparedAt,
    containerName: dockerContainerNameFromAuthority(ref.projectRootSha256, ref.taskId),
    model,
    labels: dockerAttemptLabels(ref),
  };
  publishJsonFirstWriter(
    taskResultSettlementPreparedPath(ref),
    prepared,
    (existing) => {
      const parsed = parseTaskResultSettlementPrepared(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.model === prepared.model
        && parsed.containerName === prepared.containerName;
    },
  );
  return prepared;
}

export function readTaskResultSettlementPrepared(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementPreparedV1 | null {
  const prepared = parseTaskResultSettlementPrepared(readJson(taskResultSettlementPreparedPath(ref)));
  return prepared && sameRef(prepared, ref) ? prepared : null;
}

export function writeTaskResultSettlementDispatchAtomic(
  ref: TaskResultSettlementRefV1,
  containerId: string,
  dispatchedAt: string = new Date().toISOString(),
): TaskResultSettlementDispatchV1 {
  assertPendingAttemptAndClaim(ref);
  const prepared = readTaskResultSettlementPrepared(ref);
  if (!prepared) throw new Error('Docker dispatch has no matching immutable prepared metadata');
  const dispatch: TaskResultSettlementDispatchV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'dispatched',
    dispatchedAt,
    containerName: prepared.containerName,
    containerId,
    model: prepared.model,
    labels: prepared.labels,
    preparedSha256: preparedDigest(prepared),
  };
  if (!parseTaskResultSettlementDispatch(dispatch)) {
    throw new Error('Invalid Docker dispatch container identity');
  }
  publishJsonFirstWriter(
    taskResultSettlementDispatchPath(ref),
    dispatch,
    (existing) => {
      const parsed = parseTaskResultSettlementDispatch(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.containerId === dispatch.containerId
        && parsed.containerName === dispatch.containerName;
    },
  );
  return dispatch;
}

export function readTaskResultSettlementDispatch(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementDispatchV1 | null {
  const dispatch = parseTaskResultSettlementDispatch(readJson(taskResultSettlementDispatchPath(ref)));
  if (!dispatch || !sameRef(dispatch, ref)) return null;
  const prepared = readTaskResultSettlementPrepared(ref);
  return prepared && dispatch.preparedSha256 === preparedDigest(prepared) ? dispatch : null;
}

/** Host-global, attempt-bound receipt; Docker workers never mount this state root. */
export function writeTaskResultSettlementAtomic(settlement: TaskResultSettlementV1): void {
  const existingSettlement = readTaskResultSettlement(settlement);
  if (
    existingSettlement
    && existingSettlement.exitCode === settlement.exitCode
    && existingSettlement.resultSha256 === settlement.resultSha256
  ) return;
  let attempt: TaskResultSettlementAttemptV1 | null = null;
  try {
    attempt = parseTaskResultSettlementAttempt(
      JSON.parse(readFileSync(taskResultSettlementAttemptPath(settlement), 'utf-8')),
    );
  } catch { /* handled by the fail-closed branch below */ }
  if (!attempt || !sameRef(attempt, settlement)) {
    throw new Error('Docker result settlement has no matching durable pending attempt');
  }
  if (existsSync(taskResultSettlementClaimsDir(settlement))) {
    const active = readTaskResultSettlementActiveClaim(settlement);
    if (!active || !sameRef(active, settlement)) {
      throw new Error('Docker result settlement attempt does not own the active lifecycle claim');
    }
  }
  publishJsonFirstWriter(
    taskResultSettlementPath(settlement),
    settlement,
    (existing) => {
      const parsed = parseTaskResultSettlement(existing);
      return parsed !== null
        && sameRef(parsed, settlement)
        && parsed.exitCode === settlement.exitCode
        && parsed.resultSha256 === settlement.resultSha256;
    },
  );
}

export function readTaskResultSettlement(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementV1 | null {
  const path = taskResultSettlementPath(ref);
  if (!existsSync(path)) return null;
  try {
    const settlement = parseTaskResultSettlement(JSON.parse(readFileSync(path, 'utf-8')));
    return settlement && sameRef(settlement, ref) ? settlement : null;
  } catch {
    return null;
  }
}

/**
 * Read a terminal product result only after the host-owned lifecycle closure
 * proves that container disposition and lock release completed for the exact
 * immutable receipt. Recovery code intentionally uses the raw receipt reader;
 * user-facing/result consumers must use this closed authority.
 */
export function readClosedTaskResultSettlement(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementV1 | null {
  const settlementPath = taskResultSettlementPath(ref);
  const closurePath = taskResultSettlementClosurePath(ref);
  const settlementExists = existsSync(settlementPath);
  const closureExists = existsSync(closurePath);

  if (!settlementExists) {
    if (closureExists) {
      throw new Error(`Corrupt Docker result settlement closure without receipt: ${closurePath}`);
    }
    return null;
  }
  const settlement = readTaskResultSettlement(ref);
  if (!settlement) {
    throw new Error(`Corrupt host-owned Docker result settlement: ${settlementPath}`);
  }
  if (!closureExists) return null;
  if (!readTaskResultSettlementClosure(ref)) {
    throw new Error(`Corrupt Docker result settlement closure: ${closurePath}`);
  }
  return settlement;
}

export function writeTaskResultSettlementClosureAtomic(
  ref: TaskResultSettlementRefV1,
  input: {
    containerDisposition: TaskResultSettlementClosureV1['containerDisposition'];
    locksReleased: true;
    evidenceRef?: string;
    closedAt?: string;
  },
): TaskResultSettlementClosureV1 {
  const existingClosure = readTaskResultSettlementClosure(ref);
  if (existingClosure) {
    if (
      existingClosure.containerDisposition === input.containerDisposition
      && existingClosure.locksReleased === input.locksReleased
      && existingClosure.evidenceRef === input.evidenceRef
    ) return existingClosure;
    throw new Error(`Conflicting immutable Docker result settlement already exists: ${taskResultSettlementClosurePath(ref)}`);
  }
  const active = readTaskResultSettlementActiveClaim(ref);
  if (!active || !sameRef(active, ref)) {
    throw new Error('Cannot close a foreign or inactive Docker result settlement claim');
  }
  const settlement = readTaskResultSettlement(ref);
  if (!settlement) {
    throw new Error('Cannot close an unsettled Docker result settlement claim');
  }
  const closure: TaskResultSettlementClosureV1 = {
    ...ref,
    lifecycleVersion: TASK_RESULT_SETTLEMENT_LIFECYCLE_VERSION,
    state: 'closed',
    closedAt: input.closedAt ?? new Date().toISOString(),
    settlementSha256: sha256(JSON.stringify(settlement)),
    containerDisposition: input.containerDisposition,
    locksReleased: input.locksReleased,
    ...(input.evidenceRef ? { evidenceRef: input.evidenceRef } : {}),
  };
  publishJsonFirstWriter(
    taskResultSettlementClosurePath(ref),
    closure,
    (existing) => {
      const parsed = parseTaskResultSettlementClosure(existing);
      return parsed !== null
        && sameRef(parsed, ref)
        && parsed.settlementSha256 === closure.settlementSha256
        && parsed.containerDisposition === closure.containerDisposition
        && parsed.locksReleased === true;
    },
  );
  return closure;
}

export interface PendingTaskResultSettlementAttemptV1 {
  attempt: TaskResultSettlementAttemptV1;
  claim: TaskResultSettlementActiveClaimV1 | null;
  prepared: TaskResultSettlementPreparedV1 | null;
  dispatch: TaskResultSettlementDispatchV1 | null;
  settlement: TaskResultSettlementV1 | null;
}

/**
 * Enumerate unsettled attempts for exactly one canonical project. Directory names
 * are never trusted; every record is parsed and matched back to its embedded ref.
 */
export function listPendingTaskResultSettlementAttempts(
  projectRoot: string,
): PendingTaskResultSettlementAttemptV1[] {
  const projectRootSha256 = sha256(canonicalProjectRoot(projectRoot));
  const projectDir = settlementProjectDir(projectRootSha256);
  if (!existsSync(projectDir)) return [];

  const pending: PendingTaskResultSettlementAttemptV1[] = [];
  for (const taskDirName of readdirSync(projectDir)) {
    const taskDir = resolve(projectDir, taskDirName);
    let attemptNames: string[];
    try { attemptNames = readdirSync(taskDir); } catch { continue; }
    for (const attemptName of attemptNames) {
      if (attemptName === 'claims') continue;
      const attemptPath = resolve(taskDir, attemptName, 'attempt.json');
      const attempt = parseTaskResultSettlementAttempt(readJson(attemptPath));
      const looksLikeAttempt = /^[0-9a-f-]{36}$/i.test(attemptName);
      if (looksLikeAttempt && !attempt) {
        throw new Error(`Corrupt Docker result settlement attempt: ${attemptPath}`);
      }
      if (
        !attempt
        || attempt.projectRootSha256 !== projectRootSha256
        || sha256(attempt.taskId) !== taskDirName
        || attempt.attemptId !== attemptName
      ) continue;
      if (existsSync(taskResultSettlementClosurePath(attempt))) {
        const closure = readTaskResultSettlementClosure(attempt);
        if (!closure) throw new Error(`Corrupt Docker result settlement closure: ${taskResultSettlementClosurePath(attempt)}`);
        continue;
      }
      const claim = readTaskResultSettlementActiveClaim(attempt);
      pending.push({
        attempt,
        claim: claim && sameRef(claim, attempt) ? claim : null,
        prepared: readTaskResultSettlementPrepared(attempt),
        dispatch: readTaskResultSettlementDispatch(attempt),
        settlement: readTaskResultSettlement(attempt),
      });
    }
  }
  return pending.sort((a, b) => (
    a.attempt.createdAt.localeCompare(b.attempt.createdAt)
      || a.attempt.attemptId.localeCompare(b.attempt.attemptId)
  ));
}
