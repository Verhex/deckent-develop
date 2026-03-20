import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { removePlugin, PluginError } from '../../src/core/plugin.js';

function makePlugin(
  pluginsDir: string,
  name: string,
  extra: Record<string, unknown> = {}
): void {
  const pluginDir = path.join(pluginsDir, name);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      description: `Plugin ${name}`,
      entrypoint: 'SKILL.md',
      ...extra,
    })
  );
}

describe('removePlugin', () => {
  let tmpDir: string;
  let pluginsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-remove-test-'));
    pluginsDir = path.join(tmpDir, 'plugins');
    fs.mkdirSync(pluginsDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when plugin does not exist', () => {
    const result = removePlugin('nonexistent', pluginsDir);
    expect(result).toBe(false);
  });

  it('returns true when plugin is successfully removed', () => {
    makePlugin(pluginsDir, 'my-plugin');
    const result = removePlugin('my-plugin', pluginsDir);
    expect(result).toBe(true);
  });

  it('removes the plugin directory from disk', () => {
    makePlugin(pluginsDir, 'my-plugin');
    const pluginDir = path.join(pluginsDir, 'my-plugin');
    expect(fs.existsSync(pluginDir)).toBe(true);
    removePlugin('my-plugin', pluginsDir);
    expect(fs.existsSync(pluginDir)).toBe(false);
  });

  it('throws PluginError when attempting to remove a system plugin', () => {
    makePlugin(pluginsDir, 'core-runner', { system: true });
    expect(() => removePlugin('core-runner', pluginsDir)).toThrow(PluginError);
    expect(() => removePlugin('core-runner', pluginsDir)).toThrow(
      'Cannot remove system plugin "core-runner"'
    );
  });

  it('does not remove system plugin directory when error is thrown', () => {
    makePlugin(pluginsDir, 'core-runner', { system: true });
    const pluginDir = path.join(pluginsDir, 'core-runner');
    try {
      removePlugin('core-runner', pluginsDir);
    } catch {
      // expected
    }
    expect(fs.existsSync(pluginDir)).toBe(true);
  });

  it('removes plugin that has no manifest.json (directory only)', () => {
    const pluginDir = path.join(pluginsDir, 'bare-plugin');
    fs.mkdirSync(pluginDir);
    const result = removePlugin('bare-plugin', pluginsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(pluginDir)).toBe(false);
  });

  it('returns false when pluginsDir itself does not exist', () => {
    const result = removePlugin('any-plugin', path.join(tmpDir, 'nonexistent'));
    expect(result).toBe(false);
  });

  it('removes plugin even if it has nested files', () => {
    makePlugin(pluginsDir, 'complex-plugin');
    const pluginDir = path.join(pluginsDir, 'complex-plugin');
    fs.mkdirSync(path.join(pluginDir, 'subdir'));
    fs.writeFileSync(path.join(pluginDir, 'subdir', 'file.txt'), 'content');
    const result = removePlugin('complex-plugin', pluginsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(pluginDir)).toBe(false);
  });

  it('handles malformed manifest.json gracefully (removes plugin)', () => {
    const pluginDir = path.join(pluginsDir, 'broken-manifest');
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), 'NOT JSON {{{');
    const result = removePlugin('broken-manifest', pluginsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(pluginDir)).toBe(false);
  });

  it('does not affect other plugins when removing one', () => {
    makePlugin(pluginsDir, 'plugin-a');
    makePlugin(pluginsDir, 'plugin-b');
    removePlugin('plugin-a', pluginsDir);
    expect(fs.existsSync(path.join(pluginsDir, 'plugin-a'))).toBe(false);
    expect(fs.existsSync(path.join(pluginsDir, 'plugin-b'))).toBe(true);
  });
});
