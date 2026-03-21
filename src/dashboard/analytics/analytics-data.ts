import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SprintSummary {
  id: string;
  totalTasks: number;
  completedTasks: number;
  techDebtTasks: number;
  noGoTasks: number;
  coverage: number;
  durationMs: number;
}

export interface AnalyticsOverview {
  totalSprints: number;
  totalTasks: number;
  overallSuccessRate: number;
  coverageTrend: number[];
  sprintIds: string[];
}

export interface DateRange {
  from: Date;
  to: Date;
}

// ─── Sprint File Parsing ─────────────────────────────────────────────────────

export function parseSprintMarkdown(content: string, id: string): SprintSummary {
  const metricValue = (label: string): number => {
    const regex = new RegExp(`\\|\\s*${label}\\s*\\|\\s*([\\d.]+)`);
    const match = content.match(regex);
    return match ? Number(match[1]) : 0;
  };

  const totalTasks = metricValue('Total Tasks');
  const completed = metricValue('Completed');
  const techDebt = metricValue('Tech Debt');
  const noGo = metricValue('No-Go');
  const coverageRaw = metricValue('Coverage');
  const durationMs = metricValue('Duration');

  return {
    id,
    totalTasks,
    completedTasks: completed,
    techDebtTasks: techDebt,
    noGoTasks: noGo,
    coverage: coverageRaw,
    durationMs,
  };
}

// ─── AnalyticsData ───────────────────────────────────────────────────────────

export class AnalyticsData {
  private projectRoot: string;

  constructor(projectRoot: string = '.') {
    this.projectRoot = projectRoot;
  }

  loadSprintData(): SprintSummary[] {
    const sprintDir = join(this.projectRoot, '.brain', 'sprints');
    if (!existsSync(sprintDir)) return [];

    const files = readdirSync(sprintDir)
      .filter((f) => f.startsWith('sprint-') && f.endsWith('.md'))
      .sort();

    const summaries: SprintSummary[] = [];
    for (const file of files) {
      const id = file.replace('.md', '');
      try {
        const content = readFileSync(join(sprintDir, file), 'utf-8');
        summaries.push(parseSprintMarkdown(content, id));
      } catch {
        // Skip unreadable files
      }
    }
    return summaries;
  }

  loadSprintDataInRange(range: DateRange): SprintSummary[] {
    // Sprint files don't have dates embedded, so we use index-based filtering
    // by extracting sprint numbers and using range as a numeric window
    return this.filterByDateRange(this.loadSprintData(), range);
  }

  buildOverview(summaries: SprintSummary[]): AnalyticsOverview {
    if (summaries.length === 0) {
      return {
        totalSprints: 0,
        totalTasks: 0,
        overallSuccessRate: 0,
        coverageTrend: [],
        sprintIds: [],
      };
    }

    const totalTasks = summaries.reduce((sum, s) => sum + s.totalTasks, 0);
    const totalCompleted = summaries.reduce((sum, s) => sum + s.completedTasks + s.techDebtTasks, 0);
    const overallSuccessRate = totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0;

    return {
      totalSprints: summaries.length,
      totalTasks,
      overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
      coverageTrend: summaries.map((s) => s.coverage),
      sprintIds: summaries.map((s) => s.id),
    };
  }

  filterByDateRange(data: SprintSummary[], range: DateRange): SprintSummary[] {
    // Sprint IDs are like "sprint-030". We use numeric portion to approximate ordering.
    // DateRange maps to sprint number range: from.getTime() and to.getTime() used for
    // numeric sprint filtering when no actual dates exist in sprint files.
    const fromNum = extractSprintNumber(range.from);
    const toNum = extractSprintNumber(range.to);

    if (fromNum === null || toNum === null) {
      // Fallback: return all data if range is not sprint-number based
      return data;
    }

    return data.filter((s) => {
      const num = parseSprintNumber(s.id);
      return num !== null && num >= fromNum && num <= toNum;
    });
  }

  formatOverview(overview: AnalyticsOverview): string {
    const lines: string[] = [
      `Sprints: ${overview.totalSprints}`,
      `Tasks: ${overview.totalTasks}`,
      `Success Rate: ${overview.overallSuccessRate}%`,
    ];

    if (overview.coverageTrend.length > 0) {
      lines.push(`Coverage Trend: ${overview.coverageTrend.map((c) => `${c}%`).join(' -> ')}`);
    }

    return lines.join('\n');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSprintNumber(sprintId: string): number | null {
  const match = sprintId.match(/sprint-(\d+)/);
  return match ? Number(match[1]) : null;
}

function extractSprintNumber(date: Date): number | null {
  // Convention: if the date's year is 1970 and month/day encode a sprint number
  // (used as a numeric range hack), extract the number. Otherwise return null.
  if (date.getFullYear() <= 1970) {
    // Treat milliseconds since epoch as sprint number
    const ms = date.getTime();
    if (ms >= 0 && ms < 10000) return ms;
  }
  return null;
}
