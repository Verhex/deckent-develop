// ─── Rich Sprint Summary ────────────────────────────────────────────
import type { Sprint, TaskResult, TaskEvaluation } from '../../core/types.js';

export interface FileChange {
  filePath: string;
  linesAdded: number;
  linesRemoved: number;
  isNew: boolean;
}

export interface SprintSummaryData {
  sprint: Sprint;
  results: TaskResult[];
  evaluations: Map<string, TaskEvaluation>;
}

export class RichSprintSummary {
  format(data: SprintSummaryData): string {
    const sections: string[] = [];

    sections.push(this.renderResultsSection(data));
    sections.push(this.renderChangesSection(data.results));
    sections.push(this.renderTestsSection(data.results));

    return sections.join('\n\n');
  }

  renderResultsSection(data: SprintSummaryData): string {
    const { sprint, evaluations } = data;
    const lines: string[] = [];
    lines.push(`=== RESULTS === Run ${sprint.number} (${sprint.id})`);
    lines.push('');

    let done = 0;
    let techDebt = 0;
    let noGo = 0;
    for (const [taskId, evaluation] of evaluations) {
      const label = this.evaluationLabel(evaluation);
      lines.push(`  ${taskId}: ${label}`);
      if (evaluation === 'DONE') done++;
      else if (evaluation === 'GO_WITH_TECH_DEBT') techDebt++;
      else if (evaluation === 'NO_GO') noGo++;
    }

    lines.push('');
    lines.push(`Summary: ${done} DONE, ${techDebt} TECH_DEBT, ${noGo} NO_GO`);

    return lines.join('\n');
  }

  renderChangesSection(results: TaskResult[]): string {
    const lines: string[] = [];
    lines.push('=== CHANGES ===');
    lines.push('');

    const fileMap = new Map<string, { added: number; removed: number }>();
    const allFiles = new Set<string>();

    for (const result of results) {
      for (const file of result.filesChanged) {
        allFiles.add(file);
        const existing = fileMap.get(file) ?? { added: 0, removed: 0 };
        existing.added += result.linesAdded;
        existing.removed += result.linesRemoved;
        fileMap.set(file, existing);
      }
    }

    const sortedFiles = Array.from(fileMap.entries())
      .sort((a, b) => (b[1].added + b[1].removed) - (a[1].added + a[1].removed));

    const maxFiles = 10;
    const shown = sortedFiles.slice(0, maxFiles);
    for (const [filePath, changes] of shown) {
      const marker = changes.removed === 0 && changes.added > 0 ? ' (new)' : '';
      lines.push(`  ${filePath} +${changes.added} -${changes.removed}${marker}`);
    }

    const remaining = sortedFiles.length - maxFiles;
    if (remaining > 0) {
      lines.push(`  ...and ${remaining} more files`);
    }

    if (sortedFiles.length === 0) {
      lines.push('  No file changes recorded');
    }

    return lines.join('\n');
  }

  renderTestsSection(results: TaskResult[]): string {
    const lines: string[] = [];
    lines.push('=== TESTS ===');
    lines.push('');

    const passed = results.filter((r) => r.testsPassed).length;
    const total = results.length;
    const coverages = results.map((r) => r.coverage).filter((c) => c > 0);
    const avgCoverage = coverages.length > 0
      ? coverages.reduce((s, c) => s + c, 0) / coverages.length
      : 0;

    lines.push(`  Tasks with passing tests: ${passed}/${total}`);
    lines.push(`  Average coverage: ${avgCoverage.toFixed(1)}%`);

    return lines.join('\n');
  }

  private evaluationLabel(evaluation: TaskEvaluation | string): string {
    switch (evaluation) {
      case 'DONE':
        return 'DONE';
      case 'GO_WITH_TECH_DEBT':
        return 'TECH_DEBT';
      case 'NO_GO':
        return 'NO_GO';
      default:
        return String(evaluation);
    }
  }
}
