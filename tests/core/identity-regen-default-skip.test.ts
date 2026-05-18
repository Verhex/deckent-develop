/**
 * tests/core/identity-regen-default-skip.test.ts
 *
 * Sprint 168 — Cluster C0a-1 (BUG-GG closure)
 *
 * Phase 1+2 audit evidence:
 *   `docs/audits/sprint-167/T5-brain-debug-phase1.md` §1.9 — `@deprecated` TypeScript
 *   annotation runtime'da etkili değildi; `skipIdentityRegen` default `false` ise
 *   Step 2 her finalize çağrısında çalışıyor. Sprint 166 T5'in beklediği davranış:
 *   default → skip (Step 2 invocation conditionally bypass).
 *
 * Behavioral invariant locked by this suite:
 *   1. `runPostFinalizeHooks` çağrıldığında `skipIdentityRegen` ALANI VERİLMEZSE
 *      → Step 2 (regenerateProjectIdentity) INVOKE EDİLMEZ, `result.identityRegen`
 *      is `null`, ve hiçbir downstream writeFileSync/PROJECT-IDENTITY mutation
 *      tetiklenmez.
 *   2. `skipIdentityRegen: true` → aynı davranış (explicit opt-out).
 *   3. `skipIdentityRegen: false` → opt-IN override; Step 2 yine de çalışır.
 *
 * ADR-046 Step 2 behaviour fix; deprecated enforcement gate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { runPostFinalizeHooks } from '../../src/core/identity-generator.js';
import type { IdentityMetrics } from '../../src/core/identity-generator.js';

// ─── Mocks (mirror identity-generator.test.ts pattern) ──────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

const mockClose = vi.fn();
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({ close: mockClose })),
}));

vi.mock('../../src/core/memory-export.js', () => ({
  exportSummaryMd: vi.fn().mockReturnValue('# Summary'),
  exportDecisionsMd: vi.fn().mockReturnValue('# Decisions'),
  exportMemoryMd: vi.fn().mockReturnValue('# Memory'),
  exportDebtMd: vi.fn().mockReturnValue('# Debt'),
}));

// Stub adr-file-sync to keep Step 3 deterministic / fast
vi.mock('../../src/core/adr-file-sync.js', () => ({
  syncAdrFilesToDb: vi.fn().mockReturnValue({
    inserted: 0, updated: 0, skipped: 0, errors: [], ids: [],
  }),
}));

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeMetrics(overrides?: Partial<IdentityMetrics>): IdentityMetrics {
  return {
    sprintId: 'sprint-168',
    totalTasks: 8,
    completedTasks: 8,
    techDebtTasks: 0,
    noGoTasks: 0,
    coveragePercent: 90,
    durationMs: 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══ BUG-GG default-skip invariant ══════════════════════════════════

describe('identityRegen Step 2 default skip (Sprint 168 C0a-1, BUG-GG)', () => {
  it('skipIdentityRegen default true — Step 2 not invoked when option omitted', async () => {
    // Simulate live finalize: DB + PROJECT-IDENTITY.md both exist on disk.
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Project Identity\n\n## Current State\n- Old\n');

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-168',
      metrics: makeMetrics(),
      // skipIdentityRegen INTENTIONALLY OMITTED — default must skip
    });

    // Step 2 result null — deprecated function not invoked
    expect(result.identityRegen).toBeNull();

    // Downstream evidence: no PROJECT-IDENTITY.md mutation took place.
    // regenerateProjectIdentity is the ONLY caller of writeFileSync that targets
    // PROJECT-IDENTITY.md in this hook chain (Step 1 writes to .brain/exports/*.md;
    // Step 3 writes via store.upsert, not writeFileSync). So zero PROJECT-IDENTITY
    // writes proves Step 2 was skipped.
    const projectIdentityWrites = mockedWriteFileSync.mock.calls.filter(call => {
      const path = String(call[0] ?? '');
      return path.includes('PROJECT-IDENTITY');
    });
    expect(projectIdentityWrites.length).toBe(0);
  });

  it('skipIdentityRegen: true — explicit opt-out preserves null result', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Project Identity\n');

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-168',
      metrics: makeMetrics(),
      skipIdentityRegen: true,
    });

    expect(result.identityRegen).toBeNull();
  });

  it('skipIdentityRegen: false — explicit opt-IN still invokes Step 2', async () => {
    // Caller can still run the deprecated Step 2 by passing `false` explicitly.
    // This proves the field is honored as an override, not silently ignored.
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Project Identity\n\n## Current State\n- Old\n');

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-168',
      metrics: makeMetrics(),
      skipIdentityRegen: false,
    });

    expect(result.identityRegen).not.toBeNull();
    expect(result.identityRegen?.success).toBe(true);
  });
});
