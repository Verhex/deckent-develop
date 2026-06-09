import { describe, it, expect } from 'vitest';
import { makeWorkGeneratorSource } from '../../../src/orchestra/autonomous/work-generator-source.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

const entry: BacklogEntry = {
  id: 'wg-debt-D-1',
  title: 'Fix auth leak',
  kind: 'task',
  spec: { description: '[source:debt] Fix auth leak' },
  policy: 'auto',
  trigger: { type: 'one-off' },
  status: 'pending',
  lastRun: null,
  lastResult: null,
};

describe('makeWorkGeneratorSource', () => {
  it('yields first candidate as a trigger when generate returns entries', () => {
    const src = makeWorkGeneratorSource({ generate: () => [entry] });
    const trigger = src.next();
    expect(trigger).not.toBeNull();
    expect(trigger?.id).toBe('work-gen-wg-debt-D-1');
    expect(trigger?.source).toBe('work-generator');
    expect(trigger?.action).toBe('autonomous.execute');
    expect(trigger?.requestedBy).toBe('system');
    expect((trigger?.payload as { entry: BacklogEntry }).entry).toBe(entry);
  });

  it('returns null when generate returns empty array', () => {
    const src = makeWorkGeneratorSource({ generate: () => [] });
    expect(src.next()).toBeNull();
  });

  it('swallows generator errors and returns null (fail-safe)', () => {
    const src = makeWorkGeneratorSource({
      generate: () => { throw new Error('db gone'); },
    });
    expect(() => src.next()).not.toThrow();
    expect(src.next()).toBeNull();
  });

  it('includes tenant in requestedBy when entry has tenant', () => {
    const tenantEntry: BacklogEntry = { ...entry, tenant: 'acme' };
    const src = makeWorkGeneratorSource({ generate: () => [tenantEntry] });
    const trigger = src.next();
    expect(trigger?.requestedBy).toBe('system:acme');
  });

  it('uses system requestedBy when entry has no tenant', () => {
    const noTenantEntry: BacklogEntry = { ...entry, tenant: undefined };
    const src = makeWorkGeneratorSource({ generate: () => [noTenantEntry] });
    const trigger = src.next();
    expect(trigger?.requestedBy).toBe('system');
  });

  it('yields only the first candidate per call', () => {
    const second: BacklogEntry = { ...entry, id: 'wg-debt-D-2', title: 'Second' };
    const src = makeWorkGeneratorSource({ generate: () => [entry, second] });
    const trigger = src.next();
    expect(trigger?.id).toBe('work-gen-wg-debt-D-1');
  });

  it('re-calls generate on each next() invocation', () => {
    let calls = 0;
    const src = makeWorkGeneratorSource({ generate: () => { calls++; return []; } });
    src.next();
    src.next();
    expect(calls).toBe(2);
  });
});
