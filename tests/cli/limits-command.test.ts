/**
 * tests/cli/limits-command.test.ts — Sprint 361 Task 361-002 (LIMIT-GATE-WIRE)
 *
 * Hermetic tests for `deckent limits [--json]` and the (currently unwired,
 * see src/cli/commands/limits.ts header) start-gate helper. All fs I/O runs
 * under a real os.tmpdir() fixture (never the project root); the probe
 * (`claude -p "/usage"`) is fully mocked — no real binary is ever invoked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────

// vi.mock factories are hoisted above all imports; referencing a plain
// top-level `const` initialized via imported `join`/`tmpdir` hits a TDZ error
// ("cannot access before initialization") because the import bindings aren't
// live yet at hoist time. `vi.hoisted()` runs its callback first, before the
// mock factories, so the derived path is safely available to them.
const { mockGlobalConfigPath } = vi.hoisted(() => {
  const base = process.env['TMPDIR'] || process.env['TEMP'] || process.env['TMP'] || '/tmp';
  return { mockGlobalConfigPath: `${base}/deckent-limits-test-global-config.json` };
});

vi.mock('../../src/core/constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/constants.js')>();
  return { ...actual, GLOBAL_CONFIG_PATH: mockGlobalConfigPath };
});

vi.mock('../../src/core/limit-preflight.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/limit-preflight.js')>();
  return { ...actual, probeSubscriptionLimits: vi.fn() };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

import { probeSubscriptionLimits, type SubscriptionLimitResult } from '../../src/core/limit-preflight.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { getLangFromConfig } from '../../src/cli/helpers/config-reader.js';
import {
  readLimitGateConfig,
  evaluateWindowedLimitGate,
  checkStartLimitGate,
  runLimitsCommand,
  registerLimits,
} from '../../src/cli/commands/limits.js';

const mockedProbe = vi.mocked(probeSubscriptionLimits);
const mockedResolveRoot = vi.mocked(resolveProjectRoot);
const mockedGetLang = vi.mocked(getLangFromConfig);

// ─── Fixtures ────────────────────────────────────────────────────────────

function okProbe(overrides: Partial<Extract<SubscriptionLimitResult, { unavailable: false }>> = {}): SubscriptionLimitResult {
  return {
    unavailable: false,
    sessionPct: 10,
    sessionResetAt: { text: 'Jul 2, 8:30pm', timezone: 'Europe/Istanbul' },
    weekAllPct: 5,
    weekAllResetAt: { text: 'Jul 6, 12:00am', timezone: 'Europe/Istanbul' },
    raw: 'fixture',
    ...overrides,
  };
}

const UNAVAILABLE_PROBE: SubscriptionLimitResult = {
  unavailable: true,
  reason: 'usage output missing required lines',
  raw: '',
};

// ─── Fixture root (real tmpdir, hermetic) ─────────────────────────────────

let root: string;

function writeProjectConfig(content: unknown): void {
  const dir = join(root, '.deckent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(content, null, 2));
}

function writeGlobalConfig(content: unknown): void {
  mkdirSync(join(mockGlobalConfigPath, '..'), { recursive: true });
  writeFileSync(mockGlobalConfigPath, JSON.stringify(content, null, 2));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-limits-test-'));
  mockedResolveRoot.mockReturnValue(root);
  mockedGetLang.mockReturnValue('en');
  mockedProbe.mockReset();
  process.exitCode = undefined;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(mockGlobalConfigPath, { force: true });
  vi.restoreAllMocks();
});

// ─── readLimitGateConfig (roundtrip) ──────────────────────────────────────

describe('readLimitGateConfig', () => {
  it('returns an empty object when no config file exists', () => {
    expect(readLimitGateConfig(root)).toEqual({});
  });

  it('roundtrips enabled/session_max_pct/weekly_max_pct written to project config.json', () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 80, weekly_max_pct: 60 } });
    expect(readLimitGateConfig(root)).toEqual({ enabled: true, session_max_pct: 80, weekly_max_pct: 60 });
  });

  it('project config overrides global config field-by-field', () => {
    writeGlobalConfig({ limit_gate: { enabled: true, session_max_pct: 50, weekly_max_pct: 40 } });
    writeProjectConfig({ limit_gate: { session_max_pct: 95 } });
    expect(readLimitGateConfig(root)).toEqual({ enabled: true, session_max_pct: 95, weekly_max_pct: 40 });
  });

  it('drops invalid field types instead of propagating garbage', () => {
    writeProjectConfig({ limit_gate: { enabled: 'yes', session_max_pct: 150, weekly_max_pct: -5 } });
    expect(readLimitGateConfig(root)).toEqual({});
  });

  it('tolerates a corrupted config.json without throwing', () => {
    mkdirSync(join(root, '.deckent'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'config.json'), '{not valid json');
    expect(() => readLimitGateConfig(root)).not.toThrow();
    expect(readLimitGateConfig(root)).toEqual({});
  });
});

// ─── evaluateWindowedLimitGate ─────────────────────────────────────────────

describe('evaluateWindowedLimitGate', () => {
  it('returns ok when all windows are below the (default) warn floor', () => {
    const result = evaluateWindowedLimitGate(okProbe({ sessionPct: 10, weekAllPct: 5 }), {});
    expect(result.verdict).toBe('ok');
  });

  it('returns warn when session pct crosses the default warn floor but not its block ceiling', () => {
    const result = evaluateWindowedLimitGate(okProbe({ sessionPct: 75, weekAllPct: 5 }), {});
    expect(result.verdict).toBe('warn');
    expect(result.window).toBe('session');
  });

  it('returns block when session pct meets the configured session_max_pct', () => {
    const result = evaluateWindowedLimitGate(okProbe({ sessionPct: 80, weekAllPct: 5 }), { session_max_pct: 80 });
    expect(result.verdict).toBe('block');
    expect(result.window).toBe('session');
    expect(result.pct).toBe(80);
  });

  it('evaluates the weekly window independently of the session window', () => {
    const result = evaluateWindowedLimitGate(okProbe({ sessionPct: 5, weekAllPct: 65 }), { weekly_max_pct: 60 });
    expect(result.verdict).toBe('block');
    expect(result.window).toBe('week (all models)');
  });

  it('includes week (Fable) when present, using the weekly threshold', () => {
    const result = evaluateWindowedLimitGate(
      okProbe({ sessionPct: 5, weekAllPct: 5, weekFablePct: 92 }),
      { weekly_max_pct: 90 },
    );
    expect(result.verdict).toBe('block');
    expect(result.window).toBe('week (Fable)');
  });

  it('fails open (ok) when the probe is unavailable, regardless of config', () => {
    const result = evaluateWindowedLimitGate(UNAVAILABLE_PROBE, { enabled: true, session_max_pct: 1 });
    expect(result.verdict).toBe('ok');
    expect(result.reason).toContain('unavailable');
  });
});

// ─── checkStartLimitGate (part b — unwired, exported for a follow-up task) ──

describe('checkStartLimitGate', () => {
  it('is a byte-identical no-op (zero probe calls) when limit_gate.enabled is absent', async () => {
    writeProjectConfig({});
    const result = await checkStartLimitGate(root, 'en');
    expect(result).toEqual({ blocked: false, bypassed: false, verdict: 'ok', message: null });
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it('is a no-op when limit_gate.enabled is explicitly false', async () => {
    writeProjectConfig({ limit_gate: { enabled: false, session_max_pct: 1 } });
    const result = await checkStartLimitGate(root, 'en');
    expect(result.blocked).toBe(false);
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it('blocks sprint start on a block verdict when enabled and no forceLimits', async () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 80 } });
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 85 }));
    const result = await checkStartLimitGate(root, 'en');
    expect(result.blocked).toBe(true);
    expect(result.bypassed).toBe(false);
    expect(result.verdict).toBe('block');
    expect(result.message).toContain('blocked');
  });

  it('bypasses a block verdict when forceLimits is set', async () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 80 } });
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 85 }));
    const result = await checkStartLimitGate(root, 'en', { forceLimits: true });
    expect(result.blocked).toBe(false);
    expect(result.bypassed).toBe(true);
    expect(result.verdict).toBe('block');
  });

  it('does not block on a warn verdict — proceeds with an advisory message', async () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 95 } });
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 75 }));
    const result = await checkStartLimitGate(root, 'en');
    expect(result.blocked).toBe(false);
    expect(result.verdict).toBe('warn');
    expect(result.message).toContain('Warning');
  });

  it('renders the Turkish start_gate_blocked message when lang=tr', async () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 80 } });
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 85 }));
    const result = await checkStartLimitGate(root, 'tr');
    expect(result.message).toContain('engellendi');
  });
});

// ─── runLimitsCommand — `deckent limits [--json]` ─────────────────────────

// `mockRestore()` also performs a `mockReset()` (clears recorded `.mock.calls`)
// before restoring the original implementation — so every capture below reads
// `writeSpy.mock.calls` BEFORE calling `mockRestore()`, never after.

describe('runLimitsCommand', () => {
  it('--json output includes a top-level sessionPct field (Smoke contract)', async () => {
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 42 }));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({ json: true });
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.sessionPct).toBe(42);
    expect(parsed.unavailable).toBe(false);
  });

  it('--json includes gate config and verdict fields', async () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 80, weekly_max_pct: 60 } });
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 10 }));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({ json: true });
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.verdict).toBe('ok');
    expect(parsed.gate).toEqual({ enabled: true, session_max_pct: 80, weekly_max_pct: 60 });
  });

  it('--json sets sessionPct null and unavailable true when the probe fails', async () => {
    mockedProbe.mockResolvedValue(UNAVAILABLE_PROBE);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({ json: true });
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.unavailable).toBe(true);
    expect(parsed.sessionPct).toBeNull();
    expect(process.exitCode).not.toBe(1);
  });

  it('renders a human-readable table (non-JSON) with window/usage/resets columns', async () => {
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 33, weekAllPct: 12 }));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({});
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('Subscription Limits');
    expect(printed).toContain('Window');
    expect(printed).toContain('33%');
    expect(printed).toContain('12%');
  });

  it('sets process.exitCode = 1 on a block verdict (table mode)', async () => {
    writeProjectConfig({ limit_gate: { enabled: true, session_max_pct: 50 } });
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 90 }));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({});
    writeSpy.mockRestore();

    expect(process.exitCode).toBe(1);
  });

  it('does not set a non-zero exitCode on ok/warn verdicts', async () => {
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 5 }));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({});
    writeSpy.mockRestore();

    expect(process.exitCode).toBeUndefined();
  });

  it('renders the Turkish header when getLangFromConfig returns tr', async () => {
    mockedGetLang.mockReturnValue('tr');
    mockedProbe.mockResolvedValue(okProbe());
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runLimitsCommand({});
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('Abonelik Limitleri');
  });
});

// ─── CLI wiring (commander) ────────────────────────────────────────────────

describe('registerLimits (CLI wiring)', () => {
  it('registers a working `limits --json` command', async () => {
    mockedProbe.mockResolvedValue(okProbe({ sessionPct: 7 }));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    registerLimits(program);
    await program.parseAsync(['node', 'test', 'limits', '--json']);

    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed);
    expect(parsed.sessionPct).toBe(7);
  });
});
