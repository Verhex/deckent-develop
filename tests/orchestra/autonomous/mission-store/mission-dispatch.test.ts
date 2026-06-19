import { describe, it, expect } from 'vitest';
import { buildMissionDispatch, type MissionDispatchDeps, type MissionTaskContext } from '../../../../src/orchestra/autonomous/mission-store/mission-dispatch.js';
import type { ResultLike, WorkItem, WorkItemKind } from '../../../../src/orchestra/autonomous/mission-store/mission-types.js';
import type { ResolvedConfig } from '../../../../src/core/config-types.js';

// Minimal ResolvedConfig stand-in — the dispatch only forwards it to runSprint,
// it never reads fields. Cast keeps the test free of the full 700-field shape.
const CONFIG = {} as ResolvedConfig;

/** Build a WorkItem fixture; only id/kind/spec matter to the dispatch. */
function mkItem(kind: WorkItemKind, spec: Record<string, unknown> | null = null, id = 'm-w0'): WorkItem {
  return {
    id, missionId: 'm', kind, status: 'running', spec,
    policy: 'auto', renderAs: 'task', progress: null, dependsOn: [], trigger: null,
    claimedAt: null, claimedBy: null, createdAt: 't', updatedAt: 't', lastResult: null,
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
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx) => { calls.push(ctx); return { ok: true, reason: 'task done' }; },
    }));
    const res = await dispatch(mkItem('task', { description: 'do the thing', model: 'opus', provider: 'claude', scopeDir: 'src/x' }));
    expect(res).toEqual({ ok: true, reason: 'task done' });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ projectRoot: '/proj', description: 'do the thing', model: 'opus', provider: 'claude', scopeDir: 'src/x' });
  });

  it('falls back to item.id as description when spec has none; omits absent optional fields', async () => {
    let captured: MissionTaskContext | undefined;
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async (ctx) => { captured = ctx; return { ok: true }; },
    }));
    await dispatch(mkItem('task', null, 'm-w7'));
    expect(captured).toEqual({ projectRoot: '/proj', description: 'm-w7' });
    expect(captured).not.toHaveProperty('model');
    expect(captured).not.toHaveProperty('provider');
    expect(captured).not.toHaveProperty('scopeDir');
  });

  it('reports failure (never throws) when runTask itself throws', async () => {
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async () => { throw new Error('worker exploded'); },
    }));
    const res = await dispatch(mkItem('task', { description: 'x' }));
    expect(res).toEqual({ ok: false, reason: 'worker exploded' });
  });
});

describe('buildMissionDispatch — sprint', () => {
  it('returns { ok: true } when runSprint resolves, forwarding projectRoot + config', async () => {
    const args: Array<[string, ResolvedConfig]> = [];
    const dispatch = buildMissionDispatch(baseDeps({
      runSprint: async (root, cfg) => { args.push([root, cfg]); return { sprintId: 's-1' }; },
    }));
    const res = await dispatch(mkItem('sprint'));
    expect(res).toEqual({ ok: true, reason: 'sprint completed' });
    expect(args).toEqual([['/proj', CONFIG]]);
  });

  it('returns { ok: false } with the error message when runSprint throws', async () => {
    const dispatch = buildMissionDispatch(baseDeps({
      runSprint: async () => { throw new Error('boom'); },
    }));
    const res = await dispatch(mkItem('sprint'));
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
    const res = await dispatch(mkItem('capability', { capabilityTarget: target }));
    expect(res).toEqual({ ok: true, reason: 'mail.send fulfilled' });
    expect(seen).toEqual([target]);
  });

  it('fails with "no capability broker" when runCapability dep is absent', async () => {
    const dispatch = buildMissionDispatch(baseDeps()); // no runCapability
    const res = await dispatch(mkItem('capability', { capabilityTarget: { capability: 'db.query' } }));
    expect(res).toEqual({ ok: false, reason: 'no capability broker' });
  });

  it('fails clearly when a capability item carries no capabilityTarget', async () => {
    let called = false;
    const dispatch = buildMissionDispatch(baseDeps({
      runCapability: async () => { called = true; return { ok: true }; },
    }));
    const res = await dispatch(mkItem('capability', {}));
    expect(res).toEqual({ ok: false, reason: 'capability item has no spec.capabilityTarget' });
    expect(called).toBe(false); // broker never invoked without a target
  });
});

describe('buildMissionDispatch — process & unknown', () => {
  it('flags process kind explicitly as not-yet-wired (no silent task-fallback)', async () => {
    let taskCalled = false;
    const dispatch = buildMissionDispatch(baseDeps({
      runTask: async () => { taskCalled = true; return { ok: true }; },
    }));
    const res = await dispatch(mkItem('process', { description: 'multi-step' }));
    expect(res).toEqual({ ok: false, reason: 'process kind not yet wired' });
    expect(taskCalled).toBe(false);
  });

  it('reports an explicit reason for an unknown (runtime-malformed) kind', async () => {
    const dispatch = buildMissionDispatch(baseDeps());
    const res: ResultLike = await dispatch(mkItem('bogus' as WorkItemKind));
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unknown work item kind: bogus');
  });
});
