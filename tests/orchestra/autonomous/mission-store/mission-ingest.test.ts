import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { createListMission } from '../../../../src/orchestra/autonomous/mission-store/mission-ingest.js';
import { PRODUCTION_V2_ADMISSION } from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type { MissionStore } from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';
import { vi } from 'vitest';

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

  it('accepts forward dependencies and exact replay without duplicate rows', () => {
    const store = newStore();
    const spec = {
      id: 'mission-dag',
      title: 'Atomic DAG',
      items: [
        { id: 'downstream', kind: 'task' as const, dependsOn: ['upstream'] },
        { id: 'upstream', kind: 'task' as const },
      ],
    };

    expect(createListMission(store, spec).id).toBe('mission-dag');
    expect(createListMission(store, spec).id).toBe('mission-dag');
    const items = store.listItems('mission-dag');
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.id === 'downstream')!.dependsOn).toEqual(['upstream']);
    expect(store.queryDue().map((item) => item.id)).toEqual(['upstream']);
    store.close();
  });

  it.each([
    {
      name: 'duplicate item identity',
      items: [
        { id: 'same', kind: 'task' as const },
        { id: 'same', kind: 'task' as const },
      ],
      reason: 'duplicate work-item id',
    },
    {
      name: 'self dependency',
      items: [{ id: 'self', kind: 'task' as const, dependsOn: ['self'] }],
      reason: 'self dependency',
    },
    {
      name: 'missing or foreign dependency',
      items: [{ id: 'child', kind: 'task' as const, dependsOn: ['outside'] }],
      reason: 'missing or foreign item',
    },
    {
      name: 'dependency cycle',
      items: [
        { id: 'a', kind: 'task' as const, dependsOn: ['b'] },
        { id: 'b', kind: 'task' as const, dependsOn: ['a'] },
      ],
      reason: 'dependency cycle',
    },
  ])('rejects $name before persisting any row', ({ items, reason }) => {
    const store = newStore();
    expect(() => createListMission(store, {
      id: `invalid-${reason.replace(/\s+/g, '-')}`,
      title: 'Invalid DAG',
      items,
    })).toThrow(reason);
    expect(store.listMissions()).toEqual([]);
    store.close();
  });

  it('rolls back the mission when a global work-item identity conflicts', () => {
    const store = newStore();
    createListMission(store, {
      id: 'owner',
      title: 'Existing owner',
      items: [{ id: 'global-item', kind: 'task' }],
    });

    expect(() => createListMission(store, {
      id: 'conflicting-mission',
      title: 'Must roll back',
      items: [{ id: 'global-item', kind: 'task' }],
    })).toThrow('MISSION_BATCH_CONFLICT');
    expect(store.getMission('conflicting-mission')).toBeNull();
    expect(store.listItems('conflicting-mission')).toEqual([]);
    expect(store.listItems('owner').map((item) => item.id)).toEqual(['global-item']);
    store.close();
  });

  it('rejects a conflicting replay without mutating the original batch', () => {
    const store = newStore();
    createListMission(store, {
      id: 'replay',
      title: 'Original',
      items: [{ id: 'one', kind: 'task' }],
    });

    expect(() => createListMission(store, {
      id: 'replay',
      title: 'Changed',
      items: [{ id: 'one', kind: 'task' }],
    })).toThrow('MISSION_BATCH_CONFLICT');
    expect(store.getMission('replay')!.title).toBe('Original');
    expect(store.listItems('replay')).toHaveLength(1);
    store.close();
  });

  it('validates the whole runtime batch before invoking MissionStore persistence', () => {
    const createMissionWithItems = vi.fn();
    const store = { createMissionWithItems } as unknown as MissionStore;

    expect(() => createListMission(store, {
      id: 'runtime-batch',
      title: 'All or none',
      items: [
        { id: 'valid-task', kind: 'task', spec: { description: 'valid' } },
        { id: 'unwired-capability', kind: 'capability', spec: { capabilityTarget: { capability: 'db.query' } } },
      ],
    }, { admission: PRODUCTION_V2_ADMISSION })).toThrow('CAPABILITY_BROKER_UNWIRED');
    expect(createMissionWithItems).not.toHaveBeenCalled();
  });

  it('persists one production admission fence for every executable list item', () => {
    const store = newStore();
    createListMission(store, {
      id: 'runtime-fenced-list',
      title: 'Fenced',
      items: [{ id: 'runtime-task', kind: 'task', spec: { description: 'execute safely' } }],
    }, { admission: PRODUCTION_V2_ADMISSION });

    const item = store.listItems('runtime-fenced-list')[0]!;
    expect(item.admissionFence?.registryDigest).toBe(PRODUCTION_V2_ADMISSION.registryDigest);
    expect(store.__rawGet('SELECT COUNT(*) AS count FROM work_item_admission_fences')).toEqual({ count: 1 });
    store.close();
  });

  it('rejects an arbitrary kind cast at the store boundary before a mission is written', () => {
    const store = newStore();
    expect(() => createListMission(store, {
      id: 'unknown-kind',
      title: 'Unknown',
      items: [{ id: 'bad', kind: 'deploy' as never }],
    })).toThrow('UNKNOWN_KIND');
    expect(store.listMissions()).toEqual([]);
    store.close();
  });
});
