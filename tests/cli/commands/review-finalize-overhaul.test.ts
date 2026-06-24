import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockImplementation((headers: string[], rows: string[][]) => {
    return [headers.join(' | '), ...rows.map((r) => r.join(' | '))].join('\n');
  }),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/cli/helpers/prompt.js', () => ({
  promptSelect: vi.fn(),
}));

vi.mock('../../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
}));

vi.mock('../../../src/orchestra/brain.js', () => ({
  finalizeSprint: vi.fn().mockResolvedValue({
    totalTasks: 2, completedTasks: 1, techDebtTasks: 1, noGoTasks: 0,
    coveragePercent: 90, durationMs: 5000,
  }),
}));

vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  evaluateResultSync: vi.fn().mockReturnValue('DONE'),
}));

vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/cli/helpers/messages.js', () => ({
  getMessage: vi.fn().mockImplementation((key: string, _lang: string, vars?: Record<string, string>) => {
    if (key === 'finalize.no_tasks') return 'No tasks found.';
    if (key === 'finalize.complete') return `Finalized ${vars?.sprintId}`;
    return key;
  }),
}));

vi.mock('../../../src/cli/helpers/config-reader.js', () => ({
  getLangFromConfig: vi.fn().mockReturnValue('en'),
}));

vi.mock('../../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(),
}));

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { print, printError, formatTable } from '../../../src/cli/helpers/output.js';
import { registerReview, loadReviewState, saveReviewState, detectMixedSprints as detectMixedSprintsReview } from '../../../src/cli/commands/review.js';
import { registerFinalize, detectIncompleteTasks, detectMixedSprints } from '../../../src/cli/commands/finalize.js';
import { promptSelect } from '../../../src/cli/helpers/prompt.js';
import { readJsonSafe } from '../../../src/core/utils.js';
import { finalizeSprint } from '../../../src/orchestra/brain.js';
import { killWorker } from '../../../src/orchestra/tmux.js';
import { evaluateResultSync } from '../../../src/orchestra/sprint-controller.js';
import { loadConfig } from '../../../src/core/config.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { getLangFromConfig } from '../../../src/cli/helpers/config-reader.js';
import { resolveProjectRoot } from '../../../src/cli/helpers/process.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const sampleTask = {
  id: '001',
  title: 'Test task',
  description: 'Desc',
  model: 'sonnet',
  effort: 'normal',
  priority: 'NORMAL',
  reason: 'test',
  scope: { directories: [], filesRead: [], filesWrite: [] },
  dependencies: [],
  goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
  status: 'DONE',
  sprintId: 'sprint-057',
};

const sampleResult = {
  taskId: '001',
  workerId: 'w-001',
  filesChanged: [],
  linesAdded: 10,
  linesRemoved: 2,
  testsPassed: true,
  coverage: 90,
  selfAssessment: 'DONE',
  notes: '',
};

async function runReview(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerReview(program);
  try { await program.parseAsync(['node', 'test', ...args]); } catch { /* exitOverride */ }
}

async function runFinalize(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerFinalize(program);
  try { await program.parseAsync(['node', 'test', ...args]); } catch { /* exitOverride */ }
}

// ─── Review Tests ───────────────────────────────────────────────────

