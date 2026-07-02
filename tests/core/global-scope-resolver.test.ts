import { describe, it, expect } from 'vitest';

import {
  resolveGlobalScopePaths,
  normalizeGlobalScopePlatform,
  GlobalScopeResolutionError,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from '../../src/core/global-scope-resolver.js';

// The resolver is pure: platform + env are injected, no fs / process reads.
// Every test below passes a plain-object env — no os mocking, no real fs,
// no process.env mutation (task 361-008 hermeticity requirement).

const POSIX_HOME = '/home/alperen';
const MAC_HOME = '/Users/alperen';
const WIN_HOME = 'C:\\Users\\alperen';

describe('resolveGlobalScopePaths — linux (XDG)', () => {
  it('resolves the four XDG defaults from HOME when no XDG_* vars are set', () => {
    const paths = resolveGlobalScopePaths('linux', { HOME: POSIX_HOME });
    expect(paths.platform).toBe('linux');
    expect(paths.source).toBe('platform-convention');
    expect(paths.home).toBe(POSIX_HOME);
    expect(paths.configDir).toBe('/home/alperen/.config/deckent');
    expect(paths.dataDir).toBe('/home/alperen/.local/share/deckent');
    expect(paths.cacheDir).toBe('/home/alperen/.cache/deckent');
    expect(paths.stateDir).toBe('/home/alperen/.local/state/deckent');
  });

  it('honors each XDG_* base-dir override independently', () => {
    const env: GlobalScopeEnv = {
      HOME: POSIX_HOME,
      XDG_CONFIG_HOME: '/xdg/config',
      XDG_DATA_HOME: '/xdg/data',
      XDG_CACHE_HOME: '/xdg/cache',
      XDG_STATE_HOME: '/xdg/state',
    };
    const paths = resolveGlobalScopePaths('linux', env);
    expect(paths.configDir).toBe('/xdg/config/deckent');
    expect(paths.dataDir).toBe('/xdg/data/deckent');
    expect(paths.cacheDir).toBe('/xdg/cache/deckent');
    expect(paths.stateDir).toBe('/xdg/state/deckent');
  });

  it('treats an empty-string XDG var as unset (falls back to the HOME default)', () => {
    const paths = resolveGlobalScopePaths('linux', { HOME: POSIX_HOME, XDG_CONFIG_HOME: '' });
    expect(paths.configDir).toBe('/home/alperen/.config/deckent');
  });

  it('computes legacyDir as <home>/.deckent (migration probe seam)', () => {
    const paths = resolveGlobalScopePaths('linux', { HOME: POSIX_HOME });
    expect(paths.legacyDir).toBe('/home/alperen/.deckent');
  });

  it('throws a typed HOME_NOT_RESOLVED error when HOME is missing', () => {
    expect(() => resolveGlobalScopePaths('linux', {})).toThrowError(GlobalScopeResolutionError);
    try {
      resolveGlobalScopePaths('linux', {});
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GlobalScopeResolutionError);
      expect((error as GlobalScopeResolutionError).code).toBe('HOME_NOT_RESOLVED');
    }
  });

  it('treats an empty-string HOME as unset (typed error, not a broken path)', () => {
    expect(() => resolveGlobalScopePaths('linux', { HOME: '' })).toThrowError(
      GlobalScopeResolutionError,
    );
  });
});

describe('resolveGlobalScopePaths — wsl (Linux userland, distinct tag)', () => {
  it('resolves identically to linux XDG rules but keeps the wsl platform tag', () => {
    const env: GlobalScopeEnv = { HOME: POSIX_HOME, WSL_DISTRO_NAME: 'Ubuntu' };
    const wsl = resolveGlobalScopePaths('wsl', env);
    const linux = resolveGlobalScopePaths('linux', env);
    expect(wsl.platform).toBe('wsl');
    expect(wsl.configDir).toBe(linux.configDir);
    expect(wsl.dataDir).toBe(linux.dataDir);
    expect(wsl.cacheDir).toBe(linux.cacheDir);
    expect(wsl.stateDir).toBe(linux.stateDir);
    expect(wsl.legacyDir).toBe(linux.legacyDir);
  });

  it('honors XDG overrides on wsl too', () => {
    const paths = resolveGlobalScopePaths('wsl', {
      HOME: POSIX_HOME,
      XDG_STATE_HOME: '/xdg/state',
    });
    expect(paths.stateDir).toBe('/xdg/state/deckent');
  });
});

