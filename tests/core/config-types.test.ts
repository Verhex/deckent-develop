import { describe, it, expect } from 'vitest';
import type { DeckentConfig, ResolvedConfig } from '../../src/core/config-types.js';

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
