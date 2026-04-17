// ─── Input Validators ───────────────────────────────────────────────────────
// Security validators for path traversal, sprint ID, phase, and task ID inputs.
// Used by MCP tools and orchestra modules to sanitize user-controlled parameters.

import { resolve, normalize } from 'node:path';
import { SprintPhase } from './sprint-types.js';

// ─── Error Class ────────────────────────────────────────────────────────────

export class ValidationError extends Error {
  readonly code: string;

  constructor(message: string, code: string = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

// ─── Path Validation ────────────────────────────────────────────────────────

/**
 * Validates that a user-supplied path resolves within the given base directory.
 * Prevents path traversal attacks (e.g. "../../etc/passwd").
 *
 * @param base - The trusted base directory (must be absolute)
 * @param userPath - The user-supplied path (relative or absolute)
 * @returns The resolved absolute path
 * @throws {ValidationError} If the resolved path escapes the base directory
 */
export function validatePath(base: string, userPath: string): string {
  const resolvedBase = resolve(base);
  const resolvedUser = resolve(resolvedBase, userPath);
  const normalizedBase = normalize(resolvedBase + '/');
  const normalizedUser = normalize(resolvedUser);

  if (!normalizedUser.startsWith(normalizedBase) && normalizedUser !== resolvedBase) {
    throw new ValidationError(
      `Path traversal detected: "${userPath}" escapes base directory`,
      'PATH_TRAVERSAL',
    );
  }

  return resolvedUser;
}

// ─── Sprint ID Validation ───────────────────────────────────────────────────

const SPRINT_ID_REGEX = /^sprint-\d{3,4}$/;

/**
 * Validates a sprint ID matches the expected format (sprint-NNN or sprint-NNNN).
 *
 * @param sprintId - The sprint ID to validate
 * @returns The validated sprint ID
 * @throws {ValidationError} If the sprint ID doesn't match the expected format
 */
export function validateSprintId(sprintId: string): string {
  if (!SPRINT_ID_REGEX.test(sprintId)) {
    throw new ValidationError(
      `Invalid sprint ID: "${sprintId}" (expected format: sprint-NNN or sprint-NNNN)`,
      'INVALID_SPRINT_ID',
    );
  }
  return sprintId;
}

// ─── Phase Validation ───────────────────────────────────────────────────────

const VALID_PHASES = new Set(Object.values(SprintPhase).map(v => v.toLowerCase()));

/**
 * Validates that a phase string is a known SprintPhase value (case-insensitive).
 *
 * @param phase - The phase string to validate
 * @returns The validated phase string (original casing preserved)
 * @throws {ValidationError} If the phase is not a valid SprintPhase
 */
export function validatePhase(phase: string): string {
  if (!VALID_PHASES.has(phase.toLowerCase())) {
    const allowed = [...VALID_PHASES].sort().join(', ');
    throw new ValidationError(
      `Invalid phase: "${phase}" (allowed: ${allowed})`,
      'INVALID_PHASE',
    );
  }
  return phase;
}

// ─── Task ID Validation ─────────────────────────────────────────────────────

const TASK_ID_REGEX = /^[\w-]+$/;
const TASK_ID_MAX_LENGTH = 100;

/**
 * Validates a task ID contains only safe characters (alphanumeric, underscore, hyphen).
 *
 * @param taskId - The task ID to validate
 * @returns The validated task ID
 * @throws {ValidationError} If the task ID contains unsafe characters or is too long
 */
export function validateTaskId(taskId: string): string {
  if (!taskId || taskId.length === 0) {
    throw new ValidationError('Task ID cannot be empty', 'INVALID_TASK_ID');
  }
  if (taskId.length > TASK_ID_MAX_LENGTH) {
    throw new ValidationError(
      `Task ID too long: ${taskId.length} chars (max ${TASK_ID_MAX_LENGTH})`,
      'INVALID_TASK_ID',
    );
  }
  if (taskId.includes('\0')) {
    throw new ValidationError('Task ID must not contain null bytes', 'INVALID_TASK_ID');
  }
  if (!TASK_ID_REGEX.test(taskId)) {
    throw new ValidationError(
      `Invalid task ID: "${taskId}" (only alphanumeric, underscore, hyphen allowed)`,
      'INVALID_TASK_ID',
    );
  }
  return taskId;
}
