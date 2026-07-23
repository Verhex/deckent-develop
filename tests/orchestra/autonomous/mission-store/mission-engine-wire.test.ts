import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  MissionEngineLeaseUnavailableError,
  isV2Engine,
  runV2Engine as runV2EngineRuntime,
  type RunV2EngineDeps,
} from '../../../../src/orchestra/autonomous/mission-store/mission-engine-wire.js';
import type { MissionTaskContext } from '../../../../src/orchestra/autonomous/mission-store/mission-dispatch.js';
import type { MissionNotifyPayload } from '../../../../src/orchestra/autonomous/mission-store/mission-deliver.js';
import {
  createGoalMission,
  buildGoalDeps,
  GoalInvocationHeldError,
} from '../../../../src/orchestra/autonomous/mission-store/goal-mission.js';
import type {
  MissionDispatchClaim,
  NewWorkItem,
  WorkItem,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';
import {
  PRODUCTION_V2_RUNNER_REGISTRY,
  admitWorkItemBatch,
} from '../../../../src/orchestra/autonomous/mission-store/mission-kind-admission.js';
import type { ResolvedConfig } from '../../../../src/core/config-types.js';
import { ApprovalBroker } from '../../../../src/core/approval-broker.js';
import { ApprovalStore } from '../../../../src/core/approval-store.js';
import { MissionApprovalCoordinator } from '../../../../src/orchestra/autonomous/mission-store/mission-approval-coordinator.js';

// ── tmpdir lifecycle ──────────────────────────────────────────────────
const dirs: string[] = [];
const stores: SqliteMissionStore[] = [];
function root(): string { const d = mkdtempSync(join(tmpdir(), 'wire-')); dirs.push(d); return d; }
function openStore(r: string): SqliteMissionStore {
  const s = new SqliteMissionStore(r); s.migrate(); stores.push(s); return s;
}
function enqueueProduction(store: SqliteMissionStore, item: NewWorkItem): WorkItem {
  return store.enqueueItem(admitWorkItemBatch([item], PRODUCTION_V2_RUNNER_REGISTRY)[0]!);
}
afterEach(() => {
  for (const s of stores.splice(0)) { try { s.close(); } catch { /* already closed */ } }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ── minimal ResolvedConfig (the wire reads only autonomous + activeModeConfig) ──
function cfg(autonomous: Record<string, unknown> = {}, maxWorkers: number | 'auto' = 2): ResolvedConfig {
  return {
    activeModeConfig: { max_workers: maxWorkers },
    autonomous: { enabled: true, ...autonomous },
  } as unknown as ResolvedConfig;
}

// Bounded run so the scheduler drains and returns instead of looping forever.
const BOUNDED = 100;

/** Mission-mechanics tests use an explicit hermetic coordinator; production absence is fail-closed. */
async function runV2Engine(
  projectRoot: string,
  config: ResolvedConfig,
  deps: RunV2EngineDeps,
) {
  if (deps.workerInvocationCoordinator) return runV2EngineRuntime(projectRoot, config, deps);
  const legacyRunTask = deps.runTask;
  return runV2EngineRuntime(projectRoot, config, {
    ...deps,
    workerInvocationCoordinator: {
      execute: async (input, executeSelected) => {
        const execution = await executeSelected(Object.freeze({
          reservationId: `test-reservation-${input.claim.attemptId}`,
          dispatchEventRef: `provider-limit-reservation-event:${input.claim.attemptId}`,
          dispatchEventHash: 'a'.repeat(64),
          provider: 'claude', model: 'claude-fable-5',
          receiptRef: {
            schemaVersion: 1 as const,
            invocationId: `test-invocation-${input.claim.attemptId}`,
            tenantId: input.mission.tenant,
            projectId: 'test-project',
          },
          backend: {
            transport: 'cli' as const,
            executionBackend: 'host-subprocess' as const,
            endpointRefHash: 'b'.repeat(64),
          },
          auth: { mode: 'subscription' as const, accountRefHash: 'c'.repeat(64) },
        }));
        return execution.result;
      },
    },
    runAdmittedTask: async (ctx, claim, grant) => ({
      result: await legacyRunTask(
        { ...ctx, provider: grant.provider, model: grant.model },
        claim as MissionDispatchClaim,
      ),
      actualCall: {
        provider: grant.provider, model: grant.model, backend: grant.backend,
        auth: grant.auth, evidenceRef: 'provider-call:test-engine-wire',
      },
      transportEvent: {
        eventId: `test-transport-${claim.attemptId}`,
        type: 'transport_settled',
        payload: { outcome: 'succeeded', exitCode: 0, signal: null, reasonCode: 'none', durationMs: 1 },
      },
      providerSettlementEvent: {
        eventId: `test-consumed-${claim.attemptId}`,
        type: 'consumed', occurredAt: claim.claimedAt,
        fenceTokenHash: claim.fenceTokenHash,
        evidenceRef: 'provider-usage:test-engine-wire',
        actual: [{ windowId: 'tokens-all', unit: 'tokens', amount: 1 }],
      },
      consumerEvent: {
        eventId: `test-consumer-${claim.attemptId}`,
        type: 'consumer_settled',
        payload: { outcome: 'accepted', reasonCode: 'none' },
      },
    }),
  });
}

describe('isV2Engine', () => {
  it('returns true ONLY when autonomous.engine === "v2"', () => {
    expect(isV2Engine(cfg({ engine: 'v2' }))).toBe(true);
  });
  it('returns false when the flag is absent (default → v1 path)', () => {
    expect(isV2Engine(cfg())).toBe(false);
  });
  it('returns false for an explicit "v1" flag', () => {
    expect(isV2Engine(cfg({ engine: 'v1' }))).toBe(false);
  });
  it('returns false when the autonomous block itself is absent', () => {
    expect(isV2Engine({} as unknown as ResolvedConfig)).toBe(false);
  });
});

describe('runV2Engine', () => {
  it('passes an active mission claim only through the coordinator exact-executor seam', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({
      id: 'mCoordinator', kind: 'list', tenant: 'tenant-wire', title: 'Coordinator', renderAs: 'checklist',
    });
    enqueueProduction(store, {
      id: 'mCoordinator-0', missionId: 'mCoordinator', kind: 'task',
      spec: { description: 'coordinated work' },
    });
    const legacyRunTask = vi.fn(async () => ({ ok: true }));
    const runAdmittedTask = vi.fn(async (safeCtx, claim, grant) => {
      expect(safeCtx).not.toHaveProperty('provider');
      expect(safeCtx).not.toHaveProperty('model');
      expect(claim).not.toHaveProperty('fenceToken');
      expect(claim.missionId).toBe('mCoordinator');
      expect(grant).toMatchObject({ provider: 'claude', model: 'claude-fable-5' });
      expect(JSON.stringify({ safeCtx, claim, grant })).not.toContain('fence-');
      return {
        result: { ok: true },
        actualCall: {
          provider: grant.provider, model: grant.model, backend: grant.backend,
          auth: grant.auth, evidenceRef: 'provider-call:engine-wire-0001',
        },
        transportEvent: {
          eventId: 'transport-wire', type: 'transport_settled' as const,
          payload: { outcome: 'succeeded' as const, exitCode: 0, signal: null, reasonCode: 'none' as const, durationMs: 1 },
        },
        providerSettlementEvent: {
          eventId: 'usage-wire', type: 'consumed' as const,
          occurredAt: '2026-07-22T00:00:00.000Z', fenceTokenHash: claim.fenceTokenHash,
          evidenceRef: 'provider-usage:engine-wire-0001',
          actual: [{ windowId: 'tokens-all', unit: 'tokens' as const, amount: 1 }],
        },
        consumerEvent: {
          eventId: 'consumer-wire', type: 'consumer_settled' as const,
          payload: { outcome: 'accepted' as const, reasonCode: 'none' as const },
        },
      };
    });
    const coordinator = {
      execute: vi.fn(async (input, executor) => {
        expect(input.mission).toMatchObject({ id: 'mCoordinator', tenant: 'tenant-wire' });
        expect(input.isClaimActive()).toBe(true);
        const execution = await executor(Object.freeze({
          reservationId: 'reservation-wire',
          dispatchEventRef: 'provider-limit-reservation-event:wire-0001',
          dispatchEventHash: 'a'.repeat(64),
          provider: 'claude', model: 'claude-fable-5',
          receiptRef: {
            schemaVersion: 1 as const, invocationId: 'inv-wire',
            tenantId: 'tenant-wire', projectId: 'project-wire',
          },
          backend: {
            transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: 'c'.repeat(64),
          },
          auth: { mode: 'subscription', accountRefHash: 'd'.repeat(64) },
        }));
        return execution.result;
      }),
    };

    const summary = await runV2EngineRuntime(r, cfg({ engine: 'v2' }), {
      runTask: legacyRunTask,
      runAdmittedTask,
      workerInvocationCoordinator: coordinator,
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    });

    expect(summary.dispatched).toBe(1);
    expect(coordinator.execute).toHaveBeenCalledTimes(1);
    expect(runAdmittedTask).toHaveBeenCalledTimes(1);
    expect(legacyRunTask).not.toHaveBeenCalled();
    expect(store.listItems('mCoordinator')[0]!.status).toBe('done');
  });

  it('parks before coordinator admission when the exact executor is absent', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mNoExecutor', kind: 'list', title: 'No executor', renderAs: 'checklist' });
    enqueueProduction(store, {
      id: 'mNoExecutor-0', missionId: 'mNoExecutor', kind: 'task', spec: { description: 'must hold' },
    });
    const coordinator = { execute: vi.fn() };
    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask: async () => ({ ok: true }),
      workerInvocationCoordinator: coordinator,
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    });
    expect(summary.dispatched).toBe(0);
    expect(coordinator.execute).not.toHaveBeenCalled();
    expect(store.listItems('mNoExecutor')[0]).toMatchObject({
      status: 'parked',
      lastResult: { reason: 'MISSION_WORKER_INVOCATION_HOLD:exact_executor_unavailable' },
    });
  });

  it('fails closed when the Goal-v2 coordinator is absent even if legacy runTask is provider-capable', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mNoCoordinator', kind: 'list', title: 'No coordinator', renderAs: 'checklist' });
    enqueueProduction(store, {
      id: 'mNoCoordinator-0', missionId: 'mNoCoordinator', kind: 'task',
      spec: { description: 'legacy task must stay unreachable' },
    });
    const runTask = vi.fn(async () => ({ ok: true }));
    const summary = await runV2EngineRuntime(r, cfg({ engine: 'v2' }), {
      runTask,
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    });
    expect(summary.dispatched).toBe(0);
    expect(runTask).not.toHaveBeenCalled();
    expect(store.listItems('mNoCoordinator')[0]).toMatchObject({
      status: 'parked',
      lastResult: { reason: 'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE' },
    });
  });

  it('threads the durable approval coordinator before claim and dispatches only after allow', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mA', kind: 'list', title: 'Approval', renderAs: 'checklist' });
    enqueueProduction(store, {
      id: 'mA-0',
      missionId: 'mA',
      kind: 'task',
      policy: 'approval-required',
      spec: { description: 'approved work' },
    });

    const broker = new ApprovalBroker(r);
    const decisions = new ApprovalStore(r);
    const coordinator = new MissionApprovalCoordinator({
      store,
      publisher: broker,
      decisions,
      requestFactory: (item, mission) => ({
        requester: { role: 'brain', instanceId: 'wire-test' },
        summary: 'Run approved test work',
        details: { workItemId: item.id },
        scopeId: item.id,
        scope: 'lifecycle',
        risk: 'medium',
        policy: 'require-approval',
        defaultAction: 'deny',
        tenantId: mission.tenant,
        userId: 'wire-test-user',
        createdAt: '2026-07-22T00:00:00.000Z',
        expiresAt: '2026-07-23T00:00:00.000Z',
      }),
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });
    const runTask = vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: true }));
    const deps: RunV2EngineDeps = {
      runTask,
      runSprint: async () => undefined,
      approvalCoordinator: coordinator,
      store,
      maxIterations: BOUNDED,
    };

    const held = await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(held.dispatched).toBe(0);
    expect(runTask).not.toHaveBeenCalled();
    expect(store.listItems('mA')[0]!.status).toBe('parked');

    const pending = decisions.index(new Date('2026-07-22T00:00:00.000Z')).pending;
    expect(pending).toHaveLength(1);
    broker.decide(pending[0]!.request.id, {
      decision: 'allow',
      decidedBy: 'wire-test-user',
      channel: 'test',
      decidedAt: '2026-07-22T00:01:00.000Z',
      reason: 'approved for hermetic test',
    });

    const allowed = await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(allowed.dispatched).toBe(1);
    expect(runTask).toHaveBeenCalledTimes(1);
    expect(store.listItems('mA')[0]!.status).toBe('done');
  });

  it('opens+migrates the store and drives a list-mission to completion via injected runTask', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'm1', kind: 'list', title: 'List', renderAs: 'checklist' });
    enqueueProduction(store, { id: 'm1-0', missionId: 'm1', kind: 'task', spec: { description: 'do 0' } });
    enqueueProduction(store, { id: 'm1-1', missionId: 'm1', kind: 'task', spec: { description: 'do 1' } });

    const seen: string[] = [];
    const claims: MissionDispatchClaim[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async (ctx: MissionTaskContext, claim) => {
        seen.push(ctx.description);
        claims.push(claim);
        expect(ctx).not.toHaveProperty('dispatchClaim');
        expect(JSON.stringify(ctx)).not.toContain(claim.fenceToken);
        return { ok: true };
      },
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };

    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    // fake dispatch ran both items, the mission settled completed.
    expect(seen.sort()).toEqual(['do 0', 'do 1']);
    expect(claims).toHaveLength(2);
    expect(claims.every(Object.isFrozen)).toBe(true);
    expect(summary.dispatched).toBe(2);
    expect(store.getMission('m1')!.status).toBe('completed');
    expect(store.listItems('m1').every((i) => i.status === 'done')).toBe(true);
  });

  it('persists a host HOLD without contradictory failed settlement detail or delivery', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mH', kind: 'list', title: 'Hold', renderAs: 'checklist' });
    enqueueProduction(store, {
      id: 'mH-0', missionId: 'mH', kind: 'task', spec: { description: 'hold before provider' },
    });
    const notify = vi.fn();

    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask: async () => ({
        ok: false,
        dispatchDisposition: 'parked',
        settleDetail: 'failed',
        reason: 'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE',
      }),
      runSprint: async () => undefined,
      notify,
      store,
      maxIterations: BOUNDED,
    });

    expect(summary.dispatched).toBe(0);
    expect(store.listItems('mH')[0]).toMatchObject({
      status: 'parked',
      lastResult: {
        ok: false,
        dispatchDisposition: 'parked',
        reason: 'MISSION_WORKER_INVOCATION_AUTHORITY_UNAVAILABLE',
      },
    });
    expect(store.listItems('mH')[0]!.lastResult).not.toHaveProperty('settleDetail');
    expect(store.getMission('mH')!.status).toBe('pending');
    expect(notify).not.toHaveBeenCalled();
  });

  it('boot recover() parks an orphaned running item instead of risking duplicate side effects', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mR', kind: 'list', title: 'Recover', renderAs: 'checklist' });
    enqueueProduction(store, { id: 'mR-0', missionId: 'mR', kind: 'task', spec: { description: 'orphaned' } });
    // Simulate a prior crash after claim. The provider side effect may already
    // have happened, so automatically returning this row to pending would risk
    // executing it twice.
    expect(store.claimItem('mR-0', 'dead-worker')).toBe(true);
    expect(store.listItems('mR')[0]!.status).toBe('running');

    const seen: string[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async (ctx: MissionTaskContext) => { seen.push(ctx.description); return { ok: true }; },
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };

    await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    const recovered = store.listItems('mR')[0]!;
    expect(seen).toEqual([]);
    expect(recovered.status).toBe('parked');
    expect(recovered.lastResult?.reason).toContain('RECOVERY_RECONCILIATION_REQUIRED');
  });

  it('does not author, accept, or dispatch a goal whose recovered attempt is parked', async () => {
    const r = root();
    const store = openStore(r);
    createGoalMission(store, { id: 'gR', title: 'Recovered goal', goal: 'do not duplicate' });
    enqueueProduction(store, { id: 'gR-0', missionId: 'gR', kind: 'task', spec: { description: 'uncertain effect' } });
    expect(store.claimItem('gR-0', 'dead-worker')).toBe(true);

    const runTask = vi.fn(async (): Promise<{ ok: boolean }> => ({ ok: true }));
    const planner = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accepter = vi.fn(async () => true);

    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask,
      runSprint: async () => undefined,
      goalDeps: buildGoalDeps({ planner, accepter }),
      store,
      maxIterations: BOUNDED,
    });

    expect(summary.reason).toBe('drained');
    expect(summary.dispatched).toBe(0);
    expect(runTask).not.toHaveBeenCalled();
    expect(planner).not.toHaveBeenCalled();
    expect(accepter).not.toHaveBeenCalled();
    expect(store.listItems('gR')[0]!.status).toBe('parked');
    expect(store.getMission('gR')!.status).toBe('pending');
  });

  it('marks a mission failed when an injected runTask reports ok:false', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mF', kind: 'list', title: 'Fail', renderAs: 'checklist' });
    enqueueProduction(store, { id: 'mF-0', missionId: 'mF', kind: 'task', spec: { description: 'boom' } });

    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: false, reason: 'nope' }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(store.getMission('mF')!.status).toBe('failed');
  });

  it('parks a persisted sprint item even when generic runSprint is injected', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mS', kind: 'list', title: 'Sprint', renderAs: 'checklist' });
    store.enqueueItem({ id: 'mS-0', missionId: 'mS', kind: 'sprint', spec: { directivesRef: 'D' } });

    let sprintCalls = 0;
    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: true }),
      runSprint: async () => { sprintCalls++; return undefined; },
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    expect(sprintCalls).toBe(0);
    expect(store.listItems('mS')[0]!.status).toBe('parked');
    expect(store.listItems('mS')[0]!.lastResult?.reason).toContain('ADMISSION_FENCE_MISSING');
    expect(store.getMission('mS')!.status).toBe('pending');
  });

  it('imports backlog.json into the store at boot (migrateBacklogJson called)', async () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'b1', title: 'B1', kind: 'task', spec: { description: 'imported 1' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
        { id: 'b2', title: 'B2', kind: 'task', spec: { description: 'imported 2' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
      ],
    }), 'utf-8');

    // Fresh empty store (no pre-created mission) — so migrateBacklogJson is NOT a no-op.
    const store = openStore(r);
    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: true }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    // The boot import created the `legacy` mission with both backlog entries as items,
    // and the scheduler then dispatched them to completion.
    const legacy = store.getMission('legacy');
    expect(legacy).not.toBeNull();
    expect(store.listItems('legacy').map((i) => i.id).sort()).toEqual(['b1', 'b2']);
    expect(legacy!.status).toBe('completed');
  });

  it('rejects an unwired legacy kind before mission persistence or dispatch', async () => {
    const r = root();
    mkdirSync(join(r, '.deckent', 'autonomous'), { recursive: true });
    writeFileSync(join(r, '.deckent', 'autonomous', 'backlog.json'), JSON.stringify({
      _version: '1.0',
      entries: [
        { id: 'legacy-sprint', title: 'Unsafe', kind: 'sprint', spec: { directivesRef: 'mutable' }, policy: 'auto', trigger: { type: 'one-off' }, status: 'pending' },
      ],
    }), 'utf-8');
    const store = openStore(r);
    const runTask = vi.fn(async () => ({ ok: true }));
    const runSprint = vi.fn(async () => undefined);

    await expect(runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask,
      runSprint,
      store,
      maxIterations: BOUNDED,
    })).rejects.toThrow('SPRINT_SNAPSHOT_REQUIRED');

    expect(store.getMission('legacy')).toBeNull();
    expect(runTask).not.toHaveBeenCalled();
    expect(runSprint).not.toHaveBeenCalled();
  });

  it('fires the settle-delivery notify when a mission settles', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mN', kind: 'list', title: 'Notify', renderAs: 'checklist', deliverTo: 'alice' });
    enqueueProduction(store, { id: 'mN-0', missionId: 'mN', kind: 'task', spec: { description: 'x' } });

    const payloads: MissionNotifyPayload[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: true }),
      runSprint: async () => undefined,
      notify: (p) => { payloads.push(p); },
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.to).toBe('alice');
    expect(payloads[0]!.status).toBe('completed');
  });

  it('opens its OWN store when none is injected (production path) and closes it', async () => {
    const r = root();
    // Seed one mission via a separate connection, then close it so the engine owns the file.
    const seed = new SqliteMissionStore(r); seed.migrate();
    seed.createMission({ id: 'mOwn', kind: 'list', title: 'Own', renderAs: 'checklist' });
    enqueueProduction(seed, { id: 'mOwn-0', missionId: 'mOwn', kind: 'task', spec: { description: 'own' } });
    seed.close();

    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: true }),
      runSprint: async () => undefined,
      maxIterations: BOUNDED,
      // no `store` → runV2Engine opens SqliteMissionStore(r) itself.
    };
    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(summary.dispatched).toBe(1);

    // Re-open to verify the engine persisted + completed the mission, then closed cleanly.
    const verify = openStore(r);
    expect(verify.getMission('mOwn')!.status).toBe('completed');
  });

  it('refuses a second engine before recovery while another process owns the active lease', async () => {
    const r = root();
    const owner = openStore(r);
    owner.createMission({ id: 'mLeaseConflict', kind: 'list', title: 'lease conflict', renderAs: 'checklist' });
    enqueueProduction(owner, {
      id: 'mLeaseConflict-0', missionId: 'mLeaseConflict', kind: 'task', spec: { description: 'uncertain' },
    });
    expect(owner.claimItem('mLeaseConflict-0', 'prior-engine')).toBe(true);
    const activeLease = owner.acquireEngineLease('active-engine', 30_000)!;
    const contender = openStore(r);
    const runTask = vi.fn(async () => ({ ok: true }));

    await expect(runV2EngineRuntime(r, cfg({ engine: 'v2' }), {
      runTask,
      runSprint: async () => undefined,
      store: contender,
      maxIterations: BOUNDED,
    })).rejects.toBeInstanceOf(MissionEngineLeaseUnavailableError);

    expect(runTask).not.toHaveBeenCalled();
    expect(contender.listItems('mLeaseConflict')[0]!.status).toBe('running');
    expect(owner.releaseEngineLease(activeLease)).toBe(true);
  });

  it('renews the engine lease while provider work remains in flight and releases it on completion', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mLeaseHeartbeat', kind: 'list', title: 'lease heartbeat', renderAs: 'checklist' });
    enqueueProduction(store, {
      id: 'mLeaseHeartbeat-0', missionId: 'mLeaseHeartbeat', kind: 'task', spec: { description: 'long work' },
    });

    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask: async () => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return { ok: true };
      },
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
      engineLeaseOwnerId: 'heartbeat-engine',
      engineLeaseTtlMs: 80,
      engineLeaseRenewIntervalMs: 20,
    });

    expect(summary.dispatched).toBe(1);
    expect(store.listItems('mLeaseHeartbeat')[0]!.status).toBe('done');
    const next = store.acquireEngineLease('next-engine', 30_000)!;
    expect(next.epoch).toBeGreaterThan(1);
    expect(store.releaseEngineLease(next)).toBe(true);
  });
});

