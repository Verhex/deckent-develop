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

  it('queryDue and atomic claim refuse stale pending work owned by a terminal mission', () => {
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      const s = freshMission();
      const id = `terminal-${status}`;
      s.enqueueItem({ id, missionId: 'm', kind: 'task' });
      s.updateMissionStatus('m', status, { ok: status === 'completed' });

      expect(s.queryDue()).toEqual([]);
      expect(s.claimItem(id, 'scheduler')).toBe(false);
      expect(s.listItems('m')[0]!.status).toBe('pending');
      s.close();
    }
  });

  it('queryDue and atomic claim both refuse unmet dependencies', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'upstream', missionId: 'm', kind: 'task' });
    s.enqueueItem({ id: 'downstream', missionId: 'm', kind: 'task', dependsOn: ['upstream'] });

    expect(s.queryDue().map((item) => item.id)).toEqual(['upstream']);
    expect(s.claimItem('downstream', 'racing-scheduler')).toBe(false);

    expect(s.claimItem('upstream', 'scheduler')).toBe(true);
    s.updateItemStatus('upstream', 'done', { ok: true });
    expect(s.queryDue().map((item) => item.id)).toEqual(['downstream']);
    expect(s.claimItem('downstream', 'scheduler')).toBe(true);
    s.close();
  });

  it('reconcilePendingDependencies fails missing and cyclic chains durably', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'missing', missionId: 'm', kind: 'task', dependsOn: ['other-mission-item'] });
    s.enqueueItem({ id: 'cycle-a', missionId: 'm', kind: 'task', dependsOn: ['cycle-b'] });
    s.enqueueItem({ id: 'cycle-b', missionId: 'm', kind: 'task', dependsOn: ['cycle-a'] });
    s.enqueueItem({ id: 'after-cycle', missionId: 'm', kind: 'task', dependsOn: ['cycle-a'] });

    expect(s.reconcilePendingDependencies()).toEqual(['m']);
    const byId = new Map(s.listItems('m').map((item) => [item.id, item]));
    expect(byId.get('missing')!.lastResult?.reason).toContain('DEPENDENCY_NOT_FOUND');
    expect(byId.get('cycle-a')!.lastResult?.reason).toContain('DEPENDENCY_CYCLE');
    expect(byId.get('cycle-b')!.lastResult?.reason).toContain('DEPENDENCY_CYCLE');
    expect(byId.get('after-cycle')!.status).toBe('blocked');
    expect(byId.get('after-cycle')!.lastResult?.reason).toBe('DEPENDENCY_FAILED: cycle-a');
    expect(byId.get('missing')!.status).toBe('failed');
    expect(s.queryDue()).toEqual([]);
    s.close();
  });

  it('blocks a later item that depends on an already-blocked upstream', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'failed-root', missionId: 'm', kind: 'task' });
    s.enqueueItem({ id: 'blocked-child', missionId: 'm', kind: 'task', dependsOn: ['failed-root'] });
    s.updateItemStatus('failed-root', 'failed', { ok: false, reason: 'root failed' });

    expect(s.reconcilePendingDependencies()).toEqual(['m']);
    expect(s.listItems('m').find((item) => item.id === 'blocked-child')!.status).toBe('blocked');

    s.enqueueItem({ id: 'later-child', missionId: 'm', kind: 'task', dependsOn: ['blocked-child'] });
    expect(s.reconcilePendingDependencies()).toEqual(['m']);
    const later = s.listItems('m').find((item) => item.id === 'later-child')!;
    expect(later.status).toBe('blocked');
    expect(later.lastResult?.reason).toBe('DEPENDENCY_FAILED: blocked-child');
    s.close();
  });
});
