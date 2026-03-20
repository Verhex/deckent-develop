import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  enablePlugin,
  disablePlugin,
  listPlugins,
  scanPlugins,
  loadPlugin,
} from '../../src/core/plugin.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-toggle-test-'));
}

function writeManifest(
  pluginsDir: string,
  pluginName: string,
  extra: Record<string, unknown> = {}
): string {
  const pluginDir = path.join(pluginsDir, pluginName);
  fs.mkdirSync(pluginDir, { recursive: true });
  const manifest = {
    name: pluginName,
    version: '1.0.0',
    description: `${pluginName} plugin`,
    entrypoint: 'index.js',
    ...extra,
  };
  fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return pluginDir;
}

function readManifest(pluginsDir: string, pluginName: string): Record<string, unknown> {
  const manifestPath = path.join(pluginsDir, pluginName, 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
}

// ─── enablePlugin ─────────────────────────────────────────────────────────────

describe('enablePlugin', () => {
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

  it('returns true when plugin exists', () => {
    writeManifest(pluginsDir, 'my-plugin');
    const result = enablePlugin('my-plugin', pluginsDir);
    expect(result).toBe(true);
  });

  it('sets enabled=true in manifest.json', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: false });
    enablePlugin('my-plugin', pluginsDir);
    const manifest = readManifest(pluginsDir, 'my-plugin');
    expect(manifest['enabled']).toBe(true);
  });

  it('sets enabled=true even when previously not set', () => {
    writeManifest(pluginsDir, 'my-plugin');
    enablePlugin('my-plugin', pluginsDir);
    const manifest = readManifest(pluginsDir, 'my-plugin');
    expect(manifest['enabled']).toBe(true);
  });

  it('returns false when plugin does not exist', () => {
    const result = enablePlugin('nonexistent', pluginsDir);
    expect(result).toBe(false);
  });

  it('preserves other manifest fields', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: false });
    enablePlugin('my-plugin', pluginsDir);
    const manifest = readManifest(pluginsDir, 'my-plugin');
    expect(manifest['name']).toBe('my-plugin');
    expect(manifest['version']).toBe('1.0.0');
    expect(manifest['description']).toBe('my-plugin plugin');
    expect(manifest['entrypoint']).toBe('index.js');
  });
});

// ─── disablePlugin ────────────────────────────────────────────────────────────

describe('disablePlugin', () => {
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

  it('returns true when plugin exists', () => {
    writeManifest(pluginsDir, 'my-plugin');
    const result = disablePlugin('my-plugin', pluginsDir);
    expect(result).toBe(true);
  });

  it('sets enabled=false in manifest.json', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: true });
    disablePlugin('my-plugin', pluginsDir);
    const manifest = readManifest(pluginsDir, 'my-plugin');
    expect(manifest['enabled']).toBe(false);
  });

  it('sets enabled=false even when previously not set', () => {
    writeManifest(pluginsDir, 'my-plugin');
    disablePlugin('my-plugin', pluginsDir);
    const manifest = readManifest(pluginsDir, 'my-plugin');
    expect(manifest['enabled']).toBe(false);
  });

  it('returns false when plugin does not exist', () => {
    const result = disablePlugin('nonexistent', pluginsDir);
    expect(result).toBe(false);
  });

  it('preserves other manifest fields', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: true });
    disablePlugin('my-plugin', pluginsDir);
    const manifest = readManifest(pluginsDir, 'my-plugin');
    expect(manifest['name']).toBe('my-plugin');
    expect(manifest['version']).toBe('1.0.0');
    expect(manifest['description']).toBe('my-plugin plugin');
    expect(manifest['entrypoint']).toBe('index.js');
  });
});

// ─── Toggle cycle ─────────────────────────────────────────────────────────────

