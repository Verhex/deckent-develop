// PSL-6-DILIM (Sprint 369, Task 369-006) — wires 368-002's buildAuthStateReport
// (doctor.ts, config/env-based, no network) into `deckent connect`'s own
// report: per-provider connected/missing/unknown + a platform-appropriate
// guidance line when missing (which env var / .deck key + the $DECK: pattern)
// — the guidance NEVER prints a real secret value, only key NAMES.
//
// Hermetic: `resolveProjectRoot` is mocked to a path that does not exist on
// disk, so buildAuthStateReport's real (unmocked) `.deck` lookup naturally
// returns "not found" without touching node:fs mocks — same trick already
// used by tests/cli/connect-cmd.test.ts's '/mock/root'. Any real secret-like
// value used below lives only in a temporarily-set process.env var for the
// duration of one test and is restored afterwards.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

vi.mock('../../src/cli/helpers/connect-wizard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/connect-wizard.js')>();
  return {
    ...actual,
    createDefaultConnectProbes: vi.fn(),
  };
});

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/nonexistent-369-006-connect-auth-state-root'),
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
import { print } from '../../src/cli/helpers/output.js';
import { getLangFromConfig } from '../../src/cli/helpers/config-reader.js';
import {
  registerConnect,
  formatConnectReport,
  type ConnectJsonReport,
} from '../../src/cli/commands/connect.js';
import type { RuntimeDetection } from '../../src/cli/helpers/connect-wizard.js';
import type { AuthStateResult } from '../../src/cli/commands/doctor.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function detectionWith(shell: RuntimeDetection['winShell']['shell']): RuntimeDetection {
  return {
    providers: CONNECT_PROVIDERS.map((name) => ({ name, cliAvailable: true, version: '1.0.0', authState: 'logged-in' as const })),
    mcp: CONNECT_PROVIDERS.map((host) => ({ host, supported: true, attached: true, toolCount: 31 })),
    ide: { environment: 'claude-code' },
    winShell: { isWindows: shell !== 'posix' && shell !== 'wsl', isWSL: shell === 'wsl', shell },
  };
}

const THREE_STATES: AuthStateResult[] = [
  { provider: 'claude', state: 'connected' },
  { provider: 'codex', state: 'missing' },
  { provider: 'gemini', state: 'unknown' },
];

// ─── Pure formatConnectReport tests ─────────────────────────────────

describe('formatConnectReport — auth-state section (369-006)', () => {
  it('renders the 3-state lines (connected/missing/unknown) via the shared doctor.auth_state_* keys', () => {
    const text = formatConnectReport(detectionWith('posix'), [], 'en', THREE_STATES);
    expect(text).toContain('Auth State (config-based, no network):');
    expect(text).toContain('claude: connected');
    expect(text).toContain('codex: missing');
    expect(text).toContain('gemini: unknown');
  });

  it('renders localized Turkish state labels', () => {
    const text = formatConnectReport(detectionWith('posix'), [], 'tr', THREE_STATES);
    expect(text).toContain('claude: bağlı');
    expect(text).toContain('codex: eksik');
    expect(text).toContain('gemini: bilinmiyor');
  });

  it('adds a guidance hint ONLY for the missing provider, naming its env var + .deck key + $DECK: pattern', () => {
    const text = formatConnectReport(detectionWith('posix'), [], 'en', THREE_STATES);
    expect(text).toContain('Set OPENAI_API_KEY');
    expect(text).toContain('DECKENT_OPENAI_API_KEY');
    expect(text).toContain('$DECK:DECKENT_OPENAI_API_KEY');
    // connected/unknown providers get no guidance line at all.
    expect(text).not.toContain('Set ANTHROPIC_API_KEY');
    expect(text).not.toContain('Set GEMINI_API_KEY');
  });

  it('never prints a secret VALUE — the example command is always the literal placeholder <value>', () => {
    const text = formatConnectReport(detectionWith('posix'), [], 'en', THREE_STATES);
    expect(text).toContain('<value>');
    expect(text).not.toMatch(/OPENAI_API_KEY=(?!<value>)\S/);
  });

  it.each([
    ['posix', 'export OPENAI_API_KEY=<value>'],
    ['wsl', 'export OPENAI_API_KEY=<value>'],
    ['gitbash', 'export OPENAI_API_KEY=<value>'],
    ['powershell', '$env:OPENAI_API_KEY = "<value>"'],
    ['cmd', 'set OPENAI_API_KEY=<value>'],
  ] as const)('adapts the example command to the detected shell: %s', (shell, expected) => {
    const text = formatConnectReport(detectionWith(shell), [], 'en', [{ provider: 'codex', state: 'missing' }]);
    expect(text).toContain(expected);
  });

  it('omits the Auth State section entirely when no report is supplied (default param — backward compat)', () => {
    const text = formatConnectReport(detectionWith('posix'), [], 'en');
    expect(text).not.toContain('Auth State');
  });
});

