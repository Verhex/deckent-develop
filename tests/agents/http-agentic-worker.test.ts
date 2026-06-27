// ═══ http-agentic-worker tests — F1-013 v1 (hermetic, tmpdir, injected send) ═══
//
// Hermetic rules (CLAUDE.md):
//   • tmpdir for all I/O; cleanup in afterEach.
//   • No real network — `send` is injected (scripted turns).
//   • No real process — `spawnImpl` is injected as a fake.
//
// Coverage matches goCriteria:
//   (1) loop drives the injected send through a read→write tool sequence then a
//       final answer → tools run through chat-tool-exec, file lands on disk,
//       a `.hb` + a valid `.result` (selfAssessment + filesChanged) are written.
//   (2) out-of-scope write is HARD-REJECTED (tool-error fed back, no disk write).
//   (3) `OpenAICompatibleAdapter.spawn()` no longer throws and launches the loop
//       (node entry, correct argv) — lifecycle (listWorkers/kill) wired.
//   (4) termination matrix: content-only final → DONE; send throws → NO_GO.

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  runHttpAgenticWorker,
  runHttpWorkerEntry,
  type HttpAgenticSend,
  type HttpAgenticTurn,
  type HttpAgenticMessage,
  type HttpAgenticRunnerOptions,
} from '../../src/agents/http-agentic-worker.js';
import { OLLAMA_TOOLS } from '../../src/agents/agentic-worker-tools.js';
import { OpenAICompatibleAdapter } from '../../src/providers/openai-compatible.js';

// ─── send() scripting helpers ─────────────────────────────────────────────────

interface CapturedTurn {
  messages: HttpAgenticMessage[];
  model: string;
  tools: readonly unknown[];
}

/** A scripted `send` that returns `turns` in order and snapshots each input. */
function scriptSend(turns: HttpAgenticTurn[], captured: CapturedTurn[] = []): HttpAgenticSend {
  let i = 0;
  return async (messages, model, opts) => {
    captured.push({
      messages: JSON.parse(JSON.stringify(messages)) as HttpAgenticMessage[],
      model,
      tools: opts.tools,
    });
    const t = turns[Math.min(i, turns.length - 1)]!;
    i++;
    return t;
  };
}

/** A turn that requests tool calls. `arguments` is stringified to mirror the OpenAI wire. */
function toolTurn(
  calls: { name: string; args: Record<string, unknown>; id?: string }[],
  content = '',
): HttpAgenticTurn {
  return {
    content,
    toolCalls: calls.map((c, idx) => ({
      id: c.id ?? `call-${idx}`,
      type: 'function',
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    })),
  };
}

/** A content-only "final answer" turn (no tool calls). */
function finalTurn(
  content: string,
  usage?: { inputTokens: number; outputTokens: number },
): HttpAgenticTurn {
  return { content, toolCalls: [], ...(usage ? { usage } : {}) };
}

function baseOpts(
  projectRoot: string,
  send: HttpAgenticSend,
  overrides: Partial<HttpAgenticRunnerOptions> = {},
): HttpAgenticRunnerOptions {
  return {
    taskId: 'test-001',
    model: 'deepseek-chat',
    prompt: 'Do the task.',
    scope: { directories: ['src/'], filesWrite: ['allowed.ts'], filesRead: [] },
    goNogo: { goCriteria: 'file written', noGoCriteria: 'nothing written', techDebtAcceptable: 'minor' },
    projectRoot,
    provider: 'deepseek',
    send,
    ...overrides,
  };
}

// ─── 1. Loop drives read→write→final through chat-tool-exec ─────────────────────

