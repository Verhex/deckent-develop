import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  collectCatalogStatsTerminalOutcomes,
  writeCatalogStatsTerminalOutcomes,
  type CatalogStatsFileSystem,
} from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-catalog-outcome-'));
  roots.push(root);
  return root;
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    description: '',
    model: 'test-model',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    assignedAgent: 'implementer',
    assignedSkills: ['typescript'],
    ...overrides,
  } as Task;
}

function result(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: '',
    ...overrides,
  } as TaskResult;
}

function statsPath(root: string): string {
  return join(root, '.deckent', 'stats', 'catalog-stats.json');
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('catalog stats terminal outcome truth', () => {
  it('collects V3 and FIX attempts once each and prefers carried result identities', () => {
    const v3 = task('545-001', {
      routingMeta: { routingVersion: 'v3', workType: 'build', confidence: 1, provenance: 'deterministic' },
    });
    const fix = task('545-001-fix-1', { fixForTaskId: v3.id });
    const outcomes = collectCatalogStatsTerminalOutcomes(
      [v3, fix],
      new Map([
        [v3.id, TaskEvaluation.NO_GO],
        [fix.id, TaskEvaluation.DONE],
      ]),
      new Map([
        [v3.id, result(v3.id, { agentId: 'v3-agent', skillIds: ['v3-skill'] })],
        [fix.id, result(fix.id, { agentId: 'fix-agent', skillIds: ['fix-skill'] })],
      ]),
    );

    expect(outcomes.map(outcome => outcome.taskId)).toEqual([v3.id, fix.id]);
    expect(outcomes).toMatchObject([
      { agentId: 'v3-agent', skillIds: ['v3-skill'], evaluation: TaskEvaluation.NO_GO },
      { agentId: 'fix-agent', skillIds: ['fix-skill'], evaluation: TaskEvaluation.DONE },
    ]);
  });

  it('counts every V3/FIX terminal attempt exactly once in the sidecar', () => {
    const root = projectRoot();
    writeCatalogStatsTerminalOutcomes(root, 'sprint-545', [
      { taskId: 'v3', agentId: 'shared-agent', skillIds: ['shared-skill'], evaluation: TaskEvaluation.NO_GO },
      { taskId: 'fix', agentId: 'shared-agent', skillIds: ['shared-skill'], evaluation: TaskEvaluation.DONE },
    ]);

    const stats = JSON.parse(readFileSync(statsPath(root), 'utf-8')) as {
      agents: Record<string, { totalUses: number; successCount: number; successRate: number }>;
      skills: Record<string, { totalUses: number; successCount: number; successRate: number }>;
    };
    expect(stats.agents['shared-agent']).toMatchObject({ totalUses: 2, successCount: 1, successRate: 0.5 });
    expect(stats.skills['shared-skill']).toMatchObject({ totalUses: 2, successCount: 1, successRate: 0.5 });
  });

  it('leaves unused entity recency unchanged and preserves legacy unknown fields', () => {
    const root = projectRoot();
    mkdirSync(join(root, '.deckent', 'stats'), { recursive: true });
    const untouched = {
      totalUses: 41,
      successCount: 30,
      successRate: 30 / 41,
      avgCoverage: 77,
      lastUsedInSprint: 'sprint-500',
      legacyEntityField: { bytes: ['stay', 7] },
    };
    writeFileSync(statsPath(root), JSON.stringify({
      version: 19,
      legacyRootField: { keep: true },
      agents: { untouched, used: { totalUses: 1, successRate: 1, lastUsedInSprint: 'sprint-500' } },
      skills: {},
    }, null, 4));
    const beforeBytes = JSON.stringify(untouched);

    writeCatalogStatsTerminalOutcomes(root, 'sprint-545', [
      { taskId: 'used', agentId: 'used', skillIds: [], evaluation: TaskEvaluation.DONE, coverage: 80 },
    ]);

    const stats = JSON.parse(readFileSync(statsPath(root), 'utf-8')) as {
      version: number;
      legacyRootField: unknown;
      agents: Record<string, Record<string, unknown>>;
    };
    expect(JSON.stringify(stats.agents.untouched)).toBe(beforeBytes);
    expect(stats.agents.untouched?.lastUsedInSprint).toBe('sprint-500');
    expect(stats.legacyRootField).toEqual({ keep: true });
    expect(stats.version).toBe(19);
  });

  it('publishes one complete state with one temp write and one rename', () => {
    const root = projectRoot();
    const destination = statsPath(root);
    let writes = 0;
    let renames = 0;
    let destinationWasAbsentBeforeRename = false;
    const fileSystem: CatalogStatsFileSystem = {
      exists: path => existsSync(path),
      read: path => readFileSync(path, 'utf-8'),
      mkdir: path => mkdirSync(path, { recursive: true }),
      write: (path, content) => {
        writes += 1;
        expect(path).not.toBe(destination);
        writeFileSync(path, content, 'utf-8');
      },
      rename: (source, target) => {
        renames += 1;
        destinationWasAbsentBeforeRename = !existsSync(target);
        renameSync(source, target);
      },
    };

    writeCatalogStatsTerminalOutcomes(root, 'sprint-545', [
      { taskId: 'one', agentId: 'agent-a', skillIds: ['skill-a'], evaluation: TaskEvaluation.DONE },
      { taskId: 'two', agentId: 'agent-b', skillIds: ['skill-b'], evaluation: TaskEvaluation.NO_GO },
    ], fileSystem);

    expect({ writes, renames, destinationWasAbsentBeforeRename }).toEqual({
      writes: 1,
      renames: 1,
      destinationWasAbsentBeforeRename: true,
    });
    expect(JSON.parse(readFileSync(destination, 'utf-8'))).toMatchObject({
      agents: { 'agent-a': { totalUses: 1 }, 'agent-b': { totalUses: 1 } },
      skills: { 'skill-a': { totalUses: 1 }, 'skill-b': { totalUses: 1 } },
    });
  });
});
