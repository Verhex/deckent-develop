import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { createJsonFileFirstWriterWins } from './approval-file-cas.js';

export const ATTENDED_EXECUTION_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const ATTENDED_EXECUTION_PROPOSAL_KIND = 'attended-execution-proposal' as const;

const SHA256_RE = /^[a-f0-9]{64}$/u;

export interface AttendedExecutionProposalMaterial {
  readonly task: unknown;
  readonly prompt: string;
  readonly scope: unknown;
  readonly acceptance: unknown;
}

export interface AttendedExecutionProposalDigests {
  readonly taskDigest: string;
  readonly promptDigest: string;
  readonly scopeDigest: string;
  readonly acceptanceDigest: string;
}

export interface AttendedExecutionProposalReference extends AttendedExecutionProposalDigests {
  readonly proposalDigest: string;
}

export function createAttendedExecutionProposalMaterialFromTask(
  task: Readonly<Record<string, unknown>>,
  prompt: string,
): AttendedExecutionProposalMaterial {
  const {
    status: _status,
    assignedWorker: _assignedWorker,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    budgetPolicy,
    ...immutableTask
  } = task;
  const immutableBudgetPolicy = isRecord(budgetPolicy)
    ? Object.fromEntries(
        Object.entries(budgetPolicy)
          .filter(([key]) => key !== 'approvalEvidenceRef' && key !== 'approvalProposal'),
      )
    : budgetPolicy;
  const taskProjection = budgetPolicy === undefined
    ? immutableTask
    : { ...immutableTask, budgetPolicy: immutableBudgetPolicy };
  return Object.freeze({
    task: taskProjection,
    prompt,
    scope: task.scope ?? null,
    acceptance: task.goNogo ?? null,
  });
}

export interface AttendedExecutionProposalRecordV1 {
  readonly schemaVersion: typeof ATTENDED_EXECUTION_PROPOSAL_SCHEMA_VERSION;
  readonly kind: typeof ATTENDED_EXECUTION_PROPOSAL_KIND;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly bindingDigest: string;
  readonly taskDigest: string;
  readonly promptDigest: string;
  readonly scopeDigest: string;
  readonly acceptanceDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface PersistAttendedExecutionProposalInput {
  readonly proposalDigest: string;
  readonly bindingDigest: string;
  readonly digests: AttendedExecutionProposalDigests;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type AttendedExecutionProposalErrorCode =
  | 'INVALID_PROPOSAL'
  | 'PROPOSAL_CONFLICT'
  | 'PROPOSAL_CORRUPT';

export class AttendedExecutionProposalError extends Error {
  constructor(
    readonly code: AttendedExecutionProposalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AttendedExecutionProposalError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value ?? null;
}

export function canonicalAttendedExecutionProposalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function attendedExecutionProposalSha256(value: unknown): string {
  return createHash('sha256')
    .update(canonicalAttendedExecutionProposalJson(value))
    .digest('hex');
}

function assertDigest(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    throw new AttendedExecutionProposalError(
      'INVALID_PROPOSAL',
      `${field} must be a lowercase SHA-256 digest`,
    );
  }
}

function assertIso(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new AttendedExecutionProposalError(
      'INVALID_PROPOSAL',
      `${field} must be an ISO-compatible timestamp`,
    );
  }
}

function canonicalProjectRoot(projectRoot: string): string {
  try {
    return realpathSync.native(projectRoot);
  } catch {
    return resolve(projectRoot);
  }
}

function assertOutsideProject(projectRoot: string, storeDir: string): void {
  const project = canonicalProjectRoot(projectRoot);
  const candidate = resolve(storeDir);
  const rel = relative(project, candidate);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new AttendedExecutionProposalError(
      'INVALID_PROPOSAL',
      'Attended execution proposals must be stored outside the worker-mounted project',
    );
  }
}

export function createAttendedExecutionProposalDigests(
  material: AttendedExecutionProposalMaterial,
): AttendedExecutionProposalDigests {
  if (typeof material.prompt !== 'string' || material.prompt.length === 0) {
    throw new AttendedExecutionProposalError(
      'INVALID_PROPOSAL',
      'Attended execution proposal prompt must be non-empty',
    );
  }
  return Object.freeze({
    taskDigest: attendedExecutionProposalSha256(material.task),
    promptDigest: attendedExecutionProposalSha256(material.prompt),
    scopeDigest: attendedExecutionProposalSha256(material.scope),
    acceptanceDigest: attendedExecutionProposalSha256(material.acceptance),
  });
}

export function assertAttendedExecutionProposalMaterial(
  material: AttendedExecutionProposalMaterial,
  reference: AttendedExecutionProposalReference,
): void {
  assertDigest(reference.proposalDigest, 'proposalDigest');
  const actual = createAttendedExecutionProposalDigests(material);
  for (const field of [
    'taskDigest',
    'promptDigest',
    'scopeDigest',
    'acceptanceDigest',
  ] as const) {
    if (actual[field] !== reference[field]) {
      throw new AttendedExecutionProposalError(
        'INVALID_PROPOSAL',
        `Attended execution ${field} does not match the approved immutable proposal`,
      );
    }
  }
}

