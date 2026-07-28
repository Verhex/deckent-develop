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
  validateWorkItemAdmission,
} from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type { NewWorkItem } from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';
import { settleMissionItem } from '../../../helpers/mission-store.js';

const dirs: string[] = [];
function freshMission() {
  const d = mkdtempSync(join(tmpdir(), 'wi-')); dirs.push(d);
  const s = new SqliteMissionStore(d); s.migrate();
  s.createMission({ id: 'm', kind: 'list', title: 'm', renderAs: 'checklist' });
  return s;
}
function freshNormalizedMission(missionId = 'm') {
  const d = mkdtempSync(join(tmpdir(), 'wi-normalized-')); dirs.push(d);
  const s = new SqliteMissionStore(d, {
    dependencyAuthorityMode: 'normalized-v1',
    dependencyAuthorityRef: 'owner-decision:m4-108',
  });
  s.migrate();
  s.createMission({ id: missionId, kind: 'list', title: missionId, renderAs: 'checklist' });
  return { root: d, store: s };
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

  it.each(['recurring', 'reactive'] as const)(
    'parks trigger=%s before due-query and never publishes a template approval',
    (triggerType) => {
      const s = freshMission();
      s.enqueueItem({
        id: `trigger-${triggerType}`,
        missionId: 'm',
        kind: 'task',
        policy: 'approval-required',
        trigger: triggerType === 'recurring'
          ? { type: triggerType, cron: '* * * * *' }
          : { type: triggerType, detector: 'debt_trend' },
      });

      expect(s.listApprovalCandidates()).toEqual([]);
      expect(s.queryDue()).toEqual([]);
      const first = s.__rawGet(`SELECT status,revision,claimed_at,claimed_by,last_result
        FROM work_items WHERE id='trigger-${triggerType}'`);
      expect(first).toMatchObject({
        status: 'parked',
        claimed_at: null,
        claimed_by: null,
      });
      expect(JSON.parse(first.last_result)).toMatchObject({
        ok: false,
        reason: 'TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED',
        triggerAdmission: {
          schemaVersion: 1,
          code: 'TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED',
          itemId: `trigger-${triggerType}`,
          triggerType,
          decision: 'parked-hold',
        },
      });

      expect(s.listApprovalCandidates()).toEqual([]);
      expect(s.queryDue()).toEqual([]);
      expect(s.__rawGet(`SELECT status,revision,claimed_at,claimed_by,last_result
        FROM work_items WHERE id='trigger-${triggerType}'`)).toEqual(first);
      expect(s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })).toEqual([]);
      expect(s.queryDue({ registry: PRODUCTION_V2_RUNNER_REGISTRY })).toEqual([]);
      expect(s.__rawGet(`SELECT status,revision,claimed_at,claimed_by,last_result
        FROM work_items WHERE id='trigger-${triggerType}'`)).toEqual(first);
      s.close();
    },
  );

  it('atomically refuses direct recurring claim and revokes stale running authority during recovery', () => {
    const s = freshMission();
    s.enqueueItem({
      id: 'recurring-direct',
      missionId: 'm',
      kind: 'task',
      trigger: { type: 'recurring', cron: '0 9 * * *' },
    });
    expect(s.claimItemWithAuthority('recurring-direct', 'bypass')).toBeNull();
    expect(s.listItems('m')[0]).toMatchObject({
      status: 'parked',
      claimedAt: null,
      claimedBy: null,
      lastResult: { reason: 'TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED' },
    });

    s.__rawExec(`UPDATE work_items SET status='running', claimed_at='stale',
      claimed_by='dead-worker', claim_attempt_id='attempt',
      claim_fence_token_hash='hash' WHERE id='recurring-direct'`);
    const lease = s.acquireEngineLease('trigger-recovery', 30_000)!;
    s.recover(lease);
    expect(s.__rawGet(`SELECT status,claimed_at,claimed_by,claim_attempt_id,
      claim_fence_token_hash,last_result FROM work_items WHERE id='recurring-direct'`))
      .toMatchObject({
        status: 'parked',
        claimed_at: null,
        claimed_by: null,
        claim_attempt_id: null,
        claim_fence_token_hash: null,
      });
    expect(JSON.parse(s.__rawGet(
      "SELECT last_result FROM work_items WHERE id='recurring-direct'",
    ).last_result).reason).toBe('TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED');
    s.close();
  });

  it('journals an exact running claim before trigger recovery clears its authority', () => {
    const s = freshMission();
    s.enqueueItem({
      id: 'trigger-drift-after-claim',
      missionId: 'm',
      kind: 'task',
      trigger: { type: 'one-off' },
    });
    const lease = s.acquireEngineLease('trigger-capture-order', 30_000)!;
    const claim = s.claimItemWithAuthority(
      'trigger-drift-after-claim',
      'worker-before-trigger-drift',
      undefined,
      lease,
    )!;
    s.__rawExec(`UPDATE work_items
      SET trigger='{"type":"recurring","cron":"0 9 * * *"}'
      WHERE id='trigger-drift-after-claim'`);

    const recoveries = s.recover(lease);

    expect(recoveries).toMatchObject([{
      missionId: 'm',
      workItemId: 'trigger-drift-after-claim',
      claimedBy: 'worker-before-trigger-drift',
      attemptId: claim.attemptId,
      fenceTokenHash: claim.fenceTokenHash,
    }]);
    expect(s.listItems('m')[0]).toMatchObject({
      status: 'parked',
      claimedAt: null,
      claimedBy: null,
      lastResult: { reason: 'TRIGGER_OCCURRENCE_AUTHORITY_REQUIRED' },
    });
    expect(JSON.stringify(recoveries)).not.toContain(claim.fenceToken);
    s.close();
  });

  it('rejects unknown fresh trigger families and fails closed for persisted trigger drift', () => {
    const s = freshMission();
    expect(() => s.enqueueItem({
      id: 'fresh-unknown',
      missionId: 'm',
      kind: 'task',
      trigger: { type: 'calendar' },
    })).toThrow('MISSION_TRIGGER_INVALID: fresh-unknown');
    expect(s.__rawGet("SELECT COUNT(*) AS count FROM work_items WHERE id='fresh-unknown'"))
      .toEqual({ count: 0 });

    s.enqueueItem({ id: 'persisted-unknown', missionId: 'm', kind: 'task' });
    s.__rawExec(`UPDATE work_items SET trigger='{"type":"calendar","secret":"not-in-evidence"}'
      WHERE id='persisted-unknown'`);
    expect(s.queryDue()).toEqual([]);
    const row = s.__rawGet(`SELECT status,claimed_at,claimed_by,last_result
      FROM work_items WHERE id='persisted-unknown'`);
    expect(row).toMatchObject({ status: 'failed', claimed_at: null, claimed_by: null });
    const result = JSON.parse(row.last_result);
    expect(result).toMatchObject({
      ok: false,
      reason: 'TRIGGER_INVALID',
      triggerAdmission: {
        schemaVersion: 1,
        code: 'TRIGGER_INVALID',
        itemId: 'persisted-unknown',
        triggerType: 'calendar',
        decision: 'failed-closed',
      },
    });
    expect(result.triggerAdmission.triggerDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(row.last_result).not.toContain('not-in-evidence');
    s.close();
  });

  it('imports an unknown legacy trigger without aborting boot, then quarantines it durably', () => {
    const d = mkdtempSync(join(tmpdir(), 'wi-legacy-trigger-')); dirs.push(d);
    const s = new SqliteMissionStore(d); s.migrate();
    s.importLegacyMissionWithItems(
      { id: 'legacy-trigger-mission', kind: 'list', title: 'legacy', renderAs: 'checklist' },
      [{
        id: 'legacy-trigger-item',
        missionId: 'legacy-trigger-mission',
        kind: 'task',
        trigger: { type: 'calendar', source: 'legacy' },
      }],
    );

    expect(s.queryDue()).toEqual([]);
    const row = s.__rawGet(`SELECT status,last_result FROM work_items
      WHERE id='legacy-trigger-item'`);
    expect(row.status).toBe('failed');
    expect(JSON.parse(row.last_result)).toMatchObject({
      reason: 'TRIGGER_INVALID',
      triggerAdmission: {
        code: 'TRIGGER_INVALID',
        itemId: 'legacy-trigger-item',
        triggerType: 'calendar',
        decision: 'failed-closed',
      },
    });
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

  it('atomically adopts a returned exact plan ref with claim, revision, lease, and admission-fence CAS', () => {
    const s = freshMission();
    const registry = createMissionRunnerRegistry({
      registryRevision: 'mission-exact-sprint-v1',
      runners: [{
        kind: 'sprint',
        runnerContract: 'canonical-exact-sprint-executor-v1',
        runnerRevision: 'exact-sprint-v1',
      }],
    });
    const [admittedSprint] = admitWorkItemBatch([{
      id: 'exact-sprint',
      missionId: 'm',
      kind: 'sprint' as const,
      spec: { directivesRef: 'DIRECTIVES.md' },
    }], registry);
    s.enqueueItem(admittedSprint!);
    const due = s.queryDue({ registry })[0]!;
    const lease = s.acquireEngineLease('mission-exact-engine', 30_000)!;
    const claim = s.claimItemWithAuthority(
      due.id,
      'scheduler',
      {
        itemRevision: due.revision,
        admissionFence: due.admissionFence!,
        registry,
      },
      lease,
    )!;
    const exactPlanRef = {
      schemaVersion: 1 as const,
      flowId: 'mission-flow-r1',
      revision: 1,
      planDigest: 'c'.repeat(64),
    };
    const before = {
      item: s.__rawGet(`SELECT status,spec,revision,last_result
        FROM work_items WHERE id='exact-sprint'`),
      fence: s.__rawGet(`SELECT * FROM work_item_admission_fences
        WHERE work_item_id='exact-sprint'`),
    };

    expect(s.settleClaimedItem(
      { ...claim, itemRevision: claim.itemRevision + 1 },
      'parked',
      { ok: false, reason: 'EXACT_PLAN_APPROVAL_REQUIRED', exactPlanRef },
      lease,
    )).toBe(false);
    expect(s.settleClaimedItem(
      claim,
      'parked',
      { ok: false, reason: 'EXACT_PLAN_APPROVAL_REQUIRED', exactPlanRef },
      { ...lease, ownerId: 'stale-engine' },
    )).toBe(false);
    expect({
      item: s.__rawGet(`SELECT status,spec,revision,last_result
        FROM work_items WHERE id='exact-sprint'`),
      fence: s.__rawGet(`SELECT * FROM work_item_admission_fences
        WHERE work_item_id='exact-sprint'`),
    }).toEqual(before);

    expect(s.settleClaimedItem(
      claim,
      'parked',
      { ok: false, reason: 'EXACT_PLAN_APPROVAL_REQUIRED', exactPlanRef },
      lease,
    )).toBe(true);
    const adopted = s.listItems('m')[0]!;
    expect(adopted).toMatchObject({
      id: 'exact-sprint',
      status: 'parked',
      revision: claim.itemRevision + 1,
      spec: { exactPlanRef },
      lastResult: {
        ok: false,
        reason: 'EXACT_PLAN_APPROVAL_REQUIRED',
        exactPlanRef,
      },
    });
    expect(adopted.spec).not.toHaveProperty('directivesRef');
    expect(adopted.admissionFence).toMatchObject({
      registryRevision: registry.registryRevision,
      registryDigest: registry.registryDigest,
      kind: 'sprint',
      runnerRevision: 'exact-sprint-v1',
    });
    expect(validateWorkItemAdmission(adopted, adopted.admissionFence, registry))
      .toEqual({ ok: true });
    expect(s.settleClaimedItem(
      claim,
      'done',
      { ok: true, exactPlanRef },
      lease,
    )).toBe(false);
    s.close();
  });

  it('recovery revokes an orphaned claim so its old authority can never settle', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'orphan', missionId: 'm', kind: 'task' });
    const claim = s.claimItemWithAuthority('orphan', 'dead-worker')!;

    const lease = s.acquireEngineLease('recovery-test', 30_000)!;
    s.recover(lease);

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

  it('claimItem skips an already-running item; exact settlement persists result', () => {
    const s = freshMission();
    s.enqueueItem({ id: 'w', missionId: 'm', kind: 'task' });
    const claim = s.claimItemWithAuthority('w', 'a')!;
    expect(claim).not.toBeNull();
    expect(s.claimItem('w', 'b')).toBe(false);                // already running
    expect(s.queryDue().length).toBe(0);                       // not surfaced once running
    expect(s.settleClaimedItem(claim, 'done', { ok: true, reason: 'ok' })).toBe(true);
    expect(s.listItems('m')[0].lastResult).toEqual({ ok: true, reason: 'ok' });
    s.close();
  });

  it('backfills only claim-free terminal legacy evidence under exact row revision', () => {
    const s = freshMission();
    s.createMissionWithItems(
      { id: 'legacy-terminal', kind: 'list', title: 'legacy', renderAs: 'checklist' },
      [{
        id: 'legacy-done',
        missionId: 'legacy-terminal',
        kind: 'task',
        initialStatus: 'done',
      }],
    );
    const observed = s.listItems('legacy-terminal')[0]!;
    expect(observed).toMatchObject({ status: 'done', revision: 0, lastResult: null });
    expect(s.backfillLegacyTerminalResult(
      observed.id,
      observed.revision,
      'done',
      { ok: true, reason: 'historical evidence' },
    )).toBe(true);
    expect(s.backfillLegacyTerminalResult(
      observed.id,
      observed.revision,
      'done',
      { ok: true, reason: 'altered retry' },
    )).toBe(false);
    expect(s.listItems('legacy-terminal')[0]).toMatchObject({
      status: 'done',
      revision: 1,
      lastResult: { ok: true, reason: 'historical evidence' },
    });

    s.enqueueItem({ id: 'non-terminal', missionId: 'm', kind: 'task' });
    const pending = s.listItems('m').find((item) => item.id === 'non-terminal')!;
    expect(s.backfillLegacyTerminalResult(
      pending.id,
      pending.revision,
      'done',
      { ok: true },
    )).toBe(false);
    const claim = s.claimItemWithAuthority('non-terminal', 'active-worker')!;
    expect(s.backfillLegacyTerminalResult(
      claim.workItemId,
      claim.itemRevision,
      'done',
      { ok: true },
    )).toBe(false);
    expect(s.isDispatchClaimActive(claim)).toBe(true);
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

    const upstreamClaim = s.claimItemWithAuthority('upstream', 'scheduler')!;
    expect(upstreamClaim).not.toBeNull();
    expect(s.settleClaimedItem(upstreamClaim, 'done', { ok: true })).toBe(true);
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
    settleMissionItem(s, 'failed-root', 'failed', { ok: false, reason: 'root failed' });

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

    const lease = s.acquireEngineLease('corrupt-recovery', 30_000)!;
    s.recover(lease);
    const first = s.__rawGet("SELECT kind,status,claimed_at,claimed_by,last_result,updated_at FROM work_items WHERE id='corrupt-running'");
    expect(first).toMatchObject({
      kind: 'deploy', status: 'failed', claimed_at: null, claimed_by: null,
    });
    expect(JSON.parse(first.last_result).missionAdmission).toMatchObject({
      code: 'UNKNOWN_KIND', persistedKind: 'deploy', decision: 'failed-closed',
    });

    s.recover(lease);
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
    s.__rawExec(`UPDATE work_items SET revision=revision+1,
      last_result='{"ok":false,"reason":"concurrent metadata transition"}'
      WHERE id='stale' AND status='pending'`);

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

  it('grants one active engine lease and fences old claim authority after expiry takeover', () => {
    const d = mkdtempSync(join(tmpdir(), 'wi-engine-lease-')); dirs.push(d);
    const first = new SqliteMissionStore(d); first.migrate();
    first.createMission({ id: 'lease-mission', kind: 'list', title: 'lease', renderAs: 'checklist' });
    first.enqueueItem({ id: 'lease-task', missionId: 'lease-mission', kind: 'task' });
    const second = new SqliteMissionStore(d); second.migrate();

    const leaseA = first.acquireEngineLease('engine-a', 30_000)!;
    expect(leaseA).toMatchObject({ schemaVersion: 1, ownerId: 'engine-a', epoch: 1 });
    expect(Object.isFrozen(leaseA)).toBe(true);
    expect(second.acquireEngineLease('engine-b', 30_000)).toBeNull();
    expect(first.renewEngineLease(leaseA, 30_000)).toMatchObject({ epoch: leaseA.epoch });

    const claim = first.claimItemWithAuthority('lease-task', 'scheduler-a', undefined, leaseA)!;
    expect(claim).not.toBeNull();
    first.__rawExec('UPDATE mission_engine_lease SET expires_at_ms=0');
    const leaseB = second.acquireEngineLease('engine-b', 30_000)!;
    expect(leaseB.epoch).toBe(leaseA.epoch + 1);

    expect(first.renewEngineLease(leaseA, 30_000)).toBeNull();
    expect(first.isDispatchClaimActive(claim, leaseA)).toBe(false);
    expect(first.settleClaimedItem(claim, 'done', { ok: true }, leaseA)).toBe(false);
    expect(first.releaseEngineLease(leaseA)).toBe(false);

    second.recover(leaseB);
    expect(second.listItems('lease-mission')[0]).toMatchObject({
      status: 'parked',
      lastResult: { reason: expect.stringContaining('RECOVERY_RECONCILIATION_REQUIRED') },
    });
    expect(second.releaseEngineLease(leaseB)).toBe(true);
    first.close();
    second.close();
  });

  it('releases only exact engine authority and keeps epochs monotonic across clean handoff', () => {
    const d = mkdtempSync(join(tmpdir(), 'wi-engine-release-')); dirs.push(d);
    const first = new SqliteMissionStore(d); first.migrate();
    const second = new SqliteMissionStore(d); second.migrate();
    const leaseA = first.acquireEngineLease('engine-a', 30_000)!;

    expect(first.releaseEngineLease({ ...leaseA, ownerId: 'other' })).toBe(false);
    expect(first.releaseEngineLease({ ...leaseA, leaseToken: 'forged' })).toBe(false);
    expect(second.acquireEngineLease('engine-b', 30_000)).toBeNull();
    expect(first.releaseEngineLease(leaseA)).toBe(true);

    const leaseB = second.acquireEngineLease('engine-b', 30_000)!;
    expect(leaseB.epoch).toBe(leaseA.epoch + 1);
    expect(first.renewEngineLease(leaseA, 30_000)).toBeNull();
    expect(second.releaseEngineLease(leaseB)).toBe(true);
    first.close();
    second.close();
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

describe('WorkItems — normalized dependency authority', () => {
  it('uses normalized edges across approval, due and both claim seams and ignores legacy JSON tamper', () => {
    const { store: s } = freshNormalizedMission();
    s.enqueueItems([
      { id: 'upstream', missionId: 'm', kind: 'task' },
      {
        id: 'guarded',
        missionId: 'm',
        kind: 'task',
        policy: 'approval-required',
        dependsOn: ['upstream'],
      },
    ]);

    expect(s.__rawGet(`SELECT COUNT(*) AS count FROM work_item_dependencies
      WHERE mission_id='m'`)).toEqual({ count: 1 });
    expect(s.__rawGet(`SELECT COUNT(*) AS count FROM work_items
      WHERE mission_id='m' AND depends_on IS NOT NULL`)).toEqual({ count: 0 });
    expect(s.listApprovalCandidates()).toEqual([]);
    expect(s.parkInvalidApprovalCandidate('guarded', 'not-ready')).toBe(false);
    expect(s.parkItemForApproval('guarded', request('normalized-request'))).toBeNull();
    expect(s.queryDue().map((item) => item.id)).toEqual(['upstream']);
    expect(s.claimItemWithAuthority('guarded', 'normalized-bypass')).toBeNull();
    expect(s.claimItem('guarded', 'normalized-compat-bypass')).toBe(false);

    // A stale ready projection and a forged legacy JSON value cannot authorize
    // the item because the final predicate rechecks normalized edges/statuses.
    s.__rawExec(`UPDATE work_item_dependency_readiness
      SET remaining_count=0,failed_count=0 WHERE work_item_id='guarded'`);
    s.__rawExec(`UPDATE work_items SET depends_on='[]' WHERE id='guarded'`);
    expect(s.queryDue().map((item) => item.id)).toEqual(['upstream']);
    expect(s.claimItemWithAuthority('guarded', 'stale-projection')).toBeNull();
    s.__rawExec(`UPDATE work_item_dependency_readiness
      SET remaining_count=1,failed_count=0 WHERE work_item_id='guarded'`);

    const upstream = s.claimItemWithAuthority('upstream', 'scheduler')!;
    expect(s.settleClaimedItem(upstream, 'done', { ok: true })).toBe(true);
    // Projection is intentionally fail-safe: no dispatch until the bounded
    // durable job advances.
    expect(s.listApprovalCandidates()).toEqual([]);
    expect(s.reconcilePendingDependencies({ maxEdges: 1, maxEdgesPerJob: 1 })).toEqual([]);
    expect(s.listApprovalCandidates().map((item) => item.id)).toEqual(['guarded']);

    const binding = s.parkItemForApproval('guarded', request('normalized-request'))!;
    expect(binding.decisionState).toBe('pending');
    expect(s.applyApprovalDecision(
      binding.requestId,
      'allowed',
      decision(binding.requestId),
    )).toMatchObject({ changed: true });
    expect(s.claimItemWithAuthority('guarded', 'scheduler')).not.toBeNull();
    s.close();
  });

  it('bounds and fairly rotates failure propagation jobs and resumes them after restart', () => {
    const { root, store: first } = freshNormalizedMission('m-a');
    first.createMission({ id: 'm-b', kind: 'list', title: 'm-b', renderAs: 'checklist' });
    for (const missionId of ['m-a', 'm-b']) {
      first.enqueueItems([
        { id: `${missionId}-root`, missionId, kind: 'task' },
        { id: `${missionId}-child-a`, missionId, kind: 'task', dependsOn: [`${missionId}-root`] },
        { id: `${missionId}-child-b`, missionId, kind: 'task', dependsOn: [`${missionId}-root`] },
      ]);
      const claim = first.claimItemWithAuthority(`${missionId}-root`, 'scheduler')!;
      expect(first.settleClaimedItem(claim, 'failed', { ok: false, reason: 'root-failed' })).toBe(true);
    }

    expect(first.reconcilePendingDependencies({ maxEdges: 2, maxEdgesPerJob: 1 }).sort())
      .toEqual(['m-a', 'm-b']);
    expect(first.__rawGet(`SELECT COUNT(*) AS count FROM work_items
      WHERE mission_id='m-a' AND status='blocked'`)).toEqual({ count: 1 });
    expect(first.__rawGet(`SELECT COUNT(*) AS count FROM work_items
      WHERE mission_id='m-b' AND status='blocked'`)).toEqual({ count: 1 });
    first.close();

    const reopened = new SqliteMissionStore(root);
    reopened.migrate();
    for (let i = 0; i < 8; i++) {
      reopened.reconcilePendingDependencies({ maxEdges: 2, maxEdgesPerJob: 1 });
    }
    expect(reopened.__rawGet(`SELECT COUNT(*) AS count FROM work_items
      WHERE status='blocked'`)).toEqual({ count: 4 });
    expect(reopened.__rawGet(`SELECT COUNT(*) AS count
      FROM mission_dependency_reconcile_queue WHERE state='pending'`)).toEqual({ count: 0 });
    expect(reopened.queryDue()).toEqual([]);
    reopened.close();
  });
});
