// ─── OpenRouter Doc-Route Resolver tests (task 361-003, carryover of 360-008) ──
// Pure-function contract: no network, no disk I/O. Locks the doc-kind-only
// (ASLA for code/tsx), flag-off→null, and cache-validated-model behaviors.
import { describe, it, expect } from 'vitest';
import { resolveOpenRouterDocRoute, type OpenRouterRouteConfig } from '../../src/core/routing-openrouter.js';
import type { Task, TaskScope } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import type { FreeModelCache } from '../../src/core/openrouter-models.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    title: 'test task',
    description: 'test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
    ...overrides,
  };
}

function docScope(): TaskScope {
  return { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] };
}

function codeScope(): TaskScope {
  return { directories: ['src/dashboard/'], filesRead: [], filesWrite: ['src/dashboard/App.tsx'] };
}

const FREE_MODEL_ID = 'meta-llama/llama-3.1-8b-instruct:free';

function cacheWith(...ids: string[]): FreeModelCache {
  return {
    generatedAt: '2026-07-02T00:00:00.000Z',
    models: ids.map(id => ({ id, context: 8192, modality: 'text->text' })),
  };
}

function enabledConfig(overrides: Partial<OpenRouterRouteConfig> = {}): OpenRouterRouteConfig {
  return { enabled: true, doc_route: true, model: FREE_MODEL_ID, ...overrides };
}

// ─── doc-kind + flag-on → suggestion ──────────────────────────────────────────

describe('resolveOpenRouterDocRoute — doc-kind + flag-on', () => {
  it('suggests the pinned model for task.type=documentation', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    const result = resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith(FREE_MODEL_ID));
    expect(result).toEqual({ provider: 'openrouter', model: FREE_MODEL_ID });
  });

  it('suggests the pinned model for task.type=audit', () => {
    const task = baseTask({ type: 'audit', scope: { directories: ['docs/audits/'], filesRead: [], filesWrite: ['docs/audits/scan.md'] } });
    const result = resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith(FREE_MODEL_ID));
    expect(result).toEqual({ provider: 'openrouter', model: FREE_MODEL_ID });
  });

  it('falls back to scope-shape when task.type is absent (docs/*.md only, no source dir)', () => {
    const task = baseTask({ scope: docScope() });
    const result = resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith(FREE_MODEL_ID));
    expect(result).toEqual({ provider: 'openrouter', model: FREE_MODEL_ID });
  });
});

// ─── code/tsx → ASLA (negative-test lock) ─────────────────────────────────────

describe('resolveOpenRouterDocRoute — code/tsx task is ASLA', () => {
  it('returns null for task.type=code-development even with everything else on', () => {
    const task = baseTask({ type: 'code-development', scope: codeScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith(FREE_MODEL_ID))).toBeNull();
  });

  it('returns null for a .tsx-touching scope with no task.type set', () => {
    const task = baseTask({ scope: codeScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith(FREE_MODEL_ID))).toBeNull();
  });

  it('returns null for other canonical code-bearing kinds (test/refactor/security/config/data/devops/design/generic)', () => {
    for (const kind of ['test', 'refactor', 'security', 'config', 'data', 'devops', 'design', 'generic'] as const) {
      const task = baseTask({ type: kind, scope: docScope() });
      expect(resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith(FREE_MODEL_ID))).toBeNull();
    }
  });
});

// ─── flag-off → null ──────────────────────────────────────────────────────────

describe('resolveOpenRouterDocRoute — flag-off', () => {
  it('returns null when enabled=false', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig({ enabled: false }), cacheWith(FREE_MODEL_ID))).toBeNull();
  });

  it('returns null when doc_route=false', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig({ doc_route: false }), cacheWith(FREE_MODEL_ID))).toBeNull();
  });
});

// ─── model resolution against the cache ───────────────────────────────────────

describe('resolveOpenRouterDocRoute — model must be cache-validated', () => {
  it('returns null when config.model is unset (never auto-picks from the cache)', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig({ model: undefined }), cacheWith(FREE_MODEL_ID))).toBeNull();
  });

  it('returns null when config.model is not present in cache.models (stale/unknown pin)', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig({ model: 'no-such/model:free' }), cacheWith(FREE_MODEL_ID))).toBeNull();
  });

  it('returns null when the cache is empty', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    expect(resolveOpenRouterDocRoute(task, enabledConfig(), cacheWith())).toBeNull();
  });
});

// ─── roundtrip-kapanı: config shape survives JSON round-trip ──────────────────

describe('resolveOpenRouterDocRoute — config round-trips closed', () => {
  it('a JSON.stringify → JSON.parse round-trip of the config yields an identical resolution', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    const config = enabledConfig();
    const roundTripped = JSON.parse(JSON.stringify(config)) as OpenRouterRouteConfig;

    const original = resolveOpenRouterDocRoute(task, config, cacheWith(FREE_MODEL_ID));
    const afterRoundTrip = resolveOpenRouterDocRoute(task, roundTripped, cacheWith(FREE_MODEL_ID));

    expect(afterRoundTrip).toEqual(original);
    expect(roundTripped).toEqual(config);
  });

  it('round-trips a flag-off config to the same null result', () => {
    const task = baseTask({ type: 'documentation', scope: docScope() });
    const config = enabledConfig({ enabled: false });
    const roundTripped = JSON.parse(JSON.stringify(config)) as OpenRouterRouteConfig;

    expect(resolveOpenRouterDocRoute(task, roundTripped, cacheWith(FREE_MODEL_ID))).toBeNull();
    expect(resolveOpenRouterDocRoute(task, config, cacheWith(FREE_MODEL_ID))).toBeNull();
  });
});