function parseRecord(value: unknown): AttendedExecutionProposalRecordV1 {
  const exactKeys = new Set([
    'schemaVersion',
    'kind',
    'proposalId',
    'proposalDigest',
    'bindingDigest',
    'taskDigest',
    'promptDigest',
    'scopeDigest',
    'acceptanceDigest',
    'createdAt',
    'expiresAt',
  ]);
  if (!isRecord(value)
    || Object.keys(value).some(key => !exactKeys.has(key))
    || Object.keys(value).length !== exactKeys.size
    || value.schemaVersion !== ATTENDED_EXECUTION_PROPOSAL_SCHEMA_VERSION
    || value.kind !== ATTENDED_EXECUTION_PROPOSAL_KIND
    || typeof value.proposalId !== 'string') {
    throw new AttendedExecutionProposalError(
      'PROPOSAL_CORRUPT',
      'Attended execution proposal record has an invalid exact schema',
    );
  }
  for (const field of [
    'proposalDigest',
    'bindingDigest',
    'taskDigest',
    'promptDigest',
    'scopeDigest',
    'acceptanceDigest',
  ] as const) {
    assertDigest(value[field], field);
  }
  assertIso(value.createdAt, 'createdAt');
  assertIso(value.expiresAt, 'expiresAt');
  if (value.proposalId !== `aexp-${value.proposalDigest}`) {
    throw new AttendedExecutionProposalError(
      'PROPOSAL_CORRUPT',
      'Attended execution proposal id does not match its digest',
    );
  }
  return Object.freeze({
    schemaVersion: ATTENDED_EXECUTION_PROPOSAL_SCHEMA_VERSION,
    kind: ATTENDED_EXECUTION_PROPOSAL_KIND,
    proposalId: value.proposalId,
    proposalDigest: value.proposalDigest as string,
    bindingDigest: value.bindingDigest as string,
    taskDigest: value.taskDigest as string,
    promptDigest: value.promptDigest as string,
    scopeDigest: value.scopeDigest as string,
    acceptanceDigest: value.acceptanceDigest as string,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
  });
}

function sameRecord(
  left: AttendedExecutionProposalRecordV1,
  right: AttendedExecutionProposalRecordV1,
): boolean {
  return canonicalAttendedExecutionProposalJson(left)
    === canonicalAttendedExecutionProposalJson(right);
}

export class AttendedExecutionProposalStore {
  constructor(
    readonly projectRoot: string,
    readonly storeDir: string,
  ) {
    assertOutsideProject(projectRoot, storeDir);
    mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  }

  persist(input: PersistAttendedExecutionProposalInput): AttendedExecutionProposalRecordV1 {
    for (const [field, value] of Object.entries({
      proposalDigest: input.proposalDigest,
      bindingDigest: input.bindingDigest,
      ...input.digests,
    })) {
      assertDigest(value, field);
    }
    assertIso(input.createdAt, 'createdAt');
    assertIso(input.expiresAt, 'expiresAt');
    if (Date.parse(input.expiresAt) <= Date.parse(input.createdAt)) {
      throw new AttendedExecutionProposalError(
        'INVALID_PROPOSAL',
        'Attended execution proposal expiry must follow creation',
      );
    }
    const record = parseRecord({
      schemaVersion: ATTENDED_EXECUTION_PROPOSAL_SCHEMA_VERSION,
      kind: ATTENDED_EXECUTION_PROPOSAL_KIND,
      proposalId: `aexp-${input.proposalDigest}`,
      proposalDigest: input.proposalDigest,
      bindingDigest: input.bindingDigest,
      ...input.digests,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    });
    const path = join(this.storeDir, `${record.proposalId}.json`);
    if (createJsonFileFirstWriterWins(path, record)) return record;
    const existing = this.read(record.proposalDigest);
    if (!sameRecord(existing, record)) {
      throw new AttendedExecutionProposalError(
        'PROPOSAL_CONFLICT',
        `Attended execution proposal ${record.proposalId} conflicts with its first writer`,
      );
    }
    return existing;
  }

  read(proposalDigest: string): AttendedExecutionProposalRecordV1 {
    assertDigest(proposalDigest, 'proposalDigest');
    const path = join(this.storeDir, `aexp-${proposalDigest}.json`);
    if (!existsSync(path)) {
      throw new AttendedExecutionProposalError(
        'PROPOSAL_CORRUPT',
        `Attended execution proposal aexp-${proposalDigest} was not found`,
      );
    }
    try {
      return parseRecord(JSON.parse(readFileSync(path, 'utf-8')));
    } catch (error) {
      if (error instanceof AttendedExecutionProposalError) throw error;
      throw new AttendedExecutionProposalError(
        'PROPOSAL_CORRUPT',
        `Attended execution proposal aexp-${proposalDigest} is unreadable`,
      );
    }
  }
}
