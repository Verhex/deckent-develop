/**
 * tests/core/identity-generator.test.ts
 *
 * Tests for identity-generator module:
 * - regenerateProjectIdentity (create, update, idempotency)
 * - runMemoryExport (happy path, missing DB, partial failure)
 * - runPostFinalizeHooks (full chain, skip options, rule regen hook, error isolation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  regenerateProjectIdentity,
  runMemoryExport,
  runPostFinalizeHooks,
} from '../../src/core/identity-generator.js';
import type {
  IdentityMetrics,
  IdentityContext,
  PostFinalizeHookOptions,
} from '../../src/core/identity-generator.js';

// ─── Mocks ──────────────────────────────────────────────────────────

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

// Mock memory-store and memory-export for runMemoryExport tests
const mockClose = vi.fn();
const mockStore = {
  close: mockClose,
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockStore),
}));

vi.mock('../../src/core/memory-export.js', () => ({
  exportSummaryMd: vi.fn().mockReturnValue('# Summary'),
  exportDecisionsMd: vi.fn().mockReturnValue('# Decisions'),
  exportMemoryMd: vi.fn().mockReturnValue('# Memory'),
  exportDebtMd: vi.fn().mockReturnValue('# Debt'),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function makeMetrics(overrides?: Partial<IdentityMetrics>): IdentityMetrics {
  return {
    sprintId: 'sprint-143',
    totalTasks: 20,
    completedTasks: 17,
    techDebtTasks: 3,
    noGoTasks: 2,
    coveragePercent: 89.3,
    durationMs: 300000,
    ...overrides,
  };
}

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══ regenerateProjectIdentity ══════════════════════════════════════

describe('regenerateProjectIdentity', () => {
  it('creates PROJECT-IDENTITY.md when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = regenerateProjectIdentity({
      projectRoot: '/test',
      metrics: makeMetrics(),
      adrCount: 40,
      cliCommandCount: 41,
      mcpToolCount: 22,
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('created');
    expect(result.adrCount).toBe(40);
    expect(mockedWriteFileSync).toHaveBeenCalledOnce();

    const content = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('# Project Identity');
    expect(content).toContain('sprint-143');
    expect(content).toContain('ADR Count: 40');
    expect(content).toContain('MCP Tools: 22');
    expect(content).toContain('CLI Commands: 41+');
  });

  it('updates existing PROJECT-IDENTITY.md Current State section', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(
      '# Project Identity\n\n## Current State\n- Last Sprint: sprint-142\n- Old Data: xyz\n\n## Architecture\n- Language: TypeScript\n',
    );

    const result = regenerateProjectIdentity({
      projectRoot: '/test',
      metrics: makeMetrics(),
      adrCount: 40,
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('updated');

    const content = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('sprint-143');
    expect(content).not.toContain('sprint-142');
    expect(content).not.toContain('Old Data');
    expect(content).toContain('## Architecture');
    expect(content).toContain('Language: TypeScript');
  });

  it('appends Current State section when missing in existing file', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Project Identity\n\n## Architecture\n- Language: TypeScript\n');

    const result = regenerateProjectIdentity({
      projectRoot: '/test',
      metrics: makeMetrics(),
    });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('updated');

    const content = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(content).toContain('## Current State');
    expect(content).toContain('## Architecture');
  });

  it('is idempotent — calling twice with same metrics writes same content', () => {
    const metrics = makeMetrics();

    // First call: create
    mockedExistsSync.mockReturnValue(false);
    regenerateProjectIdentity({
      projectRoot: '/test',
      metrics,
      adrCount: 40,
      cliCommandCount: 41,
      mcpToolCount: 22,
    });
    const firstContent = mockedWriteFileSync.mock.calls[0]![1] as string;

    // Second call: update existing with same data — content should be equivalent
    mockedWriteFileSync.mockClear();
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(firstContent);

    regenerateProjectIdentity({
      projectRoot: '/test',
      metrics,
      adrCount: 40,
      cliCommandCount: 41,
      mcpToolCount: 22,
    });

    // Whether reason is 'unchanged' or 'updated', the content must be equivalent
    if (mockedWriteFileSync.mock.calls.length > 0) {
      const secondContent = mockedWriteFileSync.mock.calls[0]![1] as string;
      // Normalize whitespace for comparison
      expect(secondContent.replace(/\n+/g, '\n').trim()).toBe(
        firstContent.replace(/\n+/g, '\n').trim(),
      );
    }
    // Either way, the operation succeeded
  });

  it('counts ADRs from summary.md when adrCount not provided', () => {
    // First call: existsSync for PROJECT-IDENTITY.md
    // Internal calls: existsSync for dbPath, summary.md
    mockedExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('PROJECT-IDENTITY')) return false;
      if (typeof p === 'string' && p.includes('memory.db')) return true;
      if (typeof p === 'string' && p.includes('summary.md')) return true;
      return false;
    });
    mockedReadFileSync.mockReturnValue(
      '| adr-001 | TypeScript |\n| adr-002 | ESM |\n| adr-003 | vitest |\n',
    );

    const result = regenerateProjectIdentity({
      projectRoot: '/test',
      metrics: makeMetrics(),
    });

    expect(result.adrCount).toBe(3);
  });

  it('handles errors gracefully', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });

    const result = regenerateProjectIdentity({
      projectRoot: '/test',
      metrics: makeMetrics(),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('error');
  });
});

// ═══ runMemoryExport ════════════════════════════════════════════════

describe('runMemoryExport', () => {
  it('writes all 4 export files when DB exists', async () => {
    mockedExistsSync.mockReturnValue(true);

    const result = await runMemoryExport('/test');

    expect(result.success).toBe(true);
    expect(result.filesWritten).toEqual(['summary.md', 'decisions.md', 'memory.md', 'debt.md']);
    expect(result.errors).toHaveLength(0);
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('returns error when memory.db not found', async () => {
    mockedExistsSync.mockReturnValue(false);

    const result = await runMemoryExport('/test');

    expect(result.success).toBe(false);
    expect(result.errors).toContain('memory.db not found');
    expect(result.filesWritten).toHaveLength(0);
  });

  it('handles partial export failure', async () => {
    mockedExistsSync.mockReturnValue(true);
    const { exportDecisionsMd } = await import('../../src/core/memory-export.js');
    vi.mocked(exportDecisionsMd).mockImplementationOnce(() => {
      throw new Error('DB locked');
    });

    const result = await runMemoryExport('/test');

    expect(result.success).toBe(false);
    expect(result.filesWritten).toContain('summary.md');
    expect(result.errors.some(e => e.includes('decisions.md'))).toBe(true);
  });
});

// ═══ runPostFinalizeHooks ═══════════════════════════════════════════

describe('runPostFinalizeHooks', () => {
  it('runs full hook chain successfully', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Project Identity\n\n## Current State\n- Old\n');

    const ruleRegenFn = vi.fn();

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-143',
      metrics: makeMetrics(),
      onRuleRegen: ruleRegenFn,
    });

    expect(result.memoryExport).not.toBeNull();
    expect(result.identityRegen).not.toBeNull();
    expect(result.identityRegen?.success).toBe(true);
    expect(result.ruleRegenCalled).toBe(true);
    expect(ruleRegenFn).toHaveBeenCalledWith('/test');
  });

  it('skips memory export when skipMemoryExport=true', async () => {
    mockedExistsSync.mockReturnValue(false);

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-143',
      metrics: makeMetrics(),
      skipMemoryExport: true,
    });

    expect(result.memoryExport).toBeNull();
    expect(result.identityRegen).not.toBeNull();
  });

  it('skips identity regen when skipIdentityRegen=true', async () => {
    mockedExistsSync.mockReturnValue(true);

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-143',
      metrics: makeMetrics(),
      skipIdentityRegen: true,
      skipMemoryExport: true,
    });

    expect(result.identityRegen).toBeNull();
    expect(result.memoryExport).toBeNull();
  });

  it('does not call rule regen when no callback provided', async () => {
    mockedExistsSync.mockReturnValue(false);

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-143',
      metrics: makeMetrics(),
      skipMemoryExport: true,
    });

    expect(result.ruleRegenCalled).toBe(false);
  });

  it('isolates errors — rule regen failure does not affect other results', async () => {
    mockedExistsSync.mockReturnValue(false);

    const failingRuleRegen = vi.fn().mockRejectedValue(new Error('rule gen failed'));

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-143',
      metrics: makeMetrics(),
      onRuleRegen: failingRuleRegen,
      skipMemoryExport: true,
    });

    expect(result.ruleRegenCalled).toBe(false);
    expect(result.errors.some(e => e.includes('ruleRegen'))).toBe(true);
    // Identity regen still ran (even though it creates a new file)
    expect(result.identityRegen).not.toBeNull();
  });

  it('handles async rule regen callback', async () => {
    mockedExistsSync.mockReturnValue(false);

    const asyncRuleRegen = vi.fn().mockResolvedValue(undefined);

    const result = await runPostFinalizeHooks({
      projectRoot: '/test',
      sprintId: 'sprint-143',
      metrics: makeMetrics(),
      onRuleRegen: asyncRuleRegen,
      skipMemoryExport: true,
    });

    expect(result.ruleRegenCalled).toBe(true);
    expect(asyncRuleRegen).toHaveBeenCalledWith('/test');
  });
});
