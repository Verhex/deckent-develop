// tests/core/trace-config-types.test.ts
//
// Sprint 356, Task 356-012 TRACE-CONFIG-TYPES — type registration for the
// "night-landed" flags: training_trace, live_trace, repl_surface(+approvals/
// bg_turns), tool_surface, deck_broker, routing.kindAffinity/languagePenalty,
// approval.api_decide, rollback. These blocks already have a real consumer on
// disk (duck-typed or caller-resolved) but had no typed home on DeckentConfig/
// ResolvedConfig before this task.
//
// Scope of this test file: type-level acceptance + confirming validateConfig's
// pre-existing unknown-shape tolerance is unchanged (no new validation logic
// was added anywhere — that would be a behavior change, forbidden by this
// task's nogo). Hermetic: no gitignored state, no spawnSync, fresh-checkout-safe.

import { describe, it, expect } from 'vitest';
import { validateConfig, createDefaultConfig } from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig } from '../../src/core/config-types.js';

// ─── training_trace ──────────────────────────────────────────────────────────

describe('DeckentConfig — training_trace', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.training_trace).toBeUndefined();
  });

  it('accepts { enabled: true }', () => {
    const config: Partial<DeckentConfig> = { training_trace: { enabled: true } };
    expect(config.training_trace?.enabled).toBe(true);
  });

  it('accepts an empty object (default-off)', () => {
    const config: Partial<DeckentConfig> = { training_trace: {} };
    expect(config.training_trace?.enabled).toBeUndefined();
  });

  it('ResolvedConfig accepts training_trace', () => {
    const resolved: Partial<ResolvedConfig> = { training_trace: { enabled: true } };
    expect(resolved.training_trace?.enabled).toBe(true);
  });
});

// ─── live_trace ──────────────────────────────────────────────────────────────

describe('DeckentConfig — live_trace', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.live_trace).toBeUndefined();
  });

  it('accepts { enabled: true }', () => {
    const config: Partial<DeckentConfig> = { live_trace: { enabled: true } };
    expect(config.live_trace?.enabled).toBe(true);
  });

  it('ResolvedConfig accepts live_trace', () => {
    const resolved: Partial<ResolvedConfig> = { live_trace: { enabled: false } };
    expect(resolved.live_trace?.enabled).toBe(false);
  });
});

// ─── tool_surface ─────────────────────────────────────────────────────────────

describe('DeckentConfig — tool_surface', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.tool_surface).toBeUndefined();
  });

  it('accepts { enabled: true, riskThreshold }', () => {
    const config: Partial<DeckentConfig> = {
      tool_surface: { enabled: true, riskThreshold: 'moderate' },
    };
    expect(config.tool_surface?.enabled).toBe(true);
    expect(config.tool_surface?.riskThreshold).toBe('moderate');
  });

  it('accepts every ToolRiskLevel value', () => {
    for (const level of ['safe', 'moderate', 'destructive'] as const) {
      const config: Partial<DeckentConfig> = { tool_surface: { riskThreshold: level } };
      expect(config.tool_surface?.riskThreshold).toBe(level);
    }
  });

  it('ResolvedConfig accepts tool_surface', () => {
    const resolved: Partial<ResolvedConfig> = { tool_surface: { enabled: true } };
    expect(resolved.tool_surface?.enabled).toBe(true);
  });
});

// ─── repl_surface (+ approvals / bg_turns) ────────────────────────────────────

describe('DeckentConfig — repl_surface', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.repl_surface).toBeUndefined();
  });

  it('accepts enabled independently of approvals and bg_turns', () => {
    const config: Partial<DeckentConfig> = { repl_surface: { enabled: true } };
    expect(config.repl_surface?.enabled).toBe(true);
    expect(config.repl_surface?.approvals).toBeUndefined();
    expect(config.repl_surface?.bg_turns).toBeUndefined();
  });

  it('accepts approvals: true while enabled is unset (independent sub-flag, 355-011)', () => {
    const config: Partial<DeckentConfig> = { repl_surface: { approvals: true } };
    expect(config.repl_surface?.enabled).toBeUndefined();
    expect(config.repl_surface?.approvals).toBe(true);
  });

  it('accepts bg_turns: true (reserved sub-flag)', () => {
    const config: Partial<DeckentConfig> = { repl_surface: { bg_turns: true } };
    expect(config.repl_surface?.bg_turns).toBe(true);
  });

  it('accepts all three flags set together', () => {
    const config: Partial<DeckentConfig> = {
      repl_surface: { enabled: true, approvals: true, bg_turns: false },
    };
    expect(config.repl_surface).toEqual({ enabled: true, approvals: true, bg_turns: false });
  });

  it('ResolvedConfig accepts repl_surface', () => {
    const resolved: Partial<ResolvedConfig> = { repl_surface: { approvals: true } };
    expect(resolved.repl_surface?.approvals).toBe(true);
  });
});

// ─── deck_broker ──────────────────────────────────────────────────────────────

