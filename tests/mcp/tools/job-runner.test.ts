import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  JOBS_DIR: '.deckent/jobs',
  TASKS_DIR: '.tasks',
}));

import { buildTaskSummaries } from '../../../src/mcp/tools/job-runner.js';
import type { TaskSummary } from '../../../src/mcp/tools/job-runner.js';

describe('buildTaskSummaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns task summaries with data from result files', () => {
    const tasks = [
      { id: '067-001', title: 'Fix bug', assignedAgent: 'bug-fixer', assignedSkills: ['typescript-expert'] },
      { id: '067-002', title: 'Write tests', assignedAgent: 'test-writer', assignedSkills: ['testing-expert'] },
    ];

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(JSON.stringify({ selfAssessment: 'DONE', notes: 'Fixed the null pointer issue in config loader' }))
      .mockReturnValueOnce(JSON.stringify({ selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'Added 12 tests, coverage 94%' }));

    const summaries = buildTaskSummaries('/project', tasks);

    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject<TaskSummary>({
      taskId: '067-001',
      title: 'Fix bug',
      evaluation: 'DONE',
      agent: 'bug-fixer',
      skills: ['typescript-expert'],
      notes: 'Fixed the null pointer issue in config loader',
    });
    expect(summaries[1]).toMatchObject<TaskSummary>({
      taskId: '067-002',
      title: 'Write tests',
      evaluation: 'GO_WITH_TECH_DEBT',
      agent: 'test-writer',
      skills: ['testing-expert'],
      notes: 'Added 12 tests, coverage 94%',
    });
  });

  it('falls back to DONE evaluation when result file does not exist', () => {
    const tasks = [{ id: '067-003', title: 'Missing result', assignedAgent: 'generic', assignedSkills: [] }];

    vi.mocked(existsSync).mockReturnValue(false);

    const summaries = buildTaskSummaries('/project', tasks);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject<TaskSummary>({
      taskId: '067-003',
      title: 'Missing result',
      evaluation: 'DONE',
      agent: 'generic',
      skills: [],
      notes: '',
    });
  });

  it('falls back gracefully on malformed result file', () => {
    const tasks = [{ id: '067-004', title: 'Bad result file', assignedAgent: 'code-reviewer' }];

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json {{{');

    const summaries = buildTaskSummaries('/project', tasks);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.evaluation).toBe('DONE');
    expect(summaries[0]!.notes).toBe('');
    expect(summaries[0]!.agent).toBe('code-reviewer');
  });

  it('truncates notes to 200 characters', () => {
    const longNotes = 'A'.repeat(500);
    const tasks = [{ id: '067-005', title: 'Long notes task' }];

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ selfAssessment: 'DONE', notes: longNotes }),
    );

    const summaries = buildTaskSummaries('/project', tasks);

    expect(summaries[0]!.notes).toHaveLength(200);
    expect(summaries[0]!.notes).toBe('A'.repeat(200));
  });

  it('uses generic as default agent when assignedAgent is not set', () => {
    const tasks = [{ id: '067-006', title: 'No agent task' }];

    vi.mocked(existsSync).mockReturnValue(false);

    const summaries = buildTaskSummaries('/project', tasks);

    expect(summaries[0]!.agent).toBe('generic');
    expect(summaries[0]!.skills).toEqual([]);
  });

  it('returns empty array for empty task list', () => {
    const summaries = buildTaskSummaries('/project', []);
    expect(summaries).toEqual([]);
  });

  it('reads result file from correct path', () => {
    const tasks = [{ id: '067-007', title: 'Path check' }];

    vi.mocked(existsSync).mockImplementation((p: unknown) => {
      return String(p).includes('task-067-007.result');
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ selfAssessment: 'NO_GO', notes: 'Failed tests' }));

    const summaries = buildTaskSummaries('/myproject', tasks);

    expect(vi.mocked(existsSync)).toHaveBeenCalledWith(
      expect.stringContaining('task-067-007.result'),
    );
    expect(summaries[0]!.evaluation).toBe('NO_GO');
  });
});
