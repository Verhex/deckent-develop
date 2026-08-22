import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { validateTaskResult, type TaskResultV1 } from './task-result-schema.js';

export const TASK_RESULT_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_TASK_RESULT_MAX_BYTES = 1024 * 1024;

export type TaskResultWriteErrorCode =
  | 'invalid-identity'
  | 'invalid-value'
  | 'invalid-utf8'
  | 'invalid-json'
  | 'non-canonical-bytes'
  | 'oversize'
  | 'schema-invalid'
  | 'identity-mismatch'
  | 'conflict'
  | 'existing-result-invalid'
  | 'write-in-progress'
  | 'io-failure';

export class TaskResultWriteError extends Error {
  readonly code: TaskResultWriteErrorCode;
  readonly cause?: unknown;

  constructor(code: TaskResultWriteErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'TaskResultWriteError';
    this.code = code;
    this.cause = cause;
  }
}

export interface TaskResultIdentity {
  readonly taskId: string;
  readonly attemptId: string;
}

export interface CanonicalTaskResultDocument extends TaskResultIdentity {
  readonly schemaVersion: typeof TASK_RESULT_DOCUMENT_SCHEMA_VERSION;
  readonly result: TaskResultV1;
}

export interface TaskResultRenameAdapter {
  /**
   * Rename a same-directory temporary file to an absent destination. The
   * authority serializes writers and proves absence first. In particular, the
   * adapter must not rely on POSIX's replace-existing rename semantics; this
   * contract is also valid for Windows, where replacement can fail.
   */
  readonly platform: 'posix' | 'windows';
  renameAbsent(source: string, destination: string): void;
}

export const nodeTaskResultRenameAdapter: TaskResultRenameAdapter = {
  platform: process.platform === 'win32' ? 'windows' : 'posix',
  renameAbsent: renameSync,
};

function fail(code: TaskResultWriteErrorCode, message: string, cause?: unknown): never {
  throw new TaskResultWriteError(code, message, cause);
}

function assertIdentity(identity: TaskResultIdentity): void {
  for (const [name, value] of Object.entries(identity)) {
    if (typeof value !== 'string' || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) {
      fail('invalid-identity', `${name} must be a non-empty identifier without control characters`);
    }
  }
}

/** Strict canonical JSON. Unsupported JS values are rejected, never omitted or coerced. */
export function canonicalTaskResultJson(value: unknown): string {
  const ancestors = new Set<object>();
  const encode = (candidate: unknown, path: string): string => {
    if (candidate === null) return 'null';
    if (typeof candidate === 'string') {
      if (/[\u0000-\u001f\u007f]/u.test(candidate)) fail('invalid-value', `${path} contains a control character`);
      return JSON.stringify(candidate);
    }
    if (typeof candidate === 'boolean') return candidate ? 'true' : 'false';
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate) || Object.is(candidate, -0)) fail('invalid-value', `${path} contains a non-canonical number`);
      return String(candidate);
    }
    if (typeof candidate !== 'object') fail('invalid-value', `${path} contains an unsupported ${typeof candidate}`);
    const object = candidate as object;
    if (ancestors.has(object)) fail('invalid-value', `${path} contains a cycle`);
    ancestors.add(object);
    try {
      if (Array.isArray(candidate)) {
        for (let index = 0; index < candidate.length; index += 1) {
          if (!Object.hasOwn(candidate, index)) fail('invalid-value', `${path} contains a sparse array`);
        }
        return `[${candidate.map((entry, index) => encode(entry, `${path}[${index}]`)).join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) fail('invalid-value', `${path} must contain only plain objects`);
      const record = candidate as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys.map(key => {
        if (/[\u0000-\u001f\u007f]/u.test(key)) fail('invalid-value', `${path} contains an invalid property name`);
        return `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`;
      }).join(',')}}`;
    } finally {
      ancestors.delete(object);
    }
  };
  return encode(value, '$');
}

export function canonicalTaskResultBytes(document: CanonicalTaskResultDocument): Uint8Array {
  return Buffer.from(`${canonicalTaskResultJson(document)}\n`, 'utf8');
}

