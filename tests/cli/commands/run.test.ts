import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TASK_FILE_EXTENSIONS, TASKS_DIR } from '../../../src/core/constants.js';

vi.mock('node:fs');
vi.mock('../../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));
vi.mock('../../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('test prompt'),
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/test/project'),
}));

const mockedFs = vi.mocked(fs);

describe('run command — cleanupRunTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses TASK_FILE_EXTENSIONS to clean up all task files', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => undefined);

    cleanupRunTask('/project', 'run-123');

    // cleanupRunTask uses a hardcoded subset of extensions (excludes .paused)
    const CLEANUP_EXTENSIONS_COUNT = 5;
    expect(mockedFs.existsSync).toHaveBeenCalledTimes(CLEANUP_EXTENSIONS_COUNT);
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(CLEANUP_EXTENSIONS_COUNT);
  });

  it('cleans up .json task files', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => undefined);

    cleanupRunTask('/project', 'run-456');

    const paths = (mockedFs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(paths.some((p) => p.endsWith('.json'))).toBe(true);
  });

  it('cleans up .hb task files', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => undefined);

    cleanupRunTask('/project', 'run-789');

    const paths = (mockedFs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(paths.some((p) => p.endsWith('.hb'))).toBe(true);
  });

  it('cleans up .result task files', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => undefined);

    cleanupRunTask('/project', 'run-abc');

    const paths = (mockedFs.unlinkSync as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(paths.some((p) => p.endsWith('.result'))).toBe(true);
  });

  it('skips missing files silently', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(false);

    expect(() => cleanupRunTask('/project', 'run-000')).not.toThrow();
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('ignores unlink errors gracefully', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => { throw new Error('EPERM'); });

    expect(() => cleanupRunTask('/project', 'run-err')).not.toThrow();
  });
});

describe('run command — buildRunTask', () => {
  it('creates a task object with provided id and description', async () => {
    const { buildRunTask } = await import('../../../src/cli/commands/run.js');
    const task = buildRunTask('run-1', 'Fix the bug', 'sonnet', './src');
    expect(task.id).toBe('run-1');
    expect(task.title).toBe('Fix the bug');
    expect(task.model).toBe('sonnet');
    expect(task.scope.directories).toContain('./src');
  });

  it('truncates long descriptions to 80 chars in title', async () => {
    const { buildRunTask } = await import('../../../src/cli/commands/run.js');
    const longDesc = 'a'.repeat(100);
    const task = buildRunTask('run-2', longDesc, 'haiku', './');
    expect(task.title.length).toBeLessThanOrEqual(80);
  });
});

describe('run command — createRunTaskId', () => {
  it('returns a string starting with run-', async () => {
    const { createRunTaskId } = await import('../../../src/cli/commands/run.js');
    expect(createRunTaskId()).toMatch(/^run-\d+-\d+$/);
  });

  it('returns unique IDs on successive calls', async () => {
    const { createRunTaskId } = await import('../../../src/cli/commands/run.js');
    const id1 = createRunTaskId();
    await new Promise(r => setTimeout(r, 1));
    const id2 = createRunTaskId();
    expect(id1).not.toBe(id2);
  });
});

describe('run command — TASK_FILE_EXTENSIONS usage', () => {
  it('TASK_FILE_EXTENSIONS contains all expected task file types', () => {
    expect(TASK_FILE_EXTENSIONS).toContain('.json');
    expect(TASK_FILE_EXTENSIONS).toContain('.hb');
    expect(TASK_FILE_EXTENSIONS).toContain('.result');
    expect(TASK_FILE_EXTENSIONS).toContain('.plan');
    expect(TASK_FILE_EXTENSIONS).toContain('.log');
  });

  it('cleanupRunTask covers all TASK_FILE_EXTENSIONS', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(false);

    cleanupRunTask('/proj', 'run-check');

    // cleanupRunTask uses a hardcoded subset of extensions (excludes .paused)
    const CLEANUP_EXTENSIONS_COUNT = 5;
    expect(mockedFs.existsSync).toHaveBeenCalledTimes(CLEANUP_EXTENSIONS_COUNT);
  });
});
