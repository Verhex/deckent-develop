// Sprint 212 Task 7 — retro "Next Sprint Behavior Changes" section
// Verifies: section render, agent skill mutation listing, skill change rows,
// graceful empty handling, and end-to-end load from outcomes file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildNextSprintBehaviorChanges,
  formatHumanRetro,
  loadBehaviorChangesFromOutcomes,
  writeRetrospective,
  type BehaviorChange,
  type SkillAdaptationInput,
} from '../../src/orchestra/sprint-retro-writer.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, SprintMetrics } from '../../src/core/types.js';

let tmpDir: string;

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: overrides.id ?? 'sprint-212',
    number: overrides.number ?? 212,
    status: overrides.status ?? ('COMPLETED' as Sprint['status']),
    phase: overrides.phase ?? ('CLEANUP' as Sprint['phase']),
    tasks: overrides.tasks ?? [],
    workers: overrides.workers ?? [],
    metrics: overrides.metrics ?? makeMetrics(),
    startedAt: overrides.startedAt ?? '2026-06-01T10:00:00Z',
    completedAt: overrides.completedAt ?? '2026-06-01T11:00:00Z',
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: overrides.totalTasks ?? 1,
    completedTasks: overrides.completedTasks ?? 1,
    techDebtTasks: overrides.techDebtTasks ?? 0,
    noGoTasks: overrides.noGoTasks ?? 0,
    durationMs: overrides.durationMs ?? 60_000,
    coveragePercent: overrides.coveragePercent ?? 0,
    noGoRate: overrides.noGoRate ?? 0,
    newDebtCount: overrides.newDebtCount ?? 0,
    resolvedDebtCount: overrides.resolvedDebtCount ?? 0,
    totalOpenDebt: overrides.totalOpenDebt ?? 0,
    boundaryViolations: overrides.boundaryViolations ?? 0,
    crossAssignments: overrides.crossAssignments ?? 0,
    contextLinesUsed: overrides.contextLinesUsed ?? 0,
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'retro-behavior-changes-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildNextSprintBehaviorChanges', () => {
  it('produces an agent-skill-add row for non-empty suggestAdd', () => {
    const adapt: SkillAdaptationInput = {
      agentId: 'refactorer',
      suggestAdd: ['testing-expert'],
      suggestRemove: [],
      reason: 'low-coverage',
    };
    const changes = buildNextSprintBehaviorChanges({ skillAdaptations: [adapt] });
    expect(changes.length).toBe(1);
    expect(changes[0]!.category).toBe('agent-skill-add');
    expect(changes[0]!.summary).toContain('refactorer');
    expect(changes[0]!.summary).toContain('testing-expert');
    expect(changes[0]!.summary).toContain('low-coverage');
  });

  it('produces an agent-skill-remove row for non-empty suggestRemove', () => {
    const adapt: SkillAdaptationInput = {
      agentId: 'doc-writer',
      suggestAdd: [],
      suggestRemove: ['python-expert'],
      reason: 'unused',
    };
    const changes = buildNextSprintBehaviorChanges({ skillAdaptations: [adapt] });
    expect(changes.length).toBe(1);
    expect(changes[0]!.category).toBe('agent-skill-remove');
    expect(changes[0]!.summary).toContain('doc-writer');
    expect(changes[0]!.summary).toContain('python-expert');
  });

  it('returns an empty array gracefully when given no inputs', () => {
    expect(buildNextSprintBehaviorChanges()).toEqual([]);
    expect(buildNextSprintBehaviorChanges({})).toEqual([]);
    expect(
      buildNextSprintBehaviorChanges({ skillAdaptations: [] }),
    ).toEqual([]);
    // suggestAdd / suggestRemove both empty: no row, no crash.
    const noop: SkillAdaptationInput = {
      agentId: 'api-builder',
      suggestAdd: [],
      suggestRemove: [],
      reason: '',
    };
    expect(
      buildNextSprintBehaviorChanges({ skillAdaptations: [noop] }),
    ).toEqual([]);
  });

  it('renders genealogy and retirement future-extension inputs', () => {
    const changes = buildNextSprintBehaviorChanges({
      genealogy: [{ agentId: 'temp-x', parentAgentId: 'refactorer', mutation: 'add-skill' }],
      retirements: [{ agentId: 'temp-y', reason: 'low-success' }],
    });
    expect(changes.length).toBe(2);
    expect(changes.find(c => c.category === 'agent-genealogy')!.summary).toContain('temp-x');
    expect(changes.find(c => c.category === 'agent-retirement')!.summary).toContain('temp-y');
  });
});

