// ─── Types ───────────────────────────────────────────────────────────────────

export interface BarDataEntry {
  label: string;
  value: number;
  color: string;
}

export interface UsageEntry {
  model: string;
  tokenEstimate: number;
  taskId: string;
  timestamp: string;
}

export interface TaskTypeEntry {
  type: string;
  count: number;
}

// ─── Color Constants ─────────────────────────────────────────────────────────

const MODEL_COLORS: Record<string, string> = {
  opus: '#6366f1',
  sonnet: '#22c55e',
  haiku: '#f59e0b',
};

const TASK_TYPE_COLORS: Record<string, string> = {
  feature: '#3b82f6',
  bugfix: '#ef4444',
  test: '#22c55e',
  docs: '#8b5cf6',
  refactor: '#f97316',
  other: '#6b7280',
};

const DEFAULT_COLOR = '#94a3b8';

// ─── UsageGraphData ──────────────────────────────────────────────────────────

export class UsageGraphData {
  prepareBarData(entries: UsageEntry[]): BarDataEntry[] {
    if (entries.length === 0) return [];

    const modelMap = new Map<string, number>();
    for (const entry of entries) {
      const current = modelMap.get(entry.model) ?? 0;
      modelMap.set(entry.model, current + entry.tokenEstimate);
    }

    const result: BarDataEntry[] = [];
    for (const [model, tokens] of modelMap) {
      result.push({
        label: model,
        value: tokens,
        color: MODEL_COLORS[model] ?? DEFAULT_COLOR,
      });
    }

    return result.sort((a, b) => b.value - a.value);
  }

  prepareModelDistribution(entries: UsageEntry[]): BarDataEntry[] {
    if (entries.length === 0) return [];

    const countMap = new Map<string, number>();
    for (const entry of entries) {
      const current = countMap.get(entry.model) ?? 0;
      countMap.set(entry.model, current + 1);
    }

    const total = entries.length;
    const result: BarDataEntry[] = [];

    for (const [model, count] of countMap) {
      result.push({
        label: model,
        value: Math.round((count / total) * 100 * 100) / 100,
        color: MODEL_COLORS[model] ?? DEFAULT_COLOR,
      });
    }

    return result.sort((a, b) => b.value - a.value);
  }

  prepareTaskTypeDistribution(taskTypes: TaskTypeEntry[]): BarDataEntry[] {
    if (taskTypes.length === 0) return [];

    const total = taskTypes.reduce((sum, t) => sum + t.count, 0);
    if (total === 0) return [];

    return taskTypes
      .map((t) => ({
        label: t.type,
        value: Math.round((t.count / total) * 100 * 100) / 100,
        color: TASK_TYPE_COLORS[t.type] ?? DEFAULT_COLOR,
      }))
      .sort((a, b) => b.value - a.value);
  }

  getModelColor(model: string): string {
    return MODEL_COLORS[model] ?? DEFAULT_COLOR;
  }

  getTaskTypeColor(taskType: string): string {
    return TASK_TYPE_COLORS[taskType] ?? DEFAULT_COLOR;
  }
}
