import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../src/core/environment.js', () => ({
  detectEnvironment: vi.fn().mockReturnValue('vscode'),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn().mockReturnValue({}),
  validateDeckFile: vi.fn().mockReturnValue({ valid: true, warnings: [], errors: [] }),
  KNOWN_DECK_KEYS: [
    'DECKENT_CLAUDE_API_KEY', 'DECKENT_OPENAI_API_KEY', 'DECKENT_GOOGLE_API_KEY',
    'DECKENT_SMTP_HOST', 'DECKENT_SMTP_USER', 'DECKENT_SMTP_PASS',
    'DECKENT_WEBHOOK_URL', 'DECKENT_DB_URL', 'DECKENT_TELEMETRY_ID',
  ],
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  formatCIHealthSection: vi.fn().mockReturnValue([]),
}));

import { detectEnvironment } from '../../src/core/environment.js';
import { loadDeckSecrets, validateDeckFile } from '../../src/core/deck-file.js';
import type { DetectedProvider } from '../../src/core/provider.js';
import type { HealthCheckResult } from '../../src/orchestra/connector.js';

import {
  getMemoryHealthLabel,
  getProviderSummary,
  getReadinessLabel,
  getProviderInstallHint,
  getProviderTips,
  buildConnectorHealthResults,
  getDeckFileStatus,
  formatConnectorHealthLines,
  formatProviderHealthSection,
  formatHumanDoctor,
  formatSystemProfile,
} from '../../src/cli/commands/doctor-format.js';
import type { HumanDoctorInput } from '../../src/cli/commands/doctor-format.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeCheck(name: string, passed: boolean, message: string, required = false) {
  return { name, passed, message, required };
}

function makeProvider(name: string, available: boolean, version?: string, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
  return { name: name as DetectedProvider['name'], available, version, authMethod, models: [] as unknown as DetectedProvider['models'] };
}

function makeHealthResult(
  provider: string,
  available: boolean,
  authStatus: 'ok' | 'missing' | 'expired' = 'ok',
  cliVersion: string | null = null,
): HealthCheckResult {
  return { provider: provider as HealthCheckResult['provider'], available, authStatus, cliVersion, error: null };
}

// ─── getMemoryHealthLabel ────────────────────────────────────────────

describe('getMemoryHealthLabel (format module)', () => {
  it('returns "healthy" for low usage', () => {
    expect(getMemoryHealthLabel(0)).toBe('healthy');
    expect(getMemoryHealthLabel(49)).toBe('healthy');
  });

  it('returns "moderate" for 50-79%', () => {
    expect(getMemoryHealthLabel(50)).toBe('moderate');
    expect(getMemoryHealthLabel(79)).toBe('moderate');
  });

  it('returns "high" for 80-100%', () => {
    expect(getMemoryHealthLabel(80)).toBe('high');
    expect(getMemoryHealthLabel(100)).toBe('high');
  });

  it('returns "OVER BUDGET" above 100%', () => {
    expect(getMemoryHealthLabel(101)).toBe('OVER BUDGET');
  });
});

// ─── getProviderSummary ──────────────────────────────────────────────

describe('getProviderSummary (format module)', () => {
  it('counts available providers', () => {
    const summary = getProviderSummary([
      makeProvider('claude', true),
      makeProvider('codex', false),
    ]);
    expect(summary).toBe('1/2 providers ready');
  });

  it('handles empty array', () => {
    expect(getProviderSummary([])).toBe('0/0 providers ready');
  });
});

// ─── getReadinessLabel ───────────────────────────────────────────────

describe('getReadinessLabel (format module)', () => {
  it('returns READY when all pass', () => {
    const result = { ok: true, checks: [makeCheck('Node', true, '', true)] };
    expect(getReadinessLabel(result, 100, 600)).toBe('READY');
  });

  it('returns NOT READY when required fails', () => {
    const result = { ok: false, checks: [makeCheck('Node', false, '', true)] };
    expect(getReadinessLabel(result, 100, 600)).toBe('NOT READY');
  });

  it('returns warnings when over budget', () => {
    const result = { ok: true, checks: [makeCheck('Node', true, '', true)] };
    expect(getReadinessLabel(result, 700, 600)).toBe('READY (with warnings)');
  });

  it('returns warnings when optional fails', () => {
    const result = { ok: true, checks: [makeCheck('WS', false, '', false)] };
    expect(getReadinessLabel(result, 100, 600)).toBe('READY (with warnings)');
  });
});

