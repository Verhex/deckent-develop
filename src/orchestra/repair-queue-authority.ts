import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { TASKS_DIR } from '../core/constants.js';

export const REPAIR_QUEUE_SCHEMA_VERSION = 1 as const;

export type RepairBirthClass =
  | 'FIX'
  | 'FIX_FIX'
  | 'CROSS_DEPENDENCY'
  | 'NOT_DISPATCHED_REDISPATCH';

export type RepairDispatchStatus = 'queued' | 'dispatched' | 'settled';

export interface RepairAttemptBinding {
  readonly attemptId: string;
  readonly ordinal: number;
  readonly parentTaskId?: string;
}

export interface RepairQueueRecord {
  readonly queueId: string;
  readonly taskId: string;
  readonly sprintId: string;
  readonly birthClass: RepairBirthClass;
  readonly admittedAt: string;
  readonly dispatchStatus: RepairDispatchStatus;
  readonly attempt: RepairAttemptBinding;
}

export interface RepairQueueAuthorityV1 {
  readonly schemaVersion: typeof REPAIR_QUEUE_SCHEMA_VERSION;
  readonly records: readonly RepairQueueRecord[];
}

export type RepairQueueAuthorityErrorCode =
  | 'MALFORMED_AUTHORITY'
  | 'QUEUE_ID_CONFLICT'
  | 'UNKNOWN_QUEUE_ID'
  | 'INVALID_TRANSITION';

export class RepairQueueAuthorityError extends Error {
  constructor(
    readonly code: RepairQueueAuthorityErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RepairQueueAuthorityError';
  }
}

export interface AdmitRepairQueueRecordInput {
  readonly taskId: string;
  /**
   * Owning run. A record only fences the run that admitted it: a leftover from
   * an aborted or paused run must never block a later run's quiescence gate.
   */
  readonly sprintId: string;
  readonly birthClass: RepairBirthClass;
  readonly admittedAt: string;
  readonly attempt: RepairAttemptBinding;
  readonly queueId?: string;
}

const BIRTH_CLASSES = new Set<RepairBirthClass>([
  'FIX',
  'FIX_FIX',
  'CROSS_DEPENDENCY',
  'NOT_DISPATCHED_REDISPATCH',
]);
const DISPATCH_STATUSES = new Set<RepairDispatchStatus>([
  'queued',
  'dispatched',
  'settled',
]);

export function repairQueueAuthorityPath(projectRoot: string): string {
  return join(projectRoot, TASKS_DIR, 'repair-queue-authority.json');
}

