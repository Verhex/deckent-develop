/**
 * tests/cli/cu-status.test.ts — Sprint 374 Task 374-002 (CU-STATUS-CLI)
 *
 * Hermetic tests for `deckent cu-status [--json]`. Every prober here is a fake
 * (vi.fn()) — no real spawn, no real `command -v`/`where` shell-out — matching the
 * task's "gerçek command-prober runtime'da; testte fake" constraint. `resolveProjectRoot`
 * and the config loader are mocked; nothing touches the real filesystem/process env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(),
}));

vi.mock('../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from '../../src/core/config.js';
import { resolveProjectRoot } from '../../src/cli/helpers/process.js';
import { getLangFromConfig } from '../../src/cli/helpers/config-reader.js';
import {
  buildCuStatusReport,
  formatCuStatusJson,
  formatCuStatusTable,
  runCuStatusCommand,
  registerCuStatus,
  detectCuPlatform,
  realCommandProber,
  type CuStatusReport,
} from '../../src/cli/commands/cu-status.js';
import { COMPUTER_USE_ACTION_KINDS, type ComputerUseConfig } from '../../src/core/computer-use-contract.js';
import type { CommandProber } from '../../src/core/computer-use-platform.js';

const mockedLoadConfig = vi.mocked(loadConfig);
const mockedResolveRoot = vi.mocked(resolveProjectRoot);
const mockedGetLang = vi.mocked(getLangFromConfig);

const ENABLED_ALL: ComputerUseConfig = {
  enabled: true,
  allowed_capabilities: [...COMPUTER_USE_ACTION_KINDS],
};

const alwaysAvailable: CommandProber = () => true;
const neverAvailable: CommandProber = () => false;

beforeEach(() => {
  mockedResolveRoot.mockReturnValue('/fake/project/root');
  mockedGetLang.mockReturnValue('en');
  mockedLoadConfig.mockReset();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

// ─── buildCuStatusReport (pure) ─────────────────────────────────────────────

describe('buildCuStatusReport', () => {
  it('reports disabled + honest reason when config is entirely absent (no probing needed)', () => {
    const report = buildCuStatusReport(undefined, 'linux', alwaysAvailable);
    expect(report.enabled).toBe(false);
    expect(report.reason).toBeTruthy();
    expect(report.allowedCapabilities).toEqual([]);
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(report.capabilities[kind].available).toBe(false);
    }
  });

  it('reports enabled + full capability matrix when flag on and prober says everything present', () => {
    const report = buildCuStatusReport(ENABLED_ALL, 'linux', alwaysAvailable);
    expect(report.enabled).toBe(true);
    expect(report.platformKnown).toBe(true);
    expect(report.allowedCapabilities).toEqual([...COMPUTER_USE_ACTION_KINDS]);
    expect(report.capabilities.screenshot.available).toBe(true);
    expect(report.capabilities.click.available).toBe(true);
    expect(report.capabilities.type.available).toBe(true);
    // navigate is honestly not-implemented regardless of prober (dilim-2 contract)
    expect(report.capabilities.navigate.available).toBe(false);
    expect(report.capabilities.navigate.reason).toMatch(/browser driver bridge/i);
  });

  it('reports each capability unavailable with a reason when the prober finds nothing', () => {
    const report = buildCuStatusReport(ENABLED_ALL, 'linux', neverAvailable);
    expect(report.enabled).toBe(true);
    expect(report.capabilities.screenshot.available).toBe(false);
    expect(report.capabilities.screenshot.reason).toBeTruthy();
  });

  it('marks an unknown platform honestly unavailable without probing', () => {
    const prober = vi.fn(alwaysAvailable);
    const report = buildCuStatusReport(ENABLED_ALL, 'freebsd', prober);
    expect(report.enabled).toBe(true);
    expect(report.platformKnown).toBe(false);
    expect(prober).not.toHaveBeenCalled();
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(report.capabilities[kind].available).toBe(false);
      expect(report.capabilities[kind].reason).toMatch(/unsupported platform 'freebsd'/);
    }
  });

  it('applies reasonOverride in place of the default disabled reason (config-load-error path)', () => {
    const report = buildCuStatusReport(undefined, 'linux', alwaysAvailable, 'config load failed: boom');
    expect(report.enabled).toBe(false);
    expect(report.reason).toBe('config load failed: boom');
  });

  it('grants exactly the allowlisted subset (darwin, click+type only)', () => {
    const report = buildCuStatusReport(
      { enabled: true, allowed_capabilities: ['click', 'type'] },
      'darwin',
      alwaysAvailable,
    );
    expect(report.allowedCapabilities).toEqual(['click', 'type']);
    expect(report.capabilities.screenshot.available).toBe(false);
    expect(report.capabilities.click.available).toBe(true);
    expect(report.capabilities.type.available).toBe(true);
  });
});

// ─── detectCuPlatform / realCommandProber (light sanity — no real spawn assumed) ──

describe('detectCuPlatform', () => {
  it('returns one of the 4 known platform ids or null on this host', () => {
    const result = detectCuPlatform();
    expect(result === null || ['linux', 'wsl', 'darwin', 'win32'].includes(result)).toBe(true);
  });
});

describe('realCommandProber', () => {
  it('never throws and returns a boolean for a real probe (used only as a smoke — not part of goCriteria)', () => {
    expect(() => realCommandProber('definitely-not-a-real-binary-xyz')).not.toThrow();
    expect(typeof realCommandProber('node')).toBe('boolean');
  });
});

// ─── Rendering ──────────────────────────────────────────────────────────────

describe('formatCuStatusJson', () => {
  it('serializes the full report shape', () => {
    const report = buildCuStatusReport(ENABLED_ALL, 'linux', alwaysAvailable);
    const parsed = JSON.parse(formatCuStatusJson(report)) as CuStatusReport;
    expect(parsed.enabled).toBe(true);
    expect(parsed.platform).toBe('linux');
    expect(parsed.capabilities.screenshot.available).toBe(true);
  });
});

describe('formatCuStatusTable', () => {
  it('renders the honest disabled + how-to-enable hint (en)', () => {
    const report = buildCuStatusReport(undefined, 'linux', alwaysAvailable);
    const lines = formatCuStatusTable(report, 'en').join('\n');
    expect(lines).toContain('Flag: disabled');
    expect(lines).toContain('To enable:');
  });

  it('renders the Turkish disabled hint', () => {
    const report = buildCuStatusReport(undefined, 'linux', alwaysAvailable);
    const lines = formatCuStatusTable(report, 'tr').join('\n');
    expect(lines).toContain('Bayrak: kapalı');
    expect(lines).toContain('Açmak için:');
  });

  it('renders all 4 capability kinds when enabled', () => {
    const report = buildCuStatusReport(ENABLED_ALL, 'linux', alwaysAvailable);
    const lines = formatCuStatusTable(report, 'en').join('\n');
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(lines).toContain(kind);
    }
    expect(lines).toContain('Flag: enabled');
  });

  it('surfaces the unsupported-platform warning line', () => {
    const report = buildCuStatusReport(ENABLED_ALL, 'freebsd', alwaysAvailable);
    const lines = formatCuStatusTable(report, 'en').join('\n');
    expect(lines).toContain('unsupported');
  });
});

// ─── runCuStatusCommand — `deckent cu-status [--json]` ────────────────────────

describe('runCuStatusCommand', () => {
  it('--json reports an honest disabled status when computer_use is absent from config', async () => {
    mockedLoadConfig.mockResolvedValue({} as Awaited<ReturnType<typeof loadConfig>>);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runCuStatusCommand({ json: true }, alwaysAvailable, 'linux');
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed) as CuStatusReport;
    expect(parsed.enabled).toBe(false);
    expect(parsed.reason).toBeTruthy();
    expect(process.exitCode).toBeUndefined();
  });

  it('--json reports full capability matrix when computer_use is enabled', async () => {
    mockedLoadConfig.mockResolvedValue({ computer_use: ENABLED_ALL } as unknown as Awaited<ReturnType<typeof loadConfig>>);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runCuStatusCommand({ json: true }, alwaysAvailable, 'linux');
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed) as CuStatusReport;
    expect(parsed.enabled).toBe(true);
    expect(parsed.capabilities.screenshot.available).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it('renders a human table (non-JSON) by default', async () => {
    mockedLoadConfig.mockResolvedValue({ computer_use: ENABLED_ALL } as unknown as Awaited<ReturnType<typeof loadConfig>>);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runCuStatusCommand({}, alwaysAvailable, 'linux');
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('Computer-Use Status');
    expect(process.exitCode).toBeUndefined();
  });

  it('degrades to an honest config-load-error reason (never throws, never non-zero exit)', async () => {
    mockedLoadConfig.mockRejectedValue(new Error('boom'));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await expect(runCuStatusCommand({ json: true }, alwaysAvailable, 'linux')).resolves.toBeUndefined();
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed) as CuStatusReport;
    expect(parsed.enabled).toBe(false);
    expect(parsed.reason).toContain('boom');
    expect(process.exitCode).toBeUndefined();
  });

  it('renders the Turkish header when getLangFromConfig returns tr', async () => {
    mockedGetLang.mockReturnValue('tr');
    mockedLoadConfig.mockResolvedValue({} as Awaited<ReturnType<typeof loadConfig>>);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runCuStatusCommand({}, alwaysAvailable, 'linux');
    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    expect(printed).toContain('Bilgisayar-Kullanımı Durumu');
  });
});

// ─── CLI wiring (commander) ────────────────────────────────────────────────

describe('registerCuStatus (CLI wiring)', () => {
  it('registers a working `cu-status --json` command', async () => {
    mockedLoadConfig.mockResolvedValue({} as Awaited<ReturnType<typeof loadConfig>>);
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const { Command } = await import('commander');
    const program = new Command();
    program.exitOverride();
    registerCuStatus(program);
    await program.parseAsync(['node', 'test', 'cu-status', '--json']);

    const printed = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    writeSpy.mockRestore();

    const parsed = JSON.parse(printed) as CuStatusReport;
    expect(parsed.enabled).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });
});
