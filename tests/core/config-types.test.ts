import { describe, it, expect } from 'vitest';
import type { DeckentConfig, ResolvedConfig, NervousSystemConfig } from '../../src/core/config-types.js';
import type { NervousSystemConfigV1 } from '../../src/core/nervous-types.js';
import { validateConfig, createDefaultConfig, ConfigValidationError } from '../../src/core/config.js';

// ─── DeckentConfig: ai_planner_timeout ───────────────────────────────────────

describe('DeckentConfig — ai_planner_timeout', () => {
  it('accepts ai_planner_timeout as optional number', () => {
    const config: Partial<DeckentConfig> = {
      ai_planner_timeout: 120_000,
    };
    expect(config.ai_planner_timeout).toBe(120_000);
  });

  it('ai_planner_timeout is optional (undefined when not set)', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.ai_planner_timeout).toBeUndefined();
  });

  it('ai_planner_timeout can represent the default 60000ms', () => {
    const config: Partial<DeckentConfig> = {
      ai_planner_timeout: 60_000,
    };
    expect(config.ai_planner_timeout).toBe(60_000);
  });

  it('caller can derive effective timeout: config.ai_planner_timeout ?? 60000', () => {
    const withTimeout: Partial<DeckentConfig> = { ai_planner_timeout: 90_000 };
    const withoutTimeout: Partial<DeckentConfig> = {};

    expect(withTimeout.ai_planner_timeout ?? 60_000).toBe(90_000);
    expect(withoutTimeout.ai_planner_timeout ?? 60_000).toBe(60_000);
  });
});

// ─── ResolvedConfig: ai_planner_timeout ─────────────────────────────────────

describe('ResolvedConfig — ai_planner_timeout', () => {
  it('ResolvedConfig accepts ai_planner_timeout', () => {
    const resolved: Partial<ResolvedConfig> = {
      ai_planner_timeout: 30_000,
    };
    expect(resolved.ai_planner_timeout).toBe(30_000);
  });

  it('ai_planner_timeout is optional in ResolvedConfig', () => {
    const resolved: Partial<ResolvedConfig> = {};
    expect(resolved.ai_planner_timeout).toBeUndefined();
  });
});

// ─── NervousSystemConfig (V2) — single source of truth ──────────────────────
// Sprint 323 (323-010) V1→V2 migration: NervousSystemConfig (V2) is the canonical
// schema; NervousSystemConfigV1 (nervous-types.ts) is a backward-compat view DERIVED
// from it. These tests pin that single-source convergence.

/** A complete, valid V2 NervousSystemConfig literal (every required field present). */
function makeV2Config(): NervousSystemConfig {
  const det = { enabled: false } as const;
  return {
    enabled: true,
    mode: 'balanced',
    approve_timeout_ms: 10_000,
    worker_respawn: false,
    actionOverrides: { COMMIT_PUSH: 'approve' },
    safety_floor: {
      locked_actions: ['KILL_LIVE_SPRINT', 'DESTRUCTIVE_GIT'],
      cost_threshold_usd: 5,
      bypass_allowed: false,
    },
    notifications: {
      channels: { mcp: true, cli: true, file: true, desktop: false },
      throttle_ms: 300_000,
      group_info_window_ms: 60_000,
      severity_min: 'info',
      quiet_hours: { start: '22:00', end: '08:00', timezone: 'Europe/Istanbul' },
      cross_channel_dedup: true,
    },
    detectors: {
      stale_worker: det,
      scope_collision: det,
      debt_trend: det,
      agent_routing: det,
      directives_protection: det,
      dead_event_stream: det,
      cost_threshold: det,
      prompt_quality: det,
      worker_output_variance: det,
      self_modifying_warner: det,
      task_mode_idle: det,
      build_failure_recurrence: det,
      token_spike: det,
      agent_routing_anomaly: det,
      scope_collision_rate: det,
      notification_delivery_health: det,
    },
    history_retention_days: 30,
  };
}

describe('NervousSystemConfig (V2) — canonical schema', () => {
  it('a complete V2 config literal satisfies the interface', () => {
    const cfg = makeV2Config();
    expect(cfg.mode).toBe('balanced');
    expect(cfg.safety_floor.bypass_allowed).toBe(false);
    expect(cfg.notifications.channels.cli).toBe(true);
    expect(cfg.notifications.quiet_hours.timezone).toBe('Europe/Istanbul');
    expect(Object.keys(cfg.detectors)).toHaveLength(16);
    expect(cfg.history_retention_days).toBe(30);
  });

  it('is the type of DeckentConfig.nervous_system (single source of truth)', () => {
    const cfg: Partial<DeckentConfig> = { nervous_system: makeV2Config() };
    expect(cfg.nervous_system?.notifications.throttle_ms).toBe(300_000);
  });

  it('ResolvedConfig.nervous_system uses the same V2 type', () => {
    const resolved: Partial<ResolvedConfig> = { nervous_system: makeV2Config() };
    expect(resolved.nervous_system?.enabled).toBe(true);
  });

  it('NervousSystemConfigV1 is a derived VIEW of V2 — a V2 config is assignable to it', () => {
    // Compile-time proof of single-source derivation: the full V2 object is assignable to the
    // narrow V1 runtime view, because the view only Picks/Partials V2's shared fields (plus two
    // optional legacy aliases). If V1 ever diverged into an independent schema, this would fail tsc.
    const v2 = makeV2Config();
    const view: NervousSystemConfigV1 = v2;
    expect(view.mode).toBe('balanced');
    expect(view.enabled).toBe(true);
    expect(view.actionOverrides?.['COMMIT_PUSH']).toBe('approve');
    expect(view.approve_timeout_ms).toBe(10_000);
    // Legacy camelCase aliases are absent on a real V2 config (→ undefined): the exact runtime
    // behavior the readers rely on (fall back to defaults). Migration must preserve this.
    expect(view.quietHours).toBeUndefined();
    expect(view.throttleWindowMs).toBeUndefined();
  });
});

