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
  formatConnectorHealthLines,
  formatHumanDoctor,
} from '../../src/cli/commands/doctor.js';
import type { HumanDoctorInput } from '../../src/cli/commands/doctor.js';
import type { AuthProbeResult } from '../../src/core/provider-auth-probe.js';
import type { DetectedProvider } from '../../src/core/provider.js';
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

  it('keeps the existing [PASS] line when the probe says logged-in', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'logged-in' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[PASS]');
    expect(claudeLine).toContain('session auth active');
    expect(claudeLine).not.toContain('NOT logged in');
  });

  it('keeps existing behavior when the probe state is "unknown" (no regression)', () => {
    const results = [makeHealthResult('claude', true, 'ok', 'v2.1.81')];
    const probes: Record<string, AuthProbeResult> = { claude: { state: 'unknown' } };
    const lines = formatConnectorHealthLines(results, '/mock/root', probes);
    const claudeLine = lines.find(l => l.includes('Claude'));
    expect(claudeLine).toContain('[PASS]');
    expect(claudeLine).not.toContain('NOT logged in');
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

  it('surfaces the [WARN] "NOT logged in" line in the Provider Health section', () => {
    const input: HumanDoctorInput = {
      ...baseInput,
      connectorHealthResults: [makeHealthResult('claude', true, 'ok', 'v2.1.81')],
      authProbes: { claude: { state: 'logged-out' } },
    };
    const output = formatHumanDoctor(input);
    expect(output).toContain('CLI present but NOT logged in');
    expect(output).toContain('claude login');
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
});
