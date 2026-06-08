// tests/orchestra/autonomous/engine-config-clone.test.ts
//
// Hermetic integration test: drives a one-off backlog entry through handleStart
// to the real runTaskMode wrapper, verifying that the config clone wired in
// handleStart correctly sets deckent_style === 'task' (the config-clone gap
// from the autonomous-start code review).
//
// Why a separate file:
//   authority-adapter is mocked via vi.mock() which is hoisted and file-scoped.
//   The existing autonomous-command.test.ts has a 'default-deny' test that
//   depends on the REAL authority adapter returning 'denied' for an unknown
//   tenant. Merging these mocks would break that test.
//
// Mock strategy:
//   - authority-adapter  → always returns { outcome: 'allowed' }
//   - task-mode-runner   → spy (no-op stub), lets us capture the config arg
//   - sprint-controller  → no-op stub (not exercised by this entry)
//
// Timing:
//   queryDue() returns all pending one-off entries immediately (_now unused),
//   so a single iteration (maxIterations=1) is guaranteed to reach runTask.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { useSandboxHome } from '../../helpers/sandbox-home.js';

// ── Module mocks (hoisted) ────────────────────────────────────────────────────

// Authority adapter: allow all → authority gate never parks the trigger.
vi.mock('../../../src/orchestra/autonomous/authority-adapter.js', () => ({
  makeAuthorityChecker: () => ({
    check: () => ({ outcome: 'allowed', reason: 'test-mock: always allow' }),
  }),
}));

// task-mode-runner: spy stub — captures invocation args, returns a minimal result.
const runTaskModeSpy = vi.fn().mockReturnValue({ taskId: 'mock-task-id', backend: 'subprocess' });
vi.mock('../../../src/orchestra/task-mode-runner.js', () => ({
  runTaskMode: (...args: unknown[]) => runTaskModeSpy(...args),
}));

// sprint-controller: no-op stub (not called for kind=task entries).
vi.mock('../../../src/orchestra/sprint-controller.js', () => ({
  runSprintLifecycle: vi.fn().mockResolvedValue({}),
}));

// run.ts waitForRunResult: mock so the dispatcher doesn't hang waiting for a real
// .result file that will never appear in this hermetic test.
vi.mock('../../../src/cli/commands/run.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/cli/commands/run.js')>();
  return {
    ...actual,
    waitForRunResult: vi.fn().mockResolvedValue({
      taskId: 'mock-task-id',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      notes: '',
      linesAdded: 0,
      linesRemoved: 0,
    }),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mkRoot(): string {
  return mkdtempSync(join(tmpdir(), 'engine-clone-'));
}

function writePendingBacklog(root: string): void {
  const dir = join(root, '.deckent', 'autonomous');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'backlog.json'),
    JSON.stringify({
      version: 1,
      entries: [
        {
          id: 'e-test-001',
          title: 'Test task entry',
          kind: 'task',
          spec: { description: 'noop for clone test', scopeDir: 'src/' },
          policy: 'auto',
          trigger: { type: 'one-off' },
          status: 'pending',
          lastRun: null,
          lastResult: null,
        },
      ],
    }),
    'utf-8',
  );
}

function writeEnabledConfig(root: string): void {
  const dir = join(root, '.deckent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'config.json'),
    JSON.stringify({ autonomous: { enabled: true } }, null, 2),
    'utf-8',
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('engine config-clone — handleStart injects deckent_style into runTask config', () => {
  let root: string;

  const { beforeEach: sandboxBefore, afterEach: sandboxAfter } = useSandboxHome();
  beforeEach(sandboxBefore);
  afterEach(sandboxAfter);

  beforeEach(() => {
    root = mkRoot();
    runTaskModeSpy.mockClear();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('runTaskMode receives config with deckent_style === "task"', async () => {
    writeEnabledConfig(root);
    writePendingBacklog(root);

    // Import handleStart dynamically so it picks up the hoisted vi.mock stubs.
    const { handleStart } = await import('../../../src/cli/commands/autonomous.js');

    await handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' });

    expect(runTaskModeSpy).toHaveBeenCalledOnce();

    // Second argument to runTaskMode is the cloned config.
    const configArg = runTaskModeSpy.mock.calls[0]![1] as Record<string, unknown>;
    expect(configArg).toBeDefined();
    expect(configArg['deckent_style']).toBe('task');
  });
});
