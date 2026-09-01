import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  writeSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { types as nodeTypes } from 'node:util';

import { readTask } from '../agents/worker.js';
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';
import { TASKS_DIR } from '../core/constants.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import {
  withExecutionLockOutcome,
  type ExecutionLockOperationOutcome,
  type ExecutionLockOptions,
} from '../core/file-lock.js';
import { normalizeTaskResultShape } from '../core/task-result-schema.js';
import {
  assertTaskResultSettlementRef,
  readClosedTaskResultSettlement,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { taskStatusForTerminalResult } from '../core/task-terminal-outcome.js';
import type { Task, TaskResult } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { debugLog } from '../core/utils.js';
import type {
  ExactAuthoritativeTaskResult,
  ExactTaskResultAuthorityMetadata,
} from './task-result-authority.js';

const EXACT_PROJECTION_KIND = 'exact-task-settlement-projection-v2' as const;
const MAX_PUBLIC_RESULT_PROJECTION_BYTES = 1024 * 1024;

export interface ExactTaskSettlementProjectionV2 {
  readonly schemaVersion: 2;
  readonly kind: typeof EXACT_PROJECTION_KIND;
  readonly identity: ExactTaskResultAuthorityMetadata['identity'];
  readonly admissionReceiptDigest: ExactTaskResultAuthorityMetadata['admissionReceiptDigest'];
  readonly settlementRef: ExactTaskResultAuthorityMetadata['settlementRef'];
  readonly settlementDigest: ExactTaskResultAuthorityMetadata['settlementDigest'];
  readonly resultDigest: ExactTaskResultAuthorityMetadata['resultDigest'];
  readonly chain: {
    readonly acceptedResultChainDigest: ExactTaskResultAuthorityMetadata['acceptedResultChainDigest'];
    readonly evaluationChainDigest: ExactTaskResultAuthorityMetadata['evaluationChainDigest'];
    readonly finalizerChainDigest: ExactTaskResultAuthorityMetadata['finalizerChainDigest'];
  };
  readonly evaluation: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  readonly status: TaskStatus.DONE | TaskStatus.NO_GO;
}

/** Downstream T11/T10 authority. A bare evaluator callback is never sufficient. */
export interface ExactTaskTerminalDecisionAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-task-terminal-decision-authority-v2';
  readonly identity: ExactTaskResultAuthorityMetadata['identity'];
  /** T11-parsed immutable receipt; the revalidator below is its authority port. */
  readonly evaluationReceipt: {
    readonly verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
    readonly artifactReceiptDigest: ExactTaskResultAuthorityMetadata['evaluationArtifact']['artifactReceiptDigest'];
    readonly artifactSha256: ExactTaskResultAuthorityMetadata['evaluationArtifact']['artifactSha256'];
    readonly byteLength: number;
    readonly chainDigest: ExactTaskResultAuthorityMetadata['evaluationChainDigest'];
  };
  readonly finalizerReceipt: {
    readonly state: 'terminal-ready';
    readonly artifactReceiptDigest: ExactTaskResultAuthorityMetadata['finalizerArtifact']['artifactReceiptDigest'];
    readonly artifactSha256: ExactTaskResultAuthorityMetadata['finalizerArtifact']['artifactSha256'];
    readonly byteLength: number;
    readonly chainDigest: ExactTaskResultAuthorityMetadata['finalizerChainDigest'];
  };
}

export interface ExactTaskSettlementProjectionResult {
  readonly decision: 'applied' | 'repaired' | 'idempotent';
  readonly status: TaskStatus.DONE | TaskStatus.NO_GO;
  readonly projection: ExactTaskSettlementProjectionV2;
}

export type ExactTaskResultProjectionAuthorityValidation =
  | {
      readonly state: 'current';
      readonly authority: ExactTaskResultAuthorityMetadata;
      readonly decisionAuthority: ExactTaskTerminalDecisionAuthorityV2;
      /** Host-inspected compatible snapshot of the exact canonical result. */
      readonly canonicalCompatibleResult: ExactAuthoritativeTaskResult<TaskResult>;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: string;
    };