describe('resolveGlobalScopePaths — darwin (Library conventions)', () => {
  it('resolves config/data/state to Application Support and cache to Caches', () => {
    const paths = resolveGlobalScopePaths('darwin', { HOME: MAC_HOME });
    expect(paths.platform).toBe('darwin');
    expect(paths.source).toBe('platform-convention');
    expect(paths.configDir).toBe('/Users/alperen/Library/Application Support/deckent');
    expect(paths.dataDir).toBe('/Users/alperen/Library/Application Support/deckent');
    expect(paths.stateDir).toBe('/Users/alperen/Library/Application Support/deckent');
    expect(paths.cacheDir).toBe('/Users/alperen/Library/Caches/deckent');
  });

  it('ignores XDG_* vars on darwin (Apple conventions win)', () => {
    const paths = resolveGlobalScopePaths('darwin', {
      HOME: MAC_HOME,
      XDG_CONFIG_HOME: '/xdg/config',
    });
    expect(paths.configDir).toBe('/Users/alperen/Library/Application Support/deckent');
  });

  it('computes legacyDir as <home>/.deckent', () => {
    const paths = resolveGlobalScopePaths('darwin', { HOME: MAC_HOME });
    expect(paths.legacyDir).toBe('/Users/alperen/.deckent');
  });
});

describe('resolveGlobalScopePaths — win32 (AppData conventions)', () => {
  it('resolves config/data to %APPDATA% and cache/state to %LOCALAPPDATA%', () => {
    const paths = resolveGlobalScopePaths('win32', {
      USERPROFILE: WIN_HOME,
      APPDATA: 'C:\\Users\\alperen\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\alperen\\AppData\\Local',
    });
    expect(paths.platform).toBe('win32');
    expect(paths.configDir).toBe('C:\\Users\\alperen\\AppData\\Roaming\\deckent');
    expect(paths.dataDir).toBe('C:\\Users\\alperen\\AppData\\Roaming\\deckent');
    expect(paths.cacheDir).toBe('C:\\Users\\alperen\\AppData\\Local\\deckent');
    expect(paths.stateDir).toBe('C:\\Users\\alperen\\AppData\\Local\\deckent');
  });

  it('derives APPDATA/LOCALAPPDATA from USERPROFILE when the vars are missing', () => {
    const paths = resolveGlobalScopePaths('win32', { USERPROFILE: WIN_HOME });
    expect(paths.configDir).toBe('C:\\Users\\alperen\\AppData\\Roaming\\deckent');
    expect(paths.cacheDir).toBe('C:\\Users\\alperen\\AppData\\Local\\deckent');
  });

  it('falls back to HOMEDRIVE+HOMEPATH when USERPROFILE is missing', () => {
    const paths = resolveGlobalScopePaths('win32', {
      HOMEDRIVE: 'D:',
      HOMEPATH: '\\Users\\alperen',
    });
    expect(paths.home).toBe('D:\\Users\\alperen');
    expect(paths.configDir).toBe('D:\\Users\\alperen\\AppData\\Roaming\\deckent');
  });

  it('joins with backslashes (win32 path backend, regardless of host OS)', () => {
    const paths = resolveGlobalScopePaths('win32', { USERPROFILE: WIN_HOME });
    expect(paths.configDir).toContain('\\');
    expect(paths.configDir).not.toContain('/');
  });

  it('computes legacyDir as <home>\\.deckent', () => {
    const paths = resolveGlobalScopePaths('win32', { USERPROFILE: WIN_HOME });
    expect(paths.legacyDir).toBe('C:\\Users\\alperen\\.deckent');
  });

  it('throws a typed HOME_NOT_RESOLVED error when no home source is available', () => {
    try {
      resolveGlobalScopePaths('win32', { HOMEDRIVE: 'C:' }); // HOMEPATH missing → unusable
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GlobalScopeResolutionError);
      expect((error as GlobalScopeResolutionError).code).toBe('HOME_NOT_RESOLVED');
    }
  });
});

