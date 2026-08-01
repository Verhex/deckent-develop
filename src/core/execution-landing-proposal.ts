import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { canonicalJson } from './audit-writer.js';
import { TASKS_DIR } from './constants.js';
import { createExecutionAuthorityError } from './errors.js';
import type { ExecutionLandingSemanticStateV1 } from './execution-landing-checkpoint.js';

export const EXECUTION_LANDING_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const LANDING_PROPOSAL_SCHEMA_VERSION = 2 as const;
export const EXECUTION_LANDING_PROPOSAL_MAX_BYTES = 64 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ExecutionLandingProposalV1 extends ExecutionLandingSemanticStateV1 {
  version: typeof EXECUTION_LANDING_PROPOSAL_SCHEMA_VERSION;
  taskId: string;
  attemptId: string;
  sequence: number;
  updatedAt: string;
}

export interface ExecutionLandingProposalEnvelopeV1 {
  proposal: ExecutionLandingProposalV1;
  proposalSha256: string;
  relativePath: string;
  observedMtime: string;
}

export interface LandingProposalResultReferenceV2 {
  taskId: string;
  attemptId: string;
  generation: number;
  relativePath: string;
}

/** Provider-neutral, untrusted worker progress proposed to the host finalizer. */
export interface LandingProposalV2 extends ExecutionLandingSemanticStateV1 {
  version: typeof LANDING_PROPOSAL_SCHEMA_VERSION;
  taskId: string;
  attemptId: string;
  generation: number;
  sequence: number;
  resultReference: LandingProposalResultReferenceV2;
  updatedAt: string;
}

export interface WriteExecutionLandingProposalResult {
  relativePath: string;
  proposalSha256: string;
  observedMtime: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertTaskId(taskId: string): void {
  if (
    !taskId
    || taskId.length > 200
    || taskId.includes('/')
    || taskId.includes('\\')
    || taskId.includes('\0')
    || basename(taskId) !== taskId
    || taskId === '.'
    || taskId === '..'
  ) {
    throw createExecutionAuthorityError('Execution landing proposal taskId is not path-safe');
  }
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} must be non-empty and at most ${maxLength} characters`);
  }
  return value;
}

function boundedList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} must contain at most 50 items`);
  }
  return value.map((item, index) => boundedText(item, `${field}[${index}]`, 1_000));
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} must be a positive safe integer`);
  }
  return value as number;
}

function assertSerializable(value: unknown, seen = new Set<object>(), field = 'proposal'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw createExecutionAuthorityError(`Execution landing proposal ${field} contains a non-serializable number`);
  }
  if (typeof value !== 'object') {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} contains non-serializable data`);
  }
  if (seen.has(value)) {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} contains a cycle`);
  }
  const record = value as Record<string, unknown>;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} must contain only plain JSON values`);
  }
  if ('toJSON' in record) {
    throw createExecutionAuthorityError(`Execution landing proposal ${field} must not use toJSON serialization`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) {
      throw createExecutionAuthorityError(`Execution landing proposal ${field} contains a sparse array`);
    }
    value.forEach((item, index) => assertSerializable(item, seen, `${field}[${index}]`));
  } else {
    for (const [key, item] of Object.entries(record)) assertSerializable(item, seen, `${field}.${key}`);
  }
  seen.delete(value);
}

function assertRelativeResultPath(value: unknown, taskId: string): string {
  const path = boundedText(value, 'resultReference.relativePath', 1_000);
  if (path !== `${TASKS_DIR}/task-${taskId}.result`) {
    throw createExecutionAuthorityError('Execution landing proposal result reference escapes or conflicts with task identity');
  }
  return path;
}

