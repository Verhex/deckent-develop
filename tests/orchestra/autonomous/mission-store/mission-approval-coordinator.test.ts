import { afterEach, describe, expect, it } from 'vitest';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApprovalBroker } from '../../../../src/core/approval-broker.js';
import { ApprovalStore } from '../../../../src/core/approval-store.js';
import { validateApprovalRequest, type ApprovalAction, type ApprovalRequest } from '../../../../src/core/approval-contract.js';
import {
  ApprovalDecisionAuthority,
  ApprovalDecisionIngress,
  type ApprovalDecisionIntegrityAuthority,
  type LiveApprovalAuthenticator,
  type LiveApprovalSessionProof,
} from '../../../../src/core/approval-decision-ingress.js';
import {
  MissionApprovalCoordinator,
  approvalRequestIdForWorkItem,
  type MissionApprovalRequestFactory,
} from '../../../../src/orchestra/autonomous/mission-store/mission-approval-coordinator.js';
import { runMissionScheduler } from '../../../../src/orchestra/autonomous/mission-store/mission-scheduler.js';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import { settleMissionItem } from '../../../helpers/mission-store.js';

const roots: string[] = [];
const NOW = new Date('2026-07-22T00:00:00.000Z');
const INTEGRITY_KEY = Buffer.from('mission-approval-hermetic-key-v1');

class TestIntegrity implements ApprovalDecisionIntegrityAuthority {
  sign(payload: string) {
    return { keyId: 'mission-test-key', mac: createHmac('sha256', INTEGRITY_KEY).update(payload).digest('hex') };
  }
  verify(keyId: string, payload: string, mac: string): boolean {
    if (keyId !== 'mission-test-key' || !/^[a-f0-9]{64}$/u.test(mac)) return false;
    return timingSafeEqual(
      Buffer.from(mac, 'hex'),
      Buffer.from(this.sign(payload).mac, 'hex'),
    );
  }
}

class TestAuthenticator implements LiveApprovalAuthenticator {
  active = true;
  async reauthenticate() {
    return this.active ? {
      actorId: 'owner-a',
      tenantId: 'tenant-a',
      role: 'owner',
      sessionRef: 'mission-session-secret',
      authorityRef: 'mission-test-session:v1',
      authenticatedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    } : null;
  }
  isSessionActive(proof: LiveApprovalSessionProof): boolean {
    return this.active
      && proof.actorId === 'owner-a'
      && proof.tenantId === 'tenant-a'
      && proof.sessionRefHash === createHash('sha256').update('mission-session-secret').digest('hex');
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mission-approval-'));
  roots.push(root);
  const store = new SqliteMissionStore(root);
  store.migrate();
  store.createMission({ id: 'm', kind: 'list', title: 'Mission', tenant: 'tenant-a' });
  const broker = new ApprovalBroker(root);
  const decisions = new ApprovalStore(root);
  const authenticator = new TestAuthenticator();
  const integrity = new TestIntegrity();
  const decisionAuthority = new ApprovalDecisionAuthority(integrity, authenticator);
  const ingress = new ApprovalDecisionIngress({
    broker,
    authenticator,
    integrity,
    channel: 'test',
    now: () => NOW,
  });
  return { root, store, broker, decisions, authenticator, decisionAuthority, ingress };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const requestFactory: MissionApprovalRequestFactory = (item, mission) => ({
  version: '1.0',
  requester: { role: 'brain', instanceId: 'goal-v2' },
  summary: `Approve ${item.id}`,
  details: { missionId: mission.id, workItemId: item.id },
  scopeId: mission.id,
  scope: 'lifecycle',
  risk: item.policy === 'risk-tagged' ? 'high' : 'medium',
  policy: 'require-approval',
  defaultAction: 'deny',
  tenantId: mission.tenant,
  userId: 'owner-a',
  createdAt: NOW.toISOString(),
  expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
  maskedArgs: null,
  rawArgsRef: null,
});

function coordinator(f: ReturnType<typeof fixture>) {
  return new MissionApprovalCoordinator({
    store: f.store,
    publisher: f.broker,
    decisions: f.decisions,
    requestFactory,
    decisionAuthority: f.decisionAuthority,
    now: () => NOW,
  });
}

async function decide(f: ReturnType<typeof fixture>, requestId: string, action: ApprovalAction): Promise<void> {
  const outcome = await f.ingress.decide({
    requestId,
    action,
    idempotencyKey: `mission-command-${requestId}`,
    reason: 'test decision',
  });
  expect(outcome.kind).toBe('decided');
}

describe('MissionApprovalCoordinator', () => {
  it('waits for dependencies, then atomically parks and publishes one request', () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'upstream', missionId: 'm', kind: 'task' });
    f.store.enqueueItem({
      id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required', dependsOn: ['upstream'],
    });
    const c = coordinator(f);

    expect(c.tick()).toMatchObject({ parked: 0, published: 0 });
    expect(f.store.listApprovalBindings()).toEqual([]);
    settleMissionItem(f.store, 'upstream', 'done', { ok: true });
    expect(c.tick()).toMatchObject({ parked: 1, published: 1 });

    const binding = f.store.listApprovalBindings()[0]!;
    expect(binding.publishState).toBe('published');
    expect(binding.decisionState).toBe('pending');
    expect(f.store.listItems('m').find((item) => item.id === 'guarded')!.status).toBe('parked');
    expect(f.decisions.index(NOW).pending.map((entry) => entry.request.id)).toEqual([binding.requestId]);
    expect(c.tick()).toMatchObject({ parked: 0, published: 0, decided: 0 });
    expect(f.decisions.index(NOW).pending).toHaveLength(1);
    f.store.close();
  });

