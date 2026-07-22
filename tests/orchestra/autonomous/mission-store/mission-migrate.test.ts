import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { migrateBacklogJson } from '../../../../src/orchestra/autonomous/mission-store/mission-migrate.js';

const dirs: string[] = [];
function root() { const d = mkdtempSync(join(tmpdir(), 'mig-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('migrateBacklogJson', () => {
  it('imports legacy backlog entries as a legacy mission\'s work-items (idempotent)', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'e1', title: 'A', kind: 'task', spec: { description: 'do A' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
        { id: 'e2', title: 'B', kind: 'sprint', spec: { directivesRef: 'D' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'done' },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    s.createMissionWithItems(
      { id: 'unrelated', kind: 'list', title: 'Existing v2 mission' },
      [],
    );
    const n = migrateBacklogJson(r, s);
    expect(n).toBe(2);
    const legacy = s.getMission('legacy')!;
    expect(legacy.id).toBe('legacy');
    expect(s.getMission('unrelated')).not.toBeNull();
    const items = s.listItems('legacy');
    expect(items.map(i => i.id).sort()).toEqual(['e1', 'e2']);
    expect(items.find(i => i.id === 'e2')!.kind).toBe('sprint');
    expect(items.find(i => i.id === 'e2')!.status).toBe('done');
    expect(migrateBacklogJson(r, s)).toBe(0); // idempotent — reserved legacy mission exists
    s.close();
  });

  it('rolls back the reserved legacy mission when an item identity conflicts', () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'e1', title: 'Conflict', kind: 'task', spec: { description: 'legacy' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
      ],
    }), 'utf-8');
    const s = new SqliteMissionStore(r); s.migrate();
    s.createMissionWithItems(
      { id: 'owner', kind: 'list', title: 'Identity owner' },
      [{ id: 'e1', missionId: 'owner', kind: 'task' }],
    );

    expect(() => migrateBacklogJson(r, s)).toThrow('MISSION_BATCH_CONFLICT');
    expect(s.getMission('legacy')).toBeNull();
    expect(s.listItems('owner').map((item) => item.id)).toEqual(['e1']);
    s.close();
  });
});
