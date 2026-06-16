// tests/orchestra/autonomous/goal-planner-types.test.ts
import { describe, it, expect } from 'vitest';
import { PlannedItemSchema } from '../../../src/orchestra/autonomous/goal-planner-types.js';

describe('PlannedItemSchema', () => {
  const ok = { id: 'a', title: 'A', kind: 'task', scopeDir: 'src/api/', summary: 's', policy: 'auto', trigger: 'one-off' };
  it('accepts a minimal valid item', () => {
    expect(PlannedItemSchema.safeParse(ok).success).toBe(true);
  });
  it('accepts recurring trigger + fanOut + capabilityTarget', () => {
    const e = { ...ok, kind: 'capability', trigger: { recurring: '*/15 * * * *' }, fanOut: { over: 'tables', concurrency: 20 }, capabilityTarget: { capability: 'db.query', connector: 'postgres' } };
    expect(PlannedItemSchema.safeParse(e).success).toBe(true);
  });
  it('rejects an unknown kind', () => {
    expect(PlannedItemSchema.safeParse({ ...ok, kind: 'deploy' }).success).toBe(false);
  });
  it('rejects an absolute or traversing scopeDir', () => {
    expect(PlannedItemSchema.safeParse({ ...ok, scopeDir: '/etc' }).success).toBe(false);
    expect(PlannedItemSchema.safeParse({ ...ok, scopeDir: '../x' }).success).toBe(false);
  });
});
