// ═══ agentic-worker-runner tests — hermetic + tmpdir + scripted fetch ═══
//
// Spec §8 + CLAUDE.md hermetic rules:
//   • tmpdir for all I/O; cleanup in afterEach.
//   • scripted fetchImpl — no real network.
//   • no spawnSync / execSync.
//
// Covers spec §6 termination matrix:
//   1. write_file / edit_file actually change disk + filesChanged populated.
//   2. Scope-dışı write_file is HARD-REJECTED and the error is fed back to
//      the model in the NEXT fetch request payload (advisor sharpening #4).
//   3. Return shape contains taskId / filesChanged / selfAssessment / notes /
//      iterations / terminationReason.
//   4. maxIterations cap with file changes → GO_WITH_TECH_DEBT.
//   5. maxIterations cap with no changes → NO_GO.
//   6. task_done assessment is honored.
//   7. fetch throwing (unreachable) → NO_GO + reason.
//   8. non-OK HTTP status → NO_GO + reason.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runAgenticWorker,
  DEFAULT_MAX_ITERATIONS,
  type AgenticRunnerOptions,
} from '../../src/agents/agentic-worker-runner.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Build a stub fetch that returns a scripted sequence of /api/chat bodies. */
function scriptFetch(
  bodies: unknown[],
  captured: { url: string; body: unknown }[],
): typeof fetch {
  let i = 0;
  return (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    let bodyParsed: unknown;
    try {
      bodyParsed = init?.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      bodyParsed = init?.body;
    }
    captured.push({ url, body: bodyParsed });
    const next = bodies[Math.min(i, bodies.length - 1)];
    i++;
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** Build a fetch that throws (unreachable simulation). */
function throwingFetch(message: string): typeof fetch {
  return (async () => {
    throw new Error(message);
  }) as unknown as typeof fetch;
}

/** Build a fetch that returns a non-OK status. */
function statusFetch(status: number, body: string): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })) as unknown as typeof fetch;
}

/** A single Ollama-shape /api/chat response with the given tool_calls. */
function chatResp(
  toolCalls: { name: string; args: Record<string, unknown>; id?: string }[],
  content = '',
): unknown {
  return {
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls.map((c, idx) => ({
        id: c.id ?? `call-${idx}`,
        function: { name: c.name, arguments: c.args },
      })),
    },
  };
}

/** Build options with sensible defaults. */
function buildOpts(
  projectRoot: string,
  overrides: Partial<AgenticRunnerOptions> = {},
): AgenticRunnerOptions {
  return {
    taskId: 'test-001',
    model: 'qwen3.6:27b',
    host: 'http://localhost:11434',
    prompt: 'Do the task.',
    scope: {
      directories: ['src/'],
      filesWrite: ['allowed.ts'],
      filesRead: [],
    },
    goNogo: {
      goCriteria: 'file written',
      noGoCriteria: 'nothing written',
      techDebtAcceptable: 'minor',
    },
    projectRoot,
    ...overrides,
  };
}

// ─── Suite setup ────────────────────────────────────────────────────────────