export type RevalidateExactTaskResultProjectionAuthority = (input: {
  readonly taskId: string;
  readonly expectedAuthority: ExactTaskResultAuthorityMetadata;
  readonly expectedDecisionAuthority: ExactTaskTerminalDecisionAuthorityV2;
}) => ExactTaskResultProjectionAuthorityValidation
  | Promise<ExactTaskResultProjectionAuthorityValidation>;

export interface ExactTaskSettlementProjectionOptions {
  /**
   * Mandatory T11/T10 authority resolver. It must re-read and parse the
   * immutable evaluation/finalizer artifacts bound by the settlement; merely
   * echoing the caller's structurally valid verdict is not decision authority.
   */
  readonly revalidateAuthority: RevalidateExactTaskResultProjectionAuthority;
  /** Narrow deterministic fault seam; production always uses the canonical runner. */
  readonly lockOutcomeRunner?: typeof withExecutionLockOutcome;
  /** Canonical execution-lock test seams only; not an alternate lock authority. */
  readonly executionLockOptions?: ExecutionLockOptions;
}

type ExactProjectedTask = Task & {
  exactSettlementProjection?: ExactTaskSettlementProjectionV2;
};

type ExactProjectedResult = TaskResult & {
  exactSettlementAuthority: ExactTaskResultAuthorityMetadata;
  exactSettlementProjection?: ExactTaskSettlementProjectionV2;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failProjection(taskId: string, reason: string): never {
  throw createExecutionAuthorityError(
    `Task ${taskId} exact settlement projection HOLD: ${reason}`,
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface PlainDataBudget {
  nodes: number;
  keys: number;
  stringBytes: number;
  active: WeakSet<object>;
}

const PROJECTION_MAX_PLAIN_DEPTH = 16;
const PROJECTION_MAX_PLAIN_NODES = 16_384;
const PROJECTION_MAX_OBJECT_KEYS = 512;
const PROJECTION_MAX_ARRAY_LENGTH = 4096;
const PROJECTION_MAX_TOTAL_KEYS = 16_384;
const PROJECTION_MAX_STRING_BYTES = 64 * 1024;
const PROJECTION_MAX_TOTAL_STRING_BYTES = MAX_PUBLIC_RESULT_PROJECTION_BYTES;

function consumeProjectionString(value: string, budget: PlainDataBudget): boolean {
  if (value.length > PROJECTION_MAX_STRING_BYTES) return false;
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > PROJECTION_MAX_STRING_BYTES) return false;
  budget.stringBytes += bytes;
  return budget.stringBytes <= PROJECTION_MAX_TOTAL_STRING_BYTES;
}

function isBoundedPlainData(
  value: unknown,
  depth = 0,
  budget: PlainDataBudget = {
    nodes: 0,
    keys: 0,
    stringBytes: 0,
    active: new WeakSet<object>(),
  },
): boolean {
  budget.nodes += 1;
  if (budget.nodes > PROJECTION_MAX_PLAIN_NODES || depth > PROJECTION_MAX_PLAIN_DEPTH) {
    return false;
  }
  if (value === null) return true;
  if (typeof value === 'string') return consumeProjectionString(value, budget);
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0);
  if (typeof value !== 'object') return false;
  if (nodeTypes.isProxy(value)) return false;
  if (budget.active.has(value)) return false;
  budget.active.add(value);
  try {
    let keys: readonly PropertyKey[];
    try {
      keys = Reflect.ownKeys(value);
    } catch {
      return false;
    }
    const isArray = Array.isArray(value);
    if (
      (isArray && value.length > PROJECTION_MAX_ARRAY_LENGTH)
      || (!isArray && keys.length > PROJECTION_MAX_OBJECT_KEYS)
    ) return false;
    budget.keys += keys.length;
    if (budget.keys > PROJECTION_MAX_TOTAL_KEYS) return false;
    for (const key of keys) {
      if (typeof key !== 'string' || !consumeProjectionString(key, budget)) return false;
    }

    let prototype: object | null;
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      return false;
    }
    if (isArray) {
      if (prototype !== Array.prototype) return false;
      const lengthDescriptor = descriptors.length;
      if (
        lengthDescriptor === undefined
        || !('value' in lengthDescriptor)
        || lengthDescriptor.value !== value.length
        || lengthDescriptor.enumerable !== false
        || keys.length !== value.length + 1
      ) return false;
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          descriptor === undefined
          || descriptor.get !== undefined
          || descriptor.set !== undefined
          || descriptor.enumerable !== true
          || !('value' in descriptor)
          || !isBoundedPlainData(descriptor.value, depth + 1, budget)
        ) return false;
      }
      return true;
    }
    if (prototype !== Object.prototype && prototype !== null) return false;
    return keys.every(key => {
      const descriptor = descriptors[key as string];
      return descriptor !== undefined
        && descriptor.get === undefined
        && descriptor.set === undefined
        && descriptor.enumerable === true
        && 'value' in descriptor
        && isBoundedPlainData(descriptor.value, depth + 1, budget);
    });
  } finally {
    budget.active.delete(value);
  }
}

