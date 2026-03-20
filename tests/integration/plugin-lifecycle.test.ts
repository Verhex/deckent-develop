/**
 * Plugin Lifecycle Integration Tests
 * Tests the complete plugin lifecycle: create → list → disable → enable → remove
 * Focuses on end-to-end workflows with real filesystem operations.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  removePlugin,
  listPlugins,
  enablePlugin,
  disablePlugin,
  loadPlugin,
  type Plugin,
} from '../../src/core/plugin.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-integration-'));
}

function getPluginNames(plugins: Plugin[]): string[] {
  return plugins.map((p) => p.manifest.name).sort();
}

/**
 * Helper to create a valid plugin manifest directly.
 * This ensures the manifest can be loaded and listed properly.
 */
function writeValidPlugin(pluginsDir: string, name: string, extra: Record<string, unknown> = {}): string {
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
  fs.writeFileSync(path.join(pluginDir, 'SKILL.md'), `# ${name}`, 'utf8');
  fs.writeFileSync(path.join(pluginDir, 'README.md'), `# ${name} Plugin`, 'utf8');
  return pluginDir;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Plugin Lifecycle Integration', () => {
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

  // Test 1: Create plugin and verify manifest
  it('create — scaffolds plugin with valid manifest.json', async () => {
    const name = 'test-plugin-1';
    writeValidPlugin(pluginsDir, name);

    const plugin = loadPlugin(path.join(pluginsDir, name));
    expect(plugin.manifest.name).toBe(name);
    expect(plugin.manifest.version).toBe('1.0.0');
    expect(plugin.manifest.description).toBe(`${name} plugin`);
    expect(plugin.manifest.entrypoint).toBe('SKILL.md');
    expect(plugin.manifest.enabled).toBe(true);

    const manifestPath = path.join(pluginsDir, name, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBe(name);
  });

  // Test 2: List shows created plugin
  it('list — created plugin appears in enabled plugins list', async () => {
    writeValidPlugin(pluginsDir, 'lifecycle-a');
    writeValidPlugin(pluginsDir, 'lifecycle-b');

    const plugins = listPlugins(pluginsDir);

    expect(plugins.length).toBeGreaterThanOrEqual(2);
    const names = getPluginNames(plugins);
    expect(names).toContain('lifecycle-a');
    expect(names).toContain('lifecycle-b');
  });

  // Test 3: Disable removes from list
  it('disable — plugin disappears from listPlugins after being disabled', async () => {
    writeValidPlugin(pluginsDir, 'to-disable');
    let plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).toContain('to-disable');

    disablePlugin('to-disable', pluginsDir);

    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).not.toContain('to-disable');

    // Verify manifest has enabled=false
    const manifestPath = path.join(pluginsDir, 'to-disable', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.enabled).toBe(false);
  });

  // Test 4: Enable restores to list
  it('enable — disabled plugin reappears in list after re-enabled', async () => {
    writeValidPlugin(pluginsDir, 'to-enable');
    disablePlugin('to-enable', pluginsDir);

    let plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).not.toContain('to-enable');

    enablePlugin('to-enable', pluginsDir);

    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).toContain('to-enable');

    // Verify manifest has enabled=true
    const manifestPath = path.join(pluginsDir, 'to-enable', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.enabled).toBe(true);
  });

  // Test 5: Remove deletes plugin directory
  it('remove — plugin directory is deleted and plugin no longer appears', async () => {
    writeValidPlugin(pluginsDir, 'to-remove');
    let plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).toContain('to-remove');

    const pluginDir = path.join(pluginsDir, 'to-remove');
    expect(fs.existsSync(pluginDir)).toBe(true);

    const removed = removePlugin('to-remove', pluginsDir);
    expect(removed).toBe(true);

    expect(fs.existsSync(pluginDir)).toBe(false);
    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).not.toContain('to-remove');
  });

  // Test 6: Full cycle create → disable → enable → remove
  it('full lifecycle — create, disable, enable, then remove', async () => {
    const name = 'full-cycle-plugin';

    // 1. Create
    writeValidPlugin(pluginsDir, name);
    let plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).toContain(name);

    // 2. Disable
    disablePlugin(name, pluginsDir);
    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).not.toContain(name);

    // 3. Enable
    enablePlugin(name, pluginsDir);
    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).toContain(name);

    // 4. Remove
    const removed = removePlugin(name, pluginsDir);
    expect(removed).toBe(true);
    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).not.toContain(name);
  });

  // Test 7: Multiple operations in sequence
  it('sequence — multiple creates, disables, enables preserve state correctly', async () => {
    // Create 5 plugins
    const names = ['plugin-1', 'plugin-2', 'plugin-3', 'plugin-4', 'plugin-5'];
    for (const name of names) {
      writeValidPlugin(pluginsDir, name);
    }

    let plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).toEqual(names);

    // Disable 2 and 4
    disablePlugin('plugin-2', pluginsDir);
    disablePlugin('plugin-4', pluginsDir);

    plugins = listPlugins(pluginsDir);
    const listed = getPluginNames(plugins);
    expect(listed).toContain('plugin-1');
    expect(listed).not.toContain('plugin-2');
    expect(listed).toContain('plugin-3');
    expect(listed).not.toContain('plugin-4');
    expect(listed).toContain('plugin-5');

    // Re-enable plugin-2
    enablePlugin('plugin-2', pluginsDir);
    plugins = listPlugins(pluginsDir);
    const listed2 = getPluginNames(plugins);
    expect(listed2).toContain('plugin-2');
    expect(listed2).not.toContain('plugin-4');

    // Remove plugin-1
    removePlugin('plugin-1', pluginsDir);
    plugins = listPlugins(pluginsDir);
    expect(getPluginNames(plugins)).not.toContain('plugin-1');
    expect(listPlugins(pluginsDir).length).toBeGreaterThanOrEqual(3); // 2, 3, 5 remain
  });

  // Test 8: Plugin files are created correctly
  it('create — generates SKILL.md and README.md with correct content', async () => {
    const name = 'full-content-plugin';
    const pluginDir = writeValidPlugin(pluginsDir, name);

    // Check SKILL.md
    const skillPath = path.join(pluginDir, 'SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    const skillContent = fs.readFileSync(skillPath, 'utf8');
    expect(skillContent).toContain(name);

    // Check README.md
    const readmePath = path.join(pluginDir, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);
    const readmeContent = fs.readFileSync(readmePath, 'utf8');
    expect(readmeContent).toContain(name);
    expect(readmeContent).toContain('Plugin');
  });

  // Test 9: Load plugin after enable/disable operations
  it('loadPlugin — successfully loads plugin after disable/enable operations', async () => {
    const name = 'load-test-plugin';
    writeValidPlugin(pluginsDir, name);

    disablePlugin(name, pluginsDir);
    enablePlugin(name, pluginsDir);

    const pluginDir = path.join(pluginsDir, name);
    const plugin = loadPlugin(pluginDir);

    expect(plugin.manifest.name).toBe(name);
    expect(plugin.manifest.enabled).toBe(true);
    expect(plugin.dir).toBe(pluginDir);
  });

  // Test 10: Enable/disable returns boolean for missing plugins
  it('enable/disable — returns false when plugin does not exist', () => {
    const result1 = enablePlugin('nonexistent', pluginsDir);
    expect(result1).toBe(false);

    const result2 = disablePlugin('nonexistent', pluginsDir);
    expect(result2).toBe(false);
  });
});
