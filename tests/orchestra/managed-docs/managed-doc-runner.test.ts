import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TaskEvaluation } from '../../../src/core/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import { saveDocsConfig } from '../../../src/orchestra/managed-docs/docs-config.js';
import { runManagedDocUpdates } from '../../../src/orchestra/managed-docs/managed-doc-runner.js';

const TEST_ROOT = path.join(process.cwd(), '.test-managed-runner-' + process.pid);

function cleanup() {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}

function makeCtx(): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 3, completedTasks: 2, techDebtTasks: 1, noGoTasks: 0,
    durationMs: 180000, coveragePercent: 90, noGoRate: 0,
    newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
    boundaryViolations: 0, crossAssignments: 0,
  };
  const sprint = {
    id: 'sprint-100', number: 100,
    tasks: [
      { id: '100-001', title: 'Task A', assignedAgent: 'bug-fixer' },
      { id: '100-002', title: 'Task B', assignedAgent: 'doc-writer' },
      { id: '100-003', title: 'Task C', assignedAgent: 'bug-fixer' },
    ],
  } as unknown as Sprint;
  const evaluations = new Map<string, TaskEvaluation>();
  evaluations.set('100-001', TaskEvaluation.DONE);
  evaluations.set('100-002', TaskEvaluation.GO_WITH_TECH_DEBT);
  evaluations.set('100-003', TaskEvaluation.DONE);

  return {
    projectRoot: TEST_ROOT,
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(path.join(TEST_ROOT, '.deckent'), { recursive: true });
});

afterEach(cleanup);

// ─── runManagedDocUpdates ─────────────────────────────────────────────────

describe('runManagedDocUpdates', () => {
  it('returns empty when no config', () => {
    const results = runManagedDocUpdates(makeCtx());
    expect(results).toEqual([]);
  });

  it('returns empty when config has no docs', () => {
    saveDocsConfig(TEST_ROOT, { version: 1, docs: [] });
    const results = runManagedDocUpdates(makeCtx());
    expect(results).toEqual([]);
  });

  it('reports file_not_found for missing files', () => {
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{ id: 'missing', path: 'nonexistent.md', autoSections: ['Metrics'] }],
    });
    const results = runManagedDocUpdates(makeCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.updated).toBe(false);
    expect(results[0]!.reason).toBe('file_not_found');
  });

  it('reports no_auto_sections when none configured', () => {
    const docPath = path.join(TEST_ROOT, 'README.md');
    fs.writeFileSync(docPath, '# README\nContent', 'utf-8');
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{ id: 'readme', path: 'README.md' }],
    });
    const results = runManagedDocUpdates(makeCtx());
    expect(results[0]!.reason).toBe('no_auto_sections');
  });

  it('updates auto sections in existing file', () => {
    const docPath = path.join(TEST_ROOT, 'project.md');
    fs.writeFileSync(docPath, '# Project\n\n## Sprint Metrics\nOld data\n\n## Vision\nMy vision\n', 'utf-8');
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{
        id: 'project', path: 'project.md',
        autoSections: ['Sprint Metrics'],
        protectedSections: ['Vision'],
      }],
    });
    const results = runManagedDocUpdates(makeCtx());
    expect(results).toHaveLength(1);
    expect(results[0]!.updated).toBe(true);

    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('sprint-100');
    expect(content).not.toContain('Old data');
    expect(content).toContain('My vision');
  });

  it('appends missing auto section', () => {
    const docPath = path.join(TEST_ROOT, 'doc.md');
    fs.writeFileSync(docPath, '# Doc\n\n## Intro\nHello\n', 'utf-8');
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{ id: 'doc', path: 'doc.md', autoSections: ['Sprint Metrics'] }],
    });
    const results = runManagedDocUpdates(makeCtx());
    expect(results[0]!.updated).toBe(true);

    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('## Sprint Metrics');
    expect(content).toContain('sprint-100');
    expect(content).toContain('Hello'); // preserved
  });

  it('skips disabled docs', () => {
    const docPath = path.join(TEST_ROOT, 'skip.md');
    fs.writeFileSync(docPath, '# Skip\n## Sprint Metrics\nOld\n', 'utf-8');
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [{ id: 'skip', path: 'skip.md', autoSections: ['Sprint Metrics'], enabled: false }],
    });
    const results = runManagedDocUpdates(makeCtx());
    expect(results).toEqual([]);

    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('Old'); // unchanged
  });

  it('handles multiple docs', () => {
    fs.writeFileSync(path.join(TEST_ROOT, 'a.md'), '# A\n## Sprint Metrics\nOld\n', 'utf-8');
    fs.writeFileSync(path.join(TEST_ROOT, 'b.md'), '# B\n## Agent Performance\nOld\n', 'utf-8');
    saveDocsConfig(TEST_ROOT, {
      version: 1,
      docs: [
        { id: 'a', path: 'a.md', autoSections: ['Sprint Metrics'] },
        { id: 'b', path: 'b.md', autoSections: ['Agent Performance'] },
      ],
    });
    const results = runManagedDocUpdates(makeCtx());
    expect(results).toHaveLength(2);
    expect(results.every(r => r.updated)).toBe(true);
  });
});
