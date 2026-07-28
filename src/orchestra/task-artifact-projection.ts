// ═══ task-artifact-projection — atomic compatibility projection authority ═══
//
// Exact plans remain canonical in the run-flow store. Task JSON files are a
// compatibility projection only: they may be created idempotently, but never
// overwrite, follow a symlink, or turn partial/conflicting state into success.

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

import { TASKS_DIR } from '../core/constants.js';

export type TaskArtifactProjectionErrorCode =
  | 'TASK_ARTIFACT_ID_INVALID'
  | 'TASK_ARTIFACT_DIRECTORY_DRIFT'
  | 'TASK_ARTIFACT_CONTENT_CONFLICT'
  | 'TASK_ARTIFACT_DURABILITY_HOLD';

export class TaskArtifactProjectionError extends Error {
  constructor(
    readonly code: TaskArtifactProjectionErrorCode,
    readonly details: Readonly<Record<string, unknown>> = {},
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'TaskArtifactProjectionError';
  }
}

export interface TaskArtifactProjectionResult {
  readonly taskIds: readonly string[];
  readonly created: readonly string[];
  readonly idempotent: readonly string[];
}

export interface TaskArtifactProjectionInspection {
  readonly taskIds: readonly string[];
  readonly idempotent: readonly string[];
  readonly missing: readonly string[];
}

export interface TaskArtifactProjectionSet<T extends { readonly id: string }> {
  readonly taskIds: readonly string[];
  readonly tasks: readonly T[];
  /** Canonical exact-content root in caller-supplied task order. */
  readonly projectionDigest: string;
  readonly contentDigests: Readonly<Record<string, string>>;
}

export interface StructuredCriteriaProjectionAdoption<T extends { readonly id: string }> {
  readonly sprintId: string;
  readonly legacyProjectionDigest: string;
  readonly canonicalProjectionDigest: string;
  readonly canonicalTasks: readonly T[];
  readonly alreadyCanonical: readonly string[];
  readonly requiresMigration: readonly string[];
}

interface TaskTarget<T extends { readonly id: string }> {
  readonly task: T;
  readonly fileName: string;
  readonly target: string;
}

interface ProjectionInspectionInternal<T extends { readonly id: string }>
  extends TaskArtifactProjectionInspection {
  readonly tasksReal: string;
  readonly targets: readonly TaskTarget<T>[];
  readonly missingTargets: readonly TaskTarget<T>[];
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

function projectionDigest(
  tasks: readonly { readonly id: string }[],
  contentDigests: Readonly<Record<string, string>>,
): string {
  return createHash('sha256').update(canonicalJson({
    schemaVersion: 1,
    slots: tasks.map((task, index) => ({
      slot: index + 1,
      taskId: task.id,
      contentSha256: contentDigests[task.id],
    })),
  })).digest('hex');
}

function taskPayloadMatches(path: string, task: unknown): boolean {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    return canonicalJson(JSON.parse(readFileSync(path, 'utf8'))) === canonicalJson(task);
  } catch {
    return false;
  }
}

function safeTaskFileName(taskId: string): string {
  if (
    taskId === '.'
    || taskId === '..'
    || /[. ]$/.test(taskId)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId)
  ) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_ID_INVALID', { taskId });
  }
  const fileName = `task-${taskId}.json`;
  if (Buffer.byteLength(fileName, 'utf8') > 255) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_ID_INVALID', {
      taskId,
      reason: 'portable_filename_limit',
    });
  }
  const stem = taskId.split('.')[0]!.toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_ID_INVALID', {
      taskId,
      reason: 'reserved_platform_filename',
    });
  }
  return fileName;
}

function resolveTasksDirectory(root: string, create: boolean): string {
  const tasksDir = join(root, TASKS_DIR);
  if (create) mkdirSync(tasksDir, { recursive: true });
  if (!existsSync(tasksDir)) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_DURABILITY_HOLD', {
      reason: 'task_directory_missing',
    });
  }
  const rootReal = realpathSync(root);
  const tasksStat = lstatSync(tasksDir);
  const tasksReal = realpathSync(tasksDir);
  const tasksRelative = relative(rootReal, tasksReal);
  const outsideRoot = tasksRelative === '..'
    || tasksRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
    || isAbsolute(tasksRelative);
  if (!tasksStat.isDirectory() || tasksStat.isSymbolicLink() || outsideRoot) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_DIRECTORY_DRIFT');
  }
  return tasksReal;
}

