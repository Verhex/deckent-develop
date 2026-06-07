import { describe, it, expect } from 'vitest';
import { decidePolicy } from '../../../src/orchestra/autonomous/policy-gate.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

const base: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'x' },
  policy: 'auto', trigger: { type: 'one-off' }, status: 'pending',
  lastRun: null, lastResult: null,
};

describe('policy-gate', () => {
  it('auto policy → auto', () => {
    expect(decidePolicy({ ...base, policy: 'auto' }).decision).toBe('auto');
  });
  it('approval-required policy → park', () => {
    expect(decidePolicy({ ...base, policy: 'approval-required' }).decision).toBe('park');
  });
  it('risk-tagged + reversible effect (default) → auto', () => {
    expect(decidePolicy({ ...base, policy: 'risk-tagged' }).decision).toBe('auto');
  });
  it('risk-tagged + pure effect → auto', () => {
    expect(decidePolicy({ ...base, policy: 'risk-tagged' }, 'pure').decision).toBe('auto');
  });
  it('risk-tagged + critical-irreversible effect → park', () => {
    expect(decidePolicy({ ...base, policy: 'risk-tagged' }, 'critical-irreversible').decision).toBe('park');
  });
  it('risk-tagged + idempotent effect → park (only pure/reversible auto-safe)', () => {
    expect(decidePolicy({ ...base, policy: 'risk-tagged' }, 'idempotent').decision).toBe('park');
  });
  it('risk-tagged + compensable effect → park', () => {
    expect(decidePolicy({ ...base, policy: 'risk-tagged' }, 'compensable').decision).toBe('park');
  });
  it('every policy branch carries a non-empty reason', () => {
    expect(decidePolicy({ ...base, policy: 'auto' }).reason.length).toBeGreaterThan(0);
    expect(decidePolicy({ ...base, policy: 'approval-required' }).reason.length).toBeGreaterThan(0);
    expect(decidePolicy({ ...base, policy: 'risk-tagged' }, 'critical-irreversible').reason.length).toBeGreaterThan(0);
  });
});
