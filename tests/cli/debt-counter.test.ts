/** debt-counter.test.ts — DB-first debt counting tests. Sprint 145 T-009. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to test the actual DB-first implementation
// Mock MemoryStore at module level for unit tests
vi.mock('../../src/core/memory-store.js', () => {
  const entries: Array<{ type: string; status: string; priority: string }> = [];
  return {
    MemoryStore: class MockMemoryStore {
      static _entries = entries;
      static _reset() { entries.length = 0; }
      static _addDebt(status: string, priority: string) {
        entries.push({ type: 'debt', status, priority });
      }
      getByType(type: string) {
        return entries.filter(e => e.type === type);
      }
    },
  };
});

// Mock fs.existsSync to control DB file existence
const originalExistsSync = vi.hoisted(() => {
  return { value: true };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn(() => originalExistsSync.value),
  };
});

import { countDebtItems, countOpenDebtItems } from '../../src/cli/helpers/debt-counter.js';
import { MemoryStore } from '../../src/core/memory-store.js';

const MockStore = MemoryStore as unknown as {
  _entries: Array<{ type: string; status: string; priority: string }>;
  _reset: () => void;
  _addDebt: (status: string, priority: string) => void;
};

describe('countDebtItems (DB-first)', () => {
  beforeEach(() => {
    MockStore._reset();
    originalExistsSync.value = true;
  });

  it('returns zero for empty DB', () => {
    const result = countDebtItems('/mock');
    expect(result).toEqual({ total: 0, critical: 0 });
  });

  it('counts all debt entries', () => {
    MockStore._addDebt('open', 'HIGH');
    MockStore._addDebt('open', 'NORMAL');
    MockStore._addDebt('resolved', 'LOW');
    const result = countDebtItems('/mock');
    expect(result.total).toBe(3);
  });

  it('counts critical debt entries', () => {
    MockStore._addDebt('open', 'CRITICAL');
    MockStore._addDebt('open', 'HIGH');
    MockStore._addDebt('open', 'critical');
    const result = countDebtItems('/mock');
    expect(result.total).toBe(3);
    expect(result.critical).toBe(2);
  });

  it('returns zero when DB file does not exist', () => {
    originalExistsSync.value = false;
    const result = countDebtItems('/nonexistent');
    expect(result).toEqual({ total: 0, critical: 0 });
  });
});

describe('countOpenDebtItems (DB-first)', () => {
  beforeEach(() => {
    MockStore._reset();
    originalExistsSync.value = true;
  });

  it('returns 0 for empty DB', () => {
    expect(countOpenDebtItems('/mock')).toBe(0);
  });

  it('filters out resolved entries', () => {
    MockStore._addDebt('open', 'HIGH');
    MockStore._addDebt('resolved', 'NORMAL');
    MockStore._addDebt('open', 'LOW');
    expect(countOpenDebtItems('/mock')).toBe(2);
  });

  it('filters out closed entries', () => {
    MockStore._addDebt('open', 'HIGH');
    MockStore._addDebt('closed', 'NORMAL');
    MockStore._addDebt('active', 'LOW');
    expect(countOpenDebtItems('/mock')).toBe(2);
  });

  it('returns 0 when DB file does not exist', () => {
    originalExistsSync.value = false;
    expect(countOpenDebtItems('/nonexistent')).toBe(0);
  });

  it('returns correct count with mixed statuses', () => {
    MockStore._addDebt('open', 'CRITICAL');
    MockStore._addDebt('resolved', 'HIGH');
    MockStore._addDebt('closed', 'NORMAL');
    MockStore._addDebt('active', 'LOW');
    MockStore._addDebt('open', 'NORMAL');
    expect(countOpenDebtItems('/mock')).toBe(3);
  });
});
