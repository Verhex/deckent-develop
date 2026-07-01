import { describe, it, expect } from 'vitest';
import {
  detectRuntime,
  planConnectSteps,
  detectWinShell,
  CONNECT_PROVIDERS,
  type ConnectRuntimeProbes,
  type RuntimeDetection,
  type ConnectProviderDetection,
  type ConnectMcpDetection,
  type ConnectTarget,
} from '../../src/cli/helpers/connect-wizard.js';
import { planInstall } from '../../src/core/provisioner.js';
import { getAttachCommand } from '../../src/cli/helpers/mcp-attach.js';
import type { ProviderAvailabilityDetail } from '../../src/core/provider.js';
import type { McpAttachStatus } from '../../src/cli/helpers/mcp-attach.js';

// TERM-CONNECT (Sprint 353, Task 353-010): pure core for the `/connect`
// wizard. Every probe is injected here — no real CLI exec / file reads ever
// happen in this suite, matching provider-auth-probe.test.ts / mcp-attach.test.ts
// hermeticity conventions.

// ─── Probe Fixtures ──────────────────────────────────────────────────────

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

function mcpStatus(host: 'claude' | 'codex' | 'gemini', overrides: Partial<McpAttachStatus> = {}): McpAttachStatus {
  return { host, supported: true, attached: true, toolCount: 31, ...overrides };
}

/** All-connected baseline: every probe reports a fully healthy environment. */
function baselineProbes(overrides: Partial<ConnectRuntimeProbes> = {}): ConnectRuntimeProbes {
  return {
    providerDiagnostics: async () => CONNECT_PROVIDERS.map((n) => diag(n)),
    providerAuth: async () => ({ state: 'logged-in', detail: 'ok' }),
    mcpAttach: (host) => mcpStatus(host),
    ide: () => 'claude-code',
    winShell: () => ({ isWindows: false, isWSL: false, shell: 'posix' }),
    ...overrides,
  };
}

// ─── detectRuntime — probe matrix ────────────────────────────────────────

describe('detectRuntime', () => {
  it('reports a fully connected matrix when every probe is healthy', async () => {
    const detection = await detectRuntime(baselineProbes());
    expect(detection.providers).toHaveLength(3);
    expect(detection.providers.every((p) => p.cliAvailable && p.authState === 'logged-in')).toBe(true);
    expect(detection.mcp.every((m) => m.supported && m.attached)).toBe(true);
    expect(detection.ide.environment).toBe('claude-code');
    expect(detection.winShell.shell).toBe('posix');
  });

  it('preserves CONNECT_PROVIDERS order for providers[] and mcp[] regardless of probe resolution order', async () => {
    const calledAuthFor: string[] = [];
    const detection = await detectRuntime(baselineProbes({
      providerAuth: async (provider) => {
        calledAuthFor.push(provider);
        // resolve gemini "first" to prove array order tracks input order, not resolution order
        if (provider === 'gemini') return { state: 'logged-in' };
        return { state: 'logged-in' };
      },
    }));
    expect(detection.providers.map((p) => p.name)).toEqual(['claude', 'codex', 'gemini']);
    expect(detection.mcp.map((m) => m.host)).toEqual(['claude', 'codex', 'gemini']);
    expect(calledAuthFor).toEqual(['claude', 'codex', 'gemini']);
  });

  it('marks a provider CLI-missing when diagnostics report binaryFound=false', async () => {
    const detection = await detectRuntime(baselineProbes({
      providerDiagnostics: async () => [
        diag('claude', { binaryFound: false, version: undefined }),
        diag('codex'),
        diag('gemini'),
      ],
    }));
    const claude = detection.providers.find((p) => p.name === 'claude')!;
    expect(claude.cliAvailable).toBe(false);
    expect(claude.version).toBeUndefined();
  });

  it('surfaces the GAP-4 distinction: CLI present but auth logged-out', async () => {
    const detection = await detectRuntime(baselineProbes({
      providerAuth: async (provider) =>
        provider === 'codex'
          ? { state: 'logged-out', detail: 'codex login status: not logged in — run: codex login' }
          : { state: 'logged-in' },
    }));
    const codex = detection.providers.find((p) => p.name === 'codex')!;
    expect(codex.cliAvailable).toBe(true);
    expect(codex.authState).toBe('logged-out');
    expect(codex.authDetail).toContain('codex login');
  });

  it('reports unknown auth state without inventing a confident answer', async () => {
    const detection = await detectRuntime(baselineProbes({
      providerAuth: async () => ({ state: 'unknown', detail: 'auth probe timed out' }),
    }));
    expect(detection.providers.every((p) => p.authState === 'unknown')).toBe(true);
  });

  it('mcp: unsupported host vs supported-but-unattached vs fully attached', async () => {
    const detection = await detectRuntime(baselineProbes({
      mcpAttach: (host) => {
        if (host === 'claude') return mcpStatus('claude', { supported: false, attached: false, reason: 'no mcp subcommand' });
        if (host === 'codex') return mcpStatus('codex', { attached: false, reason: 'not in mcp list' });
        return mcpStatus('gemini');
      },
    }));
    expect(detection.mcp).toEqual([
      { host: 'claude', supported: false, attached: false, toolCount: 31, reason: 'no mcp subcommand' },
      { host: 'codex', supported: true, attached: false, toolCount: 31, reason: 'not in mcp list' },
      { host: 'gemini', supported: true, attached: true, toolCount: 31, reason: undefined },
    ]);
  });

  it.each(['claude-code', 'cursor', 'terminal'] as const)('ide: %s passes through verbatim', async (env) => {
    const detection = await detectRuntime(baselineProbes({ ide: () => env }));
    expect(detection.ide.environment).toBe(env);
  });

  it.each([
    { isWindows: true, isWSL: true, shell: 'wsl' as const },
    { isWindows: true, isWSL: false, shell: 'powershell' as const },
    { isWindows: true, isWSL: false, shell: 'cmd' as const },
    { isWindows: true, isWSL: false, shell: 'gitbash' as const },
    { isWindows: false, isWSL: false, shell: 'posix' as const },
  ])('winShell: passes through %j verbatim', async (shape) => {
    const detection = await detectRuntime(baselineProbes({ winShell: () => shape }));
    expect(detection.winShell).toEqual(shape);
  });
});