export function parseLandingProposalV2(value: unknown): LandingProposalV2 {
  assertSerializable(value);
  const keys = new Set([
    'version', 'taskId', 'attemptId', 'generation', 'sequence', 'resultReference',
    'summary', 'completedWork', 'remainingWork', 'nextAction', 'unresolvedRisks', 'updatedAt',
  ]);
  if (!isRecord(value) || Object.keys(value).length !== keys.size || Object.keys(value).some(key => !keys.has(key))) {
    throw createExecutionAuthorityError('Execution landing proposal does not match the exact V2 schema');
  }
  if (value.version !== LANDING_PROPOSAL_SCHEMA_VERSION || typeof value.taskId !== 'string') {
    throw createExecutionAuthorityError('Execution landing proposal does not match the exact V2 schema');
  }
  assertTaskId(value.taskId);
  if (typeof value.attemptId !== 'string' || !UUID.test(value.attemptId)) {
    throw createExecutionAuthorityError('Execution landing proposal attemptId is invalid');
  }
  const generation = positiveInteger(value.generation, 'generation');
  const sequence = positiveInteger(value.sequence, 'sequence');
  if (!isRecord(value.resultReference)) {
    throw createExecutionAuthorityError('Execution landing proposal resultReference is invalid');
  }
  const referenceKeys = new Set(['taskId', 'attemptId', 'generation', 'relativePath']);
  if (
    Object.keys(value.resultReference).length !== referenceKeys.size
    || Object.keys(value.resultReference).some(key => !referenceKeys.has(key))
    || value.resultReference.taskId !== value.taskId
    || value.resultReference.attemptId !== value.attemptId
    || value.resultReference.generation !== generation
  ) {
    throw createExecutionAuthorityError('Execution landing proposal contains duplicate or conflicting identity');
  }
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw createExecutionAuthorityError('Execution landing proposal updatedAt is invalid');
  }
  return {
    version: LANDING_PROPOSAL_SCHEMA_VERSION,
    taskId: value.taskId,
    attemptId: value.attemptId,
    generation,
    sequence,
    resultReference: {
      taskId: value.taskId,
      attemptId: value.attemptId,
      generation,
      relativePath: assertRelativeResultPath(value.resultReference.relativePath, value.taskId),
    },
    summary: boundedText(value.summary, 'summary', 4_000),
    completedWork: boundedList(value.completedWork, 'completedWork'),
    remainingWork: boundedList(value.remainingWork, 'remainingWork'),
    nextAction: boundedText(value.nextAction, 'nextAction', 1_000),
    unresolvedRisks: boundedList(value.unresolvedRisks, 'unresolvedRisks'),
    updatedAt: value.updatedAt,
  };
}

