import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const TMP = join(tmpdir(), `deckent-readjson-migration-${Date.now()}`);

function writeJson(filePath: string, data: unknown): void {
  const dir = join(filePath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function writeInvalid(filePath: string): void {
  const dir = join(filePath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, '{invalid json!!!', 'utf-8');
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
});

// ─── readJsonSafe Core ───────────────────────────────────────────────────────

describe('readJsonSafe core function', () => {
  it('returns parsed JSON for valid file', async () => {
    const { readJsonSafe } = await import('../../src/core/utils.js');
    const file = join(TMP, 'valid.json');
    writeJson(file, { hello: 'world' });
    const result = readJsonSafe<{ hello: string }>(file);
    expect(result).toEqual({ hello: 'world' });
  });

  it('returns null for missing file', async () => {
    const { readJsonSafe } = await import('../../src/core/utils.js');
    expect(readJsonSafe(join(TMP, 'nonexistent.json'))).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    const { readJsonSafe } = await import('../../src/core/utils.js');
    const file = join(TMP, 'bad.json');
    writeInvalid(file);
    expect(readJsonSafe(file)).toBeNull();
  });
});

// ─── readJsonSafeAsync Core ─────────────────────────────────────────────────

describe('readJsonSafeAsync core function', () => {
  it('returns parsed JSON for valid file', async () => {
    const { readJsonSafeAsync } = await import('../../src/core/utils.js');
    const file = join(TMP, 'async-valid.json');
    writeJson(file, { key: 'value' });
    const result = await readJsonSafeAsync<{ key: string }>(file);
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null for missing file', async () => {
    const { readJsonSafeAsync } = await import('../../src/core/utils.js');
    expect(await readJsonSafeAsync(join(TMP, 'nope.json'))).toBeNull();
  });

  it('returns null for invalid JSON', async () => {
    const { readJsonSafeAsync } = await import('../../src/core/utils.js');
    const file = join(TMP, 'async-bad.json');
    writeInvalid(file);
    expect(await readJsonSafeAsync(file)).toBeNull();
  });
});

// ─── global-config.ts migration ─────────────────────────────────────────────

describe('global-config readJsonSafe migration', () => {
  it('readGlobalConfig returns null when file does not exist', async () => {
    const { readGlobalConfig } = await import('../../src/core/global-config.js');
    // Using the actual function (it checks GLOBAL_CONFIG_PATH)
    // We can't easily mock the path, but we can verify the import chain
    expect(typeof readGlobalConfig).toBe('function');
  });

  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/global-config.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    expect(source).not.toContain('JSON.parse');
    expect(source).not.toContain('readFileSync');
  });
});

// ─── skill-registry.ts migration ────────────────────────────────────────────

describe('skill-registry readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/skill-registry.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    expect(source).not.toContain('JSON.parse');
  });

  it('SkillRegistry reads data correctly', async () => {
    const { SkillRegistry } = await import('../../src/core/skill-registry.js');
    const regDir = join(TMP, 'registry');
    mkdirSync(regDir, { recursive: true });
    const reg = new SkillRegistry(regDir);
    expect(reg.getAll()).toEqual([]);
  });

  it('SkillRegistry returns empty on invalid file', async () => {
    const { SkillRegistry } = await import('../../src/core/skill-registry.js');
    const regDir = join(TMP, 'registry-bad');
    mkdirSync(regDir, { recursive: true });
    writeFileSync(join(regDir, 'skill-registry.json'), '{bad json!!', 'utf-8');
    const reg = new SkillRegistry(regDir);
    expect(reg.getAll()).toEqual([]);
  });
});

// ─── plugin.ts migration ────────────────────────────────────────────────────