// ─── detectWinShell — pure classifier ────────────────────────────────────

describe('detectWinShell', () => {
  it('WSL wins even though os.platform() reports linux inside WSL2', () => {
    expect(detectWinShell('linux', {}, true)).toEqual({ isWindows: true, isWSL: true, shell: 'wsl' });
  });

  it('non-Windows, non-WSL → posix', () => {
    expect(detectWinShell('darwin', {}, false)).toEqual({ isWindows: false, isWSL: false, shell: 'posix' });
    expect(detectWinShell('linux', {}, false)).toEqual({ isWindows: false, isWSL: false, shell: 'posix' });
  });

  it('native Windows + MSYSTEM set → gitbash', () => {
    expect(detectWinShell('win32', { MSYSTEM: 'MINGW64' }, false)).toEqual({
      isWindows: true, isWSL: false, shell: 'gitbash',
    });
  });

  it('native Windows + PSModulePath set (no MSYSTEM) → powershell', () => {
    expect(detectWinShell('win32', { PSModulePath: 'C:\\ps' }, false)).toEqual({
      isWindows: true, isWSL: false, shell: 'powershell',
    });
  });

  it('native Windows + neither env var → cmd fallback', () => {
    expect(detectWinShell('win32', {}, false)).toEqual({ isWindows: true, isWSL: false, shell: 'cmd' });
  });

  it('MSYSTEM takes priority over PSModulePath when both are set', () => {
    expect(detectWinShell('win32', { MSYSTEM: 'MINGW64', PSModulePath: 'C:\\ps' }, false).shell).toBe('gitbash');
  });
});

// ─── planConnectSteps — deterministic step planning ─────────────────────

const HEALTHY: RuntimeDetection = {
  providers: CONNECT_PROVIDERS.map((name): ConnectProviderDetection => ({
    name, cliAvailable: true, version: '1.0.0', authState: 'logged-in',
  })),
  mcp: CONNECT_PROVIDERS.map((host): ConnectMcpDetection => ({
    host, supported: true, attached: true, toolCount: 31,
  })),
  ide: { environment: 'claude-code' },
  winShell: { isWindows: false, isWSL: false, shell: 'posix' },
};

describe('planConnectSteps — provider target', () => {
  it('a fully healthy provider needs zero steps', () => {
    expect(planConnectSteps(HEALTHY, { kind: 'provider', provider: 'claude' })).toEqual([]);
  });

  it('missing CLI → install step sourced from planInstall (real reuse, not invented)', () => {
    const detection: RuntimeDetection = {
      ...HEALTHY,
      providers: HEALTHY.providers.map((p) => p.name === 'codex' ? { ...p, cliAvailable: false } : p),
    };
    const steps = planConnectSteps(detection, { kind: 'provider', provider: 'codex' });
    const expectedPlan = planInstall('codex');
    expect(steps).toEqual([{
      command: [expectedPlan.command, ...expectedPlan.args],
      descriptionKey: 'connect.step.install_cli',
      descriptionParams: { provider: 'codex', instruction: expectedPlan.instruction },
      risk: 'caution',
    }]);
  });

  it('CLI present but not logged in → login step, CLI takes priority when both are missing', () => {
    const detection: RuntimeDetection = {
      ...HEALTHY,
      providers: HEALTHY.providers.map((p) => p.name === 'gemini' ? { ...p, authState: 'logged-out' } : p),
    };
    const steps = planConnectSteps(detection, { kind: 'provider', provider: 'gemini' });
    expect(steps).toEqual([{
      command: ['gemini'],
      descriptionKey: 'connect.step.login',
      descriptionParams: { provider: 'gemini' },
      risk: 'caution',
    }]);
  });

  it('unknown provider name resolves to an empty step list, not a throw', () => {
    expect(planConnectSteps(HEALTHY, { kind: 'provider' })).toEqual([]);
  });
});

