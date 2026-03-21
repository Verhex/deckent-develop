import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType } from './types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsageEntry {
  model: ModelType;
  tokenEstimate: number;
  taskId: string;
  timestamp: string;
}

export interface ModelBreakdown {
  model: ModelType;
  calls: number;
  tokens: number;
}

export interface SprintUsage {
  sprintId: string;
  entries: UsageEntry[];
  totalCalls: number;
  totalTokens: number;
  modelBreakdown: ModelBreakdown[];
}

export interface TotalUsage {
  totalCalls: number;
  totalTokens: number;
  sprintCount: number;
  modelBreakdown: ModelBreakdown[];
}

// ─── UsageTracker ─────────────────────────────────────────────────────────────

export class UsageTracker {
  private usageDir: string;

  constructor(projectRoot: string = '.') {
    this.usageDir = join(projectRoot, '.deckent', 'usage');
  }

  private ensureDir(): void {
    if (!existsSync(this.usageDir)) {
      mkdirSync(this.usageDir, { recursive: true });
    }
  }

  private sprintFilePath(sprintId: string): string {
    return join(this.usageDir, `${sprintId}.json`);
  }

  private readSprintEntries(sprintId: string): UsageEntry[] {
    const filePath = this.sprintFilePath(sprintId);
    if (!existsSync(filePath)) return [];
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as UsageEntry[];
      return [];
    } catch {
      return [];
    }
  }

  private writeSprintEntries(sprintId: string, entries: UsageEntry[]): void {
    this.ensureDir();
    writeFileSync(this.sprintFilePath(sprintId), JSON.stringify(entries, null, 2), 'utf-8');
  }

  private computeBreakdown(entries: UsageEntry[]): ModelBreakdown[] {
    const map = new Map<ModelType, { calls: number; tokens: number }>();
    for (const entry of entries) {
      const existing = map.get(entry.model) ?? { calls: 0, tokens: 0 };
      map.set(entry.model, {
        calls: existing.calls + 1,
        tokens: existing.tokens + entry.tokenEstimate,
      });
    }
    return Array.from(map.entries()).map(([model, stats]) => ({
      model,
      calls: stats.calls,
      tokens: stats.tokens,
    }));
  }

  /**
   * Record a single API call for a given model and task.
   */
  recordCall(model: ModelType, tokenEstimate: number, taskId: string, sprintId: string = 'default'): void {
    const entries = this.readSprintEntries(sprintId);
    entries.push({
      model,
      tokenEstimate,
      taskId,
      timestamp: new Date().toISOString(),
    });
    this.writeSprintEntries(sprintId, entries);
  }

  /**
   * Get usage data for a specific sprint.
   */
  getSprintUsage(sprintId: string): SprintUsage {
    const entries = this.readSprintEntries(sprintId);
    return {
      sprintId,
      entries,
      totalCalls: entries.length,
      totalTokens: entries.reduce((sum, e) => sum + e.tokenEstimate, 0),
      modelBreakdown: this.computeBreakdown(entries),
    };
  }

  /**
   * Get cumulative usage across all sprints.
   */
  getTotalUsage(): TotalUsage {
    this.ensureDir();
    let allEntries: UsageEntry[] = [];
    let sprintCount = 0;

    try {
      const files = readdirSync(this.usageDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        sprintCount++;
        const sprintId = file.replace(/\.json$/, '');
        const entries = this.readSprintEntries(sprintId);
        allEntries = allEntries.concat(entries);
      }
    } catch {
      // directory empty or unreadable
    }

    return {
      totalCalls: allEntries.length,
      totalTokens: allEntries.reduce((sum, e) => sum + e.tokenEstimate, 0),
      sprintCount,
      modelBreakdown: this.computeBreakdown(allEntries),
    };
  }

  /**
   * Get token/call breakdown by model across all sprints.
   */
  getModelBreakdown(): ModelBreakdown[] {
    return this.getTotalUsage().modelBreakdown;
  }

  /**
   * List all sprint IDs that have usage data.
   */
  listSprints(): string[] {
    this.ensureDir();
    try {
      return readdirSync(this.usageDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''));
    } catch {
      return [];
    }
  }
}
