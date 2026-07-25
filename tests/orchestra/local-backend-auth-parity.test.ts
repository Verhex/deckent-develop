import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn(() => ({
      pid: 1,
      status: 1,
      signal: null,
      output: ['', '{"loggedIn":false}', ''],
      stdout: '{"loggedIn":false}',
      stderr: '',
    })),
  };
});

import { spawnSync } from 'node:child_process';
import {
  preflightClaudeAuthForLocalBackend,
  SandboxBackend,
  SubprocessBackend,
  TmuxBackend,
} from '../../src/orchestra/spawn-backend.js';

const mockedSpawnSync = vi.mocked(spawnSync);

describe('non-Docker Claude auth-loss preflight parity', () => {
  let projectDir: string;

  beforeEach(() => {
    mockedSpawnSync.mockClear();
    projectDir = mkdtempSync(join(tmpdir(), 'deckent-local-auth-'));
    mkdirSync(join(projectDir, '.tasks'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function writeTaskFixture(taskId: string): void {
    writeFileSync(
      join(projectDir, '.tasks', `task-${taskId}.json`),
      JSON.stringify({ id: taskId, status: 'EXECUTING' }),
      'utf8',
    );
    writeFileSync(
      join(projectDir, '.tasks', `task-${taskId}.plan`),
      JSON.stringify({ taskId, steps: [] }),
      'utf8',
    );
  }

  it.each([
    ['subprocess', () => new SubprocessBackend(projectDir)],
    ['sandbox', () => new SandboxBackend(projectDir)],
  ] as const)('%s writes honest NO_GO and returns before its task launch seam', (_name, create) => {
    const taskId = `auth-${_name}`;
    writeTaskFixture(taskId);
    const backend = create();

    backend.spawn(taskId, 'claude-sonnet-5', 'must-not-launch');

    const resultPath = join(projectDir, '.tasks', `task-${taskId}.result`);
    expect(existsSync(resultPath)).toBe(true);
    expect(JSON.parse(readFileSync(resultPath, 'utf8'))).toMatchObject({
      taskId,
      selfAssessment: 'NO_GO',
      testsPassed: false,
    });
    expect(readFileSync(resultPath, 'utf8')).toContain('AUTH_FAILED');
    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'claude',
      ['auth', 'status', '--json'],
      expect.objectContaining({ shell: false }),
    );
    expect(backend.list()).toEqual([]);
  });

  it('tmux is held by the earlier unmetered-remote budget gate with zero auth/provider spawn', () => {
    expect(() => new TmuxBackend(projectDir)
      .spawn('auth-tmux', 'claude-sonnet-5', 'must-not-launch'))
      .toThrow(/Remote execution budget is required/);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });

  it('does not apply Claude auth authority to a non-Claude provider', () => {
    expect(preflightClaudeAuthForLocalBackend(
      projectDir,
      'codex-task',
      'codex',
    )).toBe(true);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
  });
});
