// ═══ IPC Channel Registry + File-Based IPC ═════════════════════════
// Centralized IPC module: manages WorkerChannel registry for subprocess
// workers AND file-based question/answer IPC for tmux/docker workers.
//
// Sprint 135 T-004: askBrain(), file-based helpers, and question handlers
// moved here from worker-ipc.ts and result-collector.ts.
// worker-ipc.ts re-exports for backward compatibility.

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  openSync,
  closeSync,
  fsyncSync,
  fstatSync,
  readSync,
  constants as fsConstants,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { dirname, join } from 'node:path';
import { ChannelRegistry } from '../agents/worker-ipc.js';
import type { WorkerChannel } from '../agents/worker-ipc.js';
import type { WorkerSideChannel } from '../agents/worker-ipc.js';
import { TASKS_DIR } from '../core/constants.js';
import type { WorkerQuestion, BrainAnswer, QuestionAction } from '../core/task-types.js';
import { debugLog } from '../core/utils.js';
import { notifyAsync } from '../core/notify.js';
import type { ApprovalBrokerLike } from '../core/approval-worker-gate.js';
import { withExecutionLockOutcome } from '../core/file-lock.js';
import type {
  Sha256Digest,
  TaskAttemptCustodyArtifactReceiptV2,
  TaskAttemptCustodyIdentityV2,
} from '../core/task-attempt-custody-store.js';
// Type-only — question-approval-bridge.ts imports NPM_ADVISORY_MARKER (a VALUE)
// from THIS file, so a value-import back here would be a real runtime import
// cycle. `import type` is erased at compile time (ADR-D-001 nodenext), so the
// shapes below cost nothing at runtime; the actual `bridgeQuestionToApproval`
// function is injected by the caller via HandleWorkerQuestionOptions.bridge —
// see CKPT-QUESTION-BRIDGE-WIRE (358-007) below.
import type { QuestionBridgeOptions, QuestionBridgeResult } from './question-approval-bridge.js';
import type { QuestionApprovalExactAttemptBinding } from './question-approval-bridge.js';

// ─── Channel Registry (Sprint 134) ─────────────────────────────────

/**
 * Module-level registry that maps taskId -> WorkerChannel.
 * Populated when workers are spawned via child_process.fork (subprocess backend).
 * tmux-based workers do not populate this registry -- they use file-based heartbeats.
 *
 * Lazy-initialized to avoid circular dependency issues with worker-ipc.ts
 * (ipc-registry ↔ worker-ipc re-export cycle).
 */
let _channelRegistry: ChannelRegistry | null = null;

function ensureRegistry(): ChannelRegistry {
  if (!_channelRegistry) {
    _channelRegistry = new ChannelRegistry();
  }
  return _channelRegistry;
}

/**
 * Returns the module-level ChannelRegistry (used by Brain and tests).
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function getChannelRegistry(): ChannelRegistry {
  return ensureRegistry();
}

/**
 * Register a WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function registerWorkerChannel(taskId: string, channel: WorkerChannel): void {
  ensureRegistry().register(taskId, channel);
}

/**
 * Unregister and close the WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function unregisterWorkerChannel(taskId: string): void {
  ensureRegistry().remove(taskId);
}

// ─── File-based Question/Answer IPC ────────────────────────────────
// Used when workers run in tmux/docker backends without process.send support.
// Worker writes .question file, Brain reads it and writes .answer file.

/** Get the path for a worker's question file */
export function getQuestionPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.question`);
}

/** Get the path for a brain's answer file */
export function getAnswerPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.answer`);
}

/** Write a question file from the worker side */
export function writeQuestionFile(projectRoot: string, question: WorkerQuestion): void {
  const path = getQuestionPath(projectRoot, question.taskId);
  writeFileSync(path, JSON.stringify(question, null, 2), 'utf-8');
}

/** Read a question file (returns undefined if not found or invalid) */
export function readQuestionFile(projectRoot: string, taskId: string): WorkerQuestion | undefined {
  const path = getQuestionPath(projectRoot, taskId);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as WorkerQuestion;
  } catch {
    return undefined;
  }
}

/** Write an answer file from the Brain side */
export function writeAnswerFile(projectRoot: string, answer: BrainAnswer): void {
  const path = getAnswerPath(projectRoot, answer.taskId);
  writeFileSync(path, JSON.stringify(answer, null, 2), 'utf-8');
}

/** Read an answer file (returns undefined if not found or invalid) */
export function readAnswerFile(projectRoot: string, taskId: string): BrainAnswer | undefined {
  const path = getAnswerPath(projectRoot, taskId);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as BrainAnswer;
  } catch {
    return undefined;
  }
}

/** Clean up both question and answer files for a task */
export function cleanupQuestionFiles(projectRoot: string, taskId: string): void {
  const qPath = getQuestionPath(projectRoot, taskId);
  const aPath = getAnswerPath(projectRoot, taskId);
  try { if (existsSync(qPath)) unlinkSync(qPath); } catch { /* noop */ }
  try { if (existsSync(aPath)) unlinkSync(aPath); } catch { /* noop */ }
}

// ─── Normal-Docker exact-attempt IPC authority ─────────────────────────────

const EXACT_ATTEMPT_IPC_SCHEMA_VERSION = 2 as const;
const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const EXACT_QUESTION_KEYS = Object.freeze([
  'taskId',
  'workerId',
  'question',
  'context',
  'suggestedAction',
  'timestamp',
] as const);

export type ExactAttemptIpcHoldReason =
  | 'INVALID_EXACT_IDENTITY'
  | 'INVALID_PRIVATE_QUESTION_RECEIPT'
  | 'PRIVATE_QUESTION_BYTES_MISMATCH'
  | 'PRIVATE_QUESTION_PAYLOAD_INVALID'
  | 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE'
  | 'PRIVATE_ANSWER_DELIVERY_UNAVAILABLE'
  | 'PRIVATE_ANSWER_RECEIPT_INVALID'
  | 'EXACT_QUESTION_AUTHORITY_CHANGED'
  | 'PUBLIC_PROJECTION_CORRUPT'
  | 'PUBLIC_PROJECTION_SPOOF'
  | 'PUBLIC_PROJECTION_STALE'
  | 'PUBLIC_PROJECTION_SIBLING'
  | 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED';

const EXACT_ATTEMPT_IPC_HOLD_REASONS: readonly ExactAttemptIpcHoldReason[] = Object.freeze([
  'INVALID_EXACT_IDENTITY',
  'INVALID_PRIVATE_QUESTION_RECEIPT',
  'PRIVATE_QUESTION_BYTES_MISMATCH',
  'PRIVATE_QUESTION_PAYLOAD_INVALID',
  'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
  'PRIVATE_ANSWER_DELIVERY_UNAVAILABLE',
  'PRIVATE_ANSWER_RECEIPT_INVALID',
  'EXACT_QUESTION_AUTHORITY_CHANGED',
  'PUBLIC_PROJECTION_CORRUPT',
  'PUBLIC_PROJECTION_SPOOF',
  'PUBLIC_PROJECTION_STALE',
  'PUBLIC_PROJECTION_SIBLING',
  'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED',
]);

/** Typed fail-closed boundary for exact-attempt IPC. */
export class ExactAttemptIpcHold extends Error {
  readonly state = 'HOLD' as const;

  constructor(readonly reasonCode: ExactAttemptIpcHoldReason) {
    super(`EXACT_ATTEMPT_IPC_HOLD:${reasonCode}`);
    this.name = 'ExactAttemptIpcHold';
  }
}

export interface ExactAttemptIpcQuestionAuthority {
  readonly schemaVersion: typeof EXACT_ATTEMPT_IPC_SCHEMA_VERSION;
  readonly kind: 'task-attempt-ipc-question-authority';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly fenceDigest: Sha256Digest;
  readonly sequence: number;
  readonly questionReceiptDigest: Sha256Digest;
  readonly questionArtifactSha256: Sha256Digest;
  readonly question: WorkerQuestion;
  readonly envelopeDigest: Sha256Digest;
}

export interface ExactAttemptIpcAnswerEnvelope {
  readonly schemaVersion: typeof EXACT_ATTEMPT_IPC_SCHEMA_VERSION;
  readonly kind: 'task-attempt-ipc-answer-envelope';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly fenceDigest: Sha256Digest;
  readonly sequence: number;
  readonly questionReceiptDigest: Sha256Digest;
  readonly questionEnvelopeDigest: Sha256Digest;
  readonly answer: BrainAnswer;
  readonly envelopeDigest: Sha256Digest;
}

/** Receipt shape the missing T18 Store answer-delivery API must return. T4
 * deliberately supplies no filesystem implementation for this port. */
export interface ExactAttemptIpcPrivateAnswerReceipt {
  readonly schemaVersion: typeof EXACT_ATTEMPT_IPC_SCHEMA_VERSION;
  readonly kind: 'task-attempt-ipc-private-answer-receipt';
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly fenceDigest: Sha256Digest;
  readonly sequence: number;
  readonly questionReceiptDigest: Sha256Digest;
  readonly questionEnvelopeDigest: Sha256Digest;
  readonly answerEnvelopeDigest: Sha256Digest;
  readonly answerArtifactSha256: Sha256Digest;
  /** Immutable Store artifact identity; independent from the worker-visible filename. */
  readonly artifactKey: string;
  readonly destinationChildRelativePath: string;
  readonly destinationProofDigest: Sha256Digest;
  readonly deliveredAt: string;
  readonly receiptDigest: Sha256Digest;
}

export type ExactAttemptIpcPrivateAnswerReceiptBody = Omit<
  ExactAttemptIpcPrivateAnswerReceipt,
  'receiptDigest'
>;

export type ExactAttemptIpcPrivateAnswerPublication =
  | { readonly state: 'published'; readonly receipt: ExactAttemptIpcPrivateAnswerReceipt }
  | { readonly state: 'hold'; readonly reasonCode: ExactAttemptIpcHoldReason };

/** Narrow T18 dependency. Public `.tasks` bytes never implement this port. */
export interface ExactAttemptIpcPrivateAnswerPublisher {
  publishAnswerFirstWriter(input: {
    readonly identity: TaskAttemptCustodyIdentityV2;
    readonly admissionReceiptDigest: Sha256Digest;
    readonly fenceDigest: Sha256Digest;
    readonly sequence: number;
    readonly questionReceiptDigest: Sha256Digest;
    readonly questionEnvelopeDigest: Sha256Digest;
    readonly answerEnvelope: ExactAttemptIpcAnswerEnvelope;
    /** Exact bytes the Store must publish first-writer and bind in its receipt. */
    readonly privateAnswerBytes: Uint8Array;
    readonly artifactKey: string;
    readonly destinationChildRelativePath: string;
  }): ExactAttemptIpcPrivateAnswerPublication;
}

