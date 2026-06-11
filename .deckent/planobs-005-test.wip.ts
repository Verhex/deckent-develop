/**
 * CLI `deckent start` — Plan Cache + start-fail notify (Sprint 280 PLANOBS-005)
 *
 * Two concerns:
 *   1. planSprintCached() cache layer (sprint-controller) — DIRECTIVES-hash +
 *      next-sprint-id guarded reuse of an already-planned (un-run) task set so
 *      `deckent start` does not re-invoke the planner on every invocation.
 *   2. start.ts forwards a sprint-start failure to the human-facing notify
 *      surface ('phase-change') and the dry-run path stays regression-free.
 *
 * Part 1 exercises the REAL planSprintCached against a tmpdir with an injected
 * planner (deps.planFn) — fully hermetic, counts planner calls directly.
 * Part 2 drives registerStart with the orchestra graph spread-mocked (real
 * exports preserved) and asserts the notify call.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks (Part 2 — registerStart) ─────────────────────────────────
// Orchestra-graph modules use importActual spreads so the REAL sprint-controller
// (imported for Part 1) keeps every named export it depends on.

vi.mock('../../src/core/config.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/config.js')>('../../src/core/config.js');
  return { ...actual, loadConfig: vi.fn(), readAuthMode: vi.fn().mockResolvedValue('subscription') };
});

vi.mock('../../src/core/provider.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/provider.js')>('../../src/core/provider.js');
  return { ...actual, bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [], defaultProvider: null }) };
});

vi.mock('../../src/core/multi-ide.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/multi-ide.js')>('../../src/core/multi-ide.js');
  return { ...actual, isSprintLocked: vi.fn(() => ({ locked: false })) };
});

vi.mock('../../src/orchestra/sprint-pid-manager.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/orchestra/sprint-pid-manager.js')>('../../src/orchestra/sprint-pid-manager.js');
  return { ...actual, detectOrphan: vi.fn(() => null), archiveOrphan: vi.fn(), listPidFiles: vi.fn(() => []) };
});

vi.mock('../../src/orchestra/tmux.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/orchestra/tmux.js')>('../../src/orchestra/tmux.js');
  return { ...actual, isSessionActive: vi.fn(() => false), setupWatchWindow: vi.fn() };
});

vi.mock('../../src/core/notify.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/notify.js')>('../../src/core/notify.js');
  return { ...actual, notify: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn(),
  readContext: vi.fn(),
  planSprint: vi.fn(),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

// Pure CLI-helper leaves — safe to fully mock (not in the orchestra graph).
vi.mock('../../src/cli/commands/doctor.js', () => ({ runDoctorChecks: vi.fn(() => ({ checks: [] })) }));
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(), printError: vi.fn(),
  formatSprintSummary: vi.fn(() => 'mock summary'), formatTable: vi.fn(() => 'mock table'),
}));
vi.mock('../../src/cli/helpers/prompt.js', () => ({ promptConfirm: vi.fn().mockResolvedValue(true) }));
vi.mock('../../src/cli/commands/quick-start.js', () => ({ prepareZeroConfig: vi.fn(), cleanupZeroConfig: vi.fn() }));
vi.mock('../../src/core/cost-config-loader.js', () => ({
  initCostConfig: vi.fn(),
  loadCostConfig: vi.fn(() => ({
    _version: '1.0', providers: {},
    cost_limits: { sprint_max_usd: 5, daily_max_usd: 50, auto_confirm_below_usd: 2 },
    update_config: { sources_priority: ['bundled'] },
  })),
}));
vi.mock('../../src/core/cost-calculator.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/cost-calculator.js')>('../../src/core/cost-calculator.js');
  return { ...actual, estimateSprintCost: vi.fn(() => ({ totalApiCostUsd: 0, withinBudget: true })), formatEstimate: vi.fn(() => 'mock estimate') };
});
vi.mock('../../src/core/cost-gate.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/cost-gate.js')>('../../src/core/cost-gate.js');
  return { ...actual, evaluateCostGate: vi.fn() };
});

// ─── Imports ─────────────────────────────────────────────────────────
import {
  planSprintCached, computeDirectivesHash, readPlanCache, writePlanCache, loadCachedSprint,
  type PlanCacheMeta,
} from '../../src/orchestra/sprint-controller.js';
import { loadConfig } from '../../src/core/config.js';
import { readContext, planSprint, runSprint } from '../../src/orchestra/brain.js';
import { notify } from '../../src/core/notify.js';
import { evaluateCostGate } from '../../src/core/cost-gate.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { registerStart } from '../../src/cli/commands/start.js';

vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: vi.fn() }));

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-plan-cache-'));
}

/** Build an injectable planner that writes task-*.json files like real planSprint. */
function makeMockPlan(sprintId: string, taskIds: string[]) {
  return vi.fn(async (root: string) => {
    const dir = join(root, '.tasks');
    mkdirSync(dir, { recursive: true });
    const tasks = taskIds.map(id => ({
      id, title: `Task ${id}`, model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', sprintId, status: 'PENDING',
    }));
    for (const t of tasks) writeFileSync(join(dir, `task-${t.id}.json`), JSON.stringify(t), 'utf-8');
    return {
      id: sprintId,
      number: parseInt(sprintId.replace('sprint-', ''), 10),
      status: 'PLANNING',
      phase: 'PLAN',
      tasks,
      workers: tasks.map(t => `w-${t.id}`),
    };
  });
}