function assertPortableTargetSet(taskIds: readonly string[]): readonly string[] {
  const fileNames = taskIds.map(safeTaskFileName);
  const uniqueTargets = new Set(
    fileNames.map(fileName => fileName.toLocaleLowerCase('en-US')),
  );
  if (uniqueTargets.size !== fileNames.length) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_ID_INVALID', {
      reason: 'duplicate_or_case_fold_collision',
    });
  }
  return fileNames;
}

function readStableTaskArtifact<T extends { readonly id: string }>(
  target: string,
  expectedTaskId: string,
): { readonly task: T; readonly contentDigest: string } {
  let fd: number | undefined;
  try {
    const before = lstatSync(target);
    if (!before.isFile() || before.isSymbolicLink()) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
        taskId: expectedTaskId,
        reason: 'artifact_not_regular_file',
      });
    }
    fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_DIRECTORY_DRIFT', {
        taskId: expectedTaskId,
        reason: 'artifact_generation_changed_before_read',
      });
    }
    const raw = readFileSync(fd, 'utf8');
    const after = lstatSync(target);
    if (after.dev !== opened.dev || after.ino !== opened.ino) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_DIRECTORY_DRIFT', {
        taskId: expectedTaskId,
        reason: 'artifact_generation_changed_after_read',
      });
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed === null
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || (parsed as { id?: unknown }).id !== expectedTaskId
    ) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
        taskId: expectedTaskId,
        reason: 'artifact_identity_mismatch',
      });
    }
    const task = parsed as T;
    return {
      task,
      contentDigest: createHash('sha256').update(canonicalJson(task)).digest('hex'),
    };
  } catch (cause) {
    if (cause instanceof TaskArtifactProjectionError) throw cause;
    throw new TaskArtifactProjectionError(
      'TASK_ARTIFACT_DURABILITY_HOLD',
      { taskId: expectedTaskId, reason: 'artifact_read_unavailable' },
      { cause },
    );
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Read an exact, caller-enumerated legacy projection set without creating files
 * or trusting directory enumeration as plan authority.
 */
export function readTaskArtifactProjectionSet<T extends { readonly id: string }>(
  root: string,
  expectedTaskIds: readonly string[],
): TaskArtifactProjectionSet<T> {
  const tasksReal = resolveTasksDirectory(root, false);
  const fileNames = assertPortableTargetSet(expectedTaskIds);
  const existingNames = new Map(
    readdirSync(tasksReal).map(name => [name.toLocaleLowerCase('en-US'), name] as const),
  );
  const tasks: T[] = [];
  const contentDigests: Record<string, string> = {};
  for (let index = 0; index < expectedTaskIds.length; index++) {
    const taskId = expectedTaskIds[index]!;
    const fileName = fileNames[index]!;
    const caseFoldMatch = existingNames.get(fileName.toLocaleLowerCase('en-US'));
    if (caseFoldMatch !== fileName) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
        taskId,
        reason: caseFoldMatch === undefined
          ? 'expected_artifact_missing'
          : 'portable_case_fold_collision',
      });
    }
    const observed = readStableTaskArtifact<T>(join(tasksReal, fileName), taskId);
    tasks.push(observed.task);
    contentDigests[taskId] = observed.contentDigest;
  }
  return {
    taskIds: [...expectedTaskIds],
    tasks,
    projectionDigest: projectionDigest(tasks, contentDigests),
    contentDigests: Object.freeze({ ...contentDigests }),
  };
}

function withoutStructuredCriteria<T extends { readonly id: string }>(task: T): T {
  const copy = structuredClone(task) as T & {
    goNogo?: { items?: unknown };
  };
  if (copy.goNogo && typeof copy.goNogo === 'object') delete copy.goNogo.items;
  return copy;
}

/**
 * Validate the one supported legacy migration: retain the existing task
 * timestamp, add fresh structured acceptance criteria, and change nothing else.
 */
export function inspectStructuredCriteriaProjectionAdoption<
  T extends {
    readonly id: string;
    readonly sprintId?: string;
    readonly createdAt?: string;
    readonly goNogo?: { readonly items?: readonly unknown[] };
  },
