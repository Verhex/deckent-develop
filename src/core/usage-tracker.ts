import { existsSync, mkdirSync, readdirSync, writeFileSync, appendFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelType, ProviderName } from './types.js';
import { readJsonSafe } from './utils.js';
import { getProviderForModel } from './task-types.js';

// ─── Token Estimates ─────────────────────────────────────────────────────────

/** Model-aware token estimates (avg tokens per call) */
export const MODEL_TOKEN_ESTIMATES: Record<string, number> = {
  // Claude
  opus: 15000,
  sonnet: 8000,
  haiku: 3000,
  // OpenAI
  'gpt-5': 15000,
  'gpt-5-mini': 5000,
  'gpt-4.1': 10000,
  'gpt-4.1-mini': 5000,
  o3: 12000,
  'o4-mini': 5000,
  // Gemini
  'gemini-2.5-pro': 12000,
  'gemini-2.5-flash': 6000,
  'gemini-2.0-flash': 4000,
};

/** Default token cost per 1K tokens (USD) — configurable via overrides */
export const DEFAULT_TOKEN_COSTS: Record<string, number> = {
  opus: 0.015,
  sonnet: 0.003,
  haiku: 0.00025,
  'gpt-5': 0.015,
  'gpt-5-mini': 0.003,
  'gpt-4.1': 0.01,
  'gpt-4.1-mini': 0.002,
  o3: 0.012,
  'o4-mini': 0.003,
  'gemini-2.5-pro': 0.01,
  'gemini-2.5-flash': 0.002,
  'gemini-2.0-flash': 0.001,
};

/**
 * Estimate tokens for a model call, optionally adjusting by prompt size.
 */
