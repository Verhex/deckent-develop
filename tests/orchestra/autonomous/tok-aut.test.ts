// tests/orchestra/autonomous/tok-aut.test.ts
//
// TOK-AUT: verify that execute-dispatcher passes a BacklogEntry-model/provider Task-stub
// to enrichResultTokenUsage so autonomous results get non-zero tokenUsage.
//
// Hermetic: all I/O under os.tmpdir(); eval/audit stubs; no memory.db.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeExecuteDispatcher, AUTONOMOUS_EXECUTE_ACTION } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry, BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../../src/core/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

const MODEL = 'qwen3.6:27b';
const PROVIDER = 'ollama';

const entryWithModel: BacklogEntry = {
  id: 'e-tok', title: 'tok-test', kind: 'task',
  spec: { description: 'do work', scopeDir: 'src/' },
  policy: 'auto', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
  model: MODEL,
  provider: PROVIDER,
};

const entryWithoutModel: BacklogEntry = {
  ...entryWithModel,
  id: 'e-tok-nomodel',
  model: undefined,
  provider: undefined,
};

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    selfAssessment: 'DONE',
    testsPassed: true,
    filesChanged: [],
    notes: '',
    linesAdded: 20,
    linesRemoved: 5,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'ollama', model: MODEL },
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
  tmpDir = join(tmpdir(), `tok-aut-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tasksDir = join(tmpDir, '.tasks');
  mkdirSync(tasksDir, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

function seedBacklog(entry: BacklogEntry = entryWithModel): string {
  const bl: BacklogFile = { _version: '1.0', entries: [entry] };
  const path = join(tmpDir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('execute-dispatcher — TOK-AUT: Task-stub enrichment', () => {
  it('(a) fills non-zero tokenUsage from CLI log when entry has model+provider', async () => {
    const backlogPath = seedBacklog(entryWithModel);

    // Seed the CLI output log that tryLoadCliLogTokens will find.
    const cliLog = JSON.stringify({
      type: 'result',
      usage: { input_tokens: 9999, output_tokens: 1234, cache_read_input_tokens: 2000 },
      model: 'qwen3.6:27b',
    });
    writeFileSync(join(tasksDir, 'task-run-tok-a.cli-output.json'), cliLog, 'utf-8');

    let capturedResult: TaskResult | undefined;
    const capturingEval = ((_entry: BacklogEntry, result: TaskResult) => {
      capturedResult = result;
      return okEval();
    }) as typeof okEval;

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      backlogPath,
      runTask: async () => ({ taskId: 'run-tok-a' }),
      runSprint: async () => ({}),
      waitForResult: async () => makeResult('run-tok-a'),
      evaluate: capturingEval,
      audit: okAudit,
      crossVerify: skipXV,
      runBudgetedDecay: noDecay,
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: entryWithModel });
    expect(res.outcome).toBe('success');
    expect(capturedResult).toBeDefined();
    // CLI-log wins — non-zero from measured tokens.
    expect(capturedResult!.tokenUsage?.inputTokens).toBe(9999);
    expect(capturedResult!.tokenUsage?.outputTokens).toBe(1234);
    expect(capturedResult!.tokenUsage?.cacheReadTokens).toBe(2000);
  });

  it('(b) falls back to heuristic estimate when entry has model but no CLI log', async () => {
    const backlogPath = seedBacklog(entryWithModel);
    // No CLI log seeded — tryLoadCliLogTokens returns null.

    let capturedResult: TaskResult | undefined;
    const capturingEval = ((_entry: BacklogEntry, result: TaskResult) => {
      capturedResult = result;
      return okEval();
    }) as typeof okEval;

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      backlogPath,
      runTask: async () => ({ taskId: 'run-tok-b' }),
      runSprint: async () => ({}),
      // Worker zero-stub — the honest "fill me" pattern.
      waitForResult: async () => makeResult('run-tok-b', {
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: PROVIDER, model: MODEL },
      }),
      evaluate: capturingEval,
      audit: okAudit,
      crossVerify: skipXV,
      runBudgetedDecay: noDecay,
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: entryWithModel });
    expect(res.outcome).toBe('success');
    expect(capturedResult).toBeDefined();
    // No CLI log but entry has model → Task-stub passed → heuristic estimate fills tokenUsage.
    // estimateTokenUsage: inputTokens = max((20+5)*10, 1000) = 1000; outputTokens = max(20*15, 500) = 300.
    expect(capturedResult!.tokenUsage?.inputTokens).toBeGreaterThan(0);
    expect(capturedResult!.tokenUsage?.outputTokens).toBeGreaterThan(0);
    // Provider/model from entry propagated through the stub.
    expect(capturedResult!.tokenUsage?.provider).toBe(PROVIDER);
    expect(capturedResult!.tokenUsage?.model).toBe(MODEL);
  });

  it('(c) enrichResultTokenUsage is called with stub carrying entry model+provider', async () => {
    const backlogPath = seedBacklog(entryWithModel);

    // Intercept enrichResultTokenUsage via the evaluate hook: the result passed
    // to evaluate is the enriched result, so we verify provider/model landed on it.
    let capturedResult: TaskResult | undefined;
    const capturingEval = ((_entry: BacklogEntry, result: TaskResult) => {
      capturedResult = result;
      return okEval();
    }) as typeof okEval;

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      backlogPath,
      runTask: async () => ({ taskId: 'run-tok-c' }),
      runSprint: async () => ({}),
      waitForResult: async () => makeResult('run-tok-c'),
      evaluate: capturingEval,
      audit: okAudit,
      crossVerify: skipXV,
      runBudgetedDecay: noDecay,
    });

    await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: entryWithModel });
    // The evaluate step received the enriched result — model from BacklogEntry entry.
    expect(capturedResult?.tokenUsage?.model).toBe(MODEL);
    expect(capturedResult?.tokenUsage?.provider).toBe(PROVIDER);
  });

  it('(d) no model+provider on entry → tokenUsage stays at worker-stub zeros (backward-compat)', async () => {
    const backlogPath = seedBacklog(entryWithoutModel);

    let capturedResult: TaskResult | undefined;
    const capturingEval = ((_entry: BacklogEntry, result: TaskResult) => {
      capturedResult = result;
      return okEval();
    }) as typeof okEval;

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      backlogPath,
      runTask: async () => ({ taskId: 'run-tok-d' }),
      runSprint: async () => ({}),
      waitForResult: async () => makeResult('run-tok-d', {
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'sonnet' },
      }),
      evaluate: capturingEval,
      audit: okAudit,
      crossVerify: skipXV,
      runBudgetedDecay: noDecay,
    });

    const res = await handler(AUTONOMOUS_EXECUTE_ACTION, { entry: entryWithoutModel });
    expect(res.outcome).toBe('success');
    // No model/provider on entry → taskStub is undefined → enrichment skips step 3 → 0 preserved.
    expect(capturedResult?.tokenUsage?.inputTokens).toBe(0);
    expect(capturedResult?.tokenUsage?.outputTokens).toBe(0);
  });
});
