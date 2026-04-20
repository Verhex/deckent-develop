// tests/nervous/history.test.ts
//
// NervousHistory — JSONL append-only audit trail tests.
// Sprint 147 Task 8: 8 test cases.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NervousHistory } from '../../src/nervous/history.js';
import type { ExecutionRecord } from '../../src/core/nervous-types.js';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir } from 'node:fs/promises';

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    notificationId: 'notif-001',
    actionId: 'ORPHAN_TASK_ARCHIVE',
    decision: 'autonomous',
    decidedBy: 'system',
    executedAt: new Date().toISOString(),
    outcome: 'success',
    reversible: true,
    payload: {},
    ...overrides,
  };
}

describe('NervousHistory', () => {
  let tempDir: string;
  let history: NervousHistory;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'nervous-history-test-'));
    await mkdir(join(tempDir, '.deckent'), { recursive: true });
    history = new NervousHistory(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should append single record as one JSONL line', async () => {
    const record = makeRecord({ id: 'rec-single' });
    await history.append(record);

    const raw = readFileSync(history.getFilePath(), 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.id).toBe('rec-single');
  });

  it('should append 3 records and readAll returns all 3 in order', async () => {
    const r1 = makeRecord({ id: 'rec-1' });
    const r2 = makeRecord({ id: 'rec-2' });
    const r3 = makeRecord({ id: 'rec-3' });

    await history.append(r1);
    await history.append(r2);
    await history.append(r3);

    const all = await history.readAll();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe('rec-1');
    expect(all[1].id).toBe('rec-2');
    expect(all[2].id).toBe('rec-3');
  });

  it('should findById existing record', async () => {
    const record = makeRecord({ id: 'rec-find-me' });
    await history.append(record);

    const found = await history.findById('rec-find-me');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('rec-find-me');
    expect(found!.actionId).toBe(record.actionId);
  });

  it('should return null for findById with nonexistent id', async () => {
    const record = makeRecord({ id: 'rec-exists' });
    await history.append(record);

    const found = await history.findById('rec-nonexistent');
    expect(found).toBeNull();
  });

  it('should findRecentReversible — only reversible+success, limit, newest first', async () => {
    // Not reversible
    await history.append(makeRecord({ id: 'r1', reversible: false, outcome: 'success' }));
    // Not success
    await history.append(makeRecord({ id: 'r2', reversible: true, outcome: 'failure' }));
    // Valid: reversible + success
    await history.append(makeRecord({ id: 'r3', reversible: true, outcome: 'success' }));
    await history.append(makeRecord({ id: 'r4', reversible: true, outcome: 'success' }));
    await history.append(makeRecord({ id: 'r5', reversible: true, outcome: 'success' }));

    const recent = await history.findRecentReversible(2);
    expect(recent).toHaveLength(2);
    // Newest first (r5, r4)
    expect(recent[0].id).toBe('r5');
    expect(recent[1].id).toBe('r4');
  });

  it('should markUndone by appending compensation record with originalId ref', async () => {
    const original = makeRecord({ id: 'rec-undo-target' });
    await history.append(original);

    await history.markUndone('rec-undo-target', { reason: 'user requested undo' });

    const all = await history.readAll();
    expect(all).toHaveLength(2);

    const compensation = all[1];
    expect(compensation.id).toBe('undo-rec-undo-target');
    expect(compensation.payload.undoOf).toBe('rec-undo-target');
    expect(compensation.payload.reason).toBe('user requested undo');
    expect(compensation.decision).toBe('rejected');
    expect(compensation.decidedBy).toBe('user');
    // Original still present (never deleted)
    expect(all[0].id).toBe('rec-undo-target');
  });

  it('should prune records older than N days and return pruned count', async () => {
    const now = Date.now();
    const oldDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
    const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

    await history.append(makeRecord({ id: 'old-1', executedAt: oldDate }));
    await history.append(makeRecord({ id: 'old-2', executedAt: oldDate }));
    await history.append(makeRecord({ id: 'recent-1', executedAt: recentDate }));

    const pruned = await history.prune(7); // Keep last 7 days
    expect(pruned).toBe(2);

    const remaining = await history.readAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('recent-1');
  });

  it('should handle concurrent append — both records present', async () => {
    const r1 = makeRecord({ id: 'concurrent-1' });
    const r2 = makeRecord({ id: 'concurrent-2' });

    // Parallel appends
    await Promise.all([
      history.append(r1),
      history.append(r2),
    ]);

    const all = await history.readAll();
    expect(all).toHaveLength(2);
    const ids = all.map(r => r.id).sort();
    expect(ids).toContain('concurrent-1');
    expect(ids).toContain('concurrent-2');
  });
});
