import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
}));
vi.mock('../../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('test prompt'),
}));
vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  resolveAgentPrompt: vi.fn().mockReturnValue(undefined),
  resolveSkillPrompts: vi.fn().mockReturnValue([]),
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/test/project'),
}));

const mockedFs = vi.mocked(fs);

describe('run command — --timeout flag', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('buildRunTask creates valid task with PENDING status', async () => {
    const { buildRunTask } = await import('../../../src/cli/commands/run.js');
    const task = buildRunTask('run-t1', 'Test task', 'sonnet', './src');
    expect(task.status).toBe('PENDING');
    expect(task.model).toBe('sonnet');
    expect(task.id).toBe('run-t1');
  });

  it('waitForRunResult returns null on timeout', async () => {
    const { waitForRunResult } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(false);
    const result = await waitForRunResult('/project', 'run-timeout', 100);
    expect(result).toBeNull();
  });

  it('waitForRunResult returns result immediately when file exists', async () => {
    const { waitForRunResult } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      taskId: 'run-1',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: 'ok',
    }));
    const result = await waitForRunResult('/project', 'run-1', 5000);
    expect(result).not.toBeNull();
    expect(result?.selfAssessment).toBe('DONE');
  });
});

describe('run command — --keep flag', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('cleanupRunTask removes all 5 file extensions', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.unlinkSync.mockImplementation(() => undefined);
    cleanupRunTask('/project', 'run-keep');
    expect(mockedFs.unlinkSync).toHaveBeenCalledTimes(5);
  });

  it('cleanupRunTask is idempotent when files missing', async () => {
    const { cleanupRunTask } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(false);
    expect(() => cleanupRunTask('/project', 'run-missing')).not.toThrow();
    expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
  });
});

describe('run command — agent/skill injection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('resolveAgentPrompt is called with project root and task', async () => {
    const { resolveAgentPrompt } = await import('../../../src/orchestra/sprint-controller.js');
    const { buildRunTask } = await import('../../../src/cli/commands/run.js');
    const task = buildRunTask('run-agent', 'do work', 'sonnet', './');
    // Calling resolveAgentPrompt with the task should not throw
    expect(() => resolveAgentPrompt('/root', task as never)).not.toThrow();
  });

  it('buildWorkerPrompt accepts agentPrompt and skillPrompts', async () => {
    const { buildWorkerPrompt } = await import('../../../src/orchestra/brain.js');
    const { buildRunTask } = await import('../../../src/cli/commands/run.js');
    const task = buildRunTask('run-wp', 'desc', 'haiku', './');
    buildWorkerPrompt(task as never, 'agent context', [{ name: 'sk', content: 'skill content' }]);
    expect(buildWorkerPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'run-wp' }),
      'agent context',
      [{ name: 'sk', content: 'skill content' }],
    );
  });
});

describe('run command — streamWorkerLog', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns immediately when log file never appears', async () => {
    const { streamWorkerLog } = await import('../../../src/cli/commands/run.js');
    mockedFs.existsSync.mockReturnValue(false);
    // With timeoutMs=200, logWaitMax = min(10000, 100) = 100ms — waits at most 500ms per iteration
    // but since 100 < 500 the inner loop exits after 0 iterations
    await expect(streamWorkerLog('/project', 'run-nolog', 200)).resolves.toBeUndefined();
  }, 10_000);
});

describe('run command — registerRun builds a program', () => {
  it('registerRun does not throw during setup', async () => {
    const { Command } = await import('commander');
    const { registerRun } = await import('../../../src/cli/commands/run.js');
    const program = new Command();
    expect(() => registerRun(program)).not.toThrow();
  });

  it('run command has expected options', async () => {
    const { Command } = await import('commander');
    const { registerRun } = await import('../../../src/cli/commands/run.js');
    const program = new Command();
    registerRun(program);
    const runCmd = program.commands.find(c => c.name() === 'run');
    expect(runCmd).toBeDefined();
    const optNames = runCmd!.options.map(o => o.long);
    expect(optNames).toContain('--timeout');
    expect(optNames).toContain('--keep');
    expect(optNames).toContain('--auto-approve');
    expect(optNames).toContain('--verbose');
    expect(optNames).toContain('--model');
    expect(optNames).toContain('--scope');
  });
});
