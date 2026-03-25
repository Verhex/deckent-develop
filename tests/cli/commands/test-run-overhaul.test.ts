import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');
vi.mock('../../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    activeModeConfig: {
      default_model: 'sonnet',
      brain_model: 'sonnet',
      haiku_allowed: true,
      max_workers: 3,
    },
  }),
}));
vi.mock('../../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn().mockResolvedValue({
    id: 'sprint-test',
    tasks: [
      { title: 'Task A', status: 'DONE' },
      { title: 'Task B', status: 'DONE' },
    ],
    metrics: { noGoTasks: 0 },
  }),
  BrainError: class BrainError extends Error {
    phase?: string;
    constructor(msg: string, phase?: string) {
      super(msg);
      this.phase = phase;
    }
  },
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/test/project'),
}));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatSprintSummary: vi.fn().mockReturnValue('Sprint summary'),
}));
vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('No local changes to save'),
}));

const mockedFs = vi.mocked(fs);

describe('test-run — formatJUnit', () => {
  it('produces valid XML with test cases', async () => {
    const { formatJUnit } = await import('../../../src/cli/commands/test-run.js');
    const tasks = [
      { title: 'Task A', status: 'DONE' },
      { title: 'Task B', status: 'NO_GO', notes: 'Failed' },
    ];
    const xml = formatJUnit('sprint-001', tasks);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('tests="2"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('Task A');
    expect(xml).toContain('Task B');
    expect(xml).toContain('<failure');
  });

  it('escapes XML special characters in task titles', async () => {
    const { formatJUnit } = await import('../../../src/cli/commands/test-run.js');
    const tasks = [{ title: 'Fix <bug> & "issue"', status: 'DONE' }];
    const xml = formatJUnit('sprint-001', tasks);
    expect(xml).toContain('&lt;bug&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;issue&quot;');
  });

  it('produces no failures element for passing tasks', async () => {
    const { formatJUnit } = await import('../../../src/cli/commands/test-run.js');
    const tasks = [{ title: 'All Good', status: 'DONE' }];
    const xml = formatJUnit('sprint-001', tasks);
    expect(xml).toContain('failures="0"');
    expect(xml).not.toContain('<failure');
  });
});

describe('test-run — formatTAP', () => {
  it('produces TAP header and test lines', async () => {
    const { formatTAP } = await import('../../../src/cli/commands/test-run.js');
    const tasks = [
      { title: 'Task A', status: 'DONE' },
      { title: 'Task B', status: 'NO_GO' },
    ];
    const tap = formatTAP(tasks);
    expect(tap).toContain('TAP version 13');
    expect(tap).toContain('1..2');
    expect(tap).toContain('ok 1 - Task A');
    expect(tap).toContain('not ok 2 - Task B');
  });

  it('marks all as ok when no NO_GO tasks', async () => {
    const { formatTAP } = await import('../../../src/cli/commands/test-run.js');
    const tasks = [{ title: 'T1', status: 'DONE' }, { title: 'T2', status: 'DONE' }];
    const tap = formatTAP(tasks);
    expect(tap).not.toContain('not ok');
    expect(tap).toContain('ok 1 - T1');
    expect(tap).toContain('ok 2 - T2');
  });
});

describe('test-run — gitStash / gitStashPop', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('gitStash returns false when no local changes', async () => {
    const childProcess = await import('node:child_process');
    vi.mocked(childProcess.execSync).mockReturnValue('No local changes to save' as never);
    const { gitStash } = await import('../../../src/cli/commands/test-run.js');
    const result = gitStash('/project');
    expect(result).toBe(false);
  });

  it('gitStash returns true when changes stashed', async () => {
    const childProcess = await import('node:child_process');
    vi.mocked(childProcess.execSync).mockReturnValue('Saved working directory' as never);
    const { gitStash } = await import('../../../src/cli/commands/test-run.js');
    const result = gitStash('/project');
    expect(result).toBe(true);
  });

  it('gitStash returns false on execSync error', async () => {
    const childProcess = await import('node:child_process');
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('not a git repo'); });
    const { gitStash } = await import('../../../src/cli/commands/test-run.js');
    expect(() => gitStash('/project')).not.toThrow();
  });

  it('gitStashPop does not throw on error', async () => {
    const childProcess = await import('node:child_process');
    vi.mocked(childProcess.execSync).mockImplementation(() => { throw new Error('nothing to pop'); });
    const { gitStashPop } = await import('../../../src/cli/commands/test-run.js');
    expect(() => gitStashPop('/project')).not.toThrow();
  });
});

describe('test-run — registerTestRun', () => {
  it('test command has --directives, --sandbox, --model, --reporter options', async () => {
    const { Command } = await import('commander');
    const { registerTestRun } = await import('../../../src/cli/commands/test-run.js');
    const program = new Command();
    registerTestRun(program);
    const cmd = program.commands.find(c => c.name() === 'test');
    expect(cmd).toBeDefined();
    const optNames = cmd!.options.map(o => o.long);
    expect(optNames).toContain('--directives');
    expect(optNames).toContain('--sandbox');
    expect(optNames).toContain('--model');
    expect(optNames).toContain('--reporter');
    expect(optNames).toContain('--keep');
    expect(optNames).toContain('--timeout');
  });

  it('test command rejects invalid reporter', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    const { Command } = await import('commander');
    const { registerTestRun } = await import('../../../src/cli/commands/test-run.js');
    const { printError } = await import('../../../src/cli/helpers/output.js');
    const program = new Command();
    program.exitOverride();
    registerTestRun(program);
    const cmd = program.commands.find(c => c.name() === 'test')!;
    await cmd.parseAsync(['--reporter', 'invalid'], { from: 'user' });
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid reporter') }));
  });

  it('test command rejects invalid model', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    const { Command } = await import('commander');
    const { registerTestRun } = await import('../../../src/cli/commands/test-run.js');
    const { printError } = await import('../../../src/cli/helpers/output.js');
    const program = new Command();
    program.exitOverride();
    registerTestRun(program);
    const cmd = program.commands.find(c => c.name() === 'test')!;
    await cmd.parseAsync(['--model', 'invalid-model'], { from: 'user' });
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid model') }));
  });
});
