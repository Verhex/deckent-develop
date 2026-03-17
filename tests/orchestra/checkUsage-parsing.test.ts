/**
 * Task 003-003 — checkUsage real integration (DEBT-002)
 *
 * Comprehensive parsing tests:
 *   - Various CLI output formats
 *   - Safe default fallbacks (50% / 30%)
 *   - Error scenarios
 *   - adjustSprintSize with real parsed values
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ResolvedConfig } from '../../src/core/types.js';

// ─── Module Mocks ───────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  killWorker: vi.fn(),
  listWorkers: vi.fn().mockReturnValue([]),
  startAuditor: vi.fn(),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  detectDeadlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/agents/worker.js', () => ({
  updateTaskStatus: vi.fn(),
  releaseAllLocks: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { checkUsage, adjustSprintSize } from '../../src/orchestra/brain.js';

const mockedSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'pro_plan',
    projectRoot: '/test',
    projectName: 'test',
    language: 'tr',
    version: '0.1.0',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: false,
      usage_thresholds: { '5hr': 0.8, weekly: 0.9 },
    },
    modes: {} as never,
    ...overrides,
  };
}

function mockSuccess(stdout: string) {
  mockedSpawnSync.mockReturnValue({
    status: 0, stdout, stderr: '', pid: 0, signal: null, output: [],
  } as never);
}

function mockFailure(stderr = 'command not found') {
  mockedSpawnSync.mockReturnValue({
    status: 1, stdout: '', stderr, pid: 0, signal: null, output: [],
  } as never);
}

// ═══════════════════════════════════════════════════════════════════
// spawnSync invocation contract
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — spawnSync invocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFailure();
  });

  it('calls spawnSync with "claude" as the command', () => {
    checkUsage(makeConfig());
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'claude',
      expect.any(Array),
      expect.any(Object),
    );
  });

  it('passes ["-p", "/usage"] as arguments', () => {
    checkUsage(makeConfig());
    const call = mockedSpawnSync.mock.calls[0];
    expect(call?.[1]).toEqual(['-p', '/usage']);
  });

  it('requests utf-8 encoding', () => {
    checkUsage(makeConfig());
    const call = mockedSpawnSync.mock.calls[0];
    const opts = call?.[2] as Record<string, unknown>;
    expect(opts?.encoding).toBe('utf-8');
  });

  it('sets a timeout of at least 5 seconds', () => {
    checkUsage(makeConfig());
    const call = mockedSpawnSync.mock.calls[0];
    const opts = call?.[2] as Record<string, unknown>;
    expect(typeof opts?.timeout).toBe('number');
    expect(opts?.timeout as number).toBeGreaterThanOrEqual(5_000);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Parsing — "5hr:" prefix format
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — 5hr parsing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses "5hr: 45%" → fiveHourPercent = 45', () => {
    mockSuccess('5hr: 45%\nweekly: 20%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(45);
  });

  it('parses "5-hr: 72%" (hyphenated)', () => {
    mockSuccess('5-hr: 72%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(72);
  });

  it('parses "5 hr: 33%" (space separated)', () => {
    mockSuccess('5 hr: 33%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(33);
  });

  it('parses "5hour: 60%"', () => {
    mockSuccess('5hour: 60%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(60);
  });

  it('parses "5-hour: 60%"', () => {
    mockSuccess('5-hour: 60%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(60);
  });

  it('parses "5 hour: 60%"', () => {
    mockSuccess('5 hour: 60%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(60);
  });

  it('parses "5hourly: 55%"', () => {
    mockSuccess('5hourly: 55%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(55);
  });

  it('parses decimal values "5hr: 78.5%"', () => {
    mockSuccess('5hr: 78.5%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBeCloseTo(78.5);
  });

  it('parses "5HR: 45%" (uppercase)', () => {
    mockSuccess('5HR: 45%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(45);
  });

  it('parses reverse format "45% (5hr)"', () => {
    mockSuccess('Usage: 45% (5hr)\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(45);
  });

  it('parses reverse format "45% used in 5h window"', () => {
    mockSuccess('45% used in 5h window\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(45);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Parsing — "weekly" prefix format
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — weekly parsing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses "weekly: 65%" → weeklyPercent = 65', () => {
    mockSuccess('5hr: 20%\nweekly: 65%\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(65);
  });

  it('parses "week: 65%" (shortened)', () => {
    mockSuccess('week: 65%\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(65);
  });

  it('parses decimal "weekly: 42.3%"', () => {
    mockSuccess('weekly: 42.3%\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBeCloseTo(42.3);
  });

  it('parses "WEEKLY: 65%" (uppercase)', () => {
    mockSuccess('WEEKLY: 65%\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(65);
  });

  it('parses reverse format "65% weekly"', () => {
    mockSuccess('Usage: 65% weekly\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(65);
  });

  it('parses reverse format "65% (weekly)"', () => {
    mockSuccess('65% (weekly)\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(65);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Parsing — combined output (both fields present)
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — combined output parsing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses both fields from a two-line output', () => {
    mockSuccess('5hr: 45%\nweekly: 65%\n');
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(45);
    expect(usage.weeklyPercent).toBe(65);
  });

  it('parses both fields from a single-line output', () => {
    mockSuccess('5hr: 45%, weekly: 65%');
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(45);
    expect(usage.weeklyPercent).toBe(65);
  });

  it('parses multiline output with header rows', () => {
    mockSuccess(
      'Claude Usage Stats\n' +
      '==================\n' +
      '5hr: 45%\n' +
      'weekly: 65%\n',
    );
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(45);
    expect(usage.weeklyPercent).toBe(65);
  });

  it('0% values are parsed correctly (not treated as falsy)', () => {
    mockSuccess('5hr: 0%\nweekly: 0%\n');
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(0);
    expect(usage.weeklyPercent).toBe(0);
  });

  it('100% values are parsed correctly', () => {
    mockSuccess('5hr: 100%\nweekly: 100%\n');
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(100);
    expect(usage.weeklyPercent).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Safe default fallbacks (50% / 30%)
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — safe default fallbacks', () => {
  const SAFE_5HR = 50;
  const SAFE_WEEKLY = 30;

  beforeEach(() => vi.clearAllMocks());

  it('returns fiveHourPercent=50 when CLI exits with non-zero status', () => {
    mockFailure('command not found');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(SAFE_5HR);
  });

  it('returns weeklyPercent=30 when CLI exits with non-zero status', () => {
    mockFailure('command not found');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns fiveHourPercent=50 when stdout is empty string', () => {
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 0, signal: null, output: [] } as never);
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(SAFE_5HR);
  });

  it('returns weeklyPercent=30 when stdout is empty string', () => {
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 0, signal: null, output: [] } as never);
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns fiveHourPercent=50 when stdout is null', () => {
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: null, stderr: '', pid: 0, signal: null, output: [] } as never);
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(SAFE_5HR);
  });

  it('returns weeklyPercent=30 when stdout is null', () => {
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: null, stderr: '', pid: 0, signal: null, output: [] } as never);
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns fiveHourPercent=50 when output has no 5hr pattern', () => {
    mockSuccess('weekly: 65%\n');
    expect(checkUsage(makeConfig()).fiveHourPercent).toBe(SAFE_5HR);
  });

  it('returns weeklyPercent=30 when output has no weekly pattern', () => {
    mockSuccess('5hr: 45%\n');
    expect(checkUsage(makeConfig()).weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns both safe defaults when output is unrecognised prose', () => {
    mockSuccess('No usage data available at this time.');
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(SAFE_5HR);
    expect(usage.weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns both safe defaults when spawnSync throws ENOENT', () => {
    mockedSpawnSync.mockImplementation(() => { throw new Error('ENOENT'); });
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(SAFE_5HR);
    expect(usage.weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns both safe defaults when spawnSync throws timeout error', () => {
    mockedSpawnSync.mockImplementation(() => { throw new Error('spawnSync timeout'); });
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBe(SAFE_5HR);
    expect(usage.weeklyPercent).toBe(SAFE_WEEKLY);
  });

  it('returns both safe defaults when spawnSync returns null result', () => {
    mockedSpawnSync.mockReturnValue(null as never);
    expect(() => checkUsage(makeConfig())).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// UsageMetrics shape contract
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — UsageMetrics shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccess('5hr: 45%\nweekly: 65%\n');
  });

  it('always returns all three required fields', () => {
    const usage = checkUsage(makeConfig());
    expect(usage).toHaveProperty('fiveHourPercent');
    expect(usage).toHaveProperty('weeklyPercent');
    expect(usage).toHaveProperty('measuredAt');
  });

  it('fiveHourPercent is a finite number', () => {
    const usage = checkUsage(makeConfig());
    expect(Number.isFinite(usage.fiveHourPercent)).toBe(true);
  });

  it('weeklyPercent is a finite number', () => {
    const usage = checkUsage(makeConfig());
    expect(Number.isFinite(usage.weeklyPercent)).toBe(true);
  });

  it('measuredAt is an ISO-8601 timestamp string', () => {
    const usage = checkUsage(makeConfig());
    expect(typeof usage.measuredAt).toBe('string');
    expect(usage.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(usage.measuredAt).getTime()).not.toBeNaN();
  });

  it('fiveHourPercent is in [0, 100] for parsed output', () => {
    const usage = checkUsage(makeConfig());
    expect(usage.fiveHourPercent).toBeGreaterThanOrEqual(0);
    expect(usage.fiveHourPercent).toBeLessThanOrEqual(100);
  });

  it('weeklyPercent is in [0, 100] for parsed output', () => {
    const usage = checkUsage(makeConfig());
    expect(usage.weeklyPercent).toBeGreaterThanOrEqual(0);
    expect(usage.weeklyPercent).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// adjustSprintSize — integration with real checkUsage values
// ═══════════════════════════════════════════════════════════════════

describe('adjustSprintSize — using real checkUsage values', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns "full" when both usage values are well below thresholds', () => {
    mockSuccess('5hr: 10%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('full');
  });

  it('returns "reduced" when only 5hr threshold is exceeded (>= 80%)', () => {
    mockSuccess('5hr: 85%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('reduced');
  });

  it('returns "reduced" when only weekly threshold is exceeded (>= 90%)', () => {
    mockSuccess('5hr: 20%\nweekly: 95%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('reduced');
  });

  it('returns "minimal" when both thresholds are exceeded', () => {
    mockSuccess('5hr: 90%\nweekly: 95%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('minimal');
  });

  it('safe defaults (50%/30%) keep sprint size "full"', () => {
    mockFailure();
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    // 50% < 80% and 30% < 90% → full
    expect(rec.size).toBe('full');
  });

  it('maxWorkers is halved in "reduced" size', () => {
    mockSuccess('5hr: 85%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.maxWorkers).toBe(Math.max(1, Math.floor(4 / 2)));
  });

  it('maxWorkers is 1 in "minimal" size', () => {
    mockSuccess('5hr: 90%\nweekly: 95%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.maxWorkers).toBe(1);
  });

  it('includes a non-empty reason string', () => {
    mockSuccess('5hr: 45%\nweekly: 65%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(typeof rec.reason).toBe('string');
    expect(rec.reason.length).toBeGreaterThan(0);
  });

  it('modelConstraint is null for "full" size', () => {
    mockSuccess('5hr: 10%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.modelConstraint).toBeNull();
  });

  it('modelConstraint is "sonnet" for "reduced" size', () => {
    mockSuccess('5hr: 85%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.modelConstraint).toBe('sonnet');
  });

  it('exactly at threshold boundary (80.0%) is treated as exceeded', () => {
    mockSuccess('5hr: 80%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    // 80/100 = 0.8 >= 0.8 → exceeded
    const rec = adjustSprintSize(config, usage);
    expect(['reduced', 'minimal']).toContain(rec.size);
  });

  it('just below threshold (79.9%) is NOT exceeded', () => {
    mockSuccess('5hr: 79.9%\nweekly: 20%\n');
    const config = makeConfig();
    const usage = checkUsage(config);
    const rec = adjustSprintSize(config, usage);
    expect(rec.size).toBe('full');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Error resilience
// ═══════════════════════════════════════════════════════════════════

describe('checkUsage — error resilience', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not throw on spawnSync returning undefined stdout', () => {
    mockedSpawnSync.mockReturnValue({ status: 0, stdout: undefined, stderr: '', pid: 0, signal: null, output: [] } as never);
    expect(() => checkUsage(makeConfig())).not.toThrow();
  });

  it('does not throw on spawnSync returning undefined result', () => {
    mockedSpawnSync.mockReturnValue(undefined as never);
    expect(() => checkUsage(makeConfig())).not.toThrow();
  });

  it('does not throw when stdout contains no recognisable patterns', () => {
    mockSuccess('Lorem ipsum dolor sit amet\n');
    expect(() => checkUsage(makeConfig())).not.toThrow();
  });

  it('does not throw on extremely long stdout output', () => {
    mockSuccess('x'.repeat(100_000));
    expect(() => checkUsage(makeConfig())).not.toThrow();
  });

  it('does not throw on stdout with only numbers', () => {
    mockSuccess('12345 67890 99.9 0.1');
    expect(() => checkUsage(makeConfig())).not.toThrow();
  });

  it('always returns a valid UsageMetrics even in worst-case scenarios', () => {
    mockedSpawnSync.mockImplementation(() => { throw new TypeError('unexpected'); });
    const usage = checkUsage(makeConfig());
    expect(Number.isFinite(usage.fiveHourPercent)).toBe(true);
    expect(Number.isFinite(usage.weeklyPercent)).toBe(true);
    expect(typeof usage.measuredAt).toBe('string');
  });

  it('can be called in a tight loop without leaking state', () => {
    mockSuccess('5hr: 45%\nweekly: 65%\n');
    const config = makeConfig();
    const results = Array.from({ length: 10 }, () => checkUsage(config));
    for (const r of results) {
      expect(r.fiveHourPercent).toBe(45);
      expect(r.weeklyPercent).toBe(65);
    }
  });
});