describe('formatHumanRetro — Next Sprint Behavior Changes section', () => {
  it('renders the section header and rows when behaviorChanges is non-empty', () => {
    const sprint = makeSprint();
    const behaviorChanges: BehaviorChange[] = [
      { category: 'agent-skill-add', summary: 'refactorer: gain skill testing-expert (low-coverage)' },
      { category: 'agent-skill-remove', summary: 'doc-writer: drop skill python-expert' },
      { category: 'agent-retirement', summary: 'temp-z: retired (low-success)' },
    ];
    const out = formatHumanRetro({
      sprint,
      evaluations: new Map(),
      metrics: sprint.metrics!,
      behaviorChanges,
    });
    expect(out).toContain('## Next Sprint Behavior Changes');
    expect(out).toContain('refactorer: gain skill testing-expert');
    expect(out).toContain('doc-writer: drop skill python-expert');
    expect(out).toContain('temp-z: retired');
    expect(out).toContain('[agent-skill-add]');
    expect(out).toContain('[agent-skill-remove]');
    expect(out).toContain('[agent-retirement]');
  });

  it('omits the section gracefully when behaviorChanges is empty or undefined', () => {
    const sprint = makeSprint();
    const out1 = formatHumanRetro({
      sprint,
      evaluations: new Map(),
      metrics: sprint.metrics!,
      behaviorChanges: [],
    });
    const out2 = formatHumanRetro({
      sprint,
      evaluations: new Map(),
      metrics: sprint.metrics!,
    });
    expect(out1).not.toContain('## Next Sprint Behavior Changes');
    expect(out2).not.toContain('## Next Sprint Behavior Changes');
  });
});

describe('loadBehaviorChangesFromOutcomes — wire from outcome-tracker', () => {
  it('reads skillAdaptation rows from .deckent/routing/outcomes/<sprintId>.json', () => {
    const sprintId = 'sprint-212';
    const outcomesDir = join(tmpDir, '.deckent/routing/outcomes');
    mkdirSync(outcomesDir, { recursive: true });
    const outcomes = [
      {
        taskId: '212-001',
        sprintId,
        agentId: 'refactorer',
        skillIds: ['typescript-expert'],
        evaluation: 'GO_WITH_TECH_DEBT',
        coverage: 40,
        skillAdaptation: {
          agentId: 'refactorer',
          suggestAdd: ['testing-expert'],
          suggestRemove: [],
          reason: 'low-coverage',
        },
      },
      // Second outcome with no skillAdaptation (e.g. generic agent) — must be skipped.
      {
        taskId: '212-002',
        sprintId,
        agentId: 'generic',
        skillIds: [],
        evaluation: 'DONE',
        coverage: 90,
      },
    ];
    writeFileSync(join(outcomesDir, `${sprintId}.json`), JSON.stringify(outcomes), 'utf-8');

    const changes = loadBehaviorChangesFromOutcomes(tmpDir, sprintId);
    expect(changes.length).toBe(1);
    expect(changes[0]!.category).toBe('agent-skill-add');
    expect(changes[0]!.summary).toContain('refactorer');
    expect(changes[0]!.summary).toContain('testing-expert');
  });

  it('returns an empty array when no outcomes file exists (graceful)', () => {
    const changes = loadBehaviorChangesFromOutcomes(tmpDir, 'sprint-missing');
    expect(changes).toEqual([]);
  });
});

describe('writeRetrospective — behavior changes land in retro entry', () => {
  it('writes the Next Sprint Behavior Changes section into the retro DB entry', () => {
    const sprintId = 'sprint-212';
    // Seed outcomes file so loadBehaviorChangesFromOutcomes finds a row.
    const outcomesDir = join(tmpDir, '.deckent/routing/outcomes');
    mkdirSync(outcomesDir, { recursive: true });
    writeFileSync(
      join(outcomesDir, `${sprintId}.json`),
      JSON.stringify([
        {
          taskId: '212-001',
          sprintId,
          agentId: 'refactorer',
          skillIds: ['typescript-expert'],
          evaluation: 'GO_WITH_TECH_DEBT',
          coverage: 30,
          skillAdaptation: {
            agentId: 'refactorer',
            suggestAdd: ['testing-expert'],
            suggestRemove: [],
            reason: 'inconsistent-coverage',
          },
        },
      ]),
      'utf-8',
    );

    // Ensure DB exists so writeRetrospective writes the retro entry.
    const brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    const dbPath = join(brainDir, 'memory.db');
    const seedStore = new MemoryStore(dbPath);
    seedStore.close();

    const sprint = makeSprint({ id: sprintId, number: 212 });
    const writeResult = writeRetrospective(tmpDir, sprint, new Map(), sprint.metrics!);
    expect(writeResult.retroWritten).toBe(true);

    const store = new MemoryStore(dbPath);
    try {
      const retro = store.getById(`retro-${sprintId}`);
      expect(retro).not.toBeNull();
      expect(retro!.content).toContain('## Next Sprint Behavior Changes');
      expect(retro!.content).toContain('refactorer');
      expect(retro!.content).toContain('testing-expert');
    } finally {
      store.close();
    }
  });
});
