import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ApprovalBroker } from '../../../../src/core/approval-broker.js';
import { ApprovalStore } from '../../../../src/core/approval-store.js';
import type { ResolvedApprovalLifecycleConfig } from '../../../../src/core/config-types.js';
import { approvalLifecycleProfileDigest } from '../../../../src/core/approval-lifecycle-policy.js';
import { MissionApprovalCoordinator } from '../../../../src/orchestra/autonomous/mission-store/mission-approval-coordinator.js';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';

const roots: string[] = [];
const stores: SqliteMissionStore[] = [];
const NOW = new Date('2026-08-21T12:00:00.000Z');

const LIFECYCLE: ResolvedApprovalLifecycleConfig = {
  enabled: true,
  profiles: {
    confirmation: { ttlMs: 8_000, slaMs: [1_000, 2_000, 4_000], riskTier: 'elevated', timeoutDisposition: 'park-undecidable', blocking: 'run' },
    'autonomous-trigger': { ttlMs: 3_600_000, slaMs: [120_000, 600_000, 1_800_000], riskTier: 'elevated', timeoutDisposition: 'park-alert', blocking: 'trigger' },
    'gateway-pairing': { ttlMs: 600_000, slaMs: [60_000, 180_000, 420_000], riskTier: 'critical', timeoutDisposition: 'deny-expire', blocking: 'security' },
    'broker-native': { ttlMs: 1_800_000, slaMs: [120_000, 600_000, 1_200_000], riskTier: 'routine', timeoutDisposition: 'request-default', blocking: 'request' },
  },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'mission-approval-lifecycle-'));
  roots.push(root);
  const missionStore = new SqliteMissionStore(root);
  stores.push(missionStore);
  missionStore.migrate();
  missionStore.createMission({
    id: 'mission-lifecycle',
    kind: 'list',
    tenant: 'tenant-a',
    title: 'Lifecycle mission',
    createdBy: 'owner-a',
  });
  const broker = new ApprovalBroker(root, { lifecycle: LIFECYCLE, clock: () => NOW });
  const decisions = new ApprovalStore(root, { lifecycle: LIFECYCLE, clock: () => NOW });
  return { root, missionStore, broker, decisions };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('MissionApprovalCoordinator lifecycle producer', () => {
  it('authors canonical v2 from request creation clock with effective risk/EffectClass parity', async () => {
    const f = fixture();
    f.missionStore.enqueueItem({
      id: 'publish-item',
      missionId: 'mission-lifecycle',
      kind: 'task',
      policy: 'risk-tagged',
      spec: { description: 'npm publish the release' },
    });
    const coordinator = new MissionApprovalCoordinator({
      store: f.missionStore,
      publisher: f.broker,
      decisions: f.decisions,
      lifecycle: LIFECYCLE,
      now: () => NOW,
      requestFactory: (item, mission, requestedAt) => ({
        requester: { role: 'brain', instanceId: `mission:${mission.id}` },
        summary: `Approve ${item.id}`,
        details: { missionId: mission.id, workItemId: item.id },
        scopeId: mission.id,
        scope: 'lifecycle',
        risk: 'low',
        policy: 'require-approval',
        defaultAction: 'deny',
        tenantId: mission.tenant,
        userId: mission.createdBy!,
        createdAt: requestedAt.toISOString(),
        expiresAt: new Date(requestedAt.getTime() + 7_200_000).toISOString(),
        maskedArgs: null,
        rawArgsRef: null,
      }),
    });

    expect(await coordinator.tick()).toMatchObject({ parked: 1, published: 1, invalid: 0 });
    const request = f.decisions.index(NOW).pending[0]!.request;
    expect(request).toMatchObject({
      version: '2.0',
      origin: 'autonomous-trigger',
      createdAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + LIFECYCLE.profiles['autonomous-trigger'].ttlMs).toISOString(),
      risk: 'critical',
      riskTier: 'critical',
      blocking: 'trigger',
      slaStage: 'initial',
      details: { effectClass: 'critical-irreversible', effectiveRisk: 'critical' },
      source: { contractVersion: '2.0' },
    });
    if (request.version !== '2.0') throw new Error('v2 expected');
    expect(request.policySnapshotDigest).toBe(
      approvalLifecycleProfileDigest('autonomous-trigger', request.lifecycleProfile),
    );
    expect(request.source.requestDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('does not use item.createdAt as a fresh TTL and parks an invalid producer window fail-closed', async () => {
    const f = fixture();
    f.missionStore.enqueueItem({
      id: 'stale-window',
      missionId: 'mission-lifecycle',
      kind: 'task',
      policy: 'approval-required',
      spec: { description: 'edit docs', scopeDir: 'docs/' },
    });
    const coordinator = new MissionApprovalCoordinator({
      store: f.missionStore,
      publisher: f.broker,
      decisions: f.decisions,
      lifecycle: LIFECYCLE,
      now: () => NOW,
      requestFactory: (item, mission) => ({
        requester: { role: 'brain', instanceId: 'clock-test' },
        summary: `Approve ${item.id}`,
        details: {},
        scopeId: mission.id,
        scope: 'lifecycle',
        risk: 'high',
        policy: 'require-approval',
        defaultAction: 'deny',
        tenantId: mission.tenant,
        userId: 'owner-a',
        createdAt: item.createdAt,
        expiresAt: new Date(NOW.getTime() - 1).toISOString(),
      }),
    });

    expect(await coordinator.tick()).toMatchObject({ parked: 0, published: 0, invalid: 1 });
    expect(f.decisions.index(NOW).pending).toEqual([]);
    expect(f.missionStore.listItems('mission-lifecycle')[0]).toMatchObject({ status: 'parked' });
  });

  it('blocks new governed outbox records when lifecycle rollout is disabled', async () => {
    const f = fixture();
    f.missionStore.enqueueItem({
      id: 'disabled-item', missionId: 'mission-lifecycle', kind: 'task', policy: 'approval-required',
    });
    const coordinator = new MissionApprovalCoordinator({
      store: f.missionStore,
      publisher: f.broker,
      decisions: f.decisions,
      lifecycle: { ...LIFECYCLE, enabled: false },
      now: () => NOW,
      requestFactory: (_item, mission, requestedAt) => ({
        requester: { role: 'brain', instanceId: 'disabled-test' },
        summary: 'Blocked', details: {}, scopeId: mission.id, scope: 'lifecycle', risk: 'high',
        policy: 'require-approval', defaultAction: 'deny', tenantId: mission.tenant, userId: 'owner-a',
        createdAt: requestedAt.toISOString(), expiresAt: new Date(requestedAt.getTime() + 60_000).toISOString(),
      }),
    });

    expect(await coordinator.tick()).toMatchObject({ parked: 0, published: 0, invalid: 1 });
    expect(f.missionStore.listApprovalBindings()).toEqual([]);
  });
});
