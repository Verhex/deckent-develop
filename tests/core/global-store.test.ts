import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

import { resolveGlobalScopePaths } from '../../src/core/global-scope-resolver.js';
import {
  GlobalStore,
  globalStoreDir,
  globalStoreFilePath,
  AUTH_STATUS_CACHE_DEFINITION,
  MODEL_CATALOG_CACHE_DEFINITION,
  LIMITS_CACHE_DEFINITION,
  type GlobalStoreDefinition,
} from '../../src/core/global-store.js';

// Hermetic throughout (worker-default.md CUSTOM Test Hermeticity + this
// task's explicit nogo): every real fs round-trip uses a fresh mkdtempSync
// tmp dir injected as HOME via resolveGlobalScopePaths's plain-object env —
// never a real ~/.deckent, never process.env mutation.

const POSIX_HOME = '/home/alperen';
const MAC_HOME = '/Users/alperen';
const WIN_HOME = 'C:\\Users\\alperen';

// ─── Path computation — 4-platform matrix, resolver-reuse, zero fs I/O ──────

describe('globalStoreDir / globalStoreFilePath — 4-platform path computation (no fs)', () => {
  it('linux: cache-role store resolves under XDG_CACHE_HOME default', () => {
    const paths = resolveGlobalScopePaths('linux', { HOME: POSIX_HOME });
    expect(globalStoreDir(paths, 'cache')).toBe('/home/alperen/.cache/deckent');
    expect(globalStoreFilePath(paths, 'cache', 'model-catalog-cache.json')).toBe(
      '/home/alperen/.cache/deckent/model-catalog-cache.json',
    );
  });

  it('linux: state-role store resolves under XDG_STATE_HOME default', () => {
    const paths = resolveGlobalScopePaths('linux', { HOME: POSIX_HOME });
    expect(globalStoreFilePath(paths, 'state', 'limits-cache.json')).toBe(
      '/home/alperen/.local/state/deckent/limits-cache.json',
    );
  });

  it('wsl: resolves identically to linux (same XDG rules)', () => {
    const env = { HOME: POSIX_HOME, WSL_DISTRO_NAME: 'Ubuntu' };
    const wsl = resolveGlobalScopePaths('wsl', env);
    const linux = resolveGlobalScopePaths('linux', env);
    expect(globalStoreFilePath(wsl, 'cache', 'auth-status-cache.json')).toBe(
      globalStoreFilePath(linux, 'cache', 'auth-status-cache.json'),
    );
  });

  it('darwin: cache-role store resolves under Library/Caches, not Application Support', () => {
    const paths = resolveGlobalScopePaths('darwin', { HOME: MAC_HOME });
    expect(globalStoreFilePath(paths, 'cache', 'auth-status-cache.json')).toBe(
      '/Users/alperen/Library/Caches/deckent/auth-status-cache.json',
    );
  });

  it('darwin: state-role store resolves under Application Support (state coincides with data/config)', () => {
    const paths = resolveGlobalScopePaths('darwin', { HOME: MAC_HOME });
    expect(globalStoreFilePath(paths, 'state', 'limits-cache.json')).toBe(
      '/Users/alperen/Library/Application Support/deckent/limits-cache.json',
    );
  });

  it('win32: cache-role store resolves under %LOCALAPPDATA% with backslash joins', () => {
    const paths = resolveGlobalScopePaths('win32', {
      USERPROFILE: WIN_HOME,
      APPDATA: 'C:\\Users\\alperen\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\alperen\\AppData\\Local',
    });
    expect(globalStoreFilePath(paths, 'cache', 'model-catalog-cache.json')).toBe(
      'C:\\Users\\alperen\\AppData\\Local\\deckent\\model-catalog-cache.json',
    );
  });

  it('win32 path join uses the win32 backend even when resolved on a non-win32 host', () => {
    // This test itself always runs on the host CI platform (Linux), yet the
    // computed path must use backslashes — proof the join is driven by the
    // injected paths.platform, never process.platform (resolver's own
    // "deterministic cross-host" guarantee, reused here).
    const paths = resolveGlobalScopePaths('win32', { USERPROFILE: WIN_HOME });
    const filePath = globalStoreFilePath(paths, 'state', 'limits-cache.json');
    expect(filePath).toContain('\\');
    expect(filePath).not.toContain('/');
  });
});

