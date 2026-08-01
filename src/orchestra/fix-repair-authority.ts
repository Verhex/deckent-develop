import { createHash } from 'node:crypto';

import type { TaskResult } from '../core/task-types.js';
import type { TaskVerificationIsolationHoldReceiptV1 } from '../core/task-result-settlement.js';
import type { Verdict } from './result-evaluator.js';

export type FixRepairAccess = 'read' | 'write';

export interface FixRepairEvidence {
  /** Exact project-relative tracked path named by the failed attempt. */
  readonly path: string;
  /** The narrow authority required for the named repair. */
  readonly access: FixRepairAccess;
  /** Stable reference to the failure evidence that named this path. */
  readonly evidenceRef: string;
}

export interface FixRepairAuthorityInput {
  /** Directories explicitly reviewed for this repair lineage. */
  readonly reviewedDirectories: readonly string[];
  /** Exact authority inherited from the failed task. */
  readonly inheritedFilesRead: readonly string[];
  readonly inheritedFilesWrite: readonly string[];
  /** Exact, structured requirements extracted from the failed attempt. */
  readonly failureEvidence: readonly FixRepairEvidence[];
  /** Bounded tracked-path evidence supplied by the caller. */
  readonly trackedPaths: readonly string[];
  /** Impossible authority fingerprints already seen in this logical lineage. */
  readonly priorImpossibleFingerprints?: readonly string[];
}

export type FixRepairAuthorityFindingCode =
  | 'invalid_reviewed_directory'
  | 'invalid_inherited_path'
  | 'invalid_evidence'
  | 'untracked_evidence_path'
  | 'outside_reviewed_directory';

export interface FixRepairAuthorityFinding {
  readonly code: FixRepairAuthorityFindingCode;
  readonly path?: string;
  readonly access?: FixRepairAccess;
}

interface FixRepairAuthorityBase {
  /** Fingerprint covers the exact authority contract, never the broad repository. */
  readonly authorityFingerprint: string;
  readonly inheritedFilesRead: readonly string[];
  readonly inheritedFilesWrite: readonly string[];
  readonly filesRead: readonly string[];
  readonly filesWrite: readonly string[];
  readonly addedReadPaths: readonly string[];
  readonly addedWritePaths: readonly string[];
  readonly unresolvedFindings: readonly FixRepairAuthorityFinding[];
}

export type FixRepairAuthorityResult =
  | (FixRepairAuthorityBase & {
      readonly state: 'accepted';
      readonly action: 'continue';
    })
  | (FixRepairAuthorityBase & {
      readonly state: 'hold';
      readonly action: 'pause';
      readonly reason: 'unresolved_requirements' | 'repeated_impossible_fingerprint';
    });

function exactPath(value: string): boolean {
  if (value.length === 0
    || value !== value.trim()
    || value.startsWith('/')
    || value.startsWith('\\')
    || /^[A-Za-z]:/u.test(value)
    || /[\\\u0000-\u001f\u007f*?\[\]]/u.test(value)) {
    return false;
  }
  const segments = value.split('/');
  return segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

function exactDirectory(value: string): boolean {
  const withoutTrailingSlash = value.endsWith('/') ? value.slice(0, -1) : value;
  return withoutTrailingSlash.length > 0
    && (value === withoutTrailingSlash || value === withoutTrailingSlash + '/')
    && exactPath(withoutTrailingSlash);
}

function canonicalDirectories(directories: readonly string[]): string[] {
  return [...new Set(directories.map(directory => directory.endsWith('/')
    ? directory.slice(0, -1)
    : directory))].sort();
}

function insideReviewedDirectory(path: string, directories: readonly string[]): boolean {
  return directories.some(directory => path === directory || path.startsWith(directory + '/'));
}

function stableFingerprint(parts: unknown): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function frozenStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...values]);
}

function frozenFindings(
  values: readonly FixRepairAuthorityFinding[],
): readonly FixRepairAuthorityFinding[] {
  return Object.freeze(values.map(value => Object.freeze({ ...value })));
}

/**
 * Resolve the smallest exact read/write repair delta from caller-supplied
 * evidence. This function performs no filesystem, git, or prompt parsing: the
 * caller must provide the bounded tracked-path set and structured evidence.
 */
