// ═══ ollama-agentic-worker tests — T-233-002 ═══
//
// Verifies the two surgical edits to `src/providers/ollama.ts` plus the new
// `agentic-worker-entry.ts` subprocess shim.
//
// Hermetic rules (CLAUDE.md):
//   • tmpdir for all I/O; cleanup in afterEach.
//   • No spawnSync / execSync — `spawnImpl` is injected as a fake.
//   • No real network — `fetchImpl` injected.
//
// Coverage matches goCriteria:
//   (1) spawn launches `node <entry> taskId apiId host` — never `curl`.
//   (2) `isSupportedModel` accepts dynamic models from `/api/tags` AND keeps
//        the static catalog as fallback.
//   (3) `runWorkerEntry` end-to-end: task.json → runner → `.result` written
//        in the api-surface shape.
//   (4) Lifecycle preserved: `kill()` sends SIGTERM, timeout fires SIGKILL,
//        workers map cleared on both paths.
//   (5) Honest-failure path: runner throws → NO_GO `.result` + exit code 1.

import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { OllamaAdapter } from '../../src/providers/ollama.js';
import { runWorkerEntry } from '../../src/agents/agentic-worker-entry.js';
import type {
  AgenticRunnerOptions,
  AgenticRunnerResult,
} from '../../src/agents/agentic-worker-runner.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FakeSpawnCall {
  command: string;
  args: ReadonlyArray<string>;
  options: unknown;
}

/** A minimal ChildProcess stand-in — EventEmitter + signal-recording `kill`. */
class FakeChildProcess extends EventEmitter {
  signals: NodeJS.Signals[] = [];
  killed = false;

  kill(signal?: NodeJS.Signals): boolean {
    const sig = signal ?? 'SIGTERM';
    this.signals.push(sig);
    this.killed = true;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeFetchReturning(body: unknown): typeof fetch {
  return (async () => jsonResponse(body)) as unknown as typeof fetch;
}

function withTmpProjectDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'ollama-agentic-'));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}

// ─── 1. spawn() launches node entry with correct argv ───────────────────────

describe('OllamaAdapter.spawn — T-233-002 wire to agentic-worker-entry', () => {
  let project: { dir: string; cleanup: () => void };

  beforeEach(() => {
    project = withTmpProjectDir();
  });

  afterEach(() => {
    project.cleanup();
  });

  it('spawns `node <workerEntryPath> <taskId> <apiId> <host>` — not curl', () => {
    const { calls, fn } = makeFakeSpawn();
    const entryPath = '/fake/dist/agents/agentic-worker-entry.js';

    const adapter = new OllamaAdapter(project.dir, {
      workerEntryPath: entryPath,
      spawnImpl: fn as unknown as typeof import('node:child_process').spawn,
    });

    adapter.spawn('t-001', 'llama-3.2-3b', 'unused-prompt');

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.command).toBe('node');
    expect(call.command).not.toBe('curl');
    expect(call.args[0]).toBe(entryPath);
    expect(call.args[1]).toBe('t-001');
    // apiId for llama-3.2-3b in modelRegistry should be present — just confirm a
    // non-empty string was forwarded (registry id resolution is its own contract).
    expect(typeof call.args[2]).toBe('string');
    expect((call.args[2] ?? '').length).toBeGreaterThan(0);
    expect(call.args[3]).toContain('://'); // host (default http://localhost:11434)
    // Regression guard: none of the curl-specific flags appear anywhere.
    expect(call.args.join(' ')).not.toMatch(/-X\s+POST/);
    expect(call.args.join(' ')).not.toMatch(/api\/generate/);
  });
});

// ─── 2. isSupportedModel dynamic + static fallback ──────────────────────────

