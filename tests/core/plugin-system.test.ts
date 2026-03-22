/**
 * Plugin System Integration Tests
 * Tests the full plugin lifecycle using the real filesystem (no mocks).
 * Covers: lifecycle, manifest validation, scanning, hooks, error scenarios, CLI integration.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  createPlugin,
  installPlugin,
  enablePlugin,
  disablePlugin,
  listPlugins,
  loadPlugin,
  removePlugin,
  scanPlugins,
  PluginError,
  type Plugin,
} from '../../src/core/plugin.js';

import {
  registerHook,
  runHooks,
  clearHooks,
  clearHook,
  getHookCount,
  type PluginHook,
  type BeforeSprintContext,
  type AfterSprintContext,
} from '../../src/core/plugin-hooks.js';

import type { Task, Sprint, TaskResult, ResolvedConfig } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-plugin-system-'));
}

function writeManifest(
  pluginsDir: string,
  name: string,
  extra: Record<string, unknown> = {},
): string {
  const pluginDir = path.join(pluginsDir, name);
  fs.mkdirSync(pluginDir, { recursive: true });
  const manifest = {
    name,
    version: '1.0.0',
    description: `${name} plugin`,
    entrypoint: 'SKILL.md',
    ...extra,
  };
  fs.writeFileSync(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  return pluginDir;
}

function makeBeforeSprintCtx(overrides: Partial<BeforeSprintContext> = {}): BeforeSprintContext {
  return {
    hook: 'beforeSprint',
    sprintId: 'sprint-001',
    tasks: [],
    config: {} as ResolvedConfig,
    projectRoot: '/mock/root',
    ...overrides,
  };
}

function makeAfterSprintCtx(overrides: Partial<AfterSprintContext> = {}): AfterSprintContext {
  return {
    hook: 'afterSprint',
    sprint: { id: 'sprint-001', number: 1, status: 'COMPLETE', phase: 'COMPLETE', tasks: [], workers: [] } as Sprint,
    projectRoot: '/mock/root',
    ...overrides,
  };
}

// ─── 1. Full Lifecycle ────────────────────────────────────────────────────────

describe('Full plugin lifecycle: create → install → enable → list → disable → remove', () => {
  let tmpDir: string;
  let pluginsDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    pluginsDir = path.join(tmpDir, 'plugins');
    sourceDir = path.join(tmpDir, 'source');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('create — scaffolds manifest.json, SKILL.md, README.md', async () => {
    const plugin = await createPlugin('my-plugin', pluginsDir);
    expect(plugin.manifest.name).toBe('my-plugin');
    expect(plugin.manifest.version).toBe('0.1.0');
    expect(fs.existsSync(path.join(pluginsDir, 'my-plugin', 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, 'my-plugin', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, 'my-plugin', 'README.md'))).toBe(true);
  });

  it('install — copies local plugin into pluginsDir', async () => {
    writeManifest(sourceDir, 'alpha', {});
    const sourcePluginDir = path.join(sourceDir, 'alpha');
    const plugin = await installPlugin(sourcePluginDir, pluginsDir);
    expect(plugin.manifest.name).toBe('alpha');
    expect(fs.existsSync(path.join(pluginsDir, 'alpha'))).toBe(true);
  });

  it('enable — sets enabled=true and makes plugin appear in listPlugins', async () => {
    writeManifest(pluginsDir, 'beta', { enabled: false });
    let listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'beta')).toBeUndefined();

    enablePlugin('beta', pluginsDir);

    listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'beta')).toBeDefined();
  });

  it('list — returns all enabled plugins', () => {
    writeManifest(pluginsDir, 'p1', { enabled: true });
    writeManifest(pluginsDir, 'p2', { enabled: true });
    writeManifest(pluginsDir, 'p3', { enabled: false });

    const listed = listPlugins(pluginsDir);
    expect(listed).toHaveLength(2);
    const names = listed.map((p) => p.manifest.name).sort();
    expect(names).toEqual(['p1', 'p2']);
  });

  it('disable — sets enabled=false and removes plugin from listPlugins', () => {
    writeManifest(pluginsDir, 'gamma', { enabled: true });
    let listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'gamma')).toBeDefined();

    disablePlugin('gamma', pluginsDir);

    listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'gamma')).toBeUndefined();
  });

  it('remove — deletes plugin directory and returns true', () => {
    writeManifest(pluginsDir, 'delta', { enabled: true });
    const pluginDir = path.join(pluginsDir, 'delta');
    expect(fs.existsSync(pluginDir)).toBe(true);

    const removed = removePlugin('delta', pluginsDir);
    expect(removed).toBe(true);
    expect(fs.existsSync(pluginDir)).toBe(false);
  });

  it('full end-to-end: create → install → disable → re-enable → remove', async () => {
    // Create a valid source plugin for installation
    const sourcePlugin = path.join(tmpDir, 'src-lifecycle');
    fs.mkdirSync(sourcePlugin, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePlugin, 'manifest.json'),
      JSON.stringify({ name: 'lifecycle-plugin', version: '1.0.0', description: 'Lifecycle test', entrypoint: 'SKILL.md' }),
      'utf8',
    );

    // Install
    const installed = await installPlugin(sourcePlugin, pluginsDir);
    expect(installed.manifest.name).toBe('lifecycle-plugin');

    // Appears in listPlugins (enabled by default)
    let listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'lifecycle-plugin')).toBeDefined();

    // Disable
    const disabled = disablePlugin('lifecycle-plugin', pluginsDir);
    expect(disabled).toBe(true);
    listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'lifecycle-plugin')).toBeUndefined();

    // Re-enable
    enablePlugin('lifecycle-plugin', pluginsDir);
    listed = listPlugins(pluginsDir);
    expect(listed.find((p) => p.manifest.name === 'lifecycle-plugin')).toBeDefined();

    // Remove
    const removed = removePlugin('lifecycle-plugin', pluginsDir);
    expect(removed).toBe(true);
    expect(fs.existsSync(path.join(pluginsDir, 'lifecycle-plugin'))).toBe(false);
  });
});

// ─── 2. Manifest Validation ───────────────────────────────────────────────────

describe('Manifest validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('valid manifest — loads all fields correctly', () => {
    const pluginDir = path.join(tmpDir, 'valid-plugin');
    fs.mkdirSync(pluginDir);
    const manifest = {
      name: 'valid-plugin',
      version: '2.3.4',
      description: 'A valid plugin',
      entrypoint: 'SKILL.md',
      enabled: true,
    };
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.name).toBe('valid-plugin');
    expect(plugin.manifest.version).toBe('2.3.4');
    expect(plugin.manifest.description).toBe('A valid plugin');
    expect(plugin.manifest.entrypoint).toBe('SKILL.md');
    expect(plugin.manifest.enabled).toBe(true);
    expect(plugin.dir).toBe(pluginDir);
  });

  it('invalid manifest — missing name throws PluginError', () => {
    const pluginDir = path.join(tmpDir, 'no-name');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ version: '1.0.0', description: 'x', entrypoint: 'y' }),
      'utf8',
    );
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
    expect(() => loadPlugin(pluginDir)).toThrow('"name"');
  });

  it('invalid manifest — empty version throws PluginError', () => {
    const pluginDir = path.join(tmpDir, 'empty-version');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'p', version: '   ', description: 'x', entrypoint: 'y' }),
      'utf8',
    );
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
    expect(() => loadPlugin(pluginDir)).toThrow('"version"');
  });

  it('partial manifest — only name + version throws PluginError (missing description + entrypoint)', () => {
    const pluginDir = path.join(tmpDir, 'partial');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'partial', version: '1.0.0' }),
      'utf8',
    );
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
  });

  it('manifest with null value throws PluginError', () => {
    const pluginDir = path.join(tmpDir, 'null-field');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'p', version: '1.0.0', description: null, entrypoint: 'y' }),
      'utf8',
    );
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
    expect(() => loadPlugin(pluginDir)).toThrow('"description"');
  });

  it('enabled defaults to true when not present', () => {
    const pluginDir = path.join(tmpDir, 'no-enabled');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'no-enabled', version: '1.0.0', description: 'x', entrypoint: 'y' }),
      'utf8',
    );
    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.enabled).toBe(true);
  });
});

// ─── 3. Plugin Scanning ───────────────────────────────────────────────────────

describe('Plugin scanning', () => {
  let tmpDir: string;
  let pluginsDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    pluginsDir = path.join(tmpDir, '.deckent', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans multiple plugins and returns all enabled ones', () => {
    writeManifest(pluginsDir, 'scan-a', { enabled: true });
    writeManifest(pluginsDir, 'scan-b', { enabled: true });
    writeManifest(pluginsDir, 'scan-c', { enabled: false });

    const plugins = scanPlugins(tmpDir);
    expect(plugins).toHaveLength(2);
    const names = plugins.map((p) => p.manifest.name).sort();
    expect(names).toEqual(['scan-a', 'scan-b']);
  });

  it('ignores non-directory entries (files at top level)', () => {
    writeManifest(pluginsDir, 'real-plugin');
    fs.writeFileSync(path.join(pluginsDir, 'README.md'), '# plugins', 'utf8');

    const plugins = scanPlugins(tmpDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.manifest.name).toBe('real-plugin');
  });

  it('silently skips directories without manifest.json', () => {
    const emptyDir = path.join(pluginsDir, 'empty-dir');
    fs.mkdirSync(emptyDir);
    writeManifest(pluginsDir, 'good-plugin');

    const plugins = scanPlugins(tmpDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0]!.manifest.name).toBe('good-plugin');
  });

  it('returns empty array when .deckent/plugins/ does not exist', () => {
    const emptyRoot = makeTmpDir();
    try {
      const plugins = scanPlugins(emptyRoot);
      expect(plugins).toEqual([]);
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  });
});

// ─── 4. Hook Execution ────────────────────────────────────────────────────────

describe('Hook execution', () => {
  beforeEach(() => {
    clearHooks();
  });

  afterEach(() => {
    clearHooks();
  });

  it('beforeSprint hook is called with correct context', async () => {
    const calls: string[] = [];
    registerHook('beforeSprint', (ctx) => {
      calls.push((ctx as BeforeSprintContext).sprintId);
    });

    await runHooks('beforeSprint', makeBeforeSprintCtx({ sprintId: 'sprint-010' }));
    expect(calls).toEqual(['sprint-010']);
  });

  it('afterSprint hook is called with sprint data', async () => {
    let receivedSprintId = '';
    registerHook('afterSprint', (ctx) => {
      receivedSprintId = (ctx as AfterSprintContext).sprint.id;
    });

    const sprint = makeAfterSprintCtx({
      sprint: {
        id: 'sprint-099',
        number: 99,
        status: 'COMPLETE',
        phase: 'COMPLETE',
        tasks: [],
        workers: [],
      } as Sprint,
    });
    await runHooks('afterSprint', sprint);
    expect(receivedSprintId).toBe('sprint-099');
  });

  it('multiple hooks for same event run in registration order', async () => {
    const order: number[] = [];
    registerHook('beforeSprint', () => { order.push(1); });
    registerHook('beforeSprint', () => { order.push(2); });
    registerHook('beforeSprint', () => { order.push(3); });

    await runHooks('beforeSprint', makeBeforeSprintCtx());
    expect(order).toEqual([1, 2, 3]);
  });

  it('failing hook does not abort subsequent hooks', async () => {
    const calls: string[] = [];
    registerHook('afterSprint', () => { throw new Error('hook failure'); });
    registerHook('afterSprint', () => { calls.push('ran'); });

    await expect(runHooks('afterSprint', makeAfterSprintCtx())).resolves.toBeUndefined();
    expect(calls).toEqual(['ran']);
  });

  it('getHookCount returns correct count', () => {
    expect(getHookCount('beforeSprint')).toBe(0);
    registerHook('beforeSprint', () => {});
    registerHook('beforeSprint', () => {});
    expect(getHookCount('beforeSprint')).toBe(2);
  });

  it('clearHook removes only specified hook', () => {
    registerHook('beforeSprint', () => {});
    registerHook('afterSprint', () => {});
    clearHook('beforeSprint');
    expect(getHookCount('beforeSprint')).toBe(0);
    expect(getHookCount('afterSprint')).toBe(1);
  });

  it('runHooks resolves immediately when no callbacks registered', async () => {
    await expect(runHooks('beforeSprint', makeBeforeSprintCtx())).resolves.toBeUndefined();
  });

  it('async hooks are awaited before next hook runs', async () => {
    const order: number[] = [];
    registerHook('beforeSprint', async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      order.push(1);
    });
    registerHook('beforeSprint', () => { order.push(2); });

    await runHooks('beforeSprint', makeBeforeSprintCtx());
    expect(order).toEqual([1, 2]);
  });
});

// ─── 5. Error Scenarios ───────────────────────────────────────────────────────

describe('Error scenarios', () => {
  let tmpDir: string;
  let pluginsDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    pluginsDir = path.join(tmpDir, 'plugins');
    fs.mkdirSync(pluginsDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loadPlugin throws PluginError for missing manifest', () => {
    const emptyDir = path.join(tmpDir, 'no-manifest');
    fs.mkdirSync(emptyDir);
    expect(() => loadPlugin(emptyDir)).toThrow(PluginError);
    expect(() => loadPlugin(emptyDir)).toThrow('No manifest.json');
  });

  it('loadPlugin throws PluginError for corrupt JSON', () => {
    const pluginDir = path.join(tmpDir, 'corrupt');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), '{not valid json', 'utf8');
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
    expect(() => loadPlugin(pluginDir)).toThrow('Failed to parse manifest.json');
  });

  it('loadPlugin throws PluginError for JSON null (not object)', () => {
    const pluginDir = path.join(tmpDir, 'null-manifest');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), 'null', 'utf8');
    expect(() => loadPlugin(pluginDir)).toThrow(PluginError);
    expect(() => loadPlugin(pluginDir)).toThrow('Failed to parse manifest.json');
  });

  it('installPlugin throws PluginError for non-existent source path', async () => {
    await expect(
      installPlugin(path.join(tmpDir, 'does-not-exist'), pluginsDir),
    ).rejects.toThrow(PluginError);
    await expect(
      installPlugin(path.join(tmpDir, 'does-not-exist'), pluginsDir),
    ).rejects.toThrow('Source path does not exist');
  });

  it('installPlugin throws PluginError when plugin name already exists', async () => {
    writeManifest(pluginsDir, 'existing-plugin');
    const sourcePluginDir = path.join(tmpDir, 'source', 'existing-plugin');
    fs.mkdirSync(sourcePluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourcePluginDir, 'manifest.json'),
      JSON.stringify({ name: 'existing-plugin', version: '1.0.0', description: 'x', entrypoint: 'y' }),
      'utf8',
    );
    await expect(installPlugin(sourcePluginDir, pluginsDir)).rejects.toThrow(PluginError);
    await expect(installPlugin(sourcePluginDir, pluginsDir)).rejects.toThrow('already installed');
  });

  it('removePlugin throws PluginError for system plugins', () => {
    writeManifest(pluginsDir, 'system-core', { system: true });
    expect(() => removePlugin('system-core', pluginsDir)).toThrow(PluginError);
    expect(() => removePlugin('system-core', pluginsDir)).toThrow('Cannot remove system plugin');
  });

  it('createPlugin throws PluginError if plugin already exists', async () => {
    await createPlugin('duplicate-plugin', pluginsDir);
    await expect(createPlugin('duplicate-plugin', pluginsDir)).rejects.toThrow(PluginError);
    await expect(createPlugin('duplicate-plugin', pluginsDir)).rejects.toThrow('already exists');
  });

  it('removePlugin returns false for non-existent plugin', () => {
    const result = removePlugin('ghost-plugin', pluginsDir);
    expect(result).toBe(false);
  });
});

// ─── 6. CLI Integration ───────────────────────────────────────────────────────

describe('CLI integration: plugin list/info/create output', () => {
  let tmpDir: string;
  let pluginsDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    pluginsDir = path.join(tmpDir, 'plugins');
    fs.mkdirSync(pluginsDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('listPlugins returns correct Plugin shape for CLI display', () => {
    writeManifest(pluginsDir, 'my-plugin', { version: '3.1.4', description: 'List test plugin' });
    const plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);
    const p = plugins[0]!;
    expect(p.manifest.name).toBe('my-plugin');
    expect(p.manifest.version).toBe('3.1.4');
    expect(p.manifest.description).toBe('List test plugin');
    expect(p.dir).toContain('my-plugin');
  });

  it('loadPlugin returns correct Plugin shape for info display', () => {
    const pluginDir = writeManifest(pluginsDir, 'info-plugin', {
      version: '0.5.0',
      description: 'Info test plugin',
      entrypoint: 'SKILL.md',
    });
    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.name).toBe('info-plugin');
    expect(plugin.manifest.version).toBe('0.5.0');
    expect(plugin.manifest.description).toBe('Info test plugin');
    expect(plugin.manifest.entrypoint).toBe('SKILL.md');
    expect(plugin.dir).toBe(pluginDir);
  });

  it('createPlugin returns correct Plugin shape for create output', async () => {
    const plugin = await createPlugin('new-cli-plugin', pluginsDir);
    expect(plugin.manifest.name).toBe('new-cli-plugin');
    expect(plugin.manifest.version).toBe('0.1.0');
    expect(plugin.dir).toBe(path.join(pluginsDir, 'new-cli-plugin'));
    // SKILL.md content includes the name
    const skillContent = fs.readFileSync(path.join(plugin.dir, 'SKILL.md'), 'utf8');
    expect(skillContent).toContain('new-cli-plugin');
    // README.md content includes the name
    const readmeContent = fs.readFileSync(path.join(plugin.dir, 'README.md'), 'utf8');
    expect(readmeContent).toContain('new-cli-plugin');
  });

  it('scanPlugins returns Plugin[] suitable for CLI listing', () => {
    const deckentPluginsDir = path.join(tmpDir, '.deckent', 'plugins');
    fs.mkdirSync(deckentPluginsDir, { recursive: true });
    writeManifest(deckentPluginsDir, 'cli-plugin-a', { version: '1.0.0', description: 'Plugin A' });
    writeManifest(deckentPluginsDir, 'cli-plugin-b', { version: '2.0.0', description: 'Plugin B' });

    const plugins = scanPlugins(tmpDir);
    expect(plugins).toHaveLength(2);
    expect(plugins.every((p) => typeof p.manifest.name === 'string')).toBe(true);
    expect(plugins.every((p) => typeof p.manifest.version === 'string')).toBe(true);
    expect(plugins.every((p) => typeof p.dir === 'string')).toBe(true);
  });
});
