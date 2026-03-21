import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  mkdirSync: vi.fn(),
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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerReview, loadReviewState, saveReviewState } from '../../../src/cli/commands/review.js';

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
  sprintId: 'sprint-030',
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

const noGoResult = {
  ...sampleResult,
  selfAssessment: 'NO_GO',
  testsPassed: false,
};

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerReview(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('review command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('registers review command with --auto and --json', () => {
    const program = new Command();
    registerReview(program);
    const cmd = program.commands.find((c) => c.name() === 'review');
    expect(cmd).toBeDefined();
    expect(cmd!.options.some((o) => o.long === '--auto')).toBe(true);
    expect(cmd!.options.some((o) => o.long === '--json')).toBe(true);
  });

  it('shows no tasks message when no task files', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([] as any);
    await runCommand(['review']);
    expect(print).toHaveBeenCalledWith('No tasks found. Run a sprint first.');
  });

  it('shows review table with pending tasks', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('.tasks')) return true;
      if (s.includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleTask));
    await runCommand(['review']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('pending');
  });

  it('--auto approves DONE tasks', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json')) return true;
      if (String(p).includes('task-001.result')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.result')) return JSON.stringify(sampleResult);
      return JSON.stringify(sampleTask);
    });
    await runCommand(['review', '--auto']);
    expect(writeFileSync).toHaveBeenCalled();
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Auto-review complete');
  });

  it('--auto rejects NO_GO tasks', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json')) return true;
      if (String(p).includes('task-001.result')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('.result')) return JSON.stringify(noGoResult);
      return JSON.stringify(sampleTask);
    });
    await runCommand(['review', '--auto']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('rejected');
  });

  it('--json outputs JSON state', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-')) return true;
      if (String(p).includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleTask));
    await runCommand(['review', '--json']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const jsonOutput = calls.find((c) => {
      try { JSON.parse(c); return true; } catch { return false; }
    });
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.sprintId).toBe('sprint-030');
  });

  it('shows summary with counts', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const s = String(p);
      if (s.endsWith('.tasks')) return true;
      if (s.includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(sampleTask));
    await runCommand(['review']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Summary:');
    expect(output).toContain('approved');
    expect(output).toContain('pending');
  });

  it('loads existing review state if available', async () => {
    const existingState = {
      sprintId: 'sprint-030',
      reviews: [{ taskId: '001', decision: 'approved', reviewedAt: '2026-03-22T00:00:00Z' }],
      createdAt: '2026-03-22T00:00:00Z',
      updatedAt: '2026-03-22T00:00:00Z',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('review-')) return JSON.stringify(existingState);
      return JSON.stringify(sampleTask);
    });
    await runCommand(['review']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('approved');
  });

  it('handles error gracefully', async () => {
    vi.mocked(existsSync).mockImplementation(() => { throw new Error('FS error'); });
    vi.mocked(readdirSync).mockReturnValue([] as any);
    await runCommand(['review']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('detects sprint id from tasks', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-')) return true;
      if (String(p).includes('task-001.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json'] as any);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ ...sampleTask, sprintId: 'sprint-042' }));
    await runCommand(['review', '--json']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const jsonOutput = calls.find((c) => {
      try { JSON.parse(c); return true; } catch { return false; }
    });
    const parsed = JSON.parse(jsonOutput!);
    expect(parsed.sprintId).toBe('sprint-042');
  });

  it('multiple tasks review: shows all in table', async () => {
    const task2 = { ...sampleTask, id: '002', status: 'NO_GO' };
    vi.mocked(existsSync).mockImplementation((p: any) => {
      if (String(p).includes('.tasks') && !String(p).includes('task-') && !String(p).includes('review-')) return true;
      if (String(p).includes('task-001.json') || String(p).includes('task-002.json')) return true;
      return false;
    });
    vi.mocked(readdirSync).mockReturnValue(['task-001.json', 'task-002.json'] as any);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('task-002')) return JSON.stringify(task2);
      return JSON.stringify(sampleTask);
    });
    await runCommand(['review']);
    const calls = vi.mocked(print).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('001');
    expect(output).toContain('002');
  });
});

describe('loadReviewState', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns null when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(loadReviewState('/mock/root', 'sprint-001')).toBeNull();
  });

  it('returns parsed state when file exists', () => {
    const state = {
      sprintId: 'sprint-001',
      reviews: [],
      createdAt: '2026-03-22T00:00:00Z',
      updatedAt: '2026-03-22T00:00:00Z',
    };
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(state));
    const result = loadReviewState('/mock/root', 'sprint-001');
    expect(result).not.toBeNull();
    expect(result!.sprintId).toBe('sprint-001');
  });

  it('returns null for malformed JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('INVALID');
    expect(loadReviewState('/mock/root', 'sprint-001')).toBeNull();
  });
});

describe('saveReviewState', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('writes review state to file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const state = {
      sprintId: 'sprint-001',
      reviews: [{ taskId: '001', decision: 'approved' as const }],
      createdAt: '2026-03-22T00:00:00Z',
      updatedAt: '2026-03-22T00:00:00Z',
    };
    saveReviewState('/mock/root', state);
    expect(writeFileSync).toHaveBeenCalled();
  });
});
