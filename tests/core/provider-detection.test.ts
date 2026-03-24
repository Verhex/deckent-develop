import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process before imports
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import {
  detectAvailableProviders,
  detectCliVersion,
  formatDetectedProviders,
} from '../../src/core/provider.js';
import type { DetectedProvider } from '../../src/core/provider.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, signal: null, output: [] };
}

// ─── detectCliVersion ────────────────────────────────────────────────────────

describe('detectCliVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns version string when CLI exits with 0', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, '1.2.3\n') as ReturnType<typeof spawnSync>);
    const version = detectCliVersion('claude');
    expect(version).toBe('1.2.3');
  });

  it('returns undefined when CLI exits with non-zero', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const version = detectCliVersion('claude');
    expect(version).toBeUndefined();
  });

  it('returns undefined when spawnSync throws', () => {
    vi.mocked(spawnSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const version = detectCliVersion('nonexistent');
    expect(version).toBeUndefined();
  });

  it('returns undefined when stdout is empty', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, '') as ReturnType<typeof spawnSync>);
    const version = detectCliVersion('claude');
    expect(version).toBeUndefined();
  });

  it('trims whitespace from version output', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, '  2.0.0  \n') as ReturnType<typeof spawnSync>);
    const version = detectCliVersion('claude');
    expect(version).toBe('2.0.0');
  });

  it('passes custom args to spawnSync', () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, 'v1.0') as ReturnType<typeof spawnSync>);
    detectCliVersion('node', ['-v']);
    expect(spawnSync).toHaveBeenCalledWith('node', ['-v'], expect.objectContaining({ encoding: 'utf-8' }));
  });
});

// ─── detectAvailableProviders ────────────────────────────────────────────────

describe('detectAvailableProviders', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear relevant env vars
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns array of 3 providers (claude, codex, gemini)', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const providers = await detectAvailableProviders();
    expect(providers).toHaveLength(3);
    expect(providers.map(p => p.name)).toEqual(['claude', 'codex', 'gemini']);
  });

  it('detects Claude as available when CLI returns success', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'claude') return makeSpawnResult(0, '1.5.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
    });
    const providers = await detectAvailableProviders();
    const claude = providers.find(p => p.name === 'claude')!;
    expect(claude.available).toBe(true);
    expect(claude.version).toBe('1.5.0');
    expect(claude.authMethod).toBe('session');
  });

  it('detects Claude as unavailable when CLI fails', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const providers = await detectAvailableProviders();
    const claude = providers.find(p => p.name === 'claude')!;
    expect(claude.available).toBe(false);
    expect(claude.version).toBeUndefined();
    expect(claude.authMethod).toBe('none');
  });

  it('detects Codex as available when CLI + API key present', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'codex') return makeSpawnResult(0, '0.1.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
    });
    process.env['OPENAI_API_KEY'] = 'sk-test-key-12345';
    const providers = await detectAvailableProviders();
    const codex = providers.find(p => p.name === 'codex')!;
    expect(codex.available).toBe(true);
    expect(codex.version).toBe('0.1.0');
    expect(codex.authMethod).toBe('api_key');
  });

  it('detects Codex as unavailable when CLI present but no API key', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'codex') return makeSpawnResult(0, '0.1.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
    });
    const providers = await detectAvailableProviders();
    const codex = providers.find(p => p.name === 'codex')!;
    expect(codex.available).toBe(false);
    expect(codex.version).toBe('0.1.0');
    expect(codex.authMethod).toBe('none');
  });

  it('detects Codex as unavailable when API key present but no CLI', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    process.env['OPENAI_API_KEY'] = 'sk-test-key-12345';
    const providers = await detectAvailableProviders();
    const codex = providers.find(p => p.name === 'codex')!;
    expect(codex.available).toBe(false);
    expect(codex.version).toBeUndefined();
    expect(codex.authMethod).toBe('api_key');
  });

  it('detects Gemini as available when GOOGLE_API_KEY set', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'gemini') return makeSpawnResult(0, '1.0.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
    });
    process.env['GOOGLE_API_KEY'] = 'AIzaSy-test-key';
    const providers = await detectAvailableProviders();
    const gemini = providers.find(p => p.name === 'gemini')!;
    expect(gemini.available).toBe(true);
    expect(gemini.version).toBe('1.0.0');
    expect(gemini.authMethod).toBe('api_key');
  });

  it('detects Gemini as unavailable when no API key', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const providers = await detectAvailableProviders();
    const gemini = providers.find(p => p.name === 'gemini')!;
    expect(gemini.available).toBe(false);
    expect(gemini.authMethod).toBe('none');
  });

  it('Gemini has no version (no CLI)', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    process.env['GOOGLE_API_KEY'] = 'AIzaSy-test-key';
    const providers = await detectAvailableProviders();
    const gemini = providers.find(p => p.name === 'gemini')!;
    expect(gemini.version).toBeUndefined();
  });

  it('each provider includes its models from PROVIDER_MODEL_MAP', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    const providers = await detectAvailableProviders();
    const claude = providers.find(p => p.name === 'claude')!;
    expect(claude.models).toEqual(['opus', 'sonnet', 'haiku']);
    const codex = providers.find(p => p.name === 'codex')!;
    expect(codex.models).toEqual(['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini']);
    const gemini = providers.find(p => p.name === 'gemini')!;
    expect(gemini.models).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash']);
  });

  it('empty OPENAI_API_KEY is treated as missing', async () => {
    vi.mocked(spawnSync).mockImplementation((cmd: string) => {
      if (cmd === 'codex') return makeSpawnResult(0, '0.1.0') as ReturnType<typeof spawnSync>;
      return makeSpawnResult(1, '') as ReturnType<typeof spawnSync>;
    });
    process.env['OPENAI_API_KEY'] = '';
    const providers = await detectAvailableProviders();
    const codex = providers.find(p => p.name === 'codex')!;
    expect(codex.available).toBe(false);
    expect(codex.authMethod).toBe('none');
  });

  it('empty GOOGLE_API_KEY is treated as missing', async () => {
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(1, '') as ReturnType<typeof spawnSync>);
    process.env['GOOGLE_API_KEY'] = '';
    const providers = await detectAvailableProviders();
    const gemini = providers.find(p => p.name === 'gemini')!;
    expect(gemini.available).toBe(false);
  });
});

