import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  isV2Engine,
  runV2Engine,
  type RunV2EngineDeps,
} from '../../../../src/orchestra/autonomous/mission-store/mission-engine-wire.js';
import type { MissionTaskContext } from '../../../../src/orchestra/autonomous/mission-store/mission-dispatch.js';
import type { MissionNotifyPayload } from '../../../../src/orchestra/autonomous/mission-store/mission-deliver.js';
import type { ResolvedConfig } from '../../../../src/core/config-types.js';

// ── tmpdir lifecycle ──────────────────────────────────────────────────
const dirs: string[] = [];
const stores: SqliteMissionStore[] = [];
function root(): string { const d = mkdtempSync(join(tmpdir(), 'wire-')); dirs.push(d); return d; }
function openStore(r: string): SqliteMissionStore {
  const s = new SqliteMissionStore(r); s.migrate(); stores.push(s); return s;
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
  it('opens+migrates the store and drives a list-mission to completion via injected runTask', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'm1', kind: 'list', title: 'List', renderAs: 'checklist' });
    store.enqueueItem({ id: 'm1-0', missionId: 'm1', kind: 'task', spec: { description: 'do 0' } });
    store.enqueueItem({ id: 'm1-1', missionId: 'm1', kind: 'task', spec: { description: 'do 1' } });

    const seen: string[] = [];
    const deps: RunV2EngineDeps = {
      runTask: async (ctx: MissionTaskContext) => { seen.push(ctx.description); return { ok: true }; },
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };

    const summary = await runV2Engine(r, cfg({ engine: 'v2' }), deps);

    // fake dispatch ran both items, the mission settled completed.
    expect(seen.sort()).toEqual(['do 0', 'do 1']);
    expect(summary.dispatched).toBe(2);
    expect(store.getMission('m1')!.status).toBe('completed');
    expect(store.listItems('m1').every((i) => i.status === 'done')).toBe(true);
  });

  it('marks a mission failed when an injected runTask reports ok:false', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mF', kind: 'list', title: 'Fail', renderAs: 'checklist' });
    store.enqueueItem({ id: 'mF-0', missionId: 'mF', kind: 'task', spec: { description: 'boom' } });

    const deps: RunV2EngineDeps = {
      runTask: async () => ({ ok: false, reason: 'nope' }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg({ engine: 'v2' }), deps);
    expect(store.getMission('mF')!.status).toBe('failed');
  });

  it('dispatches a sprint work-item through the injected runSprint (ok on resolve)', async () => {
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

    expect(sprintCalls).toBe(1);
    expect(store.getMission('mS')!.status).toBe('completed');
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

  it('fires the settle-delivery notify when a mission settles', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mN', kind: 'list', title: 'Notify', renderAs: 'checklist', deliverTo: 'alice' });
    store.enqueueItem({ id: 'mN-0', missionId: 'mN', kind: 'task', spec: { description: 'x' } });

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
    seed.enqueueItem({ id: 'mOwn-0', missionId: 'mOwn', kind: 'task', spec: { description: 'own' } });
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
});