export function createRepairQueueId(
  input: Pick<AdmitRepairQueueRecordInput, 'taskId' | 'sprintId' | 'birthClass' | 'attempt'>,
): string {
  const identity = [
    input.sprintId,
    input.birthClass,
    input.taskId,
    input.attempt.attemptId,
    String(input.attempt.ordinal),
    input.attempt.parentTaskId ?? '',
  ].join('\0');
  return `repair-${createHash('sha256').update(identity).digest('hex')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownKeysExactly(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key))
    && keys.every(key => required.includes(key) || optional.includes(key));
}

function parseAttempt(value: unknown, path: string): RepairAttemptBinding {
  if (!isRecord(value)
    || !ownKeysExactly(value, ['attemptId', 'ordinal'], ['parentTaskId'])
    || typeof value.attemptId !== 'string'
    || value.attemptId.length === 0
    || !Number.isSafeInteger(value.ordinal)
    || (value.ordinal as number) < 1
    || (value.parentTaskId !== undefined
      && (typeof value.parentTaskId !== 'string' || value.parentTaskId.length === 0))) {
    throw new RepairQueueAuthorityError(
      'MALFORMED_AUTHORITY',
      `${path} is not a valid repair attempt binding`,
    );
  }
  return {
    attemptId: value.attemptId,
    ordinal: value.ordinal as number,
    ...(value.parentTaskId !== undefined
      ? { parentTaskId: value.parentTaskId as string }
      : {}),
  };
}

function parseQueueRecord(value: unknown, index: number): RepairQueueRecord {
  const path = `records[${index}]`;
  if (!isRecord(value)
    || !ownKeysExactly(value, [
      'queueId', 'taskId', 'sprintId', 'birthClass', 'admittedAt', 'dispatchStatus', 'attempt',
    ])
    || typeof value.queueId !== 'string'
    || value.queueId.length === 0
    || typeof value.taskId !== 'string'
    || value.taskId.length === 0
    || typeof value.sprintId !== 'string'
    || value.sprintId.length === 0
    || typeof value.birthClass !== 'string'
    || !BIRTH_CLASSES.has(value.birthClass as RepairBirthClass)
    || typeof value.admittedAt !== 'string'
    || !Number.isFinite(Date.parse(value.admittedAt))
    || typeof value.dispatchStatus !== 'string'
    || !DISPATCH_STATUSES.has(value.dispatchStatus as RepairDispatchStatus)) {
    throw new RepairQueueAuthorityError(
      'MALFORMED_AUTHORITY',
      `${path} is not a valid repair queue record`,
    );
  }
  return {
    queueId: value.queueId,
    taskId: value.taskId,
    sprintId: value.sprintId,
    birthClass: value.birthClass as RepairBirthClass,
    admittedAt: value.admittedAt,
    dispatchStatus: value.dispatchStatus as RepairDispatchStatus,
    attempt: parseAttempt(value.attempt, `${path}.attempt`),
  };
}

function parseAuthority(value: unknown): RepairQueueAuthorityV1 {
  if (!isRecord(value)
    || !ownKeysExactly(value, ['schemaVersion', 'records'])
    || value.schemaVersion !== REPAIR_QUEUE_SCHEMA_VERSION
    || !Array.isArray(value.records)) {
    throw new RepairQueueAuthorityError(
      'MALFORMED_AUTHORITY',
      'Repair queue authority has an unsupported or malformed envelope',
    );
  }
  const records = value.records.map(parseQueueRecord);
  if (new Set(records.map(record => record.queueId)).size !== records.length) {
    throw new RepairQueueAuthorityError(
      'MALFORMED_AUTHORITY',
      'Repair queue authority contains duplicate queueId values',
    );
  }
  return { schemaVersion: REPAIR_QUEUE_SCHEMA_VERSION, records };
}

export function readRepairQueueAuthority(projectRoot: string): RepairQueueAuthorityV1 {
  const path = repairQueueAuthorityPath(projectRoot);
  if (!existsSync(path)) {
    return { schemaVersion: REPAIR_QUEUE_SCHEMA_VERSION, records: [] };
  }
  try {
    return parseAuthority(JSON.parse(readFileSync(path, 'utf-8')) as unknown);
  } catch (error) {
    if (error instanceof RepairQueueAuthorityError) throw error;
    throw new RepairQueueAuthorityError(
      'MALFORMED_AUTHORITY',
      `Repair queue authority cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function writeAuthorityAtomic(
  projectRoot: string,
  authority: RepairQueueAuthorityV1,
): void {
  const path = repairQueueAuthorityPath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(authority, null, 2)}\n`, {
      encoding: 'utf-8',
      flag: 'wx',
    });
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temp file may not have been created or may already have been renamed.
    }
    throw error;
  }
}

function sameAdmission(
  left: RepairQueueRecord,
  right: RepairQueueRecord,
): boolean {
  return left.queueId === right.queueId
    && left.taskId === right.taskId
    && left.sprintId === right.sprintId
    && left.birthClass === right.birthClass
    && left.attempt.attemptId === right.attempt.attemptId
    && left.attempt.ordinal === right.attempt.ordinal
    && left.attempt.parentTaskId === right.attempt.parentTaskId;
}

export function admitRepairQueueRecord(
  projectRoot: string,
  input: AdmitRepairQueueRecordInput,
): RepairQueueRecord {
  const candidate = parseQueueRecord({
    queueId: input.queueId ?? createRepairQueueId(input),
    taskId: input.taskId,
    sprintId: input.sprintId,
    birthClass: input.birthClass,
    admittedAt: input.admittedAt,
    dispatchStatus: 'queued',
    attempt: input.attempt,
  }, 0);
  const authority = readRepairQueueAuthority(projectRoot);
  const existing = authority.records.find(record => record.queueId === candidate.queueId);
  if (existing) {
    if (sameAdmission(existing, candidate)) return existing;
    throw new RepairQueueAuthorityError(
      'QUEUE_ID_CONFLICT',
      `queueId ${candidate.queueId} is already bound to a different admission`,
    );
  }
  writeAuthorityAtomic(projectRoot, {
    schemaVersion: REPAIR_QUEUE_SCHEMA_VERSION,
    records: [...authority.records, candidate],
  });
  return candidate;
}

const STATUS_ORDER: Readonly<Record<RepairDispatchStatus, number>> = {
  queued: 0,
  dispatched: 1,
  settled: 2,
};

export function transitionRepairQueueRecord(
  projectRoot: string,
  queueId: string,
  dispatchStatus: RepairDispatchStatus,
): RepairQueueRecord {
  const authority = readRepairQueueAuthority(projectRoot);
  const index = authority.records.findIndex(record => record.queueId === queueId);
  if (index < 0) {
    throw new RepairQueueAuthorityError(
      'UNKNOWN_QUEUE_ID',
      `Repair queue record ${queueId} does not exist`,
    );
  }
  const current = authority.records[index]!;
  if (current.dispatchStatus === dispatchStatus) return current;
  if (STATUS_ORDER[dispatchStatus] !== STATUS_ORDER[current.dispatchStatus] + 1) {
    throw new RepairQueueAuthorityError(
      'INVALID_TRANSITION',
      `Repair queue record ${queueId} cannot transition from ${current.dispatchStatus} to ${dispatchStatus}`,
    );
  }
  const updated: RepairQueueRecord = { ...current, dispatchStatus };
  const records = [...authority.records];
  records[index] = updated;
  writeAuthorityAtomic(projectRoot, {
    schemaVersion: REPAIR_QUEUE_SCHEMA_VERSION,
    records,
  });
  return updated;
}
