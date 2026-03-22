import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node modules before any imports
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
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
import * as path from 'node:path';
import {
  installPlugin,
  PluginError,
  detectSourceType,
  isGitUrl,
  isLocalPath,
} from '../../src/core/plugin.js';

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
    if (str === sourcePath) return true;
    if (str === `${sourcePath}/manifest.json`) return true;
    // enablePlugin reads manifest from dest after install
    if (str === `${PLUGINS_DIR}/my-plugin/manifest.json`) return true;
    return false;
  });
  vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
}

// ─── detectSourceType / isGitUrl / isLocalPath ──────────────────────────────

describe('detectSourceType', () => {
  it('returns "npm" for plain package name', () => {
    expect(detectSourceType('my-plugin')).toBe('npm');
  });

  it('returns "npm" for scoped package name', () => {
    expect(detectSourceType('@scope/my-plugin')).toBe('npm');
  });

  it('returns "git" for https:// URL', () => {
    expect(detectSourceType('https://github.com/org/repo.git')).toBe('git');
  });

  it('returns "git" for http:// URL', () => {
    expect(detectSourceType('http://github.com/org/repo')).toBe('git');
  });

  it('returns "git" for git@ URL', () => {
    expect(detectSourceType('git@github.com:org/repo.git')).toBe('git');
  });

  it('returns "git" for URL ending with .git', () => {
    expect(detectSourceType('something.git')).toBe('git');
  });

  it('returns "local" for relative path starting with ./', () => {
    expect(detectSourceType('./my-plugin')).toBe('local');
  });

  it('returns "local" for relative path starting with ../', () => {
    expect(detectSourceType('../my-plugin')).toBe('local');
  });

  it('returns "local" for absolute path starting with /', () => {
    expect(detectSourceType('/home/user/my-plugin')).toBe('local');
  });
});

describe('isGitUrl', () => {
  it('returns true for https URL', () => {
    expect(isGitUrl('https://github.com/org/repo.git')).toBe(true);
  });

  it('returns false for plain name', () => {
    expect(isGitUrl('my-plugin')).toBe(false);
  });
});

describe('isLocalPath', () => {
  it('returns true for ./ path', () => {
    expect(isLocalPath('./foo')).toBe(true);
  });

  it('returns true for / path', () => {
    expect(isLocalPath('/foo')).toBe(true);
  });

  it('returns false for plain name', () => {
    expect(isLocalPath('my-plugin')).toBe(false);
  });
});

// ─── installPlugin — local path ────────────────────────────────────────────

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

  it('auto-enables the plugin after install', async () => {
    const source = '/some/plugin-source';
    mockLocalPluginSource(source);

    await installPlugin(source, PLUGINS_DIR);

    // enablePlugin writes manifest with enabled=true
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      `${PLUGINS_DIR}/my-plugin/manifest.json`,
      expect.stringContaining('"enabled": true'),
      'utf8'
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
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin(source, PLUGINS_DIR)).rejects.toThrow(PluginError);
    const calls = vi.mocked(fs.existsSync).mock.calls;
    const firstArg = String(calls[0]![0]);
    expect(path.isAbsolute(firstArg)).toBe(true);
  });
});

// ─── installPlugin — git URL ───────────────────────────────────────────────

describe('installPlugin — git URL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsp.rename).mockResolvedValue(undefined);
    vi.mocked(fsp.rm).mockResolvedValue(undefined);
  });

  function mockSuccessfulGitClone() {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      if (str.endsWith('manifest.json')) return true;
      if (str.endsWith('/my-plugin')) return false;
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
      if (str.endsWith('manifest.json')) return false;
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
      if (str.endsWith('/my-plugin')) return true;
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

  it('does not call npm for git URLs', async () => {
    mockSuccessfulGitClone();
    await installPlugin('https://github.com/org/my-plugin.git', PLUGINS_DIR);
    // spawnSync should only be called for git, not npm
    const calls = vi.mocked(spawnSync).mock.calls;
    expect(calls.every(c => c[0] === 'git')).toBe(true);
  });
});

// ─── installPlugin — npm registry ──────────────────────────────────────────

