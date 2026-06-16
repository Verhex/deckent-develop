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
  it('rejects NaN / Infinity / float concurrency', () => {
    expect(validateBacklogEntry({ ...base(), fanOut: { over: 't', concurrency: NaN } })).toMatch(/fanOut/);
    expect(validateBacklogEntry({ ...base(), fanOut: { over: 't', concurrency: Infinity } })).toMatch(/fanOut/);
    expect(validateBacklogEntry({ ...base(), fanOut: { over: 't', concurrency: 1.5 } })).toMatch(/fanOut/);
  });
  it('rejects a non-object fanOut and an empty over', () => {
    expect(validateBacklogEntry({ ...base(), fanOut: 42 })).toMatch(/fanOut/);
    expect(validateBacklogEntry({ ...base(), fanOut: { over: '', concurrency: 2 } })).toMatch(/fanOut/);
  });
  it('rejects non-boolean planned and non-string summary', () => {
    expect(validateBacklogEntry({ ...base(), planned: 42 })).toMatch(/planned/);
    expect(validateBacklogEntry({ ...base(), summary: 123 })).toMatch(/summary/);
  });
});