export type ExactAttemptIpcQuestionAuthorityState =
  | {
      readonly state: 'question-ready';
      readonly authority: ExactAttemptIpcQuestionAuthority;
      readonly answerPublisher: ExactAttemptIpcPrivateAnswerPublisher;
    }
  | { readonly state: 'absent'; readonly identity: TaskAttemptCustodyIdentityV2 }
  | {
      readonly state: 'answered';
      /** Exact raw worker-consumable answer bytes, UTF-8 decoded without a
       * wrapper. Snapshot re-encodes and binds them to answerReceipt.sha256. */
      readonly privateAnswerUtf8: string;
      readonly authority: ExactAttemptIpcQuestionAuthority;
      readonly answerReceipt: ExactAttemptIpcPrivateAnswerReceipt;
    }
  | { readonly state: 'not-dispatched'; readonly taskId: string; readonly attemptCount: 0 }
  | { readonly state: 'hold'; readonly taskId: string; readonly reasonCode: ExactAttemptIpcHoldReason };

export type ResolveExactAttemptIpcAuthority = (
  taskId: string,
) => ExactAttemptIpcQuestionAuthorityState;

export interface ExactAttemptIpcCheckReport {
  readonly answered: string[];
  readonly pending: string[];
  readonly notDispatched: string[];
  readonly holds: Array<{ readonly taskId: string; readonly reasonCode: ExactAttemptIpcHoldReason }>;
  /** Compatibility read-model debt only. These observations never override
   * private delivery authority or become a task execution HOLD. */
  readonly projectionHolds: ExactAttemptIpcProjectionHold[];
}

export interface ExactAttemptIpcProjectionHold {
  readonly taskId: string;
  readonly direction: 'question' | 'answer';
  readonly reasonCode: ExactAttemptIpcHoldReason;
}

export type ExactAttemptIpcCompatibilityEnvelope =
  | ExactAttemptIpcQuestionAuthority
  | {
      readonly schemaVersion: typeof EXACT_ATTEMPT_IPC_SCHEMA_VERSION;
      readonly kind: 'task-attempt-ipc-answer-authority';
      readonly identity: TaskAttemptCustodyIdentityV2;
      readonly admissionReceiptDigest: Sha256Digest;
      readonly fenceDigest: Sha256Digest;
      readonly sequence: number;
      readonly privateReceiptDigest: Sha256Digest;
      readonly answerEnvelope: ExactAttemptIpcAnswerEnvelope;
      readonly envelopeDigest: Sha256Digest;
    };

export type ExactAttemptIpcProjectionResult =
  | { readonly state: 'published' | 'existing-identical' }
  | { readonly state: 'hold'; readonly reasonCode: ExactAttemptIpcHoldReason };

function rawSha256(bytes: Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

const EXACT_IPC_CANONICAL_MAX_DEPTH = 32;
const EXACT_IPC_CANONICAL_MAX_NODES = 10_000;
const EXACT_IPC_CANONICAL_MAX_BYTES = 1024 * 1024;

function canonicalExactIpcJson(value: unknown): string {
  const traversal = { nodes: 0, bytes: 0, seen: new WeakSet<object>() };
  const encoded = canonicalExactIpcJsonValue(value, traversal, 0);
  return encoded;
}

function accountCanonicalBytes(
  traversal: { bytes: number },
  encoded: string,
): void {
  traversal.bytes += Buffer.byteLength(encoded, 'utf8');
  if (traversal.bytes > EXACT_IPC_CANONICAL_MAX_BYTES) {
    throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  }
}

function canonicalExactIpcJsonValue(
  value: unknown,
  traversal: { nodes: number; bytes: number; seen: WeakSet<object> },
  depth: number,
): string {
  if (depth > EXACT_IPC_CANONICAL_MAX_DEPTH) {
    throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  }
  traversal.nodes += 1;
  if (traversal.nodes > EXACT_IPC_CANONICAL_MAX_NODES) {
    throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string') {
      if (
        value.length > EXACT_IPC_CANONICAL_MAX_BYTES
        || Buffer.byteLength(value, 'utf8') > EXACT_IPC_CANONICAL_MAX_BYTES
      ) throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    }
    const encoded = JSON.stringify(value);
    accountCanonicalBytes(traversal, encoded);
    return encoded;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const encoded = JSON.stringify(value);
    accountCanonicalBytes(traversal, encoded);
    return encoded;
  }
  if (typeof value !== 'object' || nodeTypes.isProxy(value)) {
    throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  }
  if (
    traversal.seen.has(value)
  ) throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  traversal.seen.add(value);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    }
    if (
      !Number.isSafeInteger(value.length)
      || value.length > EXACT_IPC_CANONICAL_MAX_NODES - traversal.nodes
    ) throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    const keys = Reflect.ownKeys(value);
    if (keys.length > EXACT_IPC_CANONICAL_MAX_NODES - traversal.nodes + 1) {
      throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    }
    const expected = [...value.keys()].map(String);
    if (
      keys.length !== expected.length + 1
      || keys.some(key => key !== 'length' && (typeof key !== 'string' || !expected.includes(key)))
    ) throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    accountCanonicalBytes(traversal, '[]');
    if (expected.length > 1) accountCanonicalBytes(traversal, ','.repeat(expected.length - 1));
    const encoded = expected.map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
      }
      return canonicalExactIpcJsonValue(descriptor.value, traversal, depth + 1);
    });
    traversal.seen.delete(value);
    return `[${encoded.join(',')}]`;
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null
  ) throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  const record = value as Record<string, unknown>;
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length > EXACT_IPC_CANONICAL_MAX_NODES - traversal.nodes) {
    throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  }
  const descriptors = ownKeys.map(key => {
    if (typeof key !== 'string') throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    if (key.length > EXACT_IPC_CANONICAL_MAX_BYTES) {
      throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    }
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
      throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
    }
    return [key, descriptor.value] as const;
  });
  accountCanonicalBytes(traversal, '{}');
  if (descriptors.length > 1) {
    accountCanonicalBytes(traversal, ','.repeat(descriptors.length - 1));
  }
  const encoded = `{${descriptors
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => {
      const encodedKey = JSON.stringify(key);
      accountCanonicalBytes(traversal, `${encodedKey}:`);
      return `${encodedKey}:${canonicalExactIpcJsonValue(nested, traversal, depth + 1)}`;
    })
    .join(',')}}`;
  traversal.seen.delete(value);
  return encoded;
}

