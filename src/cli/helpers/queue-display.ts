// ─── Queue Display ──────────────────────────────────────────────────

export interface QueueTask {
  id: string;
  title: string;
  dependencies: string[];
}

export class QueueDisplay {
  formatQueue(pendingTasks: QueueTask[], maxDisplay: number = 5): string {
    if (pendingTasks.length === 0) {
      return 'Queue: empty';
    }

    const lines: string[] = ['Queue:'];
    const shown = pendingTasks.slice(0, maxDisplay);
    for (const task of shown) {
      const depStr = task.dependencies.length > 0
        ? ` (waiting: ${task.dependencies.join(', ')})`
        : '';
      lines.push(`  - ${task.id}: ${task.title}${depStr}`);
    }

    const remaining = pendingTasks.length - maxDisplay;
    if (remaining > 0) {
      lines.push(`  +${remaining} more`);
    }

    return lines.join('\n');
  }

  formatDependencyWait(task: QueueTask, blockedBy: string[]): string {
    if (blockedBy.length === 0) {
      return `${task.id}: ready`;
    }
    return `${task.id}: blocked by ${blockedBy.join(', ')}`;
  }

  formatWaveDisplay(waves: QueueTask[][]): string {
    if (waves.length === 0) {
      return 'No waves planned';
    }

    const lines: string[] = [];
    for (let i = 0; i < waves.length; i++) {
      const wave = waves[i]!;
      const taskIds = wave.map((t) => t.id).join(', ');
      lines.push(`Wave ${i + 1}: [${taskIds}]`);
    }
    return lines.join('\n');
  }
}
