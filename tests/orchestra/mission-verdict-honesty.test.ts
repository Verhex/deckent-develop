/**
 * tests/orchestra/mission-verdict-honesty.test.ts
 *
 * Sprint-377 task 377-001 (MISSION-VERDICT-FIX) — live bug (mission-w1): a worker that
 * honestly self-assessed GO_WITH_TECH_DEBT on item 2 made the mission render as
 * "failed 1/2". `ok: selfAssessment !== 'NO_GO'` (src/cli/commands/autonomous.ts:535,
 * out of this task's write scope, unchanged since 2026-06-19) already keeps DEBT out of
 * the boolean failure path — but nothing preserved *that it was DEBT* rather than a
 * clean DONE. This suite locks in the DONE/DEBT/NO_GO three-way mapping added to
 * mission-engine-wire.ts (`deriveSettleDetail` + the `withSettleDetail` runTask wrap)
 * and proves, end-to-end through the real scheduler + a real SqliteMissionStore, that
 * an honest DEBT item settles 'done' and its mission settles 'completed' — never
 * 'failed' — while a genuine NO_GO still fails both.
 *
 * Hermetic — tmpdir SqliteMissionStore, no process spawning, bounded scheduler runs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteMissionStore } from '../../src/orchestra/autonomous/mission-store/sqlite-mission-store.js';
import {
  runV2Engine,
  deriveSettleDetail,
  type RunV2EngineDeps,
} from '../../src/orchestra/autonomous/mission-store/mission-engine-wire.js';
import type { MissionTaskContext } from '../../src/orchestra/autonomous/mission-store/mission-dispatch.js';
import type { ResultLike } from '../../src/orchestra/autonomous/mission-store/mission-types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ── tmpdir lifecycle ──────────────────────────────────────────────────
const dirs: string[] = [];
const stores: SqliteMissionStore[] = [];
function root(): string { const d = mkdtempSync(join(tmpdir(), 'mission-verdict-')); dirs.push(d); return d; }
function openStore(r: string): SqliteMissionStore {
  const s = new SqliteMissionStore(r); s.migrate(); stores.push(s); return s;
}
afterEach(() => {
  for (const s of stores.splice(0)) { try { s.close(); } catch { /* already closed */ } }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function cfg(): ResolvedConfig {
  return { activeModeConfig: { max_workers: 2 }, autonomous: { enabled: true, engine: 'v2' } } as unknown as ResolvedConfig;
}

const BOUNDED = 100;

/** Emulates the exact `ok`/`reason` formula the live composition root uses
 *  (autonomous.ts:535: `ok: res.selfAssessment !== 'NO_GO'`), plus the settleDetail a
 *  fixed composition root would add — this is the "fake-runTask" the goCriteria asks
 *  for, keyed by a raw worker selfAssessment so all three verdicts are covered. */
function fakeRunTaskFor(
  bySelfAssessment: Record<string, 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'>,
): (ctx: MissionTaskContext) => Promise<ResultLike> {
  return async (ctx) => {
    const selfAssessment = bySelfAssessment[ctx.description] ?? 'DONE';
    return {
      ok: selfAssessment !== 'NO_GO',
      reason: `worker self-assessed ${selfAssessment}`,
      settleDetail: selfAssessment === 'NO_GO' ? 'failed' : selfAssessment === 'GO_WITH_TECH_DEBT' ? 'debt' : 'done',
    };
  };
}

describe('deriveSettleDetail — DONE/DEBT/NO_GO three-way mapping', () => {
  it('a clean DONE (ok:true, no explicit settleDetail) derives "done"', () => {
    expect(deriveSettleDetail({ ok: true })).toBe('done');
  });
  it('an honest GO_WITH_TECH_DEBT (ok:true, explicit settleDetail:"debt") passes through as "debt"', () => {
    expect(deriveSettleDetail({ ok: true, settleDetail: 'debt' })).toBe('debt');
  });
  it('a NO_GO (ok:false, no explicit settleDetail) derives "failed"', () => {
    expect(deriveSettleDetail({ ok: false })).toBe('failed');
  });
  it('an explicit settleDetail is always trusted over the ok-derived fallback', () => {
    expect(deriveSettleDetail({ ok: false, settleDetail: 'failed' })).toBe('failed');
  });
});