describe('OllamaAdapter.isSupportedModel — T-233-002 dynamic /api/tags', () => {
  let project: { dir: string; cleanup: () => void };

  beforeEach(() => {
    project = withTmpProjectDir();
  });

  afterEach(() => {
    project.cleanup();
  });

  it('accepts any model returned by /api/tags after refreshSupportedModels', async () => {
    const fetchImpl = makeFetchReturning({
      models: [{ name: 'qwen3.6:27b' }, { name: 'mystery-coder:13b' }],
    });
    const adapter = new OllamaAdapter(project.dir, { fetchImpl });

    // Before refresh: dynamic models rejected (only static catalog honored).
    expect(adapter.isSupportedModel('qwen3.6:27b' as never)).toBe(false);

    await adapter.refreshSupportedModels();

    // After refresh: dynamic acceptance for both probed names.
    expect(adapter.isSupportedModel('qwen3.6:27b' as never)).toBe(true);
    expect(adapter.isSupportedModel('mystery-coder:13b' as never)).toBe(true);

    // Static fallback still works (llama-3.2-3b is in the built-in catalog).
    expect(adapter.isSupportedModel('llama-3.2-3b' as never)).toBe(true);

    // Random unknown model still rejected — fail-closed.
    expect(adapter.isSupportedModel('definitely-not-installed:99b' as never)).toBe(false);
  });

  it('keeps static catalog as fallback when /api/tags probe fails', async () => {
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const adapter = new OllamaAdapter(project.dir, { fetchImpl: failingFetch });

    await adapter.refreshSupportedModels(); // swallows the error

    // Static catalog still recognized; dynamic model rejected.
    expect(adapter.isSupportedModel('llama-3.2-3b' as never)).toBe(true);
    expect(adapter.isSupportedModel('qwen3.6:27b' as never)).toBe(false);
  });
});

// ─── 3. runWorkerEntry: task.json → .result flow ────────────────────────────

describe('runWorkerEntry — T-233-002 entry shim end-to-end', () => {
  let project: { dir: string; cleanup: () => void };

  beforeEach(() => {
    project = withTmpProjectDir();
    mkdirSync(join(project.dir, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    project.cleanup();
  });

  function writeTaskJson(taskId: string, body: Record<string, unknown>): void {
    writeFileSync(
      join(project.dir, '.tasks', `task-${taskId}.json`),
      JSON.stringify(body, null, 2),
      'utf-8',
    );
  }

  it('reads task json, calls the runner, and writes an api-surface-shaped .result', async () => {
    const taskId = 'agentic-001';
    writeTaskJson(taskId, {
      id: taskId,
      description: 'Add a comment to allowed.ts',
      scope: {
        directories: ['src/'],
        filesRead: [],
        filesWrite: ['allowed.ts'],
      },
      goNogo: {
        goCriteria: 'allowed.ts gains a comment',
        noGoCriteria: 'file unchanged',
        techDebtAcceptable: 'none',
      },
    });

    const seenOpts: AgenticRunnerOptions[] = [];
    const mockRunner = async (opts: AgenticRunnerOptions): Promise<AgenticRunnerResult> => {
      seenOpts.push(opts);
      return {
        taskId: opts.taskId,
        filesChanged: ['allowed.ts'],
        testsPassed: true,
        selfAssessment: 'DONE',
        notes: 'comment added; tests pass',
        iterations: 3,
        terminationReason: 'task_done',
      };
    };

    const { exitCode, resultPath, result } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      project.dir,
      { runner: mockRunner },
    );

    expect(exitCode).toBe(0);
    expect(existsSync(resultPath)).toBe(true);

    // Runner received the scope + goNogo from the task json verbatim.
    expect(seenOpts).toHaveLength(1);
    expect(seenOpts[0]!.scope.filesWrite).toEqual(['allowed.ts']);
    expect(seenOpts[0]!.scope.directories).toEqual(['src/']);
    expect(seenOpts[0]!.goNogo.goCriteria).toBe('allowed.ts gains a comment');
    expect(seenOpts[0]!.prompt).toBe('Add a comment to allowed.ts');
    expect(seenOpts[0]!.projectRoot).toBe(project.dir);
    expect(seenOpts[0]!.model).toBe('qwen3.6:27b');
    expect(seenOpts[0]!.host).toBe('http://localhost:11434');

    // .result on-disk matches the return value AND the api-surface shape.
    const onDisk = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk).toEqual(result);
    expect(onDisk['taskId']).toBe(taskId);
    expect(onDisk['filesChanged']).toEqual(['allowed.ts']);
    expect(typeof onDisk['linesAdded']).toBe('number');
    expect(typeof onDisk['linesRemoved']).toBe('number');
    // testsPassed/coverage are nullable (İŞ2): a measured testsPassed (true here)
    // is preserved; coverage is uninstrumented by the agentic loop → honest null.
    expect(onDisk['testsPassed'] === null || typeof onDisk['testsPassed'] === 'boolean').toBe(true);
    expect(onDisk['coverage'] === null || typeof onDisk['coverage'] === 'number').toBe(true);
    expect(onDisk['coverage']).toBeNull();
    expect(onDisk['selfAssessment']).toBe('DONE');
    expect(onDisk['notes']).toMatch(/comment added/);
    expect(onDisk['evaluationDecision']).toBe('DONE');

    // Heartbeat was written and reached the DONE state.
    const hb = JSON.parse(
      readFileSync(join(project.dir, '.tasks', `task-${taskId}.hb`), 'utf-8'),
    ) as Record<string, unknown>;
    expect(hb['status']).toBe('DONE');
    expect(hb['taskId']).toBe(taskId);
  });

  it('writes a NO_GO .result and exits 1 when the runner throws', async () => {
    const taskId = 'agentic-throw';
    writeTaskJson(taskId, {
      id: taskId,
      description: 'will fail',
      scope: { directories: [], filesRead: [], filesWrite: [] },
      goNogo: { goCriteria: '', noGoCriteria: '' },
    });

    const explodingRunner = async (): Promise<AgenticRunnerResult> => {
      throw new Error('boom');
    };

    const { exitCode, resultPath } = await runWorkerEntry(
      [taskId, 'qwen3.6:27b', 'http://localhost:11434'],
      project.dir,
      { runner: explodingRunner },
    );

    expect(exitCode).toBe(1);
    const onDisk = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(onDisk['selfAssessment']).toBe('NO_GO');
    expect(onDisk['evaluationDecision']).toBe('NO_GO');
    expect(String(onDisk['notes'])).toMatch(/boom/);
  });

  it('writes a NO_GO .result when argv is missing pieces', async () => {
    const { exitCode, resultPath, result } = await runWorkerEntry(
      ['just-an-id'], // missing model + host
      project.dir,
    );
    expect(exitCode).toBe(1);
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.notes).toMatch(/missing argv/);
    expect(existsSync(resultPath)).toBe(true);
  });
});