// ─── Round-trip — real fs, hermetic tmpdir, 3 concrete stores ───────────────

describe('GlobalStore — 3-store round-trip (tmpdir + env-inject, no real ~/.deckent)', () => {
  let tmpHome: string;

  afterEach(() => {
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  function freshLinuxPaths() {
    tmpHome = mkdtempSync(join(tmpdir(), 'deckent-global-store-test-'));
    return resolveGlobalScopePaths('linux', { HOME: tmpHome });
  }

  it('auth-status-cache: missing file -> defaultData, then save -> load round-trips', () => {
    const paths = freshLinuxPaths();
    const store = new GlobalStore(paths, AUTH_STATUS_CACHE_DEFINITION);

    const missing = store.load();
    expect(missing.source).toBe('default-missing');
    expect(missing.data).toEqual({ entries: {} });

    const written = {
      entries: {
        claude: {
          providerId: 'claude',
          authenticated: true,
          accountLabel: 'alperen@anthropic',
          lastVerifiedAt: '2026-07-02T12:00:00.000Z',
        },
      },
    };
    store.save(written);

    const loaded = store.load();
    expect(loaded.source).toBe('file');
    expect(loaded.data).toEqual(written);
  });

  it('model-catalog-cache: save -> load round-trips through the cache role-dir', () => {
    const paths = freshLinuxPaths();
    const store = new GlobalStore(paths, MODEL_CATALOG_CACHE_DEFINITION);

    const written = {
      fetchedAt: '2026-07-02T12:00:00.000Z',
      source: 'remote' as const,
      models: [{ id: 'claude-sonnet-5', provider: 'claude', tier: 'premium' }],
    };
    store.save(written);

    const loaded = store.load();
    expect(loaded.source).toBe('file');
    expect(loaded.data).toEqual(written);
    expect(store.filePath).toBe(join(paths.cacheDir, 'model-catalog-cache.json'));
  });

  it('limits-cache: save -> load round-trips through the state role-dir (not cache)', () => {
    const paths = freshLinuxPaths();
    const store = new GlobalStore(paths, LIMITS_CACHE_DEFINITION);

    const written = {
      accounts: {
        'acct-1': {
          accountId: 'acct-1',
          planTier: 'pro',
          usedUnits: 42,
          limitUnits: 100,
          lastUpdatedAt: '2026-07-02T12:00:00.000Z',
        },
      },
    };
    store.save(written);

    const loaded = store.load();
    expect(loaded.source).toBe('file');
    expect(loaded.data).toEqual(written);
    expect(store.filePath).toBe(join(paths.stateDir, 'limits-cache.json'));
  });

  it('save() creates the role-dir recursively when it does not exist yet', () => {
    const paths = freshLinuxPaths();
    const store = new GlobalStore(paths, AUTH_STATUS_CACHE_DEFINITION);
    // Fresh tmpdir has no .cache/deckent yet — save() must mkdir -p it.
    expect(() => store.save({ entries: {} })).not.toThrow();
    expect(store.load().source).toBe('file');
  });
});

// ─── Fail-soft corruption ────────────────────────────────────────────────────

describe('GlobalStore — corrupt-file fail-soft', () => {
  let tmpHome: string;

  afterEach(() => {
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  function freshStore<T>(definition: GlobalStoreDefinition<T>) {
    tmpHome = mkdtempSync(join(tmpdir(), 'deckent-global-store-test-'));
    const paths = resolveGlobalScopePaths('linux', { HOME: tmpHome });
    return new GlobalStore(paths, definition);
  }

  it('invalid JSON text -> defaultData with a warning, never throws', () => {
    const store = freshStore(AUTH_STATUS_CACHE_DEFINITION);
    // Write directly, bypassing save(), to simulate a torn/corrupt file on disk.
    mkdirSync(join(tmpHome, '.cache', 'deckent'), { recursive: true });
    writeFileSync(store.filePath, '{ not valid json', 'utf-8');

    const result = store.load();
    expect(result.source).toBe('default-corrupt');
    expect(result.warning).toBeDefined();
    expect(result.data).toEqual({ entries: {} });
  });

  it('valid envelope shape but data fails schema validation -> defaultData fail-soft', () => {
    const store = freshStore(LIMITS_CACHE_DEFINITION);
    mkdirSync(join(tmpHome, '.local', 'state', 'deckent'), { recursive: true });
    writeFileSync(
      store.filePath,
      JSON.stringify({ version: 1, data: { accounts: { x: { accountId: 123 } } } }),
      'utf-8',
    );

    const result = store.load();
    expect(result.source).toBe('default-corrupt');
    expect(result.data).toEqual({ accounts: {} });
  });

  it('non-envelope JSON (missing version/data) -> defaultData fail-soft', () => {
    const store = freshStore(MODEL_CATALOG_CACHE_DEFINITION);
    mkdirSync(join(tmpHome, '.cache', 'deckent'), { recursive: true });
    writeFileSync(store.filePath, JSON.stringify({ models: [] }), 'utf-8');

    const result = store.load();
    expect(result.source).toBe('default-corrupt');
    expect(result.data).toEqual({ fetchedAt: null, source: 'none', models: [] });
  });
});

// ─── Migration skeleton (v1 -> v2, synthetic test-only definition) ──────────

interface WidgetV2Data {
  readonly widgets: readonly string[];
}

const widgetV2Schema = z.object({ widgets: z.array(z.string()) }).strict();

function makeWidgetDefinitionV2(
  migrations: GlobalStoreDefinition<WidgetV2Data>['migrations'],
): GlobalStoreDefinition<WidgetV2Data> {
  return {
    role: 'cache',
    fileName: 'widget-test-store.json',
    version: 2,
    dataSchema: widgetV2Schema,
    migrations,
    defaultData: () => ({ widgets: [] }),
  };
}

describe('GlobalStore — migration skeleton', () => {
  let tmpHome: string;

  afterEach(() => {
    if (tmpHome) rmSync(tmpHome, { recursive: true, force: true });
  });

  function freshPaths() {
    tmpHome = mkdtempSync(join(tmpdir(), 'deckent-global-store-test-'));
    return resolveGlobalScopePaths('linux', { HOME: tmpHome });
  }

  it('applies a registered fromVersion migration to upgrade a v1 payload to v2', () => {
    const paths = freshPaths();
    const definition = makeWidgetDefinitionV2([
      {
        fromVersion: 1,
        migrate: (data: unknown) => {
          const legacy = data as { names?: string[] };
          return { widgets: legacy.names ?? [] };
        },
      },
    ]);
    const store = new GlobalStore(paths, definition);

    mkdirSync(globalStoreDir(paths, 'cache'), { recursive: true });
    writeFileSync(
      store.filePath,
      JSON.stringify({ version: 1, data: { names: ['gizmo', 'sprocket'] } }),
      'utf-8',
    );

    const result = store.load();
    expect(result.source).toBe('file');
    expect(result.data).toEqual({ widgets: ['gizmo', 'sprocket'] });
  });

  it('a version with no matching migration step fails soft to defaultData', () => {
    const paths = freshPaths();
    const definition = makeWidgetDefinitionV2([]); // no migrations registered
    const store = new GlobalStore(paths, definition);

    mkdirSync(globalStoreDir(paths, 'cache'), { recursive: true });
    writeFileSync(store.filePath, JSON.stringify({ version: 1, data: { names: ['x'] } }), 'utf-8');

    const result = store.load();
    expect(result.source).toBe('default-corrupt');
    expect(result.data).toEqual({ widgets: [] });
  });

  it('a version newer than the definition understands fails soft to defaultData', () => {
    const paths = freshPaths();
    const definition = makeWidgetDefinitionV2([]);
    const store = new GlobalStore(paths, definition);

    mkdirSync(globalStoreDir(paths, 'cache'), { recursive: true });
    writeFileSync(store.filePath, JSON.stringify({ version: 99, data: { widgets: ['x'] } }), 'utf-8');

    const result = store.load();
    expect(result.source).toBe('default-corrupt');
  });

  it('a file already at the current version needs no migration and loads as-is', () => {
    const paths = freshPaths();
    const definition = makeWidgetDefinitionV2([]);
    const store = new GlobalStore(paths, definition);
    store.save({ widgets: ['already-v2'] });

    const result = store.load();
    expect(result.source).toBe('file');
    expect(result.data).toEqual({ widgets: ['already-v2'] });
  });
});
