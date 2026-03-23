import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DetectedProvider } from '../../../src/core/provider.js';

// Mock child_process for IDE detection
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('bash'),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  detectIDEEnvironment,
  getMCPGuidance,
  buildProviderWizardSteps,
  resolveProviderWizardResult,
  getProviderMissingAuth,
  formatProviderAuthGuidance,
  runWizard,
} from '../../../src/cli/helpers/wizard.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeProvider(name: 'claude' | 'codex' | 'gemini', available: boolean, authMethod: 'session' | 'api_key' | 'none' = 'none'): DetectedProvider {
  const models = {
    claude: ['claude-sonnet-4-20250514'] as any[],
    codex: ['o3'] as any[],
    gemini: ['gemini-2.5-pro'] as any[],
  };
  return {
    name,
    available,
    version: available ? '1.0.0' : undefined,
    authMethod: available ? (authMethod || 'session') : 'none',
    models: models[name],
  };
}

// ─── IDE Environment Detection ──────────────────────────────────────

describe('detectIDEEnvironment', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    delete process.env['CLAUDE_CODE'];
    delete process.env['CLAUDE_SESSION_ID'];
    delete process.env['CURSOR_SESSION'];
    delete process.env['CURSOR_TRACE_ID'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('detects Claude Code via CLAUDE_CODE env var', () => {
    process.env['CLAUDE_CODE'] = '1';
    expect(detectIDEEnvironment()).toBe('claude-code');
  });

  it('detects Claude Code via CLAUDE_SESSION_ID env var', () => {
    process.env['CLAUDE_SESSION_ID'] = 'sess_123';
    expect(detectIDEEnvironment()).toBe('claude-code');
  });

  it('detects Claude Code via parent process name', () => {
    vi.mocked(execSync).mockReturnValue('claude\n');
    expect(detectIDEEnvironment()).toBe('claude-code');
  });

  it('detects Cursor via CURSOR_SESSION env var', () => {
    process.env['CURSOR_SESSION'] = 'cur_123';
    vi.mocked(execSync).mockReturnValue('node\n');
    expect(detectIDEEnvironment()).toBe('cursor');
  });

  it('detects Cursor via CURSOR_TRACE_ID env var', () => {
    process.env['CURSOR_TRACE_ID'] = 'trace_123';
    vi.mocked(execSync).mockReturnValue('node\n');
    expect(detectIDEEnvironment()).toBe('cursor');
  });

  it('detects Cursor via .cursor/ directory', () => {
    vi.mocked(execSync).mockReturnValue('node\n');
    vi.mocked(existsSync).mockImplementation((p) => String(p).includes('.cursor'));
    expect(detectIDEEnvironment('/project')).toBe('cursor');
  });

  it('returns terminal as fallback', () => {
    vi.mocked(execSync).mockReturnValue('bash\n');
    expect(detectIDEEnvironment()).toBe('terminal');
  });

  it('returns terminal when parent process check fails', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('ps failed'); });
    expect(detectIDEEnvironment()).toBe('terminal');
  });
});

// ─── MCP Guidance ───────────────────────────────────────────────────

describe('getMCPGuidance', () => {
  it('returns auto-configured message for claude-code', () => {
    const guidance = getMCPGuidance('claude-code');
    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance[0]).toContain('Claude Code');
    expect(guidance.some(l => l.includes('auto-configured'))).toBe(true);
  });

  it('returns mcp.json instructions for cursor', () => {
    const guidance = getMCPGuidance('cursor');
    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance.some(l => l.includes('Cursor'))).toBe(true);
    expect(guidance.some(l => l.includes('mcp.json'))).toBe(true);
  });

  it('returns terminal guidance for terminal', () => {
    const guidance = getMCPGuidance('terminal');
    expect(guidance.length).toBeGreaterThan(0);
    expect(guidance.some(l => l.includes('Terminal'))).toBe(true);
  });
});

// ─── buildProviderWizardSteps ───────────────────────────────────────

describe('buildProviderWizardSteps', () => {
  it('auto-configures single available provider', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ];
    const { autoConfig, steps } = buildProviderWizardSteps(detected);
    expect(autoConfig).not.toBeNull();
    expect(autoConfig!.brain_provider).toBe('claude');
    expect(autoConfig!.worker_provider).toBe('claude');
    expect(autoConfig!.selectedProviders).toEqual(['claude']);
    expect(steps).toHaveLength(0);
  });

  it('returns steps for multiple available providers', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
      makeProvider('gemini', false),
    ];
    const { autoConfig, steps } = buildProviderWizardSteps(detected);
    expect(autoConfig).toBeNull();
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.find(s => s.id === 'brain_provider')).toBeDefined();
    expect(steps.find(s => s.id === 'worker_provider')).toBeDefined();
  });

  it('includes fallback step when 3+ providers available', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
      makeProvider('gemini', true, 'api_key'),
    ];
    const { steps } = buildProviderWizardSteps(detected);
    expect(steps.find(s => s.id === 'fallback_provider')).toBeDefined();
  });

  it('does not include fallback step for exactly 2 providers', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
      makeProvider('gemini', false),
    ];
    const { steps } = buildProviderWizardSteps(detected);
    expect(steps.find(s => s.id === 'fallback_provider')).toBeUndefined();
  });

  it('handles zero available providers gracefully', () => {
    const detected = [
      makeProvider('claude', false),
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ];
    const { autoConfig, steps } = buildProviderWizardSteps(detected);
    expect(autoConfig).not.toBeNull();
    expect(autoConfig!.brain_provider).toBe('claude');
    expect(autoConfig!.selectedProviders).toHaveLength(0);
    expect(steps).toHaveLength(0);
  });

  it('provider choices include auth method', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
    ];
    const { steps } = buildProviderWizardSteps(detected);
    const brainStep = steps.find(s => s.id === 'brain_provider')!;
    expect(brainStep.choices!.some(c => c.label.includes('session'))).toBe(true);
    expect(brainStep.choices!.some(c => c.label.includes('api_key'))).toBe(true);
  });
});

