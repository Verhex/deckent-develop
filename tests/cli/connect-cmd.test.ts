import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────
//
// Only `createDefaultConnectProbes` is mocked — everything else re-exported
// from connect-wizard.js (detectRuntime, planConnectSteps, CONNECT_PROVIDERS)
// stays the REAL, already-tested (tests/cli/connect-wizard.test.ts) pure core.
// This is the "injected-probe matrix" the goCriteria asks for: real detection/
// planning logic, fake I/O at the seam.

vi.mock('../../src/cli/helpers/connect-wizard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/connect-wizard.js')>();
  return {
    ...actual,
    createDefaultConnectProbes: vi.fn(),
  };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import {
  createDefaultConnectProbes,
  CONNECT_PROVIDERS,
  type ConnectRuntimeProbes,
} from '../../src/cli/helpers/connect-wizard.js';
import type { ProviderAvailabilityDetail } from '../../src/core/provider.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import {
  registerConnect,
  resolveConnectTarget,
  isConnectProviderName,
  formatConnectReport,
  type ConnectJsonReport,
} from '../../src/cli/commands/connect.js';
import type { RuntimeDetection, ConnectStep } from '../../src/cli/helpers/connect-wizard.js';

// ─── Probe Fixtures (mirrors tests/cli/connect-wizard.test.ts conventions) ──

function diag(name: string, overrides: Partial<ProviderAvailabilityDetail> = {}): ProviderAvailabilityDetail {
  return {
    name,
    binaryFound: true,
    version: '1.0.0',
    versionStatus: 'ok',
    authMethod: 'session',
    authStatus: 'ok',
    available: true,
    partial: false,
    models: [],
    reason: 'ok',
    hints: [],
    ...overrides,
  };
}

function healthyProbes(overrides: Partial<ConnectRuntimeProbes> = {}): ConnectRuntimeProbes {
  return {
    providerDiagnostics: async () => CONNECT_PROVIDERS.map((n) => diag(n)),
    providerAuth: async () => ({ state: 'logged-in' }),
    mcpAttach: (host) => ({ host, supported: true, attached: true, toolCount: 31 }),
    ide: () => 'claude-code',
    winShell: () => ({ isWindows: false, isWSL: false, shell: 'posix' }),
    ...overrides,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerConnect(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

function lastJsonPrint(): ConnectJsonReport {
  const calls = vi.mocked(print).mock.calls;
  const last = calls[calls.length - 1]?.[0];
  expect(typeof last).toBe('string');
  return JSON.parse(last as string) as ConnectJsonReport;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('connect command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers a connect command with --provider and --json options', () => {
    const program = new Command();
    registerConnect(program);
    const cmd = program.commands.find((c) => c.name() === 'connect');
    expect(cmd).toBeDefined();
    const optionNames = cmd!.options.map((o) => o.long);
    expect(optionNames).toContain('--provider');
    expect(optionNames).toContain('--json');
  });

  it('--json reports a fully-connected matrix with zero steps and no error exit', async () => {
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());
    await runCommand(['connect', '--json']);

    const report = lastJsonPrint();
    expect(report.target).toEqual({ kind: 'all' });
    expect(report.detection.providers).toHaveLength(3);
    expect(report.detection.providers.every((p) => p.authState === 'logged-in')).toBe(true);
    expect(report.steps).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it('--json surfaces suggested steps and exits 1 when a provider is logged out', async () => {
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes({
      providerAuth: async (provider) =>
        provider === 'codex' ? { state: 'logged-out', detail: 'run: codex login' } : { state: 'logged-in' },
    }));
    await runCommand(['connect', '--json']);

    const report = lastJsonPrint();
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]).toMatchObject({ descriptionKey: 'connect.step.login', descriptionParams: { provider: 'codex' } });
    expect(process.exitCode).toBe(1);
  });

  it('--provider scopes detection/planning to a single provider target', async () => {
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes({
      providerDiagnostics: async () => [diag('claude'), diag('codex', { binaryFound: false, version: undefined }), diag('gemini')],
    }));
    await runCommand(['connect', '--provider', 'codex', '--json']);

    const report = lastJsonPrint();
    expect(report.target).toEqual({ kind: 'provider', provider: 'codex' });
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0]?.descriptionKey).toBe('connect.step.install_cli');
    expect(process.exitCode).toBe(1);
  });

  it('rejects an unknown --provider value without crashing or probing', async () => {
    await runCommand(['connect', '--provider', 'bogus']);

    expect(printError).toHaveBeenCalledWith(expect.stringContaining('Unknown provider "bogus"'));
    expect(process.exitCode).toBe(1);
    expect(createDefaultConnectProbes).not.toHaveBeenCalled();
  });

  it('prints a human-readable summary with provider/mcp/ide/shell sections', async () => {
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());
    await runCommand(['connect']);

    const calls = vi.mocked(print).mock.calls.map((c) => c[0] as string);
    const output = calls.join('\n');
    expect(output).toContain('Providers:');
    expect(output).toContain('MCP Attach:');
    expect(output).toContain('IDE: claude-code');
    expect(output).toContain('Shell: posix');
    expect(output).toContain('Status: fully connected');
    expect(process.exitCode).toBeUndefined();
  });

  it('renders suggested steps through the real i18n connect.step.* messages', async () => {
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes({
      providerAuth: async (provider) =>
        provider === 'gemini' ? { state: 'logged-out' } : { state: 'logged-in' },
    }));
    await runCommand(['connect']);

    const output = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(output).toContain('Log in to gemini.');
    expect(process.exitCode).toBe(1);
  });
});

