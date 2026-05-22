/**
 * tests/orchestra/self-audit-gate.test.ts
 *
 * Dedicated tests for runSelfAuditGate() function.
 * Covers: happy path, tsc fail, vitest fail, honesty violation, metrics.jsonl missing.
 *
 * Sprint 135 Task 006 — Self-Audit Gate Dedicated Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Module-level mocks ──────────────────────────────────────────────
// We mock node:fs and node:child_process at module level so the mocks
// are applied before the subject module is imported.

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return {
    ...actual,
    debugLog: vi.fn(),
    parseDebtTable: vi.fn().mockReturnValue([]),
    updateLastSprintId: vi.fn(),
  };
});

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  writeRetrospective: vi.fn(),
  writeSprintLog: vi.fn(),
  calculateMetrics: vi.fn().mockReturnValue({
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 1000,
    coverage: 95,
  }),
  updateProjectDocs: vi.fn(),
  buildAgentPerformance: vi.fn().mockReturnValue([]),
  archiveDirectives: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  getRecentSprintStats: vi.fn().mockReturnValue({
    sprintCount: 0,
    avgNoGoRate: 0,
    avgCoverage: 80,
  }),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  runDecay: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({
    loadAgents: vi.fn().mockReturnValue(new Map()),
    updateAgentStats: vi.fn(),
    getAgent: vi.fn(),
    saveAgent: vi.fn(),
  })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({
    loadSkills: vi.fn().mockReturnValue(new Map()),
    updateSkillStats: vi.fn(),
    getSkill: vi.fn(),
    saveSkill: vi.fn(),
  })),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn(),
  loadPluginHooks: vi.fn(),
  clearHooks: vi.fn(),
}));

vi.mock('../../src/orchestra/sprint-utils.js', () => ({
  readFileSafe: vi.fn().mockReturnValue(''),
  now: vi.fn().mockReturnValue('2026-04-12T12:00:00Z'),
}));

vi.mock('../../src/cli/helpers/sprint-summary-rich.js', () => ({
  formatRichSprintSummary: vi.fn().mockReturnValue(null),
}));

// Import subject after mocks are set up
import { runSelfAuditGate } from '../../src/orchestra/sprint-finalizer.js';
import type { SelfAuditResult } from '../../src/orchestra/sprint-finalizer.js';
import { spawnSync } from 'node:child_process';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Create a temp project directory with .deckent/ subdirectory and a baseline JSON */
function createTempProject(sprintId: string): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-audit-gate-test-'));
  const deckentDir = join(root, '.deckent');
  mkdirSync(deckentDir, { recursive: true });

  // Write a valid baseline JSON so readBaseline() can return it
  const baseline = { files: 10, pass: 100, fail: 0, skipped: 2 };
  writeFileSync(join(deckentDir, `${sprintId}-baseline.json`), JSON.stringify(baseline), 'utf-8');

  return root;
}

/** Write a metrics.jsonl file with at least one line */
function writeMetricsJsonl(root: string): void {
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) mkdirSync(deckentDir, { recursive: true });
  writeFileSync(join(deckentDir, 'metrics.jsonl'), '{"metric":"test","value":1}\n{"metric":"test2","value":2}\n', 'utf-8');
}

