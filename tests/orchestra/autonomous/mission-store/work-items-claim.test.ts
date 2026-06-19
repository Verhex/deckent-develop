import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const dirs: string[] = [];
function freshMission() {
  const d = mkdtempSync(join(tmpdir(), 'wi-')); dirs.push(d);
  const s = new SqliteMissionStore(d); s.migrate();
  s.createMission({ id: 'm', kind: 'list', title: 'm', renderAs: 'checklist' });
  return s;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('WorkItems + atomic claim', () => {
  it('enqueueItem + queryDue returns pending items (limit honored)', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w1', missionId: 'm', kind: 'task', spec: { description: 'a' } });
    s.enqueueItem({ id: 'w2', missionId: 'm', kind: 'sprint' });
    expect(s.queryDue().map(w => w.id)).toEqual(['w1', 'w2']);
    expect(s.queryDue({ limit: 1 }).map(w => w.id)).toEqual(['w1']);
    s.close();
  });

  it('claimItem is atomic — exactly one of N concurrent claims wins', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w', missionId: 'm', kind: 'task' });
    const results = [0, 1, 2, 3, 4].map(() => s.claimItem('w', 'caller'));
    expect(results.filter(Boolean).length).toBe(1);           // exactly one true
    expect(s.listItems('m')[0].status).toBe('running');
    s.close();
  });

  it('claimItem skips an already-running item; updateItemStatus persists result', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w', missionId: 'm', kind: 'task' });
    expect(s.claimItem('w', 'a')).toBe(true);
    expect(s.claimItem('w', 'b')).toBe(false);                // already running
    expect(s.queryDue().length).toBe(0);                       // not surfaced once running
    s.updateItemStatus('w', 'done', { ok: true, reason: 'ok' });
    expect(s.listItems('m')[0].lastResult).toEqual({ ok: true, reason: 'ok' });
    s.close();
  });
});