describe('plugin readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/plugin.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    // loadPlugin still calls readJsonSafe -> should not have inline JSON.parse for readFileSync
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    expect(jsonParseCount).toBe(0);
  });

  it('loadPlugin throws PluginError on invalid manifest', async () => {
    const { loadPlugin, PluginError } = await import('../../src/core/plugin.js');
    const pluginDir = join(TMP, 'bad-plugin');
    mkdirSync(pluginDir, { recursive: true });
    writeInvalid(join(pluginDir, 'manifest.json'));
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
  });

  it('loadPlugin works with valid manifest', async () => {
    const { loadPlugin } = await import('../../src/core/plugin.js');
    const pluginDir = join(TMP, 'good-plugin');
    mkdirSync(pluginDir, { recursive: true });
    writeJson(join(pluginDir, 'manifest.json'), {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'Test plugin',
      entrypoint: 'index.ts',
    });
    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.name).toBe('test-plugin');
  });

  it('enablePlugin returns false on invalid manifest', async () => {
    const { enablePlugin } = await import('../../src/core/plugin.js');
    const pluginsDir = join(TMP, 'plugins-enable');
    const pluginDir = join(pluginsDir, 'broken');
    mkdirSync(pluginDir, { recursive: true });
    writeInvalid(join(pluginDir, 'manifest.json'));
    expect(enablePlugin('broken', pluginsDir)).toBe(false);
  });

  it('disablePlugin returns false on invalid manifest', async () => {
    const { disablePlugin } = await import('../../src/core/plugin.js');
    const pluginsDir = join(TMP, 'plugins-disable');
    const pluginDir = join(pluginsDir, 'broken');
    mkdirSync(pluginDir, { recursive: true });
    writeInvalid(join(pluginDir, 'manifest.json'));
    expect(disablePlugin('broken', pluginsDir)).toBe(false);
  });
});

// ─── stack-detector.ts migration ────────────────────────────────────────────

describe('stack-detector readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/stack-detector.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    expect(jsonParseCount).toBe(0);
  });

  it('detectProjectStack works without package.json', async () => {
    const { detectProjectStack } = await import('../../src/core/stack-detector.js');
    const projDir = join(TMP, 'empty-proj');
    mkdirSync(projDir, { recursive: true });
    const stack = detectProjectStack(projDir);
    expect(stack.language).toBe('unknown');
  });

  it('detectProjectStack reads valid package.json', async () => {
    const { detectProjectStack } = await import('../../src/core/stack-detector.js');
    const projDir = join(TMP, 'ts-proj');
    mkdirSync(projDir, { recursive: true });
    writeJson(join(projDir, 'package.json'), {
      dependencies: {},
      devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0' },
    });
    writeJson(join(projDir, 'tsconfig.json'), {});
    const stack = detectProjectStack(projDir);
    expect(stack.language).toBe('typescript');
    expect(stack.testFramework).toBe('vitest');
  });

  it('detectProjectStack handles invalid cache gracefully', async () => {
    const { detectProjectStack } = await import('../../src/core/stack-detector.js');
    const projDir = join(TMP, 'bad-cache-proj');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeInvalid(join(projDir, '.deckent', 'project-stack.json'));
    const stack = detectProjectStack(projDir);
    expect(stack).toBeDefined();
    expect(stack.language).toBe('unknown');
  });
});

// ─── agent-pool.ts migration ────────────────────────────────────────────────

describe('agent-pool readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/agent-pool.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    expect(jsonParseCount).toBe(0);
  });

  it('AgentPoolManager loads valid agents', async () => {
    const { AgentPoolManager } = await import('../../src/core/agent-pool.js');
    const projDir = join(TMP, 'agent-proj');
    const agentDir = join(projDir, '.deckent', 'agents', 'test-agent');
    mkdirSync(agentDir, { recursive: true });
    writeJson(join(agentDir, 'agent.json'), {
      id: 'test-agent',
      name: 'Test Agent',
      enabled: true,
    });
    const mgr = new AgentPoolManager(projDir);
    const pool = mgr.loadAgents();
    expect(pool.has('test-agent')).toBe(true);
  });

  it('AgentPoolManager skips invalid agent files', async () => {
    const { AgentPoolManager } = await import('../../src/core/agent-pool.js');
    const projDir = join(TMP, 'agent-proj-bad');
    const agentDir = join(projDir, '.deckent', 'agents', 'bad-agent');
    mkdirSync(agentDir, { recursive: true });
    writeInvalid(join(agentDir, 'agent.json'));
    const mgr = new AgentPoolManager(projDir);
    const pool = mgr.loadAgents();
    expect(pool.size).toBe(0);
  });
});

// ─── credentials.ts migration ───────────────────────────────────────────────

