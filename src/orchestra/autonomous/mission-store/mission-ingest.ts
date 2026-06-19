import type { Mission, MissionStore, WorkItemKind, WorkItemPolicy } from './mission-types.js';

export interface ListItemSpec {
  id?: string;
  kind: WorkItemKind;
  spec?: Record<string, unknown>;
  policy?: WorkItemPolicy;
}

export interface ListMissionSpec {
  id: string;
  title: string;
  tenant?: string;
  deliverTo?: string;
  items: ListItemSpec[];
}

/**
 * Type-1 list ingestion — creates a `kind='list'` Mission with N work_items from a flat spec.
 * Missing item.id is derived as `${missionId}-${index}`.
 */
export function createListMission(store: MissionStore, spec: ListMissionSpec): Mission {
  const mission = store.createMission({
    id: spec.id,
    kind: 'list',
    title: spec.title,
    tenant: spec.tenant,
    deliverTo: spec.deliverTo,
    renderAs: 'checklist',
  });

  for (const [i, item] of spec.items.entries()) {
    store.enqueueItem({
      id: item.id ?? `${mission.id}-${i}`,
      missionId: mission.id,
      kind: item.kind,
      spec: item.spec,
      policy: item.policy,
    });
  }

  return mission;
}