// ─── formatDetectedProviders ─────────────────────────────────────────────────

describe('formatDetectedProviders', () => {
  it('includes "Providers:" header', () => {
    const output = formatDetectedProviders([]);
    expect(output).toContain('Providers:');
  });

  it('shows checkmark for available provider', () => {
    const providers: DetectedProvider[] = [{
      name: 'claude',
      available: true,
      version: '1.5.0',
      authMethod: 'session',
      models: ['opus', 'sonnet', 'haiku'],
    }];
    const output = formatDetectedProviders(providers);
    expect(output).toContain('\u2714');
    expect(output).toContain('claude');
    expect(output).toContain('v1.5.0');
    expect(output).toContain('session');
  });

  it('shows cross for unavailable provider', () => {
    const providers: DetectedProvider[] = [{
      name: 'gemini',
      available: false,
      authMethod: 'none',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    }];
    const output = formatDetectedProviders(providers);
    expect(output).toContain('\u2718');
    expect(output).toContain('gemini');
    expect(output).toContain('not configured');
  });

  it('shows model list for each provider', () => {
    const providers: DetectedProvider[] = [{
      name: 'codex',
      available: true,
      version: '0.1.0',
      authMethod: 'api_key',
      models: ['gpt-4.1', 'o3', 'o4-mini'],
    }];
    const output = formatDetectedProviders(providers);
    expect(output).toContain('gpt-4.1, o3, o4-mini');
  });

  it('omits version when undefined', () => {
    const providers: DetectedProvider[] = [{
      name: 'gemini',
      available: true,
      authMethod: 'api_key',
      models: ['gemini-2.5-pro'],
    }];
    const output = formatDetectedProviders(providers);
    // Should not have "v " before (api_key)
    expect(output).not.toMatch(/v\s+\(api_key\)/);
    expect(output).toContain('gemini');
  });
});
