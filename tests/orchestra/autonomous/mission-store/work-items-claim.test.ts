import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import type { ApprovalDecision, ApprovalRequest } from '../../../../src/core/approval-contract.js';
import {
  PRODUCTION_V2_RUNNER_REGISTRY,
  admitWorkItemBatch,
  createMissionRunnerRegistry,
} from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type { NewWorkItem } from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';

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

function admitted(item: NewWorkItem): NewWorkItem {
  return admitWorkItemBatch([item], PRODUCTION_V2_RUNNER_REGISTRY)[0]!;
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

  it('issues one exact dispatch authority and persists only its token hash', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'authority', missionId: 'm', kind: 'task' });

    const claims = [0, 1, 2, 3].map((index) => s.claimItemWithAuthority('authority', `caller-${index}`));
    const winners = claims.filter((claim) => claim !== null);
    expect(winners).toHaveLength(1);
    const claim = winners[0]!;
    expect(claim).toMatchObject({
      schemaVersion: 1,
      workItemId: 'authority',
      missionId: 'm',
      itemRevision: 1,
    });
    expect(Object.isFrozen(claim)).toBe(true);
    const row = s.__rawGet(`SELECT claim_attempt_id,claim_fence_token_hash
      FROM work_items WHERE id='authority'`);
    expect(row).toEqual({
      claim_attempt_id: claim.attemptId,
      claim_fence_token_hash: claim.fenceTokenHash,
    });
    expect(JSON.stringify(row)).not.toContain(claim.fenceToken);
    s.close();
  });

  it('settles an exact claim once and rejects wrong, stale, or replayed authority', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'settle', missionId: 'm', kind: 'task' });
    const claim = s.claimItemWithAuthority('settle', 'scheduler')!;
    const before = s.__rawGet("SELECT status,revision,last_result FROM work_items WHERE id='settle'");

    expect(s.isDispatchClaimActive(claim)).toBe(true);
    expect(s.isDispatchClaimActive(Object.freeze({ ...claim, claimedBy: 'other' }))).toBe(false);
    const forgedToken = 'self-consistent-forgery';
    expect(s.isDispatchClaimActive(Object.freeze({
      ...claim,
      fenceToken: forgedToken,
      fenceTokenHash: createHash('sha256').update(forgedToken).digest('hex'),
    }))).toBe(false);
    expect(s.settleClaimedItem({ ...claim, claimedBy: 'other' }, 'done', { ok: true })).toBe(false);
    expect(s.settleClaimedItem({ ...claim, attemptId: 'other' }, 'done', { ok: true })).toBe(false);
    expect(s.settleClaimedItem({ ...claim, itemRevision: claim.itemRevision + 1 }, 'done', { ok: true })).toBe(false);
    expect(s.settleClaimedItem({ ...claim, fenceToken: 'wrong' }, 'done', { ok: true })).toBe(false);
    expect(s.__rawGet("SELECT status,revision,last_result FROM work_items WHERE id='settle'"))
      .toEqual(before);

    expect(s.settleClaimedItem(claim, 'done', { ok: true, reason: 'exact' })).toBe(true);
    expect(s.isDispatchClaimActive(claim)).toBe(false);
    expect(s.settleClaimedItem(claim, 'failed', { ok: false, reason: 'replay' })).toBe(false);
    expect(s.__rawGet(`SELECT status,revision,last_result,claim_attempt_id,claim_fence_token_hash
      FROM work_items WHERE id='settle'`)).toEqual({
      status: 'done',
      revision: claim.itemRevision + 1,
      last_result: JSON.stringify({ ok: true, reason: 'exact' }),
      claim_attempt_id: null,
      claim_fence_token_hash: null,
    });
    s.close();
  });

  it('recovery revokes an orphaned claim so its old authority can never settle', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'orphan', missionId: 'm', kind: 'task' });
    const claim = s.claimItemWithAuthority('orphan', 'dead-worker')!;

    s.recover();

    expect(s.settleClaimedItem(claim, 'done', { ok: true })).toBe(false);
    expect(s.__rawGet(`SELECT status,claimed_at,claimed_by,claim_attempt_id,claim_fence_token_hash
      FROM work_items WHERE id='orphan'`)).toEqual({
      status: 'parked',
      claimed_at: null,
      claimed_by: null,
      claim_attempt_id: null,
      claim_fence_token_hash: null,
    });
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

  it('durably fails an unsupported persisted kind before due-query or approval publication', () => {
    const s = freshMission();
    s.enqueueItem({
      id: 'corrupt-due',
      missionId: 'm',
      kind: 'task',
      policy: 'approval-required',
      spec: { description: 'must never execute' },
    });
    s.__rawExec("UPDATE work_items SET kind='deploy' WHERE id='corrupt-due'");

    expect(s.listApprovalCandidates()).toEqual([]);
    expect(s.queryDue()).toEqual([]);
    const row = s.__rawGet("SELECT kind,status,claimed_by,last_result FROM work_items WHERE id='corrupt-due'");
    expect(row).toMatchObject({ kind: 'deploy', status: 'failed', claimed_by: null });
    expect(JSON.parse(row.last_result)).toEqual({
      ok: false,
      reason: 'UNKNOWN_KIND: unsupported persisted work-item kind "deploy"',
      missionAdmission: {
        code: 'UNKNOWN_KIND',
        itemId: 'corrupt-due',
        persistedKind: 'deploy',
        decision: 'failed-closed',
      },
    });
    s.close();
  });

  it('atomically refuses and classifies an unsupported kind when claim is the first read', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'corrupt-claim', missionId: 'm', kind: 'task' });
    s.__rawExec("UPDATE work_items SET kind='deploy' WHERE id='corrupt-claim'");

    expect(s.claimItem('corrupt-claim', 'scheduler')).toBe(false);
    expect(s.__rawGet("SELECT status,claimed_at,claimed_by FROM work_items WHERE id='corrupt-claim'"))
      .toEqual({ status: 'failed', claimed_at: null, claimed_by: null });
    s.close();
  });

  it('classifies a corrupt running row before orphan recovery and stays idempotent', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'corrupt-running', missionId: 'm', kind: 'task' });
    expect(s.claimItem('corrupt-running', 'dead-worker')).toBe(true);
    s.__rawExec("UPDATE work_items SET kind='deploy' WHERE id='corrupt-running'");

    s.recover();
    const first = s.__rawGet("SELECT kind,status,claimed_at,claimed_by,last_result,updated_at FROM work_items WHERE id='corrupt-running'");
    expect(first).toMatchObject({
      kind: 'deploy', status: 'failed', claimed_at: null, claimed_by: null,
    });
    expect(JSON.parse(first.last_result).missionAdmission).toMatchObject({
      code: 'UNKNOWN_KIND', persistedKind: 'deploy', decision: 'failed-closed',
    });

    s.recover();
    expect(s.__rawGet("SELECT kind,status,claimed_at,claimed_by,last_result,updated_at FROM work_items WHERE id='corrupt-running'"))
      .toEqual(first);
    s.close();
  });

  it('persists the production registry fence and records claim authority provenance', () => {
    const s = freshMission();
    s.enqueueItem(admitted({
      id: 'fenced', missionId: 'm', kind: 'task', spec: { description: 'fenced task' },
    }));

    const due = s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY });
    expect(due).toHaveLength(1);
    expect(due[0]!.admissionFence?.registryDigest).toBe(PRODUCTION_V2_RUNNER_REGISTRY.registryDigest);
    expect(s.claimItem('fenced', 'scheduler', {
      itemRevision: due[0]!.revision,
      admissionFence: due[0]!.admissionFence!,
      registry: PRODUCTION_V2_RUNNER_REGISTRY,
    })).toBe(true);

    const claimed = s.listItems('m')[0]!;
    expect(claimed.revision).toBe(due[0]!.revision + 1);
    expect(claimed.claimRegistryRevision).toBe(PRODUCTION_V2_RUNNER_REGISTRY.registryRevision);
    expect(claimed.claimRegistryDigest).toBe(PRODUCTION_V2_RUNNER_REGISTRY.registryDigest);
    s.close();
  });

  it('parks a missing-fence legacy task durably and idempotently', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'legacy-no-fence', missionId: 'm', kind: 'task', spec: { description: 'legacy' } });

    expect(s.reconcileRuntimeAdmission(PRODUCTION_V2_RUNNER_REGISTRY)).toEqual(['m']);
    const first = s.__rawGet("SELECT status,revision,updated_at,last_result FROM work_items WHERE id='legacy-no-fence'");
    expect(first.status).toBe('parked');
    expect(JSON.parse(first.last_result).missionAdmission).toMatchObject({
      code: 'ADMISSION_FENCE_MISSING',
      decision: 'parked-hold',
    });
    expect(s.reconcileRuntimeAdmission(PRODUCTION_V2_RUNNER_REGISTRY)).toEqual([]);
    expect(s.__rawGet("SELECT status,revision,updated_at,last_result FROM work_items WHERE id='legacy-no-fence'"))
      .toEqual(first);
    s.close();
  });

  it('parks a v1 runner fence when production advances to the host-authority v2 contract', () => {
    const s = freshMission();
    const oldRegistry = createMissionRunnerRegistry({
      registryRevision: 'goal-v2-production-v1',
      runners: [{
        kind: 'task',
        runnerContract: 'mission-task-context-v1',
        runnerRevision: 'task-mode-runner-v1',
      }],
    });
    const oldItem = admitWorkItemBatch([{
      id: 'v1-fence',
      missionId: 'm',
      kind: 'task' as const,
      spec: { description: 'must be re-admitted' },
    }], oldRegistry)[0]!;
    s.enqueueItem(oldItem);

    expect(s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })).toEqual([]);
    expect(s.listItems('m')[0]).toMatchObject({
      status: 'parked',
      lastResult: {
        ok: false,
        missionAdmission: {
          code: 'RUNTIME_REGISTRY_MISMATCH',
          decision: 'parked-hold',
        },
      },
    });
    s.close();
  });

  it.each(['sprint', 'capability', 'process'] as const)(
    'parks a fence-bearing task tampered to canonical but unwired kind=%s',
    (kind) => {
      const s = freshMission();
      s.enqueueItem(admitted({
        id: `tampered-${kind}`, missionId: 'm', kind: 'task', spec: { description: 'must not dispatch' },
      }));
      s.__rawExec(`UPDATE work_items SET kind='${kind}' WHERE id='tampered-${kind}'`);

      expect(s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })).toEqual([]);
      const item = s.listItems('m')[0]!;
      expect(item.kind).toBe(kind);
      expect(item.status).toBe('parked');
      expect(item.lastResult?.reason).toContain('RUNTIME_RUNNER_UNAVAILABLE');
      expect(s.claimItem(item.id, 'bypass')).toBe(false);
      s.close();
    },
  );

  it('fails a definition changed after admission even when row revision was not advanced', () => {
    const s = freshMission();
    s.enqueueItem(admitted({
      id: 'definition-tamper', missionId: 'm', kind: 'task', spec: { description: 'original' },
    }));
    s.__rawExec("UPDATE work_items SET spec='{\"description\":\"changed\"}' WHERE id='definition-tamper'");

    expect(s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })).toEqual([]);
    const item = s.listItems('m')[0]!;
    expect(item.status).toBe('failed');
    expect(item.lastResult?.reason).toContain('WORK_ITEM_DEFINITION_MISMATCH');
    s.close();
  });

  it('loses a stale row-revision claim without dispatch authority', () => {
    const s = freshMission();
    s.enqueueItem(admitted({ id: 'stale', missionId: 'm', kind: 'task', spec: { description: 'stale' } }));
    const stale = s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })[0]!;
    s.updateItemStatus('stale', 'pending', { ok: false, reason: 'concurrent metadata transition' });

    expect(s.claimItem('stale', 'stale-scheduler', {
      itemRevision: stale.revision,
      admissionFence: stale.admissionFence!,
      registry: PRODUCTION_V2_RUNNER_REGISTRY,
    })).toBe(false);
    expect(s.listItems('m')[0]!.status).toBe('pending');

    const fresh = s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })[0]!;
    expect(s.claimItem('stale', 'fresh-scheduler', {
      itemRevision: fresh.revision,
      admissionFence: fresh.admissionFence!,
      registry: PRODUCTION_V2_RUNNER_REGISTRY,
    })).toBe(true);
    s.close();
  });

  it('holds a fence when the same registry revision is reused with a different digest', () => {
    const s = freshMission();
    s.enqueueItem(admitted({ id: 'registry-drift', missionId: 'm', kind: 'task', spec: { description: 'drift' } }));
    const due = s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })[0]!;
    const drifted = createMissionRunnerRegistry({
      registryRevision: PRODUCTION_V2_RUNNER_REGISTRY.registryRevision,
      runners: [{ kind: 'task', runnerContract: 'mission-task-context-v1', runnerRevision: 'task-mode-runner-v2' }],
    });

    expect(s.claimItem('registry-drift', 'drifted-scheduler', {
      itemRevision: due.revision,
      admissionFence: due.admissionFence!,
      registry: drifted,
    })).toBe(false);
    const held = s.listItems('m')[0]!;
    expect(held.status).toBe('parked');
    expect(held.lastResult?.reason).toContain('RUNTIME_REGISTRY_MISMATCH');
    s.close();
  });

  it('rolls back a whole admitted goal batch on one id conflict', () => {
    const s = freshMission();
    s.enqueueItem(admitted({ id: 'existing', missionId: 'm', kind: 'task', spec: { description: 'existing' } }));
    const batch = admitWorkItemBatch([
      { id: 'new-before-conflict', missionId: 'm', kind: 'task' as const, spec: { description: 'new' } },
      { id: 'existing', missionId: 'm', kind: 'task' as const, spec: { description: 'collision' } },
    ], PRODUCTION_V2_RUNNER_REGISTRY);

    expect(() => s.enqueueItems(batch)).toThrow('MISSION_BATCH_CONFLICT');
    expect(s.listItems('m').map((item) => item.id)).toEqual(['existing']);
    expect(s.__rawGet('SELECT COUNT(*) AS count FROM work_item_admission_fences')).toEqual({ count: 1 });
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