describe('enable/disable toggle cycle', () => {
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

  it('can disable then re-enable a plugin', () => {
    writeManifest(pluginsDir, 'my-plugin');

    disablePlugin('my-plugin', pluginsDir);
    expect(readManifest(pluginsDir, 'my-plugin')['enabled']).toBe(false);

    enablePlugin('my-plugin', pluginsDir);
    expect(readManifest(pluginsDir, 'my-plugin')['enabled']).toBe(true);
  });

  it('can enable then disable a plugin', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: false });

    enablePlugin('my-plugin', pluginsDir);
    expect(readManifest(pluginsDir, 'my-plugin')['enabled']).toBe(true);

    disablePlugin('my-plugin', pluginsDir);
    expect(readManifest(pluginsDir, 'my-plugin')['enabled']).toBe(false);
  });
});

// ─── listPlugins — filtering ───────────────────────────────────────────────────

describe('listPlugins with enabled/disabled filtering', () => {
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

  it('returns only enabled plugins', () => {
    writeManifest(pluginsDir, 'enabled-plugin', { enabled: true });
    writeManifest(pluginsDir, 'disabled-plugin', { enabled: false });

    const plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe('enabled-plugin');
  });

  it('returns plugin without enabled field (defaults to enabled)', () => {
    writeManifest(pluginsDir, 'no-field-plugin');

    const plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe('no-field-plugin');
  });

  it('returns empty array when all plugins are disabled', () => {
    writeManifest(pluginsDir, 'plugin-a', { enabled: false });
    writeManifest(pluginsDir, 'plugin-b', { enabled: false });

    const plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(0);
  });

  it('returns multiple enabled plugins', () => {
    writeManifest(pluginsDir, 'plugin-a', { enabled: true });
    writeManifest(pluginsDir, 'plugin-b', { enabled: true });
    writeManifest(pluginsDir, 'plugin-c', { enabled: false });

    const plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(2);
    const names = plugins.map((p) => p.manifest.name).sort();
    expect(names).toEqual(['plugin-a', 'plugin-b']);
  });

  it('reflects enabled state after disablePlugin call', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: true });

    let plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);

    disablePlugin('my-plugin', pluginsDir);

    plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(0);
  });

  it('reflects enabled state after enablePlugin call', () => {
    writeManifest(pluginsDir, 'my-plugin', { enabled: false });

    let plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(0);

    enablePlugin('my-plugin', pluginsDir);

    plugins = listPlugins(pluginsDir);
    expect(plugins).toHaveLength(1);
  });
});

// ─── scanPlugins — filtering ───────────────────────────────────────────────────

describe('scanPlugins with enabled/disabled filtering', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips disabled plugins', () => {
    const pluginsDir = path.join(tmpDir, '.deckent', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    writeManifest(pluginsDir, 'active', { enabled: true });
    writeManifest(pluginsDir, 'inactive', { enabled: false });

    const plugins = scanPlugins(tmpDir);
    expect(plugins).toHaveLength(1);
    expect(plugins[0].manifest.name).toBe('active');
  });

  it('returns empty array when all plugins disabled', () => {
    const pluginsDir = path.join(tmpDir, '.deckent', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    writeManifest(pluginsDir, 'p1', { enabled: false });
    writeManifest(pluginsDir, 'p2', { enabled: false });

    const plugins = scanPlugins(tmpDir);
    expect(plugins).toHaveLength(0);
  });
});

// ─── loadPlugin — enabled field handling ──────────────────────────────────────

describe('loadPlugin enabled field', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults enabled to true when field is absent', () => {
    const pluginDir = path.join(tmpDir, 'myplugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'myplugin', version: '1.0.0', description: 'test', entrypoint: 'index.js' }),
      'utf8'
    );
    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.enabled).toBe(true);
  });

  it('preserves enabled=false when set', () => {
    const pluginDir = path.join(tmpDir, 'myplugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'myplugin', version: '1.0.0', description: 'test', entrypoint: 'index.js', enabled: false }),
      'utf8'
    );
    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.enabled).toBe(false);
  });

  it('preserves enabled=true when set', () => {
    const pluginDir = path.join(tmpDir, 'myplugin');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(
      path.join(pluginDir, 'manifest.json'),
      JSON.stringify({ name: 'myplugin', version: '1.0.0', description: 'test', entrypoint: 'index.js', enabled: true }),
      'utf8'
    );
    const plugin = loadPlugin(pluginDir);
    expect(plugin.manifest.enabled).toBe(true);
  });
});
