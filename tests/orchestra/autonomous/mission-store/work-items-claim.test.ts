import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import type { ApprovalDecision, ApprovalRequest } from '../../../../src/core/approval-contract.js';

const dirs: string[] = [];
function freshMission() {
  const d = mkdtempSync(join(tmpdir(), 'wi-')); dirs.push(d);
  const s = new SqliteMissionStore(d); s.migrate();
  s.createMission({ id: 'm', kind: 'list', title: 'm', renderAs: 'checklist' });
  return s;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function request(id: string): ApprovalRequest {
  return {
    version: '1.0', id, requester: { role: 'brain', instanceId: 'goal-v2' },
    summary: 'Approve work item', details: {}, scopeId: 'm', scope: 'lifecycle', risk: 'high',
    policy: 'require-approval', defaultAction: 'deny', tenantId: 'local', userId: 'owner',
    createdAt: '2026-07-22T00:00:00.000Z', expiresAt: '2026-07-22T01:00:00.000Z',
    maskedArgs: null, rawArgsRef: null,
  };
}

function decision(requestId: string, action: ApprovalDecision['decision'] = 'allow'): ApprovalDecision {
  return {
    requestId, decision: action, decidedBy: 'owner', channel: 'test',
    decidedAt: '2026-07-22T00:01:00.000Z', reason: 'test',
  };
}

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

  it.each(['approval-required', 'risk-tagged'] as const)(
    'queryDue and claimItem fail-close policy=%s until a durable allow exists',
    (policy) => {
      const s = freshMission();
      const id = `guarded-${policy}`;
      const req = request(`approval-${policy}`);
      s.enqueueItem({ id, missionId: 'm', kind: 'task', policy });

      expect(s.queryDue()).toEqual([]);
      expect(s.claimItem(id, 'bypass')).toBe(false);
      expect(s.parkItemForApproval(id, req)?.publishState).toBe('outbox');

      // Even an out-of-band status flip cannot bypass the approval binding.
      s.__rawExec(`UPDATE work_items SET status='pending' WHERE id='${id}'`);
      expect(s.queryDue()).toEqual([]);
      expect(s.claimItem(id, 'bypass-after-flip')).toBe(false);

      s.__rawExec(`UPDATE work_items SET status='parked' WHERE id='${id}'`);
      expect(s.applyApprovalDecision(req.id, 'allowed', decision(req.id))).toMatchObject({ changed: true });
      expect(s.queryDue().map((item) => item.id)).toEqual([id]);
      expect(s.claimItem(id, 'scheduler')).toBe(true);
      expect(s.claimItem(id, 'duplicate')).toBe(false);
      s.close();
    },
  );

  it('keeps policy=auto behavior unchanged and fails closed for an unknown persisted policy', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'auto', missionId: 'm', kind: 'task', policy: 'auto' });
    s.enqueueItem({ id: 'unknown', missionId: 'm', kind: 'task', policy: 'auto' });
    s.__rawExec("UPDATE work_items SET policy='mystery' WHERE id='unknown'");

    expect(s.queryDue().map((item) => item.id)).toEqual(['auto']);
    expect(s.claimItem('unknown', 'bypass')).toBe(false);
    expect(s.claimItem('auto', 'scheduler')).toBe(true);
    s.close();
  });

  it('rejects a semantically mismatched decision-state transition', () => {
    const s = freshMission();
    const req = request('approval-semantic');
    s.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    s.parkItemForApproval('guarded', req);

    expect(() => s.applyApprovalDecision(req.id, 'allowed', decision(req.id, 'deny')))
      .toThrow('MISSION_APPROVAL_DECISION_INVALID');
    expect(s.listItems('m')[0]!.status).toBe('parked');
    expect(s.listApprovalBindings()[0]!.decisionState).toBe('pending');
    s.close();
  });
});