describe('resolveGlobalScopePaths — DECKENT_HOME env override (tier 1)', () => {
  const platforms: GlobalScopePlatform[] = ['darwin', 'linux', 'win32', 'wsl'];

  it.each(platforms)('collapses all role dirs onto DECKENT_HOME on %s', (platform) => {
    const env: GlobalScopeEnv = {
      DECKENT_HOME: '/custom/deckent-home',
      HOME: POSIX_HOME,
      USERPROFILE: WIN_HOME,
    };
    const paths = resolveGlobalScopePaths(platform, env);
    expect(paths.source).toBe('env-override');
    expect(paths.configDir).toBe('/custom/deckent-home');
    expect(paths.dataDir).toBe('/custom/deckent-home');
    expect(paths.cacheDir).toBe('/custom/deckent-home');
    expect(paths.stateDir).toBe('/custom/deckent-home');
  });

  it('beats platform conventions even when XDG/APPDATA vars are also set', () => {
    const paths = resolveGlobalScopePaths('linux', {
      DECKENT_HOME: '/custom/deckent-home',
      HOME: POSIX_HOME,
      XDG_CONFIG_HOME: '/xdg/config',
    });
    expect(paths.configDir).toBe('/custom/deckent-home');
  });

  it('treats an empty-string DECKENT_HOME as unset (platform convention wins)', () => {
    const paths = resolveGlobalScopePaths('linux', { DECKENT_HOME: '', HOME: POSIX_HOME });
    expect(paths.source).toBe('platform-convention');
    expect(paths.configDir).toBe('/home/alperen/.config/deckent');
  });

  it('still computes legacyDir from home under env-override', () => {
    const paths = resolveGlobalScopePaths('linux', {
      DECKENT_HOME: '/custom/deckent-home',
      HOME: POSIX_HOME,
    });
    expect(paths.legacyDir).toBe('/home/alperen/.deckent');
  });

  it('works without any home (home + legacyDir become null, no throw)', () => {
    const paths = resolveGlobalScopePaths('linux', { DECKENT_HOME: '/custom/deckent-home' });
    expect(paths.home).toBeNull();
    expect(paths.legacyDir).toBeNull();
    expect(paths.configDir).toBe('/custom/deckent-home');
  });
});

describe('resolveGlobalScopePaths — unsupported platform (honest fail, Yasa#2)', () => {
  it('throws a typed UNSUPPORTED_PLATFORM error for an unvalidated platform string', () => {
    try {
      // JS callers can bypass the union type — simulate with a cast.
      resolveGlobalScopePaths('freebsd' as GlobalScopePlatform, { HOME: POSIX_HOME });
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GlobalScopeResolutionError);
      expect((error as GlobalScopeResolutionError).code).toBe('UNSUPPORTED_PLATFORM');
    }
  });
});

describe('normalizeGlobalScopePlatform', () => {
  it('maps darwin and win32 straight through', () => {
    expect(normalizeGlobalScopePlatform('darwin', {})).toBe('darwin');
    expect(normalizeGlobalScopePlatform('win32', {})).toBe('win32');
  });

  it('maps plain linux (no WSL markers) to linux', () => {
    expect(normalizeGlobalScopePlatform('linux', { HOME: POSIX_HOME })).toBe('linux');
  });

  it('maps linux with WSL_DISTRO_NAME to wsl', () => {
    expect(normalizeGlobalScopePlatform('linux', { WSL_DISTRO_NAME: 'Ubuntu' })).toBe('wsl');
  });

  it('maps linux with WSL_INTEROP to wsl', () => {
    expect(normalizeGlobalScopePlatform('linux', { WSL_INTEROP: '/run/WSL/1_interop' })).toBe('wsl');
  });

  it('treats empty-string WSL markers as unset (stays linux)', () => {
    expect(normalizeGlobalScopePlatform('linux', { WSL_DISTRO_NAME: '' })).toBe('linux');
  });

  it('throws a typed UNSUPPORTED_PLATFORM error for platforms outside the matrix', () => {
    for (const platform of ['freebsd', 'openbsd', 'sunos', 'aix', 'android']) {
      try {
        normalizeGlobalScopePlatform(platform, {});
        expect.unreachable(`should have thrown for '${platform}'`);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(GlobalScopeResolutionError);
        expect((error as GlobalScopeResolutionError).code).toBe('UNSUPPORTED_PLATFORM');
      }
    }
  });
});

describe('purity — env is a snapshot, resolution is deterministic', () => {
  it('does not mutate the injected env object', () => {
    const env = { HOME: POSIX_HOME, XDG_CONFIG_HOME: '/xdg/config' };
    const before = { ...env };
    resolveGlobalScopePaths('linux', env);
    expect(env).toEqual(before);
  });

  it('returns identical results for identical inputs (no hidden process/fs reads)', () => {
    const env: GlobalScopeEnv = { HOME: POSIX_HOME };
    expect(resolveGlobalScopePaths('linux', env)).toEqual(resolveGlobalScopePaths('linux', env));
  });
});
