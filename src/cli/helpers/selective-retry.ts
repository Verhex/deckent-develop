// ─── Selective Retry ────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Task } from '../../core/types.js';

export interface RetryQueue {
  sprintId: string;
  taskIds: string[];
  createdAt: string;
  updatedAt?: string;
}

export class SelectiveRetry {
  private tasksDir: string;

  constructor(tasksDir: string) {
    this.tasksDir = tasksDir;
  }

  queueForRetry(taskIds: string[], sprintId: string): void {
    const existing = this.getRetryQueue(sprintId);
    const merged = existing ? [...new Set([...existing.taskIds, ...taskIds])] : taskIds;
    const queue: RetryQueue = {
      sprintId,
      taskIds: merged,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const filePath = this.getQueuePath(sprintId);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2), 'utf-8');
  }

  getRetryQueue(sprintId: string): RetryQueue | null {
    const filePath = this.getQueuePath(sprintId);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as RetryQueue;
    } catch {
      return null;
    }
  }

  clearRetryQueue(sprintId: string): void {
    const filePath = this.getQueuePath(sprintId);
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist
    }
  }

  generateRetryDirectives(taskIds: string[], originalTasks: Task[]): string {
    const lines: string[] = [
      '# DIRECTIVES -- Retry Sprint',
      '',
      '## Goal: Retry failed tasks from previous sprint.',
      '',
      '---',
      '',
    ];

    let taskNum = 1;
    for (const taskId of taskIds) {
      const original = originalTasks.find((t) => t.id === taskId);
      const title = original ? `${original.title} (retry)` : `Retry task ${taskId}`;
      const description = original
        ? `Retry of task ${taskId}: ${original.description}. Previous notes: check result file.`
        : `Retry of task ${taskId}.`;

      lines.push(`## Task ${taskNum}: ${title}`);
      lines.push(`- Model: ${original?.model ?? 'opus'}`);
      lines.push(`- Effort: ${original?.effort ?? 'high'}`);
      lines.push('');
      lines.push('### Description');
      lines.push(description);
      lines.push('');
      lines.push('---');
      lines.push('');
      taskNum++;
    }

    return lines.join('\n');
  }

  private getQueuePath(sprintId: string): string {
    return path.join(this.tasksDir, `retry-queue-${sprintId}.json`);
  }
}
