import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  changelogUpdater,
  parseCategoryHints,
} from '../../src/orchestra/doc-updaters/changelog.js';
import {
  TaskEvaluation,
  TaskStatus,
  SprintPhase,
  SprintStatus,
} from '../../src/core/types.js';
import type {
  DocUpdateContext,
} from '../../src/orchestra/doc-updaters/types.js';
import type {
  Sprint,
  SprintMetrics,
  Task,
  TaskResult,
} from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeTask(id: string, title: string): Task {
  return {
    id,
    title,
    description: 'd',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'r',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-189',
  };
}

function makeResult(taskId: string, notes: string): TaskResult {
  return {
    taskId,
    workerId: 'w-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE' as const,
    notes,
  };
}

function makeCtx(overrides: Partial<DocUpdateContext> = {}): DocUpdateContext {
  const sprint: Sprint = {
    id: 'sprint-189',
    number: 189,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [makeTask('189-016', 'CHANGELOG sprint-reporter auto-update wire')],
    workers: ['w-1'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 5000,
    coveragePercent: 90,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
  const config = {
    mode: 'max_plan' as const,
    activeModeConfig: {} as any,
    modes: {} as any,
    language: 'en',
    projectName: 'test',
    projectRoot: '/proj',
    version: '0.0.0',
    auto_docs: { tier1: true, tier2: false, tier3: false },
  };
  return {
    projectRoot: '/proj',
    sprintResult: {
      sprint,
      evaluations: new Map([['189-016', TaskEvaluation.DONE]]),
      metrics,
    },
    config,
    isInternalProject: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
  mockedReadFileSync.mockImplementation((p: any) => {
    if (String(p).endsWith('package.json'))
      return JSON.stringify({ version: '1.0.0-beta.1' });
    return '';
  });
});

describe('parseCategoryHints', () => {
  it('extracts Added/Changed/Fixed prefixed lines (case-insensitive)', () => {
    const notes = [
      'Some preamble',
      'Added: doc-updaters now receive worker results',
      'fixed: changelog duplicate-entry regression',
      'CHANGED: keep-a-changelog header preserved',
      'unrelated note',
    ].join('\n');
    const hints = parseCategoryHints(notes);
    expect(hints.added).toEqual([
      'doc-updaters now receive worker results',
    ]);
    expect(hints.fixed).toEqual([
      'changelog duplicate-entry regression',
    ]);
    expect(hints.changed).toEqual([
      'keep-a-changelog header preserved',
    ]);
  });

  it('returns empty buckets for empty/null input', () => {
    expect(parseCategoryHints('')).toEqual({ added: [], changed: [], fixed: [] });
    expect(parseCategoryHints(undefined)).toEqual({ added: [], changed: [], fixed: [] });
    expect(parseCategoryHints(null)).toEqual({ added: [], changed: [], fixed: [] });
  });

  it('ignores prefix-shaped lines with empty body', () => {
    expect(parseCategoryHints('Added:   ').added).toEqual([]);
  });
});

describe('changelogUpdater — sprint-finalizer wire', () => {
  it('appends a new sprint entry with Keep a Changelog format', () => {
    const result = changelogUpdater.run(makeCtx());
    expect(result.updated).toBe(true);
    expect(result.reason).toBe('created');
    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('## [sprint189]');
    expect(written).toContain('### Added');
    expect(written).toContain('CHANGELOG sprint-reporter auto-update wire');
    expect(written).toContain('_Tasks: 1 total, 1 done');
  });

  it('routes Added: / Changed: / Fixed: prefixes from result.notes into their sections', () => {
    const ctx = makeCtx();
    ctx.sprintResult.sprint.tasks = [
      makeTask('189-001', 'Big refactor with multiple deliverables'),
    ];
    ctx.sprintResult.evaluations = new Map([
      ['189-001', TaskEvaluation.DONE],
    ]);
    ctx.results = [
      makeResult(
        '189-001',
        [
          'Honest self-assessment: DONE',
          'Added: cost-gate shared helper for CLI + MCP',
          'Changed: deckent_start autoApprove default flipped to false',
          'Fixed: provider isAvailable returning false when binary exists',
        ].join('\n'),
      ),
    ];

    changelogUpdater.run(ctx);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('### Added');
    expect(written).toContain('- cost-gate shared helper for CLI + MCP');
    expect(written).toContain('### Changed');
    expect(written).toContain('- deckent_start autoApprove default flipped to false');
    expect(written).toContain('### Fixed');
    expect(written).toContain('- provider isAvailable returning false when binary exists');
    // Task title fallback should NOT appear when explicit hints are present.
    expect(written).not.toContain('Big refactor with multiple deliverables');
  });

  it('skips duplicate entries when the sprint version header already exists', () => {
    const existing =
      '# Changelog\n\nDesc\n\n## [sprint189] - 2026-05-22\n\n### Added\n\n- prior entry\n';
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation((p: any) => {
      if (String(p).endsWith('package.json'))
        return JSON.stringify({ version: '1.0.0-beta.1' });
      return existing;
    });

    const result = changelogUpdater.run(makeCtx());
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('duplicate_sprint_entry');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('falls back to title heuristic when notes carry no category prefix', () => {
    const ctx = makeCtx();
    ctx.sprintResult.sprint.tasks = [
      makeTask('189-100', 'Fix flaky CHANGELOG regression'),
    ];
    ctx.sprintResult.evaluations = new Map([
      ['189-100', TaskEvaluation.DONE],
    ]);
    ctx.results = [makeResult('189-100', 'No explicit hints here.')];

    changelogUpdater.run(ctx);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('### Fixed');
    expect(written).toContain('Fix flaky CHANGELOG regression');
  });

  it('deduplicates repeated Added: lines within the same sprint', () => {
    const ctx = makeCtx();
    ctx.sprintResult.sprint.tasks = [
      makeTask('189-100', 'Task A'),
      makeTask('189-101', 'Task B'),
    ];
    ctx.sprintResult.evaluations = new Map([
      ['189-100', TaskEvaluation.DONE],
      ['189-101', TaskEvaluation.DONE],
    ]);
    ctx.results = [
      makeResult('189-100', 'Added: shared schema validation helper'),
      makeResult('189-101', 'Added: shared schema validation helper'),
    ];

    changelogUpdater.run(ctx);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    const occurrences = written.match(/shared schema validation helper/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('keeps GO_WITH_TECH_DEBT annotation when notes have no Changed: hint', () => {
    const ctx = makeCtx();
    ctx.sprintResult.evaluations = new Map([
      ['189-016', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    ctx.results = [
      makeResult('189-016', 'Added: partial wire complete, missing dashboard hook'),
    ];

    changelogUpdater.run(ctx);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('### Added');
    expect(written).toContain('- partial wire complete, missing dashboard hook');
    expect(written).toContain('### Changed');
    expect(written).toContain('completed with tech debt');
  });
});
