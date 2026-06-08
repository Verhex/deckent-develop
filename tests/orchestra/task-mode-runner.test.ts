// tests/orchestra/task-mode-runner.test.ts
//
// Hermetic tests for runTaskMode — phase-1a gap fixes (gaps E + G).
//
// Asserts:
//   - .tasks/task-{id}.json is written to disk BEFORE spawn (Gap E fix)
//   - Written task JSON contains the description and scope (Gap E)
//   - buildWorkerPrompt is called without projectRoot as agentPrompt (Gap G fix)
//   - spawnWorkerMultiProvider receives the prompt string (not a path)
//
// Hermetic: uses tmpdir as projectRoot; mocks spawn so no real worker launches;
// mocks buildWorkerPrompt to prevent ADR/memory DB reads in CI.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks (hoisted before imports) ────────────────────────────────────────

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: vi.fn().mockResolvedValue({ backend: 'subprocess', provider: 'claude' }),
}));

vi.mock('../../src/orchestra/task-builder.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    // Intercept buildWorkerPrompt so CI does not need .brain/memory.db;
    // return a deterministic string so we can assert the prompt arg to spawn.
    buildWorkerPrompt: vi.fn((_task: unknown, _agentPrompt?: string, _skillPrompts?: unknown) =>
      'mock-worker-prompt',
    ),
  };
});

// ─── Import SUT after mocks ─────────────────────────────────────────────────

import { runTaskMode } from '../../src/orchestra/task-mode-runner.js';
import { spawnWorkerMultiProvider } from '../../src/cli/commands/spawn.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTaskConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    deckent_style: 'task',
    ...overrides,
  } as unknown as ResolvedConfig;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('runTaskMode — phase-1a gap fixes (E + G)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'task-mode-runner-'));
    vi.clearAllMocks();
    (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      backend: 'subprocess',
      provider: 'claude',
    });
    (buildWorkerPrompt as ReturnType<typeof vi.fn>).mockReturnValue('mock-worker-prompt');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('Gap E: writes .tasks/task-{id}.json before spawn', async () => {
    const config = makeTaskConfig();
    const result = await runTaskMode(
      { description: 'write a hello world function', projectRoot: root },
      config,
    );

    const taskFilePath = join(root, '.tasks', `task-${result.taskId}.json`);
    expect(existsSync(taskFilePath), 'task JSON must exist on disk').toBe(true);
  });

  it('Gap E: written task JSON contains description and scope', async () => {
    const config = makeTaskConfig();
    const desc = 'implement feature XYZ with full tests';

    const result = await runTaskMode(
      { description: desc, scope: { directories: ['src/feature'] }, projectRoot: root },
      config,
    );

    const taskFilePath = join(root, '.tasks', `task-${result.taskId}.json`);
    const content = JSON.parse(readFileSync(taskFilePath, 'utf-8')) as {
      description: string;
      scope: { directories: string[] };
      id: string;
    };

    expect(content.description).toBe(desc);
    expect(content.scope.directories).toContain('src/feature');
    expect(content.id).toBe(result.taskId);
  });

  it('Gap G: buildWorkerPrompt is called without projectRoot as agentPrompt', async () => {
    const config = makeTaskConfig();

    await runTaskMode(
      { description: 'fix the bug', projectRoot: root },
      config,
    );

    expect(buildWorkerPrompt).toHaveBeenCalledOnce();
    const [_task, agentPromptArg] = (buildWorkerPrompt as ReturnType<typeof vi.fn>).mock.calls[0]!;

    // agentPrompt must NOT be a filesystem path (the Gap G bug was passing projectRoot)
    expect(typeof agentPromptArg === 'string' && agentPromptArg.startsWith('/'),
      'agentPrompt must not be an absolute path (Gap G regression)',
    ).toBe(false);
  });

  it('spawn receives the prompt string from buildWorkerPrompt (not a path)', async () => {
    const config = makeTaskConfig();

    await runTaskMode(
      { description: 'do something', projectRoot: root },
      config,
    );

    expect(spawnWorkerMultiProvider).toHaveBeenCalledOnce();
    const [_taskId, _model, prompt] = (spawnWorkerMultiProvider as ReturnType<typeof vi.fn>).mock.calls[0]!;

    // prompt should be the return value of buildWorkerPrompt, not an absolute path
    expect(prompt).toBe('mock-worker-prompt');
  });

  it('returns taskId, backend, and provider from spawn', async () => {
    const config = makeTaskConfig();

    const result = await runTaskMode(
      { description: 'sample task', projectRoot: root },
      config,
    );

    expect(result.taskId).toBeTruthy();
    expect(result.backend).toBe('subprocess');
    expect(result.provider).toBe('claude');
  });

  it('throws when deckent_style is not "task"', async () => {
    const config = makeTaskConfig({ deckent_style: 'sprint' as unknown as 'task' });

    await expect(
      runTaskMode({ description: 'should fail', projectRoot: root }, config),
    ).rejects.toThrow('deckent_style !== "task"');
  });
});
