/**
 * Integration test: Memory V2 Nervous History Integration
 *
 * Validates that ExecutionRecord entries from the Nervous System
 * can be indexed into MemoryStore (SQLite FTS5) and retrieved
 * via full-text search.
 *
 * Sprint 148 Task 26.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import { NervousHistory } from '../../src/nervous/history.js';
import { searchMemory } from '../../src/core/memory-query.js';
import type { ExecutionRecord } from '../../src/core/nervous-types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Memory V2 Nervous History Integration', () => {
  let store: MemoryStore;
  let history: NervousHistory;
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nervous-mem-'));
    dbPath = join(tmpDir, 'memory.db');
    store = new MemoryStore(dbPath);
    history = new NervousHistory(tmpDir);
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeRecord(overrides: Partial<ExecutionRecord> & { sprintId?: string } = {}): ExecutionRecord & { sprintId?: string } {
    return {
      id: 'rec-001',
      notificationId: 'ns-directives-001',
      actionId: 'directives-protection',
      decision: 'autonomous',
      decidedBy: 'system',
      executedAt: new Date().toISOString(),
      outcome: 'success',
      reversible: false,
      payload: { detectorId: 'directives-protection', severity: 'emergency' },
      sprintId: 'sprint-148',
      ...overrides,
    };
  }

  it('Test 1: ExecutionRecord → memory entry insert', () => {
    const record = makeRecord();
    history.indexToMemory(record, store);

    const entry = store.getById('nervous-rec-001');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('nervous-action');
    expect(entry!.content).toContain('directives-protection');
    expect(entry!.title).toContain('directives-protection');
  });

  it('Test 2: FTS5 search directives-protection → returns Sprint 148 record', () => {
    const record = makeRecord();
    history.indexToMemory(record, store);

    const results = searchMemory(store, {
      type: ['nervous-action'],
      text: 'directives-protection',
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].entry.id).toBe('nervous-rec-001');
    const content = JSON.parse(results[0].entry.content);
    expect(content.actionId).toBe('directives-protection');
  });

  it('Test 3: Sprint context tagged (sprint_id=sprint-148)', () => {
    const record = makeRecord({ sprintId: 'sprint-148' });
    history.indexToMemory(record, store);

    const entry = store.getById('nervous-rec-001');
    expect(entry).not.toBeNull();
    expect(entry!.sprint_id).toBe('sprint-148');
  });

  it('Test 4: Retention — decay_exempt=false (respects decay)', () => {
    const record = makeRecord();
    history.indexToMemory(record, store);

    const entry = store.getById('nervous-rec-001');
    expect(entry).not.toBeNull();
    expect(entry!.decay_exempt).toBe(false);
  });

  it('Test 5: Multiple records indexed and searchable', () => {
    const records = [
      makeRecord({ id: 'rec-001', actionId: 'directives-protection', sprintId: 'sprint-148' }),
      makeRecord({ id: 'rec-002', actionId: 'stale-worker-kill', decision: 'accepted', decidedBy: 'user', sprintId: 'sprint-148' }),
      makeRecord({ id: 'rec-003', actionId: 'debt-reprioritize', decision: 'rejected', decidedBy: 'user', sprintId: 'sprint-148' }),
    ];

    for (const record of records) {
      history.indexToMemory(record, store);
    }

    // Search all nervous actions
    const allResults = searchMemory(store, {
      type: ['nervous-action'],
      text: 'nervous',
    });
    expect(allResults.length).toBe(3);

    // Search by specific action
    const staleResults = searchMemory(store, {
      type: ['nervous-action'],
      text: 'stale-worker-kill',
    });
    expect(staleResults.length).toBeGreaterThanOrEqual(1);
    expect(staleResults[0].entry.id).toBe('nervous-rec-002');
  });
});
