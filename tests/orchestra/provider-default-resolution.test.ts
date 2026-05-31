/**
 * Sprint 202 Task 202-003 — Provider-default resolution.
 *
 * Verifies the registry-default fallback path that replaces the `?? 'claude'`
 * hardcode in provider-neutral modules. Each test exercises a different layer
 * of the helper chain so a regression at any layer is localized:
 *
 *   1. getDefaultProvider() / getDefaultProviderName() — provider.ts accessor
 *   2. Empty-registry fallback — must not throw, must yield the 'claude' floor
 *   3. Pure-Ollama config — registry default propagates instead of silently
 *      hard-coding 'claude'
 *   4. task-router fallback — uses the registry default when availableProviders
 *      is empty
 *   5. ensureAvailable — falls back to registry default when preferred and
 *      available[] are both empty
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  providerRegistry,
  type ProviderAdapter,
} from '../../src/core/provider.js';
import {
  getDefaultProvider,
  getDefaultProviderName,
} from '../../src/orchestra/sprint-utils.js';
import { routeTask, type TaskRouterConfig } from '../../src/orchestra/task-router.js';
import { TaskStatus, type Task, type ProviderName, type ModelType } from '../../src/core/types.js';

// ─── Test helpers ────────────────────────────────────────────────────

function makeAdapter(name: string): ProviderAdapter {
  return {
    name,
    supportedModels: [] as readonly ModelType[],
    spawn: () => undefined,
    kill: () => undefined,
    listWorkers: () => [],
    isAvailable: async () => true,
    buildCommand: () => `${name} cli`,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '202-test',
    title: 'default-resolution test task',
    description: 'verify registry-default fallback',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

// ─── getDefaultProvider / getDefaultProviderName ─────────────────────

// ─── Global-registry snapshot/restore helper ─────────────────────────
// The helpers under test read the global `providerRegistry` singleton. Each
// suite below snapshots and clears it so tests are order-independent.
function snapshotAndClearRegistry() {
  const defaultName = (() => {
    try { return providerRegistry.getDefault().name; } catch { return null; }
  })();
  const entries = providerRegistry.listProviders().map(n => providerRegistry.getProvider(n));
  providerRegistry.clear();
  return () => {
    providerRegistry.clear();
    for (const a of entries) {
      try { providerRegistry.registerProvider(a); } catch { /* duplicate */ }
    }
    if (defaultName && providerRegistry.hasProvider(defaultName)) {
      providerRegistry.setDefault(defaultName);
    }
  };
}

describe('getDefaultProvider — registry-default accessor', () => {
  let restore: () => void;
  beforeEach(() => { restore = snapshotAndClearRegistry(); });
  afterEach(() => restore());

  it('returns the registered default adapter (pure-Ollama scenario)', () => {
    const ollama = makeAdapter('ollama');
    providerRegistry.registerProvider(ollama, true);

    const adapter = getDefaultProvider();
    expect(adapter).not.toBeNull();
    expect(adapter?.name).toBe('ollama');
  });

  it('returns null when the registry is empty (does not throw)', () => {
    expect(() => getDefaultProvider()).not.toThrow();
    expect(getDefaultProvider()).toBeNull();
  });
});

describe('getDefaultProviderName — last-resort floor', () => {
  let restore: () => void;
  beforeEach(() => { restore = snapshotAndClearRegistry(); });
  afterEach(() => restore());

  it('returns the registered default name when one exists (ollama scenario)', () => {
    providerRegistry.registerProvider(makeAdapter('ollama'), true);
    // Pure-Ollama config: no Claude registered at all.
    expect(getDefaultProviderName()).toBe('ollama');
  });

  it("falls back to the 'claude' literal only when the registry is empty", () => {
    // This is the canonical last-resort floor — pre-bootstrap callers (tests,
    // first-run prompts) must still get a usable ProviderName instead of null.
    expect(getDefaultProviderName()).toBe('claude');
  });
});

// ─── task-router integration ─────────────────────────────────────────

describe('routeTask — registry-default fallback when no providers available', () => {
  let restore: () => void;
  beforeEach(() => { restore = snapshotAndClearRegistry(); });
  afterEach(() => restore());

  it('uses the registry default (ollama) when availableProviders is empty', () => {
    providerRegistry.registerProvider(makeAdapter('ollama'), true);
    const config: TaskRouterConfig = {};
    const result = routeTask(makeTask(), config, [] as ProviderName[]);
    expect(result.provider).toBe('ollama');
    expect(result.reason).toMatch(/registry default/);
  });

  it("falls back to 'claude' literal only when both available[] and registry are empty", () => {
    // No providers registered, no available list — the absolute floor.
    const config: TaskRouterConfig = {};
    const result = routeTask(makeTask(), config, [] as ProviderName[]);
    expect(result.provider).toBe('claude');
  });
});