function hasExactDataKeys(value: object, expected: readonly string[]): boolean {
  if (nodeTypes.isProxy(value)) return false;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return false;
  }
  if (keys.length !== expected.length) return false;
  const expectedKeys = new Set(expected);
  return keys.every(key => typeof key === 'string' && expectedKeys.has(key));
}

function isPositiveByteLength(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isExactIdentity(value: unknown, taskId: string): boolean {
  if (!isRecord(value) || !hasExactDataKeys(value, [
    'schemaVersion',
    'backend',
    'projectRootSha256',
    'projectId',
    'taskId',
    'attemptId',
    'generation',
  ])) return false;
  return value.schemaVersion === 2
    && value.backend === 'docker'
    && typeof value.projectRootSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(value.projectRootSha256)
    && typeof value.projectId === 'string'
    && value.projectId.length > 0
    && value.taskId === taskId
    && typeof value.attemptId === 'string'
    && value.attemptId.length > 0
    && Number.isSafeInteger(value.generation)
    && Number(value.generation) > 0;
}

function isExactArtifactAuthority(value: unknown): boolean {
  if (!isRecord(value) || !hasExactDataKeys(value, [
    'artifactReceiptDigest',
    'chainDigest',
    'artifactSha256',
    'byteLength',
  ])) return false;
  return isSha256Digest(value.artifactReceiptDigest)
    && isSha256Digest(value.chainDigest)
    && isSha256Digest(value.artifactSha256)
    && isPositiveByteLength(value.byteLength);
}

function isExactSettlementRef(
  value: unknown,
  taskId: string,
): value is ExactTaskResultAuthorityMetadata['settlementRef'] {
  if (!isRecord(value) || !hasExactDataKeys(value, [
    'schemaVersion',
    'kind',
    'identity',
    'artifactKey',
    'artifactReceiptDigest',
  ])) return false;
  return value.schemaVersion === 2
    && value.kind === 'task-result-settlement-v2-ref'
    && isExactIdentity(value.identity, taskId)
    && typeof value.artifactKey === 'string'
    && value.artifactKey.length > 0
    && isSha256Digest(value.artifactReceiptDigest);
}

function isExactSettlementAuthority(
  value: unknown,
  taskId: string,
): value is ExactTaskResultAuthorityMetadata {
  if (!isRecord(value) || !hasExactDataKeys(value, [
    'executionMode',
    'identity',
    'admissionReceiptDigest',
    'settlementRef',
    'settlementDigest',
    'resultDigest',
    'acceptedResultChainDigest',
    'evaluationChainDigest',
    'finalizerChainDigest',
    'evaluationArtifact',
    'finalizerArtifact',
  ]) || !isBoundedPlainData(value)) return false;
  return value.executionMode === 'normal-docker'
    && isExactIdentity(value.identity, taskId)
    && isSha256Digest(value.admissionReceiptDigest)
    && isExactSettlementRef(value.settlementRef, taskId)
    && sameJson(value.settlementRef.identity, value.identity)
    && isSha256Digest(value.settlementDigest)
    && isSha256Digest(value.resultDigest)
    && isSha256Digest(value.acceptedResultChainDigest)
    && isSha256Digest(value.evaluationChainDigest)
    && isSha256Digest(value.finalizerChainDigest)
    && isExactArtifactAuthority(value.evaluationArtifact)
    && isExactArtifactAuthority(value.finalizerArtifact);
}

function isExactTerminalDecisionAuthority(
  value: unknown,
  taskId: string,
): value is ExactTaskTerminalDecisionAuthorityV2 {
  if (!isRecord(value) || !hasExactDataKeys(value, [
    'schemaVersion',
    'kind',
    'identity',
    'evaluationReceipt',
    'finalizerReceipt',
  ]) || !isBoundedPlainData(value)) return false;
  const evaluation = value.evaluationReceipt;
  const finalizer = value.finalizerReceipt;
  if (
    !isRecord(evaluation)
    || !hasExactDataKeys(evaluation, [
      'verdict',
      'artifactReceiptDigest',
      'artifactSha256',
      'byteLength',
      'chainDigest',
    ])
    || !isRecord(finalizer)
    || !hasExactDataKeys(finalizer, [
      'state',
      'artifactReceiptDigest',
      'artifactSha256',
      'byteLength',
      'chainDigest',
    ])
  ) return false;
  return value.schemaVersion === 2
    && value.kind === 'exact-task-terminal-decision-authority-v2'
    && isExactIdentity(value.identity, taskId)
    && (
      evaluation.verdict === 'DONE'
      || evaluation.verdict === 'GO_WITH_TECH_DEBT'
      || evaluation.verdict === 'NO_GO'
    )
    && isSha256Digest(evaluation.artifactReceiptDigest)
    && isSha256Digest(evaluation.artifactSha256)
    && isPositiveByteLength(evaluation.byteLength)
    && isSha256Digest(evaluation.chainDigest)
    && finalizer.state === 'terminal-ready'
    && isSha256Digest(finalizer.artifactReceiptDigest)
    && isSha256Digest(finalizer.artifactSha256)
    && isPositiveByteLength(finalizer.byteLength)
    && isSha256Digest(finalizer.chainDigest);
}

function assertExactProjectionInputs(
  taskId: string,
  decisionAuthority: ExactTaskTerminalDecisionAuthorityV2,
  authority: ExactTaskResultAuthorityMetadata,
): void {
  if (
    !isExactSettlementAuthority(authority, taskId)
    || !isExactTerminalDecisionAuthority(decisionAuthority, taskId)
  ) {
    failProjection(taskId, 'invalid exact projection authority shape');
  }
}

function exactProjectionLockKey(authority: ExactTaskResultAuthorityMetadata): string {
  const digest = createHash('sha256')
    .update('deckent:exact-task-result-projection:v2\0')
    .update(authority.identity.projectId)
    .update('\0')
    .update(authority.identity.taskId)
    .digest('hex');
  return `exact-result-projection-${digest}`;
}

function readBoundedProjectionJson(
  taskId: string,
  artifactPath: string,
  owner: 'task' | 'public result',
  allowAbsent: boolean,
): unknown | null {
  let pathStat;
  try {
    pathStat = lstatSync(artifactPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && allowAbsent) return null;
    return failProjection(taskId, `${owner} path inspection failed`);
  }
  if (
    !pathStat.isFile()
    || pathStat.isSymbolicLink()
    || pathStat.nlink !== 1
    || pathStat.size > MAX_PUBLIC_RESULT_PROJECTION_BYTES
  ) {
    return failProjection(taskId, `unsafe ${owner} artifact`);
  }

  let fd: number;
  if (typeof fsConstants.O_NOFOLLOW !== 'number') {
    return failProjection(taskId, `${owner} no-follow capability unavailable`);
  }
  try {
    fd = openSync(
      artifactPath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch {
    return failProjection(taskId, `${owner} open failed`);
  }
  try {
    const opened = fstatSync(fd);
    if (
      !opened.isFile()
      || opened.nlink !== 1
      || opened.dev !== pathStat.dev
      || opened.ino !== pathStat.ino
      || opened.size !== pathStat.size
      || opened.size > MAX_PUBLIC_RESULT_PROJECTION_BYTES
    ) {
      return failProjection(taskId, `${owner} identity changed during read`);
    }
    const bytes = Buffer.allocUnsafe(MAX_PUBLIC_RESULT_PROJECTION_BYTES + 1);
    let total = 0;
    while (total < bytes.byteLength) {
      const count = readSync(fd, bytes, total, bytes.byteLength - total, null);
      if (count === 0) break;
      total += count;
    }
    const after = fstatSync(fd);
    if (
      total > MAX_PUBLIC_RESULT_PROJECTION_BYTES
      || after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.size !== opened.size
      || total !== opened.size
    ) {
      return failProjection(taskId, `${owner} changed during bounded read`);
    }
    try {
      return JSON.parse(bytes.subarray(0, total).toString('utf8')) as unknown;
    } catch {
      return failProjection(taskId, `invalid ${owner} JSON`);
    }
  } finally {
    closeSync(fd);
  }
}

function writePublicResultFirstWriter(
  taskId: string,
  resultPath: string,
  value: ExactProjectedResult,
): void {
  if (typeof fsConstants.O_NOFOLLOW !== 'number') {
    return failProjection(taskId, 'public result no-follow capability unavailable');
  }
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  if (bytes.byteLength > MAX_PUBLIC_RESULT_PROJECTION_BYTES) {
    return failProjection(taskId, 'public result projection exceeds byte bound');
  }
  let fd: number;
  try {
    fd = openSync(
      resultPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return failProjection(taskId, 'public result projection first-writer conflict');
    }
    return failProjection(taskId, 'public result projection create failed');
  }
  try {
    let written = 0;
    while (written < bytes.byteLength) {
      const count = writeSync(fd, bytes, written, bytes.byteLength - written, null);
      if (count <= 0) return failProjection(taskId, 'public result projection short write');
      written += count;
    }
    fsyncSync(fd);
    const projected = fstatSync(fd);
    if (
      !projected.isFile()
      || projected.nlink !== 1
      || projected.size !== bytes.byteLength
    ) {
      return failProjection(taskId, 'public result projection identity mismatch');
    }
  } catch (error) {
    if ((error as { code?: unknown }).code === 'DECKENT_E077') throw error;
    return failProjection(taskId, 'public result projection write failed');
  } finally {
    closeSync(fd);
  }
}

function snapshotCanonicalCompatibleResult(
  taskId: string,
  value: unknown,
  authority: ExactTaskResultAuthorityMetadata,
): ExactAuthoritativeTaskResult<TaskResult> | null {
  if (!isBoundedPlainData(value) || !isRecord(value)) return null;
  if (
    value.taskId !== taskId
    || typeof value.workerId !== 'string'
    || !Array.isArray(value.filesChanged)
    || !value.filesChanged.every(path => typeof path === 'string')
    || !Number.isSafeInteger(value.linesAdded)
    || Number(value.linesAdded) < 0
    || !Number.isSafeInteger(value.linesRemoved)
    || Number(value.linesRemoved) < 0
    || typeof value.testsPassed !== 'boolean'
    || typeof value.coverage !== 'number'
    || !Number.isFinite(value.coverage)
    || (
      value.selfAssessment !== 'DONE'
      && value.selfAssessment !== 'GO_WITH_TECH_DEBT'
      && value.selfAssessment !== 'NO_GO'
    )
    || typeof value.notes !== 'string'
    || !isExactSettlementAuthority(value.exactSettlementAuthority, taskId)
    || !sameJson(value.exactSettlementAuthority, authority)
  ) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as ExactAuthoritativeTaskResult<TaskResult>;
  } catch {
    return null;
  }
}

async function assertCurrentProjectionAuthority(
  taskId: string,
  expectedAuthority: ExactTaskResultAuthorityMetadata,
  expectedDecisionAuthority: ExactTaskTerminalDecisionAuthorityV2,
  revalidate: RevalidateExactTaskResultProjectionAuthority,
  expectedResult?: ExactAuthoritativeTaskResult<TaskResult>,
): Promise<ExactAuthoritativeTaskResult<TaskResult>> {
  let validation: ExactTaskResultProjectionAuthorityValidation;
  try {
    validation = await revalidate({
      taskId,
      expectedAuthority,
      expectedDecisionAuthority,
    });
  } catch {
    return failProjection(taskId, 'exact attempt authority revalidation unavailable');
  }
  if (!isRecord(validation)) {
    return failProjection(taskId, 'invalid exact attempt authority revalidation');
  }
  const holdShape = hasExactDataKeys(validation, ['state', 'reasonCode']);
  const currentShape = hasExactDataKeys(
    validation,
    ['state', 'authority', 'decisionAuthority', 'canonicalCompatibleResult'],
  );
  if ((!holdShape && !currentShape) || !isBoundedPlainData(validation)) {
    return failProjection(taskId, 'invalid exact attempt authority revalidation');
  }
  if (validation.state === 'hold') {
    if (
      !holdShape
      || typeof validation.reasonCode !== 'string'
      || validation.reasonCode.length === 0
    ) {
      return failProjection(taskId, 'invalid exact attempt authority revalidation');
    }
    return failProjection(taskId, `exact attempt authority changed: ${validation.reasonCode}`);
  }
  if (
    validation.state !== 'current'
    || !currentShape
    || !isExactSettlementAuthority(validation.authority, taskId)
    || !isExactTerminalDecisionAuthority(validation.decisionAuthority, taskId)
    || !sameJson(validation.authority, expectedAuthority)
    || !sameJson(validation.decisionAuthority, expectedDecisionAuthority)
  ) {
    return failProjection(taskId, 'exact attempt authority changed during projection');
  }
  const resultSnapshot = snapshotCanonicalCompatibleResult(
    taskId,
    validation.canonicalCompatibleResult,
    expectedAuthority,
  );
  if (resultSnapshot === null) {
    return failProjection(taskId, 'invalid canonical compatible result authority');
  }
  if (expectedResult && !sameJson(resultSnapshot, expectedResult)) {
    return failProjection(taskId, 'canonical compatible result changed during projection');
  }
  return resultSnapshot;
}

function isSha256Digest(value: unknown): boolean {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function parseExistingProjection(
  taskId: string,
  owner: 'task' | 'result',
  container: unknown,
): ExactTaskSettlementProjectionV2 | null {
  if (!isRecord(container) || container.exactSettlementProjection === undefined) return null;
  const marker = container.exactSettlementProjection;
  if (
    !isRecord(marker)
    || marker.schemaVersion !== 2
    || marker.kind !== EXACT_PROJECTION_KIND
    || !isRecord(marker.identity)
    || marker.identity.taskId !== taskId
    || marker.identity.backend !== 'docker'
    || !Number.isSafeInteger(marker.identity.generation)
    || Number(marker.identity.generation) < 1
    || typeof marker.identity.attemptId !== 'string'
    || !isRecord(marker.settlementRef)
    || !isRecord(marker.settlementRef.identity)
    || !sameJson(marker.settlementRef.identity, marker.identity)
    || !isSha256Digest(marker.admissionReceiptDigest)
    || !isSha256Digest(marker.settlementDigest)
    || !isSha256Digest(marker.resultDigest)
    || !isRecord(marker.chain)
    || !isSha256Digest(marker.chain.acceptedResultChainDigest)
    || !isSha256Digest(marker.chain.evaluationChainDigest)
    || !isSha256Digest(marker.chain.finalizerChainDigest)
    || (
      marker.evaluation !== 'DONE'
      && marker.evaluation !== 'GO_WITH_TECH_DEBT'
      && marker.evaluation !== 'NO_GO'
    )
    || (marker.status !== TaskStatus.DONE && marker.status !== TaskStatus.NO_GO)
  ) {
    return failProjection(taskId, `invalid ${owner} projection marker`);
  }
  return marker as unknown as ExactTaskSettlementProjectionV2;
}

function terminalProjection(
  taskId: string,
  authority: ExactTaskResultAuthorityMetadata,
  decisionAuthority: ExactTaskTerminalDecisionAuthorityV2,
): ExactTaskSettlementProjectionV2 {
  const evaluation = decisionAuthority.evaluationReceipt.verdict;
  if (
    decisionAuthority.schemaVersion !== 2
    || decisionAuthority.kind !== 'exact-task-terminal-decision-authority-v2'
    || !sameJson(decisionAuthority.identity, authority.identity)
    || decisionAuthority.evaluationReceipt.artifactReceiptDigest
      !== authority.evaluationArtifact.artifactReceiptDigest
    || decisionAuthority.evaluationReceipt.artifactSha256
      !== authority.evaluationArtifact.artifactSha256
    || decisionAuthority.evaluationReceipt.byteLength !== authority.evaluationArtifact.byteLength
    || decisionAuthority.evaluationReceipt.chainDigest !== authority.evaluationChainDigest
    || decisionAuthority.evaluationReceipt.chainDigest !== authority.evaluationArtifact.chainDigest
    || decisionAuthority.finalizerReceipt.state !== 'terminal-ready'
    || decisionAuthority.finalizerReceipt.artifactReceiptDigest
      !== authority.finalizerArtifact.artifactReceiptDigest
    || decisionAuthority.finalizerReceipt.artifactSha256
      !== authority.finalizerArtifact.artifactSha256
    || decisionAuthority.finalizerReceipt.byteLength !== authority.finalizerArtifact.byteLength
    || decisionAuthority.finalizerReceipt.chainDigest !== authority.finalizerChainDigest
    || decisionAuthority.finalizerReceipt.chainDigest !== authority.finalizerArtifact.chainDigest
  ) {
    return failProjection(taskId, 'terminal decision authority mismatch');
  }
  return Object.freeze({
    schemaVersion: 2,
    kind: EXACT_PROJECTION_KIND,
    identity: authority.identity,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    settlementRef: authority.settlementRef,
    settlementDigest: authority.settlementDigest,
    resultDigest: authority.resultDigest,
    chain: Object.freeze({
      acceptedResultChainDigest: authority.acceptedResultChainDigest,
      evaluationChainDigest: authority.evaluationChainDigest,
      finalizerChainDigest: authority.finalizerChainDigest,
    }),
    evaluation,
    status: evaluation === 'NO_GO' ? TaskStatus.NO_GO : TaskStatus.DONE,
  });
}

function assertGenerationFence(
  taskId: string,
  owner: 'task' | 'result',
  existing: ExactTaskSettlementProjectionV2 | null,
  expected: ExactTaskSettlementProjectionV2,
): void {
  if (!existing) return;
  if (existing.identity.generation > expected.identity.generation) {
    failProjection(taskId, `stale generation at ${owner} projection`);
  }
  if (existing.identity.generation === expected.identity.generation) {
    if (existing.identity.attemptId !== expected.identity.attemptId) {
      failProjection(taskId, `sibling attempt at ${owner} projection`);
    }
    if (!sameJson(existing, expected)) {
      failProjection(taskId, `conflicting exact ${owner} projection`);
    }
  }
}

/**
 * Publish the compatibility projection of one host-inspected exact settlement.
 *
 * The public result file and caller input are never result authority. The
 * mandatory resolver supplies the host-inspected compatible result snapshot
 * on every fence check. Both public surfaces carry the same exact marker, and a
 * host-owned leased lock plus generation fence prevents stale/sibling
 * attempts from retracting terminal truth. Writing result before task status
 * makes a crash recoverable without ever exposing a terminal task whose exact
 * result projection is absent.
 */
export async function projectExactTaskResultSettlement(
  root: string,
  taskId: string,
  decisionAuthority: ExactTaskTerminalDecisionAuthorityV2,
  authority: ExactTaskResultAuthorityMetadata,
  options: ExactTaskSettlementProjectionOptions,
): Promise<ExactTaskSettlementProjectionResult> {
  assertExactProjectionInputs(taskId, decisionAuthority, authority);
  const projection = terminalProjection(taskId, authority, decisionAuthority);
  const tasksDir = join(root, TASKS_DIR);
  const taskPath = join(tasksDir, `task-${taskId}.json`);
  const resultPath = join(tasksDir, `task-${taskId}.result`);
  const lockKey = exactProjectionLockKey(authority);
  const lockOutcomeRunner = options.lockOutcomeRunner ?? withExecutionLockOutcome;
  let outcome: ExecutionLockOperationOutcome<ExactTaskSettlementProjectionResult>;
  try {
    outcome = await lockOutcomeRunner(
      root,
      lockKey,
      'settlement',
      async lock => {
        lock.assertAuthority();
        const canonicalCompatibleResult = await assertCurrentProjectionAuthority(
          taskId,
          authority,
          decisionAuthority,
          options.revalidateAuthority,
        );

        const taskValue = readBoundedProjectionJson(taskId, taskPath, 'task', false);
        if (!isRecord(taskValue)) return failProjection(taskId, 'invalid task projection JSON');
        const task = taskValue as unknown as ExactProjectedTask;
        if (task.id !== taskId) return failProjection(taskId, 'task identity mismatch');
        const publicResult = readBoundedProjectionJson(
          taskId,
          resultPath,
          'public result',
          true,
        );
        const taskMarker = parseExistingProjection(taskId, 'task', task);
        const resultMarker = parseExistingProjection(taskId, 'result', publicResult);
        if (publicResult !== null && resultMarker === null) {
          return failProjection(taskId, 'unfenced public result bytes');
        }
        assertGenerationFence(taskId, 'task', taskMarker, projection);
        assertGenerationFence(taskId, 'result', resultMarker, projection);

        if (
          !taskMarker
          && (task.status === TaskStatus.DONE || task.status === TaskStatus.NO_GO)
        ) {
          return failProjection(taskId, 'unfenced terminal task status');
        }

        const taskCurrent = taskMarker !== null && sameJson(taskMarker, projection);
        const resultCurrent = resultMarker !== null && sameJson(resultMarker, projection);
        const compatibleResult: ExactProjectedResult = {
          ...canonicalCompatibleResult,
          exactSettlementAuthority: authority,
          exactSettlementProjection: projection,
        };
        const resultBodyCurrent = sameJson(publicResult, compatibleResult);
        if (publicResult !== null && !resultBodyCurrent) {
          return failProjection(taskId, 'conflicting exact public result body');
        }
        if (
          taskCurrent
          && resultCurrent
          && resultBodyCurrent
          && task.status === projection.status
        ) {
          await assertCurrentProjectionAuthority(
            taskId,
            authority,
            decisionAuthority,
            options.revalidateAuthority,
            canonicalCompatibleResult,
          );
          lock.assertAuthority();
          return Object.freeze({
            decision: 'idempotent',
            status: projection.status,
            projection,
          });
        }

        lock.assertAuthority();
        if (publicResult === null) {
          writePublicResultFirstWriter(taskId, resultPath, compatibleResult);
        }
        await assertCurrentProjectionAuthority(
          taskId,
          authority,
          decisionAuthority,
          options.revalidateAuthority,
          canonicalCompatibleResult,
        );

        lock.assertAuthority();
        task.status = projection.status;
        task.exactSettlementProjection = projection;
        atomicWriteFileSync(taskPath, `${JSON.stringify(task, null, 2)}\n`);
        const persistedTaskValue = readBoundedProjectionJson(taskId, taskPath, 'task', false);
        if (!isRecord(persistedTaskValue)) {
          return failProjection(taskId, 'invalid task projection readback');
        }
        const persistedTask = persistedTaskValue as unknown as ExactProjectedTask;
        if (
          persistedTask.id !== taskId
          || persistedTask.status !== projection.status
          || !sameJson(persistedTask.exactSettlementProjection, projection)
        ) {
          return failProjection(taskId, 'task projection readback mismatch');
        }
        await assertCurrentProjectionAuthority(
          taskId,
          authority,
          decisionAuthority,
          options.revalidateAuthority,
          canonicalCompatibleResult,
        );
        lock.assertAuthority();
        return Object.freeze({
          decision: taskMarker === null && resultMarker === null ? 'applied' : 'repaired',
          status: projection.status,
          projection,
        });
      },
      options.executionLockOptions,
    );
  } catch (error) {
    if ((error as { code?: unknown }).code === 'DECKENT_E077') throw error;
    return failProjection(
      taskId,
      `execution lock unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (outcome.authority !== 'released') {
    return failProjection(
      taskId,
      `execution lock outcome ${outcome.authority}:${outcome.fault.phase}`,
    );
  }
  return outcome.value;
}

/**
 * Project one exact closed host-owned attempt into the raw task read model.
 *
 * Manual spawn, mandatory XVerify and future execution ingresses must use this
 * single settlement-bound service. Provider prose and unclosed/raw result files
 * are never sufficient authority for a terminal task projection.
 */
export function finalizeTaskStatusFromSettlement(
  root: string,
  taskId: string,
  settlementRef: TaskResultSettlementRefV1,
): TaskStatus | null {
  assertTaskResultSettlementRef(root, taskId, settlementRef);
  const settlement = readClosedTaskResultSettlement(settlementRef);
  if (!settlement) return null;
  const result = normalizeTaskResultShape(settlement.result as unknown as TaskResult);
  if (!result || result.taskId !== taskId) return null;

  const status = taskStatusForTerminalResult(result);
  if (status === null) return null;

  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  try {
    const task = readTask(root, taskId);
    if (task.id !== taskId) return null;
    task.status = status;
    atomicWriteFileSync(taskPath, `${JSON.stringify(task, null, 2)}\n`);
    return status;
  } catch (error) {
    debugLog('task-settlement-projection:finalize', error);
    return null;
  }
}