function parseDocument(value: unknown, expected: TaskResultIdentity): CanonicalTaskResultDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail('schema-invalid', 'task result document must be an object');
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== TASK_RESULT_DOCUMENT_SCHEMA_VERSION) fail('schema-invalid', 'unsupported task result document schemaVersion');
  if (source.taskId !== expected.taskId || source.attemptId !== expected.attemptId) fail('identity-mismatch', 'task result does not belong to the expected task and attempt');
  const parsed = validateTaskResult(source.result);
  if (!parsed.ok) fail('schema-invalid', `invalid task result: ${parsed.errors.join('; ')}`);
  if (parsed.value.taskId !== expected.taskId) fail('identity-mismatch', 'embedded result belongs to a different task');
  let sourceJson: string;
  try {
    sourceJson = canonicalTaskResultJson(source.result);
  } catch (error) {
    fail('schema-invalid', 'task result contains a value outside the canonical schema', error);
  }
  if (sourceJson !== canonicalTaskResultJson(parsed.value)) {
    fail('schema-invalid', 'task result must already have its canonical schema shape');
  }
  return { schemaVersion: 1, taskId: expected.taskId, attemptId: expected.attemptId, result: parsed.value };
}

export function decodeCanonicalTaskResultBytes(
  bytes: Uint8Array,
  expected: TaskResultIdentity,
  maxBytes = DEFAULT_TASK_RESULT_MAX_BYTES,
): CanonicalTaskResultDocument {
  assertIdentity(expected);
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) fail('invalid-value', 'maxBytes must be a positive safe integer');
  if (bytes.byteLength > maxBytes) fail('oversize', `task result exceeds ${maxBytes} bytes`);
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (error) { fail('invalid-utf8', 'task result is not valid UTF-8', error); }
  let raw: unknown;
  try { raw = JSON.parse(text) as unknown; } catch (error) { fail('invalid-json', 'task result is not valid JSON', error); }
  const document = parseDocument(raw, expected);
  const canonical = canonicalTaskResultBytes(document);
  if (!Buffer.from(bytes).equals(Buffer.from(canonical))) fail('non-canonical-bytes', 'task result bytes are not the canonical encoding');
  return document;
}

export interface WriteTaskResultOptions extends TaskResultIdentity {
  readonly path: string;
  readonly result: unknown;
  readonly maxBytes?: number;
  readonly renameAdapter?: TaskResultRenameAdapter;
}

export type TaskResultWriteOutcome = { readonly state: 'written' | 'already-written'; readonly document: CanonicalTaskResultDocument };

/** Publish exactly once via same-directory temp + file fsync + rename + directory fsync. */
export function writeTaskResultAtomic(options: WriteTaskResultOptions): TaskResultWriteOutcome {
  const identity = { taskId: options.taskId, attemptId: options.attemptId };
  assertIdentity(identity);
  const document = parseDocument({ schemaVersion: 1, ...identity, result: options.result }, identity);
  const bytes = canonicalTaskResultBytes(document);
  const maxBytes = options.maxBytes ?? DEFAULT_TASK_RESULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) fail('invalid-value', 'maxBytes must be a positive safe integer');
  if (bytes.byteLength > maxBytes) fail('oversize', `task result exceeds ${maxBytes} bytes`);
  const directory = dirname(options.path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = `${options.path}.write-lock`;
  try { mkdirSync(lock, { mode: 0o700 }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') fail('write-in-progress', 'another task-result writer holds the publication lock');
    fail('io-failure', 'could not acquire task-result publication lock', error);
  }
  const temporary = `${options.path}.tmp-${randomUUID()}`;
  let descriptor: number | undefined;
  try {
    if (existsSync(options.path)) {
      let existing: CanonicalTaskResultDocument;
      try { existing = decodeCanonicalTaskResultBytes(readFileSync(options.path), identity, maxBytes); } catch (error) {
        if (error instanceof TaskResultWriteError && ['invalid-utf8', 'invalid-json', 'non-canonical-bytes', 'schema-invalid'].includes(error.code)) {
          fail('existing-result-invalid', 'existing terminal task result is invalid; refusing replacement', error);
        }
        throw error;
      }
      if (Buffer.from(readFileSync(options.path)).equals(Buffer.from(bytes))) return { state: 'already-written', document: existing };
      fail('conflict', 'a different terminal task result was already published');
    }
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    (options.renameAdapter ?? nodeTaskResultRenameAdapter).renameAbsent(temporary, options.path);
    const directoryDescriptor = openSync(directory, 'r');
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    return { state: 'written', document };
  } catch (error) {
    if (error instanceof TaskResultWriteError) throw error;
    fail('io-failure', 'task result publication failed', error);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { /* preserve primary outcome */ } }
    try { rmdirSync(lock); } catch { /* a foreign entry makes the lock visibly fail closed */ }
  }
  fail('io-failure', 'task result publication ended without a terminal outcome');
}

export function readTaskResult(
  path: string,
  expected: TaskResultIdentity,
  maxBytes = DEFAULT_TASK_RESULT_MAX_BYTES,
): CanonicalTaskResultDocument {
  return decodeCanonicalTaskResultBytes(readFileSync(path), expected, maxBytes);
}
