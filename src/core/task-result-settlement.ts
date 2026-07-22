import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

import { deckentPath } from './state-paths.js';

export const TASK_RESULT_SETTLEMENT_SCHEMA_VERSION = 1 as const;

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

export function canonicalProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function settlementAttemptDir(ref: TaskResultSettlementRefV1): string {
  if (!hasValidRefShape(ref as unknown as Record<string, unknown>)) {
    throw new Error('Invalid Docker result settlement reference');
  }
  return deckentPath(
    undefined,
    'runtime',
    'task-result-settlements',
    ref.projectRootSha256,
    sha256(ref.taskId),
    ref.attemptId,
  );
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

/** Host-global, attempt-bound receipt; Docker workers never mount this state root. */
export function writeTaskResultSettlementAtomic(settlement: TaskResultSettlementV1): void {
  let attempt: TaskResultSettlementAttemptV1 | null = null;
  try {
    attempt = parseTaskResultSettlementAttempt(
      JSON.parse(readFileSync(taskResultSettlementAttemptPath(settlement), 'utf-8')),
    );
  } catch { /* handled by the fail-closed branch below */ }
  if (!attempt || !sameRef(attempt, settlement)) {
    throw new Error('Docker result settlement has no matching durable pending attempt');
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