/** Cleanup temp directory */
function cleanupTempProject(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('runSelfAuditGate — dedicated tests', () => {
  const SPRINT_ID = 'sprint-test-135';
  let tempRoot: string;
  const mockedSpawnSync = vi.mocked(spawnSync);

  beforeEach(() => {
    tempRoot = createTempProject(SPRINT_ID);
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTempProject(tempRoot);
  });

  // ─── Test 1: Happy path ─────────────────────────────────────────────
  it('happy path — tsc PASS + vitest PASS + honesty clean + metrics.jsonl exists → overallGate PASS', async () => {
    // Write metrics.jsonl
    writeMetricsJsonl(tempRoot);

    // Mock spawnSync: first call = tsc (status 0), second call = vitest (status 0)
    mockedSpawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: '',
        stderr: '',
        pid: 1,
        output: [],
        signal: null,
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: 'Tests  100 passed (100)\nTest Files  10 passed (10)\n',
        stderr: '',
        pid: 2,
        output: [],
        signal: null,
      });

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        honestyResults: [], // No violations
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    expect(result.overallGate).toBe('PASS');
    expect(result.tsc.status).toBe('PASS');
    expect(result.tsc.errors).toEqual([]);
    expect(result.vitest.status).toBe('PASS');
    expect(result.honesty.violations).toBe(0);
    expect(result.honesty.flaggedTasks).toEqual([]);
    expect(result.observability.metricsJsonlExists).toBe(true);
    expect(result.observability.lineCount).toBeGreaterThan(0);
  });

  // ─── Test 2: tsc fail ──────────────────────────────────────────────
  it('tsc fail → overallGate GATE_FAILURE, tsc.status FAIL, tsc.errors not empty', async () => {
    writeMetricsJsonl(tempRoot);

    // Mock runTsc to simulate failure — use options.runTsc injection
    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({
          status: 1,
          stdout: 'src/core/types.ts(10,5): error TS2345: Argument of type string is not assignable\nsrc/core/config.ts(20,1): error TS2304: Cannot find name foo',
          stderr: '',
        }),
        runVitest: (_root) => ({
          status: 0,
          stdout: 'Tests  100 passed (100)\nTest Files  10 passed (10)\n',
          stderr: '',
        }),
        honestyResults: [],
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    expect(result.overallGate).toBe('GATE_FAILURE');
    expect(result.tsc.status).toBe('FAIL');
    expect(result.tsc.errors.length).toBeGreaterThan(0);
    // Errors should contain the TS error lines
    expect(result.tsc.errors.some((e) => e.includes('error TS'))).toBe(true);
    // vitest still passes — gate failure caused by tsc only
    expect(result.vitest.status).toBe('PASS');
  });

  // ─── Test 3: vitest fail ────────────────────────────────────────────
  it('vitest fail → overallGate GATE_FAILURE, vitest.status FAIL', async () => {
    writeMetricsJsonl(tempRoot);

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({
          status: 0,
          stdout: '',
          stderr: '',
        }),
        runVitest: (_root) => ({
          status: 1,
          stdout: 'Tests  98 passed | 3 failed (101)\nTest Files  10 passed | 2 failed (12)\n',
          stderr: 'FAIL src/core/config.test.ts\n',
        }),
        honestyResults: [],
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    expect(result.overallGate).toBe('GATE_FAILURE');
    expect(result.vitest.status).toBe('FAIL');
    // tsc passed — only vitest caused gate failure
    expect(result.tsc.status).toBe('PASS');
    expect(result.honesty.violations).toBe(0);
  });

  // ─── Test 4: Honesty violation ─────────────────────────────────────
  it('honesty violation present → overallGate GATE_FAILURE, honesty.violations > 0', async () => {
    writeMetricsJsonl(tempRoot);

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({
          status: 0,
          stdout: '',
          stderr: '',
        }),
        runVitest: (_root) => ({
          status: 0,
          stdout: 'Tests  100 passed (100)\nTest Files  10 passed (10)\n',
          stderr: '',
        }),
        honestyResults: [
          { taskId: 'task-135-001', violation: true },
          { taskId: 'task-135-002', violation: false },
        ],
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    expect(result.overallGate).toBe('GATE_FAILURE');
    expect(result.honesty.violations).toBeGreaterThan(0);
    expect(result.honesty.violations).toBe(1);
    expect(result.honesty.flaggedTasks).toContain('task-135-001');
    expect(result.honesty.flaggedTasks).not.toContain('task-135-002');
    // tsc and vitest pass
    expect(result.tsc.status).toBe('PASS');
    expect(result.vitest.status).toBe('PASS');
  });

  // ─── Test 5: metrics.jsonl missing → WARNING (not GATE_FAILURE) ────
  it('metrics.jsonl missing → overallGate PASS (warning only, not GATE_FAILURE)', async () => {
    // Deliberately do NOT write metrics.jsonl — point to non-existent path
    const missingMetricsPath = join(tempRoot, '.deckent', 'metrics.jsonl');
    // Ensure it does not exist
    expect(existsSync(missingMetricsPath)).toBe(false);

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({
          status: 0,
          stdout: '',
          stderr: '',
        }),
        runVitest: (_root) => ({
          status: 0,
          stdout: 'Tests  100 passed (100)\nTest Files  10 passed (10)\n',
          stderr: '',
        }),
        honestyResults: [],
        metricsJsonlPath: missingMetricsPath,
      },
    );

    // Gate should NOT fail just because metrics.jsonl is missing
    expect(result.overallGate).toBe('PASS');
    // But observability should report the missing file
    expect(result.observability.metricsJsonlExists).toBe(false);
    expect(result.observability.lineCount).toBe(0);
    // All other checks passed
    expect(result.tsc.status).toBe('PASS');
    expect(result.vitest.status).toBe('PASS');
    expect(result.honesty.violations).toBe(0);
  });

  // ─── Test 6: Result shape conformance ──────────────────────────────
  it('result always has correct SelfAuditResult shape', async () => {
    writeMetricsJsonl(tempRoot);

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({ status: 0, stdout: '', stderr: '' }),
        runVitest: (_root) => ({
          status: 0,
          stdout: 'Tests  50 passed (50)\n',
          stderr: '',
        }),
        honestyResults: [],
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    // Shape check
    expect(result).toHaveProperty('tsc');
    expect(result).toHaveProperty('vitest');
    expect(result).toHaveProperty('honesty');
    expect(result).toHaveProperty('observability');
    expect(result).toHaveProperty('overallGate');

    expect(typeof result.tsc.status).toBe('string');
    expect(Array.isArray(result.tsc.errors)).toBe(true);

    expect(typeof result.vitest.status).toBe('string');
    expect(typeof result.vitest.delta.files).toBe('number');
    expect(typeof result.vitest.delta.pass).toBe('number');
    expect(typeof result.vitest.delta.fail).toBe('number');
    expect(typeof result.vitest.delta.skipped).toBe('number');

    expect(typeof result.honesty.violations).toBe('number');
    expect(Array.isArray(result.honesty.flaggedTasks)).toBe(true);

    expect(typeof result.observability.metricsJsonlExists).toBe('boolean');
    expect(typeof result.observability.lineCount).toBe('number');

    expect(['PASS', 'GATE_FAILURE']).toContain(result.overallGate);
  });

  // ─── Test 7: Multiple honesty violations ───────────────────────────
  it('multiple honesty violations all flagged → violations count matches', async () => {
    writeMetricsJsonl(tempRoot);

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({ status: 0, stdout: '', stderr: '' }),
        runVitest: (_root) => ({
          status: 0,
          stdout: 'Tests  100 passed (100)\n',
          stderr: '',
        }),
        honestyResults: [
          { taskId: 'task-001', violation: true },
          { taskId: 'task-002', violation: true },
          { taskId: 'task-003', violation: false },
          { taskId: 'task-004', violation: true },
        ],
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    expect(result.overallGate).toBe('GATE_FAILURE');
    expect(result.honesty.violations).toBe(3);
    expect(result.honesty.flaggedTasks).toHaveLength(3);
    expect(result.honesty.flaggedTasks).toContain('task-001');
    expect(result.honesty.flaggedTasks).toContain('task-002');
    expect(result.honesty.flaggedTasks).toContain('task-004');
    expect(result.honesty.flaggedTasks).not.toContain('task-003');
  });

  // ─── Test 8: tsc fail + vitest fail + honesty all fail together ────
  it('all three checks fail → overallGate GATE_FAILURE with all issues present', async () => {
    writeMetricsJsonl(tempRoot);

    const result: SelfAuditResult = await runSelfAuditGate(
      SPRINT_ID,
      tempRoot,
      {
        runTsc: (_root) => ({
          status: 2,
          stdout: 'src/foo.ts(1,1): error TS2304: Cannot find name bar',
          stderr: '',
        }),
        runVitest: (_root) => ({
          status: 1,
          stdout: 'Tests  10 passed | 5 failed (15)\n',
          stderr: '',
        }),
        honestyResults: [
          { taskId: 'task-bad', violation: true },
        ],
        metricsJsonlPath: join(tempRoot, '.deckent', 'metrics.jsonl'),
      },
    );

    expect(result.overallGate).toBe('GATE_FAILURE');
    expect(result.tsc.status).toBe('FAIL');
    expect(result.vitest.status).toBe('FAIL');
    expect(result.honesty.violations).toBeGreaterThan(0);
  });
});
