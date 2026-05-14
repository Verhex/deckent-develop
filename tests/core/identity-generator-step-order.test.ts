/**
 * tests/core/identity-generator-step-order.test.ts
 *
 * Regression test for ADR-046 — Brain Self-Update Hook Architecture.
 * Verifies the Step Ordering Contract (Section 5.1):
 *
 *   Step 1 — memoryExport
 *   Step 2 — identityRegen (deprecated)
 *   Step 3 — adrInsert       ← MUST run before Step 4
 *   Step 4 — ruleRegen
 *
 * This test guards against accidental reordering of Step 3 and Step 4.
 * Step 3 (adrInsert) must complete before Step 4 (ruleRegen) so that
 * newly accepted ADRs are present in memory.db when rules are regenerated.
 *
 * See: docs/adr/046-brain-self-update-hook-architecture.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { runPostFinalizeHooks } from '../../src/core/identity-generator.js';
import type { IdentityMetrics } from '../../src/core/identity-generator.js';

// ─── Module Mocks (hoisted by Vitest) ───────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/memory-export.js', () => ({
  exportSummaryMd: vi.fn().mockReturnValue('# Summary'),
  exportDecisionsMd: vi.fn().mockReturnValue('# Decisions'),
  exportMemoryMd: vi.fn().mockReturnValue('# Memory'),
  exportDebtMd: vi.fn().mockReturnValue('# Debt'),
}));

vi.mock('../../src/core/adr-file-sync.js', () => ({
  syncAdrFilesToDb: vi.fn().mockReturnValue({
    inserted: 1,
    updated: 3,
    skipped: 42,
    errors: [],
    ids: ['adr-046', 'adr-043', 'adr-044', 'adr-045'],
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeMetrics(overrides?: Partial<IdentityMetrics>): IdentityMetrics {
  return {
    sprintId: 'sprint-166',
    totalTasks: 11,
    completedTasks: 11,
    techDebtTasks: 0,
    noGoTasks: 0,
    coveragePercent: 89.3,
    durationMs: 120000,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('ADR-046 — Post-Finalize Step Ordering Contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // existsSync returns true for memory.db path, false otherwise
    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      if (typeof p === 'string' && p.endsWith('memory.db')) return true;
      return false;
    });
  });

  it('Step 3 (adrInsert) runs before Step 4 (ruleRegen)', async () => {
    const callOrder: string[] = [];

    // Track adrInsert (Step 3) via the mock
    const { syncAdrFilesToDb } = await import('../../src/core/adr-file-sync.js');
    vi.mocked(syncAdrFilesToDb).mockImplementation(() => {
      callOrder.push('adrInsert');
      return {
        inserted: 1,
        updated: 3,
        skipped: 42,
        errors: [],
        ids: ['adr-046', 'adr-043', 'adr-044', 'adr-045'],
      };
    });

    // Track ruleRegen (Step 4) via the callback
    const onRuleRegen = vi.fn().mockImplementation(async () => {
      callOrder.push('ruleRegen');
    });

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-166',
      metrics: makeMetrics(),
      onRuleRegen,
      skipMemoryExport: true,
      skipIdentityRegen: true,
    });

    // Both steps must have executed
    expect(result.adrInsert, 'Step 3 adrInsert must populate result.adrInsert').not.toBeNull();
    expect(result.adrInsert?.inserted).toBe(1);
    expect(result.adrInsert?.ids).toContain('adr-046');
    expect(result.ruleRegenCalled, 'Step 4 ruleRegen must set ruleRegenCalled').toBe(true);
    expect(onRuleRegen).toHaveBeenCalledWith('/test');

    // CRITICAL ordering assertion — ADR-046 Step Ordering Contract Section 5.1
    const adrInsertIdx = callOrder.indexOf('adrInsert');
    const ruleRegenIdx = callOrder.indexOf('ruleRegen');

    expect(adrInsertIdx, 'adrInsert must appear in call order (Step 3 ran)').toBeGreaterThanOrEqual(0);
    expect(ruleRegenIdx, 'ruleRegen must appear in call order (Step 4 ran)').toBeGreaterThanOrEqual(0);
    expect(
      adrInsertIdx,
      'Step 3 (adrInsert) must run BEFORE Step 4 (ruleRegen) — ADR-046 ordering contract',
    ).toBeLessThan(ruleRegenIdx);

    // No errors
    expect(result.errors).toHaveLength(0);
  });
});
