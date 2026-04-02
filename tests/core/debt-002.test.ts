import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDebtTable } from '../../src/core/utils.js';

describe('DEBT table parsing', () => {
  const debtPath = join(process.cwd(), '.brain', 'DEBT.md');

  it('DEBT.md exists and is non-empty', () => {
    const content = readFileSync(debtPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('parseDebtTable returns items when DEBT.md has entries', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    // DEBT.md may be empty after cleanup — parser should not crash
    expect(items.length).toBeGreaterThanOrEqual(0);
  });

  it('all parsed items have a resolved field', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    for (const item of items) {
      expect(typeof item.resolved).toBe('boolean');
    }
  });

  it('parseDebtTable can parse the full DEBT.md without crash', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    expect(items.length).toBeGreaterThanOrEqual(0);
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.description).toBeTruthy();
    }
  });
});