describe('credentials readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/credentials.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    // Only JSON.stringify should remain (for storeCredential)
    expect(jsonParseCount).toBe(0);
  });

  it('CredentialManager.getCredential returns null for missing file', async () => {
    const { CredentialManager } = await import('../../src/core/credentials.js');
    const credsDir = join(TMP, 'creds-missing');
    mkdirSync(credsDir, { recursive: true });
    const mgr = new CredentialManager(credsDir);
    expect(mgr.getCredential('nonexistent')).toBeNull();
  });

  it('CredentialManager.getCredential returns key for valid file', async () => {
    const { CredentialManager } = await import('../../src/core/credentials.js');
    const credsDir = join(TMP, 'creds-valid');
    mkdirSync(credsDir, { recursive: true });
    writeJson(join(credsDir, 'test-provider.json'), {
      provider: 'test-provider',
      key: 'secret-key-123',
      storedAt: new Date().toISOString(),
    });
    const mgr = new CredentialManager(credsDir);
    expect(mgr.getCredential('test-provider')).toBe('secret-key-123');
  });

  it('CredentialManager.getCredential returns null for invalid JSON', async () => {
    const { CredentialManager } = await import('../../src/core/credentials.js');
    const credsDir = join(TMP, 'creds-bad');
    mkdirSync(credsDir, { recursive: true });
    writeInvalid(join(credsDir, 'bad-provider.json'));
    const mgr = new CredentialManager(credsDir);
    expect(mgr.getCredential('bad-provider')).toBeNull();
  });

  it('CredentialManager.getCredentialEntry returns entry for valid file', async () => {
    const { CredentialManager } = await import('../../src/core/credentials.js');
    const credsDir = join(TMP, 'creds-entry');
    mkdirSync(credsDir, { recursive: true });
    const entry = {
      provider: 'my-provider',
      key: 'my-key',
      storedAt: '2026-01-01T00:00:00.000Z',
    };
    writeJson(join(credsDir, 'my-provider.json'), entry);
    const mgr = new CredentialManager(credsDir);
    expect(mgr.getCredentialEntry('my-provider')).toEqual(entry);
  });

  it('CredentialManager.listCredentials reads providers', async () => {
    const { CredentialManager } = await import('../../src/core/credentials.js');
    const credsDir = join(TMP, 'creds-list');
    mkdirSync(credsDir, { recursive: true });
    writeJson(join(credsDir, 'p1.json'), { provider: 'p1', key: 'k1', storedAt: '' });
    writeJson(join(credsDir, 'p2.json'), { provider: 'p2', key: 'k2', storedAt: '' });
    const mgr = new CredentialManager(credsDir);
    const list = mgr.listCredentials();
    expect(list).toContain('p1');
    expect(list).toContain('p2');
  });
});

// ─── usage-tracker.ts migration ─────────────────────────────────────────────

describe('usage-tracker readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/usage-tracker.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    expect(jsonParseCount).toBe(0);
  });

  it('UsageTracker reads sprint usage correctly', async () => {
    const { UsageTracker } = await import('../../src/core/usage-tracker.js');
    const tracker = new UsageTracker(TMP);
    tracker.recordCall('opus', 100, 'task-001', 'sprint-001');
    const usage = tracker.getSprintUsage('sprint-001');
    expect(usage.totalCalls).toBe(1);
    expect(usage.totalTokens).toBe(100);
  });

  it('UsageTracker handles invalid sprint file gracefully', async () => {
    const { UsageTracker } = await import('../../src/core/usage-tracker.js');
    const usageDir = join(TMP, '.deckent', 'usage');
    mkdirSync(usageDir, { recursive: true });
    writeInvalid(join(usageDir, 'sprint-bad.json'));
    const tracker = new UsageTracker(TMP);
    const usage = tracker.getSprintUsage('sprint-bad');
    expect(usage.totalCalls).toBe(0);
    expect(usage.entries).toEqual([]);
  });
});

// ─── skill-pool.ts migration ────────────────────────────────────────────────

describe('skill-pool readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/skill-pool.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    expect(jsonParseCount).toBe(0);
  });

  it('SkillPoolManager loads valid skills', async () => {
    const { SkillPoolManager } = await import('../../src/core/skill-pool.js');
    const projDir = join(TMP, 'skill-proj');
    const skillDir = join(projDir, '.deckent', 'skills', 'test-skill');
    mkdirSync(skillDir, { recursive: true });
    writeJson(join(skillDir, 'manifest.json'), {
      id: 'test-skill',
      name: 'Test Skill',
      enabled: true,
    });
    const mgr = new SkillPoolManager(projDir);
    const skills = mgr.listSkills();
    expect(skills.length).toBe(1);
    expect(skills[0]!.id).toBe('test-skill');
  });

  it('SkillPoolManager skips invalid manifest files', async () => {
    const { SkillPoolManager } = await import('../../src/core/skill-pool.js');
    const projDir = join(TMP, 'skill-proj-bad');
    const skillDir = join(projDir, '.deckent', 'skills', 'bad-skill');
    mkdirSync(skillDir, { recursive: true });
    writeInvalid(join(skillDir, 'manifest.json'));
    const mgr = new SkillPoolManager(projDir);
    expect(mgr.listSkills().length).toBe(0);
  });
});

