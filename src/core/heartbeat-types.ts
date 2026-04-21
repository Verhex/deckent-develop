/**
 * Heartbeat-related type utilities for auditor stale detection.
 * Sprint 149: Task lifecycle awareness for stale alert suppression.
 *
 * The core Heartbeat interface lives in src/core/monitoring-types.ts (re-exported via types.ts).
 * This module provides task-status-aware constants used by the auditor scan loop.
 */

import { TaskStatus } from './task-types.js';

/**
 * Task statuses that indicate active execution — only these should trigger stale alerts.
 * PENDING, CLAIMED, DRAFT, and PAUSED tasks have no running worker, so stale HB is expected/irrelevant.
 */
export const ACTIVE_EXECUTION_STATUSES = new Set<string>([
  TaskStatus.EXECUTING,
  TaskStatus.TESTING,
  TaskStatus.DOCUMENTING,
]);

/**
 * Task statuses that indicate terminal completion — stale alerts are downgraded to WARNING.
 */
export const COMPLETED_STATUSES = new Set<string>([
  TaskStatus.DONE,
  TaskStatus.NO_GO,
]);

/**
 * Task statuses where no heartbeat is expected — stale alerts are fully suppressed.
 * Worker has not yet started or is paused.
 */
export const PRE_EXECUTION_STATUSES = new Set<string>([
  TaskStatus.DRAFT,
  TaskStatus.PENDING,
  TaskStatus.CLAIMED,
  TaskStatus.PAUSED,
]);
