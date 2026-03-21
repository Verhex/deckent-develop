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
    model: 'sonnet',
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
      [['test-agent', 'custom', 'enabled', '5', '80%', 'sonnet']],
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
    const agent2 = makeAgentConfig({ name: 'beta', model: 'opus', uses: 10 });
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
    expect(config.name).toBe('new-agent');
    expect(config.type).toBe('custom');
    expect(config.enabled).toBe(true);
    expect(config.model).toBe('sonnet');
    expect(config.uses).toBe(0);
    expect(config.successRate).toBe(0);
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
