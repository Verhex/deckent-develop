/**
 * Lossless retirement authority for the small set of historical files that
 * remain in `.deckent/recently-works` after a sprint archive reconcile.
 *
 * This module intentionally does not offer a directory cleanup operation.
 * Every retirement is an individually planned, digest-bound unlink and is
 * gated by a freshly verified sprint archive manifest.
 */
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { DeckentError } from './errors.js';
import {
  reconcileSprintArchive,
  verifySprintArchive,
  type SprintArchiveManifestArtifact,
} from './sprint-archive.js';

export const RECENT_WORK_RETENTION_VERSION = 1 as const;

const SPRINT_ID = /^sprint-(\d+)$/u;
const PHASE5_STAGING_SUFFIX = /^phase5(?:-staging)?(?:[.-][a-z0-9][a-z0-9._-]*)$/u;
const RECOVERY_NOT_DISPATCHED = 'sprint-479-recovery-not-dispatched.json';

export type RecentWorkRetirementKind = 'canonical-duplicate' | 'archive-then-retire';
export type RecentWorkHoldReason =
  | 'unknown-content'
  | 'nested-content'
  | 'non-regular-content'
  | 'foreign-sprint'
  | 'archive-proof-missing';

export interface RecentWorkRetirementCandidate {
  readonly name: string;
  readonly source: string;
  readonly kind: RecentWorkRetirementKind;
  readonly bytes: number;
  readonly sha256: string;
}

export interface RecentWorkHold {
  readonly name: string;
  readonly source: string;
  readonly reason: RecentWorkHoldReason;
}

export interface RecentWorkRetentionPlan {
  readonly version: typeof RECENT_WORK_RETENTION_VERSION;
  readonly projectRoot: string;
  readonly sprintId: string;
  readonly retire: readonly RecentWorkRetirementCandidate[];
  readonly hold: readonly RecentWorkHold[];
}

