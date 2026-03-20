import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node modules before any imports
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  cp: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { installPlugin, PluginError } from '../../src/core/plugin.js';

const validManifest = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'A test plugin',
  entrypoint: 'index.js',
};

// What loadPlugin returns after parsing (includes enabled default)
const parsedManifest = { ...validManifest, enabled: true };

const PLUGINS_DIR = '/project/.deckent/plugins';

function mockLocalPluginSource(sourcePath: string) {
  vi.mocked(fs.existsSync).mockImplementation((p) => {
    const str = String(p);
    // source path exists
    if (str === sourcePath) return true;
    // manifest at source
    if (str === `${sourcePath}/manifest.json`) return true;
    // dest does NOT exist (not duplicate)
    return false;
  });
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
}

describe('installPlugin — local path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('installs a valid local plugin and returns Plugin', async () => {
    const source = '/some/plugin-source';
    mockLocalPluginSource(source);

    const result = await installPlugin(source, PLUGINS_DIR);

    expect(result.manifest).toEqual(parsedManifest);
    expect(result.dir).toBe(`${PLUGINS_DIR}/my-plugin`);
  });

  it('calls fsp.mkdir to ensure pluginsDir exists', async () => {
    const source = '/some/plugin-source';
    mockLocalPluginSource(source);

    await installPlugin(source, PLUGINS_DIR);

    expect(fsp.mkdir).toHaveBeenCalledWith(PLUGINS_DIR, { recursive: true });
  });

  it('calls fsp.cp to copy source directory to destDir', async () => {
    const source = '/some/plugin-source';
    mockLocalPluginSource(source);

    await installPlugin(source, PLUGINS_DIR);

    expect(fsp.cp).toHaveBeenCalledWith(
      expect.stringContaining('plugin-source'),
      `${PLUGINS_DIR}/my-plugin`,
      { recursive: true }
    );
  });

  it('throws PluginError if source path does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin('/nonexistent/path', PLUGINS_DIR)).rejects.toThrow(PluginError);
    await expect(installPlugin('/nonexistent/path', PLUGINS_DIR)).rejects.toThrow(
      'Source path does not exist'
    );
  });

  it('throws PluginError if plugin with same name already installed', async () => {
    const source = '/some/plugin-source';
    vi.mocked(fs.existsSync).mockReturnValue(true); // both source and destDir exist
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);

    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow(PluginError);
    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow('already installed');
  });

  it('throws PluginError if manifest is missing required fields', async () => {
    const source = '/some/plugin-source';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      return str === source || str === `${source}/manifest.json`;
    });
    const bad = { name: 'x', version: '1.0.0' }; // missing description, entrypoint
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(bad) as any);

    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow(PluginError);
  });

  it('throws PluginError if manifest.json is missing', async () => {
    const source = '/some/plugin-source';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      // source exists but manifest does not
      return String(p) === source;
    });

    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow(PluginError);
    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow('No manifest.json');
  });

  it('throws PluginError if manifest JSON is invalid', async () => {
    const source = '/some/plugin-source';
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      return str === source || str === `${source}/manifest.json`;
    });
    vi.mocked(fs.readFileSync).mockReturnValue('NOT_JSON' as any);

    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow(PluginError);
    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow('Failed to parse');
  });

  it('resolves source to absolute path', async () => {
    const source = './relative/path';
    // existsSync for the resolved absolute path must return false to trigger error
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow(PluginError);
    // Verify it tried with an absolute path (not the relative one)
    const calls = vi.mocked(fs.existsSync).mock.calls;
    const firstArg = String(calls[0]![0]);
    expect(path.isAbsolute(firstArg)).toBe(true);
  });
});

describe('installPlugin — git URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsp.rename).mockResolvedValue(undefined);
    vi.mocked(fsp.rm).mockResolvedValue(undefined);
  });

  function mockSuccessfulGitClone() {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as any);
    // tmpDir does NOT exist before clone (existsSync returns false for tmpDir check at cleanup)
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      // manifest.json at tmpDir (after clone succeeds)
      if (str.endsWith('manifest.json')) return true;
      // destDir does NOT exist (no duplicate)
      if (str.endsWith('/my-plugin')) return false;
      // tmpDir itself — for cleanup check, doesn't exist after success
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
  }

  it('clones git URL and returns Plugin', async () => {
    mockSuccessfulGitClone();
    const result = await installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR);
    expect(result.manifest).toEqual(parsedManifest);
    expect(result.dir).toBe(`${PLUGINS_DIR}/my-plugin`);
  });

  it('calls spawnSync with git clone for https:// URL', async () => {
    mockSuccessfulGitClone();
    await installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR);
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone', 'https://github.com/org/my-plugin.git']),
      { encoding: 'utf8' }
    );
  });

  it('treats git@ URLs as git URLs', async () => {
    mockSuccessfulGitClone();
    await installPlugin('git@github.com:org/my-plugin.git', PLUGINS_DIR);
    expect(spawnSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['clone', 'git@github.com:org/my-plugin.git']),
      { encoding: 'utf8' }
    );
  });

  it('throws PluginError if git clone fails', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'repository not found' } as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(
      installPlugin('https://github.com/bad/repo.git', PLUGINS_DIR)
    ).rejects.toThrow(PluginError);
    await expect(
      installPlugin('https://github.com/bad/repo.git', PLUGINS_DIR)
    ).rejects.toThrow('Failed to clone');
  });

  it('cleans up tmpDir if git clone fails', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'error' } as any);
    // tmpDir exists (for cleanup check)
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await expect(
      installPlugin('https://github.com/bad/repo.git', PLUGINS_DIR)
    ).rejects.toThrow(PluginError);

    expect(fsp.rm).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-install-'),
      { recursive: true, force: true }
    );
  });

  it('cleans up tmpDir if manifest validation fails after clone', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      // manifest.json does NOT exist — triggers PluginError in loadPlugin
      if (str.endsWith('manifest.json')) return false;
      // tmpDir itself exists (for cleanup check in catch block)
      if (str.includes('.tmp-install-')) return true;
      return false;
    });

    await expect(
      installPlugin('https://github.com/org/repo.git', PLUGINS_DIR)
    ).rejects.toThrow(PluginError);

    expect(fsp.rm).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-install-'),
      { recursive: true, force: true }
    );
  });

  it('throws PluginError if destination already exists (duplicate)', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      if (str.endsWith('manifest.json')) return true;
      // destDir exists — duplicate!
      if (str.endsWith('/my-plugin')) return true;
      // tmpDir exists for cleanup
      if (str.includes('.tmp-install-')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);

    await expect(
      installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR)
    ).rejects.toThrow(PluginError);
    await expect(
      installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR)
    ).rejects.toThrow('already installed');
  });

  it('calls fsp.rename to move tmpDir to destDir on success', async () => {
    mockSuccessfulGitClone();
    await installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR);
    expect(fsp.rename).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-install-'),
      `${PLUGINS_DIR}/my-plugin`
    );
  });

  it('does not call fsp.cp for git URLs (uses rename instead)', async () => {
    mockSuccessfulGitClone();
    await installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR);
    expect(fsp.cp).not.toHaveBeenCalled();
  });
});

describe('isGitUrl detection (via installPlugin behavior)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats http:// as a git URL', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'err' } as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin('http://github.com/org/repo', PLUGINS_DIR)).rejects.toThrow(
      'Failed to clone'
    );
  });

  it('treats local path starting with / as local install', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin('/absolute/local/path', PLUGINS_DIR)).rejects.toThrow(
      'Source path does not exist'
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

// Helper for path.isAbsolute in test
import * as path from 'node:path';
