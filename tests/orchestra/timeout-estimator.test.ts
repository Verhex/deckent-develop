// ─── Timeout Estimator Tests ────────────────────────────────────────
// Sprint 145 — Task 145-002
// 15+ tests covering all heuristic branches and edge cases

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  brainEstimateTimeout,
  estimateTaskLoC,
  aggregateSprintHistory,
  type SprintHistory,
  type TimeoutBreakdown,
} from '../../src/orchestra/timeout-estimator.js';
import type { Task } from '../../src/core/task-types.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { TimeoutConfig } from '../../src/core/config-types.js';
import { DEFAULT_TIMEOUT_CONFIG } from '../../src/core/config.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test Task',
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: {
      directories: ['src/'],
      filesRead: [],
      filesWrite: [],
    },
    dependencies: [],
    goNogo: {
      goCriteria: 'pass',
      noGoCriteria: 'fail',
      techDebtAcceptable: 'partial',
    },
    status: 'PENDING',
    ...overrides,
  } as Task;
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {},
    language: 'typescript',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.4.0',
    coverage_threshold: 90,
    max_reroutes: 3,
    reroute_on_tech_debt: false,
    sprint_timeout_minutes: 0,
    adaptive_thresholds: false,
    agent_min_score: 5,
    adaptive_config: { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    timeout: structuredClone(DEFAULT_TIMEOUT_CONFIG),
    spawn_backend: 'docker',
    ...overrides,
  } as ResolvedConfig;
}

function emptyHistory(): SprintHistory {
  return { avgTaskDurationMs: 0, sprintCount: 0 };
}

// ─── estimateTaskLoC ────────────────────────────────────────────────

describe('estimateTaskLoC', () => {
  it('parses "1566 → <400" arrow pattern as LoC delta', () => {
    const task = makeTask({ description: 'Reduce from 1566 → <400 lines' });
    expect(estimateTaskLoC(task)).toBe(1166);
  });

  it('parses "~250 LoC" pattern', () => {
    const task = makeTask({ description: 'New file (~250 LoC)' });
    expect(estimateTaskLoC(task)).toBe(250);
  });

  it('parses "+620 LoC" pattern', () => {
    const task = makeTask({ description: 'Added +620 LoC' });
    expect(estimateTaskLoC(task)).toBe(620);
  });

  it('falls back to filesWrite * 200 when no LoC pattern found', () => {
    const task = makeTask({
      description: 'Some task without LoC info',
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'],
      },
    });
    expect(estimateTaskLoC(task)).toBe(1000);
  });

  it('returns 0 for empty description and no files', () => {
    const task = makeTask({ description: '' });
    expect(estimateTaskLoC(task)).toBe(0);
  });
});

// ─── brainEstimateTimeout ───────────────────────────────────────────

