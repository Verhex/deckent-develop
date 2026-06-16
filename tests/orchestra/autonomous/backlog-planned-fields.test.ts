// tests/orchestra/autonomous/backlog-planned-fields.test.ts
import { describe, it, expect } from 'vitest';
import { validateBacklogEntry } from '../../../src/orchestra/autonomous/backlog.js';

function base() {
  return {
    id: 'i1', title: 'T', kind: 'task', spec: {}, policy: 'auto',
    trigger: { type: 'one-off' }, status: 'pending', lastRun: null, lastResult: null,
  };
}

describe('backlog schema — planner fields', () => {
  it('accepts planned + summary + fanOut on a valid entry', () => {
    const e = { ...base(), planned: true, summary: 'do x', fanOut: { over: 'tables', concurrency: 20 } };
    expect(validateBacklogEntry(e)).toBeNull();
  });
  it('accepts kind=process', () => {
    expect(validateBacklogEntry({ ...base(), kind: 'process' })).toBeNull();
  });
  it('rejects a malformed fanOut (non-numeric concurrency)', () => {
    const e = { ...base(), fanOut: { over: 'tables', concurrency: 'lots' } };
    expect(validateBacklogEntry(e)).toMatch(/fanOut/);
  });
});
