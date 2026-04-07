import { describe, it, expect } from 'vitest';
import { findGenerator, generateAllSections } from '../../../src/orchestra/managed-docs/content-generators.js';
import { TaskEvaluation } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../../src/core/types.js';

function makeCtx(overrides?: Partial<{ metrics: Partial<SprintMetrics> }>): DocUpdateContext {
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
    ...overrides?.metrics,
  };

  const sprint = {
    id: 'sprint-100',
    number: 100,
    tasks: [
      { id: '100-001', title: 'Add feature X', assignedAgent: 'bug-fixer' },
      { id: '100-002', title: 'Fix bug Y', assignedAgent: 'doc-writer' },
    ],
  } as unknown as Sprint;

  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('100-001', TaskEvaluation.DONE);
  evaluations.set('100-002', TaskEvaluation.GO_WITH_TECH_DEBT);

  return {
    projectRoot: process.cwd(),
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

// ─── findGenerator ────────────────────────────────────────────────────────

describe('findGenerator', () => {
  it('finds sprint metrics generator', () => {
    expect(findGenerator('Sprint Metrics')).not.toBeNull();
    expect(findGenerator('metrics')).not.toBeNull();
    expect(findGenerator('Stats')).not.toBeNull();
  });

  it('finds active debt generator', () => {
    expect(findGenerator('Active Debt')).not.toBeNull();
    expect(findGenerator('Tech Debt')).not.toBeNull();
  });

  it('finds sprint history generator', () => {
    expect(findGenerator('Sprint History')).not.toBeNull();
    expect(findGenerator('progress')).not.toBeNull();
  });

  it('finds agent performance generator', () => {
    expect(findGenerator('Agent Performance')).not.toBeNull();
    expect(findGenerator('agents')).not.toBeNull();
  });

  it('finds changelog generator', () => {
    expect(findGenerator('Changelog')).not.toBeNull();
    expect(findGenerator('Recent Changes')).not.toBeNull();
  });

  it('finds test coverage generator', () => {
    expect(findGenerator('Test Coverage')).not.toBeNull();
    expect(findGenerator('coverage')).not.toBeNull();
  });

  it('finds module map generator', () => {
    expect(findGenerator('Module Map')).not.toBeNull();
    expect(findGenerator('modules')).not.toBeNull();
  });

  it('finds dependencies generator', () => {
    expect(findGenerator('Dependencies')).not.toBeNull();
    expect(findGenerator('deps')).not.toBeNull();
  });

  it('returns null for unknown section', () => {
    expect(findGenerator('Random Section Name')).toBeNull();
  });
});

// ─── generateAllSections ──────────────────────────────────────────────────

describe('generateAllSections', () => {
  it('generates content for matching sections', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Sprint Metrics', 'Agent Performance'], ctx);
    expect(result.size).toBe(2);
    expect(result.get('Sprint Metrics')).toContain('sprint-100');
    expect(result.get('Agent Performance')).toContain('bug-fixer');
  });

  it('skips unrecognized sections', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Unknown Section'], ctx);
    expect(result.size).toBe(0);
  });

  it('generates changelog with task titles', () => {
    const ctx = makeCtx();
    const result = generateAllSections(['Changelog'], ctx);
    expect(result.get('Changelog')).toContain('Add feature X');
    expect(result.get('Changelog')).toContain('Fix bug Y');
  });

  it('generates test coverage table', () => {
    const ctx = makeCtx({ metrics: { coveragePercent: 92.3 } });
    const result = generateAllSections(['Test Coverage'], ctx);
    expect(result.get('Test Coverage')).toContain('92.3%');
  });

  it('handles empty auto sections array', () => {
    const ctx = makeCtx();
    const result = generateAllSections([], ctx);
    expect(result.size).toBe(0);
  });
});