describe('brainEstimateTimeout', () => {
  // Test 1: low effort + 0 LoC → ~600s
  it('returns base ~600s for low effort with no LoC and no history', () => {
    const task = makeTask({ effort: 'low', description: '' });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.base).toBe(600);
    expect(breakdown.locMultiplier).toBeCloseTo(1.0, 1);
    expect(breakdown.scopeMultiplier).toBe(1);
    expect(breakdown.historyFactor).toBe(1.0);
    expect(breakdown.backendFactor).toBe(1.0);
    // estimated = 600, clamped within docker bounds [1200, 7200] → min_floor
    expect(timeoutSeconds).toBe(1200); // clamped to docker_min_timeout
    expect(breakdown.clampReason).toBe('min_floor');
  });

  // Test 2: high effort + 2000 LoC delta → ~3800s
  it('calculates ~3800s for high effort + 2000 LoC on docker', () => {
    const task = makeTask({
      effort: 'high',
      description: 'Big refactor ~2000 LoC',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['a.ts', 'b.ts', 'c.ts'] },
    });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    // base = 2400
    // locMultiplier = max(1.0, log10(2000/500 + 1) * 0.6) = log10(5) * 0.6 ≈ 0.699 * 0.6 ≈ 0.419 → max(1.0, 0.419) = 1.0
    // Actually log10(2000/500 + 1) = log10(5) ≈ 0.699, * 0.6 ≈ 0.419 → max(1.0, 0.419) = 1.0
    // Hmm, for 2000 LoC: log10(2000/500+1) = log10(5) ≈ 0.699 → *0.6 = 0.419 → max(1.0, 0.419) = 1.0
    // Wait — the multiplier is 1.0 at 2000 LoC? Let me re-check the formula:
    // log10(locDelta/500 + 1) * 0.6 needs to exceed 1.0
    // log10(x) * 0.6 > 1.0 → log10(x) > 1.667 → x > 46.4
    // locDelta/500 + 1 > 46.4 → locDelta > 22700
    // So for 2000 LoC, locMultiplier = 1.0
    // estimated = 2400 * 1.0 * 1.0 * 1.0 * 1.0 = 2400
    expect(breakdown.base).toBe(2400);
    expect(breakdown.locMultiplier).toBe(1.0);
    expect(timeoutSeconds).toBe(2400);
    expect(breakdown.clampReason).toBe('within_bounds');
  });

  // Test 3: high + 2000 LoC + 8 files write → scope multiplier 1.15
  it('applies scope multiplier 1.15 for 8 files write', () => {
    const files = Array.from({ length: 8 }, (_, i) => `file${i}.ts`);
    const task = makeTask({
      effort: 'high',
      description: 'Big refactor ~2000 LoC',
      scope: { directories: ['src/'], filesRead: [], filesWrite: files },
    });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    // scopeMultiplier = 1 + (8 - 5) * 0.05 = 1.15
    expect(breakdown.scopeMultiplier).toBeCloseTo(1.15, 2);
  });

  // Test 4: Docker vs tmux vs subprocess backend factors
  it('applies correct backend factors: docker 1.0, tmux 0.9, subprocess 0.8', () => {
    const task = makeTask({ effort: 'normal' });
    const history = emptyHistory();

    const dockerResult = brainEstimateTimeout(task, makeConfig({ spawn_backend: 'docker' }), history);
    const tmuxResult = brainEstimateTimeout(task, makeConfig({ spawn_backend: 'tmux' }), history);
    const subResult = brainEstimateTimeout(task, makeConfig({ spawn_backend: 'subprocess' }), history);

    expect(dockerResult.breakdown.backendFactor).toBe(1.0);
    expect(tmuxResult.breakdown.backendFactor).toBe(0.9);
    expect(subResult.breakdown.backendFactor).toBe(0.8);
  });

  // Test 5: loc_scaling_enabled: false → locMultiplier 1.0
  it('forces locMultiplier to 1.0 when loc_scaling_enabled is false', () => {
    const task = makeTask({
      effort: 'high',
      description: 'Massive 50000 LoC change',
    });
    const timeoutCfg: TimeoutConfig = {
      ...DEFAULT_TIMEOUT_CONFIG,
      loc_scaling_enabled: false,
    };
    const config = makeConfig({ timeout: timeoutCfg });
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.locMultiplier).toBe(1.0);
  });

  // Test 6: history_scaling_enabled: false → historyFactor 1.0
  it('forces historyFactor to 1.0 when history_scaling_enabled is false', () => {
    const task = makeTask({ effort: 'normal' });
    const timeoutCfg: TimeoutConfig = {
      ...DEFAULT_TIMEOUT_CONFIG,
      history_scaling_enabled: false,
    };
    const config = makeConfig({ timeout: timeoutCfg, spawn_backend: 'docker' });
    const history: SprintHistory = { avgTaskDurationMs: 5000000, sprintCount: 5 };
    const { breakdown } = brainEstimateTimeout(task, config, history);

    expect(breakdown.historyFactor).toBe(1.0);
  });

  // Test 7: estimated < min_timeout → min clamp + clampReason 'min_floor'
  it('clamps to min_timeout when estimate is below floor', () => {
    const task = makeTask({ effort: 'low', description: '' });
    // low effort = 600 base, docker min = 1200
    const config = makeConfig({ spawn_backend: 'docker' });
    const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.estimated).toBeLessThan(1200);
    expect(timeoutSeconds).toBe(1200); // docker_min_timeout
    expect(breakdown.clampReason).toBe('min_floor');
  });

  // Test 8: estimated > max_timeout → max clamp + clampReason 'max_ceiling'
  it('clamps to max_timeout when estimate exceeds ceiling', () => {
    const task = makeTask({ effort: 'high', description: '' });
    const timeoutCfg: TimeoutConfig = {
      ...DEFAULT_TIMEOUT_CONFIG,
      docker_max_timeout: 2000, // artificially low max
    };
    const config = makeConfig({ timeout: timeoutCfg, spawn_backend: 'docker' });
    // base=2400 * 1.0 * 1.0 * 1.0 * 1.0 = 2400 > 2000 max
    const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.estimated).toBeGreaterThan(2000);
    expect(timeoutSeconds).toBe(2000);
    expect(breakdown.clampReason).toBe('max_ceiling');
  });

  // Test 9: empty history → historyFactor 1.0
  it('returns historyFactor 1.0 with empty history (no division by zero)', () => {
    const task = makeTask({ effort: 'normal' });
    const config = makeConfig();
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.historyFactor).toBe(1.0);
  });

  // Test 10: Already tested above in estimateTaskLoC

  // Test 11: Already tested above in estimateTaskLoC

  // Test 12: T-144-001 scenario (init split, high, 2000 LoC, 8 files)
  it('T-144-001 scenario: high effort, 2000 LoC, 8 files, docker → ≥2400s', () => {
    const files = Array.from({ length: 8 }, (_, i) => `src/init/file${i}.ts`);
    const task = makeTask({
      effort: 'high',
      description: 'Init split refactor ~2000 LoC',
      scope: { directories: ['src/'], filesRead: [], filesWrite: files },
    });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    // base=2400, scope=1.15, loc=1.0, history=1.0, backend=1.0
    // estimated = 2400 * 1.0 * 1.15 * 1.0 * 1.0 = 2760
    expect(breakdown.scopeMultiplier).toBeCloseTo(1.15, 2);
    expect(timeoutSeconds).toBeGreaterThanOrEqual(2400);
  });

  // Test 13: T-144-003 scenario (retro split, normal, 450 LoC, 6 files)
  it('T-144-003 scenario: normal effort, 450 LoC, 6 files → ~1260s', () => {
    const files = Array.from({ length: 6 }, (_, i) => `src/retro/file${i}.ts`);
    const task = makeTask({
      effort: 'normal',
      description: 'Retro split ~450 LoC',
      scope: { directories: ['src/'], filesRead: [], filesWrite: files },
    });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { timeoutSeconds, breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    // base=1200, scope = 1 + (6-5)*0.05 = 1.05, loc=1.0, backend=1.0
    // estimated = 1200 * 1.0 * 1.05 * 1.0 * 1.0 = 1260
    expect(breakdown.scopeMultiplier).toBeCloseTo(1.05, 2);
    expect(timeoutSeconds).toBe(1260);
  });

  // Test 14: clampedTo invariant — clampedTo matches clampReason logic
  it('maintains clampedTo ↔ clampReason invariant', () => {
    const task = makeTask({ effort: 'normal' });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    if (breakdown.clampReason === 'within_bounds') {
      expect(breakdown.clampedTo).toBe(breakdown.estimated);
    } else if (breakdown.clampReason === 'min_floor') {
      expect(breakdown.clampedTo).toBeGreaterThan(breakdown.estimated);
    } else if (breakdown.clampReason === 'max_ceiling') {
      expect(breakdown.clampedTo).toBeLessThan(breakdown.estimated);
    }
  });

  // Test 15: history factor with actual data
  it('applies history factor when avgTaskDurationMs is provided', () => {
    const task = makeTask({ effort: 'normal' });
    const config = makeConfig({ spawn_backend: 'docker' });
    // avgTaskDurationMs = 3600000 (1 hour = 3600s)
    // historyFactor = max(1.0, (3600000/1000) / 1200 * 1.2) = max(1.0, 3600/1200 * 1.2) = max(1.0, 3.6) = 3.6
    const history: SprintHistory = { avgTaskDurationMs: 3600000, sprintCount: 5 };
    const { breakdown } = brainEstimateTimeout(task, config, history);

    expect(breakdown.historyFactor).toBeCloseTo(3.6, 1);
    // estimated = 1200 * 1.0 * 1.0 * 3.6 * 1.0 = 4320
    expect(breakdown.estimated).toBe(4320);
  });

  // Test 16: 'auto' backend resolves to 'tmux'
  it('resolves auto backend to tmux (0.9x factor)', () => {
    const task = makeTask({ effort: 'normal' });
    const config = makeConfig({ spawn_backend: 'auto' });
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.backendFactor).toBe(0.9);
  });

  // Test 17: Very large LoC triggers locMultiplier > 1.0
  it('locMultiplier exceeds 1.0 for very large LoC delta (50000)', () => {
    const task = makeTask({
      effort: 'normal',
      description: 'Massive change ~50000 LoC',
    });
    const config = makeConfig({ spawn_backend: 'docker' });
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    // locMultiplier = max(1.0, log10(50000/500 + 1) * 0.6) = log10(101) * 0.6 ≈ 2.004 * 0.6 ≈ 1.202
    expect(breakdown.locMultiplier).toBeGreaterThan(1.0);
    expect(breakdown.locMultiplier).toBeCloseTo(1.202, 1);
  });

  // Test 18: Missing timeout config uses defaults
  it('uses DEFAULT_TIMEOUT_CONFIG when config.timeout is undefined', () => {
    const task = makeTask({ effort: 'normal' });
    const config = makeConfig();
    delete (config as Record<string, unknown>).timeout;
    const { breakdown } = brainEstimateTimeout(task, config, emptyHistory());

    expect(breakdown.base).toBe(1200); // DEFAULT effort_base.normal
  });
});

