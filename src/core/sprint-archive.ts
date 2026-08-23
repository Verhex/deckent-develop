/**
 * Canonical sprint archive authority.
 *
 * Physical evidence belongs under one bounded namespace:
 *   <archive_path>/<sprint-id>/
 *     manifest.json
 *     tasks/
 *     evaluations/
 *     scheduler/
 *     heartbeat/
 *     docs/
 *
 * `.brain/memory.db` remains the semantic-learning authority. Reconciliation
 * writes only a small, searchable manifest reference there; raw evidence is
 * never duplicated into Brain by this module.
 */

import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  ARCHIVE_DIR,
  ARCHIVE_SPRINTS_SUBDIR,
  BRAIN_DIR,
  DECKENT_DIR,
  MEMORY_DB_FILE,
  PROJECT_CONFIG_PATH,
  TASKS_DIR,
} from './constants.js';
import { MemoryStore } from './memory-store.js';
import { debugLog } from './utils.js';

export const SPRINT_ARCHIVE_MANIFEST_KIND = 'deckent.sprint-archive-manifest';
export const SPRINT_ARCHIVE_MANIFEST_VERSION = 1;
export const SPRINT_ARCHIVE_MANIFEST_FILE = 'manifest.json';
export const SPRINT_ARCHIVE_TASKS_SUBDIR = 'tasks';
export const TASK_ARTIFACT_PRESERVED_SUBDIR = 'preserved';
export const TASK_ARTIFACT_PRESERVATION_MARKER_FILE = 'preservation-marker.json';
export const TASK_ARTIFACT_PRESERVATION_MARKER_KIND = 'deckent.task-artifact-preservation';

const DEFAULT_ARCHIVE_BASE = join(DECKENT_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR);
const LEGACY_TASK_ARCHIVE_SUBDIR = 'archive';
const HASH_BUFFER_BYTES = 1024 * 1024;
const SPRINT_ID_PATTERN = /^sprint-(\d+)$/u;

export type SprintArchiveArtifactFamily =
  | 'run'
  | 'tasks'
  | 'evaluations'
  | 'metrics'
  | 'scheduler'
  | 'heartbeat'
  | 'docs'
  | 'audits'
  | 'unknown';

export interface TaskArtifactPreservationMarker {
  readonly kind: typeof TASK_ARTIFACT_PRESERVATION_MARKER_KIND;
  readonly version: 1;
  readonly sprintId: string;
  readonly reason: 'non-terminal';
  readonly restorePath: string;
  readonly entries: readonly string[];
  readonly recordedAt: string;
}

export interface TaskArtifactArchivePlan {
  readonly archive: readonly string[];
  readonly preserve: readonly string[];
  /** Exact-sprint hidden/unclassified residue sweep; defaults to true. */
  readonly sweepResidue?: boolean;
}

export interface TaskArtifactArchiveResult {
  readonly destination: string;
  readonly preservedDestination: string;
  readonly archived: string[];
  readonly preserved: string[];
  readonly consolidated: string[];
  readonly residueSwept: string[];
  readonly failures: string[];
}

export interface SprintArchiveManifestArtifact {
  readonly path: string;
  readonly family: SprintArchiveArtifactFamily;
  readonly bytes: number;
  readonly sha256: string;
  readonly sources: readonly string[];
}

export interface SprintArchiveMemoryReference {
  readonly id: string;
  readonly type: string;
  readonly digest: string;
  readonly updatedAt: string;
}

export interface SprintArchiveManifest {
  readonly kind: typeof SPRINT_ARCHIVE_MANIFEST_KIND;
  readonly schemaVersion: typeof SPRINT_ARCHIVE_MANIFEST_VERSION;
  readonly sprintId: string;
  readonly terminalOutcome: string | null;
  readonly artifactCount: number;
  readonly totalBytes: number;
  readonly familyCounts: Readonly<Record<SprintArchiveArtifactFamily, number>>;
  readonly artifacts: readonly SprintArchiveManifestArtifact[];
  readonly conflicts: readonly {
    path: string;
    variants: readonly string[];
  }[];
  readonly memoryReferences: readonly SprintArchiveMemoryReference[];
  readonly contentDigest: string;
}

export interface SprintArchiveReconcileOptions {
  readonly apply?: boolean;
  /** Retire only verified legacy sources; live/hot runtime sources are never retired. */
  readonly retireLegacySources?: boolean;
  readonly indexMemory?: boolean;
}

export interface SprintArchiveReconcileReport {
  readonly sprintId: string;
  readonly archiveDir: string;
  readonly manifestPath: string;
  readonly applied: boolean;
  readonly discovered: number;
  readonly published: number;
  readonly deduplicated: number;
  readonly retired: number;
  readonly conflicts: number;
  readonly failures: readonly string[];
  readonly manifest: SprintArchiveManifest;
}

export interface SprintArchiveVerificationReport {
  readonly sprintId: string;
  readonly ok: boolean;
  readonly checked: number;
  readonly missing: readonly string[];
  readonly mismatched: readonly string[];
  readonly untracked: readonly string[];
  readonly manifestDigestValid: boolean;
}

export interface SprintArchiveArtifactPublication {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly state: 'published' | 'deduplicated' | 'conflict';
  readonly sourceRetired: boolean;
}

interface ArchiveCandidate {
  readonly source: string;
  readonly targetRelative: string;
  readonly family: SprintArchiveArtifactFamily;
  readonly retireLegacy: boolean;
}