// ─── T5: retry_transient_failures ────────────────────────────────────────────

describe('DeckentConfig — retry_transient_failures (T5)', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.retry_transient_failures).toBeUndefined();
  });

  it('accepts true', () => {
    const config: Partial<DeckentConfig> = { retry_transient_failures: true };
    expect(config.retry_transient_failures).toBe(true);
  });

  it('accepts false', () => {
    const config: Partial<DeckentConfig> = { retry_transient_failures: false };
    expect(config.retry_transient_failures).toBe(false);
  });

  it('ResolvedConfig accepts retry_transient_failures', () => {
    const resolved: Partial<ResolvedConfig> = { retry_transient_failures: true };
    expect(resolved.retry_transient_failures).toBe(true);
  });

  it('validateConfig throws when retry_transient_failures is not a boolean', () => {
    const config = createDefaultConfig();
    (config as Record<string, unknown>)['retry_transient_failures'] = 'yes';
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      expect((e as ConfigValidationError).errors).toContainEqual(
        expect.stringContaining('retry_transient_failures must be a boolean'),
      );
    }
  });

  it('validateConfig accepts true without errors', () => {
    const config = createDefaultConfig();
    config.retry_transient_failures = true;
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('validateConfig accepts false without errors', () => {
    const config = createDefaultConfig();
    config.retry_transient_failures = false;
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('validateConfig accepts absent (undefined) without errors (default-off)', () => {
    const config = createDefaultConfig();
    expect(config.retry_transient_failures).toBeUndefined();
    expect(() => validateConfig(config)).not.toThrow();
  });
});

// ─── T6: routing.skill_agent_affinity + routing.agent_cache ──────────────────

describe('DeckentConfig — routing (T6)', () => {
  it('routing is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.routing).toBeUndefined();
  });

  it('accepts routing with skill_agent_affinity: true', () => {
    const config: Partial<DeckentConfig> = { routing: { skill_agent_affinity: true } };
    expect(config.routing?.skill_agent_affinity).toBe(true);
  });

  it('accepts routing with agent_cache: false', () => {
    const config: Partial<DeckentConfig> = { routing: { agent_cache: false } };
    expect(config.routing?.agent_cache).toBe(false);
  });

  it('accepts routing with both flags set', () => {
    const config: Partial<DeckentConfig> = {
      routing: { skill_agent_affinity: false, agent_cache: true },
    };
    expect(config.routing?.skill_agent_affinity).toBe(false);
    expect(config.routing?.agent_cache).toBe(true);
  });

  it('accepts routing as empty object (all flags default-off)', () => {
    const config: Partial<DeckentConfig> = { routing: {} };
    expect(config.routing?.skill_agent_affinity).toBeUndefined();
    expect(config.routing?.agent_cache).toBeUndefined();
  });

  it('ResolvedConfig accepts routing block', () => {
    const resolved: Partial<ResolvedConfig> = { routing: { skill_agent_affinity: true } };
    expect(resolved.routing?.skill_agent_affinity).toBe(true);
  });

  it('validateConfig throws when routing is not an object', () => {
    const config = createDefaultConfig();
    (config as Record<string, unknown>)['routing'] = 42;
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      expect((e as ConfigValidationError).errors).toContainEqual(
        expect.stringContaining('routing must be an object'),
      );
    }
  });

  it('validateConfig throws when routing.skill_agent_affinity is not a boolean', () => {
    const config = createDefaultConfig();
    (config as Record<string, unknown>)['routing'] = { skill_agent_affinity: 'yes' };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      expect((e as ConfigValidationError).errors).toContainEqual(
        expect.stringContaining('routing.skill_agent_affinity must be a boolean'),
      );
    }
  });

  it('validateConfig throws when routing.agent_cache is not a boolean', () => {
    const config = createDefaultConfig();
    (config as Record<string, unknown>)['routing'] = { agent_cache: 1 };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      expect((e as ConfigValidationError).errors).toContainEqual(
        expect.stringContaining('routing.agent_cache must be a boolean'),
      );
    }
  });

  it('validateConfig accepts valid routing block without errors', () => {
    const config = createDefaultConfig();
    config.routing = { skill_agent_affinity: true, agent_cache: false };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('validateConfig accepts absent routing without errors (default-off)', () => {
    const config = createDefaultConfig();
    expect(config.routing).toBeUndefined();
    expect(() => validateConfig(config)).not.toThrow();
  });
});
