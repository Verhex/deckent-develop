import { describe, it, expect } from 'vitest';
import { generateWorkCandidates } from '../../../src/orchestra/autonomous/work-generator.js';
import type { DebtRecord, TodoMarker } from '../../../src/orchestra/autonomous/work-generator.js';

describe('generateWorkCandidates', () => {
  it('returns [] for empty input', () => {
    expect(generateWorkCandidates({})).toEqual([]);
    expect(generateWorkCandidates({ debtRecords: [], todoMarkers: [] })).toEqual([]);
  });

  it('maps a debt record to a BacklogEntry candidate', () => {
    const debt: DebtRecord = { id: 'D-1', title: 'Fix auth leak', description: 'session not cleared on logout' };
    const [entry] = generateWorkCandidates({ debtRecords: [debt] });
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('wg-debt-D-1');
    expect(entry!.title).toBe('Fix auth leak');
    expect(entry!.kind).toBe('task');
    expect(entry!.status).toBe('pending');
    expect(entry!.trigger).toEqual({ type: 'one-off' });
    expect(entry!.lastRun).toBeNull();
    expect(entry!.lastResult).toBeNull();
    expect(entry!.spec.description).toContain('[source:debt]');
    expect(entry!.spec.description).toContain('session not cleared on logout');
  });

  it('uses title in description when debt has no description', () => {
    const debt: DebtRecord = { id: 'D-2', title: 'Remove deprecated API' };
    const [entry] = generateWorkCandidates({ debtRecords: [debt] });
    expect(entry!.spec.description).toContain('[source:debt]');
    expect(entry!.spec.description).toContain('Remove deprecated API');
  });

  it('maps high-severity debt to risk-tagged policy', () => {
    const high: DebtRecord = { id: 'D-3', title: 'SQL injection risk', severity: 'high' };
    const critical: DebtRecord = { id: 'D-4', title: 'Zero-day', severity: 'critical' };
    const normal: DebtRecord = { id: 'D-5', title: 'Cleanup utils', severity: 'low' };

    const results = generateWorkCandidates({ debtRecords: [high, critical, normal] });
    expect(results[0]!.policy).toBe('risk-tagged');
    expect(results[1]!.policy).toBe('risk-tagged');
    expect(results[2]!.policy).toBe('auto');
  });

  it('maps a TODO marker to a BacklogEntry candidate', () => {
    const todo: TodoMarker = { file: 'src/core/config.ts', line: 42, text: 'TODO: refactor this block' };
    const [entry] = generateWorkCandidates({ todoMarkers: [todo] });
    expect(entry).toBeDefined();
    expect(entry!.id).toBe('wg-todo-src_core_config.ts:42');
    expect(entry!.title).toBe('TODO: refactor this block');
    expect(entry!.policy).toBe('auto');
    expect(entry!.spec.description).toContain('[source:todo]');
    expect(entry!.spec.scopeDir).toBe('src/core/config.ts');
  });

  it('maps a FIXME marker to a risk-tagged candidate', () => {
    const fixme: TodoMarker = { file: 'src/api/server.ts', line: 99, text: 'FIXME: null dereference possible here' };
    const [entry] = generateWorkCandidates({ todoMarkers: [fixme] });
    expect(entry!.id).toBe('wg-fixme-src_api_server.ts:99');
    expect(entry!.policy).toBe('risk-tagged');
    expect(entry!.spec.description).toContain('[source:fixme]');
  });

  it('produces stable ids across repeated calls with same input', () => {
    const input = {
      debtRecords: [{ id: 'D-10', title: 'Stale session cleanup' }],
      todoMarkers: [{ file: 'src/foo.ts', line: 7, text: 'TODO: add validation' }],
    };
    const a = generateWorkCandidates(input);
    const b = generateWorkCandidates(input);
    expect(a.map(e => e.id)).toEqual(b.map(e => e.id));
  });

  it('handles both debt and todo markers together', () => {
    const result = generateWorkCandidates({
      debtRecords: [{ id: 'D-20', title: 'Debt item' }],
      todoMarkers: [{ file: 'src/x.ts', line: 1, text: 'TODO: do something' }],
    });
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toMatch(/^wg-debt-/);
    expect(result[1]!.id).toMatch(/^wg-todo-/);
  });

  it('debt entries have source tag in spec.description', () => {
    const result = generateWorkCandidates({
      debtRecords: [{ id: 'D-30', title: 'Old pattern cleanup' }],
    });
    expect(result[0]!.spec.description).toMatch(/\[source:debt\]/);
  });

  it('TODO entries have source tag in spec.description', () => {
    const result = generateWorkCandidates({
      todoMarkers: [{ file: 'src/y.ts', line: 5, text: 'TODO: implement cache' }],
    });
    expect(result[0]!.spec.description).toMatch(/\[source:todo\]/);
  });

  it('all candidates are pending with one-off trigger', () => {
    const result = generateWorkCandidates({
      debtRecords: [{ id: 'D-40', title: 'A debt' }],
      todoMarkers: [{ file: 'src/z.ts', line: 1, text: 'FIXME: broken path' }],
    });
    for (const entry of result) {
      expect(entry.status).toBe('pending');
      expect(entry.trigger.type).toBe('one-off');
      expect(entry.lastRun).toBeNull();
      expect(entry.lastResult).toBeNull();
    }
  });
});
