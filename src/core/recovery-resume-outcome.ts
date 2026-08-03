import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { DECKENT_DIR } from './constants.js';
import type { CanonicalRunStatus } from './run-status-authority.js';
import { DeckentError } from './errors.js';

export const RECOVERY_RESUME_OUTCOME_SCHEMA_VERSION = 1 as const;

export type RecoveryResumeOutcomeKind =
  | 'resumed-running'
  | 'resumed-paused'
  | 'completed'
  | 'aborted'
  | 'failed';

export interface RecoveryResumeOutcome {
  readonly schemaVersion: typeof RECOVERY_RESUME_OUTCOME_SCHEMA_VERSION;
  readonly sprintId: string;
  readonly outcome: RecoveryResumeOutcomeKind;
  readonly exitCode: 0 | 1 | 2;
  readonly observedStatus: string | null;
  readonly observedAt: string;
  readonly reason: string | null;
  readonly nextAuthority: {
    readonly lifecycle: CanonicalRunStatus['lifecycle'];
    readonly resumable: boolean;
    readonly recoveryCommand: string | null;
    readonly finalizeCommand: string | null;
  };
}

export interface RecoveryResumeOutcomeInput {
  readonly sprintId: string;
  readonly observedStatus: string | null;
  readonly authority: CanonicalRunStatus;
  readonly reason?: string | null;
  readonly observedAt?: string;
}

function classifyOutcome(input: RecoveryResumeOutcomeInput): RecoveryResumeOutcomeKind {
  if (input.authority.sprintId !== input.sprintId) return 'failed';
  if (input.authority.lifecycle === 'COMPLETE') {
    return 'completed';
  }
  if (input.authority.lifecycle === 'ABORTED') {
    return 'aborted';
  }
  if (input.authority.lifecycle === 'PAUSED') {
    return 'resumed-paused';
  }
  if (input.authority.lifecycle === 'ACTIVE') return 'resumed-running';
  return 'failed';
}

export function createRecoveryResumeFailedOutcome(
  input: RecoveryResumeOutcomeInput & { readonly reason: string },
): RecoveryResumeOutcome {
  const authorityMatches = input.authority.sprintId === input.sprintId;
  return {
    schemaVersion: RECOVERY_RESUME_OUTCOME_SCHEMA_VERSION,
    sprintId: input.sprintId,
    outcome: 'failed',
    exitCode: 1,
    observedStatus: input.observedStatus,
    observedAt: input.observedAt ?? new Date().toISOString(),
    reason: input.reason,
    nextAuthority: {
      lifecycle: input.authority.lifecycle,
      resumable: authorityMatches && input.authority.resumable,
      recoveryCommand: authorityMatches ? input.authority.recoveryCommand : null,
      finalizeCommand: authorityMatches ? input.authority.finalizeCommand : null,
    },
  };
}

/**
 * Convert the controller return plus its freshly persisted lifecycle authority
 * into the one machine/human recovery outcome contract.
 *
 * Exit 2 is an intentional operator-action outcome (PAUSED/ABORTED), not an
 * internal command failure. Exit 1 is reserved for a missing or contradictory
 * next authority.
 */
export function createRecoveryResumeOutcome(
  input: RecoveryResumeOutcomeInput,
): RecoveryResumeOutcome {
  const outcome = classifyOutcome(input);
  const exitCode = outcome === 'failed'
    ? 1
    : outcome === 'resumed-paused' || outcome === 'aborted'
      ? 2
      : 0;
  const authorityMatches = input.authority.sprintId === input.sprintId
    || (outcome === 'failed' && input.authority.sprintId === null);
  return {
    schemaVersion: RECOVERY_RESUME_OUTCOME_SCHEMA_VERSION,
    sprintId: input.sprintId,
    outcome,
    exitCode,
    observedStatus: input.observedStatus,
    observedAt: input.observedAt ?? new Date().toISOString(),
    reason: input.reason
      ?? (!authorityMatches ? 'next-authority-sprint-mismatch' : input.authority.reason),
    nextAuthority: {
      lifecycle: input.authority.lifecycle,
      resumable: authorityMatches && input.authority.resumable,
      recoveryCommand: authorityMatches ? input.authority.recoveryCommand : null,
      finalizeCommand: authorityMatches ? input.authority.finalizeCommand : null,
    },
  };
}

function isOutcome(value: unknown, sprintId: string): value is RecoveryResumeOutcome {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RecoveryResumeOutcome>;
  return candidate.schemaVersion === RECOVERY_RESUME_OUTCOME_SCHEMA_VERSION
    && candidate.sprintId === sprintId
    && ['resumed-running', 'resumed-paused', 'completed', 'aborted', 'failed']
      .includes(String(candidate.outcome))
    && [0, 1, 2].includes(Number(candidate.exitCode))
    && typeof candidate.observedAt === 'string'
    && candidate.nextAuthority !== null
    && typeof candidate.nextAuthority === 'object';
}

function assertOwnedOutcomePath(projectRoot: string, path: string): void {
  const runtimeRoot = resolve(projectRoot, DECKENT_DIR, 'runtime');
  const exactPath = resolve(path);
  const rel = relative(runtimeRoot, exactPath);
  if (
    rel.length === 0
    || rel.startsWith(`..${sep}`)
    || rel === '..'
    || rel.includes(sep)
    || !basename(exactPath).startsWith('recover-resume-outcome-')
    || !basename(exactPath).endsWith('.json')
  ) {
    throw new DeckentError('E_RECOVERY_RESUME_OUTCOME_PATH_OUTSIDE_RUNTIME', 'RECOVERY_RESUME_OUTCOME_PATH_OUTSIDE_RUNTIME');
  }
}

export function recoveryResumeOutcomePath(
  projectRoot: string,
  nonce: string,
): string {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(nonce)) {
    throw new DeckentError('E_RECOVERY_RESUME_OUTCOME_NONCE_INVALID', 'RECOVERY_RESUME_OUTCOME_NONCE_INVALID');
  }
  return join(projectRoot, DECKENT_DIR, 'runtime', `recover-resume-outcome-${nonce}.json`);
}

export function writeRecoveryResumeOutcome(
  projectRoot: string,
  path: string,
  outcome: RecoveryResumeOutcome,
): void {
  assertOwnedOutcomePath(projectRoot, path);
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(outcome, null, 2)}\n`, { encoding: 'utf-8', flag: 'wx' });
  renameSync(tmpPath, path);
}

export function readRecoveryResumeOutcome(
  projectRoot: string,
  path: string,
  sprintId: string,
): RecoveryResumeOutcome | null {
  assertOwnedOutcomePath(projectRoot, path);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return isOutcome(parsed, sprintId) ? parsed : null;
  } catch {
    return null;
  }
}

export function removeRecoveryResumeOutcome(projectRoot: string, path: string): void {
  assertOwnedOutcomePath(projectRoot, path);
  if (existsSync(path)) unlinkSync(path);
}
