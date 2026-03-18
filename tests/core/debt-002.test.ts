import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDebtTable } from '../../src/core/utils.js';

describe('DEBT-002 closure', () => {
  const debtPath = join(process.cwd(), '.brain', 'DEBT.md');

  it('DEBT.md contains DEBT-002 entry', () => {
    const content = readFileSync(debtPath, 'utf-8');
    expect(content).toContain('DEBT-002');
  });

  it('DEBT-002 is marked as resolved', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    const debt002 = items.find(d => d.id === 'DEBT-002');
    expect(debt002).toBeDefined();
    expect(debt002!.resolved).toBe(true);
  });

  it('DEBT-002 was resolved in sprint-003', () => {
    const content = readFileSync(debtPath, 'utf-8');
    const items = parseDebtTable(content);
    const debt002 = items.find(d => d.id === 'DEBT-002');
    expect(debt002!.resolvedInSprintId).toBe('sprint-003');
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
