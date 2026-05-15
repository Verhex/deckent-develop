import { describe, it, expect } from 'vitest';
import { createDefaultConfig, mergeConfigs } from '../../src/core/config.js';
import type { ResolvedConfig, DeckentConfig } from '../../src/core/types.js';

/**
 * Sprint 169 Task 9 (H5) — production GA anchor for the dependency pipeline
 * default flip. ADR-045 (Wave-Based Execution Semantics) is the governing
 * decision; this suite locks the default and the user-override contract.
 *
 * If a future refactor flips the default back to `false`, the first test
 * fails and a NO_GO is required before the change can land.
 */

type WithFlag = { dependency_pipeline_enabled?: boolean };

describe('Sprint 169 H5 — dependency_pipeline_enabled default contract', () => {
  it('createDefaultConfig() returns dependency_pipeline_enabled: true (default ON)', () => {
    const cfg = createDefaultConfig() as DeckentConfig & WithFlag;
    expect(cfg.dependency_pipeline_enabled).toBe(true);
  });

  it('mergeConfigs honors explicit user override to false (rollback path)', () => {
    const override: Partial<DeckentConfig> & WithFlag = {
      dependency_pipeline_enabled: false,
    };
    const resolved = mergeConfigs(null, override) as ResolvedConfig;
    expect(resolved.dependency_pipeline_enabled).toBe(false);
  });

  it('mergeConfigs(null, null) preserves the true default (no-config case)', () => {
    const resolved = mergeConfigs(null, null) as ResolvedConfig;
    expect(resolved.dependency_pipeline_enabled).toBe(true);
  });
});
