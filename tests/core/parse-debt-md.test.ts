// Sprint 166 Task 6 — Bug V regression tests.
//
// Coverage:
//   1. extractSprintFromDebtId — regex correctness on canonical + edge ids
//   2. parseDebtMd            — sprint_id fallback from id when column missing/"-"
//   3. backfillDebtSprintIds  — atomic transaction completes <100ms for ~150 rows
//   4. backfillDebtSprintIds  — idempotent: second invocation reports updated=0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import {
  extractSprintFromDebtId,
  parseDebtMd,
  backfillDebtSprintIds,
} from '../../src/core/memory-import.js';

let tmpDir: string;
let dbPath: string;
let store: MemoryStore;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'parse-debt-md-'));
  mkdirSync(join(tmpDir, '.brain'), { recursive: true });
  dbPath = join(tmpDir, '.brain', 'memory.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  try { store.close(); } catch { /* may already be closed */ }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('extractSprintFromDebtId (sprint_id regex)', () => {
  it('extracts sprint info from canonical debt-NNN-MMM ids', () => {
    expect(extractSprintFromDebtId('debt-156-011')).toEqual({
      sprint_id: 'sprint-156',
      sprint_num: 156,
    });
    expect(extractSprintFromDebtId('debt-140-001')).toEqual({
      sprint_id: 'sprint-140',
      sprint_num: 140,
    });
    expect(extractSprintFromDebtId('debt-7-9')).toEqual({
      sprint_id: 'sprint-7',
      sprint_num: 7,
    });
  });

  it('handles double-prefix debt-debt-NNN-MMM shape (legacy import bug)', () => {
    expect(extractSprintFromDebtId('debt-debt-152-003')).toEqual({
      sprint_id: 'sprint-152',
      sprint_num: 152,
    });
  });

  it('returns null for malformed or empty ids', () => {
    expect(extractSprintFromDebtId('')).toBeNull();
    expect(extractSprintFromDebtId('debt-')).toBeNull();
    expect(extractSprintFromDebtId('debt-abc-001')).toBeNull();
    expect(extractSprintFromDebtId('not-a-debt-id')).toBeNull();
    expect(extractSprintFromDebtId('debt-0-001')).toBeNull();
  });
});

describe('parseDebtMd sprint_id fallback', () => {
  it('uses originSprintId column when present', () => {
    const md = [
      '| ID | Description | OriginTaskId | OriginSprintId | Priority | SprintsOpen | Resolved | ResolvedInSprintId | CreatedAt |',
      '|----|-------------|--------------|----------------|----------|-------------|----------|--------------------|-----------|',
      '| 156-011 | DEBT desc | t-001 | sprint-156 | HIGH | 1 | false | - | 2026-05-01 |',
    ].join('\n');

    const entries = parseDebtMd(md);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sprint_id).toBe('sprint-156');
    expect(entries[0]!.sprint_num).toBe(156);
  });

  it('falls back to id parsing when originSprintId column is "-"', () => {
    // NOTE: parseDebtMd uses "-" as the sentinel for missing values.
    // Empty cells get collapsed by the pipe-delimited splitter and are
    // covered by backfillDebtSprintIds (post-import repair) instead.
    const md = [
      '| ID | Description | OriginTaskId | OriginSprintId | Priority | SprintsOpen | Resolved | ResolvedInSprintId | CreatedAt |',
      '|----|-------------|--------------|----------------|----------|-------------|----------|--------------------|-----------|',
      '| 152-003 | DEBT desc | t-002 | - | HIGH | 2 | false | - | 2026-05-02 |',
      '| 140-009 | Another desc | t-003 | - | LOW | 0 | true | sprint-141 | 2026-05-03 |',
    ].join('\n');

    const entries = parseDebtMd(md);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.sprint_id).toBe('sprint-152');
    expect(entries[0]!.sprint_num).toBe(152);
    expect(entries[1]!.sprint_id).toBe('sprint-140');
    expect(entries[1]!.sprint_num).toBe(140);
  });
});

describe('backfillDebtSprintIds (atomic + idempotent)', () => {
  function seedDebtWithoutSprintId(count: number): void {
    for (let i = 0; i < count; i++) {
      const sprintBase = 130 + (i % 40); // 130..169
      const idNum = String(i + 1).padStart(3, '0');
      store.insert({
        id: `debt-${sprintBase}-${idNum}`,
        type: 'debt',
        title: `Seeded debt ${i}`,
        content: `Seeded debt ${i}`,
        source: 'import',
        status: 'active',
        priority: 'normal',
        // Intentionally omit sprint_id / sprint_num — DB default sprint_num=0,
        // sprint_id=NULL — mimicking the historical debt-manager insert path.
      });
    }
  }

  it('completes the atomic UPDATE pass in <100ms for 150 rows', () => {
    seedDebtWithoutSprintId(150);

    const start = Date.now();
    const { scanned, updated } = backfillDebtSprintIds(store);
    const elapsed = Date.now() - start;

    expect(scanned).toBe(150);
    expect(updated).toBe(150);
    expect(elapsed).toBeLessThan(100);
  });

  it('is idempotent — second call updates zero rows', () => {
    seedDebtWithoutSprintId(20);

    const first = backfillDebtSprintIds(store);
    expect(first.updated).toBe(20);

    const second = backfillDebtSprintIds(store);
    expect(second.scanned).toBe(0);
    expect(second.updated).toBe(0);

    // Verify rows persist with correct sprint info
    const sample = store.getById('debt-130-001');
    expect(sample).not.toBeNull();
    expect(sample!.sprint_id).toBe('sprint-130');
    expect(sample!.sprint_num).toBe(130);
  });
});
