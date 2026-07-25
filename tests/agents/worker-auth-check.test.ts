/**
 * Sprint 194 W-AUTH A-1 — worker.authHealthCheck() unit tests.
 *
 * Covers the four contractual cases the directives demand:
 *   (a) Auth not required (env unset) → check skipped, no .result, no event
 *   (b) Auth required AND claude auth status reports loggedIn=true → ok=true
 *   (c) Auth required AND auth-status fails → ok=false, .result written
 *       with AUTH_FAILED notes + selfAssessment NO_GO, AUTH_FAILED audit
 *       event emitted on WORKER→BRAIN:AUTH_FAILED channel
 *   (d) Auth required + exact Vitest-only bypass authority → check
 *       skipped, no .result, no event
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  realpathSync: vi.fn(),
  appendFileSync: vi.fn(),
  openSync: vi.fn(() => 42),
  closeSync: vi.fn(),
  fsyncSync: vi.fn(),
  fstatSync: vi.fn(() => ({ size: 1 })),
  renameSync: vi.fn(),
  readdirSync: vi.fn(),
  constants: { O_WRONLY: 1, O_CREAT: 64, O_EXCL: 128 },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(() => ({ sequence: 1, protocol_version: '1.0' })),
  getCurrentSprintId: vi.fn(() => 'sprint-194'),
  CHANNELS: {
    HEARTBEAT: 'WORKER→BRAIN:HEARTBEAT',
    RESULT: 'WORKER→BRAIN:RESULT',
    QUESTION: 'WORKER→BRAIN:QUESTION',
    CODE_VERIFY_REQUEST: 'WORKER→AUDITOR:CODE_VERIFY_REQUEST',
    AUTH_FAILED: 'WORKER→BRAIN:AUTH_FAILED',
  },
}));

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { writeEvent } from '../../src/orchestra/event-stream.js';
import { authHealthCheck } from '../../src/agents/worker.js';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteEvent = vi.mocked(writeEvent);

function fakeTaskJson(taskId: string): string {
  const task: Task = {
    id: taskId,
    title: `Task ${taskId}`,
    description: '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: '',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.EXECUTING,
  };
  return JSON.stringify(task);
}

beforeEach(() => {
  vi.clearAllMocks();
  // readFileSync default: return a valid task JSON so writeResult →
  // updateTaskStatus → readTask never throws during the AUTH_FAILED path.
  mockedReadFileSync.mockImplementation(() => fakeTaskJson('194-001') as never);
});

describe('worker.authHealthCheck', () => {
  it('(a) skips when CLAUDE_AUTH_REQUIRED is not set → ok=true, no .result, no event', () => {
    const env = { ...process.env };
    delete env.CLAUDE_AUTH_REQUIRED;
    delete env.DECKENT_AUTH_SKIP;

    const result = authHealthCheck('/project', '194-001', 'sprint-194', env);

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('(b) auth OK → valid loggedIn=true status succeeds without leaking account metadata', () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      status: 0,
      signal: null,
      output: ['', '{"loggedIn":true,"email":"private@example.test","orgId":"private-org"}\n', ''],
      stdout: '{"loggedIn":true,"email":"private@example.test","orgId":"private-org"}\n',
      stderr: '',
    } as unknown as ReturnType<typeof spawnSync>);

    const result = authHealthCheck('/project', '194-001', 'sprint-194', {
      CLAUDE_AUTH_REQUIRED: '1',
      ANTHROPIC_API_KEY: 'owned-anthropic',
      OPENAI_API_KEY: 'foreign-openai',
      GOOGLE_API_KEY: 'foreign-google',
      OPENROUTER_API_KEY: 'foreign-openrouter',
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(mockedSpawnSync).toHaveBeenCalledWith(
      'claude',
      ['auth', 'status', '--json'],
      expect.objectContaining({
        encoding: 'utf-8',
        timeout: 5_000,
        shell: false,
        env: expect.objectContaining({ ANTHROPIC_API_KEY: 'owned-anthropic' }),
      }),
    );
    const childEnv = mockedSpawnSync.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv;
    expect(childEnv).not.toHaveProperty('OPENAI_API_KEY');
    expect(childEnv).not.toHaveProperty('GOOGLE_API_KEY');
    expect(childEnv).not.toHaveProperty('OPENROUTER_API_KEY');
    // No AUTH_FAILED event should be emitted on success
    const authEventCalls = mockedWriteEvent.mock.calls.filter(
      (call) => call[4] === 'WORKER→BRAIN:AUTH_FAILED',
    );
    expect(authEventCalls).toHaveLength(0);
  });

  it('(c) auth fail (non-zero exit) → writes AUTH_FAILED .result + emits audit event', () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      status: 1,
      signal: null,
      output: ['', '', 'Invalid API key · Please run /login\n'],
      stdout: '',
      stderr: 'Invalid API key · Please run /login\n',
    } as unknown as ReturnType<typeof spawnSync>);

    const result = authHealthCheck('/project', '194-001', 'sprint-194', {
      CLAUDE_AUTH_REQUIRED: '1',
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Invalid API key');

    // RESULT event written by writeResult (sub-call)
    const resultEventCall = mockedWriteEvent.mock.calls.find(
      (call) => call[4] === 'WORKER→BRAIN:RESULT',
    );
    expect(resultEventCall).toBeDefined();
    const resultPayload = resultEventCall![5] as {
      taskId: string;
      selfAssessment: string;
    };
    expect(resultPayload.taskId).toBe('194-001');
    expect(resultPayload.selfAssessment).toBe('NO_GO');

    // AUTH_FAILED audit event emitted by authHealthCheck itself
    const authEventCall = mockedWriteEvent.mock.calls.find(
      (call) => call[4] === 'WORKER→BRAIN:AUTH_FAILED',
    );
    expect(authEventCall).toBeDefined();
    const authPayload = authEventCall![5] as {
      taskId: string;
      exitCode: number | null;
      stderr: string;
    };
    expect(authPayload.taskId).toBe('194-001');
    expect(authPayload.exitCode).toBe(1);
    expect(authPayload.stderr).toContain('Invalid API key');
  });

  it('(d) exact Vitest-only bypass skips when auth is required', () => {
    const result = authHealthCheck('/project', '194-001', 'sprint-194', {
      CLAUDE_AUTH_REQUIRED: '1',
      DECKENT_AUTH_SKIP: '1',
      NODE_ENV: 'test',
      VITEST: 'true',
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(mockedSpawnSync).not.toHaveBeenCalled();
    expect(mockedWriteEvent).not.toHaveBeenCalled();
  });

  it('(e) ignores a lone production DECKENT_AUTH_SKIP and fails closed', () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      status: 1,
      signal: null,
      output: ['', '{"loggedIn":false}', ''],
      stdout: '{"loggedIn":false}',
      stderr: '',
    } as unknown as ReturnType<typeof spawnSync>);

    const result = authHealthCheck('/project', '194-001', 'sprint-194', {
      CLAUDE_AUTH_REQUIRED: '1',
      DECKENT_AUTH_SKIP: '1',
      NODE_ENV: 'production',
    });

    expect(result.ok).toBe(false);
    expect(result.skipped).toBeUndefined();
    expect(mockedSpawnSync).toHaveBeenCalledOnce();
    expect(mockedWriteEvent.mock.calls.some(
      (call) => call[4] === 'WORKER→BRAIN:AUTH_FAILED',
    )).toBe(true);
  });

  it('(f) empty/invalid JSON despite exit 0 is AUTH_FAILED', () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      status: 0,
      signal: null,
      output: ['', '', ''],
      stdout: '',
      stderr: '',
    } as unknown as ReturnType<typeof spawnSync>);

    const result = authHealthCheck('/project', '194-001', 'sprint-194', {
      CLAUDE_AUTH_REQUIRED: '1',
    });

    expect(result.ok).toBe(false);
    const authEventCall = mockedWriteEvent.mock.calls.find(
      (call) => call[4] === 'WORKER→BRAIN:AUTH_FAILED',
    );
    expect(authEventCall).toBeDefined();
    expect(result.stderr).toContain('invalid JSON');
  });

  it('(g) exit 0 with loggedIn=false is AUTH_FAILED', () => {
    mockedSpawnSync.mockReturnValue({
      pid: 1,
      status: 0,
      signal: null,
      output: ['', '{"loggedIn":false,"email":"must-not-leak@example.test"}', ''],
      stdout: '{"loggedIn":false,"email":"must-not-leak@example.test"}',
      stderr: '',
    } as unknown as ReturnType<typeof spawnSync>);

    const result = authHealthCheck('/project', '194-001', 'sprint-194', {
      CLAUDE_AUTH_REQUIRED: '1',
    });

    expect(result.ok).toBe(false);
    expect(result.stderr).toBe('claude auth status reports loggedIn=false-or-missing');
    expect(result.stderr).not.toContain('must-not-leak');
  });
});