  it('reconciles crash-after-submit/before-ack without a duplicate request', () => {
    const f = fixture();
    const item = f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const mission = f.store.getMission('m')!;
    const id = approvalRequestIdForWorkItem(mission, item);
    const parsed = validateApprovalRequest({ ...requestFactory(item, mission), id });
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const binding = f.store.parkItemForApproval(item.id, parsed.value)!;
    expect(binding.publishState).toBe('outbox');
    f.broker.submit(binding.request); // crash window: broker durable, SQLite ack absent

    const restarted = new MissionApprovalCoordinator({
      store: f.store,
      publisher: new ApprovalBroker(f.root),
      decisions: new ApprovalStore(f.root),
      requestFactory,
      decisionAuthority: f.decisionAuthority,
      now: () => NOW,
    });
    expect(restarted.tick()).toMatchObject({ published: 1 });
    expect(f.store.listApprovalBindings()[0]!.publishState).toBe('published');
    expect(new ApprovalStore(f.root).index(NOW).pending).toHaveLength(1);
    f.store.close();
  });

  it('hydrates allow after restart and preserves exactly-once claim', async () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const c = coordinator(f);
    c.tick();
    const requestId = f.store.listApprovalBindings()[0]!.requestId;
    await decide(f, requestId, 'allow');

    const restarted = new MissionApprovalCoordinator({
      store: f.store,
      publisher: new ApprovalBroker(f.root),
      decisions: new ApprovalStore(f.root),
      requestFactory,
      decisionAuthority: f.decisionAuthority,
      now: () => NOW,
    });
    expect(restarted.tick()).toMatchObject({ decided: 1 });
    expect(f.store.listApprovalBindings()[0]!.decisionState).toBe('allowed');
    expect(f.store.queryDue().map((item) => item.id)).toEqual(['guarded']);
    expect(f.store.claimItem('guarded', 'one')).toBe(true);
    expect(f.store.claimItem('guarded', 'two')).toBe(false);
    f.store.close();
  });

  it('keeps an unattested legacy allow parked instead of turning it into Goal-v2 claim authority', () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const c = coordinator(f);
    c.tick();
    const requestId = f.store.listApprovalBindings()[0]!.requestId;
    f.broker.decide(requestId, {
      decision: 'allow',
      decidedBy: 'owner-a',
      channel: 'legacy-test',
      decidedAt: NOW.toISOString(),
    });

    expect(c.tick()).toMatchObject({ decided: 0, invalid: 1 });
    expect(f.store.listApprovalBindings()[0]!.decisionState).toBe('pending');
    expect(f.store.listItems('m')[0]!.status).toBe('parked');
    expect(f.store.claimItem('guarded', 'bypass')).toBe(false);
    f.store.close();
  });

  it('rechecks live session authority immediately before claim and dispatches nothing after revocation', async () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const c = coordinator(f);
    c.tick();
    const requestId = f.store.listApprovalBindings()[0]!.requestId;
    await decide(f, requestId, 'allow');
    expect(c.tick()).toMatchObject({ decided: 1 });
    expect(f.store.listApprovalBindings()[0]!.decisionState).toBe('allowed');

    f.authenticator.active = false;
    const calls: string[] = [];
    const summary = await runMissionScheduler(f.store, async (item) => {
      calls.push(item.id);
      return { ok: true };
    }, { poolSize: 1, intervalMs: 1, maxIterations: 1, approvalCoordinator: c });

    expect(summary.dispatched).toBe(0);
    expect(calls).toEqual([]);
    expect(f.store.listItems('m')[0]!.status).toBe('pending');
    f.store.close();
  });

  it.each([
    ['deny', 'denied', 'blocked'],
    ['defer', 'deferred', 'parked'],
    ['escalate', 'escalated', 'parked'],
  ] as const)('maps %s to durable %s and item %s', async (action, state, status) => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'risk-tagged' });
    const c = coordinator(f);
    c.tick();
    const requestId = f.store.listApprovalBindings()[0]!.requestId;
    await decide(f, requestId, action);
    expect(c.tick()).toMatchObject({ decided: 1 });
    expect(f.store.listApprovalBindings()[0]!.decisionState).toBe(state);
    expect(f.store.listItems('m')[0]!.status).toBe(status);
    expect(f.store.claimItem('guarded', 'bypass')).toBe(false);
    f.store.close();
  });

  it('maps TTL expiry to blocked and scheduler propagates dependency failure before dispatch', async () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    f.store.enqueueItem({ id: 'downstream', missionId: 'm', kind: 'task', dependsOn: ['guarded'] });
    const c = coordinator(f);
    c.tick();
    f.broker.expire(new Date(NOW.getTime() + 120_000));
    const calls: string[] = [];

    await runMissionScheduler(f.store, async (item) => {
      calls.push(item.id);
      return { ok: true };
    }, { poolSize: 2, intervalMs: 1, maxIterations: 4, approvalCoordinator: c });

    expect(calls).toEqual([]);
    const byId = new Map(f.store.listItems('m').map((item) => [item.id, item]));
    expect(byId.get('guarded')!.status).toBe('blocked');
    expect(byId.get('downstream')!.status).toBe('blocked');
    expect(byId.get('downstream')!.lastResult?.reason).toBe('DEPENDENCY_FAILED: guarded');
    expect(f.store.getMission('m')!.status).toBe('failed');
    f.store.close();
  });

  it('sweeps an overdue undecided request before hydration and blocks it durably', () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    coordinator(f).tick();
    const later = new Date(NOW.getTime() + 120_000);
    const restarted = new MissionApprovalCoordinator({
      store: f.store,
      publisher: new ApprovalBroker(f.root),
      decisions: new ApprovalStore(f.root),
      requestFactory,
      decisionAuthority: f.decisionAuthority,
      now: () => later,
    });

    expect(restarted.tick()).toMatchObject({ decided: 1 });
    expect(f.store.listApprovalBindings()[0]!.decisionState).toBe('expired');
    expect(f.store.listItems('m')[0]!.status).toBe('blocked');
    expect(new ApprovalStore(f.root).index(later).expired[0]!.decision?.closureReason).toBe('expired');
    f.store.close();
  });

  it('durably parks missing request identity without creating approval authority', () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const invalidFactory: MissionApprovalRequestFactory = (item, mission) => ({
      ...requestFactory(item, mission),
      userId: '',
    });
    const c = new MissionApprovalCoordinator({
      store: f.store, publisher: f.broker, decisions: f.decisions,
      requestFactory: invalidFactory, decisionAuthority: f.decisionAuthority, now: () => NOW,
    });

    expect(c.tick()).toMatchObject({ invalid: 1, parked: 0, published: 0 });
    expect(f.store.listApprovalBindings()).toEqual([]);
    expect(f.store.listItems('m')[0]!.status).toBe('parked');
    expect(f.store.listItems('m')[0]!.lastResult?.reason).toContain('APPROVAL_REQUEST_INVALID');
    expect(f.store.claimItem('guarded', 'bypass')).toBe(false);
    expect(f.decisions.index(NOW).pending).toEqual([]);
    f.store.close();
  });

  it('continues dispatching independent auto work when an invalid approval request is held', async () => {
    const f = fixture();
    f.store.enqueueItem({ id: 'invalid-approval', missionId: 'm', kind: 'task', policy: 'approval-required' });
    f.store.enqueueItem({ id: 'auto-work', missionId: 'm', kind: 'task', policy: 'auto' });
    const c = new MissionApprovalCoordinator({
      store: f.store,
      publisher: f.broker,
      decisions: f.decisions,
      requestFactory: () => { throw new Error('identity unavailable'); },
      decisionAuthority: f.decisionAuthority,
      now: () => NOW,
    });
    const calls: string[] = [];

    await runMissionScheduler(f.store, async (item) => {
      calls.push(item.id);
      return { ok: true };
    }, { poolSize: 2, intervalMs: 1, maxIterations: 4, approvalCoordinator: c });

    expect(calls).toEqual(['auto-work']);
    const byId = new Map(f.store.listItems('m').map((item) => [item.id, item]));
    expect(byId.get('invalid-approval')!.status).toBe('parked');
    expect(byId.get('auto-work')!.status).toBe('done');
    f.store.close();
  });

  it('fails loud when a deterministic request id is already bound to different Broker content', () => {
    const f = fixture();
    const item = f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const mission = f.store.getMission('m')!;
    const id = approvalRequestIdForWorkItem(mission, item);
    const parsed = validateApprovalRequest({ ...requestFactory(item, mission), id, summary: 'Foreign content' });
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    f.broker.submit(parsed.value);

    expect(() => coordinator(f).tick()).toThrow('MISSION_APPROVAL_REQUEST_CONFLICT');
    expect(f.store.listItems('m')[0]!.status).toBe('parked');
    expect(f.store.listApprovalBindings()[0]!.publishState).toBe('outbox');
    f.store.close();
  });

  it('does not apply a foreign allow decision whose request body conflicts with the outbox', async () => {
    const f = fixture();
    const item = f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const mission = f.store.getMission('m')!;
    const id = approvalRequestIdForWorkItem(mission, item);
    const expected = validateApprovalRequest({ ...requestFactory(item, mission), id });
    const foreign = validateApprovalRequest({ ...requestFactory(item, mission), id, summary: 'Foreign allow target' });
    if (!expected.ok || !foreign.ok) throw new Error('fixture invalid');
    f.store.parkItemForApproval(item.id, expected.value);
    f.broker.submit(foreign.value);
    await decide(f, id, 'allow');

    expect(() => coordinator(f).tick()).toThrow('MISSION_APPROVAL_REQUEST_CONFLICT');
    expect(f.store.listItems('m')[0]!.status).toBe('parked');
    expect(f.store.listApprovalBindings()[0]!.decisionState).toBe('pending');
    f.store.close();
  });

  it('returns the persisted first binding when two admission attempts race', () => {
    const f = fixture();
    const item = f.store.enqueueItem({ id: 'guarded', missionId: 'm', kind: 'task', policy: 'approval-required' });
    const mission = f.store.getMission('m')!;
    const id = approvalRequestIdForWorkItem(mission, item);
    const parsed = validateApprovalRequest({ ...requestFactory(item, mission), id });
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));

    const first = f.store.parkItemForApproval(item.id, parsed.value)!;
    const second = f.store.parkItemForApproval(item.id, { ...parsed.value, summary: 'Losing candidate' } as ApprovalRequest)!;
    expect(second.request).toEqual(first.request);
    expect(f.store.listApprovalBindings()).toHaveLength(1);
    f.store.close();
  });
});