describe('DeckentConfig — deck_broker', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.deck_broker).toBeUndefined();
  });

  it('accepts { enabled: true }', () => {
    const config: Partial<DeckentConfig> = { deck_broker: { enabled: true } };
    expect(config.deck_broker?.enabled).toBe(true);
  });

  it('ResolvedConfig accepts deck_broker', () => {
    const resolved: Partial<ResolvedConfig> = { deck_broker: { enabled: true } };
    expect(resolved.deck_broker?.enabled).toBe(true);
  });
});

// ─── rollback (distinct from legacy rollback_policy) ──────────────────────────

describe('DeckentConfig — rollback', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.rollback).toBeUndefined();
  });

  it('accepts { enabled: true } independently of rollback_policy', () => {
    const config: Partial<DeckentConfig> = {
      rollback_policy: 'never',
      rollback: { enabled: true },
    };
    expect(config.rollback_policy).toBe('never');
    expect(config.rollback?.enabled).toBe(true);
  });

  it('ResolvedConfig accepts rollback', () => {
    const resolved: Partial<ResolvedConfig> = { rollback: { enabled: true } };
    expect(resolved.rollback?.enabled).toBe(true);
  });
});

// ─── routing.kindAffinity / routing.languagePenalty ───────────────────────────

describe('DeckentConfig — routing.kindAffinity / routing.languagePenalty', () => {
  it('accepts kindAffinity alongside the existing skill_agent_affinity/agent_cache flags', () => {
    const config: Partial<DeckentConfig> = {
      routing: { skill_agent_affinity: true, agent_cache: false, kindAffinity: true },
    };
    expect(config.routing?.skill_agent_affinity).toBe(true);
    expect(config.routing?.kindAffinity).toBe(true);
  });

  it('accepts languagePenalty', () => {
    const config: Partial<DeckentConfig> = { routing: { languagePenalty: true } };
    expect(config.routing?.languagePenalty).toBe(true);
  });

  it('kindAffinity/languagePenalty are undefined on an empty routing block (default-off)', () => {
    const config: Partial<DeckentConfig> = { routing: {} };
    expect(config.routing?.kindAffinity).toBeUndefined();
    expect(config.routing?.languagePenalty).toBeUndefined();
  });

  it('ResolvedConfig.routing is the same type as DeckentConfig.routing (type-alias passthrough)', () => {
    const resolved: Partial<ResolvedConfig> = {
      routing: { kindAffinity: true, languagePenalty: true },
    };
    expect(resolved.routing?.kindAffinity).toBe(true);
    expect(resolved.routing?.languagePenalty).toBe(true);
  });
});

// ─── approval.api_decide ───────────────────────────────────────────────────────

describe('DeckentConfig — approval.api_decide', () => {
  it('is undefined when the approval block is absent', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.approval?.api_decide).toBeUndefined();
  });

  it('accepts api_decide alongside the existing rules/gate_enabled/relay_enabled fields', () => {
    const config: Partial<DeckentConfig> = {
      approval: { gate_enabled: true, relay_enabled: false, api_decide: true },
    };
    expect(config.approval?.gate_enabled).toBe(true);
    expect(config.approval?.api_decide).toBe(true);
  });

  it('accepts api_decide with no other approval fields set', () => {
    const config: Partial<DeckentConfig> = { approval: { api_decide: true } };
    expect(config.approval?.api_decide).toBe(true);
    expect(config.approval?.rules).toBeUndefined();
  });
});

// ─── validateConfig — unknown-shape tolerance is unchanged ────────────────────
// No validation logic was added for any of the new blocks (only types) — this
// task's nogo forbids changing validate behavior. These new blocks must be
// silently tolerated exactly like they were before this task landed the types
// (validateConfig has no allowlist of top-level keys and never rejects an
// untyped/extra sub-field).

describe('validateConfig — new night-landed blocks are tolerated (no behavior change)', () => {
  it('accepts a config with every new block populated, without throwing', () => {
    const config = createDefaultConfig();
    config.training_trace = { enabled: true };
    config.live_trace = { enabled: true };
    config.tool_surface = { enabled: true, riskThreshold: 'moderate' };
    config.repl_surface = { enabled: true, approvals: true, bg_turns: true };
    config.deck_broker = { enabled: true };
    config.rollback = { enabled: true };
    config.routing = { kindAffinity: true, languagePenalty: true };
    config.approval = { api_decide: true };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts a config with an unrecognized sub-field inside a new block, without throwing', () => {
    // Mirrors the pre-existing tolerance for e.g. `approval.rules` (never
    // type-checked here) — an extra/unknown key inside these new blocks must
    // not become a hard validation error, since none of them registered any
    // validateConfig rule.
    const config = createDefaultConfig();
    (config as unknown as { training_trace: Record<string, unknown> }).training_trace = {
      enabled: true,
      unknownField: 'anything',
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts the default config (none of the new blocks set) without throwing', () => {
    const config = createDefaultConfig();
    expect(config.training_trace).toBeUndefined();
    expect(config.live_trace).toBeUndefined();
    expect(config.tool_surface).toBeUndefined();
    expect(config.repl_surface).toBeUndefined();
    expect(config.deck_broker).toBeUndefined();
    expect(config.rollback).toBeUndefined();
    expect(() => validateConfig(config)).not.toThrow();
  });
});