describe('runHttpAgenticWorker — F1-013 send-driven tool loop', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'http-agentic-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('executes read→write tool calls through chat-tool-exec; file lands on disk + filesChanged tracked', async () => {
    writeFileSync(join(projectRoot, 'README.md'), '# seed', 'utf-8');
    const captured: CapturedTurn[] = [];
    const send = scriptSend(
      [
        toolTurn([{ name: 'read_file', args: { path: 'README.md' } }]),
        toolTurn([{ name: 'write_file', args: { path: 'allowed.ts', content: 'export const x = 1;\n' } }]),
        toolTurn([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'wrote allowed.ts' } }]),
      ],
      captured,
    );

    const result = await runHttpAgenticWorker(baseOpts(projectRoot, send));

    expect(existsSync(join(projectRoot, 'allowed.ts'))).toBe(true);
    expect(readFileSync(join(projectRoot, 'allowed.ts'), 'utf-8')).toBe('export const x = 1;\n');
    expect(result.filesChanged).toEqual(['allowed.ts']);
    expect(result.selfAssessment).toBe('DONE');
    expect(result.terminationReason).toBe('task_done');
    expect(result.iterations).toBe(3);
    // The loop advertises the (OpenAI-compatible) tool schemas on every turn.
    expect(captured[0]!.tools).toBe(OLLAMA_TOOLS);
    expect(captured[0]!.model).toBe('deepseek-chat');
    // tokenUsage carries the configured provider, not a hard-coded one.
    expect(result.tokenUsage.provider).toBe('deepseek');
  });

  it('HARD-REJECTS an out-of-scope write: no disk write, scope-error fed into the next send', async () => {
    const captured: CapturedTurn[] = [];
    const send = scriptSend(
      [
        toolTurn([{ name: 'write_file', args: { path: 'forbidden.ts', content: 'pwn' }, id: 'call-evil' }]),
        toolTurn([{ name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'no in-scope path' } }]),
      ],
      captured,
    );

    const result = await runHttpAgenticWorker(baseOpts(projectRoot, send));

    expect(existsSync(join(projectRoot, 'forbidden.ts'))).toBe(false);
    expect(result.filesChanged).toEqual([]);
    expect(result.selfAssessment).toBe('NO_GO');

    // The scope-violation must be visible to the model in the 2nd request.
    expect(captured.length).toBe(2);
    const toolMsg = captured[1]!.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content).toContain('[scope-violation]');
    expect(toolMsg!.content).toContain('forbidden.ts');
    expect(toolMsg!.tool_call_id).toBe('call-evil');
  });

  it('rejects a cwd-escape write (../escape.ts) — never written outside the project root', async () => {
    const send = scriptSend([
      toolTurn([{ name: 'write_file', args: { path: '../escape.ts', content: 'pwn' } }]),
      finalTurn('giving up'),
    ]);
    const result = await runHttpAgenticWorker(baseOpts(projectRoot, send));
    expect(existsSync(join(projectRoot, '..', 'escape.ts'))).toBe(false);
    expect(result.filesChanged).toEqual([]);
  });

  it('content-only final turn after a write → DONE (no_tool_calls termination)', async () => {
    const send = scriptSend([
      toolTurn([{ name: 'write_file', args: { path: 'allowed.ts', content: 'v1' } }]),
      finalTurn('all done', { inputTokens: 12, outputTokens: 8 }),
    ]);
    const result = await runHttpAgenticWorker(baseOpts(projectRoot, send));
    expect(result.selfAssessment).toBe('DONE');
    expect(result.terminationReason).toBe('no_tool_calls');
    expect(result.filesChanged).toEqual(['allowed.ts']);
    expect(result.tokenUsage.outputTokens).toBe(8);
  });

  it('send() throwing (provider unreachable) → NO_GO + api_error with reason', async () => {
    const send: HttpAgenticSend = async () => {
      throw new Error('ECONNREFUSED api.deepseek.com');
    };
    const result = await runHttpAgenticWorker(baseOpts(projectRoot, send));
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.terminationReason).toBe('api_error');
    expect(result.notes).toContain('ECONNREFUSED');
  });
});

// ─── 2. Entry shim: task.json → .hb + .result ──────────────────────────────────

describe('runHttpWorkerEntry — F1-013 entry shim end-to-end', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'http-agentic-entry-'));
    mkdirSync(join(projectRoot, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function writeTaskJson(taskId: string, body: Record<string, unknown>): void {
    writeFileSync(
      join(projectRoot, '.tasks', `task-${taskId}.json`),
      JSON.stringify(body, null, 2),
      'utf-8',
    );
  }

  it('reads task json, drives the REAL loop via injected send, writes a valid .result + .hb (DONE)', async () => {
    const taskId = 'http-001';
    writeFileSync(join(projectRoot, 'README.md'), '# seed', 'utf-8');
    writeTaskJson(taskId, {
      id: taskId,
      description: 'Create allowed.ts',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['allowed.ts'] },
      goNogo: { goCriteria: 'allowed.ts created', noGoCriteria: 'nothing written', techDebtAcceptable: 'none' },
    });

    const send = scriptSend([
      toolTurn([{ name: 'read_file', args: { path: 'README.md' } }]),
      toolTurn([{ name: 'write_file', args: { path: 'allowed.ts', content: 'export const ok = true;\n' } }]),
      toolTurn([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'created allowed.ts' } }]),
    ]);

    const { exitCode, resultPath, result } = await runHttpWorkerEntry(
      [taskId, 'deepseek-chat', 'https://api.deepseek.com/v1', 'DEEPSEEK_API_KEY', 'deepseek'],
      projectRoot,
      { send },
    );

    expect(exitCode).toBe(0);
    expect(existsSync(resultPath)).toBe(true);
    expect(existsSync(join(projectRoot, 'allowed.ts'))).toBe(true);

    const onDisk = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk).toEqual(result);
    expect(onDisk['taskId']).toBe(taskId);
    expect(onDisk['filesChanged']).toEqual(['allowed.ts']);
    expect(onDisk['selfAssessment']).toBe('DONE');
    expect(onDisk['evaluationDecision']).toBe('DONE');
    expect(typeof onDisk['linesAdded']).toBe('number');
    // coverage is uninstrumented by the agentic loop → honest null (provider parity).
    expect(onDisk['coverage']).toBeNull();
    const usage = onDisk['tokenUsage'] as Record<string, unknown>;
    expect(usage['provider']).toBe('deepseek');
    expect(usage['model']).toBe('deepseek-chat');

    // Heartbeat reached the DONE terminal state.
    const hb = JSON.parse(
      readFileSync(join(projectRoot, '.tasks', `task-${taskId}.hb`), 'utf-8'),
    ) as Record<string, unknown>;
    expect(hb['status']).toBe('DONE');
    expect(hb['taskId']).toBe(taskId);
  });

  it('writes a NO_GO .result and exits 1 when argv is incomplete', async () => {
    const { exitCode, result, resultPath } = await runHttpWorkerEntry(
      ['only-id'], // missing model/baseURL/apiKeyEnv
      projectRoot,
    );
    expect(exitCode).toBe(1);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.notes).toMatch(/missing argv/);
    expect(existsSync(resultPath)).toBe(true);
  });

  it('writes a NO_GO .result when the loop throws', async () => {
    const taskId = 'http-throw';
    writeTaskJson(taskId, {
      id: taskId,
      description: 'will fail',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      goNogo: { goCriteria: '', noGoCriteria: '' },
    });
    const explodingRunner = async (): Promise<never> => {
      throw new Error('boom');
    };
    const { exitCode, resultPath } = await runHttpWorkerEntry(
      [taskId, 'deepseek-chat', 'https://api.deepseek.com/v1', 'DEEPSEEK_API_KEY', 'deepseek'],
      projectRoot,
      { runner: explodingRunner, send: scriptSend([finalTurn('noop')]) },
    );
    expect(exitCode).toBe(1);
    const onDisk = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['selfAssessment']).toBe('NO_GO');
    expect(String(onDisk['notes'])).toMatch(/boom/);
  });
});