const ctx = (directives: string): never => ({ directives } as never);
const REC = {} as never;
const CFG = {} as never;

// ═══ Part 1: planSprintCached cache layer ═══════════════════════════
describe('planSprintCached — .tasks plan cache (Sprint 280 PLANOBS-005)', () => {
  let root: string;

  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('computeDirectivesHash is stable for identical content and differs by content', () => {
    expect(computeDirectivesHash('A')).toBe(computeDirectivesHash('A'));
    expect(computeDirectivesHash('A')).not.toBe(computeDirectivesHash('B'));
  });

  it('plans fresh and writes a cache marker on the first call (single plan)', async () => {
    const planFn = makeMockPlan('sprint-001', ['001-001', '001-002']);
    const { sprint, fromCache } = await planSprintCached(root, CFG, ctx('GOALS'), REC, undefined, { planFn: planFn as never });

    expect(fromCache).toBe(false);
    expect(planFn).toHaveBeenCalledTimes(1);
    expect(sprint.id).toBe('sprint-001');

    const marker = readPlanCache(root);
    expect(marker?.directivesHash).toBe(computeDirectivesHash('GOALS'));
    expect(marker?.sprintId).toBe('sprint-001');
    expect(marker?.taskIds).toEqual(['001-001', '001-002']);
  });

  it('reuses the cached plan on a second call with unchanged DIRECTIVES (planner 0 extra calls)', async () => {
    const planFn = makeMockPlan('sprint-001', ['001-001']);
    const first = await planSprintCached(root, CFG, ctx('SAME'), REC, undefined, { planFn: planFn as never });
    const second = await planSprintCached(root, CFG, ctx('SAME'), REC, undefined, { planFn: planFn as never });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    // Cache hit ⇒ the planner ran exactly once across both invocations.
    expect(planFn).toHaveBeenCalledTimes(1);
    expect(second.sprint.id).toBe('sprint-001');
    expect(second.sprint.tasks.map(t => t.id)).toEqual(['001-001']);
  });

  it('re-plans when the DIRECTIVES content changes (hash mismatch)', async () => {
    const planFn = makeMockPlan('sprint-001', ['001-001']);
    await planSprintCached(root, CFG, ctx('VERSION-A'), REC, undefined, { planFn: planFn as never });
    const second = await planSprintCached(root, CFG, ctx('VERSION-B'), REC, undefined, { planFn: planFn as never });

    expect(second.fromCache).toBe(false);
    expect(planFn).toHaveBeenCalledTimes(2);
  });

  it('re-plans when the cached sprint has already executed (next sprint id advanced)', async () => {
    const planFn = makeMockPlan('sprint-001', ['001-001']);
    await planSprintCached(root, CFG, ctx('SAME'), REC, undefined, { planFn: planFn as never });

    // Simulate a completed sprint: last_sprint_id bumps → next id becomes sprint-002.
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ last_sprint_id: 'sprint-001' }), 'utf-8');

    const second = await planSprintCached(root, CFG, ctx('SAME'), REC, undefined, { planFn: planFn as never });
    expect(second.fromCache).toBe(false);
    expect(planFn).toHaveBeenCalledTimes(2);
  });

  it('re-plans when a cached task file is missing (stale-task guard)', async () => {
    const planFn = makeMockPlan('sprint-001', ['001-001', '001-002']);
    await planSprintCached(root, CFG, ctx('SAME'), REC, undefined, { planFn: planFn as never });

    unlinkSync(join(root, '.tasks', 'task-001-002.json')); // drop one task file

    const second = await planSprintCached(root, CFG, ctx('SAME'), REC, undefined, { planFn: planFn as never });
    expect(second.fromCache).toBe(false);
    expect(planFn).toHaveBeenCalledTimes(2);
  });

  it('loadCachedSprint returns null when the cache references a missing task file', () => {
    const meta: PlanCacheMeta = { directivesHash: 'x', sprintId: 'sprint-001', taskIds: ['nope'], cachedAt: 'now' };
    expect(loadCachedSprint(root, meta)).toBeNull();
  });

  it('writePlanCache is fail-safe and never throws on an unwritable path', () => {
    expect(() => writePlanCache('/proc/nonexistent/deckent-root', {
      directivesHash: 'x', sprintId: 'sprint-001', taskIds: [], cachedAt: 'now',
    })).not.toThrow();
  });
});

