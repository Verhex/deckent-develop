// tests/core/global-precedence.test.ts
//
// Sprint 363 Task 363-004 ONB-GLOBAL-PRECEDENCE — derives the global config
// read-path from `resolveGlobalScopePaths` (Sprint 361 Task 361-008,
// global-scope-resolver.ts) instead of the flat, platform-blind
// `GLOBAL_CONFIG_PATH` constant. Migration phase M1
// (docs/design/onb-global-install.md §7.1): reads check the platform-correct
// path first, fall back to the legacy `~/.deckent/config.json` path; writes
// are unaffected (saveGlobalConfig still targets GLOBAL_CONFIG_PATH).
//
// Hermeticity: the pure-path-derivation tests inject `env`/`nodePlatform`
// directly (no process.env mutation, no fs, no os mocking — same style as
// global-scope-resolver.test.ts). The dual-read tests write real files under
// a throwaway tmpdir HOME and pass that HOME via the injected `env` param —
// the real `~/.deckent` / `~/.config/deckent` are never touched because the
// resolver only ever reads the injected `env.HOME`, never `process.env`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveGlobalConfigPaths,
  resolveGlobalConfigReadPath,
  loadGlobalConfig,
} from '../../src/core/config.js';
import { GLOBAL_CONFIG_PATH } from '../../src/core/constants.js';

const POSIX_HOME = '/home/alperen';
const MAC_HOME = '/Users/alperen';
const WIN_HOME = 'C:\\Users\\alperen';

// ─── Part 1 — 4-platform path derivation (pure, env-injected) ──────────────

describe('resolveGlobalConfigPaths — 4-platform matrix (env-inject, no fs/os mocking)', () => {
  it('linux: platformPath is XDG config dir, legacyPath is the flat ~/.deckent dir', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths({ HOME: POSIX_HOME }, 'linux');
    expect(platformPath).toBe('/home/alperen/.config/deckent/config.json');
    expect(legacyPath).toBe('/home/alperen/.deckent/config.json');
  });

  it('linux: honors XDG_CONFIG_HOME override for platformPath only', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths(
      { HOME: POSIX_HOME, XDG_CONFIG_HOME: '/xdg/config' },
      'linux',
    );
    expect(platformPath).toBe('/xdg/config/deckent/config.json');
    expect(legacyPath).toBe('/home/alperen/.deckent/config.json');
  });

  it('wsl: resolves identically to linux XDG rules (distinct platform tag, same paths)', () => {
    const env = { HOME: POSIX_HOME, WSL_DISTRO_NAME: 'Ubuntu' };
    const wsl = resolveGlobalConfigPaths(env, 'linux'); // normalizeGlobalScopePlatform tags this 'wsl'
    expect(wsl.platformPath).toBe('/home/alperen/.config/deckent/config.json');
    expect(wsl.legacyPath).toBe('/home/alperen/.deckent/config.json');
  });

  it('darwin: platformPath is Application Support, legacyPath is the flat ~/.deckent dir', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths({ HOME: MAC_HOME }, 'darwin');
    expect(platformPath).toBe('/Users/alperen/Library/Application Support/deckent/config.json');
    expect(legacyPath).toBe('/Users/alperen/.deckent/config.json');
  });

  it('win32: platformPath is %APPDATA%\\deckent, legacyPath is the flat .deckent dir (win32 backend, deterministic on any host)', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths({ USERPROFILE: WIN_HOME }, 'win32');
    expect(platformPath).toBe('C:\\Users\\alperen\\AppData\\Roaming\\deckent\\config.json');
    expect(legacyPath).toBe('C:\\Users\\alperen\\.deckent\\config.json');
    // No mixed separators — the win32 backend must be used end-to-end, not the host's posix join.
    expect(platformPath).not.toContain('/');
    expect(legacyPath).not.toContain('/');
  });

  it('win32: honors %APPDATA% override for platformPath', () => {
    const { platformPath } = resolveGlobalConfigPaths(
      { USERPROFILE: WIN_HOME, APPDATA: 'D:\\Roaming' },
      'win32',
    );
    expect(platformPath).toBe('D:\\Roaming\\deckent\\config.json');
  });

  it('DECKENT_HOME override collapses platformPath onto the override, independent of legacyPath', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths(
      { HOME: POSIX_HOME, DECKENT_HOME: '/sandbox/deckent-home' },
      'linux',
    );
    expect(platformPath).toBe('/sandbox/deckent-home/config.json');
    expect(legacyPath).toBe('/home/alperen/.deckent/config.json');
  });
});

