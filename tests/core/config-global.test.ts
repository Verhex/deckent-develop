import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import type { DeckentConfig } from '../../src/core/types.js';
import {
  loadGlobalConfig,
  mergeConfigs,
  saveGlobalConfig,
  loadConfig,
  ConfigValidationError,
} from '../../src/core/config.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `deckent-global-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCfg(path: string, cfg: unknown): void {
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

// ── loadGlobalConfig ─────────────────────────────────────────────────────────

describe('loadGlobalConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null when global config file does not exist', async () => {
    const result = await loadGlobalConfig(join(tempDir, 'nonexistent', 'config.json'));
    expect(result).toBeNull();
  });

  it('returns partial config when global config exists', async () => {
    const cfgPath = join(tempDir, 'config.json');
    writeCfg(cfgPath, { mode: 'pro_plan', language: 'tr' });
    const result = await loadGlobalConfig(cfgPath);
    expect(result).not.toBeNull();
    expect((result as Partial<DeckentConfig>).mode).toBe('pro_plan');
    expect((result as Partial<DeckentConfig>).language).toBe('tr');
  });

  it('throws on malformed JSON in global config', async () => {
    const cfgPath = join(tempDir, 'config.json');
    writeFileSync(cfgPath, '{ invalid json }', 'utf-8');
    await expect(loadGlobalConfig(cfgPath)).rejects.toThrow();
  });

  it('returns null for a missing file path', async () => {
    const result = await loadGlobalConfig(join(tempDir, 'missing.json'));
    expect(result).toBeNull();
  });

  it('reads nested partial config including projectName', async () => {
    const cfgPath = join(tempDir, 'config.json');
    writeCfg(cfgPath, { projectName: 'global-proj', language: 'tr' });
    const result = await loadGlobalConfig(cfgPath);
    expect((result as Partial<DeckentConfig>).projectName).toBe('global-proj');
  });
});

// ── mergeConfigs ─────────────────────────────────────────────────────────────

describe('mergeConfigs', () => {
  it('returns defaults when both global and project are null', () => {
    const result = mergeConfigs(null, null);
    expect(result.mode).toBe('max_plan');
    expect(result.language).toBe('en');
  });

  it('applies global config over defaults', () => {
    const result = mergeConfigs({ language: 'tr' }, null);
    expect(result.language).toBe('tr');
    expect(result.mode).toBe('max_plan');
  });

  it('project config overrides global config', () => {
    const result = mergeConfigs({ language: 'tr', mode: 'pro_plan' }, { language: 'en' });
    expect(result.language).toBe('en');
    expect(result.mode).toBe('pro_plan');
  });

  it('project config overrides global mode', () => {
    const result = mergeConfigs({ mode: 'pro_plan' }, { mode: 'max_plan' });
    expect(result.mode).toBe('max_plan');
  });

  it('null global config with project config applies project', () => {
    const result = mergeConfigs(null, { language: 'tr' });
    expect(result.language).toBe('tr');
  });

  it('null project config with global config applies global', () => {
    const result = mergeConfigs({ projectName: 'my-global-project' }, null);
    expect(result.projectName).toBe('my-global-project');
  });

  it('merge order: global defaults, project overrides', () => {
    const global: Partial<DeckentConfig> = { language: 'tr', projectName: 'global-name' };
    const project: Partial<DeckentConfig> = { projectName: 'project-name' };
    const result = mergeConfigs(global, project);
    expect(result.language).toBe('tr');
    expect(result.projectName).toBe('project-name');
  });

  it('returns a complete ResolvedConfig with activeModeConfig', () => {
    const result = mergeConfigs(null, null);
    expect(result.activeModeConfig).toBeDefined();
    expect(result.activeModeConfig.max_workers).toBeDefined();
  });

  it('throws ConfigValidationError for invalid mode', () => {
    expect(() =>
      mergeConfigs({ mode: 'invalid_mode' as unknown as DeckentConfig['mode'] }, null),
    ).toThrow(ConfigValidationError);
  });

  it('merges both global and project config fields', () => {
    const result = mergeConfigs(
      { language: 'tr', projectName: 'from-global' },
      { mode: 'pro_plan', projectName: 'from-project' },
    );
    expect(result.language).toBe('tr');
    expect(result.mode).toBe('pro_plan');
    expect(result.projectName).toBe('from-project');
  });
});

