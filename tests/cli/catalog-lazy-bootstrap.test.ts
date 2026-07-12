/**
 * catalog-lazy-bootstrap.test.ts — SEC-04 (task 418-003)
 *
 * Proves the CLI's model-catalog fetch is LAZY: only commands whose
 * execution path genuinely needs the model catalog (start/plan/run/models/
 * chat — the registry's `catalogDependent` field) trigger
 * `bootstrapFromCatalog`. Read-only commands (status/doctor/history/config/
 * ...) must never touch the network — nor even read the cache file.
 *
 * RED (pre-fix, evidence): src/cli/entry.ts's Commander `preAction` hook
 * used to call `bootstrapFromCatalog(...)` unconditionally for EVERY
 * argv-based dispatch — there was no `shouldBootstrapCatalogFor` gate at
 * all, so a status-class command always entered the fetch path (subject to
 * only the pre-existing warm-cache/offline short-circuits inside
 * `loadCatalog`, not a command-classification gate). This suite encodes the
 * GREEN (post-fix) contract below; the removed unconditional call is the
 * RED evidence (see docImpact note in the task .result if any doc goes
 * stale referencing the old always-bootstrap behavior).
 *
 * Hermetic: no real network — every catalog-loading test injects
 * `_fetchImpl`/`fetchImpl` and uses a tmpdir cache path.
 */
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isCatalogDependent, getCommand } from '../../src/cli/command-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { RemoteCatalogResponse } from '../../src/core/model-catalog.js';

// ─── Test helpers (mirrors tests/core/model-catalog-bootstrap.test.ts) ────

function fakeRegistry(): { mergeFromCatalog: ReturnType<typeof vi.fn> } {
  return { mergeFromCatalog: vi.fn() };
}

function fakeCatalogResponse(id = 'test-model-01'): RemoteCatalogResponse {
  return {
    version: '1.0.0',
    models: [
      {
        id,
        provider: 'anthropic',
        tier: 'standard',
        status: 'ga',
        contextWindow: 200_000,
        capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: false },
      },
    ],
  };
}

function mockFetch(response: RemoteCatalogResponse): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => response,
  }) as unknown as typeof fetch;
}

let workDir: string;