function exactIpcDigest(domain: string, value: unknown): Sha256Digest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update(Buffer.from([0]))
    .update(canonicalExactIpcJson(value), 'utf8')
    .digest('hex')}`;
}

export function exactAttemptIpcPrivateAnswerReceiptDigest(
  receipt: ExactAttemptIpcPrivateAnswerReceiptBody,
): Sha256Digest {
  return exactIpcDigest('deckent.task-attempt-ipc.private-answer-receipt.v2', receipt);
}

function isDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && SHA256_DIGEST_PATTERN.test(value);
}

function sameExactIdentity(
  left: TaskAttemptCustodyIdentityV2,
  right: TaskAttemptCustodyIdentityV2,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.projectId === right.projectId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
    && left.generation === right.generation;
}

function isExactDataRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length
    || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))
  ) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && 'value' in descriptor
      && descriptor.enumerable === true
      && descriptor.get === undefined
      && descriptor.set === undefined;
  });
}

function snapshotExactIdentity(value: TaskAttemptCustodyIdentityV2): TaskAttemptCustodyIdentityV2 {
  if (
    !isExactDataRecord(value, [
      'schemaVersion', 'backend', 'projectRootSha256', 'projectId', 'taskId',
      'attemptId', 'generation',
    ])
    || value.schemaVersion !== EXACT_ATTEMPT_IPC_SCHEMA_VERSION
    || value.backend !== 'docker'
    || !SHA256_HEX_PATTERN.test(value.projectRootSha256)
    || !boundedIdentityComponent(value.projectId)
    || !boundedIdentityComponent(value.taskId)
    || !boundedIdentityComponent(value.attemptId)
    || !Number.isSafeInteger(value.generation)
    || value.generation <= 0
  ) throw new ExactAttemptIpcHold('INVALID_EXACT_IDENTITY');
  return Object.freeze({
    schemaVersion: EXACT_ATTEMPT_IPC_SCHEMA_VERSION,
    backend: 'docker',
    projectRootSha256: value.projectRootSha256,
    projectId: value.projectId,
    taskId: value.taskId,
    attemptId: value.attemptId,
    generation: value.generation,
  });
}

function boundedIdentityComponent(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 128
    && value === value.trim()
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 128;
}

function snapshotExactWorkerQuestion(value: unknown, expectedTaskId: string): WorkerQuestion {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) throw new ExactAttemptIpcHold('PRIVATE_QUESTION_PAYLOAD_INVALID');
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  const required = ['taskId', 'workerId', 'question', 'timestamp'];
  if (
    keys.some(key => typeof key !== 'string' || !EXACT_QUESTION_KEYS.includes(key as never))
    || required.some(key => !keys.includes(key))
    || keys.some(key => {
      if (typeof key !== 'string') return true;
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      return !descriptor || !('value' in descriptor) || descriptor.enumerable !== true;
    })
  ) throw new ExactAttemptIpcHold('PRIVATE_QUESTION_PAYLOAD_INVALID');
  if (
    record['taskId'] !== expectedTaskId
    || !boundedIdentityComponent(record['workerId'])
    || typeof record['question'] !== 'string'
    || record['question'].length > 128 * 1024
    || record['question'].trim().length === 0
    || Buffer.byteLength(record['question'], 'utf8') > 128 * 1024
    || typeof record['timestamp'] !== 'string'
    || !Number.isFinite(Date.parse(record['timestamp']))
    || (record['context'] !== undefined && (
      typeof record['context'] !== 'string'
      || record['context'].length > 128 * 1024
      || Buffer.byteLength(record['context'], 'utf8') > 128 * 1024
    ))
    || (record['suggestedAction'] !== undefined
      && !['continue', 'skip', 'abort', 'retry'].includes(String(record['suggestedAction'])))
  ) throw new ExactAttemptIpcHold('PRIVATE_QUESTION_PAYLOAD_INVALID');
  return Object.freeze({
    taskId: expectedTaskId,
    workerId: record['workerId'],
    question: record['question'],
    ...(record['context'] !== undefined ? { context: record['context'] as string } : {}),
    ...(record['suggestedAction'] !== undefined
      ? { suggestedAction: record['suggestedAction'] as QuestionAction }
      : {}),
    timestamp: record['timestamp'],
  });
}

function parsePrivateQuestionPayload(bytes: Uint8Array, expectedTaskId: string): WorkerQuestion {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new ExactAttemptIpcHold('PRIVATE_QUESTION_PAYLOAD_INVALID');
  }
  return snapshotExactWorkerQuestion(value, expectedTaskId);
}

/** Bind Store-verified raw bytes to their exact receipt. No caller-supplied
 * parsed question object participates in authority. */
export function createExactAttemptIpcQuestionAuthority(input: {
  readonly expectedIdentity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly fenceDigest: Sha256Digest;
  readonly sequence: number;
  readonly privateQuestionBytes: Uint8Array;
  readonly privateQuestionReceipt: TaskAttemptCustodyArtifactReceiptV2;
}): ExactAttemptIpcQuestionAuthority {
  const identity = snapshotExactIdentity(input.expectedIdentity);
  const receipt = input.privateQuestionReceipt;
  const receiptRecordValid = isExactDataRecord(receipt, [
    'schemaVersion', 'kind', 'identity', 'admissionReceiptDigest', 'artifactClass',
    'captureMode', 'artifactKey', 'capturedAt', 'policyDigest', 'artifact',
    'receiptDigest',
  ]);
  const artifactRecordValid = receiptRecordValid && isExactDataRecord(receipt.artifact, [
    'relativePath', 'sha256', 'byteLength', 'volumeId', 'fileId', 'linkCount',
    'privacyEvidenceDigest', 'durabilityEvidenceDigest',
  ]);
  let receiptIdentity: TaskAttemptCustodyIdentityV2 | null = null;
  if (receiptRecordValid) {
    try { receiptIdentity = snapshotExactIdentity(receipt.identity); } catch { receiptIdentity = null; }
  }
  if (
    !isDigest(input.admissionReceiptDigest)
    || !isDigest(input.fenceDigest)
    || !Number.isSafeInteger(input.sequence)
    || input.sequence <= 0
    || !receiptRecordValid
    || !artifactRecordValid
    || receipt.schemaVersion !== 2
    || receipt.kind !== 'task-attempt-custody-artifact'
    || receiptIdentity === null
    || !sameExactIdentity(receiptIdentity, identity)
    || receipt.admissionReceiptDigest !== input.admissionReceiptDigest
    || receipt.artifactClass !== 'worker-ipc-question'
    || receipt.captureMode !== 'attempt-output-capture'
    || receipt.artifactKey !== `ipc-question-${input.sequence}`
    || !Number.isFinite(Date.parse(receipt.capturedAt))
    || !isDigest(receipt.policyDigest)
    || !isDigest(receipt.receiptDigest)
    || !isDigest(receipt.artifact.sha256)
    || typeof receipt.artifact.relativePath !== 'string'
    || receipt.artifact.relativePath.length === 0
    || receipt.artifact.relativePath.startsWith('/')
    || receipt.artifact.relativePath.includes('\\')
    || receipt.artifact.relativePath.split('/').some(part => part === '' || part === '..')
    || !receipt.artifact.relativePath.endsWith(`/task-${identity.taskId}.question`)
    || !Number.isSafeInteger(receipt.artifact.byteLength)
    || receipt.artifact.byteLength <= 0
    || !boundedIdentityComponent(receipt.artifact.volumeId)
    || !boundedIdentityComponent(receipt.artifact.fileId)
    || receipt.artifact.linkCount !== 1
    || !isDigest(receipt.artifact.privacyEvidenceDigest)
    || !isDigest(receipt.artifact.durabilityEvidenceDigest)
  ) throw new ExactAttemptIpcHold('INVALID_PRIVATE_QUESTION_RECEIPT');
  const bytes = Uint8Array.from(input.privateQuestionBytes);
  if (
    bytes.byteLength !== receipt.artifact.byteLength
    || rawSha256(bytes) !== receipt.artifact.sha256
  ) throw new ExactAttemptIpcHold('PRIVATE_QUESTION_BYTES_MISMATCH');
  const question = parsePrivateQuestionPayload(bytes, identity.taskId);
  const withoutDigest = {
    schemaVersion: EXACT_ATTEMPT_IPC_SCHEMA_VERSION,
    kind: 'task-attempt-ipc-question-authority' as const,
    identity,
    admissionReceiptDigest: input.admissionReceiptDigest,
    fenceDigest: input.fenceDigest,
    sequence: input.sequence,
    questionReceiptDigest: receipt.receiptDigest,
    questionArtifactSha256: receipt.artifact.sha256,
    question,
  };
  return Object.freeze({
    ...withoutDigest,
    envelopeDigest: exactIpcDigest('deckent.task-attempt-ipc.question.v2', withoutDigest),
  });
}

function createExactAttemptIpcAnswerEnvelope(
  authority: ExactAttemptIpcQuestionAuthority,
  answer: BrainAnswer,
): ExactAttemptIpcAnswerEnvelope {
  const answerSnapshot = snapshotExactBrainAnswer(answer, authority.identity.taskId);
  const withoutDigest = {
    schemaVersion: EXACT_ATTEMPT_IPC_SCHEMA_VERSION,
    kind: 'task-attempt-ipc-answer-envelope' as const,
    identity: authority.identity,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    fenceDigest: authority.fenceDigest,
    sequence: authority.sequence,
    questionReceiptDigest: authority.questionReceiptDigest,
    questionEnvelopeDigest: authority.envelopeDigest,
    answer: answerSnapshot,
  };
  return Object.freeze({
    ...withoutDigest,
    envelopeDigest: exactIpcDigest('deckent.task-attempt-ipc.answer.v2', withoutDigest),
  });
}

function snapshotExactBrainAnswer(answer: BrainAnswer, expectedTaskId: string): BrainAnswer {
  if (
    answer === null
    || typeof answer !== 'object'
    || Array.isArray(answer)
    || nodeTypes.isProxy(answer)
    || (Object.getPrototypeOf(answer) !== Object.prototype
      && Object.getPrototypeOf(answer) !== null)
  ) throw new ExactAttemptIpcHold('PRIVATE_ANSWER_RECEIPT_INVALID');
  const keys = Reflect.ownKeys(answer);
  const allowed = ['taskId', 'action', 'message', 'timestamp'];
  if (
    keys.some(key => typeof key !== 'string' || !allowed.includes(key))
    || !['taskId', 'action', 'timestamp'].every(key => keys.includes(key))
    || keys.some(key => {
      if (typeof key !== 'string') return true;
      const descriptor = Object.getOwnPropertyDescriptor(answer, key);
      return descriptor === undefined
        || !('value' in descriptor)
        || descriptor.enumerable !== true
        || descriptor.get !== undefined
        || descriptor.set !== undefined;
    })
    || answer.taskId !== expectedTaskId
    || !['continue', 'skip', 'abort', 'retry'].includes(answer.action)
    || typeof answer.timestamp !== 'string'
    || !Number.isFinite(Date.parse(answer.timestamp))
    || (answer.message !== undefined && (
      typeof answer.message !== 'string'
      || answer.message.length > 128 * 1024
      || Buffer.byteLength(answer.message, 'utf8') > 128 * 1024
    ))
  ) throw new ExactAttemptIpcHold('PRIVATE_ANSWER_RECEIPT_INVALID');
  return Object.freeze({
    taskId: expectedTaskId,
    action: answer.action,
    ...(answer.message !== undefined ? { message: answer.message } : {}),
    timestamp: answer.timestamp,
  });
}

function isExactAttemptIpcHoldReason(value: unknown): value is ExactAttemptIpcHoldReason {
  return typeof value === 'string'
    && EXACT_ATTEMPT_IPC_HOLD_REASONS.includes(value as ExactAttemptIpcHoldReason);
}

function snapshotExactQuestionAuthority(
  value: unknown,
  expectedTaskId: string,
): ExactAttemptIpcQuestionAuthority {
  if (!isExactDataRecord(value, [
    'schemaVersion', 'kind', 'identity', 'admissionReceiptDigest', 'fenceDigest',
    'sequence', 'questionReceiptDigest', 'questionArtifactSha256', 'question',
    'envelopeDigest',
  ])) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  const identity = snapshotExactIdentity(value['identity'] as TaskAttemptCustodyIdentityV2);
  const question = snapshotExactWorkerQuestion(value['question'], identity.taskId);
  if (
    value['schemaVersion'] !== EXACT_ATTEMPT_IPC_SCHEMA_VERSION
    || value['kind'] !== 'task-attempt-ipc-question-authority'
    || identity.taskId !== expectedTaskId
    || !isDigest(value['admissionReceiptDigest'])
    || !isDigest(value['fenceDigest'])
    || !Number.isSafeInteger(value['sequence'])
    || (value['sequence'] as number) <= 0
    || !isDigest(value['questionReceiptDigest'])
    || !isDigest(value['questionArtifactSha256'])
    || !isDigest(value['envelopeDigest'])
  ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  const withoutDigest = {
    schemaVersion: EXACT_ATTEMPT_IPC_SCHEMA_VERSION,
    kind: 'task-attempt-ipc-question-authority' as const,
    identity,
    admissionReceiptDigest: value['admissionReceiptDigest'],
    fenceDigest: value['fenceDigest'],
    sequence: value['sequence'] as number,
    questionReceiptDigest: value['questionReceiptDigest'],
    questionArtifactSha256: value['questionArtifactSha256'],
    question,
  };
  if (
    value['envelopeDigest'] !== exactIpcDigest(
      'deckent.task-attempt-ipc.question.v2',
      withoutDigest,
    )
  ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  return Object.freeze({ ...withoutDigest, envelopeDigest: value['envelopeDigest'] });
}

function snapshotExactAnswerPublisher(value: unknown): ExactAttemptIpcPrivateAnswerPublisher {
  if (!isExactDataRecord(value, ['publishAnswerFirstWriter'])) {
    throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  }
  const publish = value['publishAnswerFirstWriter'];
  if (typeof publish !== 'function' || nodeTypes.isProxy(publish)) {
    throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  }
  return Object.freeze({
    publishAnswerFirstWriter: (
      input: Parameters<ExactAttemptIpcPrivateAnswerPublisher['publishAnswerFirstWriter']>[0],
    ) => Reflect.apply(publish, value, [input]) as
      ExactAttemptIpcPrivateAnswerPublication,
  });
}

function snapshotExactAttemptIpcAuthorityState(
  value: unknown,
  expectedTaskId: string,
): ExactAttemptIpcQuestionAuthorityState {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  const stateDescriptor = Object.getOwnPropertyDescriptor(value, 'state');
  if (
    !stateDescriptor
    || !('value' in stateDescriptor)
    || stateDescriptor.enumerable !== true
  ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  const state = stateDescriptor.value;
  if (state === 'not-dispatched') {
    if (
      !isExactDataRecord(value, ['state', 'taskId', 'attemptCount'])
      || value['taskId'] !== expectedTaskId
      || value['attemptCount'] !== 0
    ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
    return Object.freeze({ state, taskId: expectedTaskId, attemptCount: 0 });
  }
  if (state === 'absent') {
    if (!isExactDataRecord(value, ['state', 'identity'])) {
      throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
    }
    const identity = snapshotExactIdentity(value['identity'] as TaskAttemptCustodyIdentityV2);
    if (identity.taskId !== expectedTaskId) {
      throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
    }
    return Object.freeze({ state, identity });
  }
  if (state === 'answered') {
    if (!isExactDataRecord(value, ['state', 'privateAnswerUtf8', 'authority', 'answerReceipt'])) {
      throw new ExactAttemptIpcHold('PRIVATE_ANSWER_RECEIPT_INVALID');
    }
    const authority = snapshotExactQuestionAuthority(value['authority'], expectedTaskId);
    if (
      typeof value['privateAnswerUtf8'] !== 'string'
      || value['privateAnswerUtf8'].length > 512 * 1024
      || Buffer.byteLength(value['privateAnswerUtf8'], 'utf8') > 512 * 1024
    ) throw new ExactAttemptIpcHold('PRIVATE_ANSWER_RECEIPT_INVALID');
    const privateAnswerBytes = Buffer.from(value['privateAnswerUtf8'], 'utf8');
    let parsedAnswer: unknown;
    try {
      parsedAnswer = JSON.parse(value['privateAnswerUtf8']);
    } catch {
      throw new ExactAttemptIpcHold('PRIVATE_ANSWER_RECEIPT_INVALID');
    }
    const answer = snapshotExactBrainAnswer(parsedAnswer as BrainAnswer, expectedTaskId);
    const answerEnvelope = createExactAttemptIpcAnswerEnvelope(authority, answer);
    const answerReceipt = snapshotPrivateAnswerReceipt(
      value['answerReceipt'],
      authority,
      answerEnvelope,
      privateAnswerBytes,
    );
    return Object.freeze({
      state,
      privateAnswerUtf8: value['privateAnswerUtf8'],
      authority,
      answerReceipt,
    });
  }
  if (state === 'hold') {
    if (
      !isExactDataRecord(value, ['state', 'taskId', 'reasonCode'])
      || value['taskId'] !== expectedTaskId
      || !isExactAttemptIpcHoldReason(value['reasonCode'])
    ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
    return Object.freeze({ state, taskId: expectedTaskId, reasonCode: value['reasonCode'] });
  }
  if (state === 'question-ready') {
    if (!isExactDataRecord(value, ['state', 'authority', 'answerPublisher'])) {
      throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
    }
    return Object.freeze({
      state,
      authority: snapshotExactQuestionAuthority(value['authority'], expectedTaskId),
      answerPublisher: snapshotExactAnswerPublisher(value['answerPublisher']),
    });
  }
  throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
}

function resolveExactAttemptIpcAuthoritySnapshot(
  resolver: ResolveExactAttemptIpcAuthority,
  taskId: string,
): ExactAttemptIpcQuestionAuthorityState {
  try {
    return snapshotExactAttemptIpcAuthorityState(resolver(taskId), taskId);
  } catch (error) {
    return Object.freeze({
      state: 'hold',
      taskId,
      reasonCode: error instanceof ExactAttemptIpcHold
        ? error.reasonCode
        : 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
    });
  }
}

function exactAuthorityKey(authority: ExactAttemptIpcQuestionAuthority): string {
  const { identity } = authority;
  return exactIpcDigest('deckent.task-attempt-ipc.registry-key.v2', {
    projectRootSha256: identity.projectRootSha256,
    projectId: identity.projectId,
    taskId: identity.taskId,
    attemptId: identity.attemptId,
    generation: identity.generation,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    fenceDigest: authority.fenceDigest,
    questionReceiptDigest: authority.questionReceiptDigest,
    questionArtifactSha256: authority.questionArtifactSha256,
    sequence: authority.sequence,
    envelopeDigest: authority.envelopeDigest,
  });
}

function exactIpcLockTaskId(identity: TaskAttemptCustodyIdentityV2): string {
  const digest = exactIpcDigest('deckent.task-attempt-ipc.lock.v2', {
    projectRootSha256: identity.projectRootSha256,
    projectId: identity.projectId,
    taskId: identity.taskId,
  });
  return `ipc-projection-${digest.slice('sha256:'.length)}`;
}

function sameQuestionAuthority(
  state: ExactAttemptIpcQuestionAuthorityState,
  expected: ExactAttemptIpcQuestionAuthority,
): state is Extract<ExactAttemptIpcQuestionAuthorityState, { state: 'question-ready' }> {
  return state.state === 'question-ready'
    && sameExactQuestionAuthority(state.authority, expected);
}

function sameExactQuestionAuthority(
  observed: ExactAttemptIpcQuestionAuthority,
  expected: ExactAttemptIpcQuestionAuthority,
): boolean {
  return sameExactIdentity(observed.identity, expected.identity)
    && observed.admissionReceiptDigest === expected.admissionReceiptDigest
    && observed.fenceDigest === expected.fenceDigest
    && observed.sequence === expected.sequence
    && observed.questionReceiptDigest === expected.questionReceiptDigest
    && observed.questionArtifactSha256 === expected.questionArtifactSha256
    && observed.envelopeDigest === expected.envelopeDigest;
}

function sameAnsweredAuthority(
  state: ExactAttemptIpcQuestionAuthorityState,
  expected: ExactAttemptIpcQuestionAuthority,
  answerReceiptDigest: Sha256Digest,
): boolean {
  if (state.state !== 'answered') return false;
  return sameExactQuestionAuthority(state.authority, expected)
    && state.answerReceipt.receiptDigest === answerReceiptDigest;
}

function validatePrivateAnswerReceipt(
  receipt: ExactAttemptIpcPrivateAnswerReceipt,
  authority: ExactAttemptIpcQuestionAuthority,
  answerEnvelope: ExactAttemptIpcAnswerEnvelope,
): boolean {
  if (
    receipt === null
    || typeof receipt !== 'object'
    || nodeTypes.isProxy(receipt)
    || (Object.getPrototypeOf(receipt) !== Object.prototype
      && Object.getPrototypeOf(receipt) !== null)
  ) return false;
  const expectedKeys = [
    'schemaVersion', 'kind', 'identity', 'admissionReceiptDigest', 'fenceDigest',
    'sequence', 'questionReceiptDigest', 'questionEnvelopeDigest',
    'answerEnvelopeDigest', 'answerArtifactSha256', 'artifactKey', 'destinationChildRelativePath',
    'destinationProofDigest', 'deliveredAt', 'receiptDigest',
  ];
  const ownKeys = Reflect.ownKeys(receipt);
  if (
    ownKeys.length !== expectedKeys.length
    || ownKeys.some(key => typeof key !== 'string' || !expectedKeys.includes(key))
  ) return false;
  if (expectedKeys.some(key => {
    const descriptor = Object.getOwnPropertyDescriptor(receipt, key);
    return descriptor === undefined
      || !('value' in descriptor)
      || descriptor.enumerable !== true
      || descriptor.get !== undefined;
  })) return false;
  let receiptIdentity: TaskAttemptCustodyIdentityV2;
  try {
    receiptIdentity = snapshotExactIdentity(receipt.identity);
  } catch {
    return false;
  }
  const withoutDigest: ExactAttemptIpcPrivateAnswerReceiptBody = {
    schemaVersion: receipt.schemaVersion,
    kind: receipt.kind,
    identity: receipt.identity,
    admissionReceiptDigest: receipt.admissionReceiptDigest,
    fenceDigest: receipt.fenceDigest,
    sequence: receipt.sequence,
    questionReceiptDigest: receipt.questionReceiptDigest,
    questionEnvelopeDigest: receipt.questionEnvelopeDigest,
    answerEnvelopeDigest: receipt.answerEnvelopeDigest,
    answerArtifactSha256: receipt.answerArtifactSha256,
    artifactKey: receipt.artifactKey,
    destinationChildRelativePath: receipt.destinationChildRelativePath,
    destinationProofDigest: receipt.destinationProofDigest,
    deliveredAt: receipt.deliveredAt,
  };
  return receipt.schemaVersion === EXACT_ATTEMPT_IPC_SCHEMA_VERSION
    && receipt.kind === 'task-attempt-ipc-private-answer-receipt'
    && sameExactIdentity(receiptIdentity, authority.identity)
    && receipt.admissionReceiptDigest === authority.admissionReceiptDigest
    && receipt.fenceDigest === authority.fenceDigest
    && receipt.sequence === authority.sequence
    && receipt.questionReceiptDigest === authority.questionReceiptDigest
    && receipt.questionEnvelopeDigest === authority.envelopeDigest
    && receipt.answerEnvelopeDigest === answerEnvelope.envelopeDigest
    && isDigest(receipt.answerArtifactSha256)
    && receipt.artifactKey === `ipc-answer-${authority.sequence}`
    && receipt.destinationChildRelativePath === `task-${authority.identity.taskId}.answer`
    && isDigest(receipt.destinationProofDigest)
    && Number.isFinite(Date.parse(receipt.deliveredAt))
    && Date.parse(receipt.deliveredAt) >= Date.parse(authority.question.timestamp)
    && isDigest(receipt.receiptDigest)
    && receipt.receiptDigest === exactAttemptIpcPrivateAnswerReceiptDigest(withoutDigest);
}

function snapshotPrivateAnswerReceipt(
  value: unknown,
  authority: ExactAttemptIpcQuestionAuthority,
  answerEnvelope: ExactAttemptIpcAnswerEnvelope,
  privateAnswerBytes: Uint8Array,
): ExactAttemptIpcPrivateAnswerReceipt {
  const receipt = value as ExactAttemptIpcPrivateAnswerReceipt;
  if (
    !validatePrivateAnswerReceipt(receipt, authority, answerEnvelope)
    || receipt.answerArtifactSha256 !== rawSha256(privateAnswerBytes)
  ) throw new ExactAttemptIpcHold('PRIVATE_ANSWER_RECEIPT_INVALID');
  return Object.freeze({
    schemaVersion: EXACT_ATTEMPT_IPC_SCHEMA_VERSION,
    kind: 'task-attempt-ipc-private-answer-receipt',
    identity: snapshotExactIdentity(receipt.identity),
    admissionReceiptDigest: receipt.admissionReceiptDigest,
    fenceDigest: receipt.fenceDigest,
    sequence: receipt.sequence,
    questionReceiptDigest: receipt.questionReceiptDigest,
    questionEnvelopeDigest: receipt.questionEnvelopeDigest,
    answerEnvelopeDigest: receipt.answerEnvelopeDigest,
    answerArtifactSha256: receipt.answerArtifactSha256,
    artifactKey: receipt.artifactKey,
    destinationChildRelativePath: receipt.destinationChildRelativePath,
    destinationProofDigest: receipt.destinationProofDigest,
    deliveredAt: receipt.deliveredAt,
    receiptDigest: receipt.receiptDigest,
  });
}

function compatibilityProjectionPath(
  projectRoot: string,
  direction: 'question' | 'answer',
  taskId: string,
): string {
  return direction === 'question'
    ? getQuestionPath(projectRoot, taskId)
    : getAnswerPath(projectRoot, taskId);
}

interface ExactAttemptIpcCompatibilityProjection {
  readonly schemaVersion: 2;
  readonly kind: 'task-attempt-ipc-compatibility-projection';
  readonly authority: 'private-receipt-only';
  readonly direction: 'question' | 'answer';
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly sequence: number;
  readonly privateReceiptDigest: Sha256Digest;
  readonly envelopeDigest: Sha256Digest;
  readonly payload: WorkerQuestion | BrainAnswer;
  /** Legacy readers consume these payload fields at top level. They remain a
   * compatibility view and never carry authority. */
  readonly workerId?: string;
  readonly question?: string;
  readonly context?: string;
  readonly suggestedAction?: QuestionAction;
  readonly action?: QuestionAction;
  readonly message?: string;
  readonly timestamp: string;
}

function toCompatibilityProjection(
  direction: 'question' | 'answer',
  envelope: ExactAttemptIpcCompatibilityEnvelope,
): ExactAttemptIpcCompatibilityProjection {
  const question = envelope.kind === 'task-attempt-ipc-question-authority';
  const payload = question ? envelope.question : envelope.answerEnvelope.answer;
  return Object.freeze({
    ...payload,
    schemaVersion: 2,
    kind: 'task-attempt-ipc-compatibility-projection',
    authority: 'private-receipt-only',
    direction,
    projectId: envelope.identity.projectId,
    taskId: envelope.identity.taskId,
    attemptId: envelope.identity.attemptId,
    generation: envelope.identity.generation,
    sequence: envelope.sequence,
    privateReceiptDigest: question
      ? envelope.questionReceiptDigest
      : envelope.privateReceiptDigest,
    envelopeDigest: envelope.envelopeDigest,
    payload,
  });
}

function parseCompatibilityProjection(value: unknown): ExactAttemptIpcCompatibilityProjection | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || nodeTypes.isProxy(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const direction = record['direction'];
  const baseKeys = [
    'schemaVersion', 'kind', 'authority', 'direction', 'projectId', 'taskId',
    'attemptId', 'generation', 'sequence', 'privateReceiptDigest',
    'envelopeDigest', 'payload', 'timestamp',
  ];
  const allowedKeys = direction === 'question'
    ? [...baseKeys, 'workerId', 'question', 'context', 'suggestedAction']
    : [...baseKeys, 'action', 'message'];
  const ownKeys = Reflect.ownKeys(record);
  if (
    ownKeys.some(key => typeof key !== 'string' || !allowedKeys.includes(key))
    || record['schemaVersion'] !== 2
    || record['kind'] !== 'task-attempt-ipc-compatibility-projection'
    || record['authority'] !== 'private-receipt-only'
    || (record['direction'] !== 'question' && record['direction'] !== 'answer')
    || !boundedIdentityComponent(record['projectId'])
    || !boundedIdentityComponent(record['taskId'])
    || !boundedIdentityComponent(record['attemptId'])
    || !Number.isSafeInteger(record['generation'])
    || (record['generation'] as number) <= 0
    || !Number.isSafeInteger(record['sequence'])
    || (record['sequence'] as number) <= 0
    || !isDigest(record['privateReceiptDigest'])
    || !isDigest(record['envelopeDigest'])
    || record['payload'] === null
    || typeof record['payload'] !== 'object'
    || typeof record['timestamp'] !== 'string'
    || !Number.isFinite(Date.parse(record['timestamp']))
    || (direction === 'question' && (
      !boundedIdentityComponent(record['workerId'])
      || typeof record['question'] !== 'string'
      || record['question'].trim().length === 0
      || (record['context'] !== undefined && typeof record['context'] !== 'string')
      || (record['suggestedAction'] !== undefined
        && !['continue', 'skip', 'abort', 'retry'].includes(String(record['suggestedAction'])))
    ))
    || (direction === 'answer' && (
      !['continue', 'skip', 'abort', 'retry'].includes(String(record['action']))
      || (record['message'] !== undefined && typeof record['message'] !== 'string')
    ))
  ) return null;
  return record as unknown as ExactAttemptIpcCompatibilityProjection;
}

type CompatibilityProjectionRead =
  | { readonly state: 'absent' }
  | { readonly state: 'observed'; readonly projection: ExactAttemptIpcCompatibilityProjection }
  | { readonly state: 'hold'; readonly reasonCode: ExactAttemptIpcHoldReason };

export interface ExactAttemptIpcProjectionReadCapability {
  readonly noFollowFlag: number | undefined;
}

function filesystemErrorCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error
    ? String((error as { readonly code?: unknown }).code)
    : undefined;
}

/** Read one public projection through a single no-follow descriptor. The path
 * is never reopened between metadata checks and the bounded read. */
function resolveCompatibilityNoFollowFlag(
  capability?: ExactAttemptIpcProjectionReadCapability,
): number | null {
  const runtimeFlag: unknown = fsConstants.O_NOFOLLOW;
  if (typeof runtimeFlag !== 'number' || runtimeFlag === 0) return null;
  if (capability === undefined) return runtimeFlag;
  if (!isExactDataRecord(capability, ['noFollowFlag'])) return null;
  return capability.noFollowFlag === runtimeFlag ? runtimeFlag : null;
}

function readCompatibilityProjection(
  path: string,
  noFollowFlag: number | null,
): CompatibilityProjectionRead {
  if (noFollowFlag === null) {
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED' };
  }
  let fd: number | undefined;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | noFollowFlag);
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.size > 512 * 1024) {
      return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' };
    }
    const bounded = Buffer.alloc(before.size + 1);
    let bytesRead = 0;
    while (bytesRead < bounded.byteLength) {
      const count = readSync(fd, bounded, bytesRead, bounded.byteLength - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const after = fstatSync(fd);
    if (
      bytesRead !== before.size
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.nlink !== 1
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
    ) return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' };
    const projection = parseCompatibilityProjection(
      JSON.parse(bounded.subarray(0, bytesRead).toString('utf8')),
    );
    return projection
      ? { state: 'observed', projection }
      : { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_CORRUPT' };
  } catch (error) {
    return filesystemErrorCode(error) === 'ENOENT'
      ? { state: 'absent' }
      : { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_CORRUPT' };
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* compatibility projection only */ }
    }
  }
}

function compareCompatibilityProjection(
  observed: ExactAttemptIpcCompatibilityProjection,
  expected: ExactAttemptIpcCompatibilityProjection,
): ExactAttemptIpcProjectionResult {
  if (observed.projectId !== expected.projectId || observed.taskId !== expected.taskId) {
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' };
  }
  // A public projection is first-writer only. Any generation/sequence drift is
  // reconciliation debt; it is never repaired by overwriting the observed file.
  if (observed.generation !== expected.generation) {
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_STALE' };
  }
  if (observed.attemptId !== expected.attemptId) {
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SIBLING' };
  }
  if (observed.sequence !== expected.sequence) {
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_STALE' };
  }
  return observed.envelopeDigest === expected.envelopeDigest
    && canonicalExactIpcJson(observed) === canonicalExactIpcJson(expected)
    ? { state: 'existing-identical' }
    : { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' };
}

function resolveCompatibilityProjectionRead(
  read: CompatibilityProjectionRead,
  expected: ExactAttemptIpcCompatibilityProjection,
): ExactAttemptIpcProjectionResult | null {
  if (read.state === 'absent') return null;
  return read.state === 'hold'
    ? read
    : compareCompatibilityProjection(read.projection, expected);
}

function publishCompatibilityProjectionFirstWriter(
  projectRoot: string,
  direction: 'question' | 'answer',
  envelope: ExactAttemptIpcCompatibilityEnvelope,
  readCapability?: ExactAttemptIpcProjectionReadCapability,
): ExactAttemptIpcProjectionResult {
  if (
    (direction === 'question' && envelope.kind !== 'task-attempt-ipc-question-authority')
    || (direction === 'answer' && envelope.kind !== 'task-attempt-ipc-answer-authority')
  ) return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_SPOOF' };
  const projection = toCompatibilityProjection(direction, envelope);
  const path = compatibilityProjectionPath(projectRoot, direction, envelope.identity.taskId);
  const noFollowFlag = resolveCompatibilityNoFollowFlag(readCapability);
  const observed = resolveCompatibilityProjectionRead(
    readCompatibilityProjection(path, noFollowFlag),
    projection,
  );
  if (observed !== null) return observed;

  // Atomic no-replace admission: `wx` is the only operation that may create
  // the public path. A racing winner is never overwritten or unlinked.
  let fd: number | undefined;
  try {
    fd = openSync(path, 'wx', 0o600);
  } catch (error) {
    if (filesystemErrorCode(error) !== 'EEXIST') {
      return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED' };
    }
    const raced = resolveCompatibilityProjectionRead(
      readCompatibilityProjection(path, noFollowFlag),
      projection,
    );
    return raced ?? { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED' };
  }
  try {
    writeFileSync(fd, `${JSON.stringify(projection, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    const parentFd = openSync(dirname(path), 'r');
    try { fsyncSync(parentFd); } finally { closeSync(parentFd); }
  } catch {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* compatibility projection only */ }
    }
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED' };
  }
  return { state: 'published' };
}