interface PublishedCandidate extends ArchiveCandidate {
  readonly actualTargetRelative: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly state: 'published' | 'deduplicated' | 'planned' | 'conflict';
}

function assertSprintId(sprintId: string): void {
  if (!SPRINT_ID_PATTERN.test(sprintId)) {
    throw new Error(`INVALID_SPRINT_ID:${sprintId}`);
  }
}

function relativePortable(root: string, path: string): string {
  const projected = relative(root, path);
  if (projected === '') return '.';
  if (projected.startsWith('..') || isAbsolute(projected)) return basename(path);
  return projected.split(sep).join('/');
}

function safeConfiguredArchiveBase(projectRoot: string): string {
  let configured: string | null = null;
  try {
    const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
    if (existsSync(configPath)) {
      const parsed = JSON.parse(readFileSync(configPath, 'utf-8')) as {
        sprint_file_retention?: { archive_path?: unknown };
      } | null;
      const value = parsed?.sprint_file_retention?.archive_path;
      if (typeof value === 'string' && value.trim() !== '') configured = value.trim();
    }
  } catch (error) {
    debugLog('sprintArchive:config', error);
  }

  const candidate = resolve(projectRoot, configured ?? DEFAULT_ARCHIVE_BASE);
  const projected = relative(resolve(projectRoot), candidate);
  if (projected === '' || projected.startsWith('..') || isAbsolute(projected)) {
    return resolve(projectRoot, DEFAULT_ARCHIVE_BASE);
  }
  return candidate;
}

export function resolveSprintArchiveDir(projectRoot: string, sprintId: string): string {
  assertSprintId(sprintId);
  return join(safeConfiguredArchiveBase(projectRoot), sprintId);
}

export function resolveTaskArtifactArchiveDir(projectRoot: string, sprintId: string): string {
  return join(resolveSprintArchiveDir(projectRoot, sprintId), SPRINT_ARCHIVE_TASKS_SUBDIR);
}

/** Canonical-first, migration-aware read roots. No directory is created. */
export function resolveTaskArtifactReadDirs(projectRoot: string, sprintId: string): readonly string[] {
  assertSprintId(sprintId);
  const configuredBase = safeConfiguredArchiveBase(projectRoot);
  const candidates: string[] = [
    resolveTaskArtifactArchiveDir(projectRoot, sprintId),
    join(configuredBase, `${sprintId}-tasks`),
    join(projectRoot, DECKENT_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`),
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`),
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, `${sprintId}-tasks`),
    join(projectRoot, TASKS_DIR, LEGACY_TASK_ARCHIVE_SUBDIR, sprintId),
  ];
  const stagingRoot = join(projectRoot, TASKS_DIR, LEGACY_TASK_ARCHIVE_SUBDIR);
  try {
    candidates.push(...readdirSync(stagingRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory()
        && (entry.name === sprintId || entry.name.startsWith(`${sprintId}-`)))
      .map(entry => join(stagingRoot, entry.name)));
  } catch { /* no staging archive */ }
  return [...new Set(candidates.map(path => resolve(path)))].filter(path => existsSync(path));
}

function sprintNumber(sprintId: string): string {
  const match = SPRINT_ID_PATTERN.exec(sprintId);
  if (!match?.[1]) throw new Error(`INVALID_SPRINT_ID:${sprintId}`);
  return match[1];
}

/** Exact ownership predicate; foreign hidden worker artifacts never cross sprint boundaries. */
export function isSprintOwnedTaskArtifact(name: string, sprintId: string): boolean {
  const number = sprintNumber(sprintId);
  return name.startsWith(`task-${number}-`)
    || name.startsWith(`${number}-`)
    || name.startsWith(`.prompt-${number}-`)
    || name.startsWith(`.worker-${number}-`);
}