describe('runV2Engine — honest DEBT never counts as mission failure (mission-w1 fix)', () => {
  it('a mission with one clean DONE item + one honest DEBT item settles completed, both items done', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mW1', kind: 'list', title: 'mission-w1-like', renderAs: 'checklist' });
    store.enqueueItem({ id: 'mW1-item-1', missionId: 'mW1', kind: 'task', spec: { description: 'item-1' } });
    store.enqueueItem({ id: 'mW1-item-2', missionId: 'mW1', kind: 'task', spec: { description: 'item-2' } });

    const deps: RunV2EngineDeps = {
      runTask: fakeRunTaskFor({ 'item-1': 'DONE', 'item-2': 'GO_WITH_TECH_DEBT' }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg(), deps);

    const mission = store.getMission('mW1')!;
    expect(mission.status).toBe('completed'); // NOT 'failed' — the mission-w1 bug
    expect(mission.progress).toEqual({ done: 2, total: 2 });

    const items = store.listItems('mW1');
    expect(items.every((i) => i.status === 'done')).toBe(true);

    const item2 = items.find((i) => i.id === 'mW1-item-2')!;
    expect(item2.lastResult?.ok).toBe(true);
    expect(item2.lastResult?.settleDetail).toBe('debt'); // the debt nuance survives to storage
  });

  it('a genuine NO_GO still fails both the item and the mission (no over-correction)', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mNG', kind: 'list', title: 'genuine failure', renderAs: 'checklist' });
    store.enqueueItem({ id: 'mNG-0', missionId: 'mNG', kind: 'task', spec: { description: 'boom' } });

    const deps: RunV2EngineDeps = {
      runTask: fakeRunTaskFor({ boom: 'NO_GO' }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg(), deps);

    expect(store.getMission('mNG')!.status).toBe('failed');
    const item = store.listItems('mNG')[0]!;
    expect(item.status).toBe('failed');
    expect(item.lastResult?.settleDetail).toBe('failed');
  });

  it('a mixed mission (one DONE + one genuine NO_GO) still fails overall — DEBT-honesty does not mask real failures', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mMix', kind: 'list', title: 'mixed', renderAs: 'checklist' });
    store.enqueueItem({ id: 'mMix-ok', missionId: 'mMix', kind: 'task', spec: { description: 'ok-item' } });
    store.enqueueItem({ id: 'mMix-bad', missionId: 'mMix', kind: 'task', spec: { description: 'bad-item' } });

    const deps: RunV2EngineDeps = {
      runTask: fakeRunTaskFor({ 'ok-item': 'DONE', 'bad-item': 'NO_GO' }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg(), deps);

    expect(store.getMission('mMix')!.status).toBe('failed');
  });

  it('a runTask that omits settleDetail entirely (today\'s real autonomous.ts shape) still gets a normalized fallback', async () => {
    const r = root();
    const store = openStore(r);
    store.createMission({ id: 'mLegacy', kind: 'list', title: 'legacy shape', renderAs: 'checklist' });
    store.enqueueItem({ id: 'mLegacy-0', missionId: 'mLegacy', kind: 'task', spec: { description: 'x' } });

    const deps: RunV2EngineDeps = {
      // No settleDetail on the returned ResultLike — mirrors autonomous.ts:535 today.
      runTask: async () => ({ ok: true, reason: 'plain ok' }),
      runSprint: async () => undefined,
      store,
      maxIterations: BOUNDED,
    };
    await runV2Engine(r, cfg(), deps);

    const item = store.listItems('mLegacy')[0]!;
    expect(item.lastResult?.settleDetail).toBe('done');
  });
});
