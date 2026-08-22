/**
 * Pure identity classification for task-directory artifacts.
 *
 * Callers must supply a basename and semantic storage placement separately;
 * this module never derives identity from a platform-specific filesystem path.
 */

export type TaskArtifactPlacement = 'active' | 'archive';

export type NonTaskArtifactReason =
  | 'archived'
  | 'path-like-filename'
  | 'result'
  | 'heartbeat'
  | 'proposal'
  | 'replan-proposal'
  | 'skill-delivery'
  | 'lock'
  | 'temporary'
  | 'partial'
  | 'non-task-filename'
  | 'malformed-content'
  | 'invalid-task-record'
  | 'task-id-mismatch';

export interface TaskArtifactRecord {
  readonly id: string;
  readonly status: string;
}

export interface TaskRecordArtifact {
  readonly kind: 'task-record';
  readonly taskId: string;
  readonly record: TaskArtifactRecord;
}

export interface NonTaskArtifact {
  readonly kind: 'non-task-artifact';
  readonly reason: NonTaskArtifactReason;
}

export type TaskArtifactClassification = TaskRecordArtifact | NonTaskArtifact;

const TASK_FILENAME = /^task-([\w-]{1,100})\.json$/;

function nonTask(reason: NonTaskArtifactReason): NonTaskArtifact {
  return { kind: 'non-task-artifact', reason };
}

function residueReason(filename: string): NonTaskArtifactReason | null {
  if (/\.result$/.test(filename)) return 'result';
  if (/\.hb$/.test(filename)) return 'heartbeat';
  if (/\.landing-proposal\.json$/.test(filename)) return 'proposal';
  if (/\.replan-proposal\.json$/.test(filename)) return 'replan-proposal';
  if (/\.skill-delivery\.json$/.test(filename)) return 'skill-delivery';
  if (/\.lock$|\.spawnlock$/.test(filename)) return 'lock';
  if (/\.tmp$|\.temp$/.test(filename)) return 'temporary';
  if (/\.partial$/.test(filename)) return 'partial';
  return null;
}

function parseTaskRecord(content: string): TaskArtifactRecord | null {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.id !== 'string'
      || !TASK_FILENAME.test(`task-${record.id}.json`)
      || typeof record.status !== 'string'
      || record.status.trim().length === 0
    ) return null;
    return { id: record.id, status: record.status };
  } catch {
    return null;
  }
}

/**
 * Classifies one task-directory artifact without reading, writing, or resolving
 * a filesystem path. A task identity exists only when an active exact filename
 * and its validated JSON record agree on the same id.
 */
export function classifyTaskArtifact(
  filename: string,
  content: string,
  placement: TaskArtifactPlacement = 'active',
): TaskArtifactClassification {
  if (placement === 'archive') return nonTask('archived');
  if (filename.includes('/') || filename.includes('\\')) return nonTask('path-like-filename');

  const residue = residueReason(filename);
  if (residue) return nonTask(residue);

  const filenameMatch = TASK_FILENAME.exec(filename);
  if (!filenameMatch) return nonTask('non-task-filename');

  const record = parseTaskRecord(content);
  if (!record) {
    try {
      JSON.parse(content);
    } catch {
      return nonTask('malformed-content');
    }
    return nonTask('invalid-task-record');
  }
  if (record.id !== filenameMatch[1]) return nonTask('task-id-mismatch');

  return { kind: 'task-record', taskId: record.id, record };
}
