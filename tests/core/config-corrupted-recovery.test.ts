import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { loadConfig, clearConfigCache } from '../../src/core/config.js';
import { removeDuplicateKeys } from '../../src/core/config-migration.js';
import { ProviderConfigAliasConflictError } from '../../src/core/provider-config-canonicalizer.js';

// ─── Helpers ────────────────────────────────────────────────────────

function createTmpProject(suffix: string): string {
  const dir = join(tmpdir(), `deckent-test-${suffix}-${Date.now()}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  return dir;
}

function cleanupTmpProject(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ─── Corrupted Config Recovery ─────────────────────────────────────

describe('corrupted config recovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    clearConfigCache();
    tmpDir = createTmpProject('corrupted');
  });

  afterEach(() => {
    cleanupTmpProject(tmpDir);
  });

  it('recovers from JSON syntax error — renames corrupted file, writes fresh default', async () => {
    const configPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(configPath, '{ this is not valid json!!!');

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = await loadConfig(tmpDir, { force: true });
    stderrSpy.mockRestore();

    // Config should load with defaults
    expect(config.mode).toBeDefined();
    expect(config.language).toBeDefined();

    // Corrupted file should be renamed
    const files = readdirSync(join(tmpDir, '.deckent'));
    const backups = files.filter(f => f.includes('.corrupted.'));
    expect(backups.length).toBe(1);

    // Fresh config should be written
    const freshContent = readFileSync(configPath, 'utf-8');
    expect(() => JSON.parse(freshContent)).not.toThrow();
  });

  it('recovers from empty file', async () => {
    const configPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(configPath, '');

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = await loadConfig(tmpDir, { force: true });
    stderrSpy.mockRestore();

    expect(config.mode).toBeDefined();
  });

  it('recovers from binary garbage', async () => {
    const configPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(configPath, Buffer.from([0x00, 0xFF, 0xFE, 0x89, 0x50]));

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = await loadConfig(tmpDir, { force: true });
    stderrSpy.mockRestore();

    expect(config.mode).toBeDefined();
  });

  it('strike-5: io-error (EISDIR) does NOT quarantine — file untouched, no backup, defaults used', async () => {
    // A transient read failure (EMFILE/EACCES/EISDIR class) must never move a
    // file the healer could not even inspect. Hermetic io-error: a DIRECTORY at
    // the config path — existsSync true, readFile throws EISDIR, parse never runs.
    const configPath = join(tmpDir, '.deckent', 'config.json');
    mkdirSync(configPath);

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = await loadConfig(tmpDir, { force: true });
    const warned = stderrSpy.mock.calls.some(c => String(c[0]).includes('CONFIG_READ_IO_HOLD'));
    stderrSpy.mockRestore();

    expect(config.mode).toBeDefined(); // defaults carried the load
    expect(warned).toBe(true); // typed hold surfaced, not silent
    const files = readdirSync(join(tmpDir, '.deckent'));
    expect(files.filter(f => f.includes('.corrupted.')).length).toBe(0); // NO quarantine
    expect(existsSync(configPath)).toBe(true); // path left exactly as found
  });

  it('uses defaults when config file does not exist (no backup created)', async () => {
    // No config.json written — should just use defaults
    const config = await loadConfig(tmpDir, { force: true });
    expect(config.mode).toBeDefined();

    const files = readdirSync(join(tmpDir, '.deckent'));
    const backups = files.filter(f => f.includes('.corrupted.'));
    expect(backups.length).toBe(0);
  });

  it('persists a flat-only provider alias in canonical grouped form', async () => {
    const configPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(configPath, JSON.stringify({ brain_provider: 'codex' }));

    const config = await loadConfig(tmpDir, { force: true });
    const persisted = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    expect(config.brain_provider).toBe('codex');
    expect(persisted['brain_provider']).toBeUndefined();
    expect(persisted['providers']).toMatchObject({ brain: 'codex' });
  });
});

// ─── Duplicate Key Removal Migration ────────────────────────────────

describe('removeDuplicateKeys', () => {
  it('removes claude_backend when spawn_backend exists', () => {
    const config: Record<string, unknown> = {
      spawn_backend: 'docker',
      claude_backend: 'tmux',
      mode: 'performance',
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).toContain('claude_backend');
    expect(config['claude_backend']).toBeUndefined();
    expect(config['spawn_backend']).toBe('docker');
  });

  it('preserves claude_backend when spawn_backend is absent', () => {
    const config: Record<string, unknown> = {
      claude_backend: 'tmux',
      mode: 'performance',
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).not.toContain('claude_backend');
    expect(config['claude_backend']).toBe('tmux');
  });

  it('removes flat brain_provider when providers.brain exists', () => {
    const config: Record<string, unknown> = {
      providers: { brain: 'claude', worker: 'claude' },
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).toContain('brain_provider');
    expect(removed).toContain('worker_provider');
    expect(config['brain_provider']).toBeUndefined();
    expect(config['worker_provider']).toBeUndefined();
    expect((config['providers'] as Record<string, unknown>)['brain']).toBe('claude');
  });

  it('promotes flat providers when grouped providers is absent', () => {
    const config: Record<string, unknown> = {
      brain_provider: 'claude',
      worker_provider: 'codex',
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).toEqual(expect.arrayContaining(['brain_provider', 'worker_provider']));
    expect(config['brain_provider']).toBeUndefined();
    expect(config['worker_provider']).toBeUndefined();
    expect(config['providers']).toMatchObject({ brain: 'claude', worker: 'codex' });
  });

  it('preserves top-level max_workers (Decision 1+2)', () => {
    const config: Record<string, unknown> = {
      max_workers: 3,
      spawn_backend: 'docker',
      claude_backend: 'tmux',
      providers: { brain: 'claude' },
      brain_provider: 'claude',
    };
    const removed = removeDuplicateKeys(config);
    expect(config['max_workers']).toBe(3);
    expect(removed).toContain('claude_backend');
    expect(removed).toContain('brain_provider');
  });

  it('removes fallback_provider when providers.fallback exists', () => {
    const config: Record<string, unknown> = {
      providers: { brain: 'claude', worker: 'claude', fallback: 'codex' },
      fallback_provider: 'codex',
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).toContain('fallback_provider');
    expect(config['fallback_provider']).toBeUndefined();
  });

  it('returns empty array when no duplicates found', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      max_workers: 5,
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).toHaveLength(0);
  });

  it('canonicalizes provider_overrides and compares maps independent of key order', () => {
    const config: Record<string, unknown> = {
      provider_overrides: { docs: 'gemini', tests: 'codex' },
      providers: { overrides: { tests: 'codex', docs: 'gemini' } },
    };
    const removed = removeDuplicateKeys(config);
    expect(removed).toEqual(['provider_overrides']);
    expect(config['provider_overrides']).toBeUndefined();
  });

  it('does not mutate any key when a provider alias conflicts', () => {
    const config: Record<string, unknown> = {
      spawn_backend: 'docker',
      claude_backend: 'tmux',
      brain_provider: 'claude',
      worker_provider: 'codex',
      providers: { worker: 'gemini' },
    };
    const before = structuredClone(config);
    expect(() => removeDuplicateKeys(config)).toThrow(ProviderConfigAliasConflictError);
    expect(config).toEqual(before);
  });
});

// ─── MODE_PRESETS Single Source ──────────────────────────────────────

describe('MODE_PRESETS single source', () => {
  it('getModePreset returns correct max_workers for performance', async () => {
    const { getModePreset } = await import('../../src/core/mode-presets.js');
    expect(getModePreset('performance')?.max_workers).toBe(8);
  });

  it('getModePreset returns correct max_workers for balanced', async () => {
    const { getModePreset } = await import('../../src/core/mode-presets.js');
    expect(getModePreset('balanced')?.max_workers).toBe(5);
  });

  it('getModePreset returns correct max_workers for economic', async () => {
    const { getModePreset } = await import('../../src/core/mode-presets.js');
    expect(getModePreset('economic')?.max_workers).toBe(3);
  });

  it('getModePreset returns correct max_workers for api', async () => {
    const { getModePreset } = await import('../../src/core/mode-presets.js');
    expect(getModePreset('api')?.max_workers).toBe(10);
  });

  it('DEFAULT_MODES max_workers matches MODE_PRESETS (single-source)', async () => {
    const { DEFAULT_MODES } = await import('../../src/core/config.js');
    const { MODE_PRESETS } = await import('../../src/core/mode-presets.js');
    for (const mode of ['performance', 'balanced', 'economic', 'api']) {
      expect(DEFAULT_MODES[mode]!.max_workers).toBe(MODE_PRESETS[mode]!.max_workers);
    }
  });
});
