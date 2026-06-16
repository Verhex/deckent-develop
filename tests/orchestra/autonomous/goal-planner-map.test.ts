import { describe, it, expect } from 'vitest';
import { plannedItemToBacklogEntry } from '../../../src/orchestra/autonomous/goal-planner.js';
import { validateBacklogEntry } from '../../../src/orchestra/autonomous/backlog.js';

describe('plannedItemToBacklogEntry', () => {
  it('maps a task item to a valid pending+planned backlog entry (no description)', () => {
    const e = plannedItemToBacklogEntry({
      id: 'roles', title: 'Roles', kind: 'task', scopeDir: 'src/api/', summary: 'roles crud', policy: 'auto', trigger: 'one-off',
    });
    expect(validateBacklogEntry(e)).toBeNull();
    expect(e.status).toBe('pending');
    expect(e.planned).toBe(true);
    expect(e.spec.description).toBeUndefined();
    expect(e.spec.scopeDir).toBe('src/api/');
    expect(e.summary).toBe('roles crud');
  });
  it('maps recurring trigger + fanOut + capabilityTarget', () => {
    const e = plannedItemToBacklogEntry({
      id: 't', title: 'T', kind: 'capability', scopeDir: 'src/', summary: 's', policy: 'auto',
      trigger: { recurring: '*/15 * * * *' }, fanOut: { over: 'tables', concurrency: 20 },
      capabilityTarget: { capability: 'db.query', connector: 'postgres' },
    });
    expect(validateBacklogEntry(e)).toBeNull();
    expect(e.trigger).toEqual({ type: 'recurring', cron: '*/15 * * * *' });
    expect(e.fanOut).toEqual({ over: 'tables', concurrency: 20 });
    expect(e.spec.capabilityTarget?.capability).toBe('db.query');
  });
});
