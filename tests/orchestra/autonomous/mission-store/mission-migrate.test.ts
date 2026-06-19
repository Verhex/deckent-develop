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
    const n = migrateBacklogJson(r, s);
    expect(n).toBe(2);
    const legacy = s.listMissions({})[0];
    expect(legacy.id).toBe('legacy');
    const items = s.listItems('legacy');
    expect(items.map(i => i.id).sort()).toEqual(['e1', 'e2']);
    expect(items.find(i => i.id === 'e2')!.kind).toBe('sprint');
    expect(migrateBacklogJson(r, s)).toBe(0); // idempotent — missions exist
    s.close();
  });
});