// ─── resolveProviderWizardResult ────────────────────────────────────

describe('resolveProviderWizardResult', () => {
  const detected = [
    makeProvider('claude', true, 'session'),
    makeProvider('codex', true, 'api_key'),
    makeProvider('gemini', true, 'api_key'),
  ];

  it('resolves brain and worker providers', () => {
    const result = resolveProviderWizardResult(
      { brain_provider: 'claude', worker_provider: 'codex' },
      detected,
    );
    expect(result.brain_provider).toBe('claude');
    expect(result.worker_provider).toBe('codex');
  });

  it('resolves fallback provider when set', () => {
    const result = resolveProviderWizardResult(
      { brain_provider: 'claude', worker_provider: 'codex', fallback_provider: 'gemini' },
      detected,
    );
    expect(result.fallback_provider).toBe('gemini');
  });

  it('omits fallback when set to none', () => {
    const result = resolveProviderWizardResult(
      { brain_provider: 'claude', worker_provider: 'codex', fallback_provider: 'none' },
      detected,
    );
    expect(result.fallback_provider).toBeUndefined();
  });

  it('selectedProviders includes unique providers only', () => {
    const result = resolveProviderWizardResult(
      { brain_provider: 'claude', worker_provider: 'claude' },
      detected,
    );
    expect(result.selectedProviders).toEqual(['claude']);
  });

  it('selectedProviders includes all distinct providers', () => {
    const result = resolveProviderWizardResult(
      { brain_provider: 'claude', worker_provider: 'codex', fallback_provider: 'gemini' },
      detected,
    );
    expect(result.selectedProviders).toHaveLength(3);
    expect(result.selectedProviders).toContain('claude');
    expect(result.selectedProviders).toContain('codex');
    expect(result.selectedProviders).toContain('gemini');
  });
});

// ─── getProviderMissingAuth ─────────────────────────────────────────

describe('getProviderMissingAuth', () => {
  it('returns null for available provider', () => {
    expect(getProviderMissingAuth(makeProvider('claude', true, 'session'))).toBeNull();
  });

  it('returns OPENAI_API_KEY for unavailable codex', () => {
    expect(getProviderMissingAuth(makeProvider('codex', false))).toBe('OPENAI_API_KEY');
  });

  it('returns GOOGLE_API_KEY for unavailable gemini', () => {
    expect(getProviderMissingAuth(makeProvider('gemini', false))).toBe('GOOGLE_API_KEY');
  });

  it('returns null for unavailable claude (session-based)', () => {
    expect(getProviderMissingAuth(makeProvider('claude', false))).toBeNull();
  });
});

// ─── formatProviderAuthGuidance ─────────────────────────────────────

describe('formatProviderAuthGuidance', () => {
  it('returns empty for all available providers', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
    ];
    expect(formatProviderAuthGuidance(detected)).toHaveLength(0);
  });

  it('returns guidance for unavailable codex', () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', false),
    ];
    const lines = formatProviderAuthGuidance(detected);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('OPENAI_API_KEY');
  });

  it('returns guidance for unavailable claude', () => {
    const detected = [
      makeProvider('claude', false),
    ];
    const lines = formatProviderAuthGuidance(detected);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('claude');
    expect(lines[0]).toContain('Install CLI');
  });

  it('returns guidance for multiple unavailable providers', () => {
    const detected = [
      makeProvider('claude', false),
      makeProvider('codex', false),
      makeProvider('gemini', false),
    ];
    const lines = formatProviderAuthGuidance(detected);
    expect(lines.length).toBe(3);
  });
});

// ─── runWizard with provider steps (non-interactive) ────────────────

describe('runWizard (provider steps, non-interactive)', () => {
  it('resolves defaults in non-interactive mode', async () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
      makeProvider('gemini', true, 'api_key'),
    ];
    const { steps } = buildProviderWizardSteps(detected);
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['brain_provider']).toBe('claude');
    expect(result['worker_provider']).toBe('claude');
  });

  it('resolves fallback default to none in non-interactive mode', async () => {
    const detected = [
      makeProvider('claude', true, 'session'),
      makeProvider('codex', true, 'api_key'),
      makeProvider('gemini', true, 'api_key'),
    ];
    const { steps } = buildProviderWizardSteps(detected);
    const result = await runWizard(steps, { nonInteractive: true });
    expect(result['fallback_provider']).toBe('none');
  });
});