export function resolveFixRepairAuthority(
  input: FixRepairAuthorityInput,
): FixRepairAuthorityResult {
  const invalidReviewedDirectories = input.reviewedDirectories
    .filter(directory => !exactDirectory(directory));
  const reviewedDirectories = canonicalDirectories(
    input.reviewedDirectories.filter(exactDirectory),
  );
  const invalidInheritedRead = input.inheritedFilesRead.filter(path => !exactPath(path));
  const invalidInheritedWrite = input.inheritedFilesWrite.filter(path => !exactPath(path));
  const inheritedFilesRead = [...new Set(input.inheritedFilesRead.filter(exactPath))].sort();
  const inheritedFilesWrite = [...new Set(input.inheritedFilesWrite.filter(exactPath))].sort();
  const trackedPaths = new Set(input.trackedPaths.filter(exactPath));
  const findings: FixRepairAuthorityFinding[] = [
    ...invalidReviewedDirectories.map(() => ({ code: 'invalid_reviewed_directory' as const })),
    ...invalidInheritedRead.map(path => ({ code: 'invalid_inherited_path' as const, path, access: 'read' as const })),
    ...invalidInheritedWrite.map(path => ({ code: 'invalid_inherited_path' as const, path, access: 'write' as const })),
  ];
  const required = new Map<string, FixRepairEvidence>();

  for (const evidence of input.failureEvidence) {
    if (!exactPath(evidence.path)
      || (evidence.access !== 'read' && evidence.access !== 'write')
      || evidence.evidenceRef.length === 0
      || evidence.evidenceRef !== evidence.evidenceRef.trim()) {
      findings.push({ code: 'invalid_evidence', path: evidence.path, access: evidence.access });
      continue;
    }
    const key = evidence.access + '\0' + evidence.path;
    if (!required.has(key)) required.set(key, evidence);
  }

  const requiredEvidence = [...required.values()].sort((left, right) =>
    left.access.localeCompare(right.access) || left.path.localeCompare(right.path));
  const candidateReadPaths: string[] = [];
  const candidateWritePaths: string[] = [];
  for (const evidence of requiredEvidence) {
    if (!trackedPaths.has(evidence.path)) {
      findings.push({ code: 'untracked_evidence_path', path: evidence.path, access: evidence.access });
      continue;
    }
    if (!insideReviewedDirectory(evidence.path, reviewedDirectories)) {
      findings.push({ code: 'outside_reviewed_directory', path: evidence.path, access: evidence.access });
      continue;
    }
    if (evidence.access === 'read') candidateReadPaths.push(evidence.path);
    else candidateWritePaths.push(evidence.path);
  }

  const addedReadPaths = [...new Set(candidateReadPaths)]
    .filter(path => !inheritedFilesRead.includes(path))
    .sort();
  const addedWritePaths = [...new Set(candidateWritePaths)]
    .filter(path => !inheritedFilesWrite.includes(path))
    .sort();
  const authorityFingerprint = stableFingerprint({
    version: 1,
    reviewedDirectories,
    inheritedFilesRead,
    inheritedFilesWrite,
    requiredEvidence: requiredEvidence.map(({ path, access }) => ({ path, access })),
    findings: findings.map(({ code, path, access }) => ({ code, path, access })),
  });
  const unresolvedFindings = frozenFindings(findings);
  const base = {
    authorityFingerprint,
    inheritedFilesRead: frozenStrings(inheritedFilesRead),
    inheritedFilesWrite: frozenStrings(inheritedFilesWrite),
    unresolvedFindings,
  };

  if (unresolvedFindings.length > 0) {
    const repeated = (input.priorImpossibleFingerprints ?? []).includes(authorityFingerprint);
    return Object.freeze({
      ...base,
      state: 'hold' as const,
      action: 'pause' as const,
      reason: repeated ? 'repeated_impossible_fingerprint' as const : 'unresolved_requirements' as const,
      filesRead: frozenStrings(inheritedFilesRead),
      filesWrite: frozenStrings(inheritedFilesWrite),
      addedReadPaths: frozenStrings([]),
      addedWritePaths: frozenStrings([]),
    });
  }

  const filesRead = [...new Set([...inheritedFilesRead, ...addedReadPaths])].sort();
  const filesWrite = [...new Set([...inheritedFilesWrite, ...addedWritePaths])].sort();
  return Object.freeze({
    ...base,
    state: 'accepted' as const,
    action: 'continue' as const,
    filesRead: frozenStrings(filesRead),
    filesWrite: frozenStrings(filesWrite),
    addedReadPaths: frozenStrings(addedReadPaths),
    addedWritePaths: frozenStrings(addedWritePaths),
  });
}

// ─── FIX/Retry Budget Isolation Gate (488-011) ───────────────────────
// Decides whether a NO_GO evaluation may spend a FIX/retry budget slot. A
// NO_GO caused by 488-010's verification isolation gate holding (an
// admission/environment gap — the isolation authority could not grant this
// attempt an exclusive verification surface, or a concurrent foreign
// attempt's diagnostics bled in) is never this task's own scoped failure: it
// must be parked, never repaired. A genuine scoped failure (real tsc/test
// failure attributable to this task's own change) still consumes normal
// repair authority via `resolveFixRepairAuthority` above.

export type FixRepairAuthorityAction = 'no-repair-needed' | 'park' | 'repair';

export interface FixRepairAuthorityBudgetDecision {
  readonly action: FixRepairAuthorityAction;
  /** Whether this attempt may consume a FIX/retry budget slot. */
  readonly consumesRetryBudget: boolean;
  readonly reason: string;
}

/**
 * Decide whether a task's evaluation decision may spend a FIX/retry budget slot.
 *
 * Precedence:
 * 1. A non-NO_GO decision never needs repair — nothing to fix.
 * 2. A host-observed verification isolation hold receipt (strongest signal,
 *    never worker prose) parks the attempt without spending budget.
 * 3. Worker prose never authors repair authority. Anything else is a scoped failure attributable to this task's own
 *    change: normal repair authority applies and the budget is spent.
 */
export function decideFixRepairAuthority(
  decision: Verdict,
  _result: TaskResult,
  hostIsolationHoldReceipt?: TaskVerificationIsolationHoldReceiptV1 | null,
): FixRepairAuthorityBudgetDecision {
  if (decision !== 'NO_GO') {
    return {
      action: 'no-repair-needed',
      consumesRetryBudget: false,
      reason: `evaluation decision is ${decision} — no repair authority engages`,
    };
  }

  if (hostIsolationHoldReceipt) {
    return {
      action: 'park',
      consumesRetryBudget: false,
      reason: `host-observed verification isolation hold (${hostIsolationHoldReceipt.reasonCodes.join(', ')}) — attempt parked, FIX/retry budget not spent`,
    };
  }

  return {
    action: 'repair',
    consumesRetryBudget: true,
    reason: 'scoped task failure attributable to this task — normal repair authority applies',
  };
}
