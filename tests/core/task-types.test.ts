import { describe, expect, it } from 'vitest';
import { PROVIDER_MODEL_MAP, TaskEvaluation, isCursorModel } from '../../src/core/task-types.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import {
  collectDeferredStats,
  buildDeferredSection,
} from '../../src/orchestra/sprint-reporter.js';

describe('Sprint 192 Task 192-010 — TaskEvaluation.DEFERRED + retro reporting', () => {
  it('reads Cursor models live from the registry', () => {
    const id = 'cursor-test-live-getter';
    modelRegistry.register({
      id,
      apiId: id,
      provider: 'cursor',
      tier: 'standard',
      contextWindow: 1,
      costPerMillion: { input: 0, output: 0 },
      capabilities: {},
      status: 'ga',
    });

    try {
      expect(PROVIDER_MODEL_MAP.cursor).toContain(id);
      expect(isCursorModel(id)).toBe(true);
    } finally {
      modelRegistry.unregister(id);
    }
  });

  // ─── Test 1: enum extended with DEFERRED ────────────────────────────
  it('exposes TaskEvaluation.DEFERRED alongside legacy members', () => {
    expect(TaskEvaluation.DEFERRED).toBe('DEFERRED');
    expect(TaskEvaluation.DONE).toBe('DONE');
    expect(TaskEvaluation.GO_WITH_TECH_DEBT).toBe('GO_WITH_TECH_DEBT');
    expect(TaskEvaluation.NO_GO).toBe('NO_GO');

    const values = Object.values(TaskEvaluation);
    expect(values).toContain('DEFERRED');
    expect(values.length).toBe(5); // +NOT_DISPATCHED (MOAT-3)
  });

  // ─── Test 2: retro inclusion — markdown section renders Deferred count ──
  it('renders "Deferred Tasks" section with correct count in retro markdown', () => {
    const stats = { deferred: 2 };
    const md = buildDeferredSection(stats);

    expect(md).toContain('## Deferred Tasks');
    expect(md).toContain('2 tasks');
    expect(md).toContain('dispatcher saturation');
    expect(md).toContain('no cascade');
  });

  it('renders singular form when exactly one task is deferred', () => {
    const md = buildDeferredSection({ deferred: 1 });
    expect(md).toContain('1 task ');
    expect(md).not.toContain('1 tasks');
  });

  it('always renders the section even when zero tasks are deferred', () => {
    const md = buildDeferredSection({ deferred: 0 });
    expect(md).toContain('## Deferred Tasks');
    expect(md).toContain('0 tasks');
  });

  // ─── Test 3: cascade exclusion — collectDeferredStats counts ONLY DEFERRED ─
  it('counts only DEFERRED evaluations (cascade-exclusion semantic)', () => {
    // Mirror the handleCrossDependencies filter: only NO_GO triggers cascade.
    // DEFERRED must therefore live in a distinct, non-NO_GO slot. This test
    // proves both the count and the value distinctness from NO_GO/PAUSED.
    const evaluations = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.NO_GO],
      ['t3', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['t4', TaskEvaluation.DEFERRED, TaskEvaluation.NOT_DISPATCHED],
      ['t5', TaskEvaluation.DEFERRED, TaskEvaluation.NOT_DISPATCHED],
    ]);

    const stats = collectDeferredStats(evaluations);
    expect(stats.deferred).toBe(2);

    // Cascade exclusion contract: DEFERRED is NOT NO_GO.
    expect(TaskEvaluation.DEFERRED).not.toBe(TaskEvaluation.NO_GO);
    expect(TaskEvaluation.DEFERRED).not.toBe(TaskEvaluation.DONE);
    expect(TaskEvaluation.DEFERRED).not.toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
  });

  it('returns deferred=0 when evaluation map is empty or has no DEFERRED', () => {
    expect(collectDeferredStats(new Map()).deferred).toBe(0);
    const noneDeferred = new Map<string, TaskEvaluation>([
      ['t1', TaskEvaluation.DONE],
      ['t2', TaskEvaluation.NO_GO],
    ]);
    expect(collectDeferredStats(noneDeferred).deferred).toBe(0);
  });
});
