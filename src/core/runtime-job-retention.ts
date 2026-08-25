/**
 * Lossless retention for `.deckent/runtime/jobs`.
 *
 * A job status is display data, not retirement authority.  A record becomes a
 * candidate only when its owner is independently known to be inactive.  Apply
 * then uses the maintenance archive's digest-bound retire operation, so the
 * live file is never unlinked before immutable archive verification succeeds.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import type { RuntimeArtifactFamilyRetentionConfig } from './config-types.js';
import { DeckentError } from './errors.js';
import {
  publishMaintenanceArchive,
  type MaintenanceArchivePublication,
} from './maintenance-archive.js';

export const RUNTIME_JOB_RETENTION_VERSION = 1 as const;

const CURRENT_JOB_FILE = /^job-\d{13}-[0-9a-f-]+\.json$/iu;
const SPRINT_JOB_FILE = /^sprint-\d+\.json$/u;
const TERMINAL_STATUSES = new Set(['COMPLETE', 'COMPLETED', 'FAILED', 'NO_GO', 'ABORTED', 'CANCELLED']);

export type RuntimeJobOwnershipState = 'live' | 'inactive' | 'unknown';
export type RuntimeJobHoldReason =
  | 'active-or-nonterminal'
  | 'live-or-unknown-owner'
  | 'recent'
  | 'continuity-anchor'
  | 'unknown-namespace'
  | 'invalid-record'
  | 'non-regular-record';

export interface RuntimeJobRecordView {
  readonly fileName: string;
  readonly source: string;
  readonly identity: string;
  readonly namespace: 'current-job' | 'legacy-job' | 'sprint';
  readonly status: string;
  readonly updatedAtMs: number;
  readonly bytes: number;
  readonly record: Readonly<Record<string, unknown>>;
}

export interface RuntimeJobRetentionCandidate extends RuntimeJobRecordView {
  readonly lineage: string;
}

export interface RuntimeJobRetentionHold {
  readonly fileName: string;
  readonly source: string;
  readonly reason: RuntimeJobHoldReason;
}

export interface RuntimeJobRetentionOptions {
  readonly bounds: RuntimeArtifactFamilyRetentionConfig;
  readonly archivePath?: string;
  readonly now?: () => number;
  /** Independent process/session ownership evidence. Missing evidence is unknown. */
  readonly ownership?: (job: RuntimeJobRecordView) => RuntimeJobOwnershipState;
}

export interface RuntimeJobRetentionPlan {
  readonly version: typeof RUNTIME_JOB_RETENTION_VERSION;
  readonly projectRoot: string;
  readonly archivePath?: string;
  readonly retire: readonly RuntimeJobRetentionCandidate[];
  readonly retain: readonly RuntimeJobRecordView[];
  readonly hold: readonly RuntimeJobRetentionHold[];
}

export interface RuntimeJobRetentionResult {
  readonly retired: readonly string[];
  readonly retained: readonly RuntimeJobRecordView[];
  readonly held: readonly RuntimeJobRetentionHold[];
  readonly publications: readonly MaintenanceArchivePublication[];
  readonly failures: readonly string[];
}