function hashFile(path: string): string {
  const descriptor = openSync(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  try {
    for (;;) {
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest('hex');
}

function fileIdentity(path: string): { bytes: number; sha256: string } {
  const metadata = lstatSync(path);
  if (!metadata.isFile()) throw new Error(`ARCHIVE_SOURCE_NOT_REGULAR_FILE:${path}`);
  return { bytes: statSync(path).size, sha256: hashFile(path) };
}

function conflictDestination(destination: string, sha256: string): string {
  return join(dirname(destination), 'conflicts', `${basename(destination)}.${sha256.slice(0, 16)}`);
}

function publishVerifiedCopy(source: string, requestedDestination: string): {
  destination: string;
  state: 'published' | 'deduplicated' | 'conflict';
  identity: { bytes: number; sha256: string };
} {
  const identity = fileIdentity(source);
  let destination = requestedDestination;
  let state: 'published' | 'deduplicated' | 'conflict' = 'published';
  if (existsSync(destination)) {
    const existing = fileIdentity(destination);
    if (existing.bytes === identity.bytes && existing.sha256 === identity.sha256) {
      return { destination, state: 'deduplicated', identity };
    }
    destination = conflictDestination(destination, identity.sha256);
    state = 'conflict';
    if (existsSync(destination)) {
      const conflict = fileIdentity(destination);
      if (conflict.bytes === identity.bytes && conflict.sha256 === identity.sha256) {
        return { destination, state, identity };
      }
      throw new Error(`ARCHIVE_CONFLICT_COLLISION:${destination}`);
    }
  }

  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(destination), `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    copyFileSync(source, temporary, fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE);
    const temporaryIdentity = fileIdentity(temporary);
    if (temporaryIdentity.bytes !== identity.bytes || temporaryIdentity.sha256 !== identity.sha256) {
      throw new Error(`ARCHIVE_COPY_DIGEST_MISMATCH:${source}`);
    }
    const descriptor = openSync(temporary, 'r');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    try {
      linkSync(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const winner = fileIdentity(destination);
      if (winner.bytes !== identity.bytes || winner.sha256 !== identity.sha256) throw error;
      state = 'deduplicated';
    }
    const directoryDescriptor = openSync(dirname(destination), 'r');
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } finally {
    try { unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { destination, state, identity };
}

/**
 * Publish one sprint-owned file without clobbering prior evidence. Different
 * bytes for the same logical path are retained below a hash-addressed
 * `conflicts/` directory. Source retirement happens only after the published
 * bytes independently match the source digest.
 */
export function publishSprintArchiveArtifact(
  projectRoot: string,
  sprintId: string,
  source: string,
  targetRelative: string,
  options: { readonly retireSource?: boolean } = {},
): SprintArchiveArtifactPublication {
  assertSprintId(sprintId);
  const archiveDir = resolveSprintArchiveDir(projectRoot, sprintId);
  const destination = resolve(archiveDir, targetRelative);
  if (
    targetRelative.trim() === ''
    || isAbsolute(targetRelative)
    || !destination.startsWith(`${resolve(archiveDir)}${sep}`)
  ) throw new Error(`INVALID_ARCHIVE_TARGET:${targetRelative}`);

  const publication = publishVerifiedCopy(source, destination);
  let sourceRetired = false;
  if (options.retireSource === true && resolve(source) !== resolve(publication.destination)) {
    const destinationIdentity = fileIdentity(publication.destination);
    const sourceIdentity = fileIdentity(source);
    if (
      destinationIdentity.bytes !== sourceIdentity.bytes
      || destinationIdentity.sha256 !== sourceIdentity.sha256
    ) throw new Error(`ARCHIVE_RETIREMENT_DIGEST_MISMATCH:${source}`);
    unlinkSync(source);
    sourceRetired = true;
  }
  return {
    path: relative(archiveDir, publication.destination).split(sep).join('/'),
    ...publication.identity,
    state: publication.state,
    sourceRetired,
  };
}

function moveVerified(source: string, requestedDestination: string): string {
  const published = publishVerifiedCopy(source, requestedDestination);
  const destinationIdentity = fileIdentity(published.destination);
  const sourceIdentity = fileIdentity(source);
  if (
    destinationIdentity.bytes !== sourceIdentity.bytes
    || destinationIdentity.sha256 !== sourceIdentity.sha256
  ) throw new Error(`ARCHIVE_MOVE_PRECONDITION_FAILED:${source}`);
  unlinkSync(source);
  return published.destination;
}

function listFilesRecursively(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort();
}

/**
 * Live task settlement. Every source is retired only after an independently
 * hashed destination exists. Legacy `.tasks/archive/<sprint>` is folded into
 * the same canonical task directory.
 */
export function archiveTaskArtifacts(
  projectRoot: string,
  sprintId: string,
  plan: TaskArtifactArchivePlan = { archive: [], preserve: [] },
): TaskArtifactArchiveResult {
  assertSprintId(sprintId);
  const destination = resolveTaskArtifactArchiveDir(projectRoot, sprintId);
  const preservedDestination = join(destination, TASK_ARTIFACT_PRESERVED_SUBDIR);
  const result: TaskArtifactArchiveResult = {
    destination,
    preservedDestination,
    archived: [],
    preserved: [],
    consolidated: [],
    residueSwept: [],
    failures: [],
  };
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return result;
  const preserveSet = new Set(plan.preserve);

  const settle = (name: string, targetDir: string, bucket: string[]): void => {
    const source = join(tasksDir, name);
    if (!existsSync(source)) return;
    if (!isSprintOwnedTaskArtifact(name, sprintId)) {
      result.failures.push(`${name}:SPRINT_OWNERSHIP_MISMATCH`);
      return;
    }
    try {
      moveVerified(source, join(targetDir, name));
      bucket.push(name);
    } catch (error) {
      result.failures.push(name);
      debugLog('archiveTaskArtifacts:move', error);
    }
  };

  for (const name of plan.archive) {
    if (!preserveSet.has(name)) settle(name, destination, result.archived);
  }
  for (const name of preserveSet) settle(name, preservedDestination, result.preserved);

  if (result.preserved.length > 0) {
    writeTaskArtifactPreservationMarker(projectRoot, sprintId, result.preserved);
  }

  const legacyRoot = join(tasksDir, LEGACY_TASK_ARCHIVE_SUBDIR);
  let legacyDirs: string[] = [];
  try {
    legacyDirs = readdirSync(legacyRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory()
        && (entry.name === sprintId || entry.name.startsWith(`${sprintId}-`)))
      .map(entry => join(legacyRoot, entry.name));
  } catch { /* no legacy staging root */ }
  for (const legacyDir of legacyDirs) {
    for (const source of listFilesRecursively(legacyDir)) {
      const rel = relative(legacyDir, source);
      const name = basename(source);
      if (
        !isSprintOwnedTaskArtifact(name, sprintId)
        && name !== TASK_ARTIFACT_PRESERVATION_MARKER_FILE
      ) continue;
      try {
        moveVerified(source, join(destination, rel));
        result.consolidated.push(rel.split(sep).join('/'));
      } catch (error) {
        result.failures.push(rel.split(sep).join('/'));
        debugLog('archiveTaskArtifacts:legacy', error);
      }
    }
    removeEmptyTree(legacyDir);
  }

  // Mid-run prompt cleanup historically used one unowned staging bucket.
  // Filename identity is sufficient for task-bound prompts/workers, so fold
  // only the exact sprint's files and leave ambiguous auditor residue intact.
  const orphanStaging = join(legacyRoot, '_orphaned');
  for (const source of listFilesRecursively(orphanStaging)) {
    const name = basename(source);
    if (!isSprintOwnedTaskArtifact(name, sprintId)) continue;
    try {
      moveVerified(source, join(destination, name));
      result.consolidated.push(`_orphaned/${name}`);
    } catch (error) {
      result.failures.push(`_orphaned/${name}`);
      debugLog('archiveTaskArtifacts:orphan-staging', error);
    }
  }
  removeEmptyTree(orphanStaging);

  if (plan.sweepResidue !== false) {
    let rootEntries: string[] = [];
    try { rootEntries = readdirSync(tasksDir); } catch (error) { debugLog('archiveTaskArtifacts:read', error); }
    for (const name of rootEntries) {
      if (!isSprintOwnedTaskArtifact(name, sprintId)) continue;
      const source = join(tasksDir, name);
      try {
        if (!lstatSync(source).isFile()) continue;
        moveVerified(source, join(destination, name));
        result.residueSwept.push(name);
      } catch (error) {
        result.failures.push(name);
        debugLog('archiveTaskArtifacts:residue', error);
      }
    }
  }
  return result;
}

export function writeTaskArtifactPreservationMarker(
  projectRoot: string,
  sprintId: string,
  entries: readonly string[],
): string | null {
  assertSprintId(sprintId);
  if (entries.length === 0) return null;
  const preservedDestination = join(
    resolveTaskArtifactArchiveDir(projectRoot, sprintId),
    TASK_ARTIFACT_PRESERVED_SUBDIR,
  );
  const marker: TaskArtifactPreservationMarker = {
    kind: TASK_ARTIFACT_PRESERVATION_MARKER_KIND,
    version: 1,
    sprintId,
    reason: 'non-terminal',
    restorePath: TASKS_DIR,
    entries: [...new Set(entries)].sort(),
    recordedAt: new Date().toISOString(),
  };
  const markerPath = join(preservedDestination, TASK_ARTIFACT_PRESERVATION_MARKER_FILE);
  writeJsonAtomic(markerPath, marker);
  return markerPath;
}

function removeEmptyTree(root: string): void {
  if (!existsSync(root)) return;
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.isDirectory()) removeEmptyTree(join(root, entry.name));
  }
  try { if (readdirSync(root).length === 0) rmdirSync(root); } catch { /* evidence remains */ }
}

function addDirectoryCandidates(
  candidates: ArchiveCandidate[],
  root: string,
  sourceRoot: string,
  targetRoot: string,
  family: SprintArchiveArtifactFamily,
  retireLegacy: boolean,
  filter?: (path: string) => boolean,
): void {
  for (const source of listFilesRecursively(sourceRoot)) {
    if (filter && !filter(source)) continue;
    candidates.push({
      source,
      targetRelative: join(targetRoot, relative(sourceRoot, source)),
      family,
      retireLegacy: retireLegacy && !resolve(source).startsWith(`${resolve(root, DECKENT_DIR, 'recently-works')}${sep}`),
    });
  }
}

function terminalOutcomeFromReceipt(projectRoot: string, sprintId: string, archiveDir: string): string | null {
  const candidates = [
    join(archiveDir, `${sprintId}-terminal-receipt.json`),
    join(projectRoot, DECKENT_DIR, 'recently-works', `${sprintId}-terminal-receipt.json`),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { terminalOutcome?: unknown };
      if (typeof parsed.terminalOutcome === 'string') return parsed.terminalOutcome;
    } catch { /* try next authority */ }
  }
  return null;
}

function collectHeartbeatCandidates(
  candidates: ArchiveCandidate[],
  projectRoot: string,
  sprintId: string,
): void {
  const prefix = `${sprintNumber(sprintId)}-`;
  const roots = [
    { root: join(projectRoot, TASKS_DIR, 'worker-heartbeat-authority'), target: 'heartbeat/docker' },
    { root: join(projectRoot, DECKENT_DIR, 'runtime', 'worker-heartbeat-authority'), target: 'heartbeat/in-process' },
  ];
  for (const item of roots) {
    if (!existsSync(item.root)) continue;
    let directories;
    try { directories = readdirSync(item.root, { withFileTypes: true }); } catch { continue; }
    for (const entry of directories) {
      if (!entry.isDirectory()) continue;
      const attemptRoot = join(item.root, entry.name);
      try {
        const parsed = JSON.parse(readFileSync(join(attemptRoot, 'identity.json'), 'utf-8')) as {
          identity?: { taskId?: unknown };
        };
        if (typeof parsed.identity?.taskId !== 'string' || !parsed.identity.taskId.startsWith(prefix)) continue;
      } catch {
        continue;
      }
      addDirectoryCandidates(candidates, projectRoot, attemptRoot, join(item.target, entry.name), 'heartbeat', false);
    }
  }
}

function collectArchiveCandidates(projectRoot: string, sprintId: string): ArchiveCandidate[] {
  const candidates: ArchiveCandidate[] = [];
  const archiveDir = resolveSprintArchiveDir(projectRoot, sprintId);
  const taskTarget = SPRINT_ARCHIVE_TASKS_SUBDIR;
  const legacyTaskDirs = [
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`),
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, `${sprintId}-tasks`),
    join(safeConfiguredArchiveBase(projectRoot), `${sprintId}-tasks`),
    join(projectRoot, DECKENT_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`),
  ];
  const tasksArchiveRoot = join(projectRoot, TASKS_DIR, LEGACY_TASK_ARCHIVE_SUBDIR);
  try {
    legacyTaskDirs.push(...readdirSync(tasksArchiveRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory()
        && (entry.name === sprintId || entry.name.startsWith(`${sprintId}-`)))
      .map(entry => join(tasksArchiveRoot, entry.name)));
  } catch { /* no tasks-local legacy archive */ }
  for (const dir of [...new Set(legacyTaskDirs.map(path => resolve(path)))]) {
    if (dir === resolveTaskArtifactArchiveDir(projectRoot, sprintId)) continue;
    addDirectoryCandidates(
      candidates,
      projectRoot,
      dir,
      taskTarget,
      'tasks',
      true,
      path => isSprintOwnedTaskArtifact(basename(path), sprintId)
        || basename(path) === TASK_ARTIFACT_PRESERVATION_MARKER_FILE,
    );
  }

  const liveTasks = join(projectRoot, TASKS_DIR);
  if (existsSync(join(projectRoot, DECKENT_DIR, 'recently-works', `${sprintId}-terminal-receipt.json`))) {
    let entries: string[] = [];
    try { entries = readdirSync(liveTasks); } catch { /* absent */ }
    for (const name of entries) {
      if (!isSprintOwnedTaskArtifact(name, sprintId)) continue;
      const source = join(liveTasks, name);
      try {
        if (lstatSync(source).isFile()) {
          candidates.push({ source, targetRelative: join(taskTarget, name), family: 'tasks', retireLegacy: false });
        }
      } catch { /* disappeared during read */ }
    }
  }

  const recentWorks = join(projectRoot, DECKENT_DIR, 'recently-works');
  if (existsSync(recentWorks)) {
    let entries: string[] = [];
    try { entries = readdirSync(recentWorks); } catch { /* absent */ }
    for (const name of entries) {
      if (!name.startsWith(`${sprintId}-`)) continue;
      const source = join(recentWorks, name);
      try {
        if (lstatSync(source).isFile()) {
          candidates.push({ source, targetRelative: name, family: 'run', retireLegacy: false });
        }
      } catch { /* disappeared during read */ }
    }
  }

  addDirectoryCandidates(
    candidates,
    projectRoot,
    join(projectRoot, DECKENT_DIR, 'runtime', 'evaluations', sprintId),
    'evaluations',
    'evaluations',
    false,
  );
  const schedulerCandidates = [
    join(projectRoot, DECKENT_DIR, 'runtime', 'scheduler-shadow', `${sprintId}.jsonl`),
    join(projectRoot, DECKENT_DIR, ARCHIVE_DIR, 'scheduler-shadow', `${sprintId}.jsonl`),
  ];
  for (const source of schedulerCandidates) {
    if (existsSync(source)) candidates.push({
      source,
      targetRelative: join('scheduler', basename(source)),
      family: 'scheduler',
      retireLegacy: source.includes(`${sep}${ARCHIVE_DIR}${sep}`),
    });
  }
  const legacyMetrics = join(
    projectRoot, DECKENT_DIR, ARCHIVE_DIR, 'metrics', `metrics-${sprintId}.jsonl.gz`,
  );
  if (existsSync(legacyMetrics)) candidates.push({
    source: legacyMetrics,
    targetRelative: join('metrics', 'legacy-metrics.jsonl.gz'),
    family: 'metrics',
    retireLegacy: true,
  });
  const job = join(projectRoot, DECKENT_DIR, 'runtime', 'jobs', `${sprintId}.json`);
  if (existsSync(job)) candidates.push({ source: job, targetRelative: 'job.json', family: 'run', retireLegacy: false });
  const checkpoint = join(projectRoot, DECKENT_DIR, `${sprintId}-checkpoint.json`);
  if (existsSync(checkpoint)) candidates.push({
    source: checkpoint,
    targetRelative: basename(checkpoint),
    family: 'run',
    retireLegacy: false,
  });

  const docs = [
    {
      source: join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, 'directives', `DIRECTIVES-${sprintId}.md`),
      target: 'docs/DIRECTIVES.md',
    },
    { source: join(projectRoot, BRAIN_DIR, 'sprints', `${sprintId}.md`), target: 'docs/brain-sprint.md' },
  ];
  for (const item of docs) {
    if (existsSync(item.source)) candidates.push({
      source: item.source,
      targetRelative: item.target,
      family: 'docs',
      retireLegacy: false,
    });
  }
  addDirectoryCandidates(
    candidates,
    projectRoot,
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, 'audits', sprintId),
    'audits',
    'audits',
    false,
  );
  addDirectoryCandidates(
    candidates,
    projectRoot,
    join(projectRoot, 'docs', 'audits', sprintId),
    'audits/project-docs',
    'audits',
    false,
  );
  const supervisorLog = join(projectRoot, BRAIN_DIR, 'logs', `${sprintId}-supervisor.log`);
  if (existsSync(supervisorLog)) candidates.push({
    source: supervisorLog,
    targetRelative: 'supervisor.log',
    family: 'run',
    retireLegacy: false,
  });
  collectHeartbeatCandidates(candidates, projectRoot, sprintId);

  // Existing canonical evidence is included during manifest construction, not
  // copied back onto itself.
  return candidates.filter(candidate => {
    const source = resolve(candidate.source);
    const target = resolve(archiveDir, candidate.targetRelative);
    return source !== target && existsSync(source);
  });
}

function familyForCanonicalPath(path: string): SprintArchiveArtifactFamily {
  const normalized = path.split(sep).join('/');
  if (normalized.startsWith('tasks/')) return 'tasks';
  if (normalized.startsWith('evaluations/')) return 'evaluations';
  if (normalized.startsWith('metrics/')) return 'metrics';
  if (normalized.startsWith('scheduler/')) return 'scheduler';
  if (normalized.startsWith('heartbeat/')) return 'heartbeat';
  if (normalized.startsWith('docs/')) return 'docs';
  if (normalized.startsWith('audits/')) return 'audits';
  return 'run';
}

function readMemoryReferences(projectRoot: string, sprintId: string): SprintArchiveMemoryReference[] {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return [];
  const number = Number.parseInt(sprintNumber(sprintId), 10);
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = db.prepare(`
      SELECT id, type, updated_at AS updatedAt, content, metadata
      FROM entries
      WHERE deleted_at IS NULL
        AND id != ?
        AND (sprint_id = ? OR sprint_num = ?)
      ORDER BY id
    `).all(`archive-${sprintId}`, sprintId, number) as Array<{
      id: string;
      type: string;
      updatedAt: string;
      content: string;
      metadata: string;
    }>;
    return rows.map(row => ({
      id: row.id,
      type: row.type,
      updatedAt: row.updatedAt,
      digest: createHash('sha256').update(JSON.stringify(row)).digest('hex'),
    }));
  } catch (error) {
    debugLog('sprintArchive:memoryRefs', error);
    return [];
  } finally {
    db?.close();
  }
}

function emptyFamilyCounts(): Record<SprintArchiveArtifactFamily, number> {
  return {
    run: 0,
    tasks: 0,
    evaluations: 0,
    metrics: 0,
    scheduler: 0,
    heartbeat: 0,
    docs: 0,
    audits: 0,
    unknown: 0,
  };
}

function manifestPayloadDigest(manifest: Omit<SprintArchiveManifest, 'contentDigest'>): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, path);
    const directoryDescriptor = openSync(dirname(path), 'r');
    try { fsyncSync(directoryDescriptor); } finally { closeSync(directoryDescriptor); }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function upsertMemoryArchiveIndex(
  projectRoot: string,
  manifest: SprintArchiveManifest,
  archiveDir: string,
): void {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return;
  const store = new MemoryStore(dbPath);
  try {
    const familySummary = Object.entries(manifest.familyCounts)
      .filter(([, count]) => count > 0)
      .map(([family, count]) => `${family}=${count}`)
      .join(', ');
    const id = `archive-${manifest.sprintId}`;
    const content = [
      `Canonical archive: ${relativePortable(projectRoot, archiveDir)}`,
      `Outcome: ${manifest.terminalOutcome ?? 'UNKNOWN'}`,
      `Artifacts: ${manifest.artifactCount}`,
      `Bytes: ${manifest.totalBytes}`,
      `Families: ${familySummary}`,
      `Manifest digest: sha256:${manifest.contentDigest}`,
    ].join('\n');
    const summary = `${manifest.artifactCount} artifacts; ${manifest.terminalOutcome ?? 'UNKNOWN'}`;
    const tags = ['sprint-archive', manifest.sprintId, manifest.terminalOutcome ?? 'unknown'];
    const metadata = {
      kind: SPRINT_ARCHIVE_MANIFEST_KIND,
      schemaVersion: SPRINT_ARCHIVE_MANIFEST_VERSION,
      manifestPath: relativePortable(projectRoot, join(archiveDir, SPRINT_ARCHIVE_MANIFEST_FILE)),
      manifestDigest: `sha256:${manifest.contentDigest}`,
      artifactCount: manifest.artifactCount,
      totalBytes: manifest.totalBytes,
    };
    const existing = store.getById(id);
    if (
      existing?.type === 'sprint-archive'
      && existing.source === 'brain'
      && existing.title === `${manifest.sprintId} archive evidence`
      && existing.content === content
      && existing.summary === summary
      && existing.tag_text === tags.join(' ')
      && existing.status === 'active'
      && existing.priority === 'normal'
      && existing.sprint_id === manifest.sprintId
      && existing.sprint_num === Number.parseInt(sprintNumber(manifest.sprintId), 10)
      && existing.lang === 'en'
      && existing.decay_exempt
      && existing.metadata === JSON.stringify(metadata)
      && (existing.tenant_id ?? null) === null
      && existing.deleted_at === null
    ) return;
    store.upsert({
      id,
      type: 'sprint-archive',
      title: `${manifest.sprintId} archive evidence`,
      content,
      summary,
      source: 'brain',
      status: 'active',
      sprint_id: manifest.sprintId,
      sprint_num: Number.parseInt(sprintNumber(manifest.sprintId), 10),
      tags,
      decay_exempt: true,
      metadata,
    }, 'sprint-archive-reconciler');
  } finally {
    store.close();
  }
}

export function reconcileSprintArchive(
  projectRoot: string,
  sprintId: string,
  options: SprintArchiveReconcileOptions = {},
): SprintArchiveReconcileReport {
  assertSprintId(sprintId);
  const apply = options.apply === true;
  const archiveDir = resolveSprintArchiveDir(projectRoot, sprintId);
  const manifestPath = join(archiveDir, SPRINT_ARCHIVE_MANIFEST_FILE);
  const priorManifest = readManifest(manifestPath);
  const candidates = collectArchiveCandidates(projectRoot, sprintId);
  const published: PublishedCandidate[] = [];
  const failures: string[] = [];
  const plannedIdentities = new Map<string, { bytes: number; sha256: string }>();
  let retired = 0;

  for (const candidate of candidates) {
    try {
      const identity = fileIdentity(candidate.source);
      const requestedDestination = join(archiveDir, candidate.targetRelative);
      if (!apply) {
        const requestedIdentity = plannedIdentities.get(resolve(requestedDestination))
          ?? (existsSync(requestedDestination) ? fileIdentity(requestedDestination) : null);
        let plannedDestination = requestedDestination;
        let state: PublishedCandidate['state'] = 'planned';
        if (
          requestedIdentity
          && (requestedIdentity.bytes !== identity.bytes || requestedIdentity.sha256 !== identity.sha256)
        ) {
          plannedDestination = conflictDestination(requestedDestination, identity.sha256);
          state = 'conflict';
          const conflictIdentity = plannedIdentities.get(resolve(plannedDestination))
            ?? (existsSync(plannedDestination) ? fileIdentity(plannedDestination) : null);
          if (
            conflictIdentity
            && (conflictIdentity.bytes !== identity.bytes || conflictIdentity.sha256 !== identity.sha256)
          ) throw new Error(`ARCHIVE_CONFLICT_COLLISION:${plannedDestination}`);
        }
        plannedIdentities.set(resolve(plannedDestination), identity);
        published.push({
          ...candidate,
          actualTargetRelative: relative(archiveDir, plannedDestination),
          ...identity,
          state,
        });
        continue;
      }
      const publication = publishVerifiedCopy(candidate.source, requestedDestination);
      const actualTargetRelative = relative(archiveDir, publication.destination);
      published.push({
        ...candidate,
        actualTargetRelative,
        ...publication.identity,
        state: publication.state,
      });
      if (options.retireLegacySources === true && candidate.retireLegacy) {
        const destinationIdentity = fileIdentity(publication.destination);
        if (
          destinationIdentity.bytes !== publication.identity.bytes
          || destinationIdentity.sha256 !== publication.identity.sha256
        ) throw new Error(`ARCHIVE_RETIREMENT_DIGEST_MISMATCH:${candidate.source}`);
        unlinkSync(candidate.source);
        removeEmptyTree(dirname(candidate.source));
        retired += 1;
      }
    } catch (error) {
      failures.push(`${relativePortable(projectRoot, candidate.source)}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sourceMap = new Map<string, Set<string>>();
  for (const artifact of priorManifest?.artifacts ?? []) {
    sourceMap.set(artifact.path, new Set(artifact.sources));
  }
  for (const item of published) {
    const key = item.actualTargetRelative.split(sep).join('/');
    const sources = sourceMap.get(key) ?? new Set<string>();
    sources.add(relativePortable(projectRoot, item.source));
    sourceMap.set(key, sources);
  }

  // Inspect/dry-run must describe existing canonical truth as well as newly
  // discovered legacy candidates. Earlier code returned an empty manifest for
  // a fully reconciled archive because it enumerated canonical files only in
  // apply mode.
  const artifactFiles = listFilesRecursively(archiveDir).filter(path => path !== manifestPath);
  const plannedOnly = apply ? [] : published;
  const artifactsByPath = new Map<string, SprintArchiveManifestArtifact>();
  for (const path of artifactFiles) {
    const rel = relative(archiveDir, path).split(sep).join('/');
    const identity = fileIdentity(path);
    artifactsByPath.set(rel, {
      path: rel,
      family: familyForCanonicalPath(rel),
      ...identity,
      sources: [...(sourceMap.get(rel) ?? new Set([rel]))].sort(),
    });
  }
  for (const item of plannedOnly) {
    const rel = item.actualTargetRelative.split(sep).join('/');
    const existing = artifactsByPath.get(rel);
    if (existing && existing.bytes === item.bytes && existing.sha256 === item.sha256) {
      artifactsByPath.set(rel, {
        ...existing,
        sources: [...(sourceMap.get(rel) ?? new Set(existing.sources))].sort(),
      });
      continue;
    }
    artifactsByPath.set(rel, {
      path: rel,
      family: item.family,
      bytes: item.bytes,
      sha256: item.sha256,
      sources: [relativePortable(projectRoot, item.source)],
    });
  }
  const artifacts = [...artifactsByPath.values()];

  const grouped = new Map<string, Set<string>>();
  for (const artifact of artifacts) {
    const conflictMatch = /^(.*\/)?conflicts\/(.+)\.[0-9a-f]{16}$/u.exec(artifact.path);
    const logicalPath = conflictMatch
      ? `${conflictMatch[1] ?? ''}${conflictMatch[2] ?? ''}`
      : artifact.path;
    const variants = grouped.get(logicalPath) ?? new Set<string>();
    variants.add(artifact.path);
    grouped.set(logicalPath, variants);
  }
  const conflicts = [...grouped.entries()]
    .filter(([, variants]) => variants.size > 1)
    .map(([path, variants]) => ({ path, variants: [...variants].sort() }))
    .sort((left, right) => left.path.localeCompare(right.path));
  artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const familyCounts = emptyFamilyCounts();
  let totalBytes = 0;
  for (const artifact of artifacts) {
    familyCounts[artifact.family] += 1;
    totalBytes += artifact.bytes;
  }
  const memoryReferences = readMemoryReferences(projectRoot, sprintId);
  const payload: Omit<SprintArchiveManifest, 'contentDigest'> = {
    kind: SPRINT_ARCHIVE_MANIFEST_KIND,
    schemaVersion: SPRINT_ARCHIVE_MANIFEST_VERSION,
    sprintId,
    terminalOutcome: terminalOutcomeFromReceipt(projectRoot, sprintId, archiveDir),
    artifactCount: artifacts.length,
    totalBytes,
    familyCounts,
    artifacts,
    conflicts,
    memoryReferences,
  };
  const manifest: SprintArchiveManifest = { ...payload, contentDigest: manifestPayloadDigest(payload) };
  if (apply && failures.length === 0) {
    writeJsonAtomic(manifestPath, manifest);
    if (options.indexMemory !== false) upsertMemoryArchiveIndex(projectRoot, manifest, archiveDir);
  }

  return {
    sprintId,
    archiveDir,
    manifestPath,
    applied: apply,
    discovered: candidates.length,
    published: published.filter(item => item.state === 'published').length,
    deduplicated: published.filter(item => item.state === 'deduplicated').length,
    retired,
    conflicts: published.filter(item => item.state === 'conflict').length,
    failures,
    manifest,
  };
}

function readManifest(path: string): SprintArchiveManifest | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as SprintArchiveManifest;
    if (
      parsed.kind !== SPRINT_ARCHIVE_MANIFEST_KIND
      || parsed.schemaVersion !== SPRINT_ARCHIVE_MANIFEST_VERSION
      || !SPRINT_ID_PATTERN.test(parsed.sprintId)
      || !Array.isArray(parsed.artifacts)
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifySprintArchive(projectRoot: string, sprintId: string): SprintArchiveVerificationReport {
  assertSprintId(sprintId);
  const archiveDir = resolveSprintArchiveDir(projectRoot, sprintId);
  const manifestPath = join(archiveDir, SPRINT_ARCHIVE_MANIFEST_FILE);
  const manifest = readManifest(manifestPath);
  if (!manifest || manifest.sprintId !== sprintId) {
    return {
      sprintId,
      ok: false,
      checked: 0,
      missing: [SPRINT_ARCHIVE_MANIFEST_FILE],
      mismatched: [],
      untracked: [],
      manifestDigestValid: false,
    };
  }
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const artifact of manifest.artifacts) {
    const path = resolve(archiveDir, artifact.path);
    if (!path.startsWith(`${resolve(archiveDir)}${sep}`) || !existsSync(path)) {
      missing.push(artifact.path);
      continue;
    }
    const identity = fileIdentity(path);
    if (identity.bytes !== artifact.bytes || identity.sha256 !== artifact.sha256) {
      mismatched.push(artifact.path);
    }
  }
  const tracked = new Set(manifest.artifacts.map(artifact => artifact.path));
  const untracked = listFilesRecursively(archiveDir)
    .filter(path => path !== manifestPath)
    .map(path => relative(archiveDir, path).split(sep).join('/'))
    .filter(path => !tracked.has(path));
  const { contentDigest: _digest, ...payload } = manifest;
  const manifestDigestValid = manifestPayloadDigest(payload) === manifest.contentDigest;
  return {
    sprintId,
    ok: missing.length === 0 && mismatched.length === 0 && untracked.length === 0 && manifestDigestValid,
    checked: manifest.artifacts.length,
    missing,
    mismatched,
    untracked,
    manifestDigestValid,
  };
}

function collectSprintIdsFromDirectory(ids: Set<string>, directory: string): void {
  if (!existsSync(directory)) return;
  let entries;
  try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const matches = entry.name.match(/sprint-(\d+)/gu) ?? [];
    for (const match of matches) ids.add(match);
  }
}

/** Bounded source-root discovery; it never recursively scans the repository. */
export function discoverSprintArchiveIds(projectRoot: string): readonly string[] {
  const ids = new Set<string>();
  const roots = [
    join(projectRoot, TASKS_DIR),
    join(projectRoot, TASKS_DIR, LEGACY_TASK_ARCHIVE_SUBDIR),
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR),
    join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR),
    join(projectRoot, BRAIN_DIR, 'sprints'),
    join(projectRoot, DECKENT_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR),
    join(projectRoot, DECKENT_DIR, 'recently-works'),
    join(projectRoot, DECKENT_DIR, 'runtime', 'evaluations'),
    join(projectRoot, DECKENT_DIR, 'runtime', 'scheduler-shadow'),
    join(projectRoot, DECKENT_DIR, 'runtime', 'jobs'),
  ];
  for (const root of roots) collectSprintIdsFromDirectory(ids, root);
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (existsSync(dbPath)) {
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const rows = db.prepare(`
        SELECT DISTINCT sprint_id AS sprintId, sprint_num AS sprintNum
        FROM entries
        WHERE deleted_at IS NULL AND (sprint_id IS NOT NULL OR sprint_num > 0)
      `).all() as Array<{ sprintId: string | null; sprintNum: number }>;
      for (const row of rows) {
        if (row.sprintId && SPRINT_ID_PATTERN.test(row.sprintId)) ids.add(row.sprintId);
        else if (row.sprintNum > 0) ids.add(`sprint-${row.sprintNum}`);
      }
    } catch (error) {
      debugLog('sprintArchive:discoverMemory', error);
    } finally {
      db?.close();
    }
  }
  return [...ids].sort((left, right) => Number(sprintNumber(left)) - Number(sprintNumber(right)));
}
