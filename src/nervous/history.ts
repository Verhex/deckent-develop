// src/nervous/history.ts
//
// Nervous System audit trail — JSONL append-only history with undo + retention.
// Sprint 147 Task 8.

import type { ExecutionRecord } from '../core/nervous-types.js';
import type { MemoryStore } from '../core/memory-store.js';
import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { NERVOUS_HISTORY_FILE } from '../core/constants.js';

/**
 * JSONL-based audit trail for Nervous System execution records.
 *
 * Design:
 * - Append-only: each record is one JSON line
 * - Undo via compensation: markUndone appends a new record, never deletes
 * - Retention via prune: rewrites file dropping old records
 */
export class NervousHistory {
  private readonly filePath: string;

  constructor(projectRoot: string) {
    this.filePath = join(projectRoot, NERVOUS_HISTORY_FILE);
  }

  /** Atomic append — each record is one JSONL line */
  async append(record: ExecutionRecord): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const line = JSON.stringify(record) + '\n';
    await appendFile(this.filePath, line, 'utf-8');
  }

  /** Read all records from the history file */
  async readAll(): Promise<ExecutionRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as ExecutionRecord);
  }

  /** Find a specific record by its ID */
  async findById(id: string): Promise<ExecutionRecord | null> {
    const all = await this.readAll();
    return all.find(r => r.id === id) ?? null;
  }

  /** Find recent reversible+success records, newest first */
  async findRecentReversible(limit = 10): Promise<ExecutionRecord[]> {
    const all = await this.readAll();
    return all
      .filter(r => r.reversible && r.outcome === 'success')
      .slice(-limit)
      .reverse();
  }

  /**
   * Mark a record as undone by appending a compensation record.
   * The original record is never deleted — append-only semantics preserved.
   */
  async markUndone(originalId: string, compensationDetail: Record<string, unknown>): Promise<void> {
    const original = await this.findById(originalId);
    if (!original) {
      throw new Error(`Record not found: ${originalId}`);
    }

    const compensation: ExecutionRecord = {
      id: `undo-${originalId}`,
      notificationId: original.notificationId,
      actionId: original.actionId,
      decision: 'rejected',
      decidedBy: 'user',
      executedAt: new Date().toISOString(),
      outcome: 'success',
      reversible: false,
      payload: { undoOf: originalId, ...compensationDetail },
    };

    await this.append(compensation);
  }

  /**
   * Retention: drop records older than N days.
   * Rewrites the file with only retained records.
   * Returns count of pruned records.
   */
  async prune(retentionDays: number = 30): Promise<number> {
    const all = await this.readAll();
    if (all.length === 0) return 0;

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const retained = all.filter(r => new Date(r.executedAt).getTime() >= cutoff);
    const prunedCount = all.length - retained.length;

    if (prunedCount > 0) {
      const content = retained.map(r => JSON.stringify(r)).join('\n') + (retained.length > 0 ? '\n' : '');
      await writeFile(this.filePath, content, 'utf-8');
    }

    return prunedCount;
  }

  /** Get the file path (useful for testing) */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * Index an ExecutionRecord into Memory V2 (SQLite FTS5) for cross-source search.
   *
   * Inserts the record as type='nervous-action' with FTS5-searchable body,
   * tagged by actionId, decision, and decidedBy for faceted retrieval.
   *
   * This is optional — if no MemoryStore is available, records are still
   * persisted in the JSONL history file via append().
   */
  indexToMemory(record: ExecutionRecord, store: MemoryStore): void {
    const id = `nervous-${record.id}`;
    const sprintId = (record as { sprintId?: string }).sprintId ?? 'unknown';
    const tags = [record.actionId, record.decision, record.decidedBy].filter(Boolean);

    store.insert({
      id,
      type: 'nervous-action',
      title: `Nervous Action: ${record.actionId} [${record.decision}]`,
      content: JSON.stringify(record),
      source: 'system',
      sprint_id: sprintId,
      tags,
      metadata: {
        notificationId: record.notificationId,
        outcome: record.outcome,
      },
      decay_exempt: false,
    });
  }
}