// ─── getProviderInstallHint ──────────────────────────────────────────

describe('getProviderInstallHint (format module)', () => {
  it('returns install hint for claude', () => {
    expect(getProviderInstallHint('claude')).toContain('@anthropic-ai/claude-code');
  });

  it('returns install hint for codex', () => {
    expect(getProviderInstallHint('codex')).toContain('@openai/codex');
  });

  it('returns install hint for gemini', () => {
    expect(getProviderInstallHint('gemini')).toContain('@google/gemini-cli');
  });

  it('returns empty for unknown', () => {
    expect(getProviderInstallHint('unknown')).toBe('');
  });
});

// ─── getProviderTips ─────────────────────────────────────────────────

describe('getProviderTips (format module)', () => {
  it('returns tips for unavailable providers', () => {
    const tips = getProviderTips([makeProvider('gemini', false)]);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('GOOGLE_API_KEY');
  });

  it('returns no tips when all available', () => {
    const tips = getProviderTips([makeProvider('claude', true)]);
    expect(tips).toHaveLength(0);
  });

  it('returns multiple tips', () => {
    const tips = getProviderTips([
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ]);
    expect(tips).toHaveLength(2);
  });
});

// ─── buildConnectorHealthResults ─────────────────────────────────────

describe('buildConnectorHealthResults (format module)', () => {
  it('maps available provider to ok auth', () => {
    const results = buildConnectorHealthResults([makeProvider('claude', true, '2.1', 'session')]);
    expect(results[0]).toMatchObject({ provider: 'claude', available: true, authStatus: 'ok' });
  });

  it('maps unavailable provider to missing auth', () => {
    const results = buildConnectorHealthResults([makeProvider('gemini', false)]);
    expect(results[0]).toMatchObject({ available: false, authStatus: 'missing' });
  });

  it('returns empty for empty input', () => {
    expect(buildConnectorHealthResults([])).toHaveLength(0);
  });
});

// ─── getDeckFileStatus ───────────────────────────────────────────────

describe('getDeckFileStatus (format module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns "not found" when no secrets', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    expect(getDeckFileStatus('/mock')).toContain('not found');
  });

  it('returns key count when secrets present', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ DECKENT_CLAUDE_API_KEY: 'sk-test' });
    expect(getDeckFileStatus('/mock')).toContain('1/9 keys configured');
  });

  it('shows errors flag', () => {
    vi.mocked(loadDeckSecrets).mockReturnValue({ INVALID: 'val' });
    vi.mocked(validateDeckFile).mockReturnValue({ valid: false, warnings: [], errors: ['err'] });
    expect(getDeckFileStatus('/mock')).toContain('has errors');
  });
});

// ─── formatConnectorHealthLines ──────────────────────────────────────

describe('formatConnectorHealthLines (format module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
  });

  it('starts with Provider Health header', () => {
    const lines = formatConnectorHealthLines([], '/mock');
    expect(lines[0]).toBe('Provider Health:');
  });

  it('shows [PASS] for available provider', () => {
    const lines = formatConnectorHealthLines([makeHealthResult('claude', true, 'ok', 'v2.1')], '/mock');
    expect(lines.find(l => l.includes('[PASS]') && l.includes('Claude'))).toBeDefined();
  });

  it('shows [WARN] for unavailable provider', () => {
    const lines = formatConnectorHealthLines([makeHealthResult('gemini', false, 'missing')], '/mock');
    expect(lines.find(l => l.includes('[WARN]') && l.includes('Gemini'))).toBeDefined();
  });

  it('shows environment detection', () => {
    vi.mocked(detectEnvironment).mockReturnValue('cursor');
    const lines = formatConnectorHealthLines([], '/mock');
    expect(lines.find(l => l.includes('cursor detected'))).toBeDefined();
  });
});

// ─── formatProviderHealthSection ─────────────────────────────────────

describe('formatProviderHealthSection (format module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadDeckSecrets).mockReturnValue({});
    vi.mocked(detectEnvironment).mockReturnValue('vscode');
  });

  it('shows OK for available provider', () => {
    const lines = formatProviderHealthSection([makeProvider('claude', true, '2.1', 'session')], '/mock');
    expect(lines.find(l => l.includes('OK Claude'))).toBeDefined();
  });

  it('shows FAIL for unavailable provider', () => {
    const lines = formatProviderHealthSection([makeProvider('gemini', false)], '/mock');
    expect(lines.find(l => l.includes('FAIL Gemini'))).toBeDefined();
  });
});

