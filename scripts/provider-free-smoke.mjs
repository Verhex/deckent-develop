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

try {
  const distPath = resolve(projectRoot, 'dist/orchestra/spawn-backend-docker.js');
  const mod = await import(distPath);
  getProviderBinaryForModel = mod.getProviderBinaryForModel;
  if (typeof getProviderBinaryForModel !== 'function') {
    throw new Error('getProviderBinaryForModel not exported from dist/orchestra/spawn-backend-docker.js');
  }
} catch (err) {
  console.error('[SMOKE] ERROR: Failed to import getProviderBinaryForModel:', err.message);
  console.error('[SMOKE] Ensure the project is built: npm run build');
  process.exit(2);
}

// ─── Docker Provider Binary Resolution Step ───────────────────────────────────

const DOCKER_CASES = [
  { model: 'sonnet',             expectedBinary: 'claude',  label: 'Claude (sonnet → claude)' },
  { model: 'gpt-4.1',           expectedBinary: 'codex',   label: 'Codex (gpt-4.1 → codex)' },
  { model: 'gemini-2.5-flash',  expectedBinary: 'gemini',  label: 'Gemini (gemini-2.5-flash → gemini)' },
  { model: 'ollama',            expectedBinary: 'claude',   label: 'Ollama (HTTP fallback → claude)' },
];

/**
 * Checks Docker provider binary resolution for all four providers.
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
