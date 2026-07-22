// tests/orchestra/task-mode-tokenusage.test.ts
//
// Sprint 357 / Task 357-013 (TOK-AUT).
//
// Bug: the autonomous task-mode path (task-mode-runner.ts) never called the
// sprint path's result-collector.ts enrichment (enrichResultTokenUsage /
// enrichResultCost), so a task-mode worker's honest tokenUsage 0/0/0 stub
// (Worker Output Contract) was persisted to disk forever, unlike the sprint
// lifecycle which fills real measured tokenUsage/cost before collection.
//
// Asserts:
//   - With a fake CLI-log transcript present, enrichTaskModeResult fills
//     tokenUsage with the REAL measured values (≠ 0/0/0) and persists them
//     back to the on-disk .result file.
//   - enrichResultCost is wired too — result.cost gets populated.
//   - Without a .result file on disk yet, enrichTaskModeResult is a safe
//     no-op (returns undefined, does not fabricate a file).
//
// Hermetic: tmpdir projectRoot; mocks spawn + buildWorkerPrompt (same pattern
// as task-mode-runner.test.ts) so no real worker/ADR-DB access is needed.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
    buildWorkerPrompt: vi.fn((_task: unknown, _agentPrompt?: string, _skillPrompts?: unknown) =>
      'mock-worker-prompt',
    ),
  };
});

// ─── Import SUT after mocks ─────────────────────────────────────────────────

import { runTaskMode, enrichTaskModeResult } from '../../src/orchestra/task-mode-runner.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { Task, TaskResult } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTaskConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    deckent_style: 'task',
    execution_budget: { roles: { worker: { default: { maxTokens: 100_000, maxTurns: 10 } } } },
    ...overrides,
  } as unknown as ResolvedConfig;
}

/** Read back the Task JSON that runTaskMode wrote to disk before spawning. */
function readWrittenTask(root: string, taskId: string): Task {
  const path = join(root, '.tasks', `task-${taskId}.json`);
  return JSON.parse(readFileSync(path, 'utf-8')) as Task;
}

function writeWorkerResultStub(root: string, taskId: string): void {
  const stub: TaskResult = {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/example.ts'],
    linesAdded: 12,
    linesRemoved: 3,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'stub worker result',
    // Worker Output Contract: workers leave counts at 0 and let the
    // orchestrator fill real counts server-side.
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
  };
  writeFileSync(join(root, '.tasks', `task-${taskId}.result`), JSON.stringify(stub, null, 2), 'utf-8');
}

/** Fake Claude CLI `--output-format json` usage envelope (token-counter.ts format). */
function writeFakeCliLogTranscript(root: string, taskId: string): void {
  const envelope = {
    type: 'result',
    subtype: 'success',
    usage: {
      input_tokens: 15420,
      output_tokens: 3200,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 200,
    },
  };
  writeFileSync(join(root, '.tasks', `task-${taskId}.log`), JSON.stringify(envelope), 'utf-8');
}

function readPersistedResult(root: string, taskId: string): TaskResult {
  const path = join(root, '.tasks', `task-${taskId}.result`);
  return JSON.parse(readFileSync(path, 'utf-8')) as TaskResult;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('task-mode tokenUsage enrichment (357-013 TOK-AUT)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'task-mode-tokenusage-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('fills tokenUsage from a fake CLI-log transcript and persists it (≠ 0/0/0)', async () => {
    const config = makeTaskConfig();
    const { taskId } = await runTaskMode(
      { description: 'implement the widget', projectRoot: root },
      config,
    );
    const task = readWrittenTask(root, taskId);

    writeWorkerResultStub(root, taskId);
    writeFakeCliLogTranscript(root, taskId);

    const enriched = enrichTaskModeResult(root, task);

    expect(enriched).toBeDefined();
    expect(enriched!.tokenUsage).toBeDefined();
    expect(enriched!.tokenUsage!.inputTokens).toBe(15420);
    expect(enriched!.tokenUsage!.outputTokens).toBe(3200);
    expect(
      enriched!.tokenUsage!.inputTokens === 0 && enriched!.tokenUsage!.outputTokens === 0,
      'tokenUsage must not stay the honest 0/0/0 stub once a real transcript is available',
    ).toBe(false);

    // Persisted to disk, not just mutated in-memory.
    const onDisk = readPersistedResult(root, taskId);
    expect(onDisk.tokenUsage?.inputTokens).toBe(15420);
    expect(onDisk.tokenUsage?.outputTokens).toBe(3200);
    expect(onDisk.tokenUsage?.cacheReadTokens).toBe(1000);
  });

  it('wires enrichResultCost — result.cost is populated once tokenUsage is real', async () => {
    const config = makeTaskConfig();
    const { taskId } = await runTaskMode(
      { description: 'implement the widget', projectRoot: root },
      config,
    );
    const task = readWrittenTask(root, taskId);

    writeWorkerResultStub(root, taskId);
    writeFakeCliLogTranscript(root, taskId);

    const enriched = enrichTaskModeResult(root, task);

    expect(enriched?.cost).toBeDefined();
    expect(typeof enriched?.cost?.usd).toBe('number');
    expect(enriched?.cost?.isLocal).toBe(false);
  });

  it('is a safe no-op when no .result file exists yet (no transcript, task still running)', async () => {
    const config = makeTaskConfig();
    const { taskId } = await runTaskMode(
      { description: 'implement the widget', projectRoot: root },
      config,
    );
    const task = readWrittenTask(root, taskId);

    const resultPath = join(root, '.tasks', `task-${taskId}.result`);
    expect(existsSync(resultPath)).toBe(false);

    const enriched = enrichTaskModeResult(root, task);

    expect(enriched).toBeUndefined();
    expect(existsSync(resultPath)).toBe(false);
  });
});