// ─── Pure helpers ────────────────────────────────────────────────────

describe('resolveConnectTarget', () => {
  it('defaults to the all target when no --provider is given', () => {
    expect(resolveConnectTarget({})).toEqual({ kind: 'all' });
  });

  it.each(CONNECT_PROVIDERS)('accepts each known provider name: %s', (name) => {
    expect(resolveConnectTarget({ provider: name })).toEqual({ kind: 'provider', provider: name });
  });

  it('returns an error object (never throws) for an unknown provider name', () => {
    const result = resolveConnectTarget({ provider: 'not-a-provider' });
    expect(result).toHaveProperty('error');
    expect((result as { error: string }).error).toContain('claude, codex, gemini');
  });
});

describe('isConnectProviderName', () => {
  it('accepts claude/codex/gemini and rejects everything else', () => {
    expect(isConnectProviderName('claude')).toBe(true);
    expect(isConnectProviderName('codex')).toBe(true);
    expect(isConnectProviderName('gemini')).toBe(true);
    expect(isConnectProviderName('ollama')).toBe(false);
    expect(isConnectProviderName('')).toBe(false);
  });
});

describe('formatConnectReport', () => {
  const HEALTHY: RuntimeDetection = {
    providers: CONNECT_PROVIDERS.map((name) => ({ name, cliAvailable: true, version: '1.0.0', authState: 'logged-in' as const })),
    mcp: CONNECT_PROVIDERS.map((host) => ({ host, supported: true, attached: true, toolCount: 31 })),
    ide: { environment: 'claude-code' },
    winShell: { isWindows: false, isWSL: false, shell: 'posix' },
  };

  it('reports fully-connected with no steps', () => {
    const text = formatConnectReport(HEALTHY, [], 'en');
    expect(text).toContain('Status: fully connected — no action needed.');
  });

  it('lists each suggested step with its risk level and localized description', () => {
    const steps: ConnectStep[] = [
      { command: ['codex', 'login'], descriptionKey: 'connect.step.login', descriptionParams: { provider: 'codex' }, risk: 'caution' },
    ];
    const text = formatConnectReport(HEALTHY, steps, 'en');
    expect(text).toContain('[caution] Log in to codex. — codex login');
  });

  it('renders in Turkish when lang=tr', () => {
    const steps: ConnectStep[] = [
      { command: ['codex', 'login'], descriptionKey: 'connect.step.login', descriptionParams: { provider: 'codex' }, risk: 'caution' },
    ];
    const text = formatConnectReport(HEALTHY, steps, 'tr');
    expect(text).toContain('codex hesabına giriş yapın.');
  });
});
