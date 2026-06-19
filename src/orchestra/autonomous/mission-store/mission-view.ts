import type { MissionStore, Mission, WorkItem, Progress, MissionRenderAs } from './mission-types.js';

export interface MissionView {
  id: string; renderAs: MissionRenderAs; status: Mission['status']; title: string;
  progress: Progress; deliverTo: string | null; lastResult: Mission['lastResult'];
  items: Array<Pick<WorkItem, 'id' | 'kind' | 'status' | 'renderAs' | 'progress'>>;
}

/** Project a mission + its work-items into the canonical client-render contract. */
export function projectMission(store: MissionStore, id: string): MissionView | null {
  const m = store.getMission(id);
  if (!m) return null;
  const items = store.listItems(id);
  const done = items.filter(i => i.status === 'done').length;
  const progress: Progress = m.progress ?? { done, total: items.length };
  return {
    id: m.id, renderAs: m.renderAs, status: m.status, title: m.title,
    progress, deliverTo: m.deliverTo, lastResult: m.lastResult,
    items: items.map(i => ({ id: i.id, kind: i.kind, status: i.status, renderAs: i.renderAs, progress: i.progress })),
  };
}
