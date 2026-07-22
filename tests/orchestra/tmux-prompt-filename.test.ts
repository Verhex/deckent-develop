// Sprint 170 P0-3 — Tmux prompt filename taskId-aware (Bug 2B closure).
//
// Sprint 169 forensic identified ADR-048 §Negative asymmetry: tmux prompt files
// used random-hex-only names (.prompt-${hex}.txt) while Docker prompts embed
// the taskId (.prompt-${taskId}-${hash}.txt). The selective filter in
// ClaudeAdapter._cleanupOrphanedPromptFiles — `file.includes(\`-${id}-\`)` —
// is built for the Docker pattern and never matched tmux prompts, so every
// kill() in the tmux backend could delete arbitrary active tmux prompts.
//
// This file pins three invariants after the fix:
//   1. writePromptFile (via spawnWorker) emits `.prompt-${taskId}-${hash}.txt`.
//   2. The emitted filename satisfies the selective `-${taskId}-` filter.
//   3. _cleanupOrphanedPromptFiles preserves active tmux worker prompts.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
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
  randomBytes: vi.fn(() => ({ toString: () => 'cafebabe' })),
}));

vi.mock('../../src/core/active-workers.js', () => ({
  getActiveWorkerIds: vi.fn(() => [] as string[]),
}));

import { spawnSync } from 'node:child_process';
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnWorker } from '../../src/orchestra/tmux.js';
import { ClaudeAdapter } from '../../src/providers/claude.js';

const mockedSpawnSync = vi.mocked(spawnSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);

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

interface PromptCleanupCapable {
  _cleanupOrphanedPromptFiles: (activeTaskIds?: string[]) => void;
}

describe('Sprint 170 P0-3 — tmux prompt filename taskId-aware', () => {
  it('emits a tmux prompt file whose filename embeds the taskId (.prompt-${taskId}-${hash}.txt)', () => {
    const taskId = '170-bug2b-1';

    spawnWorker(taskId, 'claude-sonnet-5', 'task prompt content', '/proj');

    const promptCall = mockedWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('.prompt-'),
    );
    expect(promptCall, 'writePromptFile must call writeFileSync with a .prompt- path').toBeDefined();

    const fullPath = String(promptCall![0]);
    const basename = fullPath.split('/').pop()!;

    // Mirror the Docker convention precisely (spawn-backend-docker.ts:227-231):
    expect(basename).toMatch(/^\.prompt-170-bug2b-1-[a-f0-9]+\.txt$/);
    expect(basename).toBe('.prompt-170-bug2b-1-cafebabe.txt');

    // Sanity-check that the prompt content reached the file (not just the path).
    expect(promptCall![1]).toBe('task prompt content');
    expect(promptCall![2]).toBe('utf-8');
  });

  it('emitted filename satisfies the `-${taskId}-` selective filter used by ClaudeAdapter cleanup', () => {
    const taskId = '170-bug2b-2';

    spawnWorker(taskId, 'claude-sonnet-5', 'work', '/proj');

    const promptCall = mockedWriteFileSync.mock.calls.find((c) =>
      String(c[0]).includes('.prompt-'),
    );
    expect(promptCall).toBeDefined();

    const filename = String(promptCall![0]).split('/').pop()!;

    // The predicate is byte-for-byte identical to the one in
    // src/providers/claude.ts: `active.some(id => file.includes(`-${id}-`))`.
    // Before P0-3 the tmux filename `.prompt-${hex}.txt` never matched this
    // predicate; after P0-3 it must, otherwise the asymmetry remains.
    expect(filename.includes(`-${taskId}-`)).toBe(true);
  });

  it('_cleanupOrphanedPromptFiles preserves the tmux-emitted prompt of an active worker', () => {
    const activeTaskId = '170-bug2b-3';
    const adapter = new ClaudeAdapter('/proj', { claude_backend: 'tmux' });

    // Two prompts on disk:
    //   - active tmux worker prompt (new pattern)        — must be PRESERVED
    //   - truly orphan prompt with no live worker        — must be DELETED
    mockedReaddirSync.mockReturnValueOnce([
      `.prompt-${activeTaskId}-cafebabe.txt`,
      '.prompt-orphan-deadbeef.txt',
    ] as never);

    (adapter as unknown as PromptCleanupCapable)._cleanupOrphanedPromptFiles([activeTaskId]);

    const unlinked = mockedUnlinkSync.mock.calls.map((c) => String(c[0]));
    expect(
      unlinked.some((p) => p.endsWith(`.prompt-${activeTaskId}-cafebabe.txt`)),
      'tmux active worker prompt must NOT be deleted',
    ).toBe(false);
    expect(
      unlinked.some((p) => p.endsWith('.prompt-orphan-deadbeef.txt')),
      'orphan prompt must be deleted',
    ).toBe(true);
  });
});
