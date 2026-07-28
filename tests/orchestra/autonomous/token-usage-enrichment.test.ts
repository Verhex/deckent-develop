// tests/orchestra/autonomous/token-usage-enrichment.test.ts
//
// TOK-AUT: verify that execute-dispatcher enriches tokenUsage from measured
// CLI log tokens (WP-4 honest-fill), and leaves it 0 when no log exists.
//
// Hermetic: all I/O under os.tmpdir(); decay + eval/audit stubs so no
// memory.db / sprint-finalizer is loaded.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry, BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const taskEntry: BacklogEntry = {
  id: 'e', title: 'enrich-test', kind: 'task',
  spec: { description: 'do work', scopeDir: 'src/' },
  policy: 'auto', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    selfAssessment: 'DONE',
    testsPassed: true,
    filesChanged: [],
    notes: '',
    linesAdded: 10,
    linesRemoved: 2,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
    ...overrides,
  };
}

// Minimal stubs so the Brain-Eval kernel does not reject our fixtures.
const okEval = () => ({ decision: 'DONE' as const, quality: 100, reconciled: false, reason: 'ok' });
const okAudit = async () => ({ boundary: 'clean' as const, adr: 'ok' as const, functional: 'pass' as const });
const skipXV = async () => ({ ran: false });
const noDecay = vi.fn();

// ─── Tmpdir management ───────────────────────────────────────────────

let tmpDir: string;
let tasksDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `tok-enrich-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tasksDir = join(tmpDir, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function seedBacklog(entry: BacklogEntry = taskEntry): string {
  const bl: BacklogFile = { _version: '1.0', entries: [entry] };
  const path = join(tmpDir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('execute-dispatcher — tokenUsage enrichment (TOK-AUT)', () => {
  it('(a) fills non-zero tokenUsage from CLI log when a measured file exists', async () => {
    const backlogPath = seedBacklog();

    // Seed the CLI output log file that tryLoadCliLogTokens will find.
    // The format matches extractTokenUsageFromClaudeCli: a JSON with `usage` containing
    // `input_tokens` / `output_tokens` (the Claude CLI streaming JSON shape).
    const cliLog = JSON.stringify({
      type: 'result',
      usage: { input_tokens: 12345, output_tokens: 678, cache_read_input_tokens: 5000 },
      model: 'claude-sonnet-4-5',
    });
    writeFileSync(join(tasksDir, 'task-run-tok.cli-output.json'), cliLog, 'utf-8');

    // Capture what result the evaluate step receives (it sees the enriched result).
    let capturedResult: TaskResult | undefined;
    const capturingEval = ((_entry: BacklogEntry, result: TaskResult) => {
      capturedResult = result;
      return okEval();
    }) as typeof okEval;

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      backlogPath,
      runTask: async () => ({ taskId: 'run-tok' }),
      executeSprint: async () => ({}),
      waitForResult: async (_root, _taskId, _timeout) => makeResult('run-tok'),
      evaluate: capturingEval,
      audit: okAudit,
      crossVerify: skipXV,
      runBudgetedDecay: noDecay,
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: taskEntry });
    expect(res.outcome).toBe('success');

    // The evaluate stub was called with the enriched result — tokenUsage non-zero.
    expect(capturedResult).toBeDefined();
    expect(capturedResult!.tokenUsage?.inputTokens).toBe(12345);
    expect(capturedResult!.tokenUsage?.outputTokens).toBe(678);
    expect(capturedResult!.tokenUsage?.cacheReadTokens).toBe(5000);
  });

  it('(b) leaves tokenUsage as worker-stub zeros when no CLI log exists', async () => {
    const backlogPath = seedBacklog();
    // No CLI log file is seeded — tryLoadCliLogTokens returns null.

    let capturedResult: TaskResult | undefined;
    const capturingEval = ((_entry: BacklogEntry, result: TaskResult) => {
      capturedResult = result;
      return okEval();
    }) as typeof okEval;

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      backlogPath,
      runTask: async () => ({ taskId: 'run-empty' }),
      executeSprint: async () => ({}),
      // Worker stub: tokenUsage 0/0/0 — the honest worker pattern.
      waitForResult: async () => makeResult('run-empty', {
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
      }),
      evaluate: capturingEval,
      audit: okAudit,
      crossVerify: skipXV,
      runBudgetedDecay: noDecay,
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: taskEntry });
    expect(res.outcome).toBe('success');

    // No measured log → enrichment is a no-op on the zero stub → still 0 (backward-compat).
    expect(capturedResult).toBeDefined();
    expect(capturedResult!.tokenUsage?.inputTokens).toBe(0);
    expect(capturedResult!.tokenUsage?.outputTokens).toBe(0);
  });
});
