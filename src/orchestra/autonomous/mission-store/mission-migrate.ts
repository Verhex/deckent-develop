import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type { MissionStore, NewMissionWorkItem } from './mission-types.js';
import type { BacklogEntry, BacklogStatus } from '../backlog-types.js';

const STATUS_MAP: Record<BacklogStatus, 'pending' | 'running' | 'done' | 'failed' | 'parked'> = {
  pending: 'pending', running: 'running', done: 'done', failed: 'failed', parked: 'parked',
};

/** One-time import of the legacy backlog.json into its reserved `legacy` mission. */
export function migrateBacklogJson(projectRoot: string, store: MissionStore): number {
  if (store.getMission('legacy')) return 0;
  const path = join(projectRoot, DECKENT_DIR, 'autonomous', 'backlog.json');
  if (!existsSync(path)) return 0;
  let entries: BacklogEntry[];
  try { entries = (JSON.parse(readFileSync(path, 'utf-8')) as { entries?: BacklogEntry[] }).entries ?? []; }
  catch { return 0; }
  if (entries.length === 0) return 0;

  const validEntries = entries.filter((entry) => entry?.id && entry?.kind);
  const items: NewMissionWorkItem[] = validEntries.map((e) => ({
      id: e.id, missionId: 'legacy', kind: e.kind, spec: e.spec as Record<string, unknown>,
      policy: e.policy,
      trigger: e.trigger as unknown as Record<string, unknown>,
      initialStatus: STATUS_MAP[e.status] ?? 'pending',
    }));
  if (items.length === 0) return 0;
  store.createMissionWithItems(
    { id: 'legacy', kind: 'list', title: 'Imported backlog', renderAs: 'checklist' },
    items,
  );
  return items.length;
}