function portable(path: string): string {
  return path.split(sep).join('/');
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function timestamp(record: Readonly<Record<string, unknown>>, fallback: number): number {
  for (const key of ['completedAt', 'updatedAt', 'startedAt', 'createdAt']) {
    const value = text(record[key]);
    if (value !== undefined) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function identityAndNamespace(
  fileName: string,
  record: Readonly<Record<string, unknown>>,
): Pick<RuntimeJobRecordView, 'identity' | 'namespace'> | null {
  if (!CURRENT_JOB_FILE.test(fileName) && !SPRINT_JOB_FILE.test(fileName)) return null;
  const stem = fileName.slice(0, -'.json'.length);
  const declaredSprint = text(record['sprintId']);
  if (declaredSprint !== undefined && /^sprint-\d+$/u.test(declaredSprint)) {
    return { identity: declaredSprint, namespace: 'sprint' };
  }
  if (CURRENT_JOB_FILE.test(fileName)) {
    return { identity: text(record['jobId']) ?? stem, namespace: 'current-job' };
  }
  // Thirteen digit sprint names were the detached-job namespace.  Shorter
  // sprint names remain real sprint identities even when old records omit it.
  return /^sprint-\d{13}$/u.test(stem)
    ? { identity: text(record['jobId']) ?? stem, namespace: 'legacy-job' }
    : { identity: stem, namespace: 'sprint' };
}

function validateBounds(bounds: RuntimeArtifactFamilyRetentionConfig): void {
  if (!Number.isInteger(bounds.max_age_days) || bounds.max_age_days < 1
    || !Number.isInteger(bounds.max_count) || bounds.max_count < 1
    || !Number.isFinite(bounds.max_size_mb) || bounds.max_size_mb <= 0) {
    throw new DeckentError('INVALID_RUNTIME_JOB_RETENTION_BOUNDS', 'INVALID_RUNTIME_JOB_RETENTION_BOUNDS');
  }
}

/** Build a side-effect-free plan. The newest readable view is retained. */
export function planRuntimeJobRetention(
  projectRoot: string,
  options: RuntimeJobRetentionOptions,
): RuntimeJobRetentionPlan {
  validateBounds(options.bounds);
  const root = resolve(projectRoot);
  const jobsDir = join(root, '.deckent', 'runtime', 'jobs');
  const now = (options.now ?? Date.now)();
  const views: RuntimeJobRecordView[] = [];
  const hold: RuntimeJobRetentionHold[] = [];
  let names: string[] = [];
  try { names = readdirSync(jobsDir).sort(); } catch { /* absent is empty */ }

  for (const fileName of names) {
    const absolute = join(jobsDir, fileName);
    const source = portable(relative(root, absolute));
    let stat;
    try { stat = lstatSync(absolute); } catch { continue; }
    if (!stat.isFile()) {
      hold.push({ fileName, source, reason: 'non-regular-record' });
      continue;
    }
    if (!CURRENT_JOB_FILE.test(fileName) && !SPRINT_JOB_FILE.test(fileName)) {
      hold.push({ fileName, source, reason: 'unknown-namespace' });
      continue;
    }
    try {
      const parsed = JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new DeckentError('invalid', 'invalid');
      const record = parsed as Readonly<Record<string, unknown>>;
      const identified = identityAndNamespace(fileName, record);
      const status = text(record['status']);
      if (!identified || status === undefined) throw new DeckentError('invalid', 'invalid');
      views.push({ fileName, source, ...identified, status, updatedAtMs: timestamp(record, stat.mtimeMs), bytes: stat.size, record });
    } catch {
      hold.push({ fileName, source, reason: 'invalid-record' });
    }
  }

  views.sort((a, b) => b.updatedAtMs - a.updatedAtMs || b.fileName.localeCompare(a.fileName));
  let continuityAnchorAssigned = false;
  const retained: RuntimeJobRecordView[] = [];
  const eligible: RuntimeJobRetentionCandidate[] = [];
  const maxAgeMs = options.bounds.max_age_days * 86_400_000;

  for (const view of views) {
    // Active semantics are stronger than recency. Keeping this check ahead of
    // the continuity anchor also makes the hold reason expose why pressure can
    // never turn a RUNNING record into a retirement candidate.
    if (!TERMINAL_STATUSES.has(view.status)) {
      retained.push(view);
      hold.push({ fileName: view.fileName, source: view.source, reason: 'active-or-nonterminal' });
      continue;
    }
    // Readers which resume or select "latest job" must never lose their
    // newest readable record, even under an aggressive count/size policy.
    if (!continuityAnchorAssigned) {
      continuityAnchorAssigned = true;
      retained.push(view);
      hold.push({ fileName: view.fileName, source: view.source, reason: 'continuity-anchor' });
      continue;
    }
    if ((options.ownership?.(view) ?? 'unknown') !== 'inactive') {
      retained.push(view);
      hold.push({ fileName: view.fileName, source: view.source, reason: 'live-or-unknown-owner' });
      continue;
    }
    eligible.push({ ...view, lineage: `${view.namespace}:${view.identity}` });
  }

  // Only inactive terminal records may satisfy bounds. Age, count, and size are
  // independent triggers; active/unknown records above never enter this pool.
  const retire = new Set<RuntimeJobRetentionCandidate>();
  for (const candidate of eligible) {
    if (now - candidate.updatedAtMs > maxAgeMs) retire.add(candidate);
  }
  let keptCount = views.length;
  let keptBytes = views.reduce((sum, view) => sum + view.bytes, 0);
  const sizeLimit = options.bounds.max_size_mb * 1024 * 1024;
  for (const candidate of [...eligible].sort((a, b) => a.updatedAtMs - b.updatedAtMs || a.fileName.localeCompare(b.fileName))) {
    if (retire.has(candidate)) {
      keptCount -= 1;
      keptBytes -= candidate.bytes;
      continue;
    }
    if (keptCount > options.bounds.max_count || keptBytes > sizeLimit) {
      retire.add(candidate);
      keptCount -= 1;
      keptBytes -= candidate.bytes;
    } else {
      retained.push(candidate);
      hold.push({ fileName: candidate.fileName, source: candidate.source, reason: 'recent' });
    }
  }
  return { version: RUNTIME_JOB_RETENTION_VERSION, projectRoot: root, ...(options.archivePath ? { archivePath: options.archivePath } : {}), retire: [...retire], retain: retained, hold };
}

/** Archive and retire exactly the individually planned records. */
export function applyRuntimeJobRetention(plan: RuntimeJobRetentionPlan): RuntimeJobRetentionResult {
  if (plan.version !== RUNTIME_JOB_RETENTION_VERSION) throw new DeckentError('INVALID_RUNTIME_JOB_RETENTION_PLAN', 'INVALID_RUNTIME_JOB_RETENTION_PLAN');
  const retired: string[] = [];
  const publications: MaintenanceArchivePublication[] = [];
  const failures: string[] = [];
  for (const candidate of plan.retire) {
    try {
      const publication = publishMaintenanceArchive(plan.projectRoot, {
        source: candidate.source,
        lineage: candidate.lineage,
        retireSource: true,
        ...(plan.archivePath ? { archiveRoot: plan.archivePath } : {}),
      });
      publications.push(publication);
      if (publication.sourceRetired) retired.push(candidate.source);
      else failures.push(`${candidate.source}:SOURCE_NOT_RETIRED`);
    } catch (error) {
      failures.push(`${candidate.source}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { retired, retained: plan.retain, held: plan.hold, publications, failures };
}

export function reconcileRuntimeJobRetention(
  projectRoot: string,
  options: RuntimeJobRetentionOptions & { readonly apply?: boolean },
): RuntimeJobRetentionPlan | RuntimeJobRetentionResult {
  const plan = planRuntimeJobRetention(projectRoot, options);
  return options.apply === true ? applyRuntimeJobRetention(plan) : plan;
}
