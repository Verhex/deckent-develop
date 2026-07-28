// ═══ task-artifact-projection — atomic compatibility projection authority ═══
//
// Exact plans remain canonical in the run-flow store. Task JSON files are a
// compatibility projection only: they may be created idempotently, but never
// overwrite, follow a symlink, or turn partial/conflicting state into success.

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
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

function inspectInternal<T extends { readonly id: string }>(
  root: string,
  tasks: readonly T[],
): ProjectionInspectionInternal<T> {
  const tasksDir = join(root, TASKS_DIR);
  try {
    mkdirSync(tasksDir, { recursive: true });
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

    const targets = tasks.map((task) => {
      const fileName = safeTaskFileName(task.id);
      return { task, fileName, target: join(tasksReal, fileName) };
    });
    const uniqueTargets = new Set(
      targets.map(({ fileName }) => fileName.toLocaleLowerCase('en-US')),
    );
    if (uniqueTargets.size !== targets.length) {
      throw new TaskArtifactProjectionError('TASK_ARTIFACT_ID_INVALID', {
        reason: 'duplicate_or_case_fold_collision',
      });
    }

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