>(
  root: string,
  sprintId: string,
  freshTasks: readonly T[],
): StructuredCriteriaProjectionAdoption<T> {
  const observed = readTaskArtifactProjectionSet<T>(
    root,
    freshTasks.map(task => task.id),
  );
  const canonicalTasks: T[] = [];
  const alreadyCanonical: string[] = [];
  const requiresMigration: string[] = [];
  for (let index = 0; index < freshTasks.length; index++) {
    const fresh = freshTasks[index]!;
    const current = observed.tasks[index]!;
    if (current.sprintId !== sprintId || fresh.sprintId !== sprintId) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
        taskId: fresh.id,
        reason: 'sprint_identity_mismatch',
      });
    }
    const canonical = {
      ...structuredClone(fresh),
      ...(current.createdAt !== undefined ? { createdAt: current.createdAt } : {}),
    } as T;
    if (canonicalJson(current) === canonicalJson(canonical)) {
      alreadyCanonical.push(fresh.id);
    } else if (
      (current.goNogo?.items === undefined || current.goNogo.items.length === 0)
      && canonicalJson(current) === canonicalJson(withoutStructuredCriteria(canonical))
    ) {
      requiresMigration.push(fresh.id);
    } else {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
        taskId: fresh.id,
        reason: 'unsupported_legacy_projection_drift',
      });
    }
    canonicalTasks.push(canonical);
  }
  const canonicalDigests = Object.fromEntries(canonicalTasks.map(task => [
    task.id,
    createHash('sha256').update(canonicalJson(task)).digest('hex'),
  ]));
  const legacyTasks = canonicalTasks.map(withoutStructuredCriteria);
  const legacyDigests = Object.fromEntries(legacyTasks.map(task => [
    task.id,
    createHash('sha256').update(canonicalJson(task)).digest('hex'),
  ]));
  return {
    sprintId,
    legacyProjectionDigest: projectionDigest(legacyTasks, legacyDigests),
    canonicalProjectionDigest: projectionDigest(canonicalTasks, canonicalDigests),
    canonicalTasks,
    alreadyCanonical,
    requiresMigration,
  };
}

export interface StructuredCriteriaProjectionMigrationResult {
  readonly migrated: readonly string[];
  readonly idempotent: readonly string[];
}

function migrationBackupPrefix(taskId: string): string {
  return `.task-migration-${taskId}-`;
}

function listMigrationBackups(
  tasksReal: string,
  taskId: string,
): readonly string[] {
  const prefix = migrationBackupPrefix(taskId);
  return readdirSync(tasksReal)
    .filter(name => name.startsWith(prefix) && name.endsWith('.previous'))
    .sort()
    .map(name => join(tasksReal, name));
}