/** The host execution lock coordinates cooperative writers but is not public
 * file authority. The resolver/fence is checked inside the operation and again
 * after the no-replace first-writer publication. */
export async function publishExactAttemptIpcCompatibilityProjection(
  projectRoot: string,
  direction: 'question' | 'answer',
  envelope: ExactAttemptIpcCompatibilityEnvelope,
  options: {
    readonly revalidate: () => boolean | Promise<boolean>;
    readonly readCapability?: ExactAttemptIpcProjectionReadCapability;
  },
): Promise<ExactAttemptIpcProjectionResult> {
  let outcome;
  try {
    outcome = await withExecutionLockOutcome(
      projectRoot,
      exactIpcLockTaskId(envelope.identity),
      'settlement',
      async context => {
        context.assertAuthority();
        if (!await options.revalidate()) {
          return { state: 'hold', reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED' } as const;
        }
        const projection = publishCompatibilityProjectionFirstWriter(
          projectRoot,
          direction,
          envelope,
          options.readCapability,
        );
        context.assertAuthority();
        if (!await options.revalidate()) {
          return { state: 'hold', reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED' } as const;
        }
        return projection;
      },
    );
  } catch {
    return { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED' };
  }
  return outcome.authority === 'released'
    ? outcome.value
    : { state: 'hold', reasonCode: 'PUBLIC_PROJECTION_RECONCILIATION_REQUIRED' };
}

export interface CheckExactAttemptWorkerQuestionsOptions {
  readonly resolveAuthority: ResolveExactAttemptIpcAuthority;
  readonly transientRegistry: ExactAttemptIpcTransientRegistry;
  readonly honorWorkerQuestionAction?: boolean;
  readonly sprintId?: string;
  readonly bridge?: HandleWorkerQuestionOptions['bridge'];
  readonly broker?: ApprovalBrokerLike;
  readonly questionBridgeEnabled?: boolean;
  /** Platform/test seam. A supplied value must exactly match the runtime
   * O_NOFOLLOW constant; otherwise public reads fail closed. */
  readonly projectionReadCapability?: ExactAttemptIpcProjectionReadCapability;
}

type ExactAttemptQuestionDecision = (
  | { readonly state: 'answered'; readonly taskId: string }
  | { readonly state: 'pending'; readonly taskId: string }
  | { readonly state: 'hold'; readonly taskId: string; readonly reasonCode: ExactAttemptIpcHoldReason }
) & { readonly projectionHolds?: readonly ExactAttemptIpcProjectionHold[] };

/** Bounded async-delivery latch. Pending operations time out into a terminal
 * HOLD; settled HOLD/answered decisions remain latched for the same full
 * authority key. Only durable answered proof or an exact authority change
 * clears them, so polling cannot silently restart approval/delivery. */
const EXACT_ATTEMPT_IPC_PENDING_TTL_MS = 30 * 60_000;
const EXACT_ATTEMPT_IPC_TRANSIENT_MAX_ENTRIES = 2_048;

type ExactAttemptIpcTransientEntry =
  | {
      readonly state: 'pending';
      readonly authority: ExactAttemptIpcQuestionAuthority;
      readonly promise: Promise<ExactAttemptQuestionDecision>;
      readonly expiresAt: number;
    }
  | {
      readonly state: 'settled';
      readonly authority: ExactAttemptIpcQuestionAuthority;
      readonly decision: ExactAttemptQuestionDecision;
    };

/** Process-local run-scoped latch. Durable restart truth remains a T18 Store
 * dependency; this object intentionally carries no cross-process authority. */
export interface ExactAttemptIpcTransientRegistry {
  readonly kind: 'exact-attempt-ipc-transient-registry';
}

interface ExactAttemptIpcTransientRegistryState {
  readonly projectRoot: string;
  readonly maxEntries: number;
  readonly entries: Map<string, ExactAttemptIpcTransientEntry>;
}

const exactAttemptIpcTransientRegistryStates = new WeakMap<
  ExactAttemptIpcTransientRegistry,
  ExactAttemptIpcTransientRegistryState
>();

export function createExactAttemptIpcTransientRegistry(
  projectRoot: string,
  options: { readonly maxEntries?: number } = {},
): ExactAttemptIpcTransientRegistry {
  if (typeof projectRoot !== 'string' || projectRoot.length === 0) {
    throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  }
  const maxEntries = options.maxEntries ?? EXACT_ATTEMPT_IPC_TRANSIENT_MAX_ENTRIES;
  if (
    !Number.isSafeInteger(maxEntries)
    || maxEntries <= 0
    || maxEntries > EXACT_ATTEMPT_IPC_TRANSIENT_MAX_ENTRIES
  ) throw new ExactAttemptIpcHold('PRIVATE_IPC_AUTHORITY_UNAVAILABLE');
  const registry = Object.freeze({
    kind: 'exact-attempt-ipc-transient-registry' as const,
  });
  exactAttemptIpcTransientRegistryStates.set(registry, {
    projectRoot,
    maxEntries,
    entries: new Map(),
  });
  return registry;
}

function requireExactAttemptIpcTransientRegistry(
  registry: ExactAttemptIpcTransientRegistry,
  projectRoot: string,
): ExactAttemptIpcTransientRegistryState | null {
  const state = exactAttemptIpcTransientRegistryStates.get(registry);
  return state?.projectRoot === projectRoot ? state : null;
}

function pruneExactAttemptIpcTransient(
  entries: Map<string, ExactAttemptIpcTransientEntry>,
  now = Date.now(),
): void {
  for (const [key, entry] of entries) {
    if (entry.state === 'settled' || entry.expiresAt > now) continue;
    entries.set(key, {
      state: 'settled',
      authority: entry.authority,
      decision: {
        state: 'hold',
        taskId: entry.authority.identity.taskId,
        reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
      },
    });
  }
}

function clearSupersededExactAttemptIpcTransient(
  entries: Map<string, ExactAttemptIpcTransientEntry>,
  current: ExactAttemptIpcQuestionAuthority,
): void {
  for (const [key, entry] of entries) {
    if (
      entry.authority.identity.projectRootSha256 === current.identity.projectRootSha256
      && entry.authority.identity.projectId === current.identity.projectId
      && entry.authority.identity.taskId === current.identity.taskId
      && !sameExactQuestionAuthority(entry.authority, current)
    ) entries.delete(key);
  }
}

function clearExactAttemptIpcTransientTask(
  entries: Map<string, ExactAttemptIpcTransientEntry>,
  taskId: string,
): void {
  for (const [key, entry] of entries) {
    if (entry.authority.identity.taskId === taskId) entries.delete(key);
  }
}

function clearInactiveExactAttemptIpcTransient(
  entries: Map<string, ExactAttemptIpcTransientEntry>,
  taskIds: Set<string>,
  collectedIds: Set<string>,
): void {
  for (const [key, entry] of entries) {
    const taskId = entry.authority.identity.taskId;
    if (!taskIds.has(taskId) || collectedIds.has(taskId)) entries.delete(key);
  }
}

function exactApprovalBinding(
  authority: ExactAttemptIpcQuestionAuthority,
): QuestionApprovalExactAttemptBinding {
  return Object.freeze({
    schemaVersion: 2,
    projectRootSha256: authority.identity.projectRootSha256,
    projectId: authority.identity.projectId,
    taskId: authority.identity.taskId,
    attemptId: authority.identity.attemptId,
    generation: authority.identity.generation,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    fenceDigest: authority.fenceDigest,
    questionReceiptDigest: authority.questionReceiptDigest,
    questionEnvelopeDigest: authority.envelopeDigest,
    sequence: authority.sequence,
  });
}

function automaticExactAnswer(
  authority: ExactAttemptIpcQuestionAuthority,
  options: CheckExactAttemptWorkerQuestionsOptions,
): BrainAnswer {
  const question = authority.question;
  if (isNpmAdvisoryQuestion(question)) {
    if (options.sprintId) {
      notifyAsync(
        'human-checkpoint-required',
        options.sprintId,
        `NPM advisory — task ${authority.identity.taskId}`,
        question.question,
        question.context,
      );
    }
    return Object.freeze({
      taskId: authority.identity.taskId,
      action: 'continue',
      message: NPM_ADVISORY_ANSWER_MESSAGE,
      timestamp: new Date().toISOString(),
    });
  }
  const honored: QuestionAction =
    options.honorWorkerQuestionAction === true && question.suggestedAction !== undefined
      ? question.suggestedAction
      : 'continue';
  return Object.freeze({
    taskId: authority.identity.taskId,
    action: honored,
    message: honored === 'continue'
      ? 'Auto-continue: Brain acknowledged question'
      : `Auto-${honored}: Brain honored worker's suggested action`,
    timestamp: new Date().toISOString(),
  });
}

async function resolveExactAnswer(
  authority: ExactAttemptIpcQuestionAuthority,
  options: CheckExactAttemptWorkerQuestionsOptions,
): Promise<BrainAnswer | ExactAttemptQuestionDecision> {
  if (
    options.questionBridgeEnabled === true
    && options.bridge !== undefined
    && options.broker !== undefined
    && !isNpmAdvisoryQuestion(authority.question)
  ) {
    const binding = exactApprovalBinding(authority);
    const bridged = await options.bridge(authority.question, options.broker, {
      exactAttemptBinding: binding,
      revalidateExactAttemptBinding: () => sameQuestionAuthority(
        resolveExactAttemptIpcAuthoritySnapshot(
          options.resolveAuthority,
          authority.identity.taskId,
        ),
        authority,
      ),
    });
    if (bridged.kind === 'bridged') return bridged.answer;
    if (bridged.kind === 'authority-hold') {
      return {
        state: 'hold',
        taskId: authority.identity.taskId,
        reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
      };
    }
    return {
      state: 'hold',
      taskId: authority.identity.taskId,
      reasonCode: 'PRIVATE_QUESTION_PAYLOAD_INVALID',
    };
  }
  return automaticExactAnswer(authority, options);
}

async function settleExactAttemptQuestion(
  projectRoot: string,
  initial: Extract<ExactAttemptIpcQuestionAuthorityState, { state: 'question-ready' }>,
  options: CheckExactAttemptWorkerQuestionsOptions,
): Promise<ExactAttemptQuestionDecision> {
  const authority = initial.authority;
  const projectionHolds: ExactAttemptIpcProjectionHold[] = [];
  const questionProjection = await publishExactAttemptIpcCompatibilityProjection(
    projectRoot,
    'question',
    authority,
    {
      revalidate: () => sameQuestionAuthority(
        resolveExactAttemptIpcAuthoritySnapshot(
          options.resolveAuthority,
          authority.identity.taskId,
        ),
        authority,
      ),
      readCapability: options.projectionReadCapability,
    },
  );
  if (questionProjection.state === 'hold') {
    projectionHolds.push({
      taskId: authority.identity.taskId,
      direction: 'question',
      reasonCode: questionProjection.reasonCode,
    });
  }

  // External approval may wait for minutes. It is deliberately outside the
  // execution-lock critical section; the bridge binds and revalidates the
  // exact private question receipt after the decision.
  const answerOrHold = await resolveExactAnswer(authority, options);
  if ('state' in answerOrHold) return { ...answerOrHold, projectionHolds };
  const answerEnvelope = createExactAttemptIpcAnswerEnvelope(authority, answerOrHold);
  // The immutable authority envelope remains receipt-bound metadata. The
  // mounted child path is consumed by readAnswerFile()/askBrain(), whose stable
  // wire contract is a top-level BrainAnswer rather than the authority wrapper.
  const privateAnswerBytes = Buffer.from(JSON.stringify(answerEnvelope.answer), 'utf8');
  let deliveryOutcome;
  try {
    deliveryOutcome = await withExecutionLockOutcome(
      projectRoot,
      exactIpcLockTaskId(authority.identity),
      'settlement',
      context => {
        context.assertAuthority();
        let current = resolveExactAttemptIpcAuthoritySnapshot(
          options.resolveAuthority,
          authority.identity.taskId,
        );
        if (!sameQuestionAuthority(current, authority)) {
          return {
            state: 'hold',
            taskId: authority.identity.taskId,
            reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
          } as const;
        }
        const publication = current.answerPublisher.publishAnswerFirstWriter({
          identity: authority.identity,
          admissionReceiptDigest: authority.admissionReceiptDigest,
          fenceDigest: authority.fenceDigest,
          sequence: authority.sequence,
          questionReceiptDigest: authority.questionReceiptDigest,
          questionEnvelopeDigest: authority.envelopeDigest,
          answerEnvelope,
          privateAnswerBytes,
          artifactKey: `ipc-answer-${authority.sequence}`,
          destinationChildRelativePath: `task-${authority.identity.taskId}.answer`,
        });
        if (publication.state === 'hold') {
          return {
            state: 'hold',
            taskId: authority.identity.taskId,
            reasonCode: publication.reasonCode,
          } as const;
        }
        if (
          !validatePrivateAnswerReceipt(publication.receipt, authority, answerEnvelope)
          || publication.receipt.answerArtifactSha256 !== rawSha256(privateAnswerBytes)
        ) {
          return {
            state: 'hold',
            taskId: authority.identity.taskId,
            reasonCode: 'PRIVATE_ANSWER_RECEIPT_INVALID',
          } as const;
        }
        current = resolveExactAttemptIpcAuthoritySnapshot(
          options.resolveAuthority,
          authority.identity.taskId,
        );
        if (
          !sameQuestionAuthority(current, authority)
          && !sameAnsweredAuthority(current, authority, publication.receipt.receiptDigest)
        ) {
          return {
            state: 'hold',
            taskId: authority.identity.taskId,
            reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED',
          } as const;
        }
        context.assertAuthority();
        return { state: 'published', receipt: publication.receipt } as const;
      },
    );
  } catch {
    return {
      state: 'hold',
      taskId: authority.identity.taskId,
      reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
      projectionHolds,
    };
  }
  if (deliveryOutcome.authority !== 'released') {
    return {
      state: 'hold',
      taskId: authority.identity.taskId,
      reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE',
      projectionHolds,
    };
  }
  if (deliveryOutcome.value.state === 'hold') {
    return {
      ...deliveryOutcome.value,
      projectionHolds,
    };
  }
  const publicationReceipt = deliveryOutcome.value.receipt;

  const answerWithoutDigest = {
    schemaVersion: EXACT_ATTEMPT_IPC_SCHEMA_VERSION,
    kind: 'task-attempt-ipc-answer-authority' as const,
    identity: authority.identity,
    admissionReceiptDigest: authority.admissionReceiptDigest,
    fenceDigest: authority.fenceDigest,
    sequence: authority.sequence,
    privateReceiptDigest: publicationReceipt.receiptDigest,
    answerEnvelope,
  };
  const answerAuthority = Object.freeze({
    ...answerWithoutDigest,
    envelopeDigest: exactIpcDigest(
      'deckent.task-attempt-ipc.answer-authority.v2',
      answerWithoutDigest,
    ),
  });
  const answerProjection = await publishExactAttemptIpcCompatibilityProjection(
    projectRoot,
    'answer',
    answerAuthority,
    {
      revalidate: () => {
        const observed = resolveExactAttemptIpcAuthoritySnapshot(
          options.resolveAuthority,
          authority.identity.taskId,
        );
        return sameQuestionAuthority(observed, authority)
          || sameAnsweredAuthority(observed, authority, publicationReceipt.receiptDigest);
      },
      readCapability: options.projectionReadCapability,
    },
  );
  if (answerProjection.state === 'hold') {
    projectionHolds.push({
      taskId: authority.identity.taskId,
      direction: 'answer',
      reasonCode: answerProjection.reasonCode,
    });
  }
  return { state: 'answered', taskId: authority.identity.taskId, projectionHolds };
}

function appendExactDecision(
  report: {
    answered: string[];
    pending: string[];
    notDispatched: string[];
    holds: Array<{ taskId: string; reasonCode: ExactAttemptIpcHoldReason }>;
    projectionHolds: ExactAttemptIpcProjectionHold[];
  },
  decision: ExactAttemptQuestionDecision,
): void {
  if (decision.state === 'answered') report.answered.push(decision.taskId);
  else if (decision.state === 'pending') report.pending.push(decision.taskId);
  else report.holds.push({ taskId: decision.taskId, reasonCode: decision.reasonCode });
  if (decision.projectionHolds) report.projectionHolds.push(...decision.projectionHolds);
}

/** Normal-Docker poll entrypoint. It never inspects public question/answer
 * files for authority. Human-approval waits remain non-blocking; their exact
 * identity-keyed operation is surfaced by a later poll. */
export async function checkExactAttemptWorkerQuestions(
  projectRoot: string,
  taskIds: Set<string>,
  collectedIds: Set<string>,
  options: CheckExactAttemptWorkerQuestionsOptions,
): Promise<ExactAttemptIpcCheckReport> {
  const report = {
    answered: [] as string[],
    pending: [] as string[],
    notDispatched: [] as string[],
    holds: [] as Array<{ taskId: string; reasonCode: ExactAttemptIpcHoldReason }>,
    projectionHolds: [] as ExactAttemptIpcProjectionHold[],
  };
  const registryState = requireExactAttemptIpcTransientRegistry(
    options.transientRegistry,
    projectRoot,
  );
  if (registryState === null) {
    for (const taskId of taskIds) {
      if (!collectedIds.has(taskId)) {
        report.holds.push({ taskId, reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE' });
      }
    }
    return Object.freeze(report);
  }
  const entries = registryState.entries;
  pruneExactAttemptIpcTransient(entries);
  clearInactiveExactAttemptIpcTransient(entries, taskIds, collectedIds);
  for (const taskId of taskIds) {
    if (collectedIds.has(taskId)) {
      clearExactAttemptIpcTransientTask(entries, taskId);
      continue;
    }
    const state = resolveExactAttemptIpcAuthoritySnapshot(options.resolveAuthority, taskId);
    if (state.state === 'not-dispatched') {
      clearExactAttemptIpcTransientTask(entries, taskId);
      report.notDispatched.push(taskId);
      continue;
    }
    if (state.state === 'hold') {
      report.holds.push({ taskId, reasonCode: state.reasonCode });
      continue;
    }
    if (state.state === 'answered') {
      clearExactAttemptIpcTransientTask(entries, taskId);
      report.answered.push(taskId);
      continue;
    }
    if (state.state === 'absent') {
      clearExactAttemptIpcTransientTask(entries, taskId);
      report.pending.push(taskId);
      continue;
    }
    const key = exactAuthorityKey(state.authority);
    clearSupersededExactAttemptIpcTransient(entries, state.authority);
    const bridgeIsAsync = options.questionBridgeEnabled === true
      && options.bridge !== undefined
      && options.broker !== undefined
      && !isNpmAdvisoryQuestion(state.authority.question);
    if (bridgeIsAsync) {
      const existing = entries.get(key);
      if (existing && !sameExactQuestionAuthority(existing.authority, state.authority)) {
        entries.delete(key);
        report.holds.push({ taskId, reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED' });
        continue;
      }
      if (existing?.state === 'settled') {
        appendExactDecision(report, existing.decision);
        continue;
      }
      if (!existing) {
        if (entries.size >= registryState.maxEntries) {
          report.holds.push({ taskId, reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE' });
          continue;
        }
        const running = settleExactAttemptQuestion(projectRoot, state, options)
          .catch(() => ({
            state: 'hold' as const,
            taskId,
            reasonCode: 'PRIVATE_IPC_AUTHORITY_UNAVAILABLE' as const,
          }));
        const pending: ExactAttemptIpcTransientEntry = {
          state: 'pending',
          authority: state.authority,
          promise: running,
          expiresAt: Date.now() + EXACT_ATTEMPT_IPC_PENDING_TTL_MS,
        };
        entries.set(key, pending);
        void running.then(decision => {
          if (entries.get(key) !== pending) return;
          entries.set(key, {
            state: 'settled',
            authority: pending.authority,
            decision,
          });
        });
      }
      report.pending.push(taskId);
      continue;
    }
    const decision = await settleExactAttemptQuestion(projectRoot, state, options);
    appendExactDecision(report, decision);
  }
  return Object.freeze(report);
}

// ─── askBrain — File-based Question Mechanism ──────────────────────

/**
 * askBrain — File-based question mechanism for workers.
 *
 * 1. Writes a .question file with the worker's question
 * 2. Polls for a .answer file at the given interval
 * 3. Returns the answer action, or the default 'continue' on timeout
 * 4. Cleans up question/answer files after resolution
 *
 * @param projectRoot - Project root directory
 * @param taskId - The task ID
 * @param workerId - The worker ID
 * @param question - The question text
 * @param options - Polling and timeout options
 * @returns The action from Brain's answer
 */
export async function askBrain(
  projectRoot: string,
  taskId: string,
  workerId: string,
  question: string,
  options?: {
    context?: string;
    suggestedAction?: QuestionAction;
    timeoutMs?: number;
    pollIntervalMs?: number;
    channel?: WorkerSideChannel;
  },
): Promise<BrainAnswer> {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1_000;

  const questionData: WorkerQuestion = {
    taskId,
    workerId,
    question,
    context: options?.context,
    suggestedAction: options?.suggestedAction,
    timestamp: new Date().toISOString(),
  };

  const channel = options?.channel;

  // If IPC channel is available and supports IPC, send question via IPC
  if (channel && channel.supportsIPC() && !channel.isClosed()) {
    return new Promise<BrainAnswer>((resolve) => {
      const timer = setTimeout(() => {
        const defaultAnswer: BrainAnswer = {
          taskId,
          action: 'continue',
          message: 'Auto-continue: IPC question timed out waiting for Brain response',
          timestamp: new Date().toISOString(),
        };
        resolve(defaultAnswer);
      }, timeoutMs);

      channel.onMessage('ANSWER', (msg) => {
        clearTimeout(timer);
        const answer = msg.payload as BrainAnswer;
        resolve(answer ?? {
          taskId,
          action: 'continue',
          message: 'Auto-continue: Brain answered via IPC',
          timestamp: new Date().toISOString(),
        });
      });

      channel.send('QUESTION', questionData);
      // Also write file for compatibility
      writeQuestionFile(projectRoot, questionData);
    });
  }

  // File-based fallback for tmux/docker backends
  writeQuestionFile(projectRoot, questionData);

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const answer = readAnswerFile(projectRoot, taskId);
    if (answer) {
      cleanupQuestionFiles(projectRoot, taskId);
      return answer;
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout — return default 'continue' answer
  const defaultAnswer: BrainAnswer = {
    taskId,
    action: 'continue',
    message: 'Auto-continue: question timed out waiting for Brain response',
    timestamp: new Date().toISOString(),
  };

  cleanupQuestionFiles(projectRoot, taskId);
  return defaultAnswer;
}

// ─── Brain-Side Question Handlers ──────────────────────────────────
// Moved from result-collector.ts — Brain auto-answers worker questions.

/** Options for {@link handleWorkerQuestion} / {@link checkWorkerQuestions}. */
export interface HandleWorkerQuestionOptions {
  /**
   * Flag-gated, default-off (mirrors config `honor_worker_question_action`).
   * When `true` AND the worker's question carries a `suggestedAction`, Brain
   * writes that action into the answer instead of the hardcoded `'continue'`.
   * When omitted/false, or when no `suggestedAction` is present, behaviour is
   * byte-for-byte the historical `'continue'` auto-answer.
   *
   * NPM-ADVISORY questions are exempt: their answer is a deterministic policy
   * (fail-closed `'continue'` + explicit not-approved message) regardless of
   * this flag — a worker cannot self-approve a dependency mutation.
   */
  honorWorkerQuestionAction?: boolean;
  /** Sprint id for human-facing notifications (NPM-ADVISORY surfacing). When
   *  absent the advisory is still answered + debug-logged, just not notified. */
  sprintId?: string;

  // ─── CKPT-QUESTION-BRIDGE-WIRE (358-007) seam ──────────────────────────
  // Sprint-357 built `bridgeQuestionToApproval` (question-approval-bridge.ts)
  // as a pure, deliberately-unwired module. This seam threads it into the live
  // question loop: when `questionBridgeEnabled` reads true AND both `bridge`
  // and `broker` are supplied, a non-NPM-ADVISORY question is delegated to the
  // runtime-wide ApprovalBroker instead of the hardcoded/suggestedAction
  // auto-answer below. Omit any of the three and behavior is byte-for-byte the
  // historical auto-answer — the seam is fully caller-opt-in.

  /**
   * Injected `bridgeQuestionToApproval`-shaped function. Typed structurally
   * (not imported as a value — see the `import type` note above) so a real
   * caller can pass the function straight through with no wrapper.
   */
  bridge?: (
    question: WorkerQuestion,
    broker: ApprovalBrokerLike,
    opts?: QuestionBridgeOptions,
  ) => Promise<QuestionBridgeResult>;
  /** The ApprovalBrokerLike instance the bridged question submits to. Required
   *  alongside `bridge` for the seam to activate. */
  broker?: ApprovalBrokerLike;
  /**
   * Pre-computed `approval.question_bridge` config flag (caller derives this
   * via `isQuestionBridgeEnabled(config)` from question-approval-bridge.ts —
   * kept out of this module to avoid importing that reader as a value).
   * Default-off: omitted/false means the bridge seam never activates even when
   * `bridge` + `broker` are both supplied.
   */
  questionBridgeEnabled?: boolean;
}

// ─── CKPT-QUESTION-BRIDGE-WIRE in-flight guard ─────────────────────────────
// A poll loop calls checkWorkerQuestions every tick against the SAME
// still-unconsumed .question file (the worker only deletes it after reading
// its .answer). Without this guard, every tick while a broker round-trip is
// pending would submit a fresh duplicate ApprovalRequest. Keyed by taskId —
// cleared once the in-flight bridge call settles (success or error).
const inFlightBridgeTaskIds = new Set<string>();

// ─── NPM-ADVISORY (born-454) ────────────────────────────────────────
// Worker-side marker for dependency-mutation escalation. The god-prompt
// (prompt-god-template.ts NPM_ADVISORY_BLOCK) instructs workers to prefix
// their question with this token instead of ever running npm/yarn/pnpm
// install in the mounted workspace (sprint-356 live incident: native-binding
// destruction via host-vs-container ABI + `.npmrc ignore-scripts=true`).

/** Question-text marker for a dependency-mutation advisory. */
export const NPM_ADVISORY_MARKER = '[NPM-ADVISORY]';

/** Deterministic fail-closed answer body for NPM-ADVISORY questions. */
export const NPM_ADVISORY_ANSWER_MESSAGE =
  'NPM-ADVISORY acknowledged — dependency mutation is NOT approved inside the workspace. '
  + 'Do NOT run npm/yarn/pnpm install|ci|rebuild|update. Continue the task without the '
  + 'dependency change, record the need in your .result notes on an `npmAdvisory:` line, '
  + 'and self-assess honestly. Dependency changes are performed host-side by the operator.';

function isNpmAdvisoryQuestion(question: WorkerQuestion): boolean {
  return question.question.trimStart().startsWith(NPM_ADVISORY_MARKER);
}

/**
 * Handle a single worker question by writing an auto-answer.
 *
 * By default (flag off) Brain auto-responds with `'continue'` — the historical
 * "Future: Human Checkpoint" stub behaviour. When
 * `options.honorWorkerQuestionAction` is `true` (config `honor_worker_question_action`)
 * AND the worker supplied a `suggestedAction` (`'skip' | 'abort' | 'retry' | 'continue'`),
 * Brain honors that requested action instead of the hardcoded continue.
 *
 * @returns The answer that was written, or undefined if no question was found
 */
export function handleWorkerQuestion(
  projectRoot: string,
  taskId: string,
  options?: HandleWorkerQuestionOptions,
): BrainAnswer | undefined {
  const question = readQuestionFile(projectRoot, taskId);
  if (!question) return undefined;

  // NPM-ADVISORY (born-454): deterministic policy branch — fail-closed
  // 'continue' + explicit not-approved message, suggestedAction NEVER honored
  // (a worker cannot self-approve a dependency mutation). Notified to the
  // human exactly once: re-answer cycles (the poll loop re-visits an
  // unconsumed question file every tick) skip the notify when an answer for
  // this task already exists on disk.
  if (isNpmAdvisoryQuestion(question)) {
    const firstAnswer = !existsSync(getAnswerPath(projectRoot, taskId));
    const answer: BrainAnswer = {
      taskId,
      action: 'continue',
      message: NPM_ADVISORY_ANSWER_MESSAGE,
      timestamp: new Date().toISOString(),
    };
    writeAnswerFile(projectRoot, answer);
    debugLog('handleWorkerQuestion', `NPM-ADVISORY from task ${taskId}: "${question.question}" → fail-closed continue`);
    if (firstAnswer && options?.sprintId) {
      notifyAsync(
        'human-checkpoint-required',
        options.sprintId,
        `NPM advisory — task ${taskId}`,
        question.question,
        question.context,
      );
    }
    return answer;
  }

  // CKPT-QUESTION-BRIDGE-WIRE (358-007): flag-on + seam-supplied → delegate to
  // the runtime-wide ApprovalBroker instead of the hardcoded/suggestedAction
  // auto-answer below. NPM-ADVISORY questions never reach here (returned above,
  // unconditionally, regardless of this flag). Flag-off, or bridge/broker
  // omitted, falls straight through to the byte-identical historical path.
  if (options?.questionBridgeEnabled === true && options.bridge !== undefined && options.broker !== undefined) {
    // A prior tick's bridge call already settled this question — surface that
    // answer directly. Never re-submit a question that already has an answer.
    const settled = readAnswerFile(projectRoot, taskId);
    if (settled) return settled;

    if (!inFlightBridgeTaskIds.has(taskId)) {
      inFlightBridgeTaskIds.add(taskId);
      const bridge = options.bridge;
      const broker = options.broker;
      bridge(question, broker)
        .then((result) => {
          if (result.kind === 'bridged') {
            writeAnswerFile(projectRoot, result.answer);
            debugLog(
              'handleWorkerQuestion',
              `Bridged question for task ${taskId} → '${result.answer.action}' via ${result.decision.channel}`,
            );
          } else if (result.kind === 'npm-advisory-rejected') {
            // Structurally unreachable: the NPM-ADVISORY branch above already
            // returns before this seam is ever reached for such a question.
            debugLog('handleWorkerQuestion', `Unexpected bridge rejection for task ${taskId}: ${result.note}`);
          } else {
            debugLog(
              'handleWorkerQuestion',
              `Bridge authority HOLD for task ${taskId}: ${result.reasonCode}`,
            );
          }
        })
        .catch((err: unknown) => {
          debugLog(
            'handleWorkerQuestion',
            `Bridge error for task ${taskId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        })
        .finally(() => {
          inFlightBridgeTaskIds.delete(taskId);
        });
    }

    // Fire-and-forget: checkWorkerQuestions' poll loop must not block on the
    // broker round-trip. The .answer file is written whenever the bridge
    // settles (above); this call itself returns undefined until it does.
    return undefined;
  }

  // Flag-gated (default-off): honor the worker's requested action only when the
  // flag is ON and a suggestedAction was actually supplied. Otherwise fall back
  // to the historical 'continue' auto-answer, byte-for-byte.
  const honored: QuestionAction =
    options?.honorWorkerQuestionAction === true && question.suggestedAction !== undefined
      ? question.suggestedAction
      : 'continue';

  const answer: BrainAnswer =
    honored === 'continue'
      ? {
          taskId,
          action: 'continue',
          message: 'Auto-continue: Brain acknowledged question',
          timestamp: new Date().toISOString(),
        }
      : {
          taskId,
          action: honored,
          message: `Auto-${honored}: Brain honored worker's suggested action`,
          timestamp: new Date().toISOString(),
        };

  writeAnswerFile(projectRoot, answer);
  debugLog('handleWorkerQuestion', `Auto-answered question for task ${taskId} with '${honored}': "${question.question}"`);
  return answer;
}

/**
 * Check all active (uncollected) tasks for pending .question files.
 * Called on each poll cycle in the waitForResults loop.
 *
 * @param projectRoot - Project root directory
 * @param taskIds - All task IDs in the sprint
 * @param collectedIds - Already collected (finished) task IDs
 * @param options - Forwarded to {@link handleWorkerQuestion} (flag-gated suggestedAction honoring)
 * @returns Array of task IDs that had questions answered
 */
export function checkWorkerQuestions(
  projectRoot: string,
  taskIds: Set<string>,
  collectedIds: Set<string>,
  options?: HandleWorkerQuestionOptions,
): string[] {
  const answered: string[] = [];
  for (const taskId of taskIds) {
    if (collectedIds.has(taskId)) continue;
    const questionPath = getQuestionPath(projectRoot, taskId);
    if (existsSync(questionPath)) {
      const result = handleWorkerQuestion(projectRoot, taskId, options);
      if (result) answered.push(taskId);
    }
  }
  return answered;
}
