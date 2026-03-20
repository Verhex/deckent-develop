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

  it('parseDebtTable returns at least one item', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('all parsed items have a resolved field', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    for (const item of items) {
      expect(typeof item.resolved).toBe('boolean');
    }
  });

  it('parseDebtTable can parse the full DEBT.md', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.description).toBeTruthy();
    }
  });
});
