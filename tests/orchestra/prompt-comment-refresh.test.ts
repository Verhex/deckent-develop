// Task 352-014 (PROMPT-COMMENT-REFRESH): pins the fact stated by the corrected
// doc comments in src/providers/claude.ts and src/orchestra/spawn-backend.ts —
// tmux worker prompt files embed taskId (Sprint 170 P0-3), so the
// active-worker selective filter protects them. This exercises the lower-level
// tmux spawn seam directly; TmuxBackend's remote-admission gate is covered by
// its own fail-closed tests and is intentionally not bypassed here.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  chmodSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
  readdirSync: vi.fn(() => [] as string[]),
  readFileSync: vi.fn(() => ''),
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
}));

vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => ({ toString: () => 'deadbeef' })),
}));

vi.mock('../../src/core/active-workers.js', () => ({
  getActiveWorkerIds: vi.fn(() => [] as string[]),
}));

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { spawnWorker } from '../../src/orchestra/tmux.js';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

const successResult = {
  status: 0,
  stdout: '',
  stderr: '',
  pid: 1,
  signal: null,
  output: [],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockedSpawnSync.mockReturnValue(successResult);
});

describe('352-014 PROMPT-COMMENT-REFRESH — tmux prompt filename embeds taskId', () => {
  it('spawnWorker() writes a prompt file whose name embeds the taskId', () => {
    const taskId = '352-014-comment-refresh';
    spawnWorker(taskId, 'claude-sonnet-5', 'task prompt content', '/proj');

    const promptCall = mockedWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('.prompt-'),
    );
    expect(promptCall, 'spawnWorker must write a .prompt- file').toBeDefined();

    const filename = String(promptCall![0]).split('/').pop()!;
    expect(filename).toContain(taskId);
    expect(filename.includes(`-${taskId}-`)).toBe(true);
  });
});