export function estimateTokens(model: string, promptTokens?: number): number {
  const base = MODEL_TOKEN_ESTIMATES[model] ?? 5000;
  if (promptTokens && promptTokens > 0) {
    return promptTokens + Math.round(base * 0.6);
  }
  return base;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsageEntry {
  model: ModelType;
  tokenEstimate: number;
  taskId: string;
  timestamp: string;
  provider?: ProviderName;
}

export interface ModelBreakdown {
  model: ModelType;
  calls: number;
  tokens: number;
}

export interface ProviderBreakdown {
  provider: ProviderName;
  calls: number;
  tokens: number;
}

export interface TaskUsage {
  taskId: string;
  calls: number;
  tokens: number;
}

export interface SprintUsage {
  sprintId: string;
  entries: UsageEntry[];
  totalCalls: number;
  totalTokens: number;
  modelBreakdown: ModelBreakdown[];
  providerBreakdown?: ProviderBreakdown[];
  taskBreakdown?: TaskUsage[];
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
  private archiveDir: string;

  constructor(projectRoot: string = '.') {
    this.usageDir = join(projectRoot, '.deckent', 'usage');
    this.archiveDir = join(projectRoot, '.deckent', 'usage', 'archive');
  }

  private ensureDir(): void {
    if (!existsSync(this.usageDir)) {
      mkdirSync(this.usageDir, { recursive: true });
    }
  }

  private sprintFilePath(sprintId: string): string {
    return join(this.usageDir, `${sprintId}.json`);
  }

  private jsonlFilePath(sprintId: string): string {
    return join(this.usageDir, `${sprintId}.jsonl`);
  }

  private readSprintEntries(sprintId: string): UsageEntry[] {
    const filePath = this.sprintFilePath(sprintId);
    const parsed = readJsonSafe<unknown>(filePath);
    if (Array.isArray(parsed)) return parsed as UsageEntry[];
    return [];
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

  private computeProviderBreakdown(entries: UsageEntry[]): ProviderBreakdown[] {
    const map = new Map<ProviderName, { calls: number; tokens: number }>();
    for (const entry of entries) {
      const provider = entry.provider ?? safeGetProvider(entry.model);
      const existing = map.get(provider) ?? { calls: 0, tokens: 0 };
      map.set(provider, {
        calls: existing.calls + 1,
        tokens: existing.tokens + entry.tokenEstimate,
      });
    }
    return Array.from(map.entries()).map(([provider, stats]) => ({
      provider,
      calls: stats.calls,
      tokens: stats.tokens,
    }));
  }

  private computeTaskBreakdown(entries: UsageEntry[]): TaskUsage[] {
    const map = new Map<string, { calls: number; tokens: number }>();
    for (const entry of entries) {
      const existing = map.get(entry.taskId) ?? { calls: 0, tokens: 0 };
      map.set(entry.taskId, {
        calls: existing.calls + 1,
        tokens: existing.tokens + entry.tokenEstimate,
      });
    }
    return Array.from(map.entries())
      .map(([taskId, stats]) => ({ taskId, calls: stats.calls, tokens: stats.tokens }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  /**
   * Record a single API call using append-only JSONL format (race-condition safe).
   */
  recordCall(model: ModelType, tokenEstimate: number, taskId: string, sprintId: string = 'default'): void {
    this.ensureDir();
    const entry: UsageEntry = {
      model,
      tokenEstimate,
      taskId,
      timestamp: new Date().toISOString(),
      provider: safeGetProvider(model),
    };
    // Append to JSONL for race-condition safety
    appendFileSync(this.jsonlFilePath(sprintId), JSON.stringify(entry) + '\n', 'utf-8');

    // Read existing JSON entries, append new entry, write back
    const entries = this.readSprintEntries(sprintId);
    entries.push(entry);
    this.writeSprintEntries(sprintId, entries);
  }

  /**
   * Record a call using append-only JSONL (no read-modify-write race).
   */
  recordCallAppendOnly(model: ModelType, tokenEstimate: number, taskId: string, sprintId: string = 'default'): void {
    this.ensureDir();
    const entry: UsageEntry = {
      model,
      tokenEstimate,
      taskId,
      timestamp: new Date().toISOString(),
      provider: safeGetProvider(model),
    };
    appendFileSync(this.jsonlFilePath(sprintId), JSON.stringify(entry) + '\n', 'utf-8');
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
      providerBreakdown: this.computeProviderBreakdown(entries),
      taskBreakdown: this.computeTaskBreakdown(entries),
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
      const seen = new Set<string>();
      for (const file of files) {
        // Support both .json and .jsonl
        const match = file.match(/^(.+)\.(json|jsonl)$/);
        if (!match || !match[1]) continue;
        const sprintId = match[1];
        if (sprintId === 'archive') continue;
        if (seen.has(sprintId)) continue;
        seen.add(sprintId);
        sprintCount++;
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
   * List all sprint IDs that have usage data (numeric sort).
   */
  listSprints(): string[] {
    this.ensureDir();
    try {
      const files = readdirSync(this.usageDir);
      const seen = new Set<string>();
      for (const file of files) {
        const match = file.match(/^(.+)\.(json|jsonl)$/);
        if (!match || !match[1]) continue;
        if (match[1] === 'archive') continue;
        seen.add(match[1]);
      }
      return Array.from(seen).sort((a, b) => {
        const numA = extractSprintNumber(a);
        const numB = extractSprintNumber(b);
        if (numA !== null && numB !== null) return numA - numB;
        return a.localeCompare(b);
      });
    } catch {
      return [];
    }
  }

  /**
   * Get sprints filtered by --since date or --last N.
   */
  listSprintsFiltered(opts: { since?: string; last?: number }): string[] {
    let sprints = this.listSprints();

    if (opts.since) {
      const sinceDate = new Date(opts.since);
      if (!isNaN(sinceDate.getTime())) {
        sprints = sprints.filter((id) => {
          const entries = this.readSprintEntries(id);
          if (entries.length === 0) return false;
          const lastEntry = entries[entries.length - 1]!;
          return new Date(lastEntry.timestamp) >= sinceDate;
        });
      }
    }

    if (opts.last && opts.last > 0) {
      sprints = sprints.slice(-opts.last);
    }

    return sprints;
  }

  /**
   * Archive old sprint usage files beyond retention limit.
   */
  archiveOldSprints(retentionCount: number = 20): { archived: string[]; kept: string[] } {
    const sprints = this.listSprints();
    if (sprints.length <= retentionCount) {
      return { archived: [], kept: sprints };
    }

    if (!existsSync(this.archiveDir)) {
      mkdirSync(this.archiveDir, { recursive: true });
    }

    const toArchive = sprints.slice(0, sprints.length - retentionCount);
    const kept = sprints.slice(sprints.length - retentionCount);

    for (const id of toArchive) {
      for (const ext of ['.json', '.jsonl']) {
        const src = join(this.usageDir, `${id}${ext}`);
        if (existsSync(src)) {
          const dest = join(this.archiveDir, `${id}${ext}`);
          try {
            renameSync(src, dest);
          } catch {
            // best effort
          }
        }
      }
    }

    return { archived: toArchive, kept };
  }

  /**
   * Get sprint comparison data for trend analysis.
   */
  getSprintComparison(count: number = 5): { sprints: SprintUsage[]; trend: { tokensDelta: number; callsDelta: number } } {
    const sprints = this.listSprints().slice(-count);
    const usages = sprints.map((id) => this.getSprintUsage(id));

    let tokensDelta = 0;
    let callsDelta = 0;
    if (usages.length >= 2) {
      const first = usages[0]!;
      const last = usages[usages.length - 1]!;
      tokensDelta = last.totalTokens - first.totalTokens;
      callsDelta = last.totalCalls - first.totalCalls;
    }

    return { sprints: usages, trend: { tokensDelta, callsDelta } };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSprintNumber(sprintId: string): number | null {
  const match = sprintId.match(/(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

function safeGetProvider(model: ModelType): ProviderName {
  try {
    return getProviderForModel(model);
  } catch {
    return 'claude';
  }
}