// ─── Part 2 — safety net: never throw, never regress ───────────────────────

describe('resolveGlobalConfigPaths — safety net (unsupported platform / unresolved home)', () => {
  it('falls back to GLOBAL_CONFIG_PATH for both candidates on an unsupported platform string', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths({ HOME: POSIX_HOME }, 'freebsd');
    expect(platformPath).toBe(GLOBAL_CONFIG_PATH);
    expect(legacyPath).toBe(GLOBAL_CONFIG_PATH);
  });

  it('falls back to GLOBAL_CONFIG_PATH when HOME is unresolvable on a supported platform', () => {
    const { platformPath, legacyPath } = resolveGlobalConfigPaths({}, 'linux');
    expect(platformPath).toBe(GLOBAL_CONFIG_PATH);
    expect(legacyPath).toBe(GLOBAL_CONFIG_PATH);
  });

  it('never throws regardless of platform/env combination', () => {
    expect(() => resolveGlobalConfigPaths({}, 'freebsd')).not.toThrow();
    expect(() => resolveGlobalConfigPaths({ HOME: '' }, 'linux')).not.toThrow();
  });
});

// ─── Part 3 — dual-read fallback (real tmpdir fs, hermetic) ────────────────

function makeSandboxHome(): string {
  return mkdtempSync(join(tmpdir(), 'deckent-global-precedence-'));
}

function writeConfigAt(filePath: string, contents: Record<string, unknown>): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, JSON.stringify(contents, null, 2) + '\n', 'utf-8');
}

describe('resolveGlobalConfigReadPath — dual-read (M1: platform-correct preferred, legacy fallback)', () => {
  let sandboxHome: string;

  beforeEach(() => {
    sandboxHome = makeSandboxHome();
  });

  afterEach(() => {
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it('returns the legacy path when only the legacy file exists (existing-install back-compat)', () => {
    const env = { HOME: sandboxHome };
    const { legacyPath, platformPath } = resolveGlobalConfigPaths(env, 'linux');
    expect(existsSync(platformPath)).toBe(false);
    writeConfigAt(legacyPath, { language: 'tr' });

    const resolved = resolveGlobalConfigReadPath(env, 'linux');
    expect(resolved).toBe(legacyPath);
  });

  it('returns the platform-correct path when only it exists (fresh XDG-first install)', () => {
    const env = { HOME: sandboxHome };
    const { legacyPath, platformPath } = resolveGlobalConfigPaths(env, 'linux');
    expect(existsSync(legacyPath)).toBe(false);
    writeConfigAt(platformPath, { language: 'en' });

    const resolved = resolveGlobalConfigReadPath(env, 'linux');
    expect(resolved).toBe(platformPath);
  });

  it('prefers the platform-correct path when BOTH exist ("yeni-yol tercih")', () => {
    const env = { HOME: sandboxHome };
    const { legacyPath, platformPath } = resolveGlobalConfigPaths(env, 'linux');
    writeConfigAt(legacyPath, { language: 'tr' });
    writeConfigAt(platformPath, { language: 'en' });

    const resolved = resolveGlobalConfigReadPath(env, 'linux');
    expect(resolved).toBe(platformPath);
  });

  it('returns the legacy path when NEITHER exists — byte-identical to pre-migration behavior (both resolve to nothing)', () => {
    const env = { HOME: sandboxHome };
    const { legacyPath } = resolveGlobalConfigPaths(env, 'linux');
    const resolved = resolveGlobalConfigReadPath(env, 'linux');
    expect(resolved).toBe(legacyPath);
    expect(existsSync(resolved)).toBe(false);
  });

  it('loadGlobalConfig(legacyPath) still reads an explicit path directly, bypassing dual-read (unchanged contract)', async () => {
    const env = { HOME: sandboxHome };
    const { legacyPath } = resolveGlobalConfigPaths(env, 'linux');
    writeConfigAt(legacyPath, { language: 'tr', projectName: 'explicit-path-test' });

    const result = await loadGlobalConfig(legacyPath);
    expect(result?.language).toBe('tr');
    expect(result?.projectName).toBe('explicit-path-test');
  });
});
