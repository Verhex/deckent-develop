#!/usr/bin/env node
// multi-provider-fleet-smoke.mjs — validates 8-provider fleet coexistence in the provider registry.
//
// Registers mock adapters for 3 subscription providers (claude/gemini/codex),
// 4 OpenAI-compatible API providers (deepseek/qwen/glm/mistral), and 1 local (ollama).
// Verifies per-task routing, concurrent coexistence, and overflow from subscription to API.
// No real API calls — all mocked.
//
// Run directly: node scripts/multi-provider-fleet-smoke.mjs → PASS or FAIL
// Import in tests: import { createFleetRegistry, routeFleetTask, resolveFleetOverflow, runFleetSmoke } from ...

import { fileURLToPath } from 'node:url';

// ─── Types / constants ───────────────────────────────────────────────────────

const SUBSCRIPTION_PROVIDERS = ['claude', 'gemini', 'codex'];
const API_PROVIDERS = ['deepseek', 'qwen', 'glm', 'mistral'];
const LOCAL_PROVIDERS = ['ollama'];

// ─── Inline mock fleet registry ──────────────────────────────────────────────

/**
 * Minimal provider registry for 8-provider fleet smoke testing.
 * API-compatible with ProviderRegistry in src/core/provider.ts — no dist import required.
 */
export class MockFleetRegistry {
  constructor() {
    this._providers = new Map();
    this._default = null;
  }

  /**
   * Register a mock adapter.
   * @param {{name: string, authMode?: string, providerType?: string}} adapter
   * @param {boolean} setDefault
   */
  register(adapter, setDefault = false) {
    if (this._providers.has(adapter.name)) {
      throw new Error(`Provider already registered: ${adapter.name}`);
    }
    this._providers.set(adapter.name, adapter);
    if (setDefault || this._default === null) {
      this._default = adapter.name;
    }
  }

  /** @param {string} name */
  get(name) {
    return this._providers.get(name);
  }

  /** @returns {string[]} */
  list() {
    return Array.from(this._providers.keys());
  }

  /** @param {string} name */
  has(name) {
    return this._providers.has(name);
  }

  /** @returns {{name: string} | null} */
  getDefault() {
    if (this._default === null) return null;
    return this._providers.get(this._default) ?? null;
  }

  /** @param {string} type  'subscription' | 'api' | 'local' */
  listByType(type) {
    return Array.from(this._providers.values()).filter((a) => a.providerType === type);
  }

  clear() {
    this._providers.clear();
    this._default = null;
  }
}

// ─── Mock adapters ───────────────────────────────────────────────────────────

/**
 * Create all 8 mock fleet adapters.
 * authMode: 'session' for subscriptions, 'api' for OpenAI-compat, 'none' for local.
 * providerType: 'subscription' | 'api' | 'local'
 */
export function createFleetAdapters() {
  return {
    // Subscription providers (CLI-spawn)
    claude:   { name: 'claude', authMode: 'session', providerType: 'subscription' },
    gemini:   { name: 'gemini', authMode: 'session', providerType: 'subscription' },
    codex:    { name: 'codex', authMode: 'session', providerType: 'subscription' },

    // OpenAI-compatible API providers (HTTP fetch)
    deepseek: { name: 'deepseek', authMode: 'api', providerType: 'api' },
    qwen:     { name: 'qwen', authMode: 'api', providerType: 'api' },
    glm:      { name: 'glm', authMode: 'api', providerType: 'api' },
    mistral:  { name: 'mistral', authMode: 'api', providerType: 'api' },

    // Local providers
    ollama:   { name: 'ollama', authMode: 'none', providerType: 'local' },
  };
}

/**
 * Create a registry pre-populated with all 8 fleet adapters.
 * claude is registered first and becomes the default.
 * @returns {MockFleetRegistry}
 */
export function createFleetRegistry() {
  const registry = new MockFleetRegistry();
  const adapters = createFleetAdapters();
  // Register subscription first (claude becomes default)
  registry.register(adapters.claude);
  registry.register(adapters.gemini);
  registry.register(adapters.codex);
  // API providers
  registry.register(adapters.deepseek);
  registry.register(adapters.qwen);
  registry.register(adapters.glm);
  registry.register(adapters.mistral);
  // Local
  registry.register(adapters.ollama);
  return registry;
}

