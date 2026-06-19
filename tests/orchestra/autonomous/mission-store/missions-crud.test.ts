import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const dirs: string[] = [];
function newStore() { const d = mkdtempSync(join(tmpdir(), 'mc-')); dirs.push(d); const s = new SqliteMissionStore(d); s.migrate(); return s; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('Missions CRUD', () => {
  it('createMission applies defaults and getMission round-trips', () => {
    const s = newStore();
    const m = s.createMission({ id: 'm1', kind: 'goal', title: 'ship X', renderAs: 'goal', spec: { goal: 'X' } });
    expect(m.tenant).toBe('local');
    expect(m.status).toBe('pending');
    const got = s.getMission('m1')!;
    expect(got.title).toBe('ship X');
    expect(got.spec).toEqual({ goal: 'X' });
    s.close();
  });

  it('listMissions filters by status + tenant', () => {
    const s = newStore();
    s.createMission({ id: 'a', kind: 'list', title: 'A', renderAs: 'checklist', tenant: 't1' });
    s.createMission({ id: 'b', kind: 'goal', title: 'B', renderAs: 'goal', tenant: 't2' });
    s.updateMissionStatus('b', 'active');
    expect(s.listMissions({ status: ['active'] }).map(m => m.id)).toEqual(['b']);
    expect(s.listMissions({ tenant: 't1' }).map(m => m.id)).toEqual(['a']);
    s.close();
  });

  it('updateMissionStatus sets completed_at + last_result on completion; setMissionProgress persists', () => {
    const s = newStore();
    s.createMission({ id: 'm', kind: 'goal', title: 'm', renderAs: 'goal' });
    s.setMissionProgress('m', { done: 2, total: 5, phase: 'EXEC' });
    s.updateMissionStatus('m', 'completed', { ok: true, reason: 'done' });
    const got = s.getMission('m')!;
    expect(got.progress).toEqual({ done: 2, total: 5, phase: 'EXEC' });
    expect(got.completedAt).not.toBeNull();
    expect(got.lastResult).toEqual({ ok: true, reason: 'done' });
    s.close();
  });
});