// ═══ Part 2: start.ts — fail notify + dry-run regression ════════════
describe('cli start — fail notify + dry-run (Sprint 280 PLANOBS-005)', () => {
  let root: string;

  const mockSprint = {
    id: 'sprint-001', number: 1,
    tasks: [{ id: '001-001', title: 'mock', model: 'opus', effort: 'high', priority: 'NORMAL', estimatedTokens: 2700 }],
  };

  async function runStart(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerStart(program);
    try {
      await program.parseAsync(['node', 'test', ...args]);
    } catch { /* commander exitOverride */ }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    root = makeTmpRoot();
    vi.mocked(resolveProjectRoot).mockReturnValue(root);
    vi.mocked(loadConfig).mockResolvedValue({
      activeModeConfig: { brain_model: 'opus', max_workers: 3 }, brain_planning: 'auto', language: 'en',
    } as never);
    vi.mocked(readContext).mockReturnValue({ directives: 'GOALS', memory: '', retro: '', debt: '', patterns: [] } as never);
    vi.mocked(planSprint).mockResolvedValue(mockSprint as never);
    vi.mocked(evaluateCostGate).mockReturnValue({
      ok: true,
      estimate: { costRealistic: 0.5, withinBudget: true } as never,
      autoConfirm: true, autoConfirmThresholdUsd: 2, overrideApplied: false,
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  it('forwards a sprint-start failure to the human-facing notify surface (phase-change)', async () => {
    vi.mocked(runSprint).mockRejectedValue(new Error('docker spawn exploded'));

    await runStart(['start']);

    expect(process.exitCode).toBe(1);
    expect(vi.mocked(notify)).toHaveBeenCalledTimes(1);
    const [event, , , summary] = vi.mocked(notify).mock.calls[0]!;
    expect(event).toBe('phase-change');
    expect(String(summary)).toContain('docker spawn exploded');
  });

  it('does NOT notify on a successful sprint (additive — no behavior change on the happy path)', async () => {
    vi.mocked(runSprint).mockResolvedValue({ ...mockSprint, metrics: undefined } as never);

    await runStart(['start']);

    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it('dry-run plans once and never spawns workers (regression-free)', async () => {
    await runStart(['start', '--dry-run']);

    expect(vi.mocked(planSprint)).toHaveBeenCalledTimes(1); // single plan via the cache helper
    expect(vi.mocked(runSprint)).not.toHaveBeenCalled();
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