describe('review overhaul', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveProjectRoot).mockReturnValue('/mock/root');
    vi.mocked(formatTable).mockImplementation((headers: string[], rows: string[][]) => {
      return [headers.join(' | '), ...rows.map((r: string[]) => r.join(' | '))].join('\n');
    });
    process.exitCode = undefined;
  });

  it('--approve-all approves all pending tasks', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleTask));
    await runReview(['review', '--approve-all']);
    expect(writeFileSync).toHaveBeenCalled();
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.join('\n')).toContain('approved');
  });

  it('--reject-all rejects all pending tasks', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleTask));
    await runReview(['review', '--reject-all']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.join('\n')).toContain('rejected');
  });

  it('--auto assigns retry for DONE + testsPassed=false', async () => {
    const failResult = { ...sampleResult, testsPassed: false };
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json')) return true;
      if (String(p).includes('task-001.result')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.result')) return JSON.stringify(failResult);
      return JSON.stringify(sampleTask);
    });
    await runReview(['review', '--auto']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('retry');
  });

  it('detects mixed sprint IDs', async () => {
    const task2 = { ...sampleTask, id: '002', sprintId: 'sprint-058' };
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('task-002')) return JSON.stringify(task2);
      return JSON.stringify(sampleTask);
    });
    await runReview(['review', '--auto']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.join('\n')).toContain('Mixed sprint IDs');
  });

  it('saves review state to both .tasks/ and .brain/reviews/', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const state = {
      sprintId: 'sprint-057',
      reviews: [{ taskId: '001', decision: 'approved' as const }],
      createdAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
    };
    saveReviewState('/mock/root', state);
    // Should write to two locations
    expect(writeFileSync).toHaveBeenCalledTimes(2);
    const paths = vi.mocked(writeFileSync).mock.calls.map(c => String(c[0]));
    expect(paths.some(p => p.includes('.tasks'))).toBe(true);
    expect(paths.some(p => p.includes('.brain/reviews'))).toBe(true);
  });

  it('loads review state from .brain/reviews/ persistent path', () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      return String(p).includes('.brain/reviews');
    });
    const state = {
      sprintId: 'sprint-057',
      reviews: [],
      createdAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
    };
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    const result = loadReviewState('/mock/root', 'sprint-057');
    expect(result).not.toBeNull();
    expect(result!.sprintId).toBe('sprint-057');
  });

  it('interactive review calls promptSelect for pending tasks', async () => {
    vi.mocked(promptSelect).mockResolvedValue('approved' as any);
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleTask));
    await runReview(['review']);
    expect(promptSelect).toHaveBeenCalled();
  });

  it('registers --approve-all and --reject-all options', () => {
    const program = new Command();
    registerReview(program);
    const cmd = program.commands.find(c => c.name() === 'review');
    expect(cmd!.options.some(o => o.long === '--approve-all')).toBe(true);
    expect(cmd!.options.some(o => o.long === '--reject-all')).toBe(true);
  });
});

// ─── Finalize Tests ─────────────────────────────────────────────────

