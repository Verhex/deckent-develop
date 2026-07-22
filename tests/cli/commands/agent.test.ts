import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  formatTable: vi.fn().mockReturnValue('formatted-table'),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { print, printError, formatTable } from '../../../src/cli/helpers/output.js';
import { registerAgent } from '../../../src/cli/commands/agent.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAgentConfig(overrides?: Partial<Record<string, unknown>>) {
  return {
    name: 'test-agent',
    type: 'custom',
    enabled: true,
    model: 'claude-sonnet-5',
    triggers: ['test'],
    description: 'Test agent',
    uses: 5,
    successRate: 80,
    createdAt: '2026-03-22T00:00:00.000Z',
    updatedAt: '2026-03-22T00:00:00.000Z',
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerAgent(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on --help / exit
  }
}

// ─── Task 19: agent list ─────────────────────────────────────────────────────

describe('agent command registration', () => {
  it('registers agent command on program', () => {
    const program = new Command();
    registerAgent(program);
    const cmd = program.commands.find(c => c.name() === 'agent');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('agent');
  });

  it('has list subcommand', () => {
    const program = new Command();
    registerAgent(program);
    const cmd = program.commands.find(c => c.name() === 'agent')!;
    const list = cmd.commands.find(c => c.name() === 'list');
    expect(list).toBeDefined();
  });

  it('has create subcommand', () => {
    const program = new Command();
    registerAgent(program);
    const cmd = program.commands.find(c => c.name() === 'agent')!;
    const create = cmd.commands.find(c => c.name() === 'create');
    expect(create).toBeDefined();
  });

  it('has enable subcommand', () => {
    const program = new Command();
    registerAgent(program);
    const cmd = program.commands.find(c => c.name() === 'agent')!;
    const enable = cmd.commands.find(c => c.name() === 'enable');
    expect(enable).toBeDefined();
  });

  it('has disable subcommand', () => {
    const program = new Command();
    registerAgent(program);
    const cmd = program.commands.find(c => c.name() === 'agent')!;
    const disable = cmd.commands.find(c => c.name() === 'disable');
    expect(disable).toBeDefined();
  });
});

describe('agent list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints no agents message when directory does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No agents found'));
  });

  it('prints no agents message when directory is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    await runCommand(['agent', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No agents found'));
  });

  it('prints formatted table when agents exist', async () => {
    const agent = makeAgentConfig();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-agent', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      ['Name', 'Type', 'Status', 'Uses', 'Success', 'Model'],
      [['test-agent', 'custom', 'enabled', '5', '80%', 'claude-sonnet-5']],
    );
    expect(print).toHaveBeenCalledWith('formatted-table');
  });

  it('outputs JSON when --json flag is used', async () => {
    const agent = makeAgentConfig();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-agent', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'list', '--json']);
    const printCalls = vi.mocked(print).mock.calls;
    const jsonCall = printCalls.find(c => {
      try { JSON.parse(c[0]); return true; } catch { return false; }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse(jsonCall![0]);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].name).toBe('test-agent');
  });

  it('shows disabled status for disabled agent', async () => {
    const agent = makeAgentConfig({ enabled: false });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-agent', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      [expect.arrayContaining(['disabled'])],
    );
  });

  it('handles multiple agents', async () => {
    const agent1 = makeAgentConfig({ name: 'alpha' });
    const agent2 = makeAgentConfig({ name: 'beta', model: 'claude-opus-4-8', uses: 10 });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'alpha', isDirectory: () => true } as any,
      { name: 'beta', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync)
      .mockReturnValueOnce(JSON.stringify(agent1))
      .mockReturnValueOnce(JSON.stringify(agent2));
    await runCommand(['agent', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining([
        expect.arrayContaining(['alpha']),
        expect.arrayContaining(['beta']),
      ]),
    );
  });

  it('sets exitCode=1 on error', async () => {
    vi.mocked(existsSync).mockImplementation(() => { throw new Error('access denied'); });
    await runCommand(['agent', 'list']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('skips non-directory entries', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'not-a-dir', isDirectory: () => false } as any,
    ]);
    await runCommand(['agent', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No agents found'));
  });

  it('skips malformed agent configs', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'broken', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue('{invalid json');
    await runCommand(['agent', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No agents found'));
  });

  it('rounds success rate to integer', async () => {
    const agent = makeAgentConfig({ successRate: 83.333 });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'test-agent', isDirectory: () => true } as any,
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'list']);
    expect(formatTable).toHaveBeenCalledWith(
      expect.any(Array),
      [expect.arrayContaining(['83%'])],
    );
  });
});

