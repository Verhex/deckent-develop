/**
 * tests/cli/commands/output.test.ts
 *
 * Tests for `npx deckent output <taskId>` command.
 * Covers: resolveOutputPath, readTailLines, formatLines, and CLI action.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  readdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/monitor/sprint-state.js', () => ({
  getCurrentSprintId: vi.fn().mockReturnValue('sprint-139'),
}));

import { readFileSync, existsSync, statSync } from 'node:fs';
import { print } from '../../../src/cli/helpers/output.js';
import {
  resolveOutputPath,
  readTailLines,
  formatLines,
  registerOutput,
} from '../../../src/cli/commands/output.js';
import { getCurrentSprintId } from '../../../src/monitor/sprint-state.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerOutput(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── resolveOutputPath ────────────────────────────────────────────────────────

describe('resolveOutputPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file path when output file exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    const result = resolveOutputPath('/root', 'task-001');
    expect(result).toBe('/root/.deckent/sprint-139-outputs/task-task-001.out');
  });

  it('returns null when output file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = resolveOutputPath('/root', 'task-001');
    expect(result).toBeNull();
  });

  it('uses provided sprintId when given', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const result = resolveOutputPath('/root', 'task-001', 'sprint-100');
    expect(result).toContain('sprint-100-outputs');
    expect(result).toContain('task-task-001.out');
  });

  it('uses getCurrentSprintId when sprintId not given', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-999');

    const result = resolveOutputPath('/root', 'my-task');
    expect(result).toContain('sprint-999-outputs');
  });

  it('falls back to sprint-unknown when getCurrentSprintId returns null', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(getCurrentSprintId).mockReturnValue(null);

    const result = resolveOutputPath('/root', 'task-001');
    expect(result).toContain('sprint-unknown-outputs');
  });
});

// ─── readTailLines ────────────────────────────────────────────────────────────

describe('readTailLines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns last N lines when file has more lines than N', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    vi.mocked(readFileSync).mockReturnValue(content);

    const result = readTailLines('/some/file.out', 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('line 90');
    expect(result[9]).toBe('line 99');
  });

  it('returns all lines when N > total lines', () => {
    vi.mocked(readFileSync).mockReturnValue('line 1\nline 2\nline 3');

    const result = readTailLines('/some/file.out', 50);
    expect(result).toHaveLength(3);
  });

  it('returns all lines when n <= 0', () => {
    vi.mocked(readFileSync).mockReturnValue('a\nb\nc\nd\ne');

    const result = readTailLines('/some/file.out', 0);
    expect(result).toHaveLength(5);
  });

  it('returns empty array when readFileSync throws', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('file not found');
    });

    const result = readTailLines('/nonexistent.out', 10);
    expect(result).toEqual([]);
  });
});

// ─── formatLines ─────────────────────────────────────────────────────────────

describe('formatLines', () => {
  it('joins lines with newline in plain mode', () => {
    const result = formatLines(['line1', 'line2', 'line3'], false);
    expect(result).toBe('line1\nline2\nline3');
  });

  it('wraps lines in JSON object when json=true', () => {
    const result = formatLines(['line1', 'line2'], true);
    const parsed = JSON.parse(result) as { lines: string[] };
    expect(parsed.lines).toEqual(['line1', 'line2']);
  });

  it('handles empty lines array', () => {
    expect(formatLines([], false)).toBe('');
    const json = formatLines([], true);
    expect(JSON.parse(json)).toEqual({ lines: [] });
  });
});

// ─── CLI action — no output file ─────────────────────────────────────────────

describe('output command — no file', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints "No output found" message when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(getCurrentSprintId).mockReturnValue('sprint-139');

    await runCommand(['output', 'task-001']);

    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('No output found for task task-001'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// ─── CLI action — file exists ─────────────────────────────────────────────────

describe('output command — file exists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('reads and prints last 50 lines by default', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const lines = Array.from({ length: 100 }, (_, i) => `[ts] [mixed] line ${i}`).join('\n');
    vi.mocked(readFileSync).mockReturnValue(lines);

    await runCommand(['output', 'task-001']);

    expect(vi.mocked(print)).toHaveBeenCalled();
    const callArg = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    // Should contain last lines
    expect(callArg).toContain('line 99');
  });

  it('--tail N reads last N lines', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    vi.mocked(readFileSync).mockReturnValue(lines);

    await runCommand(['output', 'task-001', '--tail', '5']);

    const callArg = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    expect(callArg).toContain('line 19');
    expect(callArg).not.toContain('line 0');
  });

  it('--json outputs JSON object with lines array', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('alpha\nbeta\ngamma');

    await runCommand(['output', 'task-001', '--json', '--tail', '10']);

    const callArg = vi.mocked(print).mock.calls[0]?.[0] ?? '';
    const parsed = JSON.parse(callArg) as { lines: string[] };
    expect(parsed.lines).toBeDefined();
    expect(Array.isArray(parsed.lines)).toBe(true);
  });

  it('--json includes read-only raw/effective receipt evidence and closes the projection', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((path: any) =>
      String(path).endsWith('.json')
        ? JSON.stringify({ id: 'task-001', status: 'PENDING' })
        : 'alpha\nbeta');
    const close = vi.fn();
    const program = new Command();
    program.exitOverride();
    registerOutput(program, {
      resolveProjectRootFn: () => '/mock/root',
      openTaskSettlementProjection: () => ({
        projectId: 'project-test',
        diagnostic: 'ready',
        projectTaskExecutionState: (_taskId, rawStatus) => ({
          rawStatus,
          effectiveStatus: 'NO_GO',
          evidenceRefs: ['task-result:sha256:evidence'],
          receiptRef: {
            schemaVersion: 1,
            tenantId: 'local',
            projectId: 'project-test',
            invocationId: 'invocation-1',
          },
          reasonCode: 'projected',
        }),
        close,
      }),
    });

    await program.parseAsync([
      'node', 'test', 'output', 'task-001', '--json', '--tail', '10',
    ]);

    const parsed = JSON.parse(vi.mocked(print).mock.calls.at(-1)?.[0] ?? '{}');
    expect(parsed.lines).toEqual(['alpha', 'beta']);
    expect(parsed.settlement).toMatchObject({
      taskId: 'task-001',
      rawStatus: 'PENDING',
      effectiveStatus: 'NO_GO',
      receiptRef: { invocationId: 'invocation-1' },
      evidenceRefs: ['task-result:sha256:evidence'],
    });
    expect(close).toHaveBeenCalledOnce();
  });
});

// ─── registerOutput ───────────────────────────────────────────────────────────

describe('registerOutput', () => {
  it('registers output command with taskId argument', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd).toBeDefined();
  });

  it('registers --tail option', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd?.options.some(o => o.long === '--tail')).toBe(true);
  });

  it('registers --follow option', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd?.options.some(o => o.long === '--follow')).toBe(true);
  });

  it('registers --json option', () => {
    const program = new Command();
    registerOutput(program);
    const cmd = program.commands.find(c => c.name() === 'output');
    expect(cmd?.options.some(o => o.long === '--json')).toBe(true);
  });
});
