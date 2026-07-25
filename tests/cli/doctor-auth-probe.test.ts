// Task 270-006 — doctor wire: PSL-6 auth-probe lines.
//
// Verifies that probeProviderAuth (Task 270-005) is surfaced in the doctor
// Provider Health section: a provider whose CLI is installed but has no usable
// session is downgraded from the legacy "session auth active" PASS line to an
// actionable [WARN] "CLI present but NOT logged in — run <cmd>" line.
//
// Hermetic: runAuthProbes is exercised with an INJECTED probe fn (no real fs /
// spawn / network); the formatters are pure and read only a guaranteed-absent
// '/mock/root' path for the unrelated .deck status line.

import { describe, it, expect, vi } from 'vitest';
import {
  runAuthProbes,
  reconcileProviderDiagnosticsAuth,
  buildProviderDiagnosticAuthChecks,
  formatProviderDiagnosticsActionable,
  formatConnectorHealthLines,
  formatHumanDoctor,
} from '../../src/cli/commands/doctor.js';
import type { HumanDoctorInput } from '../../src/cli/commands/doctor.js';
import type { AuthProbeResult } from '../../src/core/provider-auth-probe.js';
import type { DetectedProvider } from '../../src/core/provider.js';
import type { ProviderAvailabilityDetail } from '../../src/core/provider.js';
import type { HealthCheckResult } from '../../src/orchestra/connector.js';

// ─── helpers ─────────────────────────────────────────────────────────

function makeProvider(
  name: string,
  available: boolean,
  authMethod: 'session' | 'api_key' | 'none' = 'session',
  version?: string,
): DetectedProvider {
  return {
    name: name as DetectedProvider['name'],
    available,
    version,
    authMethod,
    models: [] as unknown as DetectedProvider['models'],
  };
}

function makeHealthResult(
  provider: string,
  available: boolean,
  authStatus: 'ok' | 'missing' | 'expired' = 'ok',
  cliVersion: string | null = null,
): HealthCheckResult {
  return { provider: provider as HealthCheckResult['provider'], available, authStatus, cliVersion, error: null };
}

function makeDiagnostic(
  name: string,
  overrides: Partial<ProviderAvailabilityDetail> = {},
): ProviderAvailabilityDetail {
  return {
    name,
    binaryFound: true,
    versionStatus: 'ok',
    authMethod: 'session',
    authStatus: 'ok',
    available: true,
    partial: false,
    models: [],
    reason: 'adapter inferred session auth',
    hints: [],
    ...overrides,
  };
}

// ─── runAuthProbes ───────────────────────────────────────────────────

