// ─── Batch Stats Updater ────────────────────────────────────────────────────
// Queues stats updates and flushes them in a single I/O operation.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────

export type StatsUpdateType = 'agent' | 'skill' | 'sprint' | 'task';

export interface StatsUpdate {
  type: StatsUpdateType;
  id: string;
  data: Record<string, unknown>;
}

export interface FlushResult {
  flushed: number;
  errors: string[];
}

// ─── Constants ──────────────────────────────────────────────────────

const STATS_DIR = '.deckent/stats';

// ─── BatchStatsUpdater ──────────────────────────────────────────────

export class BatchStatsUpdater {
  private _queue: StatsUpdate[] = [];
  private _projectRoot: string;

  constructor(projectRoot: string) {
    this._projectRoot = projectRoot;
  }

  /**
   * Queue a stats update for later flushing.
   */
  queue(update: StatsUpdate): void {
    this._queue.push(update);
  }

  /**
   * Queue multiple updates at once.
   */
  queueAll(updates: StatsUpdate[]): void {
    this._queue.push(...updates);
  }

  /**
   * Flush all queued updates to disk. Groups by type+id.
   */
  flush(): FlushResult {
    if (this._queue.length === 0) {
      return { flushed: 0, errors: [] };
    }

    const grouped = this._groupUpdates();
    const errors: string[] = [];
    let flushed = 0;

    const statsDir = path.join(this._projectRoot, STATS_DIR);
    fs.mkdirSync(statsDir, { recursive: true });

    for (const [key, updates] of grouped) {
      try {
        const merged = this._mergeUpdates(updates);
        const filePath = path.join(statsDir, `${key}.json`);

        // Read existing data if present
        let existing: Record<string, unknown> = {};
        if (fs.existsSync(filePath)) {
          try {
            existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch (e) {
            debugLog('BatchStatsUpdater:flush:readFile', e);
          }
        }

        // Deep-merge new data into existing
        const final = { ...existing, ...merged, updatedAt: new Date().toISOString() };
        fs.writeFileSync(filePath, JSON.stringify(final, null, 2) + '\n', 'utf8');
        flushed += updates.length;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to flush ${key}: ${msg}`);
      }
    }

    this._queue = [];
    return { flushed, errors };
  }

  /**
   * Get the current queue length.
   */
  get pending(): number {
    return this._queue.length;
  }

  /**
   * Clear the queue without flushing.
   */
  clear(): void {
    this._queue = [];
  }

  /**
   * Get a copy of the current queue.
   */
  getQueue(): StatsUpdate[] {
    return [...this._queue];
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  private _groupUpdates(): Map<string, StatsUpdate[]> {
    const groups = new Map<string, StatsUpdate[]>();

    for (const update of this._queue) {
      const key = `${update.type}-${update.id}`;
      const existing = groups.get(key) ?? [];
      existing.push(update);
      groups.set(key, existing);
    }

    return groups;
  }

  private _mergeUpdates(updates: StatsUpdate[]): Record<string, unknown> {
    let merged: Record<string, unknown> = {};

    for (const update of updates) {
      merged = { ...merged, ...update.data };
    }

    return merged;
  }
}