export function writeExecutionLandingProposal(
  projectRoot: string,
  value: LandingProposalV2,
): WriteExecutionLandingProposalResult {
  const proposal = parseLandingProposalV2(value);
  const root = resolve(projectRoot);
  const tasksDirectory = resolve(root, TASKS_DIR);
  if (relative(root, tasksDirectory).startsWith('..')) {
    throw createExecutionAuthorityError('Execution landing proposal directory escapes project root');
  }
  if (!existsSync(tasksDirectory)) mkdirSync(tasksDirectory, { mode: 0o700 });
  if (!lstatSync(tasksDirectory).isDirectory() || lstatSync(tasksDirectory).isSymbolicLink()) {
    throw createExecutionAuthorityError('Execution landing proposal directory must not be a symlink');
  }
  const path = resolve(root, executionLandingProposalRelativePath(proposal.taskId));
  if (dirname(path) !== tasksDirectory) {
    throw createExecutionAuthorityError('Execution landing proposal path escapes its task directory');
  }
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw createExecutionAuthorityError('Execution landing proposal target must not be a symlink');
  }
  const raw = `${JSON.stringify(proposal, null, 2)}\n`;
  if (Buffer.byteLength(raw) > EXECUTION_LANDING_PROPOSAL_MAX_BYTES) {
    throw createExecutionAuthorityError('Execution landing proposal exceeds its byte ceiling');
  }
  const temporary = join(tasksDirectory, `.${basename(path)}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, raw, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
    try {
      const directoryDescriptor = openSync(tasksDirectory, 'r');
      try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
    } catch { /* directory fsync is not supported by every platform adapter */ }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* preserve the primary diagnostic */ }
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw createExecutionAuthorityError('Execution landing proposal atomic publication did not produce a regular file');
  }
  return {
    relativePath: executionLandingProposalRelativePath(proposal.taskId),
    proposalSha256: sha256(canonicalJson(proposal)),
    observedMtime: stat.mtime.toISOString(),
  };
}

export function executionLandingProposalRelativePath(taskId: string): string {
  assertTaskId(taskId);
  return `${TASKS_DIR}/task-${taskId}.landing-proposal.json`;
}

export function executionLandingProposalPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, executionLandingProposalRelativePath(taskId));
}

export function parseExecutionLandingProposal(
  value: unknown,
  expected: {
    taskId: string;
    attemptId: string;
  },
): ExecutionLandingProposalV1 {
  assertTaskId(expected.taskId);
  if (!UUID.test(expected.attemptId)) {
    throw createExecutionAuthorityError('Execution landing proposal expected attemptId is invalid');
  }
  const keys = new Set([
    'version',
    'taskId',
    'attemptId',
    'sequence',
    'summary',
    'completedWork',
    'remainingWork',
    'nextAction',
    'unresolvedRisks',
    'updatedAt',
  ]);
  if (
    !isRecord(value)
    || Object.keys(value).length !== keys.size
    || Object.keys(value).some(key => !keys.has(key))
    || value.version !== EXECUTION_LANDING_PROPOSAL_SCHEMA_VERSION
    || value.taskId !== expected.taskId
    || value.attemptId !== expected.attemptId
    || !Number.isInteger(value.sequence)
    || (value.sequence as number) < 1
    || typeof value.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw createExecutionAuthorityError('Execution landing proposal does not match its exact attempt-bound schema');
  }
  return {
    version: EXECUTION_LANDING_PROPOSAL_SCHEMA_VERSION,
    taskId: expected.taskId,
    attemptId: expected.attemptId,
    sequence: value.sequence as number,
    summary: boundedText(value.summary, 'summary', 4_000),
    completedWork: boundedList(value.completedWork, 'completedWork'),
    remainingWork: boundedList(value.remainingWork, 'remainingWork'),
    nextAction: boundedText(value.nextAction, 'nextAction', 1_000),
    unresolvedRisks: boundedList(value.unresolvedRisks, 'unresolvedRisks'),
    updatedAt: value.updatedAt as string,
  };
}

export function readExecutionLandingProposal(
  projectRoot: string,
  input: {
    taskId: string;
    attemptId: string;
    notBefore: string;
  },
): ExecutionLandingProposalEnvelopeV1 {
  const path = executionLandingProposalPath(projectRoot, input.taskId);
  const stat = statSync(path);
  if (!stat.isFile() || stat.size <= 0 || stat.size > EXECUTION_LANDING_PROPOSAL_MAX_BYTES) {
    throw createExecutionAuthorityError('Execution landing proposal file is absent, empty, or exceeds its byte ceiling');
  }
  const notBeforeMs = Date.parse(input.notBefore);
  if (!Number.isFinite(notBeforeMs) || stat.mtimeMs + 1 < notBeforeMs) {
    throw createExecutionAuthorityError('Execution landing proposal file predates the current attempt');
  }
  const raw = readFileSync(path, 'utf-8');
  const proposal = parseExecutionLandingProposal(JSON.parse(raw), {
    taskId: input.taskId,
    attemptId: input.attemptId,
  });
  return {
    proposal,
    proposalSha256: sha256(canonicalJson(proposal)),
    relativePath: executionLandingProposalRelativePath(input.taskId),
    observedMtime: stat.mtime.toISOString(),
  };
}

export function buildExecutionLandingProposalPromptSegment(
  taskId: string,
  attemptId: string,
  mode: 'continuous' | 'finite-adjudication' = 'continuous',
): string {
  const path = executionLandingProposalRelativePath(taskId);
  if (!UUID.test(attemptId)) {
    throw createExecutionAuthorityError('Execution landing proposal prompt attemptId is invalid');
  }
  const writeCadence = mode === 'finite-adjudication'
    ? [
        'This is a finite read-only adjudication. Do not spend a standalone tool call on this proposal.',
        'At the start of the SAME single Bash tool call that performs the bounded evidence pass, write sequence 1 atomically (temporary file in the same directory, then rename), then perform the evidence reads.',
        'Do not update the proposal after the evidence pass; emit the terminal verdict immediately. If the optional targeted verification command is strictly required, update the proposal inside that SAME targeted Bash call before running the command.',
        'The proposal artefact is the only permitted project-file mutation. Never modify an evidence or source file.',
      ]
    : [
        'Your FIRST lifecycle action is to write sequence 1 atomically (temporary file in the same directory, then rename) in the SAME Bash tool call that creates the required task plan or performs the initial bounded evidence read.',
        'Do not spend a standalone tool call on the proposal. Write it before provider-intensive exploration or source mutation, then update it inside the existing tool call after each coherent completed step.',
        'FINALIZATION BARRIER: before writing `.result` or reporting completion, atomically replace the proposal with sequence 2 or higher after the last scoped mutation. Its host-observed mtime must be at least as new as every scoped change.',
        'Batch that final proposal update with the existing verification/result tool actions in the SAME assistant turn; never spend another provider turn only for checkpoint maintenance.',
        'If the exact attempt-bound proposal cannot be written, stop early and report NO_GO; never continue silently into the landing reserve.',
      ];
  return [
    '## Budget Landing Checkpoint Protocol',
    'This execution has a host-enforced hard budget and a reserved landing window. The hard ceiling is unchanged.',
    `Maintain one bounded semantic proposal at \`${path}\` for task \`${taskId}\`, attempt \`${attemptId}\`.`,
    ...writeCadence,
    'Use exactly this JSON shape and no extra fields:',
    '```json',
    JSON.stringify({
      version: EXECUTION_LANDING_PROPOSAL_SCHEMA_VERSION,
      taskId,
      attemptId,
      sequence: 1,
      summary: 'bounded current-state summary',
      completedWork: ['verified completed step'],
      remainingWork: ['specific remaining step'],
      nextAction: 'single next action',
      unresolvedRisks: ['specific unresolved risk'],
      updatedAt: 'best-effort current ISO-8601 timestamp',
    }, null, 2),
    '```',
    'Increment `sequence` on every replacement. Keep summary ≤4000 chars, each list ≤50 items, and each item/nextAction ≤1000 chars.',
    '`updatedAt` is diagnostic worker metadata only; exact attempt identity and host-observed file evidence are authoritative.',
    'This file is an untrusted proposal only: never claim provider identity, usage, budget, scope, acceptance, or LANDED status. The host validates and stamps those authorities.',
    'Continue normal work after each update. Only the host may stop the exact attempt and publish a durable LANDED checkpoint.',
  ].join('\n');
}
