// ─── Decision Logger ───────────────────────────────────────────────────────
// Persists and reads decision log entries for tasks.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DecisionLogEntry } from '../core/decision-types.js';

// ─── Persisted Decision Log ────────────────────────────────────────────────

export interface PersistedDecisionLog {
  taskId: string;
  sprintId: string;
  steps: DecisionLogEntry[];
  decidedAt: string;
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
    return path.join(this.projectRoot, '.tasks', 'decisions');
  }

  /**
   * Get the file path for a task's decision log.
   */
  private getLogPath(taskId: string): string {
    return path.join(this.getLogDir(), `decision-${taskId}.json`);
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
    const filePath = this.getLogPath(taskId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedDecisionLog;
      return { steps: parsed.steps, decidedAt: parsed.decidedAt };
    } catch {
      return null;
    }
  }

  /**
   * List all task IDs with decision logs for a given sprint.
   */
  listDecisions(sprintId: string): string[] {
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
      } catch {
        // Skip corrupted files
      }
    }
    return taskIds;
  }
}