export interface RecentWorkRetentionApplyResult {
  readonly sprintId: string;
  readonly retired: readonly string[];
  readonly held: readonly RecentWorkHold[];
  readonly failures: readonly string[];
  readonly archiveVerified: boolean;
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

function identity(path: string): { bytes: number; sha256: string } {
  const metadata = lstatSync(path);
  if (!metadata.isFile()) {
    throw new DeckentError('RECENT_WORK_NOT_REGULAR', 'RECENT_WORK_NOT_REGULAR');
  }
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
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

function sourceRelative(root: string, path: string): string {
  return portable(relative(root, path));
}

function exactSprintName(name: string, sprintId: string): boolean {
  return name.startsWith(`${sprintId}-`);
}

function phase5StagingName(name: string, sprintId: string): boolean {
  if (!exactSprintName(name, sprintId)) return false;
  return PHASE5_STAGING_SUFFIX.test(name.slice(sprintId.length + 1));
}

function canonicalDuplicateProof(
  artifacts: readonly SprintArchiveManifestArtifact[],
  name: string,
  digest: string,
): boolean {
  return artifacts.some(artifact => artifact.path === name && artifact.sha256 === digest);
}

/**
 * Inspect only direct children of recently-works. Unknown files, directories,
 * symlinks, and other sprint ownership domains are explicit HOLDs.
 */
export function planRecentWorkRetention(
  projectRoot: string,
  sprintId: string,
): RecentWorkRetentionPlan {
  if (!SPRINT_ID.test(sprintId)) {
    throw new DeckentError('INVALID_SPRINT_ID', `INVALID_SPRINT_ID:${sprintId}`);
  }
  const root = resolve(projectRoot);
  const recentRoot = join(root, '.deckent', 'recently-works');
  const retire: RecentWorkRetirementCandidate[] = [];
  const hold: RecentWorkHold[] = [];
  const verification = verifySprintArchive(root, sprintId);
  const manifestArtifacts = verification.ok
    ? reconcileSprintArchive(root, sprintId).manifest.artifacts
    : [];

  let names: string[] = [];
  try { names = readdirSync(recentRoot).sort(); } catch { /* absent is an empty plan */ }
  for (const name of names) {
    const sourcePath = join(recentRoot, name);
    const source = sourceRelative(root, sourcePath);
    let metadata;
    try { metadata = lstatSync(sourcePath); } catch { continue; }
    if (metadata.isDirectory()) {
      hold.push({ name, source, reason: 'nested-content' });
      continue;
    }
    if (!metadata.isFile()) {
      hold.push({ name, source, reason: 'non-regular-content' });
      continue;
    }
    if (!exactSprintName(name, sprintId)) {
      hold.push({ name, source, reason: 'foreign-sprint' });
      continue;
    }
    const file = identity(sourcePath);
    if (phase5StagingName(name, sprintId)) {
      if (verification.ok && canonicalDuplicateProof(manifestArtifacts, name, file.sha256)) {
        retire.push({ name, source, kind: 'canonical-duplicate', ...file });
      } else {
        hold.push({ name, source, reason: 'archive-proof-missing' });
      }
      continue;
    }
    if (sprintId === 'sprint-479' && name === RECOVERY_NOT_DISPATCHED) {
      retire.push({ name, source, kind: 'archive-then-retire', ...file });
      continue;
    }
    hold.push({ name, source, reason: 'unknown-content' });
  }
  return { version: RECENT_WORK_RETENTION_VERSION, projectRoot: root, sprintId, retire, hold };
}

/**
 * Publish/reconcile first, verify the resulting manifest, then unlink only the
 * exact files and digests captured by the plan. A changed source or missing
 * proof remains byte-preserved and is reported as a failure.
 */
export function applyRecentWorkRetention(
  plan: RecentWorkRetentionPlan,
): RecentWorkRetentionApplyResult {
  if (plan.version !== RECENT_WORK_RETENTION_VERSION || !SPRINT_ID.test(plan.sprintId)) {
    throw new DeckentError(
      'INVALID_RECENT_WORK_RETENTION_PLAN',
      'INVALID_RECENT_WORK_RETENTION_PLAN',
    );
  }
  const root = resolve(plan.projectRoot);
  const recentRoot = join(root, '.deckent', 'recently-works');
  const failures: string[] = [];
  const retired: string[] = [];
  const reconciliation = reconcileSprintArchive(root, plan.sprintId, {
    apply: true,
    retireLegacySources: false,
    indexMemory: false,
  });
  failures.push(...reconciliation.failures);
  const verification = reconciliation.failures.length === 0
    ? verifySprintArchive(root, plan.sprintId)
    : null;
  const archiveVerified = verification?.ok === true;

  if (archiveVerified) {
    for (const candidate of plan.retire) {
      const expectedSource = join(recentRoot, candidate.name);
      if (resolve(root, candidate.source) !== expectedSource || !existsSync(expectedSource)) {
        failures.push(`${candidate.source}:SOURCE_IDENTITY_INVALID`);
        continue;
      }
      try {
        const fresh = identity(expectedSource);
        if (fresh.bytes !== candidate.bytes || fresh.sha256 !== candidate.sha256) {
          failures.push(`${candidate.source}:SOURCE_CHANGED`);
          continue;
        }
        const proof = reconciliation.manifest.artifacts.find(artifact =>
          artifact.sha256 === candidate.sha256
          && artifact.bytes === candidate.bytes
          && artifact.sources.includes(candidate.source)
          && (candidate.kind !== 'canonical-duplicate' || artifact.path === candidate.name));
        if (!proof) {
          failures.push(`${candidate.source}:ARCHIVE_PROOF_MISSING`);
          continue;
        }
        unlinkSync(expectedSource);
        retired.push(candidate.source);
      } catch (error) {
        failures.push(`${candidate.source}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else if (plan.retire.length > 0 && reconciliation.failures.length === 0) {
    failures.push(`${plan.sprintId}:ARCHIVE_MANIFEST_UNVERIFIED`);
  }

  return {
    sprintId: plan.sprintId,
    retired,
    held: plan.hold,
    failures,
    archiveVerified,
  };
}

/** Convenience entrypoint retaining an explicit inspect/apply boundary. */
export function reconcileRecentWorkRetention(
  projectRoot: string,
  sprintId: string,
  options: { readonly apply?: boolean } = {},
): RecentWorkRetentionPlan | RecentWorkRetentionApplyResult {
  const plan = planRecentWorkRetention(projectRoot, sprintId);
  return options.apply === true ? applyRecentWorkRetention(plan) : plan;
}