// ─── formatHumanDoctor ───────────────────────────────────────────────

describe('formatHumanDoctor (format module)', () => {
  const baseInput: HumanDoctorInput = {
    result: {
      ok: true,
      checks: [
        makeCheck('Platform', true, 'Linux'),
        makeCheck('Node.js', true, 'v22', true),
        makeCheck('git', true, 'v2.43', true),
        makeCheck('tmux', true, 'tmux 3.4', true),
        makeCheck('Claude CLI', true, 'v2.1', true),
        makeCheck('Workspace', true, '.deckent/ found'),
        makeCheck('Brain Dir', true, 'All brain files'),
        makeCheck('Directives', true, 'DIRECTIVES.md found'),
        makeCheck('Locks', true, 'No lock files'),
      ],
    },
    providers: [
      makeProvider('claude', true, '2.1', 'session'),
      makeProvider('gemini', false),
    ],
    brainLines: 200,
    brainBudget: 600,
    lastSprintId: 'sprint-042',
    debtItems: { total: 0, critical: 0 },
  };

  it('starts with health check header', () => {
    expect(formatHumanDoctor(baseInput)).toMatch(/^Deckent Health Check/);
  });

  it('contains Your System section', () => {
    expect(formatHumanDoctor(baseInput)).toContain('Your System:');
  });

  it('contains Your Project section', () => {
    expect(formatHumanDoctor(baseInput)).toContain('Your Project:');
  });

  it('contains Recommendation section', () => {
    expect(formatHumanDoctor(baseInput)).toContain('Recommendation:');
  });

  it('shows memory percentage', () => {
    expect(formatHumanDoctor(baseInput)).toContain('33% — healthy');
  });

  it('shows last sprint', () => {
    expect(formatHumanDoctor(baseInput)).toContain('sprint-042');
  });

  it('shows provider tips', () => {
    expect(formatHumanDoctor(baseInput)).toContain('GOOGLE_API_KEY');
  });

  it('shows OVER BUDGET when exceeds', () => {
    const input = { ...baseInput, brainLines: 650 };
    expect(formatHumanDoctor(input)).toContain('OVER BUDGET');
  });

  it('shows debt warning', () => {
    const input = { ...baseInput, debtItems: { total: 3, critical: 1 } };
    expect(formatHumanDoctor(input)).toContain('1 critical');
  });

  it('shows stale lock warning', () => {
    const input = {
      ...baseInput,
      result: {
        ok: true,
        checks: baseInput.result.checks.map(c =>
          c.name === 'Locks' ? { ...c, passed: false, message: '2 stale' } : c,
        ),
      },
    };
    expect(formatHumanDoctor(input)).toContain('Warning 2 stale');
  });

  it('uses connector format when connectorHealthResults provided', () => {
    const input = {
      ...baseInput,
      projectRoot: '/mock',
      connectorHealthResults: [makeHealthResult('claude', true, 'ok', 'v2.1')],
    };
    expect(formatHumanDoctor(input)).toContain('[PASS]');
  });

  it('falls back to OK format without connectorHealthResults', () => {
    const input = { ...baseInput, projectRoot: '/mock' };
    const output = formatHumanDoctor(input);
    expect(output).not.toContain('[PASS]');
    expect(output).toContain('OK Claude');
  });
});

// ─── formatSystemProfile ─────────────────────────────────────────────

describe('formatSystemProfile (format module)', () => {
  const profile = { cpuCores: 8, totalMemMB: 16384, freeMemMB: 8192, recommendedMaxWorkers: 4 };

  it('contains System Profile header', () => {
    expect(formatSystemProfile(profile)).toContain('System Profile');
  });

  it('shows CPU and RAM', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('8 cores');
    expect(output).toContain('16.0 GB');
  });

  it('shows subscription when provided', () => {
    expect(formatSystemProfile(profile, 'max')).toContain('Subscription: max');
  });

  it('omits subscription when not provided', () => {
    expect(formatSystemProfile(profile)).not.toContain('Subscription');
  });

  it('has box border characters', () => {
    const output = formatSystemProfile(profile);
    expect(output).toContain('╔');
    expect(output).toContain('╝');
  });
});