describe('runAgenticWorker — F1-013 agentic worker harness (T-233-001)', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'agentic-runner-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // ── Test 1: write_file actually writes a file via chat-tool-exec ──
  it('write_file dispatches to chat-tool-exec → file appears on disk; filesChanged populated', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const fetchImpl = scriptFetch(
      [
        chatResp([
          { name: 'write_file', args: { path: 'allowed.ts', content: 'export const x = 1;\n' } },
        ]),
        chatResp([
          { name: 'task_done', args: { selfAssessment: 'DONE', notes: 'wrote allowed.ts' } },
        ]),
      ],
      captured,
    );

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(existsSync(join(projectRoot, 'allowed.ts'))).toBe(true);
    expect(readFileSync(join(projectRoot, 'allowed.ts'), 'utf-8')).toBe('export const x = 1;\n');
    expect(result.filesChanged).toEqual(['allowed.ts']);
    expect(result.selfAssessment).toBe('DONE');
    expect(result.terminationReason).toBe('task_done');
    expect(result.iterations).toBe(2);
    expect(captured.length).toBe(2);
    expect(captured[0]?.url).toBe('http://localhost:11434/api/chat');
  });

  // ── Test 1b: edit_file actually edits an existing file ──
  it('edit_file replaces text in an existing in-scope file; filesChanged tracks path', async () => {
    writeFileSync(join(projectRoot, 'allowed.ts'), 'export const x = 1;\n', 'utf-8');
    const fetchImpl = scriptFetch(
      [
        chatResp([
          {
            name: 'edit_file',
            args: { path: 'allowed.ts', old: 'const x = 1', new: 'const x = 42' },
          },
        ]),
        chatResp([
          { name: 'task_done', args: { selfAssessment: 'DONE', notes: 'edited' } },
        ]),
      ],
      [],
    );

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(readFileSync(join(projectRoot, 'allowed.ts'), 'utf-8')).toBe('export const x = 42;\n');
    expect(result.filesChanged).toEqual(['allowed.ts']);
    expect(result.selfAssessment).toBe('DONE');
  });

  // ── Phase-1c: task_done WITHOUT a valid selfAssessment but with files changed → GO_WITH_TECH_DEBT (not NO_GO) ──
  it('task_done with missing/invalid selfAssessment but files changed → GO_WITH_TECH_DEBT (work not punished as NO_GO)', async () => {
    const fetchImpl = scriptFetch(
      [
        chatResp([{ name: 'write_file', args: { path: 'allowed.ts', content: 'export const x = 1;\n' } }]),
        chatResp([{ name: 'task_done', args: {} }]), // no selfAssessment, no notes (the dogfood case)
      ],
      [],
    );
    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));
    expect(result.filesChanged).toEqual(['allowed.ts']);
    expect(result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(result.terminationReason).toBe('task_done');
    expect(result.notes).toMatch(/valid selfAssessment|defaulted/);
  });

  // ── Phase-1c: task_done without a valid selfAssessment AND no files changed → NO_GO ──
  it('task_done with missing selfAssessment and no files changed → NO_GO', async () => {
    const fetchImpl = scriptFetch([chatResp([{ name: 'task_done', args: {} }])], []);
    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));
    expect(result.filesChanged).toEqual([]);
    expect(result.selfAssessment).toBe('NO_GO');
  });

  // ── Test 2: scope-out-of-bounds write → hard-reject + error fed back to model ──
  it('out-of-scope write_file is HARD-REJECTED and the scope error is fed into the NEXT request', async () => {
    const captured: { url: string; body: unknown }[] = [];
    const fetchImpl = scriptFetch(
      [
        // Turn 1: model proposes an out-of-scope path.
        chatResp([
          { name: 'write_file', args: { path: '../escape.ts', content: 'pwn' }, id: 'call-evil' },
        ]),
        // Turn 2: model self-corrects and calls task_done with NO_GO.
        chatResp([
          { name: 'task_done', args: { selfAssessment: 'NO_GO', notes: 'no in-scope path' } },
        ]),
      ],
      captured,
    );

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    // The escape file MUST NOT have been written anywhere reachable.
    expect(existsSync(join(projectRoot, '..', 'escape.ts'))).toBe(false);
    expect(result.filesChanged).toEqual([]);
    expect(result.selfAssessment).toBe('NO_GO');

    // Advisor #4: the scope-violation must be visible in the 2nd request payload.
    expect(captured.length).toBe(2);
    const secondBody = captured[1]?.body as { messages: { role: string; content: string }[] };
    const toolMsg = secondBody.messages.find(m => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.content).toContain('[scope-violation]');
    expect(toolMsg?.content).toContain('../escape.ts');
  });

  // ── Test 3: result shape contract ──
  it('returns the documented .result-shape fields (taskId / filesChanged / selfAssessment / notes / iterations / terminationReason)', async () => {
    const fetchImpl = scriptFetch(
      [chatResp([{ name: 'task_done', args: { selfAssessment: 'DONE', notes: 'noop' } }])],
      [],
    );
    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(result).toMatchObject({
      taskId: 'test-001',
      filesChanged: [],
      selfAssessment: 'DONE',
      notes: 'noop',
      iterations: 1,
      terminationReason: 'task_done',
    });
    expect(Array.isArray(result.filesChanged)).toBe(true);
  });

  // ── Test 4: max iterations with file changes → GO_WITH_TECH_DEBT ──
  it('maxIterations exhausted WITH file changes → GO_WITH_TECH_DEBT', async () => {
    // Each turn writes the same file (in-scope) and never calls task_done.
    const turnBody = chatResp([
      { name: 'write_file', args: { path: 'allowed.ts', content: 'v1' } },
    ]);
    const fetchImpl = scriptFetch([turnBody, turnBody, turnBody], []);

    const result = await runAgenticWorker(
      buildOpts(projectRoot, { fetchImpl, maxIterations: 2 }),
    );

    expect(result.iterations).toBe(2);
    expect(result.terminationReason).toBe('max_iterations');
    expect(result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(result.filesChanged).toContain('allowed.ts');
  });

  // ── Test 5: max iterations with no changes → NO_GO ──
  it('maxIterations exhausted WITHOUT any file changes → NO_GO', async () => {
    // Each turn issues only a read_file (no write/edit, no task_done).
    const turnBody = chatResp([
      { name: 'read_file', args: { path: 'README.md' } },
    ]);
    // Seed a README so read doesn't error (errors are fine but cleaner to read OK).
    writeFileSync(join(projectRoot, 'README.md'), '# test', 'utf-8');
    const fetchImpl = scriptFetch([turnBody, turnBody, turnBody], []);

    const result = await runAgenticWorker(
      buildOpts(projectRoot, { fetchImpl, maxIterations: 2 }),
    );

    expect(result.terminationReason).toBe('max_iterations');
    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.filesChanged).toEqual([]);
  });

  // ── Test 6: task_done assessment is honored ──
  it('task_done propagates selfAssessment and notes verbatim', async () => {
    const fetchImpl = scriptFetch(
      [
        chatResp([
          {
            name: 'task_done',
            args: { selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'partial: missing test 3' },
          },
        ]),
      ],
      [],
    );

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(result.selfAssessment).toBe('GO_WITH_TECH_DEBT');
    expect(result.notes).toBe('partial: missing test 3');
    expect(result.terminationReason).toBe('task_done');
  });

  // ── Test 7: fetch throws (Ollama unreachable) → NO_GO + reason ──
  it('Ollama unreachable (fetch throws) → NO_GO and notes contain the reason', async () => {
    const fetchImpl = throwingFetch('ECONNREFUSED 127.0.0.1:11434');

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.terminationReason).toBe('api_error');
    expect(result.notes).toContain('ECONNREFUSED');
  });

  // ── Test 8: non-OK HTTP status → NO_GO + status code in notes ──
  it('Ollama returns 500 → NO_GO and status surfaces in notes', async () => {
    const fetchImpl = statusFetch(500, 'internal server error');

    const result = await runAgenticWorker(buildOpts(projectRoot, { fetchImpl }));

    expect(result.selfAssessment).toBe('NO_GO');
    expect(result.terminationReason).toBe('api_error');
    expect(result.notes).toContain('500');
  });

  // ── Test 9: DEFAULT_MAX_ITERATIONS is the spec-mandated 25 ──
  it('exports DEFAULT_MAX_ITERATIONS = 25 (spec §6 config-surfaced cap)', () => {
    expect(DEFAULT_MAX_ITERATIONS).toBe(25);
  });
});
