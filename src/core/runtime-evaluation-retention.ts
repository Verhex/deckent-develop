/**
 * Lossless retention for per-attempt evaluation audit trees.
 *
 * Evaluation bytes are opaque forensic evidence: JSON is never parsed. Only
 * exact sprint ownership is considered, publication precedes manifest
 * verification, and every unlink is digest-bound. Unknown/foreign entries and
 * conflicting attempts remain at their source.
 */
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

import { DeckentError } from './errors.js';
import {
  SPRINT_ARCHIVE_MANIFEST_FILE,
  publishSprintArchiveArtifact,
  reconcileSprintArchive,
  resolveSprintArchiveDir,
  verifySprintArchive,
  type SprintArchiveManifest,
} from './sprint-archive.js';

export const RUNTIME_EVALUATION_RETENTION_VERSION = 1 as const;

const SPRINT_ID = /^sprint-(\d+)$/u;
const DIGEST_BUFFER_BYTES = 1024 * 1024;

export type RuntimeEvaluationHoldReason =
  | 'current-window'
  | 'foreign-sprint'
  | 'malformed-attempt-name'
  | 'non-regular-content'
  | 'conflicting-attempt';

export interface RuntimeEvaluationRetentionCandidate {
  readonly source: string;
  readonly relativePath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface RuntimeEvaluationRetentionHold {
  readonly source: string;
  readonly relativePath: string;
  readonly reason: RuntimeEvaluationHoldReason;
}

export interface RuntimeEvaluationRetentionPlan {
  readonly version: typeof RUNTIME_EVALUATION_RETENTION_VERSION;
  readonly projectRoot: string;
  readonly sprintId: string;
  readonly currentWindow: readonly string[];
  readonly reconcile: readonly RuntimeEvaluationRetentionCandidate[];
  readonly retire: readonly RuntimeEvaluationRetentionCandidate[];
  readonly hold: readonly RuntimeEvaluationRetentionHold[];
}

export interface RuntimeEvaluationRetentionResult {
  readonly sprintId: string;
  readonly published: readonly string[];
  readonly retired: readonly string[];
  readonly held: readonly RuntimeEvaluationRetentionHold[];
  readonly failures: readonly string[];
  readonly archiveVerified: boolean;
}

export interface RuntimeEvaluationRetentionOptions {
  /** Sprints in the live retention window are inspected but never archived or retired. */
  readonly currentSprintIds?: readonly string[];
  readonly apply?: boolean;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

function identity(path: string): { bytes: number; sha256: string } {
  const metadata = lstatSync(path);
  if (!metadata.isFile()) {
    throw new DeckentError('EVALUATION_NOT_REGULAR', 'EVALUATION_NOT_REGULAR');
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(DIGEST_BUFFER_BYTES);
  try {
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return { bytes: statSync(path).size, sha256: hash.digest('hex') };
}

function listEntries(root: string): Array<{ path: string; relativePath: string; regular: boolean }> {
  if (!existsSync(root)) return [];
  const result: Array<{ path: string; relativePath: string; regular: boolean }> = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else result.push({ path, relativePath: portable(relative(root, path)), regular: entry.isFile() });
    }
  }
  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function attemptOwner(relativePath: string): string | null {
  const name = basename(relativePath);
  const match = /^(?:task-)?(\d+)-[a-z0-9][a-z0-9._-]*-attempt-([1-9]\d*)\.json$/u.exec(name);
  return match?.[1] ?? null;
}

function readVerifiedManifest(root: string, sprintId: string): SprintArchiveManifest | null {
  if (!verifySprintArchive(root, sprintId).ok) return null;
  try {
    return JSON.parse(readFileSync(
      join(resolveSprintArchiveDir(root, sprintId), SPRINT_ARCHIVE_MANIFEST_FILE),
      'utf8',
    )) as SprintArchiveManifest;
  } catch {
    return null;
  }
}

function canonicalProof(
  manifest: SprintArchiveManifest | null,
  relativePath: string,
  file: { bytes: number; sha256: string },
): boolean {
  const target = `evaluations/${relativePath}`;
  return manifest?.artifacts.some(artifact =>
    artifact.path === target && artifact.bytes === file.bytes && artifact.sha256 === file.sha256) === true;
}

/** Build a side-effect-free, recursively inventoried plan for one exact sprint. */
export function planRuntimeEvaluationRetention(
  projectRoot: string,
  sprintId: string,
  options: Pick<RuntimeEvaluationRetentionOptions, 'currentSprintIds'> = {},
): RuntimeEvaluationRetentionPlan {
  const sprint = SPRINT_ID.exec(sprintId);
  if (!sprint?.[1]) {
    throw new DeckentError('INVALID_SPRINT_ID', `INVALID_SPRINT_ID:${sprintId}`);
  }
  const root = resolve(projectRoot);
  const evaluationRoot = join(root, '.deckent', 'runtime', 'evaluations', sprintId);
  const currentWindow = [...new Set(options.currentSprintIds ?? [])].sort();
  const isCurrent = currentWindow.includes(sprintId);
  const manifest = readVerifiedManifest(root, sprintId);
  const reconcile: RuntimeEvaluationRetentionCandidate[] = [];
  const retire: RuntimeEvaluationRetentionCandidate[] = [];
  const hold: RuntimeEvaluationRetentionHold[] = [];

  for (const entry of listEntries(evaluationRoot)) {
    const source = portable(relative(root, entry.path));
    if (!entry.regular) {
      hold.push({ source, relativePath: entry.relativePath, reason: 'non-regular-content' });
      continue;
    }
    const owner = attemptOwner(entry.relativePath);
    if (owner === null) {
      hold.push({ source, relativePath: entry.relativePath, reason: 'malformed-attempt-name' });
      continue;
    }
    if (owner !== sprint[1]) {
      hold.push({ source, relativePath: entry.relativePath, reason: 'foreign-sprint' });
      continue;
    }
    if (isCurrent) {
      hold.push({ source, relativePath: entry.relativePath, reason: 'current-window' });
      continue;
    }
    const file = identity(entry.path);
    const candidate = { source, relativePath: entry.relativePath, ...file };
    if (canonicalProof(manifest, entry.relativePath, file)) retire.push(candidate);
    else reconcile.push(candidate);
  }
  return {
    version: RUNTIME_EVALUATION_RETENTION_VERSION,
    projectRoot: root,
    sprintId,
    currentWindow,
    reconcile,
    retire,
    hold,
  };
}

function archiveCarriesTerminalSealOrApplication(root: string, sprintId: string): boolean {
  const archiveDir = resolveSprintArchiveDir(root, sprintId);
  return existsSync(join(archiveDir, 'terminal-seal-receipt.json'))
    || existsSync(join(archiveDir, 'terminal-seal-application.json'));
}

/** Publish, reconcile, verify, then retire only exact digest-bound duplicates. */
export function applyRuntimeEvaluationRetention(
  plan: RuntimeEvaluationRetentionPlan,
): RuntimeEvaluationRetentionResult {
  if (plan.version !== RUNTIME_EVALUATION_RETENTION_VERSION || !SPRINT_ID.test(plan.sprintId)) {
    throw new DeckentError(
      'INVALID_RUNTIME_EVALUATION_RETENTION_PLAN',
      'INVALID_RUNTIME_EVALUATION_RETENTION_PLAN',
    );
  }
  const root = resolve(plan.projectRoot);
  const evaluationRoot = join(root, '.deckent', 'runtime', 'evaluations', plan.sprintId);
  const failures: string[] = [];
  const published: string[] = [];
  const retired: string[] = [];
  const conflictSources = new Set<string>();
  const prior = readVerifiedManifest(root, plan.sprintId);
  const terminalArchive = archiveCarriesTerminalSealOrApplication(root, plan.sprintId);

  if (terminalArchive && plan.reconcile.length > 0) {
    failures.push(`${plan.sprintId}:TERMINAL_ARCHIVE_SEALED`);
  } else {
    for (const candidate of plan.reconcile) {
      const expected = join(evaluationRoot, candidate.relativePath);
      if (resolve(root, candidate.source) !== resolve(expected)) {
        failures.push(`${candidate.source}:SOURCE_IDENTITY_INVALID`);
        continue;
      }
      try {
        const fresh = identity(expected);
        if (fresh.bytes !== candidate.bytes || fresh.sha256 !== candidate.sha256) {
          failures.push(`${candidate.source}:SOURCE_CHANGED`);
          continue;
        }
        const publication = publishSprintArchiveArtifact(
          root,
          plan.sprintId,
          expected,
          `evaluations/${candidate.relativePath}`,
        );
        published.push(publication.path);
        if (publication.state === 'conflict') conflictSources.add(candidate.source);
      } catch (error) {
        failures.push(`${candidate.source}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  let manifest: SprintArchiveManifest | null = prior;
  if (!terminalArchive && failures.length === 0 && plan.reconcile.length > 0) {
    try {
      const reconciliation = reconcileSprintArchive(root, plan.sprintId, { apply: true });
      manifest = reconciliation.manifest;
      failures.push(...reconciliation.failures.map(failure => `${plan.sprintId}:${failure}`));
    } catch (error) {
      failures.push(`${plan.sprintId}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const archiveVerified = verifySprintArchive(root, plan.sprintId).ok;
  const candidates = terminalArchive ? plan.retire : [...plan.retire, ...plan.reconcile];
  const canRetire = archiveVerified && manifest !== null
    && (failures.length === 0 || (terminalArchive && failures.length === 1));
  if (canRetire) {
    for (const candidate of candidates) {
      if (conflictSources.has(candidate.source)) continue;
      const expected = join(evaluationRoot, candidate.relativePath);
      try {
        const fresh = identity(expected);
        if (fresh.bytes !== candidate.bytes || fresh.sha256 !== candidate.sha256) {
          failures.push(`${candidate.source}:SOURCE_CHANGED`);
          continue;
        }
        if (!canonicalProof(manifest, candidate.relativePath, fresh)) {
          failures.push(`${candidate.source}:ARCHIVE_PROOF_MISSING`);
          continue;
        }
        unlinkSync(expected);
        retired.push(candidate.source);
      } catch (error) {
        failures.push(`${candidate.source}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else if (candidates.length > 0 && failures.length === 0) {
    failures.push(`${plan.sprintId}:ARCHIVE_MANIFEST_UNVERIFIED`);
  }
  return { sprintId: plan.sprintId, published, retired, held: plan.hold, failures, archiveVerified };
}

export function reconcileRuntimeEvaluationRetention(
  projectRoot: string,
  sprintId: string,
  options: RuntimeEvaluationRetentionOptions = {},
): RuntimeEvaluationRetentionPlan | RuntimeEvaluationRetentionResult {
  const plan = planRuntimeEvaluationRetention(projectRoot, sprintId, options);
  return options.apply === true ? applyRuntimeEvaluationRetention(plan) : plan;
}

// Concise aliases for callers that name the family rather than its runtime root.
export const planEvaluationAuditRetention = planRuntimeEvaluationRetention;
export const applyEvaluationAuditRetention = applyRuntimeEvaluationRetention;
export const reconcileEvaluationAuditRetention = reconcileRuntimeEvaluationRetention;
