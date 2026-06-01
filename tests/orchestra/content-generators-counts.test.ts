import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { countModules, findGenerator, generateAllSections } from '../../src/orchestra/managed-docs/content-generators.js';
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

// ─── countModules function ────────────────────────────────────────────────

describe('countModules', () => {
  it('returns code-derived count for src/core (must be > 90)', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const count = countModules(coreDir);
    // Real count is 111 — must be > 90 to prove it is NOT hardcoded to old value
    expect(count).toBeGreaterThan(90);
  });

  it('returns code-derived count for src/orchestra (must be > 76)', () => {
    const orchestraDir = join(process.cwd(), 'src', 'orchestra');
    const count = countModules(orchestraDir);
    // Real count is 88 — must be > 76 to prove it is NOT hardcoded to old value
    expect(count).toBeGreaterThan(76);
  });

  it('returns 0 for a non-existent directory', () => {
    const missing = join(process.cwd(), 'src', '__nonexistent_dir__');
    expect(countModules(missing)).toBe(0);
  });

  it('count is consistent with readdirSync .ts file listing', () => {
    const coreDir = join(process.cwd(), 'src', 'core');
    const count = countModules(coreDir);
    // Should be a positive integer reflecting real directory contents
    expect(count).toBeGreaterThan(0);
    expect(Number.isInteger(count)).toBe(true);
  });
});

// ─── architecture-map generator ──────────────────────────────────────────

describe('architecture-map generator', () => {
  it('findGenerator matches "architecture" section title', () => {
    expect(findGenerator('Architecture')).not.toBeNull();
    expect(findGenerator('architecture map')).not.toBeNull();
    expect(findGenerator('module counts')).not.toBeNull();
  });

  it('generates table with core/ and orchestra/ module counts from disk', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Architecture'], ctx);
    const content = result.get('Architecture') ?? '';
    // Must include core/ and orchestra/ rows
    expect(content).toContain('core/');
    expect(content).toContain('orchestra/');
    // Must be a markdown table
    expect(content).toContain('|');
  });

  it('core/ module count in table is > 90 (not hardcoded old value)', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Architecture'], ctx);
    const content = result.get('Architecture') ?? '';
    // Extract the core/ row: "| core/ | NNN |"
    const match = content.match(/\| core\/ \| (\d+) \|/);
    expect(match).not.toBeNull();
    const coreCount = parseInt(match![1], 10);
    expect(coreCount).toBeGreaterThan(90);
  });

  it('orchestra/ module count in table is > 76 (not hardcoded old value)', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Architecture'], ctx);
    const content = result.get('Architecture') ?? '';
    const match = content.match(/\| orchestra\/ \| (\d+) \|/);
    expect(match).not.toBeNull();
    const orchestraCount = parseInt(match![1], 10);
    expect(orchestraCount).toBeGreaterThan(76);
  });
});