// ── saveGlobalConfig ─────────────────────────────────────────────────────────

describe('saveGlobalConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates the directory and writes config', async () => {
    const cfgPath = join(tempDir, 'nested', 'config.json');
    await saveGlobalConfig({ language: 'tr' }, cfgPath);
    expect(existsSync(cfgPath)).toBe(true);
    const saved = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Partial<DeckentConfig>;
    expect(saved.language).toBe('tr');
  });

  it('overwrites existing global config', async () => {
    const cfgPath = join(tempDir, 'config.json');
    writeCfg(cfgPath, { language: 'en' });
    await saveGlobalConfig({ language: 'tr', mode: 'pro_plan' }, cfgPath);
    const saved = JSON.parse(readFileSync(cfgPath, 'utf-8')) as Partial<DeckentConfig>;
    expect(saved.language).toBe('tr');
    expect(saved.mode).toBe('pro_plan');
  });

  it('writes valid JSON with trailing newline', async () => {
    const cfgPath = join(tempDir, 'config.json');
    await saveGlobalConfig({ projectName: 'test' }, cfgPath);
    const content = readFileSync(cfgPath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('writes pretty-printed JSON', async () => {
    const cfgPath = join(tempDir, 'config.json');
    await saveGlobalConfig({ language: 'en', projectName: 'demo' }, cfgPath);
    const content = readFileSync(cfgPath, 'utf-8');
    expect(content).toContain('\n');
    expect(content).toContain('"language"');
  });

  it('round-trips with loadGlobalConfig', async () => {
    const cfgPath = join(tempDir, 'config.json');
    const original: Partial<DeckentConfig> = { language: 'tr', projectName: 'round-trip' };
    await saveGlobalConfig(original, cfgPath);
    const loaded = await loadGlobalConfig(cfgPath);
    expect(loaded).toEqual(original);
  });
});

// ── loadGlobalConfig — additional edge cases ────────────────────────────────

describe('loadGlobalConfig — edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty object when config file contains {}', async () => {
    const cfgPath = join(tempDir, 'config.json');
    writeCfg(cfgPath, {});
    const result = await loadGlobalConfig(cfgPath);
    expect(result).toEqual({});
  });

  it('reads config with all supported top-level fields', async () => {
    const cfgPath = join(tempDir, 'config.json');
    writeCfg(cfgPath, {
      mode: 'pro_plan',
      language: 'tr',
      projectName: 'full-config-project',
      version: '2.0.0',
    });
    const result = await loadGlobalConfig(cfgPath) as Partial<DeckentConfig>;
    expect(result?.mode).toBe('pro_plan');
    expect(result?.language).toBe('tr');
    expect(result?.projectName).toBe('full-config-project');
    expect(result?.version).toBe('2.0.0');
  });
});

// ── saveGlobalConfig — additional edge cases ────────────────────────────────

describe('saveGlobalConfig — edge cases', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('succeeds when directory already exists', async () => {
    const cfgPath = join(tempDir, 'config.json');
    await expect(saveGlobalConfig({ language: 'en' }, cfgPath)).resolves.not.toThrow();
  });

  it('saves and reloads an empty config object', async () => {
    const cfgPath = join(tempDir, 'config.json');
    await saveGlobalConfig({}, cfgPath);
    const loaded = await loadGlobalConfig(cfgPath);
    expect(loaded).toEqual({});
  });

  it('preserves nested modes in the written file', async () => {
    const cfgPath = join(tempDir, 'config.json');
    const cfg: Partial<DeckentConfig> = {
      mode: 'pro_plan',
      modes: {
        pro_plan: {
          max_workers: 5,
          brain_model: 'sonnet',
          default_model: 'sonnet',
          haiku_allowed: false,
          usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
          brain_planning: 'auto',
        },
      } as DeckentConfig['modes'],
    };
    await saveGlobalConfig(cfg, cfgPath);
    const loaded = await loadGlobalConfig(cfgPath) as Partial<DeckentConfig>;
    expect(loaded?.modes?.pro_plan?.max_workers).toBe(5);
  });
});