// ─── Task 20: agent create ───────────────────────────────────────────────────

describe('agent create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('creates agent directory and files', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'create', 'my-agent']);
    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('my-agent'),
      { recursive: true },
    );
    expect(writeFileSync).toHaveBeenCalledTimes(2); // agent.json + PROMPT.md
  });

  it('writes valid agent.json with defaults', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'create', 'new-agent']);
    const jsonCall = vi.mocked(writeFileSync).mock.calls.find(
      c => String(c[0]).includes('agent.json'),
    );
    expect(jsonCall).toBeDefined();
    const config = JSON.parse(String(jsonCall![1]));
    expect(config.id).toBe('new-agent');
    expect(config.name).toBe('new-agent');
    expect(config.source).toBe('user');
    expect(config.enabled).toBe(true);
    expect(config.preferredModel).toBe('claude-opus-4-8');
    expect(config.stats.totalUses).toBe(0);
    expect(config.stats.successRate).toBe(0);
  });

  it('writes PROMPT.md template with agent name', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'create', 'code-fixer']);
    const promptCall = vi.mocked(writeFileSync).mock.calls.find(
      c => String(c[0]).includes('PROMPT.md'),
    );
    expect(promptCall).toBeDefined();
    expect(String(promptCall![1])).toContain('code-fixer');
    expect(String(promptCall![1])).toContain('# Agent:');
  });

  it('prints success message with directory', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'create', 'my-agent']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('my-agent'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('created'));
  });

  it('rejects invalid name with special characters', async () => {
    await runCommand(['agent', 'create', 'bad agent!']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid agent name') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects name with underscores', async () => {
    await runCommand(['agent', 'create', 'bad_name']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid agent name') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects empty-like name (spaces)', async () => {
    // Commander will see this as missing argument, but we test through the validator
    await runCommand(['agent', 'create', '@#$']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('rejects duplicate agent', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    await runCommand(['agent', 'create', 'existing-agent']);
    expect(printError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('already exists') }),
    );
    expect(process.exitCode).toBe(1);
  });

  it('accepts alphanumeric name with hyphens', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'create', 'my-agent-v2']);
    expect(printError).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledWith(expect.stringContaining('my-agent-v2'));
  });

  it('prints file list after creation', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'create', 'test-writer']);
    expect(print).toHaveBeenCalledWith('  - agent.json');
    expect(print).toHaveBeenCalledWith('  - PROMPT.md');
  });

  it('sets exitCode=1 on filesystem error', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockImplementation(() => { throw new Error('EACCES'); });
    await runCommand(['agent', 'create', 'test']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

// ─── Task 21: agent enable/disable ───────────────────────────────────────────

describe('agent enable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets enabled=true in agent.json', async () => {
    const agent = makeAgentConfig({ enabled: false });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'enable', 'test-agent']);
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.enabled).toBe(true);
  });

  it('prints success message', async () => {
    const agent = makeAgentConfig({ enabled: false });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'enable', 'test-agent']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('enabled'));
  });

  it('updates updatedAt timestamp', async () => {
    const agent = makeAgentConfig({ enabled: false, updatedAt: '2026-01-01T00:00:00.000Z' });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'enable', 'test-agent']);
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('sets exitCode=1 when agent not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'enable', 'nonexistent']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe('agent disable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets enabled=false in agent.json', async () => {
    const agent = makeAgentConfig({ enabled: true });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'disable', 'test-agent']);
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.enabled).toBe(false);
  });

  it('prints success message', async () => {
    const agent = makeAgentConfig({ enabled: true });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agent));
    await runCommand(['agent', 'disable', 'test-agent']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });

  it('sets exitCode=1 when agent not found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['agent', 'disable', 'missing']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

// ─── Task 316-003: agent stats — mentions≠success ────────────────────────────

describe('agent stats — successRate from real task count not mentions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('returns successRate ~33% when 3 rows: 1 DONE + 2 NO_GO (not 100% via mentions-conflation)', async () => {
    // Fixture: real 4-column sprint table with 3 rows for "my-agent": 1 DONE, 2 NO_GO
    // OLD code: mentions=3, taskLineRegex matches 0 rows (old 3-col/GO-only regex) → fallback
    //   → tasks=mentions=3, success=mentions=3, successRate=100%  — test FAILS on old code
    // NEW code: 4-col regex matches all 3 rows, filters by agent, tasks=3, success=1, rate=33%
    const sprintContent = [
      '## Tasks',
      '| Task | Agent | Skills | Status |',
      '|------|-------|--------|--------|',
      '| 1-001: work item | my-agent | typescript-expert | DONE |',
      '| 1-002: another item | my-agent | typescript-expert | NO_GO |',
      '| 1-003: third item | my-agent | typescript-expert | NO_GO |',
    ].join('\n');

    const agentConfig = makeAgentConfig({ name: 'my-agent' });

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: unknown) => {
      if (String(path).includes('.brain/sprints')) return ['sprint-1.md'] as any;
      return [{ name: 'my-agent', isDirectory: () => true }] as any;
    });
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      if (String(path).includes('sprint-1.md')) return sprintContent;
      return JSON.stringify(agentConfig);
    });

    await runCommand(['agent', 'stats', 'my-agent']);

    expect(formatTable).toHaveBeenCalledWith(
      ['Sprint', 'Tasks', 'Success', 'Rate'],
      [['sprint-1', '3', '1', '33%']],
    );
  });

  it('shows - for rate when agent is mentioned but has no task rows', async () => {
    const sprintContent = 'Shoutout to my-agent for the great work this sprint.\n';

    const agentConfig = makeAgentConfig({ name: 'my-agent' });

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: unknown) => {
      if (String(path).includes('.brain/sprints')) return ['sprint-1.md'] as any;
      return [{ name: 'my-agent', isDirectory: () => true }] as any;
    });
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      if (String(path).includes('sprint-1.md')) return sprintContent;
      return JSON.stringify(agentConfig);
    });

    await runCommand(['agent', 'stats', 'my-agent']);

    expect(formatTable).toHaveBeenCalledWith(
      ['Sprint', 'Tasks', 'Success', 'Rate'],
      [['sprint-1', '0', '0', '-']],
    );
  });

  it('does not count tasks assigned to other agents', async () => {
    const sprintContent = [
      '| Task | Agent | Skills | Status |',
      '|------|-------|--------|--------|',
      '| task-A | my-agent | skill | DONE |',
      '| task-B | other-agent | skill | NO_GO |',
    ].join('\n');

    const agentConfig = makeAgentConfig({ name: 'my-agent' });

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: unknown) => {
      if (String(path).includes('.brain/sprints')) return ['sprint-1.md'] as any;
      return [{ name: 'my-agent', isDirectory: () => true }] as any;
    });
    vi.mocked(readFileSync).mockImplementation((path: unknown) => {
      if (String(path).includes('sprint-1.md')) return sprintContent;
      return JSON.stringify(agentConfig);
    });

    await runCommand(['agent', 'stats', 'my-agent']);

    // Only the 1 row for my-agent should be counted (100% success from 1 DONE)
    expect(formatTable).toHaveBeenCalledWith(
      ['Sprint', 'Tasks', 'Success', 'Rate'],
      [['sprint-1', '1', '1', '100%']],
    );
  });

  it('returns empty stats when sprints directory does not exist', async () => {
    const agentConfig = makeAgentConfig({ name: 'my-agent' });

    vi.mocked(existsSync).mockImplementation((path: unknown) => {
      if (String(path).includes('.brain/sprints')) return false;
      return true;
    });
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify(agentConfig));

    await runCommand(['agent', 'stats', 'my-agent']);

    expect(print).toHaveBeenCalledWith('No sprint history found for this agent.');
    expect(formatTable).not.toHaveBeenCalled();
  });
});
