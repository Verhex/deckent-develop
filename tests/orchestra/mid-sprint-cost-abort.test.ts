/**
 * tests/orchestra/mid-sprint-cost-abort.test.ts — Sprint 279 WK-cost
 *
 * Hermetic tests for checkMidSprintCostGuard and createCostGuardMonitor.
 * All I/O is injectable — no real ledger reads, no real network.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ResolvedConfig } from '../../src/core/types.js';

// ─── Mocks — must be hoisted before any imports from sprint-phases ──

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readdirSync: vi.fn(() => [] as string[]),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => ''),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  statSync: vi.fn(),
  unlinkSync: vi.fn(),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0, mtimeMs: 0 })),
  },
}));

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(() => null),
  debugLog: vi.fn(),
  parseDebtTable: vi.fn(() => []),
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn(async () => undefined),
}));

vi.mock('../../src/core/constants.js', () => ({
  BRAIN_DIR: '.brain',
  TASKS_DIR: '.tasks',
  DEBT_FILE: 'DEBT.md',
  DECKENT_VERSION: '0.0.0-test',
  DECKENT_DIR: '.deckent',
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
}));

const capturedEvents: { channel: string; payload: unknown }[] = [];

vi.mock('../../src/orchestra/event-stream.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/event-stream.js')>();
  return {
    ...actual,
    writeEvent: vi.fn((
      _root: string, _sprint: string, _src: string, _tgt: string,
      channel: string, payload: unknown,
    ) => {
      capturedEvents.push({ channel, payload });
    }),
    getCurrentSprintId: vi.fn(() => 'sprint-279'),
    readSequence: vi.fn(() => 0),
  };
});

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {},
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(),
  buildSpawnRetryHint: vi.fn(() => ''),
  waitForResults: vi.fn(async () => []),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn(() => setInterval(() => {}, 999_999)),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: () => [] })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: () => [] })),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn(() => ({})),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn(() => ({ enabled: false })),
  runPreSprintValidation: vi.fn(),
  parseTscErrorFiles: vi.fn(() => []),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn(() => ''),
}));

vi.mock('../../src/orchestra/result-evaluator.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/result-evaluator.js')>();
  return {
    ...actual,
    evaluateWithRubric: vi.fn(),
    enforceHonestResultGate: vi.fn((r: unknown) => r),
    writeHonestSentinelResult: vi.fn(),
    isStubResult: vi.fn(() => false),
    classifyExitWithoutResult: vi.fn(() => ({ kind: 'clean-exit' })),
    buildVerifyAndCompleteGuidance: vi.fn(() => ''),
  };
});

vi.mock('../../src/orchestra/rubric-registry.js', () => ({
  coverageOptional: vi.fn(() => false),
  detectTaskType: vi.fn(() => 'code-development'),
  getRubric: vi.fn(() => null),
}));

vi.mock('../../src/orchestra/sprint-spawner.js', () => ({
  applyCascadeToSprint: vi.fn(),
  applyUnblockToSprint: vi.fn(),
}));

vi.mock('../../src/orchestra/worker-liveness.js', () => ({
  checkWorkerLiveness: vi.fn(() => ({ alive: true })),
}));

vi.mock('../../src/orchestra/disk-verify.js', () => ({
  verifyDiskAgainstClaim: vi.fn(() => ({ hasDiskEvidence: false, linesAdded: 0, untrackedFiles: [] })),
  DISK_VS_CLAIM_MISMATCH_CHANNEL: 'DISK_VS_CLAIM_MISMATCH',
}));

vi.mock('../../src/orchestra/cross-verify-runner.js', () => ({
  runCrossVerify: vi.fn(),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  waitForResults: vi.fn(async () => []),
  resolveAgentPrompt: vi.fn(async () => undefined),
  resolveSkillPrompts: vi.fn(async () => []),
  buildResultsMap: vi.fn(() => new Map()),
}));

vi.mock('../../src/orchestra/evaluation-audit-trail.js', () => ({
  writeEvaluationAudit: vi.fn(),
  buildDecisionRationale: vi.fn(() => ''),
}));

vi.mock('../../src/core/debt-store.js', () => ({
  getDebtItems: vi.fn(() => []),
}));

vi.mock('../../src/core/pid-liveness.js', () => ({
  isPidAlive: vi.fn(() => false),
}));

vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: vi.fn(async () => null),
  rollback: vi.fn(),
  getRollbackPolicy: vi.fn(() => 'never'),
  recordRollbackInDebt: vi.fn(),
  saveSafetyPoint: vi.fn(),
  deleteSafetyPoint: vi.fn(),
  isGitRepo: vi.fn(() => false),
  cleanOrphanSafetyPoint: vi.fn(),
}));

vi.mock('../../src/core/provider-failure-classifier.js', () => ({
  summarizeProviderFailures: vi.fn(() => ({ hasProviderLimitFailures: false, hasAuthFailures: false, allProviderLimited: false })),
  providerLimitFixSkipMessage: vi.fn(() => ''),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import {
  checkMidSprintCostGuard,
  createCostGuardMonitor,
} from '../../src/orchestra/sprint-phases.js';
import { writeEvent } from '../../src/orchestra/event-stream.js';

// ─── Fixtures ───────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'sonnet',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {},
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/tmp/test',
    version: '0.0.0-test',
    memory_budget: 5000,
    decay_after_sprints: 20,
    patterns_enabled: true,
    project_identity_enabled: true,
    scan_interval: 30,
    heartbeat_timeout: 120,
    boundary_enforcement: false,
    lock_stale_threshold: 300,
    human_checkpoints: [],
    fix_phase_enabled: false,
    max_fix_retries: 0,
    coverage_hard_floor: 50,
    coverage_aspirational: 90,
    coverage_threshold: 90,
    max_reroutes: 3,
    reroute_on_tech_debt: false,
    sprint_timeout_minutes: 0,
    adaptive_thresholds: false,
    agent_min_score: 5,
    adaptive_config: { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    rollback_policy: 'never',
    routing_engine: 'v2',
    cleanup_delay_ms: 0,
    dependency_pipeline_enabled: true,
    pre_sprint_tests: false,
    strict_tenant_isolation: false,
    sprint_checkpoint_interval: 5,
    token_throttle_ms: 0,
    timeout: {
      docker_min_timeout: 1200,
      docker_max_timeout: 7200,
      tmux_min_timeout: 900,
      tmux_max_timeout: 5400,
      subprocess_min_timeout: 600,
      subprocess_max_timeout: 3600,
      effort_base: { low: 600, normal: 1800, high: 3600 },
      loc_scaling_enabled: false,
      history_scaling_enabled: false,
      runtime_extension_enabled: false,
    },
    deckent_style: 'sprint',
    ...overrides,
  } as ResolvedConfig;
}

// ─── Tests: checkMidSprintCostGuard ─────────────────────────────────

describe('checkMidSprintCostGuard', () => {
  beforeEach(() => {
    capturedEvents.length = 0;
    vi.clearAllMocks();
  });

  it('returns shouldStopDispatch=false when cost_guard is absent (default-off)', async () => {
    const getLimitCost = vi.fn(async () => 100.0);
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', makeConfig(), { getLimitCost });
    expect(result.shouldStopDispatch).toBe(false);
    expect(result.currentCostUsd).toBe(0);
    expect(getLimitCost).not.toHaveBeenCalled();
  });

  it('returns shouldStopDispatch=false when cost_guard.enabled is false', async () => {
    const getLimitCost = vi.fn(async () => 50.0);
    const config = makeConfig({ cost_guard: { enabled: false, max_limit_cost_usd: 1.0 } });
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(result.shouldStopDispatch).toBe(false);
    expect(getLimitCost).not.toHaveBeenCalled();
  });

  it('returns shouldStopDispatch=false when max_limit_cost_usd is absent', async () => {
    const getLimitCost = vi.fn(async () => 10.0);
    const config = makeConfig({ cost_guard: { enabled: true } });
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(result.shouldStopDispatch).toBe(false);
    expect(getLimitCost).not.toHaveBeenCalled();
  });

  it('returns shouldStopDispatch=false when cost is below threshold', async () => {
    const getLimitCost = vi.fn(async () => 4.99);
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(result.shouldStopDispatch).toBe(false);
    expect(result.currentCostUsd).toBe(4.99);
    expect(getLimitCost).toHaveBeenCalledOnce();
  });

  it('returns shouldStopDispatch=true when cost equals threshold (>=)', async () => {
    const getLimitCost = vi.fn(async () => 5.0);
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(result.shouldStopDispatch).toBe(true);
    expect(result.currentCostUsd).toBe(5.0);
  });

  it('returns shouldStopDispatch=true when cost exceeds threshold', async () => {
    const getLimitCost = vi.fn(async () => 7.5);
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(result.shouldStopDispatch).toBe(true);
    expect(result.currentCostUsd).toBe(7.5);
  });

  it('emits COST_GUARD_ABORT audit event when threshold is exceeded', async () => {
    const getLimitCost = vi.fn(async () => 6.0);
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(capturedEvents.some((e) => e.channel === 'COST_GUARD_ABORT')).toBe(true);
    expect(writeEvent).toHaveBeenCalledOnce();
  });

  it('returns shouldStopDispatch=false when getLimitCost throws (best-effort)', async () => {
    const getLimitCost = vi.fn(async () => { throw new Error('ledger unavailable'); });
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const result = await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(result.shouldStopDispatch).toBe(false);
    expect(result.currentCostUsd).toBe(0);
    expect(writeEvent).not.toHaveBeenCalled();
  });

  it('does NOT emit event when cost is below threshold', async () => {
    const getLimitCost = vi.fn(async () => 2.0);
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    await checkMidSprintCostGuard('/tmp/r', 'sprint-279', config, { getLimitCost });
    expect(capturedEvents).toHaveLength(0);
    expect(writeEvent).not.toHaveBeenCalled();
  });
});

// ─── Tests: createCostGuardMonitor ──────────────────────────────────

describe('createCostGuardMonitor', () => {
  beforeEach(() => {
    capturedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shouldStopDispatch() is false before any ticks', () => {
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const monitor = createCostGuardMonitor('/tmp/r', 'sprint-279', config, {
      getLimitCost: async () => 3.0,
    });
    expect(monitor.shouldStopDispatch()).toBe(false);
  });

  it('does not start interval when cost_guard is disabled', () => {
    vi.useFakeTimers();
    const getLimitCost = vi.fn(async () => 100.0);
    const config = makeConfig({ cost_guard: { enabled: false, max_limit_cost_usd: 1.0 } });
    const monitor = createCostGuardMonitor('/tmp/r', 'sprint-279', config, { getLimitCost });
    monitor.start();
    vi.advanceTimersByTime(120_000);
    expect(getLimitCost).not.toHaveBeenCalled();
    expect(monitor.shouldStopDispatch()).toBe(false);
    monitor.stop();
  });

  it('sets shouldStopDispatch=true after a tick that exceeds threshold', async () => {
    vi.useFakeTimers();
    const getLimitCost = vi.fn(async () => 8.0);
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const monitor = createCostGuardMonitor('/tmp/r', 'sprint-279', config, {
      getLimitCost,
      intervalMs: 1_000,
    });
    monitor.start();
    // Advance past the interval and flush the microtask queue
    await vi.advanceTimersByTimeAsync(1_500);
    expect(monitor.shouldStopDispatch()).toBe(true);
    monitor.stop();
  });

  it('stop() prevents further ticks', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const getLimitCost = vi.fn(async () => { callCount++; return 3.0; });
    const config = makeConfig({ cost_guard: { enabled: true, max_limit_cost_usd: 5.0 } });
    const monitor = createCostGuardMonitor('/tmp/r', 'sprint-279', config, {
      getLimitCost,
      intervalMs: 1_000,
    });
    monitor.start();
    await vi.advanceTimersByTimeAsync(1_500);
    const countAfterFirst = callCount;
    monitor.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    // No further calls after stop
    expect(callCount).toBe(countAfterFirst);
  });
});