// ─── Command-level integration (real buildAuthStateReport, hermetic root) ──

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

const SECRET_ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'DECKENT_CLAUDE_API_KEY',
  'OPENAI_API_KEY', 'DECKENT_OPENAI_API_KEY',
  'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'DECKENT_GOOGLE_API_KEY',
] as const;

describe('deckent connect — buildAuthStateReport integration (config-based, no network)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLangFromConfig).mockReturnValue('en');
    process.exitCode = undefined;
    for (const key of SECRET_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.exitCode = undefined;
    for (const key of SECRET_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('reflects real env state as connected/missing (3 providers) with zero mocking of buildAuthStateReport itself', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-only-not-a-real-secret';
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());

    await runCommand(['connect', '--json']);

    const report = lastJsonPrint();
    expect(report.authState.find((r) => r.provider === 'claude')?.state).toBe('connected');
    expect(report.authState.find((r) => r.provider === 'codex')?.state).toBe('missing');
    expect(report.authState.find((r) => r.provider === 'gemini')?.state).toBe('missing');
  });

  it('NEVER leaks a real secret value into text or JSON output — only key NAMES appear', async () => {
    const REAL_LOOKING_SECRET = 'sk-ant-api03-VERY-SENSITIVE-9f8a7b6c5d4e3f2a1b';
    process.env['ANTHROPIC_API_KEY'] = REAL_LOOKING_SECRET;
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());

    await runCommand(['connect']);
    const textOutput = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(textOutput).not.toContain(REAL_LOOKING_SECRET);
    expect(textOutput).toContain('claude: connected');
    expect(textOutput).toContain('OPENAI_API_KEY');

    vi.clearAllMocks();
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());
    await runCommand(['connect', '--json']);
    const jsonOutput = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(jsonOutput).not.toContain(REAL_LOOKING_SECRET);
  });

  it('is diagnostic-only for auth state too: no login flow is triggered and no network call is made', async () => {
    // healthyProbes' providerAuth is a stub that never spawns a CLI or hits a
    // network endpoint; buildAuthStateReport itself only reads process.env and
    // (via the real, unmocked loadDeckSecrets) a `.deck` file under a root that
    // does not exist on disk. If either surfaced a real login flow, the run
    // above would hang or require --force login command detail; it does not.
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());
    await runCommand(['connect', '--json']);
    const report = lastJsonPrint();
    expect(report.authState).toHaveLength(3);
    expect(report.authState.every((r) => r.state === 'connected' || r.state === 'missing' || r.state === 'unknown')).toBe(true);
  });
});

// ─── Guidance/doctor drift guard (370-002, DEBT-369-CLOSE) ──────────────────
//
// connect.ts's AUTH_STATE_GUIDANCE is an unexported, hand-maintained mirror of
// doctor.ts's own unexported AUTH_STATE_ENV_KEYS/AUTH_STATE_DECK_KEYS (see the
// design note left in 369-006's result — doctor.ts is outside this task's
// write scope, so exporting the maps to remove the duplication outright stays
// a follow-up). Until then, this suite ties connect.ts's STATIC guidance text
// to doctor.ts's ACTUAL runtime behavior end-to-end: for each provider, it
// sets exactly the env var named in that provider's rendered hint and asserts
// the REAL (unmocked) buildAuthStateReport flips that provider — and only
// that provider — to 'connected'. If the two source files ever drift (a
// renamed/reordered key in one but not the other), this test fails instead of
// deckent silently telling a user to set an env var that doctor.ts does not
// actually recognize.
describe('AUTH_STATE_GUIDANCE / doctor.ts env-key sync guard (370-002)', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLangFromConfig).mockReturnValue('en');
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());
    process.exitCode = undefined;
    for (const key of SECRET_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.exitCode = undefined;
    for (const key of SECRET_ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it.each([
    ['claude', 'ANTHROPIC_API_KEY'],
    ['codex', 'OPENAI_API_KEY'],
    ['gemini', 'GEMINI_API_KEY'],
  ] as const)('the %s guidance hint names an env var (%s) that doctor.ts actually honors', async (provider, envKey) => {
    // First confirm the hint text names this exact env var (pins the mirror's
    // CURRENT value so a silent connect.ts-side rename is also caught).
    await runCommand(['connect']);
    const hintText = vi.mocked(print).mock.calls.map((c) => c[0] as string).join('\n');
    expect(hintText).toContain(`Set ${envKey}`);

    // Then prove the SAME key flips the REAL, unmocked doctor.ts probe.
    vi.clearAllMocks();
    vi.mocked(createDefaultConnectProbes).mockReturnValue(healthyProbes());
    process.env[envKey] = 'drift-guard-test-value-not-a-real-secret';
    await runCommand(['connect', '--json']);
    const report = lastJsonPrint();

    expect(report.authState.find((r) => r.provider === provider)?.state).toBe('connected');
    for (const other of report.authState.filter((r) => r.provider !== provider)) {
      expect(other.state).not.toBe('connected');
    }
  });
});
