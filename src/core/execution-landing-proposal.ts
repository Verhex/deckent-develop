import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

import { canonicalJson } from './audit-writer.js';
import { TASKS_DIR } from './constants.js';
import { createExecutionAuthorityError } from './errors.js';
import type { ExecutionLandingSemanticStateV1 } from './execution-landing-checkpoint.js';

export const EXECUTION_LANDING_PROPOSAL_SCHEMA_VERSION = 1 as const;
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
