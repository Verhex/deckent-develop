// ─── CFG-APR-WIRE — approval config block tests (sprint-355 task 355-013) ───
// Hermetic tests for the `approval` config block: validateConfig shallow
// gate/relay flag checks, resolveApprovalConfig (the single authority turning
// raw approval.rules JSON into a validated ApprovalPolicyRule[]), and
// loadConfig/validatePartialConfig integration. No gitignored state read; no
// spawnSync; runs on a fresh checkout.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateConfig,
  ConfigValidationError,
  resolveApprovalConfig,
  validatePartialConfig,
  loadConfig,
  clearConfigCache,
} from '../../src/core/config.js';
import { SAFE_DEFAULT_APPROVAL_RULES } from '../../src/core/approval-rules-load.js';
import type { DeckentConfig } from '../../src/core/config-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function minimalConfig(overrides: Partial<DeckentConfig> = {}): DeckentConfig {
  return {
    mode: 'balanced',
    modes: {},
    ...overrides,
  } as DeckentConfig;
}

/** Collect only approval-related validation errors without rethrowing unrelated ones. */
function collectApprovalErrors(config: DeckentConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (err: unknown) {
    if (err instanceof ConfigValidationError) {
      return err.errors.filter((e) => e.includes('approval'));
    }
    throw err;
  }
}