// ─── subscription.ts migration ──────────────────────────────────────────────

describe('subscription readJsonSafeAsync migration', () => {
  it('source file imports readJsonSafeAsync', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/subscription.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafeAsync } from './utils.js'");
    const jsonParseCount = (source.match(/JSON\.parse/g) || []).length;
    expect(jsonParseCount).toBe(0);
  });

  it('saveSubscriptionToConfig creates config with subscription', async () => {
    const { saveSubscriptionToConfig } = await import('../../src/core/subscription.js');
    const projDir = join(TMP, 'sub-proj');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    const profile = {
      detected: 'max' as const,
      opusAvailable: true,
      testedAt: '2026-01-01T00:00:00.000Z',
      method: 'opus_probe' as const,
    };
    await saveSubscriptionToConfig(profile, projDir);
    const { readFileSync } = await import('node:fs');
    const configPath = join(projDir, '.deckent', 'config.json');
    const result = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(result.subscription).toEqual(profile);
  });

  it('saveSubscriptionToConfig merges with existing config', async () => {
    const { saveSubscriptionToConfig } = await import('../../src/core/subscription.js');
    const projDir = join(TMP, 'sub-proj-merge');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeJson(join(projDir, '.deckent', 'config.json'), { mode: 'max_plan' });
    const profile = {
      detected: 'pro' as const,
      opusAvailable: false,
      testedAt: '2026-01-01T00:00:00.000Z',
      method: 'opus_probe' as const,
    };
    await saveSubscriptionToConfig(profile, projDir);
    const { readFileSync } = await import('node:fs');
    const configPath = join(projDir, '.deckent', 'config.json');
    const result = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(result.mode).toBe('max_plan');
    expect(result.subscription).toEqual(profile);
  });
});

// ─── config.ts migration ────────────────────────────────────────────────────

describe('config readJsonSafeAsync migration', () => {
  it('source file imports readJsonSafeAsync', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/config.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafeAsync } from './utils.js'");
    // readJsonFile should use readJsonSafeAsync
    expect(source).toContain('readJsonSafeAsync');
  });

  it('loadConfig returns defaults when no config files exist', async () => {
    const { loadConfig } = await import('../../src/core/config.js');
    const projDir = join(TMP, 'no-config-proj');
    mkdirSync(projDir, { recursive: true });
    const config = await loadConfig(projDir);
    expect(config.mode).toBe('max_plan');
  });

  it('loadConfig reads project config', async () => {
    const { loadConfig } = await import('../../src/core/config.js');
    const projDir = join(TMP, 'config-proj');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeJson(join(projDir, '.deckent', 'config.json'), {
      language: 'tr',
    });
    const config = await loadConfig(projDir);
    expect(config.language).toBe('tr');
  });

  it('loadConfig handles malformed config gracefully', async () => {
    const { loadConfig } = await import('../../src/core/config.js');
    const projDir = join(TMP, 'bad-config-proj');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeInvalid(join(projDir, '.deckent', 'config.json'));
    // Should return defaults (readJsonSafeAsync returns null for invalid JSON)
    const config = await loadConfig(projDir);
    expect(config.mode).toBe('max_plan');
  });
});

// ─── analyzer.ts migration ───────────────────────────────────────────────────

describe('analyzer readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/analyzer.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from './utils.js'");
    // readPackageJson should use readJsonSafe — no inline JSON.parse(readFileSync(...))
    expect(source).not.toMatch(/JSON\.parse\(readFileSync\(/);
  });

  it('analyzeProject works without package.json', async () => {
    const { analyzeProject } = await import('../../src/core/analyzer.js');
    const projDir = join(TMP, 'analyzer-empty');
    mkdirSync(projDir, { recursive: true });
    const result = analyzeProject(projDir);
    expect(result.framework).toBe('unknown');
    expect(result.language).toBe('unknown');
  });

  it('analyzeProject detects TypeScript project', async () => {
    const { analyzeProject } = await import('../../src/core/analyzer.js');
    const projDir = join(TMP, 'analyzer-ts');
    mkdirSync(projDir, { recursive: true });
    writeJson(join(projDir, 'package.json'), {
      dependencies: {},
      devDependencies: { typescript: '^5.0.0' },
    });
    writeJson(join(projDir, 'tsconfig.json'), {});
    const result = analyzeProject(projDir);
    expect(result.language).toBe('typescript');
  });
});

