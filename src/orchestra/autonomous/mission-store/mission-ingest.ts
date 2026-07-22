import type {
  Mission,
  MissionStore,
  NewWorkItem,
  WorkItemKind,
  WorkItemPolicy,
} from './mission-types.js';
import {
  admitWorkItemBatch,
  type MissionRuntimeAdmission,
} from './mission-kind-admission.js';

export interface ListItemSpec {
  id?: string;
  kind: WorkItemKind;
  spec?: Record<string, unknown>;
  policy?: WorkItemPolicy;
  dependsOn?: string[];
  trigger?: NewWorkItem['trigger'];
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
export function createListMission(
  store: MissionStore,
  spec: ListMissionSpec,
  opts: { admission?: MissionRuntimeAdmission } = {},
): Mission {
  const missionInput = {
    id: spec.id,
    kind: 'list' as const,
    title: spec.title,
    tenant: spec.tenant,
    deliverTo: spec.deliverTo,
    renderAs: 'checklist' as const,
  };
  const items: NewWorkItem[] = spec.items.map((item, i) => ({
      id: item.id ?? `${spec.id}-${i}`,
      missionId: spec.id,
      kind: item.kind,
      spec: item.spec,
      policy: item.policy,
      dependsOn: item.dependsOn,
      trigger: item.trigger,
    }));
  const admitted = opts.admission ? admitWorkItemBatch(items, opts.admission) : items;
  return store.createMissionWithItems(missionInput, admitted);
}