describe('runAuthProbes', () => {
  it('probes only available claude/codex/gemini and skips unavailable + unknown providers', async () => {
    const calls: string[] = [];
    const probe = vi.fn(async (name: string): Promise<AuthProbeResult> => {
      calls.push(name);
      return { state: 'logged-in' };
    });
    const providers = [
      makeProvider('claude', true),
      makeProvider('codex', false), // unavailable → skipped
      makeProvider('gemini', true),
      makeProvider('ollama', true), // not a probe target → skipped
    ];

    const result = await runAuthProbes(providers, probe);

    expect(calls.sort()).toEqual(['claude', 'gemini']);
    expect(result['claude']?.state).toBe('logged-in');
    expect(result['gemini']?.state).toBe('logged-in');
    expect(result['codex']).toBeUndefined();
    expect(result['ollama']).toBeUndefined();
  });

  it('runs every target probe (parallel Promise.all) and aggregates all results', async () => {
    const probe = vi.fn(async (name: string): Promise<AuthProbeResult> =>
      name === 'codex' ? { state: 'logged-out' } : { state: 'logged-in' },
    );
    const providers = [
      makeProvider('claude', true),
      makeProvider('codex', true),
      makeProvider('gemini', true),
    ];

    const result = await runAuthProbes(providers, probe);

    expect(probe).toHaveBeenCalledTimes(3);
    expect(Object.keys(result).sort()).toEqual(['claude', 'codex', 'gemini']);
    expect(result['codex']?.state).toBe('logged-out');
  });

  it('degrades a throwing probe to state "unknown" (never rejects)', async () => {
    const probe = vi.fn(async (name: string): Promise<AuthProbeResult> => {
      if (name === 'codex') throw new Error('boom');
      return { state: 'logged-in' };
    });
    const providers = [makeProvider('claude', true), makeProvider('codex', true)];

    const result = await runAuthProbes(providers, probe);

    expect(result['claude']?.state).toBe('logged-in');
    expect(result['codex']?.state).toBe('unknown');
  });

  it('passes a short timeout to each probe so doctor never stalls', async () => {
    const probe = vi.fn(async (): Promise<AuthProbeResult> => ({ state: 'logged-in' }));
    await runAuthProbes([makeProvider('claude', true)], probe, 1234);
    expect(probe).toHaveBeenCalledWith('claude', { timeoutMs: 1234 });
  });

  it('returns an empty map when no providers are probeable', async () => {
    const probe = vi.fn(async (): Promise<AuthProbeResult> => ({ state: 'logged-in' }));
    const result = await runAuthProbes([makeProvider('ollama', true), makeProvider('codex', false)], probe);
    expect(result).toEqual({});
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('reconcileProviderDiagnosticsAuth — diagnostics single truth', () => {
  it('downgrades an adapter-inferred Claude session when the local probe says logged-out', () => {
    const [detail] = reconcileProviderDiagnosticsAuth(
      [makeDiagnostic('claude', { models: ['claude-fable-5'] })],
      {
        claude: {
          state: 'logged-out',
          present: true,
          authenticated: false,
          method: 'none',
          detail: 'untrusted raw detail must not cross the boundary',
        },
      },
    );

    expect(detail).toMatchObject({
      authMethod: 'none',
      authStatus: 'missing',
      available: false,
      partial: true,
      modelsEvidence: 'catalog-only',
      authEvidence: {
        source: 'local-auth-probe',
        state: 'logged-out',
        method: 'none',
        present: true,
        authenticated: false,
      },
    });
    expect(JSON.stringify(detail)).not.toContain('untrusted raw detail');
  });

  it('preserves confirmed Codex subscription semantics without calling it an API key', () => {
    const [detail] = reconcileProviderDiagnosticsAuth(
      [makeDiagnostic('codex')],
      {
        codex: {
          state: 'logged-in',
          present: true,
          authenticated: true,
          method: 'subscription',
        },
      },
    );

    expect(detail).toMatchObject({
      authMethod: 'session',
      authStatus: 'ok',
      available: true,
      partial: false,
      authEvidence: {
        state: 'logged-in',
        method: 'subscription',
      },
    });
    expect(detail?.reason).toContain('subscription session');
    expect(detail?.reason).not.toContain('API key');
  });

  it('keeps unknown and configured-but-unverified API-key auth fail-closed', () => {
    const [detail] = reconcileProviderDiagnosticsAuth(
      [makeDiagnostic('gemini')],
      {
        gemini: {
          state: 'unknown',
          present: true,
          authenticated: 'unknown',
          method: 'api-key',
        },
      },
    );

    expect(detail).toMatchObject({
      authMethod: 'api_key',
      authStatus: 'unknown',
      available: false,
      partial: true,
      modelsEvidence: 'catalog-only',
      authEvidence: {
        state: 'unknown',
        method: 'api-key',
      },
    });
    const output = formatProviderDiagnosticsActionable([detail!]);
    expect(output).toContain('authentication unverified');
    expect(output).not.toContain('authentication missing');
  });

  it('does not invent cloud auth evidence for Ollama while bounding its models to catalog-only', () => {
    const [detail] = reconcileProviderDiagnosticsAuth(
      [makeDiagnostic('ollama', {
        authMethod: 'none',
        authStatus: 'ok',
        models: ['qwen2.5-coder:7b'],
      })],
      {},
    );

    expect(detail?.available).toBe(true);
    expect(detail?.modelsEvidence).toBe('catalog-only');
    expect(detail?.authEvidence).toBeUndefined();
  });
});

describe('buildProviderDiagnosticAuthChecks', () => {
  it('projects only logged-out and unknown cloud evidence into optional warnings', () => {
    const diagnostics = reconcileProviderDiagnosticsAuth(
      [
        makeDiagnostic('claude'),
        makeDiagnostic('codex'),
        makeDiagnostic('gemini'),
        makeDiagnostic('ollama', { authMethod: 'none', authStatus: 'ok' }),
      ],
      {
        claude: { state: 'logged-out', method: 'none' },
        codex: { state: 'logged-in', method: 'subscription' },
        gemini: { state: 'unknown', method: 'none' },
      },
    );

    const checks = buildProviderDiagnosticAuthChecks(diagnostics);

    expect(checks).toHaveLength(2);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Claude authentication',
        passed: false,
        required: false,
        message: expect.stringContaining('NOT logged in'),
      }),
      expect.objectContaining({
        name: 'Gemini authentication',
        passed: false,
        required: false,
        message: expect.stringContaining('could not be verified'),
      }),
    ]));
    expect(checks.some(check => check.name.includes('Codex'))).toBe(false);
    expect(checks.some(check => check.name.includes('Ollama'))).toBe(false);
  });
});

// ─── formatConnectorHealthLines auth-probe override ──────────────────

