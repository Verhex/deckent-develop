import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { projectMission } from '../../../../src/orchestra/autonomous/mission-store/mission-view.js';
import { settleMissionItem } from '../../../helpers/mission-store.js';

const dirs: string[] = [];
function store() { const d = mkdtempSync(join(tmpdir(), 'mv-')); dirs.push(d); const s = new SqliteMissionStore(d); s.migrate(); return s; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('MissionView projection', () => {
  it('projects mission + items + render_as + derived progress', () => {
    const s = store();
    s.createMission({ id: 'm', kind: 'list', title: 'L', renderAs: 'checklist' });
    s.enqueueItem({ id: 'w1', missionId: 'm', kind: 'sprint' });
    s.enqueueItem({ id: 'w2', missionId: 'm', kind: 'task' });
    settleMissionItem(s, 'w1', 'done', { ok: true });
    const view = projectMission(s, 'm')!;
    expect(view.renderAs).toBe('checklist');
    expect(view.items.map(i => i.renderAs)).toEqual(['sprint', 'task']);
    expect(view.progress).toEqual({ done: 1, total: 2 }); // 1 of 2 items done
    expect(projectMission(s, 'missing')).toBeNull();
    s.close();
  });
});
