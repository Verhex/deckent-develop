// ─── Decision Logger ───────────────────────────────────────────────────────
// Persists and reads decision log entries for tasks.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DecisionLogEntry } from '../core/decision-types.js';
import { DECISIONS_LOG_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import { validateTaskId, validateSprintId, validatePath } from '../core/validators.js';

// ─── Persisted Decision Log ────────────────────────────────────────────────

export interface PersistedDecisionLog {
  taskId: string;
  sprintId: string;
  steps: DecisionLogEntry[];
  decidedAt: string;
}

// ─── Meaningful Step Patterns ──────────────────────────────────────────────

/**
 * Patterns that identify meaningful routing decisions worth logging.
 * Steps matching NONE of these patterns are filtered out to reduce noise.
 */
const MEANINGFUL_PATTERNS: RegExp[] = [
  /Agent selected:/i,
  /Agent '.+' excluded/i,
  /Dynamic exclusions:/i,
  /Skill budget:/i,
  /Skill selected:/i,
  /Skill '.+' excluded/i,
  /Context fit:/i,
  /Agent forced by override/i,
  /Skills forced by override/i,
  /Skills cleared by override/i,
  /learning bonus:/i,
  /intent-priority bonus:/i,
];

/**
 * Filter decision log entries to keep only meaningful routing steps.
 * Removes trivial steps (e.g. basic intent classification) that don't
 * provide actionable debug information.
 *
 * A step is meaningful if its reasoning matches any of the MEANINGFUL_PATTERNS.
 */
export function filterMeaningfulSteps(entries: DecisionLogEntry[]): DecisionLogEntry[] {
  return entries.filter(entry =>
    MEANINGFUL_PATTERNS.some(pattern => pattern.test(entry.reasoning)),
  );
}

// ─── DecisionLogger ────────────────────────────────────────────────────────

export class DecisionLogger {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Get the directory path for decision logs.
   */
  private getLogDir(): string {
    return path.join(this.projectRoot, DECISIONS_LOG_DIR);
  }

  /**
   * Get the file path for a task's decision log.
   */
  private getLogPath(taskId: string): string {
    const dir = this.getLogDir();
    const fileName = `decision-${taskId}.json`;
    return validatePath(dir, fileName);
  }

  /**
   * Ensure the decision log directory exists.
   */
  private ensureDir(): void {
    const dir = this.getLogDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Log decision entries for a task.
   */
  log(sprintId: string, taskId: string, entries: DecisionLogEntry[]): void {
    validateSprintId(sprintId);
    validateTaskId(taskId);
    this.ensureDir();
    const record: PersistedDecisionLog = {
      taskId,
      sprintId,
      steps: entries,
      decidedAt: new Date().toISOString(),
    };
    const filePath = this.getLogPath(taskId);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  }

  /**
   * Read decision log for a task. Returns null if not found.
   */
  readDecisionLog(taskId: string): { steps: DecisionLogEntry[]; decidedAt: string } | null {
    validateTaskId(taskId);
    const filePath = this.getLogPath(taskId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedDecisionLog;
      return { steps: parsed.steps, decidedAt: parsed.decidedAt };
    } catch (e) {
      debugLog('decision-logger:readDecisionLog', e);
      return null;
    }
  }

  /**
   * List all task IDs with decision logs for a given sprint.
   */
  listDecisions(sprintId: string): string[] {
    validateSprintId(sprintId);
    const dir = this.getLogDir();
    if (!fs.existsSync(dir)) {
      return [];
    }
    const files = fs.readdirSync(dir);
    const taskIds: string[] = [];
    for (const file of files) {
      if (!file.startsWith('decision-') || !file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const parsed = JSON.parse(raw) as PersistedDecisionLog;
        if (parsed.sprintId === sprintId) {
          taskIds.push(parsed.taskId);
        }
      } catch (e) {
        debugLog('decision-logger:getDecisionTaskIds', e);
      }
    }
    return taskIds;
  }
}