afterEach(() => {
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

// ─── (1) Registry classification — no hand-written command list ──────────

describe('command-registry — catalogDependent (SEC-04, task 418-003)', () => {
  it('read-only / non-model commands are NOT catalog-dependent', () => {
    for (const name of ['status', 'doctor', 'history', 'config', 'analyze', 'watch', 'usage', 'kpi', 'recall']) {
      expect(isCatalogDependent(name)).toBe(false);
    }
  });

  it('the model-dependent class (start/plan/run/models/chat) IS catalog-dependent', () => {
    for (const name of ['start', 'plan', 'run', 'models', 'chat']) {
      expect(isCatalogDependent(name)).toBe(true);
    }
  });

  it('unknown command names default to non-dependent (safe default)', () => {
    expect(isCatalogDependent('not-a-real-command')).toBe(false);
  });

  it('every catalogDependent entry is a real registered command', () => {
    for (const name of ['start', 'plan', 'run', 'models', 'chat']) {
      expect(getCommand(name)).toBeDefined();
    }
  });
});

// ─── (2) entry.ts argv→command classification (pure functions) ───────────

describe('entry.ts — topLevelCommandName / shouldBootstrapCatalogFor (SEC-04)', () => {
  let topLevelCommandName: (argv: readonly string[]) => string | undefined;
  let shouldBootstrapCatalogFor: (argv: readonly string[]) => boolean;

  beforeAll(async () => {
    const mod = await import('../../src/cli/entry.js');
    topLevelCommandName = mod.topLevelCommandName;
    shouldBootstrapCatalogFor = mod.shouldBootstrapCatalogFor;
  });

  it('extracts the first non-flag token as the top-level command', () => {
    expect(topLevelCommandName(['node', 'deckent', 'status'])).toBe('status');
    expect(topLevelCommandName(['node', 'deckent', 'plan', '--dry-run'])).toBe('plan');
  });

  it('returns undefined for flag-only / empty argv', () => {
    expect(topLevelCommandName(['node', 'deckent'])).toBeUndefined();
    expect(topLevelCommandName(['node', 'deckent', '--version'])).toBeUndefined();
  });

  it('RED→GREEN: status-class commands do not trigger catalog bootstrap (network-free)', () => {
    for (const argv of [
      ['node', 'deckent', 'status'],
      ['node', 'deckent', 'doctor'],
      ['node', 'deckent', 'history'],
      ['node', 'deckent', 'config'],
    ]) {
      expect(shouldBootstrapCatalogFor(argv)).toBe(false);
    }
  });

  it('GREEN: model-dependent commands still trigger catalog bootstrap', () => {
    for (const argv of [
      ['node', 'deckent', 'start'],
      ['node', 'deckent', 'plan'],
      ['node', 'deckent', 'run', 'task-1'],
      ['node', 'deckent', 'models'],
      ['node', 'deckent', 'chat'],
    ]) {
      expect(shouldBootstrapCatalogFor(argv)).toBe(true);
    }
  });

  it('does not false-positive on nested subcommands sharing a leaf name with a top-level catalog-dependent command', () => {
    // `autonomous start` / `bot start` / `gateway start` each have their own
    // `start` LEAF subcommand — must classify by the TOP-LEVEL command
    // (autonomous/bot/gateway), never by the leaf name.
    expect(shouldBootstrapCatalogFor(['node', 'deckent', 'autonomous', 'start'])).toBe(false);
    expect(shouldBootstrapCatalogFor(['node', 'deckent', 'bot', 'start'])).toBe(false);
    expect(shouldBootstrapCatalogFor(['node', 'deckent', 'gateway', 'start'])).toBe(false);
    // `flow run` / `docs run` / `mode run` each have their own `run` leaf.
    expect(shouldBootstrapCatalogFor(['node', 'deckent', 'flow', 'run'])).toBe(false);
    expect(shouldBootstrapCatalogFor(['node', 'deckent', 'docs', 'run'])).toBe(false);
    expect(shouldBootstrapCatalogFor(['node', 'deckent', 'mode', 'run'])).toBe(false);
  });
});

// ─── (3) onFetchAttempt network-policy hook (model-catalog.ts) ───────────

describe('loadCatalog / bootstrapFromCatalog — onFetchAttempt network-policy hook (SEC-04)', () => {
  // bootstrapFromCatalog has a module-level idempotency singleton
  // (`_catalogBootstrapped`) — reset the module registry before each test
  // so one test's `force:true` call can't bleed a "not warm" or "already
  // bootstrapped" state into the next test.
  beforeEach(() => {
    vi.resetModules();
  });

  it('fires exactly once immediately before a genuine network fetch (cold cache, online)', async () => {
    const { bootstrapFromCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'catalog-lazy-test-'));
    const onFetchAttempt = vi.fn();

    await bootstrapFromCatalog({
      force: true,
      _fetchImpl: mockFetch(fakeCatalogResponse('fresh')),
      _cachePath: join(workDir, 'cache.json'),
      _registry: fakeRegistry(),
      onFetchAttempt,
    });

    expect(onFetchAttempt).toHaveBeenCalledOnce();
  });

  it('never fires when the cache is warm — warm-cache path stays byte-behavior-identical', async () => {
    const { bootstrapFromCatalog, loadCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'catalog-lazy-test-'));
    const cachePath = join(workDir, 'cache.json');

    // Prime a warm cache directly (correct `fetchImpl` field on loadCatalog).
    await loadCatalog({ fetchImpl: mockFetch(fakeCatalogResponse('primed')), cachePath });

    const onFetchAttempt = vi.fn();
    const fetchSpy = vi.fn();

    // No `force:true` here on purpose — the fresh module instance (see
    // beforeEach) already has `_catalogBootstrapped === false`, so this
    // exercises the real (non-forced) cache-warmth branch inside
    // loadCatalog, exactly as the CLI's own preAction hook would.
    await bootstrapFromCatalog({
      _fetchImpl: fetchSpy as unknown as typeof fetch,
      _cachePath: cachePath,
      _registry: fakeRegistry(),
      onFetchAttempt,
    });

    expect(onFetchAttempt).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('warm-cache loadCatalog result is unaffected by onFetchAttempt presence (byte-identical)', async () => {
    const { loadCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'catalog-lazy-test-'));
    const cachePath = join(workDir, 'cache.json');
    await loadCatalog({ fetchImpl: mockFetch(fakeCatalogResponse('warm')), cachePath });

    const failingFetch = vi.fn().mockRejectedValue(new Error('must not be called')) as unknown as typeof fetch;

    const withoutHook = await loadCatalog({ cachePath, fetchImpl: failingFetch });
    const onFetchAttempt = vi.fn();
    const withHook = await loadCatalog({ cachePath, fetchImpl: failingFetch, onFetchAttempt });

    expect(withHook.source).toBe('cache');
    expect(withoutHook.source).toBe('cache');
    expect(withHook.models).toEqual(withoutHook.models);
    expect(onFetchAttempt).not.toHaveBeenCalled();
  });

  it('never fires in offline mode (DECKENT_OFFLINE=1 path)', async () => {
    const { bootstrapFromCatalog } = await import('../../src/core/model-catalog.js');
    workDir = mkdtempSync(join(tmpdir(), 'catalog-lazy-test-'));
    const onFetchAttempt = vi.fn();
    const fetchSpy = vi.fn();

    await bootstrapFromCatalog({
      force: true,
      offline: true,
      _fetchImpl: fetchSpy as unknown as typeof fetch,
      _cachePath: join(workDir, 'no-cache.json'),
      _registry: fakeRegistry(),
      onFetchAttempt,
    });

    expect(onFetchAttempt).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── (4) i18n — en+tr ──────────────────────────────────────────────────

describe('i18n — catalog.network_fetch_notice (SEC-04)', () => {
  it('has both en and tr translations, distinct from the raw key and from each other', () => {
    const en = getMessage('catalog.network_fetch_notice', 'en');
    const tr = getMessage('catalog.network_fetch_notice', 'tr');
    expect(en).not.toBe('catalog.network_fetch_notice');
    expect(tr).not.toBe('catalog.network_fetch_notice');
    expect(en).not.toBe(tr);
  });
});