describe('planConnectSteps — mcp target', () => {
  it('unsupported host → info-only advisory step (no command)', () => {
    const detection: RuntimeDetection = {
      ...HEALTHY,
      mcp: HEALTHY.mcp.map((m) => m.host === 'codex' ? { ...m, supported: false, attached: false } : m),
    };
    const steps = planConnectSteps(detection, { kind: 'mcp', provider: 'codex' });
    expect(steps).toEqual([{
      command: [],
      descriptionKey: 'connect.step.mcp_unsupported',
      descriptionParams: { host: 'codex' },
      risk: 'info',
    }]);
  });

  it('supported but unattached → attach step sourced from getAttachCommand (real reuse)', () => {
    const detection: RuntimeDetection = {
      ...HEALTHY,
      mcp: HEALTHY.mcp.map((m) => m.host === 'claude' ? { ...m, attached: false } : m),
    };
    const steps = planConnectSteps(detection, { kind: 'mcp', provider: 'claude' });
    const expected = getAttachCommand('claude')!;
    expect(steps).toEqual([{
      command: [expected.add.cmd, ...expected.add.args],
      descriptionKey: 'connect.step.attach_mcp',
      descriptionParams: { host: 'claude' },
      risk: 'safe',
    }]);
  });

  it('already attached → zero steps', () => {
    expect(planConnectSteps(HEALTHY, { kind: 'mcp', provider: 'gemini' })).toEqual([]);
  });
});

describe('planConnectSteps — ide target', () => {
  it('claude-code needs nothing', () => {
    expect(planConnectSteps({ ...HEALTHY, ide: { environment: 'claude-code' } }, { kind: 'ide' })).toEqual([]);
  });

  it('cursor gets a concrete deckent init --cursor step', () => {
    const steps = planConnectSteps({ ...HEALTHY, ide: { environment: 'cursor' } }, { kind: 'ide' });
    expect(steps).toEqual([{
      command: ['deckent', 'init', '--cursor'],
      descriptionKey: 'connect.step.ide_cursor_setup',
      risk: 'safe',
    }]);
  });

  it('terminal gets an advisory-only step (no command)', () => {
    const steps = planConnectSteps({ ...HEALTHY, ide: { environment: 'terminal' } }, { kind: 'ide' });
    expect(steps).toEqual([{
      command: [],
      descriptionKey: 'connect.step.ide_terminal_guidance',
      risk: 'info',
    }]);
  });
});

describe('planConnectSteps — winShell target', () => {
  it('native Windows (non-WSL) → wsl --install recommendation', () => {
    const detection: RuntimeDetection = { ...HEALTHY, winShell: { isWindows: true, isWSL: false, shell: 'cmd' } };
    const steps = planConnectSteps(detection, { kind: 'winShell' });
    expect(steps).toEqual([{
      command: ['wsl', '--install'],
      descriptionKey: 'connect.step.wsl_recommended',
      descriptionParams: { shell: 'cmd' },
      risk: 'caution',
    }]);
  });

  it('WSL already in use → zero steps', () => {
    const detection: RuntimeDetection = { ...HEALTHY, winShell: { isWindows: true, isWSL: true, shell: 'wsl' } };
    expect(planConnectSteps(detection, { kind: 'winShell' })).toEqual([]);
  });

  it('posix host → zero steps', () => {
    expect(planConnectSteps(HEALTHY, { kind: 'winShell' })).toEqual([]);
  });
});

describe('planConnectSteps — all target', () => {
  it('a fully healthy matrix needs zero steps across every dimension', () => {
    expect(planConnectSteps(HEALTHY, { kind: 'all' })).toEqual([]);
  });

  it('concatenates in fixed dimension order: providers, then mcp, then ide, then winShell', () => {
    const detection: RuntimeDetection = {
      providers: HEALTHY.providers.map((p) => p.name === 'claude' ? { ...p, cliAvailable: false } : p),
      mcp: HEALTHY.mcp.map((m) => m.host === 'codex' ? { ...m, attached: false } : m),
      ide: { environment: 'cursor' },
      winShell: { isWindows: true, isWSL: false, shell: 'powershell' },
    };
    const steps = planConnectSteps(detection, { kind: 'all' });
    expect(steps.map((s) => s.descriptionKey)).toEqual([
      'connect.step.install_cli',   // claude, providers dimension
      'connect.step.attach_mcp',    // codex, mcp dimension
      'connect.step.ide_cursor_setup',
      'connect.step.wsl_recommended',
    ]);
  });

  it('is deterministic — identical input yields deep-equal output on repeat calls', () => {
    const target: ConnectTarget = { kind: 'all' };
    const first = planConnectSteps(HEALTHY, target);
    const second = planConnectSteps(HEALTHY, target);
    expect(first).toEqual(second);
  });
});