function matchesTaskPayload(
  observed: { readonly task: unknown },
  expected: unknown,
): boolean {
  return canonicalJson(observed.task) === canonicalJson(expected);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Explicit additive schema migration used only by an approved adoption record.
 * The legacy target is first moved to a durable predecessor artifact. The
 * canonical payload is then linked into the now-empty target with no-clobber
 * semantics. A writer that wins either boundary is preserved and turns the
 * migration into a typed HOLD instead of being silently overwritten.
 *
 * Predecessors are deliberately retained as recovery/audit evidence. A crash
 * after the move but before publication resumes from the one exact predecessor;
 * admission has not yet committed and mixed legacy/canonical task sets remain
 * retry-safe.
 */
export function migrateStructuredCriteriaProjection(
  root: string,
  canonicalTasks: readonly {
    readonly id: string;
    readonly sprintId?: string;
    readonly createdAt?: string;
    readonly goNogo?: { readonly items?: readonly unknown[] };
  }[],
  expectedLegacyProjectionDigest: string,
): StructuredCriteriaProjectionMigrationResult {
  const sprintId = String(canonicalTasks[0]?.sprintId ?? '');
  if (
    sprintId.length === 0
    || canonicalTasks.some(task => task.sprintId !== sprintId)
  ) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
      reason: 'sprint_identity_mismatch',
    });
  }
  assertPortableTargetSet(canonicalTasks.map(task => task.id));
  const legacyTasks = canonicalTasks.map(withoutStructuredCriteria);
  const legacyDigests = Object.fromEntries(legacyTasks.map(task => [
    task.id,
    createHash('sha256').update(canonicalJson(task)).digest('hex'),
  ]));
  const computedLegacyProjectionDigest = projectionDigest(
    legacyTasks,
    legacyDigests,
  );
  if (computedLegacyProjectionDigest !== expectedLegacyProjectionDigest) {
    throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
      reason: 'legacy_projection_digest_mismatch',
      expectedProjectionDigest: expectedLegacyProjectionDigest,
      actualProjectionDigest: computedLegacyProjectionDigest,
    });
  }

  const tasksReal = resolveTasksDirectory(root, false);
  const migrated: string[] = [];
  const idempotent: string[] = [];
  for (let index = 0; index < canonicalTasks.length; index++) {
    const task = canonicalTasks[index]!;
    const legacyTask = legacyTasks[index]!;
    const taskId = task.id;
    const target = join(tasksReal, safeTaskFileName(taskId));
    const backups = listMigrationBackups(tasksReal, taskId);
    if (existsSync(target)) {
      const current = readStableTaskArtifact<typeof task>(target, taskId);
      if (matchesTaskPayload(current, task)) {
        idempotent.push(taskId);
        continue;
      }
      if (!matchesTaskPayload(current, legacyTask)) {
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId,
          reason: 'migration_cas_mismatch',
        });
      }
      if (backups.length > 0) {
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId,
          reason: 'migration_predecessor_ambiguous',
        });
      }
    } else if (backups.length !== 1) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
        taskId,
        reason: backups.length === 0
          ? 'migration_target_missing'
          : 'migration_predecessor_ambiguous',
      });
    }

    const stagePath = join(tasksReal, `.task-migration-${randomUUID()}.tmp`);
    let predecessorPath = backups[0];
    let staged = false;
    try {
      const fd = openSync(stagePath, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify(task, null, 2), 'utf8');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      staged = true;

      if (existsSync(target)) {
        predecessorPath = join(
          tasksReal,
          `${migrationBackupPrefix(taskId)}${randomUUID()}.previous`,
        );
        renameSync(target, predecessorPath);
      }
      if (predecessorPath === undefined) {
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId,
          reason: 'migration_predecessor_missing',
        });
      }

      const predecessor = readStableTaskArtifact<typeof task>(
        predecessorPath,
        taskId,
      );
      if (!matchesTaskPayload(predecessor, legacyTask)) {
        try {
          linkSync(predecessorPath, target);
          fsyncDirectory(tasksReal);
        } catch {
          // Preserve both artifacts. A concurrent target is authority and HOLDs.
        }
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId,
          reason: 'migration_cas_changed',
        });
      }

      try {
        linkSync(stagePath, target);
      } catch (cause) {
        throw new TaskArtifactProjectionError(
          'TASK_ARTIFACT_CONTENT_CONFLICT',
          {
            taskId,
            reason: existsSync(target)
              ? 'migration_target_recreated'
              : 'migration_no_clobber_publish_failed',
          },
          { cause },
        );
      }
      fsyncDirectory(tasksReal);
      const published = readStableTaskArtifact<typeof task>(target, taskId);
      if (!matchesTaskPayload(published, task)) {
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId,
          reason: 'migration_publication_drift',
        });
      }
      migrated.push(taskId);
    } catch (cause) {
      if (cause instanceof TaskArtifactProjectionError) throw cause;
      throw new TaskArtifactProjectionError(
        'TASK_ARTIFACT_DURABILITY_HOLD',
        { taskId, reason: 'migration_replace_unavailable' },
        { cause },
      );
    } finally {
      if (staged) {
        try {
          unlinkSync(stagePath);
        } catch {
          // Private staged content is never target authority.
        }
      }
    }
  }
  fsyncDirectory(tasksReal);
  return {
    migrated,
    idempotent,
  };
}

function inspectInternal<T extends { readonly id: string }>(
  root: string,
  tasks: readonly T[],
): ProjectionInspectionInternal<T> {
  try {
    const tasksReal = resolveTasksDirectory(root, true);

    const targets = tasks.map((task) => {
      const fileName = safeTaskFileName(task.id);
      return { task, fileName, target: join(tasksReal, fileName) };
    });
    assertPortableTargetSet(tasks.map(task => task.id));

    const existingNames = new Map(
      readdirSync(tasksReal).map((name) => [name.toLocaleLowerCase('en-US'), name] as const),
    );
    for (const entry of targets) {
      const caseFoldMatch = existingNames.get(entry.fileName.toLocaleLowerCase('en-US'));
      if (caseFoldMatch !== undefined && caseFoldMatch !== entry.fileName) {
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId: entry.task.id,
          reason: 'portable_case_fold_collision',
        });
      }
    }

    const idempotent: string[] = [];
    const missingTargets: TaskTarget<T>[] = [];
    for (const entry of targets) {
      if (!existsSync(entry.target)) {
        missingTargets.push(entry);
        continue;
      }
      if (!taskPayloadMatches(entry.target, entry.task)) {
        throw new TaskArtifactProjectionError('TASK_ARTIFACT_CONTENT_CONFLICT', {
          taskId: entry.task.id,
          reason: 'existing_payload_differs',
        });
      }
      idempotent.push(entry.task.id);
    }
    return {
      tasksReal,
      targets,
      missingTargets,
      taskIds: targets.map(({ task }) => task.id),
      idempotent,
      missing: missingTargets.map(({ task }) => task.id),
    };
  } catch (cause) {
    if (cause instanceof TaskArtifactProjectionError) throw cause;
    throw new TaskArtifactProjectionError(
      'TASK_ARTIFACT_DURABILITY_HOLD',
      { reason: 'inspection_unavailable' },
      { cause },
    );
  }
}