const dirs: string[] = [];
function project(cfg: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), 'cfg-apr-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  writeFileSync(join(d, '.deckent', 'config.json'), JSON.stringify({ mode: 'balanced', ...cfg }));
  return d;
}
afterEach(() => {
  clearConfigCache();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

// ─── validateConfig — shallow gate/relay flag checks ─────────────────────────

describe('approval config block — validateConfig', () => {
  it('absent block produces no approval errors (default off)', () => {
    expect(collectApprovalErrors(minimalConfig())).toHaveLength(0);
  });

  it('accepts an empty approval object', () => {
    expect(collectApprovalErrors(minimalConfig({ approval: {} }))).toHaveLength(0);
  });

  it('accepts gate_enabled / relay_enabled set to valid booleans', () => {
    expect(
      collectApprovalErrors(
        minimalConfig({ approval: { gate_enabled: true, relay_enabled: false } }),
      ),
    ).toHaveLength(0);
  });

  it('accepts a well-formed rules array alongside the flags', () => {
    expect(
      collectApprovalErrors(
        minimalConfig({
          approval: {
            gate_enabled: true,
            relay_enabled: true,
            rules: [{ match: { risk: 'high' }, action: 'require-approval' }],
          },
        }),
      ),
    ).toHaveLength(0);
  });

  it('returns error when gate_enabled is a non-boolean value', () => {
    const errors = collectApprovalErrors(
      minimalConfig({ approval: { gate_enabled: 'yes' as unknown as boolean } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/approval\.gate_enabled/);
  });

  it('returns error when relay_enabled is a non-boolean value', () => {
    const errors = collectApprovalErrors(
      minimalConfig({ approval: { relay_enabled: 1 as unknown as boolean } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/approval\.relay_enabled/);
  });

  it('never throws for a malformed rules array — rule validation is NOT this layer', () => {
    // approval.rules validation is fully owned by loadApprovalRules (fail-soft,
    // never throws). validateConfig must not duplicate/tighten that contract.
    expect(
      collectApprovalErrors(
        minimalConfig({
          approval: { rules: [{ match: { risk: 'bogus-risk' }, action: 'bogus-action' }] as never },
        }),
      ),
    ).toHaveLength(0);
  });
});

// ─── resolveApprovalConfig — single authority: raw JSON -> validated rules ──

describe('resolveApprovalConfig', () => {
  it('absent approval -> safe default rules, gate/relay both false', () => {
    const resolved = resolveApprovalConfig({});
    expect(resolved.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(resolved.gate_enabled).toBe(false);
    expect(resolved.relay_enabled).toBe(false);
  });

  it('passes through a valid custom rule set unchanged', () => {
    const resolved = resolveApprovalConfig({
      approval: {
        rules: [{ match: { scope: 'credential' }, action: 'deny' }],
      },
    });
    expect(resolved.rules).toEqual([{ match: { scope: 'credential' }, action: 'deny' }]);
  });

  it('resolves gate_enabled / relay_enabled from config, defaulting absent to false', () => {
    const resolved = resolveApprovalConfig({ approval: { gate_enabled: true } });
    expect(resolved.gate_enabled).toBe(true);
    expect(resolved.relay_enabled).toBe(false);
  });

  it('a malformed rule entry is skipped (fail-soft) — never throws, never blocks', () => {
    expect(() =>
      resolveApprovalConfig({
        approval: { rules: [{ match: {}, action: 'notify' }, { match: {}, action: 'bogus-action' }] as never },
      }),
    ).not.toThrow();
    const resolved = resolveApprovalConfig({
      approval: { rules: [{ match: {}, action: 'notify' }, { match: {}, action: 'bogus-action' }] as never },
    });
    expect(resolved.rules).toEqual([{ match: {}, action: 'notify' }]);
  });

  it('an all-invalid rules array resolves to an empty list, NOT silently substituted defaults', () => {
    const resolved = resolveApprovalConfig({
      approval: { rules: [{ match: {}, action: 'bogus-action' }] as never },
    });
    expect(resolved.rules).toEqual([]);
    expect(resolved.rules).not.toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });
});

// ─── validatePartialConfig compatibility ─────────────────────────────────────

describe('validatePartialConfig — approval compatibility', () => {
  it('accepts a valid approval partial', () => {
    expect(() =>
      validatePartialConfig({
        approval: { gate_enabled: true, rules: [{ match: { risk: 'low' }, action: 'auto-approve' }] },
      }),
    ).not.toThrow();
  });

  it('rejects an invalid gate_enabled type', () => {
    expect(() =>
      validatePartialConfig({ approval: { gate_enabled: 'nope' as unknown as boolean } }),
    ).toThrow(ConfigValidationError);
  });
});

// ─── loadConfig — hermetic tmpdir fixtures (goCriteria: valid/broken fixtures) ──

describe('loadConfig — approval config fixtures', () => {
  it('valid config.json: rules + gate/relay flags resolve correctly', async () => {
    const d = project({
      approval: {
        gate_enabled: true,
        relay_enabled: true,
        rules: [
          { match: { scope: 'network' }, action: 'deny' },
          { match: { risk: 'high' }, action: 'require-approval', timeoutMs: 30_000 },
        ],
      },
    });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.gate_enabled).toBe(true);
    expect(cfg.approval?.relay_enabled).toBe(true);
    expect(cfg.approval?.rules).toEqual([
      { match: { scope: 'network' }, action: 'deny' },
      { match: { risk: 'high' }, action: 'require-approval', timeoutMs: 30_000 },
    ]);
  });

  it('absent approval block: default-safe (SAFE_DEFAULT_APPROVAL_RULES, gate/relay off)', async () => {
    const d = project({});
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
    expect(cfg.approval?.gate_enabled).toBe(false);
    expect(cfg.approval?.relay_enabled).toBe(false);
  });

  it('broken config.json (malformed rule entry): loadConfig does NOT throw — bad entry dropped', async () => {
    const d = project({
      approval: {
        rules: [
          { match: { scope: 'network' }, action: 'deny' },
          { match: { risk: 'not-a-real-risk-tier' }, action: 'deny' },
        ],
      },
    });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.rules).toEqual([{ match: { scope: 'network' }, action: 'deny' }]);
  });

  it('broken config.json (approval.rules not an array): loadConfig does NOT throw — safe defaults used', async () => {
    const d = project({ approval: { rules: 'not-an-array' } });
    const cfg = await loadConfig(d, { force: true });
    expect(cfg.approval?.rules).toEqual(SAFE_DEFAULT_APPROVAL_RULES);
  });
});