// ─── 3. OpenAICompatibleAdapter.spawn() — no longer throws, launches the loop ───

interface FakeSpawnCall {
  command: string;
  args: ReadonlyArray<string>;
  options: unknown;
}

class FakeChildProcess extends EventEmitter {
  signals: NodeJS.Signals[] = [];
  kill(signal?: NodeJS.Signals): boolean {
    this.signals.push(signal ?? 'SIGTERM');
    return true;
  }
}

function makeFakeSpawn(): {
  calls: FakeSpawnCall[];
  children: FakeChildProcess[];
  fn: (command: string, args: ReadonlyArray<string>, options: unknown) => FakeChildProcess;
} {
  const calls: FakeSpawnCall[] = [];
  const children: FakeChildProcess[] = [];
  const fn = (command: string, args: ReadonlyArray<string>, options: unknown): FakeChildProcess => {
    calls.push({ command, args, options });
    const child = new FakeChildProcess();
    children.push(child);
    return child;
  };
  return { calls, children, fn };
}

describe('OpenAICompatibleAdapter.spawn — F1-013 launches the agentic worker', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'http-spawn-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function makeAdapter(spawnImpl: unknown, entryPath = '/fake/dist/agents/http-agentic-worker.js') {
    return new OpenAICompatibleAdapter({
      name: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      models: ['deepseek-chat', 'deepseek-reasoner'],
      projectDir,
      workerEntryPath: entryPath,
      spawnImpl: spawnImpl as typeof import('node:child_process').spawn,
    });
  }

  it('spawn() no longer throws — launches `node <entry> <taskId> <model> <baseURL> <apiKeyEnv> <name>`', () => {
    const { calls, fn } = makeFakeSpawn();
    const entryPath = '/fake/dist/agents/http-agentic-worker.js';
    const adapter = makeAdapter(fn, entryPath);

    expect(() => adapter.spawn('t-001', 'deepseek-chat' as never, 'unused-prompt')).not.toThrow();

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.command).toBe('node');
    expect(call.command).not.toBe('curl');
    expect(call.args[0]).toBe(entryPath);
    expect(call.args[1]).toBe('t-001');
    expect(call.args[2]).toBe('deepseek-chat');
    expect(call.args[3]).toBe('https://api.deepseek.com/v1');
    expect(call.args[4]).toBe('DEEPSEEK_API_KEY');
    expect(call.args[5]).toBe('deepseek');
    expect(adapter.listWorkers()).toContain('t-001');
  });

  it('kill(taskId) sends SIGTERM and clears the workers map', () => {
    const { children, fn } = makeFakeSpawn();
    const adapter = makeAdapter(fn);

    adapter.spawn('t-kill', 'deepseek-chat' as never, 'ignored');
    expect(adapter.listWorkers()).toContain('t-kill');

    adapter.kill('t-kill');

    expect(children[0]!.signals).toEqual(['SIGTERM']);
    expect(adapter.listWorkers()).not.toContain('t-kill');
  });

  it('child exit event clears the workers map', () => {
    const { children, fn } = makeFakeSpawn();
    const adapter = makeAdapter(fn);

    adapter.spawn('t-exit', 'deepseek-chat' as never, 'ignored');
    expect(adapter.listWorkers()).toContain('t-exit');

    children[0]!.emit('exit', 0, null);

    expect(adapter.listWorkers()).not.toContain('t-exit');
  });

  it('spawn() still rejects an unsupported model honestly', () => {
    const { fn } = makeFakeSpawn();
    const adapter = makeAdapter(fn);
    expect(() => adapter.spawn('t-bad', 'not-a-real-model' as never, 'x')).toThrow(/Unsupported model/);
  });
});