describe('installPlugin — npm registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsp.cp).mockResolvedValue(undefined);
    vi.mocked(fsp.rm).mockResolvedValue(undefined);
  });

  function mockSuccessfulNpmInstall(packageName: string) {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      // node_modules/<package>/manifest.json exists
      if (str.includes('node_modules') && str.endsWith('manifest.json')) return true;
      // node_modules/<package> directory exists
      if (str.includes(`node_modules/${packageName}`)) return true;
      // dest does NOT exist (not duplicate)
      if (str.endsWith('/my-plugin')) return false;
      // tmp dir for cleanup — does not exist after success
      if (str.includes('.tmp-npm-')) return true;
      // enablePlugin manifest read
      if (str === `${PLUGINS_DIR}/my-plugin/manifest.json`) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);
  }

  it('installs npm package and returns Plugin', async () => {
    mockSuccessfulNpmInstall('my-plugin');
    const result = await installPlugin('my-plugin', PLUGINS_DIR);
    expect(result.manifest).toEqual(parsedManifest);
    expect(result.dir).toBe(`${PLUGINS_DIR}/my-plugin`);
  });

  it('calls spawnSync with npm install', async () => {
    mockSuccessfulNpmInstall('my-plugin');
    await installPlugin('my-plugin', PLUGINS_DIR);
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['install', '--prefix', expect.stringContaining('.tmp-npm-'), 'my-plugin'],
      { encoding: 'utf8', timeout: 60_000 }
    );
  });

  it('handles scoped npm packages', async () => {
    const scopedManifest = { ...validManifest, name: 'scoped-plugin' };
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      if (str.includes('node_modules') && str.endsWith('manifest.json')) return true;
      if (str.includes('node_modules/@scope/my-plugin')) return true;
      if (str.endsWith('/scoped-plugin')) return false;
      if (str.includes('.tmp-npm-')) return true;
      if (str === `${PLUGINS_DIR}/scoped-plugin/manifest.json`) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(scopedManifest) as any);

    const result = await installPlugin('@scope/my-plugin', PLUGINS_DIR);
    expect(result.manifest.name).toBe('scoped-plugin');
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['@scope/my-plugin']),
      expect.any(Object)
    );
  });

  it('throws PluginError if npm install fails', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'npm ERR! 404', stdout: '' } as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin('nonexistent-pkg', PLUGINS_DIR)).rejects.toThrow(PluginError);
    await expect(installPlugin('nonexistent-pkg', PLUGINS_DIR)).rejects.toThrow(
      'Failed to install npm package'
    );
  });

  it('throws PluginError if package not found in node_modules after install', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      // node_modules dir does NOT have the package
      if (str.includes('node_modules')) return false;
      if (str.includes('.tmp-npm-')) return true;
      return false;
    });

    await expect(installPlugin('missing-pkg', PLUGINS_DIR)).rejects.toThrow(PluginError);
    await expect(installPlugin('missing-pkg', PLUGINS_DIR)).rejects.toThrow(
      'could not be found in node_modules'
    );
  });

  it('cleans up tmp dir after successful npm install', async () => {
    mockSuccessfulNpmInstall('my-plugin');
    await installPlugin('my-plugin', PLUGINS_DIR);

    // rm should be called for tmp dir cleanup in finally block
    expect(fsp.rm).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-npm-'),
      { recursive: true, force: true }
    );
  });

  it('cleans up tmp dir on npm install failure', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'err', stdout: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      if (str.includes('.tmp-npm-')) return true;
      return false;
    });

    await expect(installPlugin('bad-pkg', PLUGINS_DIR)).rejects.toThrow(PluginError);

    expect(fsp.rm).toHaveBeenCalledWith(
      expect.stringContaining('.tmp-npm-'),
      { recursive: true, force: true }
    );
  });

  it('throws if npm-installed plugin already exists', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stderr: '', stdout: '' } as any);
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const str = String(p);
      if (str.includes('node_modules') && str.endsWith('manifest.json')) return true;
      if (str.includes('node_modules/dupe-plugin')) return true;
      // dest already exists!
      if (str.endsWith('/my-plugin')) return true;
      if (str.includes('.tmp-npm-')) return true;
      return false;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest) as any);

    await expect(installPlugin('dupe-plugin', PLUGINS_DIR)).rejects.toThrow('already installed');
  });

  it('copies from node_modules to plugins dir using fsp.cp', async () => {
    mockSuccessfulNpmInstall('my-plugin');
    await installPlugin('my-plugin', PLUGINS_DIR);

    expect(fsp.cp).toHaveBeenCalledWith(
      expect.stringContaining('node_modules/my-plugin'),
      `${PLUGINS_DIR}/my-plugin`,
      { recursive: true }
    );
  });

  it('creates tmp dir with fsp.mkdir', async () => {
    mockSuccessfulNpmInstall('my-plugin');
    await installPlugin('my-plugin', PLUGINS_DIR);

    // Should be called at least twice: once for pluginsDir, once for tmpDir
    const mkdirCalls = vi.mocked(fsp.mkdir).mock.calls;
    expect(mkdirCalls.some(c => String(c[0]).includes('.tmp-npm-'))).toBe(true);
  });

  it('auto-enables the npm-installed plugin', async () => {
    mockSuccessfulNpmInstall('my-plugin');
    await installPlugin('my-plugin', PLUGINS_DIR);

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      `${PLUGINS_DIR}/my-plugin/manifest.json`,
      expect.stringContaining('"enabled": true'),
      'utf8'
    );
  });
});

// ─── isGitUrl detection (via installPlugin behavior) ───────────────────────

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

  it('treats plain name as npm install', async () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stderr: 'npm ERR!' } as any);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await expect(installPlugin('some-package', PLUGINS_DIR)).rejects.toThrow(
      'Failed to install npm package'
    );
  });
});