// ── mergeConfigs — additional edge cases ────────────────────────────────────

describe('mergeConfigs — edge cases', () => {
  it('both configs are empty objects (not null) — returns defaults', () => {
    const result = mergeConfigs({}, {});
    expect(result.mode).toBe('max_plan');
    expect(result.language).toBe('en');
    expect(result.activeModeConfig).toBeDefined();
  });

  it('global empty object + project with language — applies language', () => {
    const result = mergeConfigs({}, { language: 'tr' });
    expect(result.language).toBe('tr');
  });

  it('deep merges nested mode config from global', () => {
    const global: Partial<DeckentConfig> = {
      modes: {
        pro_plan: {
          max_workers: 7,
          brain_model: 'sonnet',
          default_model: 'sonnet',
          haiku_allowed: false,
          usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
          brain_planning: 'auto',
        },
      } as DeckentConfig['modes'],
    };
    const result = mergeConfigs(global, { mode: 'pro_plan' });
    expect(result.modes.pro_plan.max_workers).toBe(7);
  });

  it('project config can override a nested mode field from global', () => {
    const global: Partial<DeckentConfig> = {
      modes: {
        pro_plan: {
          max_workers: 3,
          brain_model: 'sonnet',
          default_model: 'sonnet',
          haiku_allowed: false,
          usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
          brain_planning: 'auto',
        },
      } as DeckentConfig['modes'],
    };
    const project: Partial<DeckentConfig> = {
      modes: {
        pro_plan: {
          max_workers: 5,
          brain_model: 'sonnet',
          default_model: 'sonnet',
          haiku_allowed: false,
          usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
          brain_planning: 'auto',
        },
      } as DeckentConfig['modes'],
    };
    const result = mergeConfigs(global, project);
    expect(result.modes.pro_plan.max_workers).toBe(5);
  });

  it('projectRoot is always a resolved string path', () => {
    const result = mergeConfigs(null, null);
    expect(typeof result.projectRoot).toBe('string');
    expect(result.projectRoot.startsWith('/')).toBe(true);
  });

  it('auto_docs defaults are present when not provided', () => {
    const result = mergeConfigs(null, null);
    expect(result.auto_docs).toBeDefined();
    expect(result.auto_docs?.tier1).toBe(true);
  });

  it('version defaults to DECKENT_VERSION when not provided', () => {
    const result = mergeConfigs(null, null);
    expect(result.version).toBeDefined();
    expect(typeof result.version).toBe('string');
  });

  it('projectName defaults to "deckent-project" when not provided', () => {
    const result = mergeConfigs(null, null);
    expect(result.projectName).toBe('deckent-project');
  });
});

// ── loadConfig global+project merge ─────────────────────────────────────────

describe('loadConfig — global + project merge', () => {
  let tempDir: string;
  let globalDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    globalDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
  });

  it('uses defaults when no global and no project config', async () => {
    // No config files — loadConfig uses real GLOBAL_CONFIG_PATH which may or may not exist
    // We test with a fresh project dir that has no .deckent/config.json
    const result = await loadConfig(tempDir);
    expect(result.mode).toBe('max_plan');
    expect(['en', 'tr']).toContain(result.language); // default is 'en' unless real global overrides
  });

  it('applies project config when it exists', async () => {
    const projectDeckentDir = join(tempDir, '.deckent');
    mkdirSync(projectDeckentDir, { recursive: true });
    writeCfg(join(projectDeckentDir, 'config.json'), { language: 'tr' });
    const result = await loadConfig(tempDir);
    expect(result.language).toBe('tr');
  });

  it('project config mode is used in loadConfig', async () => {
    const projectDeckentDir = join(tempDir, '.deckent');
    mkdirSync(projectDeckentDir, { recursive: true });
    writeCfg(join(projectDeckentDir, 'config.json'), { mode: 'pro_plan' });
    const result = await loadConfig(tempDir);
    expect(result.mode).toBe('pro_plan');
  });

  it('sets projectRoot to the resolved directory', async () => {
    const result = await loadConfig(tempDir);
    expect(result.projectRoot).toBe(tempDir);
  });
});