describe('runV2Engine — goal-driven (Type-2)', () => {
  it('threads the approval coordinator through the goal-driven scheduler drain', async () => {
    const r = root();
    const store = openStore(r);
    createGoalMission(store, { id: 'gApprovalWire', title: 'Goal approval wire', goal: 'prove the seam' });
    const tick = vi.fn(() => ({
      parked: 0,
      published: 0,
      decided: 0,
      invalid: 0,
      changedMissionIds: [],
    }));

    await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask: async () => ({ ok: true }),
      runSprint: async () => undefined,
      approvalCoordinator: { tick },
      goalDeps: buildGoalDeps({ planner: async () => [], accepter: async () => true }),
      store,
      maxIterations: BOUNDED,
    });

    expect(tick).toHaveBeenCalled();
  });

  it('drives a goal mission end-to-end: author→item→scheduler→accept→completed', async () => {
    const r = root();
    const store = openStore(r);
    createGoalMission(store, { id: 'gW', title: 'Goal Wire', goal: 'reach it', deliverTo: 'carol' });

    // Fake planner: round-0 (no prior) authors one task item; later rounds dry.
    // Fake accepter: once the work is done → goal reached.
    const planner = vi.fn(async (_goal: string, prior: WorkItem[]): Promise<NewWorkItem[]> =>
      prior.length === 0
        ? [{ id: 'gW-step-1', missionId: 'gW', kind: 'task', spec: { description: 'goal step 1' } }]
        : []);
    const accepter = vi.fn(async () => true);

    const ran: string[] = [];
    const payloads: MissionNotifyPayload[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async (ctx: MissionTaskContext) => { ran.push(ctx.description); return { ok: true }; },
      runSprint: async () => undefined,
      notify: (p) => { payloads.push(p); },
      goalDeps: buildGoalDeps({ planner, accepter }),
      store,
      maxIterations: BOUNDED,
    };

    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    // The authored work-item ran through the scheduler exactly once.
    expect(ran).toEqual(['goal step 1']);
    expect(store.listItems('gW').map((i) => i.status)).toEqual(['done']);

    // The goal-loop (not the scheduler) settled the mission: accept → completed.
    const mission = store.getMission('gW')!;
    expect(mission.status).toBe('completed');
    expect(mission.lastResult).toEqual({ ok: true });

    // Planner consulted for the author round AND the dry round; accepter once.
    expect(planner.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(accepter).toHaveBeenCalledTimes(1);

    // Exactly ONE settle delivery for the goal mission (no spurious mid-round notify).
    const goalPayloads = payloads.filter((p) => p.to === 'carol');
    expect(goalPayloads).toHaveLength(1);
    expect(goalPayloads[0]!.status).toBe('completed');

    expect(summary.reason).toBe('drained');
  });

  it('drains without dispatch/finalize on HOLD, then resumes exactly once after restart', async () => {
    const r = root();
    let store = openStore(r);
    createGoalMission(store, { id: 'gH', title: 'Goal Hold', goal: 'wait for truth', deliverTo: 'owner' });
    const notify = vi.fn();
    const runTask = vi.fn(async () => ({ ok: true }));
    const first = await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask,
      runSprint: async () => undefined,
      notify,
      goalDeps: buildGoalDeps({
        planner: async () => { throw new GoalInvocationHeldError({
          schemaVersion: 1,
          reasonCode: 'authority_unavailable',
          evidenceRefs: ['host-role-admission:authority-unavailable'],
          invocationReceiptRef: null,
          heldAt: '2026-07-22T02:00:00.000Z',
        }); },
        accepter: async () => false,
      }),
      store,
      maxIterations: BOUNDED,
    });
    expect(first).toMatchObject({ reason: 'drained', dispatched: 0 });
    expect(runTask).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(store.getMission('gH')).toMatchObject({
      status: 'pending', completedAt: null,
      lastResult: { goalInvocationHold: { reasonCode: 'authority_unavailable' } },
    });
    store.close();

    store = openStore(r);
    const accepter = vi.fn(async () => true);
    const second = await runV2Engine(r, cfg({ engine: 'v2' }), {
      runTask,
      runSprint: async () => undefined,
      notify,
      goalDeps: buildGoalDeps({ planner: async () => [], accepter }),
      store,
      maxIterations: BOUNDED,
    });
    expect(second).toMatchObject({ reason: 'drained', dispatched: 0 });
    expect(accepter).toHaveBeenCalledTimes(1);
    expect(store.getMission('gH')!.status).toBe('completed');
    expect(store.getMission('gH')!.completedAt).not.toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('fails a goal mission when the loop exhausts (author a round, then dry + reject → failed)', async () => {
    const r = root();
    const store = openStore(r);
    createGoalMission(store, { id: 'gX', title: 'Goal Exhaust', goal: 'unreachable' });

    const planner = vi.fn(async (_goal: string, prior: WorkItem[]): Promise<NewWorkItem[]> =>
      prior.length === 0
        ? [{ id: 'gX-step-1', missionId: 'gX', kind: 'task', spec: { description: 'try once' } }]
        : []);
    const accepter = vi.fn(async () => false);

    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: true }),
      runSprint: async () => undefined,
      goalDeps: buildGoalDeps({ planner, accepter }),
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    // First round ran, then planner went dry and accepter rejected → exhausted/failed.
    expect(store.listItems('gX').map((i) => i.status)).toEqual(['done']);
    const mission = store.getMission('gX')!;
    expect(mission.status).toBe('failed');
    expect(mission.lastResult).toEqual({ ok: false, reason: 'goal not reached, no further work' });
    expect(accepter).toHaveBeenCalledTimes(1);
  });

  it('does not re-deliver a dependency-failed goal on a clean restart', async () => {
    const r = root();
    const store = openStore(r);
    createGoalMission(store, { id: 'gD', title: 'Goal Dependency', goal: 'ordered', deliverTo: 'dana' });
    enqueueProduction(store, { id: 'gD-a', missionId: 'gD', kind: 'task', spec: { description: 'a' }, dependsOn: ['gD-b'] });
    enqueueProduction(store, { id: 'gD-b', missionId: 'gD', kind: 'task', spec: { description: 'b' }, dependsOn: ['gD-a'] });

    const payloads: MissionNotifyPayload[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: true }),
      runSprint: async () => undefined,
      notify: (payload) => { payloads.push(payload); },
      goalDeps: buildGoalDeps({
        planner: async () => [],
        accepter: async () => false,
      }),
      store,
      maxIterations: BOUNDED,
    };

    await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(store.getMission('gD')!.status).toBe('failed');
    expect(payloads.filter((payload) => payload.to === 'dana')).toHaveLength(1);

    await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(payloads.filter((payload) => payload.to === 'dana')).toHaveLength(1);
  });

  it('still drives plain list missions when goalDeps is present (no regression)', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mL', kind: 'list', title: 'List', renderAs: 'checklist' });
    enqueueProduction(store, { id: 'mL-0', missionId: 'mL', kind: 'task', spec: { description: 'list work' } });

    const planner = vi.fn(async (): Promise<NewWorkItem[]> => []);
    const accepter = vi.fn(async () => false);

    const ran: string[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async (ctx: MissionTaskContext) => { ran.push(ctx.description); return { ok: true }; },
      runSprint: async () => undefined,
      goalDeps: buildGoalDeps({ planner, accepter }),
      store,
      maxIterations: BOUNDED,
    };
    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    expect(ran).toEqual(['list work']);
    expect(store.getMission('mL')!.status).toBe('completed');
    expect(summary.dispatched).toBe(1);
  });
});