// ─── Routing logic ───────────────────────────────────────────────────────────

/**
 * Route a task to a fleet provider adapter.
 * An explicit provider must be registered. Only an absent provider consumes
 * this fixture's configured default.
 *
 * @param {{provider?: string}} task
 * @param {MockFleetRegistry} registry
 * @returns {{adapter: {name: string}, reason: string}}
 */
export function routeFleetTask(task, registry) {
  if (task.provider) {
    if (!registry.has(task.provider)) {
      throw new Error(`Unknown task.provider '${task.provider}'`);
    }
    return {
      adapter: registry.get(task.provider),
      reason: `task.provider '${task.provider}'`,
    };
  }
  const defaultAdapter = registry.getDefault();
  if (!defaultAdapter) {
    throw new Error('No providers registered and no default available');
  }
  return {
    adapter: defaultAdapter,
    reason: `no task.provider, using configured default '${defaultAdapter.name}'`,
  };
}

// ─── Overflow logic ───────────────────────────────────────────────────────────

/**
 * Overflow resolution — when a subscription provider signals quota exhaustion,
 * pick an equivalent API provider from the fleet registry.
 *
 * Mirrors the decision contract in src/core/provider-overflow.ts (Task 215-006)
 * but operates entirely on mock adapters (no real token-quota or model-registry).
 *
 * @param {{provider?: string, authMode?: string, rateLimitExhausted?: boolean}} task
 * @param {MockFleetRegistry} registry
 * @returns {{task: object, overflowed: boolean, reason: string, fallbackProvider?: string}}
 */
export function resolveFleetOverflow(task, registry) {
  // Already using an API or local provider — no overflow needed.
  if (task.authMode === 'api' || task.authMode === 'none') {
    return { task, overflowed: false, reason: 'already_api' };
  }

  // No quota pressure — keep subscription path.
  if (!task.rateLimitExhausted) {
    return { task, overflowed: false, reason: 'no_signal' };
  }

  // Quota exhausted — find the first available API provider in the fleet.
  const apiProviders = registry.listByType('api');
  if (apiProviders.length === 0) {
    return { task, overflowed: false, reason: 'no_equivalent' };
  }

  const fallbackAdapter = apiProviders[0];
  const overflowedTask = {
    ...task,
    provider: fallbackAdapter.name,
    authMode: 'api',
    rateLimitExhausted: false,
  };

  return {
    task: overflowedTask,
    overflowed: true,
    reason: 'overflow',
    fallbackProvider: fallbackAdapter.name,
  };
}

// ─── Smoke scenarios ──────────────────────────────────────────────────────────

/**
 * Run 4 fleet coexistence scenarios and return pass/fail report.
 * No real API calls.
 *
 * @returns {Promise<{pass: boolean, reason?: string, scenarios: string[]}>}
 */
