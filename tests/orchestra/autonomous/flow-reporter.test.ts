import { describe, it, expect } from 'vitest';
import { makeFlowReporter, type FlowStepRecord } from '../../../src/orchestra/autonomous/flow-reporter.js';

describe('makeFlowReporter (dual-channel)', () => {
  it('emits an ordered record on the audit channel and a human line on print', () => {
    const lines: string[] = [];
    const records: FlowStepRecord[] = [];
    const flow = makeFlowReporter({
      print: (l) => lines.push(l),
      audit: (r) => records.push(r),
      lang: 'en',
      now: () => '2026-06-17T00:00:00.000Z',
    });

    flow.step('spawned', 'roles', 'taskId=run-1');
    flow.step('brain_verdict', 'roles', 'GO_WITH_TECH_DEBT q=78 (reconciled)');
    flow.step('done', 'roles', 'decision=GO_WITH_TECH_DEBT');

    expect(records.map((r) => r.step)).toEqual(['spawned', 'brain_verdict', 'done']);
    expect(records[0]).toEqual({
      step: 'spawned', entryId: 'roles', detail: 'taskId=run-1', timestamp: '2026-06-17T00:00:00.000Z',
    });
    expect(records.some((r) => /[\u{1F300}-\u{1FAFF}]/u.test(r.detail))).toBe(false);

    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('roles');
    expect(lines[1]).toContain('GO_WITH_TECH_DEBT q=78 (reconciled)');
  });

  it('is a no-op-safe partial (missing channels never throw)', () => {
    const flow = makeFlowReporter({ now: () => 'T' });
    expect(() => flow.step('parked', 'x')).not.toThrow();
  });

  it('localizes the step label (tr)', () => {
    const lines: string[] = [];
    const flow = makeFlowReporter({ print: (l) => lines.push(l), lang: 'tr', now: () => 'T' });
    flow.step('cross_verify', 'roles', 'skipped');
    expect(lines[0]).toContain('Çapraz-doğrulama');
  });
});