/**
 * Read/validate the full target set before an approval side effect. The only
 * possible mutation is creation of the project-owned `.tasks` directory.
 */
export function inspectTaskArtifactsNoClobber<T extends { readonly id: string }>(
  root: string,
  tasks: readonly T[],
): TaskArtifactProjectionInspection {
  const inspection = inspectInternal(root, tasks);
  return {
    taskIds: inspection.taskIds,
    idempotent: inspection.idempotent,
    missing: inspection.missing,
  };
}

/**
 * Publish all missing task projections with per-file atomic no-clobber links.
 * Existing semantically identical JSON is idempotent. A failure rolls back
 * only files still provably linked to this call's private staging inode.
 */
export function publishTaskArtifactsNoClobber<T extends { readonly id: string }>(
  root: string,
  tasks: readonly T[],
  namespace: string,
): TaskArtifactProjectionResult {
  const inspection = inspectInternal(root, tasks);
  const idempotent = [...inspection.idempotent];
  const created: string[] = [];
  const staged: Array<TaskTarget<T> & { readonly path: string }> = [];
  const namespaceHash = createHash('sha256').update(namespace).digest('hex').slice(0, 24);
  let committed = false;

  try {
    for (const entry of inspection.missingTargets) {
      const taskHash = createHash('sha256').update(entry.task.id).digest('hex').slice(0, 24);
      const stagePath = join(
        inspection.tasksReal,
        `.task-projection-${namespaceHash}-${taskHash}-${randomUUID()}.tmp`,
      );
      const fd = openSync(stagePath, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify(entry.task, null, 2), 'utf8');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      staged.push({ ...entry, path: stagePath });
    }

    for (const entry of staged) {
      try {
        linkSync(entry.path, entry.target);
        created.push(entry.task.id);
      } catch (cause) {
        if (
          (cause as NodeJS.ErrnoException).code === 'EEXIST'
          && taskPayloadMatches(entry.target, entry.task)
        ) {
          idempotent.push(entry.task.id);
          continue;
        }
        const code = (cause as NodeJS.ErrnoException).code;
        if (code === 'EXDEV' || code === 'EPERM' || code === 'ENOSYS' || code === 'EOPNOTSUPP') {
          throw new TaskArtifactProjectionError(
            'TASK_ARTIFACT_DURABILITY_HOLD',
            { taskId: entry.task.id, reason: code },
            { cause },
          );
        }
        throw new TaskArtifactProjectionError(
          'TASK_ARTIFACT_CONTENT_CONFLICT',
          { taskId: entry.task.id, reason: 'concurrent_publication_conflict' },
          { cause },
        );
      }
    }

    const dirFd = openSync(inspection.tasksReal, 'r');
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
    committed = true;
  } catch (cause) {
    if (cause instanceof TaskArtifactProjectionError) throw cause;
    throw new TaskArtifactProjectionError(
      'TASK_ARTIFACT_DURABILITY_HOLD',
      { reason: 'publication_unavailable' },
      { cause },
    );
  } finally {
    if (!committed) {
      for (const entry of staged) {
        if (!created.includes(entry.task.id)) continue;
        try {
          const stageStat = lstatSync(entry.path);
          const targetStat = lstatSync(entry.target);
          if (
            stageStat.dev === targetStat.dev
            && stageStat.ino === targetStat.ino
            && taskPayloadMatches(entry.target, entry.task)
          ) {
            unlinkSync(entry.target);
          }
        } catch {
          // Never unlink a target whose ownership/content cannot be proven.
        }
      }
      try {
        const dirFd = openSync(inspection.tasksReal, 'r');
        try {
          fsyncSync(dirFd);
        } finally {
          closeSync(dirFd);
        }
      } catch {
        // The typed publication failure remains authoritative.
      }
    }
    for (const entry of staged) {
      try {
        unlinkSync(entry.path);
      } catch {
        // Private staging remnants are non-authoritative and retry-visible.
      }
    }
  }

  return {
    taskIds: inspection.taskIds,
    created,
    idempotent,
  };
}