describe('finalize overhaul', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(finalizeSprint).mockResolvedValue({
      totalTasks: 2, completedTasks: 1, techDebtTasks: 1, noGoTasks: 0,
      coveragePercent: 90, durationMs: 5000,
    } as any);
    vi.mocked(getMessage).mockImplementation((key: string, _lang: string, vars?: Record<string, string>) => {
      if (key === 'finalize.no_tasks') return 'No tasks found.';
      if (key === 'finalize.complete') return `Finalized ${vars?.sprintId}`;
      return key;
    });
    vi.mocked(getLangFromConfig).mockReturnValue('en');
    vi.mocked(resolveProjectRoot).mockReturnValue('/mock/root');
    vi.mocked(loadConfig).mockResolvedValue({} as any);
    vi.mocked(evaluateResultSync).mockReturnValue('DONE' as any);
    process.exitCode = undefined;
  });

  it('blocks finalize when tasks are in-progress without --force', async () => {
    const executingTask = { ...sampleTask, status: 'EXECUTING' };
    vi.mocked(readJsonSafe).mockImplementation((p: string) => {
      if (p.includes('task-001.json')) return executingTask;
      return null;
    });
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    await runFinalize(['finalize']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.join('\n')).toContain('Cannot finalize');
    expect(finalizeSprint).not.toHaveBeenCalled();
  });

  it('allows finalize with --force even with in-progress tasks', async () => {
    const executingTask = { ...sampleTask, status: 'EXECUTING' };
    vi.mocked(readJsonSafe).mockImplementation((p: string) => {
      if (p.includes('task-001.json')) return executingTask;
      return null;
    });
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    await runFinalize(['finalize', '--force']);
    expect(finalizeSprint).toHaveBeenCalled();
  });

  it('blocks duplicate finalize without --force', async () => {
    vi.mocked(readJsonSafe).mockImplementation((p: string) => {
      if (p.includes('task-001.json')) return sampleTask;
      if (p.includes('.result')) return sampleResult;
      return null;
    });
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('review-')) return false;
      if (s.endsWith('.tasks')) return true;
      // Sprint log exists = already finalized
      if (s.includes('sprints/sprint-057.md')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    await runFinalize(['finalize']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.join('\n')).toContain('already been finalized');
    expect(finalizeSprint).not.toHaveBeenCalled();
  });

  it('detects mixed sprint IDs and warns', async () => {
    const task2 = { ...sampleTask, id: '002', sprintId: 'sprint-058' };
    vi.mocked(readJsonSafe).mockImplementation((p: string) => {
      if (p.includes('task-002.json')) return task2;
      if (p.includes('task-001.json')) return sampleTask;
      if (p.includes('.result')) return sampleResult;
      return null;
    });
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('review-')) return false;
      if (s.endsWith('.tasks')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
    await runFinalize(['finalize']);
    const calls = vi.mocked(print).mock.calls.map(c => c[0]);
    expect(calls.join('\n')).toContain('Mixed sprint IDs');
  });

  it('integrates review rejected tasks as NO_GO', async () => {
    const reviewState = {
      sprintId: 'sprint-057',
      reviews: [{ taskId: '001', decision: 'rejected', reason: 'Bad' }],
      createdAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
    };
    vi.mocked(readJsonSafe).mockImplementation((p: string) => {
      if (p.includes('task-001.json')) return sampleTask;
      if (p.includes('.result')) return sampleResult;
      return null;
    });
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('.tasks') && !s.includes('task-')) return true;
      if (s.includes('.brain/reviews/review-sprint-057.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.includes('.tasks')) return ['task-001.json', 'task-001.result'] as any;
      return [] as any;
    });
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('review-')) return JSON.stringify(reviewState);
      return '{}';
    });
    await runFinalize(['finalize']);
    // finalizeSprint should have been called with NO_GO for task 001
    expect(finalizeSprint).toHaveBeenCalled();
    const evalMap = vi.mocked(finalizeSprint).mock.calls[0]?.[2] as Map<string, string>;
    expect(evalMap.get('001')).toBe('NO_GO');
  });

  it('registers --force option', () => {
    const program = new Command();
    registerFinalize(program);
    const cmd = program.commands.find(c => c.name() === 'finalize');
    expect(cmd!.options.some(o => o.long === '--force')).toBe(true);
  });
});

// ─── Unit Tests ─────────────────────────────────────────────────────

describe('detectIncompleteTasks', () => {
  it('detects EXECUTING and CLAIMED tasks', () => {
    const tasks = [
      { ...sampleTask, id: '001', status: 'EXECUTING' },
      { ...sampleTask, id: '002', status: 'DONE' },
      { ...sampleTask, id: '003', status: 'CLAIMED' },
    ] as any[];
    const result = detectIncompleteTasks(tasks);
    expect(result).toHaveLength(2);
    expect(result.map(t => t.id)).toEqual(['001', '003']);
  });
});

describe('detectMixedSprints', () => {
  it('returns unique sprint IDs', () => {
    const tasks = [
      { ...sampleTask, sprintId: 'sprint-057' },
      { ...sampleTask, sprintId: 'sprint-058' },
      { ...sampleTask, sprintId: 'sprint-057' },
    ] as any[];
    const result = detectMixedSprints(tasks);
    expect(result).toHaveLength(2);
    expect(result).toContain('sprint-057');
    expect(result).toContain('sprint-058');
  });
});