describe('formatConnectorHealthLines — PSL-6 auth-probe override', () => {
  it('downgrades a logged-out provider to [WARN] with login command (claude)', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'logged-out' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[WARN]');
    expect(claudeLine).toContain('CLI present but NOT logged in');
    expect(claudeLine).toContain('claude login');
    expect(claudeLine).toContain('v2.1.81'); // version preserved
    expect(claudeLine).not.toContain('session auth active');
  });

  it('uses the codex login command for a logged-out codex', () => {
    const results = [makeHealthResult('codex', true, 'ok', 'v1.0')];
    const probes: Record<string, AuthProbeResult> = { codex: { state: 'logged-out' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const codexLine = lines.find(l => l.includes('Codex'));
    expect(codexLine).toContain('[WARN]');
    expect(codexLine).toContain('codex login');
  });

  it('uses the gemini login command for a logged-out gemini', () => {
    const results = [makeHealthResult('gemini', true, 'ok', 'v0.1')];
    const probes: Record<string, AuthProbeResult> = { gemini: { state: 'logged-out' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const geminiLine = lines.find(l => l.includes('Gemini'));
    expect(geminiLine).toContain('[WARN]');
    expect(geminiLine).toContain('run: gemini');
  });

  it('reports a confirmed session when the probe says logged-in', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const probes: Record<string, AuthProbeResult> = {
      claude: { state: 'logged-in', method: 'subscription' },
    };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[PASS]');
    expect(claudeLine).toContain('authentication confirmed (subscription session)');
    expect(claudeLine).not.toContain('NOT logged in');
  });

  it('reports [WARN] when the probe state is "unknown" instead of guessing ready', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'unknown' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[WARN]');
    expect(claudeLine).toContain('authentication could not be verified');
    expect(claudeLine).not.toContain('NOT logged in');
  });

  it('does not mislabel a confirmed codex subscription session as an API key', () => {
    const results = [makeHealthResult('codex', true, 'ok', 'v1.0')];
    const probes: Record<string, AuthProbeResult> = {
      codex: { state: 'logged-in', method: 'subscription' },
    };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const codexLine = lines.find(l => l.includes('Codex'));
    expect(codexLine).toContain('[PASS]');
    expect(codexLine).toContain('subscription session');
    expect(codexLine).not.toContain('API key configured');
  });

  it('is a no-op when no authProbes map is supplied (backward compatible)', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const lines = formatConnectorHealthLines(results, '/mock/root');
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[PASS]');
    expect(claudeLine).toContain('session auth active');
  });

  it('localizes the logged-out line to Turkish when lang=tr', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'logged-out' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes, 'tr');
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[WARN]');
    expect(claudeLine).toContain('oturum AÇILMAMIŞ');
    expect(claudeLine).toContain('claude login');
  });
});

// ─── formatHumanDoctor forwarding ────────────────────────────────────

describe('formatHumanDoctor — authProbes forwarding', () => {
  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        { name: 'Platform', passed: true, message: 'Linux', required: false },
        { name: 'Node.js', passed: true, message: 'v22.1.0', required: true },
      ],
    },
    providers: [makeProvider('claude', true, 'session', '2.1')],
    brainLines: 100,
    brainBudget: 600,
    lastSprintId: 'sprint-270',
    debtItems: { total: 0, critical: 0 },
    projectRoot: '/mock/root',
  };

  it('propagates auth failure into top summary, readiness, recommendation, and honest summary', () => {
    const input: HumanDoctorInput = {
      ...baseInput,
      connectorHealthResults: [makeHealthResult('claude', true, 'ok', 'v2.1.81')],
      authProbes: { claude: { state: 'logged-out' } },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('CLI present but NOT logged in');
    expect(output).toContain('claude login');
    expect(output).toContain('WARN Claude CLI v2.1');
    expect(output).not.toContain('OK Claude CLI v2.1 — Ready');
    expect(output).toContain('0/1 providers ready');
    expect(output).toContain('Status: READY (with warnings)');
    expect(output).toContain('1 provider authentication warning(s) remain');
    expect(output).not.toContain('Everything looks good');
    expect(output).toContain('Honest Summary:');
    expect(output).toContain('Claude authentication');
  });

  it('preserves the [PASS] line when no authProbes are supplied', () => {
    const input: HumanDoctorInput = {
      ...baseInput,
      connectorHealthResults: [makeHealthResult('claude', true, 'ok', 'v2.1.81')],
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('[PASS]');
    expect(output).toContain('session auth active');
    expect(output).not.toContain('NOT logged in');
  });

  it('renders confirmed codex subscription truth consistently in the top and health sections', () => {
    const input: HumanDoctorInput = {
      ...baseInput,
      providers: [makeProvider('codex', true, 'session', '1.2')],
      connectorHealthResults: [makeHealthResult('codex', true, 'ok', 'v1.2')],
      authProbes: {
        codex: { state: 'logged-in', method: 'subscription' },
      },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('OK Codex CLI v1.2 — Ready (authentication confirmed (subscription session))');
    expect(output).toContain('[PASS] Codex CLI v1.2 — authentication confirmed (subscription session)');
    expect(output).not.toContain('API key configured');
    expect(output).toContain('1/1 providers ready');
    expect(output).toContain('Status: READY');
  });
});
