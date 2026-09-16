#!/usr/bin/env node
// auth-mode-resolution-smoke.mjs — validates docker env-forwarding auth-aware logic.
//
// Tests ANTHROPIC_API_KEY is NOT forwarded on subscription, IS forwarded on api.
// No real Docker containers — arg-build assertion only.
//
// Run directly: node scripts/auth-mode-resolution-smoke.mjs → PASS or FAIL
// Import in tests: import { buildDockerEnvArgs, resolveUseApiOnly, runSmoke } from ...

import { fileURLToPath } from 'node:url';

// ─── Core helpers ─────────────────────────────────────────────────────────────

/**
 * Determine useApiOnly flag from an auth_mode config value.
 * Mirrors spawn-backend-docker.ts readTaskAuthMode logic (Sprint 214 T-214-001).
 *
 * @param {string|undefined} authMode - 'api' | 'subscription' | undefined
 * @returns {boolean} true only when authMode === 'api'
 */
export function resolveUseApiOnly(authMode) {
  return authMode === 'api';
}

/**
 * Build the env-forwarding portion of docker run args.
 * Mirrors spawn-backend-docker.ts:560-571 (Sprint 214 T-214-001 auth-aware fix).
 *
 * Rules:
 *  - ANTHROPIC_API_KEY: forwarded ONLY when useApiOnly===true (api mode)
 *  - OPENAI_API_KEY:    forwarded ONLY when providerBinary !== 'claude'
 *  - GOOGLE_API_KEY:    forwarded ONLY when providerBinary !== 'claude'
 *  - DECKENT_DEBUG:     always forwarded when set
 *
 * @param {object} opts
 * @param {boolean} opts.useApiOnly - true when task.authMode === 'api'
 * @param {string}  opts.providerBinary - 'claude' | 'codex' | 'gemini' | ...
 * @param {object}  opts.env - environment variables to check (default: process.env)
 * @returns {string[]} flat list of '-e', 'KEY=VALUE' pairs ready for docker run
 */
export function buildDockerEnvArgs({ useApiOnly, providerBinary = 'claude', env = process.env }) {
  const args = [];

  if (useApiOnly && env.ANTHROPIC_API_KEY) {
    args.push('-e', `ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}`);
  }
  if (providerBinary !== 'claude' && env.OPENAI_API_KEY) {
    args.push('-e', `OPENAI_API_KEY=${env.OPENAI_API_KEY}`);
  }
  if (providerBinary !== 'claude' && env.GOOGLE_API_KEY) {
    args.push('-e', `GOOGLE_API_KEY=${env.GOOGLE_API_KEY}`);
  }
  if (env.DECKENT_DEBUG) {
    args.push('-e', `DECKENT_DEBUG=${env.DECKENT_DEBUG}`);
  }

  return args;
}

// ─── Smoke scenarios ──────────────────────────────────────────────────────────

/**
 * Run 4 auth-mode resolution scenarios and return pass/fail report.
 * No real Docker containers or API calls.
 *
 * @returns {Promise<{pass: boolean, reason?: string, scenarios: string[]}>}
 */
export async function runSmoke() {
  const passed = [];
  const failed = [];

  // Scenario 1: subscription + ANTHROPIC_API_KEY set → NOT in docker args
  try {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test-sub-111' };
    const useApiOnly = resolveUseApiOnly('subscription');
    const args = buildDockerEnvArgs({ useApiOnly, providerBinary: 'claude', env });
    if (args.some((a) => a.includes('ANTHROPIC_API_KEY'))) {
      throw new Error('ANTHROPIC_API_KEY leaked into subscription mode docker args');
    }
    passed.push('subscription-strips-anthropic-key');
  } catch (err) {
    failed.push(`subscription-strips-anthropic-key: ${err.message}`);
  }

  // Scenario 2: api mode + ANTHROPIC_API_KEY set → IS in docker args
  try {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test-api-222' };
    const useApiOnly = resolveUseApiOnly('api');
    const args = buildDockerEnvArgs({ useApiOnly, providerBinary: 'claude', env });
    if (!args.some((a) => a.includes('ANTHROPIC_API_KEY'))) {
      throw new Error('ANTHROPIC_API_KEY missing from api-mode docker args');
    }
    const keyValue = args[args.indexOf('-e', args.indexOf('ANTHROPIC_API_KEY') - 1) + 1];
    if (!keyValue || !keyValue.includes('sk-ant-test-api-222')) {
      throw new Error('ANTHROPIC_API_KEY value not forwarded correctly');
    }
    passed.push('api-mode-includes-anthropic-key');
  } catch (err) {
    failed.push(`api-mode-includes-anthropic-key: ${err.message}`);
  }

  // Scenario 3: default (undefined) auth_mode → treated as subscription → NOT in args
  try {
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test-default-333' };
    const useApiOnly = resolveUseApiOnly(undefined);
    const args = buildDockerEnvArgs({ useApiOnly, providerBinary: 'claude', env });
    if (args.some((a) => a.includes('ANTHROPIC_API_KEY'))) {
      throw new Error('ANTHROPIC_API_KEY leaked into default-auth (undefined) docker args');
    }
    passed.push('default-auth-is-subscription');
  } catch (err) {
    failed.push(`default-auth-is-subscription: ${err.message}`);
  }

  // Scenario 4: codex provider + OPENAI_API_KEY → forwarded; ANTHROPIC not forwarded
  try {
    const env = {
      OPENAI_API_KEY: 'sk-openai-test-444',
      ANTHROPIC_API_KEY: 'sk-ant-should-not-appear',
    };
    const useApiOnly = resolveUseApiOnly('subscription');
    const args = buildDockerEnvArgs({ useApiOnly, providerBinary: 'codex', env });
    if (!args.some((a) => a.includes('OPENAI_API_KEY'))) {
      throw new Error('OPENAI_API_KEY missing from codex provider docker args');
    }
    if (args.some((a) => a.includes('ANTHROPIC_API_KEY'))) {
      throw new Error('ANTHROPIC_API_KEY leaked into codex provider docker args');
    }
    passed.push('codex-forwards-openai-strips-anthropic');
  } catch (err) {
    failed.push(`codex-forwards-openai-strips-anthropic: ${err.message}`);
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
