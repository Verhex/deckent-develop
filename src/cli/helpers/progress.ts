// ─── Progress Renderer ──────────────────────────────────────────────
import type { SprintPhase } from '../../core/types.js';

export interface WorkerProgressEntry {
  taskId: string;
  workerId: string;
  agentName: string;
  status: string;
  currentFile: string;
  progressPercent: number;
}

export interface ProgressState {
  totalTasks: number;
  completedTasks: number;
  activeTasks: WorkerProgressEntry[];
  queuedTasks: string[];
  phase: SprintPhase;
  elapsedMs: number;
  etaMs: number;
}

export class ProgressRenderer {
  render(state: ProgressState): string {
    const lines: string[] = [];

    // Progress bar
    lines.push(this.renderBar(state));

    // Active workers
    if (state.activeTasks.length > 0) {
      lines.push('');
      lines.push('Active Workers:');
      for (const worker of state.activeTasks) {
        lines.push(this.renderWorkerRow(worker));
      }
    }

    // Queued tasks
    if (state.queuedTasks.length > 0) {
      lines.push('');
      lines.push('Queued:');
      const maxShow = 5;
      const shown = state.queuedTasks.slice(0, maxShow);
      for (const taskId of shown) {
        lines.push(`  - ${taskId}`);
      }
      const remaining = state.queuedTasks.length - maxShow;
      if (remaining > 0) {
        lines.push(`  +${remaining} more`);
      }
    }

    return lines.join('\n');
  }

  renderBar(state: ProgressState): string {
    const { completedTasks, totalTasks, etaMs } = state;
    const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const barWidth = 20;
    const filled = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * barWidth) : 0;
    const bar = '='.repeat(filled) + '-'.repeat(barWidth - filled);
    const etaStr = etaMs > 0 ? ` ETA ~${Math.round(etaMs / 1000)}s` : '';
    return `[${bar}] ${completedTasks}/${totalTasks} ${percent}%${etaStr}`;
  }

  renderWorkerRow(worker: WorkerProgressEntry): string {
    const barWidth = 10;
    const filled = Math.round((worker.progressPercent / 100) * barWidth);
    const bar = '='.repeat(filled) + '-'.repeat(barWidth - filled);
    const file = worker.currentFile ? ` ${worker.currentFile}` : '';
    return `  ${worker.workerId} [${bar}] ${worker.status}${file}`;
  }
}
