#!/usr/bin/env node
/**
 * Provider-Free Smoke Test — Sprint 202/203
 *
 * Validates provider binary resolution across all backends without spawning
 * real workers. Tests routing logic for subprocess/tmux and Docker backends.
 *
 * Exit codes:
 *   0 — all steps passed
 *   1 — one or more steps failed
 *   2 — import/setup error
 *
 * Usage:
 *   node scripts/provider-free-smoke.mjs
 */

import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// ─── Load getProviderBinaryForModel from dist ─────────────────────────────────

let getProviderBinaryForModel;
let modelRegistry;

try {
  const backendPath = resolve(projectRoot, 'dist/orchestra/spawn-backend-docker.js');
  const registryPath = resolve(projectRoot, 'dist/core/model-registry.js');
  const [backendModule, registryModule] = await Promise.all([
    import(backendPath),
    import(registryPath),
  ]);
  getProviderBinaryForModel = backendModule.getProviderBinaryForModel;
  modelRegistry = registryModule.modelRegistry;
  if (typeof getProviderBinaryForModel !== 'function') {
    throw new Error('getProviderBinaryForModel not exported from dist/orchestra/spawn-backend-docker.js');
  }
  if (typeof modelRegistry?.getByProviderAndTier !== 'function') {
    throw new Error('modelRegistry not exported from dist/core/model-registry.js');
  }
} catch (err) {
  console.error('[SMOKE] ERROR: Failed to import rebuilt provider authority:', err.message);
  console.error('[SMOKE] Ensure the project is built: npm run build');
  process.exit(2);
}

// ─── Docker Provider Binary Resolution Step ───────────────────────────────────

function canonicalModel(provider, tier) {
  const definition = modelRegistry.getByProviderAndTier(provider, tier);
  if (!definition || definition.id !== definition.apiId) {
    throw new Error(`No canonical ${provider}/${tier} model is available in the rebuilt registry`);
  }
  return definition.id;
}

const DOCKER_CASES = [
  {
    model: canonicalModel('claude', 'standard'),
    expectedBinary: 'claude',
    label: 'Claude canonical standard model',
  },
  {
    model: canonicalModel('codex', 'standard'),
    expectedBinary: 'codex',
    label: 'Codex canonical standard model',
  },
  {
    model: canonicalModel('gemini', 'standard'),
    expectedBinary: 'gemini',
    label: 'Gemini canonical standard model',
  },
];

/**
 * Checks Docker CLI binary resolution for the three CLI providers. Host API
 * and local adapter providers are asserted as fail-loud in the hermetic tests.
 * Returns an array of check results.
 */
export function checkDockerProviderBinaryResolution() {
  return DOCKER_CASES.map(({ model, expectedBinary, label }) => {
    try {
      const binary = getProviderBinaryForModel(model);
      const passed = binary === expectedBinary;
      return { label, model, expectedBinary, actualBinary: binary, passed };
    } catch (err) {
      return { label, model, expectedBinary, actualBinary: null, passed: false, error: err.message };
    }
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = checkDockerProviderBinaryResolution();
let allPassed = true;

console.log('\n[SMOKE] Docker Provider Binary Resolution:');
for (const r of results) {
  const status = r.passed ? 'PASS' : 'FAIL';
  const detail = r.passed
    ? `${r.model} → ${r.actualBinary}`
    : `${r.model} → expected ${r.expectedBinary}, got ${r.actualBinary ?? 'ERROR: ' + r.error}`;
  console.log(`  [${status}] ${r.label}: ${detail}`);
  if (!r.passed) allPassed = false;
}

if (allPassed) {
  console.log('\n[SMOKE] Docker-path: ALL PASS\n');
  process.exit(0);
} else {
  console.log('\n[SMOKE] Docker-path: FAIL — see above\n');
  process.exit(1);
}