// ─── 4. Lifecycle: kill SIGTERM + timeout SIGKILL preserved ────────────────

describe('OllamaAdapter lifecycle — T-233-002 regression: kill + timeout', () => {
  let project: { dir: string; cleanup: () => void };

  beforeEach(() => {
    project = withTmpProjectDir();
  });

  afterEach(() => {
    project.cleanup();
    vi.useRealTimers();
  });

  it('kill(taskId) sends SIGTERM to the spawned worker and clears the workers map', () => {
    const { children, fn } = makeFakeSpawn();
    const adapter = new OllamaAdapter(project.dir, {
      workerEntryPath: '/fake/entry.js',
      spawnImpl: fn as unknown as typeof import('node:child_process').spawn,
    });

    adapter.spawn('t-kill', 'llama-3.2-3b', 'ignored');
    expect(adapter.listWorkers()).toContain('t-kill');

    adapter.kill('t-kill');

    expect(children[0]!.signals).toEqual(['SIGTERM']);
    expect(adapter.listWorkers()).not.toContain('t-kill');
  });

  it('exceeding defaultTimeoutMs fires SIGKILL via setTimeout', () => {
    vi.useFakeTimers();
    const { children, fn } = makeFakeSpawn();
    const adapter = new OllamaAdapter(project.dir, {
      defaultTimeoutMs: 50,
      workerEntryPath: '/fake/entry.js',
      spawnImpl: fn as unknown as typeof import('node:child_process').spawn,
    });

    adapter.spawn('t-timeout', 'llama-3.2-3b', 'ignored');
    expect(children[0]!.signals).toEqual([]);

    vi.advanceTimersByTime(100);

    expect(children[0]!.signals).toEqual(['SIGKILL']);
    expect(adapter.listWorkers()).not.toContain('t-timeout');
  });

  it('child `exit` event clears the workers map even without explicit kill', () => {
    const { children, fn } = makeFakeSpawn();
    const adapter = new OllamaAdapter(project.dir, {
      workerEntryPath: '/fake/entry.js',
      spawnImpl: fn as unknown as typeof import('node:child_process').spawn,
    });

    adapter.spawn('t-exit', 'llama-3.2-3b', 'ignored');
    expect(adapter.listWorkers()).toContain('t-exit');

    children[0]!.emit('exit', 0, null);

    expect(adapter.listWorkers()).not.toContain('t-exit');
  });
});
