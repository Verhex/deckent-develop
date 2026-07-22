import { describe, it, expect } from 'vitest';
import { buildMissionDispatch, type MissionDispatchDeps, type MissionTaskContext } from '../../../../src/orchestra/autonomous/mission-store/mission-dispatch.js';
import type {
  MissionDispatchClaim,
  ResultLike,
  WorkItem,
  WorkItemKind,
} from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';
import type { ResolvedConfig } from '../../../../src/core/config-types.js';

// Minimal ResolvedConfig stand-in — the dispatch only forwards it to runSprint,
// it never reads fields. Cast keeps the test free of the full 700-field shape.
const CONFIG = {} as ResolvedConfig;
const CLAIM: MissionDispatchClaim = {
  schemaVersion: 1,
  workItemId: 'm-w0',
  missionId: 'm',
  claimedBy: 'scheduler',
  claimedAt: '2026-07-22T00:00:00.000Z',
  itemRevision: 1,
  attemptId: 'attempt-1',
  fenceToken: 'token-1',
  fenceTokenHash: 'hash-1',
  claimRegistryRevision: null,
  claimRegistryDigest: null,
};

/** Build a WorkItem fixture; only id/kind/spec matter to the dispatch. */
function mkItem(kind: WorkItemKind, spec: Record<string, unknown> | null = null, id = 'm-w0'): WorkItem {
  return {
    id, missionId: 'm', kind, status: 'running', spec,
    policy: 'auto', renderAs: 'task', progress: null, dependsOn: [], trigger: null,
    claimedAt: null, claimedBy: null, revision: 0, admissionFence: null,
    claimRegistryRevision: null, claimRegistryDigest: null,
    createdAt: 't', updatedAt: 't', lastResult: null,
  };
}

/** Base deps with no-op primitives; each test overrides what it asserts on. */
function baseDeps(over: Partial<MissionDispatchDeps> = {}): MissionDispatchDeps {
  return {
    projectRoot: '/proj',
    config: CONFIG,
    runTask: async () => ({ ok: true }),
    runSprint: async () => undefined,
    ...over,
  };
}

describe('buildMissionDispatch — task', () => {
  it('routes kind=task to runTask with ctx built from spec, returns its ResultLike', async () => {
    const calls: MissionTaskContext[] = [];
    const claims: MissionDispatchClaim[] = [];
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx, claim) => {
        calls.push(ctx);
        claims.push(claim);
        return { ok: true, reason: 'task done' };
      },
    }));
    const res = await dispatch(mkItem('task', { description: 'do the thing', model: 'opus', provider: 'claude', scopeDir: 'src/x' }), CLAIM);
    expect(res).toEqual({ ok: true, reason: 'task done' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      projectRoot: '/proj',
      description: 'do the thing',
      model: 'opus',
      provider: 'claude',
      scopeDir: 'src/x',
    });
    expect(claims).toEqual([CLAIM]);
    expect(JSON.stringify(calls[0])).not.toContain(CLAIM.fenceToken);
  });

  it('falls back to item.id as description when spec has none; omits absent optional fields', async () => {
    let captured: MissionTaskContext | undefined;
    let capturedClaim: MissionDispatchClaim | undefined;
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx, claim) => { captured = ctx; capturedClaim = claim; return { ok: true }; },
    }));
    const claim = { ...CLAIM, workItemId: 'm-w7' };
    await dispatch(mkItem('task', null, 'm-w7'), claim);
    expect(captured).toEqual({ projectRoot: '/proj', description: 'm-w7' });
    expect(capturedClaim).toBe(claim);
    expect(captured).not.toHaveProperty('dispatchClaim');
    expect(captured).not.toHaveProperty('model');
    expect(captured).not.toHaveProperty('provider');
    expect(captured).not.toHaveProperty('scopeDir');
  });

  it('reports failure (never throws) when runTask itself throws', async () => {
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async () => { throw new Error('worker exploded'); },
    }));
    const res = await dispatch(mkItem('task', { description: 'x' }), CLAIM);
    expect(res).toEqual({ ok: false, reason: 'worker exploded' });
  });

  it('forwards an authored execution budget as a request-level narrowing input', async () => {
    let captured: MissionTaskContext | undefined;
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx) => { captured = ctx; return { ok: true }; },
    }));
    await dispatch(mkItem('task', {
      description: 'bounded work',
      budget: { maxTokens: 12_000, maxTurns: 2 },
    }), CLAIM);
    expect(captured?.budget).toEqual({ maxTokens: 12_000, maxTurns: 2 });
  });

  it('does not silently drop malformed budget values before the canonical validator', async () => {
    let captured: MissionTaskContext | undefined;
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx) => { captured = ctx; return { ok: false, reason: 'invalid budget' }; },
    }));
    const res = await dispatch(mkItem('task', { description: 'bad budget', budget: 'unbounded' }), CLAIM);
    expect(res).toEqual({ ok: false, reason: 'invalid budget' });
    expect(captured).toHaveProperty('budget', 'unbounded');
  });
});