export async function runFleetSmoke() {
  const passed = [];
  const failed = [];

  // Scenario 1: 8 providers registered — all present in registry.list()
  try {
    const registry = createFleetRegistry();
    const providers = registry.list();
    const expected = ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'mistral', 'ollama'];
    for (const name of expected) {
      if (!providers.includes(name)) throw new Error(`'${name}' missing from registry`);
    }
    if (providers.length !== 8) throw new Error(`Expected 8 providers, got ${providers.length}`);
    passed.push('eight-providers-registered');
  } catch (err) {
    failed.push(`eight-providers-registered: ${err.message}`);
  }

  // Scenario 2: per-task provider selection — each task routes to its declared provider
  try {
    const registry = createFleetRegistry();
    const cases = [
      'claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'mistral', 'ollama',
    ];
    for (const providerName of cases) {
      const result = routeFleetTask({ provider: providerName }, registry);
      if (result.adapter.name !== providerName) {
        throw new Error(`task.provider='${providerName}' → got '${result.adapter.name}'`);
      }
    }
    passed.push('per-task-provider-selection');
  } catch (err) {
    failed.push(`per-task-provider-selection: ${err.message}`);
  }

  // Scenario 3: mix coexist — concurrent routing preserves registry integrity
  try {
    const registry = createFleetRegistry();
    const tasks = [
      { id: 't1', provider: 'claude' },
      { id: 't2', provider: 'deepseek' },
      { id: 't3', provider: 'ollama' },
      { id: 't4', provider: 'gemini' },
      { id: 't5' /* no provider → default */ },
      { id: 't6', provider: 'qwen' },
      { id: 't7', provider: 'codex' },
      { id: 't8', provider: 'glm' },
      { id: 't9', provider: 'mistral' },
    ];
    const results = tasks.map((t) => routeFleetTask(t, registry));
    const names = results.map((r) => r.adapter.name);

    if (names[0] !== 'claude') throw new Error(`t1 claude expected, got ${names[0]}`);
    if (names[1] !== 'deepseek') throw new Error(`t2 deepseek expected, got ${names[1]}`);
    if (names[2] !== 'ollama') throw new Error(`t3 ollama expected, got ${names[2]}`);
    if (names[3] !== 'gemini') throw new Error(`t4 gemini expected, got ${names[3]}`);
    if (names[4] !== 'claude') throw new Error(`t5 (default) claude expected, got ${names[4]}`);

    // Verify registry still intact (8 providers) after routing
    if (registry.list().length !== 8) throw new Error('Registry corrupted after routing');
    if (registry.getDefault()?.name !== 'claude') throw new Error('Default provider changed');

    passed.push('mix-coexist');
  } catch (err) {
    failed.push(`mix-coexist: ${err.message}`);
  }

  // Scenario 4: overflow trigger — subscription quota exhausted → switches to API provider
  try {
    const registry = createFleetRegistry();

    // Case 4a: subscription task with no quota pressure → no overflow
    const task1 = { provider: 'claude', authMode: 'session', rateLimitExhausted: false };
    const result1 = resolveFleetOverflow(task1, registry);
    if (result1.overflowed) throw new Error('Should not overflow when no quota pressure');
    if (result1.reason !== 'no_signal') throw new Error(`Expected 'no_signal', got '${result1.reason}'`);

    // Case 4b: subscription task with quota exhausted → overflow to API provider
    const task2 = { provider: 'claude', authMode: 'session', rateLimitExhausted: true };
    const result2 = resolveFleetOverflow(task2, registry);
    if (!result2.overflowed) throw new Error('Should overflow when quota exhausted');
    if (result2.reason !== 'overflow') throw new Error(`Expected 'overflow', got '${result2.reason}'`);
    if (!API_PROVIDERS.includes(result2.fallbackProvider)) {
      throw new Error(`Fallback '${result2.fallbackProvider}' is not an API provider`);
    }
    if (result2.task.authMode !== 'api') throw new Error('Overflowed task should have authMode=api');

    // Case 4c: task already in API mode → already_api
    const task3 = { provider: 'deepseek', authMode: 'api', rateLimitExhausted: true };
    const result3 = resolveFleetOverflow(task3, registry);
    if (result3.overflowed) throw new Error('API task should not overflow');
    if (result3.reason !== 'already_api') throw new Error(`Expected 'already_api', got '${result3.reason}'`);

    passed.push('overflow-trigger');
  } catch (err) {
    failed.push(`overflow-trigger: ${err.message}`);
  }

  return {
    pass: failed.length === 0,
    reason: failed.length > 0 ? failed.join('; ') : undefined,
    scenarios: [
      ...passed.map((s) => `PASS ${s}`),
      ...failed.map((s) => `FAIL ${s}`),
    ],
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFleetSmoke()
    .then((result) => {
      for (const line of result.scenarios) process.stdout.write(line + '\n');
      if (result.pass) {
        process.stdout.write('PASS\n');
        process.exit(0);
      } else {
        process.stderr.write(`FAIL: ${result.reason}\n`);
        process.exit(1);
      }
    })
    .catch((err) => {
      process.stderr.write(`FAIL: ${err.message}\n`);
      process.exit(1);
    });
}
