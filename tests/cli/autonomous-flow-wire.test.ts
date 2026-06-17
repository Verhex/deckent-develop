import { describe, it, expect } from 'vitest';
import { makeAutonomousFlowReporter } from '../../src/cli/commands/autonomous.js';
import type { FlowStepRecord } from '../../src/orchestra/autonomous/flow-reporter.js';

describe('makeAutonomousFlowReporter (live autonomous flow wire)', () => {
  it('routes a step to both the print sink and the audit sink', () => {
    const lines: string[] = [];
    const records: FlowStepRecord[] = [];
    const flow = makeAutonomousFlowReporter('/tmp/does-not-matter', 'en', {
      print: (l) => lines.push(l),
      audit: (r) => records.push(r),
      now: () => 'T',
    });

    flow.step('brain_verdict', 'roles', 'DONE q=95');

    expect(records).toHaveLength(1);
    expect(records[0].step).toBe('brain_verdict');
    expect(records[0].entryId).toBe('roles');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('roles');
  });
});