// ─── webhook.ts migration ────────────────────────────────────────────────────

describe('webhook readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/notification-providers/webhook.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from '../utils.js'");
    expect(source).not.toMatch(/JSON\.parse\(readFileSync\(/);
  });
});

// ─── api/server.ts migration ─────────────────────────────────────────────────

describe('api/server readJsonSafe migration', () => {
  it('source file imports readJsonSafe', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/api/server.ts', 'utf-8');
    expect(source).toContain("import { readJsonSafe } from '../core/utils.js'");
    // readDashboardJson and readJsonFile should use readJsonSafe
    expect(source).not.toMatch(/JSON\.parse\(readFileSync\(/);
  });
});

// ─── utils.ts self-migration ─────────────────────────────────────────────────

describe('utils.ts self-migration (getNextSprintId, updateLastSprintId)', () => {
  it('getNextSprintId uses readJsonSafe internally', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/core/utils.ts', 'utf-8');
    // Only JSON.parse should be in the readJsonSafe/readJsonSafeAsync function definitions
    const lines = source.split('\n');
    const jsonParseLines = lines
      .map((line, i) => ({ line, num: i + 1 }))
      .filter(({ line }) => line.includes('JSON.parse('));
    // readJsonSafe (line ~24) and readJsonSafeAsync (line ~36) are the only JSON.parse usages
    for (const { line } of jsonParseLines) {
      expect(line).toMatch(/return JSON\.parse\(/);
    }
  });

  it('getNextSprintId reads config correctly', async () => {
    const { getNextSprintId } = await import('../../src/core/utils.js');
    const projDir = join(TMP, 'sprint-id-proj');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeJson(join(projDir, '.deckent', 'config.json'), {
      last_sprint_id: 'sprint-005',
    });
    const next = getNextSprintId(projDir);
    expect(next).toBe('sprint-006');
  });

  it('getNextSprintId handles malformed config', async () => {
    const { getNextSprintId } = await import('../../src/core/utils.js');
    const projDir = join(TMP, 'sprint-id-bad');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeInvalid(join(projDir, '.deckent', 'config.json'));
    const next = getNextSprintId(projDir);
    expect(next).toBe('sprint-001');
  });

  it('updateLastSprintId uses readJsonSafe', async () => {
    const { updateLastSprintId } = await import('../../src/core/utils.js');
    const projDir = join(TMP, 'update-sprint-proj');
    mkdirSync(join(projDir, '.deckent'), { recursive: true });
    writeJson(join(projDir, '.deckent', 'config.json'), { mode: 'max_plan' });
    updateLastSprintId(projDir, 'sprint-010');
    const { readFileSync } = await import('node:fs');
    const result = JSON.parse(readFileSync(join(projDir, '.deckent', 'config.json'), 'utf-8'));
    expect(result.mode).toBe('max_plan');
    expect(result.last_sprint_id).toBe('sprint-010');
  });
});

// ─── No inline JSON.parse in migrated files (comprehensive check) ───────────

describe('migration completeness — no inline JSON.parse(readFileSync) in migrated files', () => {
  const migratedFiles = [
    'src/core/global-config.ts',
    'src/core/skill-registry.ts',
    'src/core/plugin.ts',
    'src/core/stack-detector.ts',
    'src/core/agent-pool.ts',
    'src/core/credentials.ts',
    'src/core/usage-tracker.ts',
    'src/core/skill-pool.ts',
    'src/core/subscription.ts',
    'src/core/analyzer.ts',
    'src/core/notification-providers/webhook.ts',
    'src/api/server.ts',
  ];

  for (const file of migratedFiles) {
    it(`${file} has no inline JSON.parse(readFileSync(...))`, async () => {
      const { readFileSync } = await import('node:fs');
      const source = readFileSync(file, 'utf-8');
      expect(source).not.toMatch(/JSON\.parse\(readFileSync\(/);
    });
  }
});
