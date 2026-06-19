import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { createListMission } from '../../../../src/orchestra/autonomous/mission-store/mission-ingest.js';

const dirs: string[] = [];
function newStore() {
  const d = mkdtempSync(join(tmpdir(), 'ingest-'));
  dirs.push(d);
  const s = new SqliteMissionStore(d);
  s.migrate();
  return s;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('createListMission', () => {
  it('creates 1 list-mission + N pending work-items for a 20-item list', () => {
    const store = newStore();
    const items = Array.from({ length: 20 }, (_, i) => ({
      kind: 'task' as const,
      spec: { description: `item ${i}` },
    }));

    const mission = createListMission(store, { id: 'mission-20', title: 'Twenty tasks', items });

    expect(mission.id).toBe('mission-20');
    expect(mission.kind).toBe('list');
    expect(mission.renderAs).toBe('checklist');
    expect(mission.status).toBe('pending');

    const workItems = store.listItems('mission-20');
    expect(workItems).toHaveLength(20);
    for (const wi of workItems) {
      expect(wi.missionId).toBe('mission-20');
      expect(wi.status).toBe('pending');
      expect(wi.kind).toBe('task');
    }

    store.close();
  });

  it('derives item.id as `${missionId}-${index}` when not provided, preserves explicit ids', () => {
    const store = newStore();
    const mission = createListMission(store, {
      id: 'mission-ids',
      title: 'ID derivation test',
      items: [
        { id: 'explicit-0', kind: 'task' },
        { kind: 'sprint' },
        { id: 'explicit-2', kind: 'capability' },
        { kind: 'task' },
      ],
    });

    const workItems = store.listItems(mission.id);
    expect(workItems).toHaveLength(4);

    const ids = workItems.map(wi => wi.id);
    expect(ids).toContain('explicit-0');
    expect(ids).toContain('mission-ids-1');
    expect(ids).toContain('explicit-2');
    expect(ids).toContain('mission-ids-3');

    store.close();
  });

  it('propagates tenant and deliverTo to the mission', () => {
    const store = newStore();
    const mission = createListMission(store, {
      id: 'mission-tenant',
      title: 'Tenant propagation',
      tenant: 'acme-corp',
      deliverTo: 'user@example.com',
      items: [{ kind: 'task' }],
    });

    expect(mission.tenant).toBe('acme-corp');
    expect(mission.deliverTo).toBe('user@example.com');

    const stored = store.getMission('mission-tenant')!;
    expect(stored.tenant).toBe('acme-corp');
    expect(stored.deliverTo).toBe('user@example.com');

    store.close();
  });

  it('creates mission with 0 items when items array is empty', () => {
    const store = newStore();
    const mission = createListMission(store, { id: 'mission-empty', title: 'Empty list', items: [] });

    expect(mission.id).toBe('mission-empty');
    expect(mission.kind).toBe('list');

    const workItems = store.listItems('mission-empty');
    expect(workItems).toHaveLength(0);

    store.close();
  });
});
