import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { loadPlugin, listPlugins, scanPlugins, PluginError } from '../../src/core/plugin.js';

const validManifest = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  entrypoint: 'index.js',
};

describe('loadPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws PluginError if manifest.json does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => loadPlugin('/some/dir')).toThrow(PluginError);
    expect(() => loadPlugin('/some/dir')).toThrow('No manifest.json found');
  });

  it('throws PluginError if manifest.json is invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not-json' as any);
    expect(() => loadPlugin('/some/dir')).toThrow(PluginError);
    expect(() => loadPlugin('/some/dir')).toThrow('Failed to parse manifest.json');
  });

  it('throws PluginError if manifest is not an object', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('"string"' as any);
    expect(() => loadPlugin('/some/dir')).toThrow(PluginError);
  });

  it('throws PluginError if required field is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const incomplete = { name: 'x', version: '1.0.0', description: 'y' };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(incomplete) as any);
    expect(() => loadPlugin('/some/dir')).toThrow(PluginError);
    expect(() => loadPlugin('/some/dir')).toThrow('"entrypoint"');
  });

  it('throws PluginError if field is empty string', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const bad = { ...validManifest, name: '   ' };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(bad) as any);
    expect(() => loadPlugin('/some/dir')).toThrow(PluginError);
    expect(() => loadPlugin('/some/dir')).toThrow('"name"');
  });

  it('returns Plugin with manifest and dir on success', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
    const plugin = loadPlugin('/plugins/my-plugin');
    expect(plugin.manifest).toMatchObject(validManifest);
    expect(plugin.dir).toBe('/plugins/my-plugin');
  });

  it('reads manifest.json from plugin directory', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
    loadPlugin('/root/plugins/foo');
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('manifest.json'),
      'utf-8'
    );
  });
});

describe('listPlugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array if pluginsDir does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(listPlugins('/no/such/dir')).toEqual([]);
  });

  it('returns empty array if readdirSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => { throw new Error('permission denied'); });
    expect(listPlugins('/bad/dir')).toEqual([]);
  });

  it('skips non-directory entries', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const file = { name: 'README.md', isDirectory: () => false } as any;
    vi.mocked(fs.readdirSync).mockReturnValue([file]);
    expect(listPlugins('/plugins')).toEqual([]);
  });

  it('skips directories with invalid manifests silently', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      // pluginsDir exists, but manifest inside subdirs does not
      return String(p) === '/plugins';
    });
    const dir = { name: 'bad-plugin', isDirectory: () => true } as any;
    vi.mocked(fs.readdirSync).mockReturnValue([dir]);
    expect(listPlugins('/plugins')).toEqual([]);
  });

  it('returns plugins for valid subdirectories', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const dir = { name: 'my-plugin', isDirectory: () => true } as any;
    vi.mocked(fs.readdirSync).mockReturnValue([dir]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
    const result = listPlugins('/plugins');
    expect(result).toHaveLength(1);
    expect(result[0]!.manifest.name).toBe('my-plugin');
  });

  it('returns multiple plugins', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const dirs = [
      { name: 'plugin-a', isDirectory: () => true },
      { name: 'plugin-b', isDirectory: () => true },
    ] as any;
    vi.mocked(fs.readdirSync).mockReturnValue(dirs);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
    const result = listPlugins('/plugins');
    expect(result).toHaveLength(2);
  });
});

describe('scanPlugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scans .deckent/plugins/ in project root', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = scanPlugins('/my/project');
    expect(result).toEqual([]);
    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining('.deckent')
    );
    expect(fs.existsSync).toHaveBeenCalledWith(
      expect.stringContaining('plugins')
    );
  });

  it('returns plugins found in .deckent/plugins/', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    const dir = { name: 'my-plugin', isDirectory: () => true } as any;
    vi.mocked(fs.readdirSync).mockReturnValue([dir]);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
    const result = scanPlugins('/root');
    expect(result).toHaveLength(1);
    expect(result[0]!.dir).toContain('my-plugin');
  });
});
