#!/usr/bin/env node
// multi-provider-smoke.mjs — validates multi-provider coexistence in the provider registry.
//
// Registers mock claude + ollama + openai-compat adapters into an inline registry and
// verifies per-task provider routing selects the correct adapter. No real API calls.
//
// Run directly: node scripts/multi-provider-smoke.mjs → PASS or FAIL
// Import in tests: import { createMockRegistry, routeTaskToProvider, runSmoke } from ...

import { fileURLToPath } from 'node:url';

// ─── Inline mock registry ────────────────────────────────────────────────────

/**
 * Minimal provider registry for smoke testing — no dist import required.
 */
export class MockProviderRegistry {
  constructor() {
    this._providers = new Map();
    this._default = null;
  }

  /**
   * Register a mock adapter. First registered becomes default unless setDefault=true.
   * @param {{name: string}} adapter
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

  /** @param {string} name @returns {{name: string} | undefined} */
  get(name) {
    return this._providers.get(name);
  }

  /** @returns {string[]} */
  list() {
    return Array.from(this._providers.keys());
  }

  /** @param {string} name @returns {boolean} */
  has(name) {
    return this._providers.has(name);
  }

  /** @returns {{name: string} | null} */
  getDefault() {
    if (this._default === null) return null;
    return this._providers.get(this._default) ?? null;
  }
}

// ─── Mock adapters ───────────────────────────────────────────────────────────

/** Create the three standard mock adapters for smoke testing. */
export function createMockAdapters() {
  return {
    claude: { name: 'claude' },
    ollama: { name: 'ollama' },
    'openai-compat': { name: 'openai-compat' },
  };
}

/**
 * Create a registry pre-populated with all three mock adapters.
 * claude is registered first (and becomes default).
 * @returns {MockProviderRegistry}
 */
export function createMockRegistry() {
  const registry = new MockProviderRegistry();
  const adapters = createMockAdapters();
  registry.register(adapters.claude);
  registry.register(adapters.ollama);
  registry.register(adapters['openai-compat']);
  return registry;
}

// ─── Routing logic ───────────────────────────────────────────────────────────

/**
 * Route a task to a provider adapter, mirroring task-router.ts Priority 3 logic.
 * If task.provider is set and registered → use it. An explicit unknown provider
 * fails loudly; only an absent provider may consume this fixture's configured
 * default.
 *
 * @param {{provider?: string}} task
 * @param {MockProviderRegistry} registry
 * @returns {{adapter: {name: string}, reason: string}}
 */
export function routeTaskToProvider(task, registry) {
  if (task.provider) {
    if (!registry.has(task.provider)) {
      throw new Error(`Unknown task.provider '${task.provider}'`);
    }
    return {
      adapter: registry.get(task.provider),
      reason: `task.provider field '${task.provider}'`,
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

// ─── Smoke scenarios ─────────────────────────────────────────────────────────

/**
 * Run 4 multi-provider coexistence scenarios and return pass/fail report.
 * No real API calls.
 *
 * @returns {Promise<{pass: boolean, reason?: string, scenarios: string[]}>}
 */
export async function runSmoke() {
  const passed = [];
  const failed = [];

  // Scenario 1: 3 providers registered → all present in registry.list()
  try {
    const registry = createMockRegistry();
    const providers = registry.list();
    if (!providers.includes('claude')) throw new Error('claude not in registry');
    if (!providers.includes('ollama')) throw new Error('ollama not in registry');
    if (!providers.includes('openai-compat')) throw new Error('openai-compat not in registry');
    if (providers.length !== 3) throw new Error(`Expected 3 providers, got ${providers.length}`);
    passed.push('three-providers-registered');
  } catch (err) {
    failed.push(`three-providers-registered: ${err.message}`);
  }

  // Scenario 2: per-task provider selection — each task routes to its declared provider
  try {
    const registry = createMockRegistry();
    const cases = [
      { provider: 'claude', expected: 'claude' },
      { provider: 'ollama', expected: 'ollama' },
      { provider: 'openai-compat', expected: 'openai-compat' },
    ];
    for (const c of cases) {
      const result = routeTaskToProvider({ provider: c.provider }, registry);
      if (result.adapter.name !== c.expected) {
        throw new Error(`task.provider='${c.provider}' → got '${result.adapter.name}', expected '${c.expected}'`);
      }
    }
    passed.push('per-task-provider-selection');
  } catch (err) {
    failed.push(`per-task-provider-selection: ${err.message}`);
  }

  // Scenario 3: explicit unknown provider fails before default selection
  try {
    const registry = createMockRegistry();
    let rejected = false;
    try {
      routeTaskToProvider({ provider: 'unknown-xyz' }, registry);
    } catch (err) {
      rejected = err instanceof Error && err.message.includes('Unknown task.provider');
    }
    if (!rejected) throw new Error('Unknown provider did not fail loudly');
    passed.push('unknown-provider-rejected');
  } catch (err) {
    failed.push(`unknown-provider-rejected: ${err.message}`);
  }

  // Scenario 4: mix coexist — concurrent routing across all 3 providers
  try {
    const registry = createMockRegistry();
    const tasks = [
      { id: 't1', provider: 'claude' },
      { id: 't2', provider: 'ollama' },
      { id: 't3', provider: 'openai-compat' },
      { id: 't4' /* no provider → default */ },
      { id: 't5', provider: 'claude' },
    ];
    const results = tasks.map((t) => routeTaskToProvider(t, registry));
    const names = results.map((r) => r.adapter.name);

    if (names[0] !== 'claude') throw new Error(`t1: expected claude, got ${names[0]}`);
    if (names[1] !== 'ollama') throw new Error(`t2: expected ollama, got ${names[1]}`);
    if (names[2] !== 'openai-compat') throw new Error(`t3: expected openai-compat, got ${names[2]}`);
    if (names[3] !== 'claude') throw new Error(`t4 (no provider): expected claude default, got ${names[3]}`);
    if (names[4] !== 'claude') throw new Error(`t5: expected claude, got ${names[4]}`);

    // Verify registry still intact after routing
    if (registry.list().length !== 3) throw new Error('Registry corrupted after routing');

    passed.push('mix-coexist');
  } catch (err) {
    failed.push(`mix-coexist: ${err.message}`);
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

// ─── Main ────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSmoke()
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
