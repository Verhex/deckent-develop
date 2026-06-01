import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mcpToolCount, cliCommandCount, findGenerator, generateAllSections } from '../../src/orchestra/managed-docs/content-generators.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { DocUpdateContext } from '../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../src/core/types.js';

function makeCtx(): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 0,
    durationMs: 300000,
    coveragePercent: 95.5,
    noGoRate: 0,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 3,
    boundaryViolations: 0,
    crossAssignments: 0,
  };

  const sprint = {
    id: 'sprint-212',
    number: 212,
    tasks: [
      { id: '212-001', title: 'Test task', assignedAgent: 'refactorer' },
    ],
  } as unknown as Sprint;

  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('212-001', TaskEvaluation.DONE);

  return {
    projectRoot: process.cwd(),
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

// ─── mcpToolCount ─────────────────────────────────────────────────────────

describe('mcpToolCount', () => {
  it('returns ≥32 — code-derived from server.ts deckent_ registrations', () => {
    const count = mcpToolCount(process.cwd());
    // IDENTITY canonical: 32 MCP tools. Must be ≥32 to confirm it reads server.ts.
    expect(count).toBeGreaterThanOrEqual(32);
  });

  it('returns 0 for a non-existent project root', () => {
    expect(mcpToolCount(join(process.cwd(), '__nonexistent__'))).toBe(0);
  });
});

// ─── cliCommandCount ─────────────────────────────────────────────────────

describe('cliCommandCount', () => {
  it('returns ≥49 — code-derived from cli/index.ts register imports', () => {
    const count = cliCommandCount(process.cwd());
    // IDENTITY canonical: 49+ CLI commands. Must be ≥49 to confirm it reads index.ts.
    expect(count).toBeGreaterThanOrEqual(49);
  });

  it('returns 0 for a non-existent project root', () => {
    expect(cliCommandCount(join(process.cwd(), '__nonexistent__'))).toBe(0);
  });
});

// ─── project-status generator uses code-derived counts ───────────────────

describe('project-status generator consistency', () => {
  it('findGenerator matches "deckent by the numbers" and "project status"', () => {
    expect(findGenerator('deckent by the numbers')).not.toBeNull();
    expect(findGenerator('project status')).not.toBeNull();
  });

  it('project-status generator output contains MCP count ≥32', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['project status'], ctx);
    const content = result.get('project status') ?? '';
    // Extract the MCP Tools row value
    const match = content.match(/\| MCP Tools \| (\d+) \|/);
    expect(match).not.toBeNull();
    const mcpCount = parseInt(match![1], 10);
    expect(mcpCount).toBeGreaterThanOrEqual(32);
  });

  it('project-status generator CLI count matches cliCommandCount (no drift)', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['project status'], ctx);
    const content = result.get('project status') ?? '';
    // Extract CLI Commands row value (may have trailing "+")
    const match = content.match(/\| CLI Commands \| (\d+)\+? \|/);
    expect(match).not.toBeNull();
    const cliCount = parseInt(match![1], 10);
    const expectedCount = cliCommandCount(process.cwd());
    // Generator should report the same count as the exported function
    expect(cliCount).toBe(expectedCount);
  });
});
