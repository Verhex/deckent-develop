import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findGenerator, generateAllSections } from '../../../src/orchestra/managed-docs/content-generators.js';
import { TaskEvaluation } from '../../../src/core/types.js';
import { MemoryStore } from '../../../src/core/memory-store.js';
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

// ─── DB-first generators ─────────────────────────────────────────────────

const DB_TEST_ROOT = path.join(process.cwd(), '.test-cg-dbfirst-' + process.pid);

function cleanupDb() {
  if (fs.existsSync(DB_TEST_ROOT)) fs.rmSync(DB_TEST_ROOT, { recursive: true, force: true });
}

function makeDbStore(): MemoryStore {
  const brainDir = path.join(DB_TEST_ROOT, '.brain');
  fs.mkdirSync(brainDir, { recursive: true });
  return new MemoryStore(path.join(brainDir, 'memory.db'));
}

function makeCtxWithStore(store: MemoryStore): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 5, completedTasks: 4, techDebtTasks: 1, noGoTasks: 0,
    durationMs: 300000, coveragePercent: 95.5, noGoRate: 0,
    newDebtCount: 1, resolvedDebtCount: 0, totalOpenDebt: 3,
    boundaryViolations: 0, crossAssignments: 0,
  };
  const sprint = {
    id: 'sprint-100', number: 100,
    tasks: [{ id: '100-001', title: 'Add feature X', assignedAgent: 'bug-fixer' }],
  } as unknown as Sprint;
  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('100-001', TaskEvaluation.DONE);
  return {
    projectRoot: DB_TEST_ROOT,
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
    store,
  };
}

describe('active-debt generator — DB-first', () => {
  beforeEach(() => { cleanupDb(); });
  afterEach(cleanupDb);

  it('reads debt entries from store when available', () => {
    const store = makeDbStore();
    store.insert({
      id: 'debt-001', type: 'debt', title: 'Missing tests for auth module',
      content: 'No unit tests for auth.ts', status: 'active',
      summary: 'Auth module has 0% coverage',
    });
    store.insert({
      id: 'debt-002', type: 'debt', title: 'Deprecated API usage',
      content: 'Using old API pattern', status: 'active',
      summary: 'Replace deprecated calls',
    });

    const ctx = makeCtxWithStore(store);
    const result = generateAllSections(['Active Debt'], ctx);
    const content = result.get('Active Debt')!;
    expect(content).toContain('Missing tests for auth module');
    expect(content).toContain('Deprecated API usage');
  });

  it('returns noDebt when all debt entries are resolved', () => {
    const store = makeDbStore();
    store.insert({
      id: 'debt-003', type: 'debt', title: 'Old debt',
      content: 'Resolved debt', status: 'resolved',
    });

    const ctx = makeCtxWithStore(store);
    const result = generateAllSections(['Active Debt'], ctx);
    const content = result.get('Active Debt')!;
    // Should show noDebt message since no active entries
    expect(content).toMatch(/no.*debt|borç.*yok/i);
  });
});

describe('sprint-history generator — DB-first', () => {
  beforeEach(() => { cleanupDb(); });
  afterEach(cleanupDb);

  it('reads sprint entries from store when available', () => {
    const store = makeDbStore();
    store.insert({
      id: 'sprint-098', type: 'sprint', title: 'Sprint 098',
      content: '10 / 12 tasks completed', sprint_id: 'sprint-098', sprint_num: 98,
    });
    store.insert({
      id: 'sprint-099', type: 'sprint', title: 'Sprint 099',
      content: '8 / 10 tasks completed', sprint_id: 'sprint-099', sprint_num: 99,
    });

    const ctx = makeCtxWithStore(store);
    const result = generateAllSections(['Sprint History'], ctx);
    const content = result.get('Sprint History')!;
    expect(content).toContain('sprint-098');
    expect(content).toContain('sprint-099');
    expect(content).toContain('10/12');
    expect(content).toContain('8/10');
  });

  it('returns noHistory when no sprint entries exist', () => {
    const store = makeDbStore();
    const ctx = makeCtxWithStore(store);
    const result = generateAllSections(['Sprint History'], ctx);
    const content = result.get('Sprint History')!;
    expect(content).toMatch(/no.*history|geçmiş.*yok/i);
  });
});