describe('buildMissionDispatch — sprint', () => {
  it('returns { ok: true } when runSprint resolves, forwarding projectRoot + config', async () => {
    const args: Array<[string, ResolvedConfig]> = [];
    const dispatch = buildMissionDispatch(baseDeps({
      runSprint: async (root, cfg) => { args.push([root, cfg]); return { sprintId: 's-1' }; },
    }));
    const res = await dispatch(mkItem('sprint'), CLAIM);
    expect(res).toEqual({ ok: true, reason: 'sprint completed' });
    expect(args).toEqual([['/proj', CONFIG]]);
  });

  it('returns { ok: false } with the error message when runSprint throws', async () => {
    const dispatch = buildMissionDispatch(baseDeps({
      runSprint: async () => { throw new Error('boom'); },
    }));
    const res = await dispatch(mkItem('sprint'), CLAIM);
    expect(res).toEqual({ ok: false, reason: 'boom' });
  });
});

describe('buildMissionDispatch — capability', () => {
  it('routes kind=capability to runCapability with spec.capabilityTarget', async () => {
    const seen: unknown[] = [];
    const target = { capability: 'mail.send', args: { to: 'a@b.c' }, connector: 'graph' };
    const dispatch = buildMissionDispatch(baseDeps({
      runCapability: async (t) => { seen.push(t); return { ok: true, reason: 'mail.send fulfilled' }; },
    }));
    const res = await dispatch(mkItem('capability', { capabilityTarget: target }), CLAIM);
    expect(res).toEqual({ ok: true, reason: 'mail.send fulfilled' });
    expect(seen).toEqual([target]);
  });

  it('fails with "no capability broker" when runCapability dep is absent', async () => {
    const dispatch = buildMissionDispatch(baseDeps()); // no runCapability
    const res = await dispatch(mkItem('capability', { capabilityTarget: { capability: 'db.query' } }), CLAIM);
    expect(res).toEqual({ ok: false, reason: 'no capability broker' });
  });

  it('fails clearly when a capability item carries no capabilityTarget', async () => {
    let called = false;
    const dispatch = buildMissionDispatch(baseDeps({
      runCapability: async () => { called = true; return { ok: true }; },
    }));
    const res = await dispatch(mkItem('capability', {}), CLAIM);
    expect(res).toEqual({ ok: false, reason: 'capability item has no spec.capabilityTarget' });
    expect(called).toBe(false); // broker never invoked without a target
  });
});

describe('buildMissionDispatch — process & unknown', () => {
  it('delegates kind=process to the injected runProcess broker with the full spec (runTask untouched)', async () => {
    const seen: unknown[] = [];
    let taskCalled = false;
    const spec = { steps: [{ description: 'a' }], label: 'deploy' };
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async () => { taskCalled = true; return { ok: true }; },
      runProcess: async (s) => { seen.push(s); return { ok: true, reason: 'process broker done' }; },
    }));
    const res = await dispatch(mkItem('process', spec), CLAIM);
    expect(res).toEqual({ ok: true, reason: 'process broker done' });
    expect(seen).toEqual([spec]);
    expect(taskCalled).toBe(false); // broker owns the whole process — no per-step task dispatch
  });

  it('runs inline spec.steps[] sequentially as task-dispatches and reports ok when all pass', async () => {
    const order: string[] = [];
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx) => { order.push(ctx.description); return { ok: true }; },
    }));
    const res = await dispatch(mkItem('process', {
      steps: [{ description: 'step-one' }, { description: 'step-two' }, { description: 'step-three' }],
    }), CLAIM);
    expect(res).toEqual({ ok: true, reason: 'process completed (3 steps)' });
    expect(order).toEqual(['step-one', 'step-two', 'step-three']); // sequential, in spec order
  });

  it('stops at the first failing step (fail-stop) and never runs later steps', async () => {
    const order: string[] = [];
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx) => {
        order.push(ctx.description);
        return ctx.description === 'step-two' ? { ok: false, reason: 'boom' } : { ok: true };
      },
    }));
    const res = await dispatch(mkItem('process', {
      steps: [{ description: 'step-one' }, { description: 'step-two' }, { description: 'step-three' }],
    }), CLAIM);
    expect(res).toEqual({ ok: false, reason: 'process step 2 failed: boom' });
    expect(order).toEqual(['step-one', 'step-two']); // step-three never reached
  });

  it('fails with an explicit reason when there is no runProcess broker and no steps (no silent task-fallback)', async () => {
    let taskCalled = false;
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async () => { taskCalled = true; return { ok: true }; },
    }));
    const res = await dispatch(mkItem('process', { description: 'multi-step' }), CLAIM); // no runProcess, no steps
    expect(res).toEqual({ ok: false, reason: 'process kind requires a runProcess broker or a non-empty spec.steps[]' });
    expect(taskCalled).toBe(false); // never silently degraded to a single task
  });

  it('reports an explicit reason for an unknown (runtime-malformed) kind', async () => {
    const dispatch = buildMissionDispatch(baseDeps());
    const res: ResultLike = await dispatch(mkItem('bogus' as WorkItemKind), CLAIM);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unknown work item kind: bogus');
  });
});