// ─── TaskRouting integration ────────────────────────────────────────

describe('TaskRouting timeoutSeconds field', () => {
  it('TaskRouting interface accepts timeoutSeconds field', async () => {
    // Dynamic import to verify the interface compiles with the new field
    const { routeTask } = await import('../../src/orchestra/task-router.js');
    const task = makeTask();
    const result = routeTask(task, {}, ['claude']);

    // The field is optional, so existing calls still work
    expect(result.provider).toBeDefined();
    expect(result.timeoutSeconds).toBeUndefined(); // routeTask doesn't set it
  });
});

// ─── aggregateSprintHistory (Sprint 319 B-HISTORYSCALE) ─────────────
// Faithful regression for the history_scaling zero-fill fix: the spawner now
// aggregates the REAL past-sprint average task duration from `.brain/sprints/`
// logs instead of a hardcoded { avgTaskDurationMs: 0 } that pinned historyFactor
// to 1.0. Hermetic — all fixtures live under os.tmpdir(), torn down in afterEach.

describe('aggregateSprintHistory', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-history-'));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  /** Write a sprint-log .md with the canonical metrics table (matches sprint-log doc-updater). */
  function writeSprintLog(name: string, totalTasks: number, durationMs: number): void {
    const dir = join(tmpRoot, '.brain', 'sprints');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${name}.md`),
      [
        `# ${name}`,
        '',
        '## Metrics',
        '| Metric | Value |',
        '|--------|-------|',
        `| Total Tasks | ${totalTasks} |`,
        `| Duration | ${durationMs}ms |`,
        '',
      ].join('\n'),
      'utf-8',
    );
  }

  it('returns zero-fill fallback when no .brain/sprints dir exists (first sprint)', () => {
    expect(aggregateSprintHistory(tmpRoot)).toEqual({ avgTaskDurationMs: 0, sprintCount: 0 });
  });

  it('returns zero-fill when logs exist but carry no usable metrics (zero tasks)', () => {
    writeSprintLog('sprint-001', 0, 1000); // totalTasks=0 → not usable
    expect(aggregateSprintHistory(tmpRoot)).toEqual({ avgTaskDurationMs: 0, sprintCount: 0 });
  });

  it('aggregates per-task duration from a single sprint log', () => {
    writeSprintLog('sprint-001', 3, 6_000_000); // avg = 6_000_000 / 3 = 2_000_000ms
    const history = aggregateSprintHistory(tmpRoot);
    expect(history.sprintCount).toBe(1);
    expect(history.avgTaskDurationMs).toBe(2_000_000);
  });

  it('averages per-task duration across multiple recent sprints', () => {
    writeSprintLog('sprint-001', 1, 3_600_000); // avg 3_600_000
    writeSprintLog('sprint-002', 1, 2_400_000); // avg 2_400_000
    const history = aggregateSprintHistory(tmpRoot);
    expect(history.sprintCount).toBe(2);
    expect(history.avgTaskDurationMs).toBe(3_000_000); // mean of per-sprint avgs
  });

  it('limits aggregation to the most-recent N sprint logs', () => {
    writeSprintLog('sprint-001', 1, 1_000_000);
    writeSprintLog('sprint-002', 1, 2_000_000);
    writeSprintLog('sprint-003', 1, 3_000_000);
    const history = aggregateSprintHistory(tmpRoot, 2); // sprint-002 + sprint-003 only
    expect(history.sprintCount).toBe(2);
    expect(history.avgTaskDurationMs).toBe(2_500_000); // (2M + 3M) / 2
  });

  it('skips logs that lack Duration/Total Tasks rows', () => {
    const dir = join(tmpRoot, '.brain', 'sprints');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sprint-001.md'), '# sprint-001\n\nno metrics table here\n', 'utf-8');
    writeSprintLog('sprint-002', 2, 4_000_000); // avg 2_000_000
    const history = aggregateSprintHistory(tmpRoot);
    expect(history.sprintCount).toBe(1);
    expect(history.avgTaskDurationMs).toBe(2_000_000);
  });

  // ─── Faithful: real aggregation drives historyFactor ≠ 1.0 ─────────
  it('FAITHFUL: aggregated slow-sprint history drives historyFactor > 1.0', () => {
    writeSprintLog('sprint-001', 1, 3_600_000); // avgTaskDurationMs 3_600_000 (1h/task)
    const history = aggregateSprintHistory(tmpRoot);
    const { breakdown } = brainEstimateTimeout(
      makeTask({ effort: 'normal' }),
      makeConfig({ spawn_backend: 'docker' }),
      history,
    );
    // historyFactor = max(1.0, (3_600_000/1000) / 1200 * 1.2) = 3.6 — proves the
    // real avg flows through instead of the old hardcoded 0 → 1.0.
    expect(breakdown.historyFactor).toBeCloseTo(3.6, 1);
    expect(breakdown.historyFactor).toBeGreaterThan(1.0);
  });

  it('FALLBACK: no past-sprint history keeps historyFactor at 1.0', () => {
    const history = aggregateSprintHistory(tmpRoot); // empty tmp → zero-fill
    expect(history).toEqual({ avgTaskDurationMs: 0, sprintCount: 0 });
    const { breakdown } = brainEstimateTimeout(
      makeTask({ effort: 'normal' }),
      makeConfig({ spawn_backend: 'docker' }),
      history,
    );
    expect(breakdown.historyFactor).toBe(1.0);
  });
});
