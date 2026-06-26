// ═══ Class-B API usage-accumulate → .result (sprint-328 328-005) ═══
//
// Spec §Class-B: API providers receive token usage in the HTTP response and the
// agentic loop must ACCUMULATE it across every turn, then surface the running
// total in `.result.tokenUsage` (never the 0/0 default). For the ollama agentic
// worker — the only Class-B provider that flows through `runAgenticWorker`'s
// `/api/chat` loop — the entry's `.result.tokenUsage` is the SOLE source of truth
// (ollama has no `adapter.extractUsage` and leaves no CLI usage log, so the
// orchestrator keeps the worker's non-zero claim verbatim). openai-compatible /
// bedrock Class-B usage is captured in their OWN `complete()`/`extractUsage`
// adapters and does not route through this runner — out of scope for this file.
//
// CLAUDE.md hermetic rules: tmpdir for all I/O, cleanup in afterEach, scripted
// fetch (no network), no spawnSync/execSync. These tests drive the REAL
// `runAgenticWorker` end-to-end via `runWorkerEntry` (no stubbed runner) so the
// loop's per-turn accumulation is exercised, not faked.
//
// Coverage:
//   A. Multi-turn (3 ollama /api/chat turns) → `.result.tokenUsage` equals the
//      SUMMED prompt_eval_count/eval_count across all turns, non-zero.
//   B. Faithfulness: a runner that reports a malformed usage (negative / NaN) is
//      CLAMPED to honest 0 — never a fabricated count. (Pre-normalize wiring this
//      garbage passed straight through → this test would be RED.)
//   C. Single-turn (task_done turn carries usage) → one HTTP response's usage
//      surfaces non-zero (Class-B single-response capture).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkerEntry } from '../../src/agents/agentic-worker-entry.js';
import type {
  AgenticRunnerOptions,
  AgenticRunnerResult,
} from '../../src/agents/agentic-worker-runner.js';

// ─── Test helpers ───────────────────────────────────────────────────────────

const MODEL = 'qwen3.6:27b';
const HOST = 'http://localhost:11434';

/** One ollama `/api/chat` response: top-level usage + optional tool_calls. */
function ollamaTurn(
  usage: { prompt_eval_count?: number; eval_count?: number },
  toolCalls: { name: string; args: Record<string, unknown> }[],
  content = '',
): unknown {
  return {
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls.map((c, idx) => ({
        id: `call-${idx}`,
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    },
    ...usage,
  };
}

/**
 * Scripted fetch returning a sequence of real `Response` objects (one per loop
 * turn). The last body repeats if the loop somehow asks for more — but each test
 * scripts a terminating `task_done` so the sequence is exact.
 */
function scriptFetch(bodies: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const next = bodies[Math.min(i, bodies.length - 1)];
    i++;
    return new Response(JSON.stringify(next), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** Seed a valid task.json so `runWorkerEntry` can read its spec. */
function seedTaskJson(projectDir: string, taskId: string): void {
  mkdirSync(join(projectDir, '.tasks'), { recursive: true });
  const task = {
    id: taskId,
    description: 'accumulate usage across the agentic loop',
    scope: { directories: ['src/'], filesRead: ['out.ts'], filesWrite: ['out.ts'] },
    goNogo: { goCriteria: 'usage accumulated', noGoCriteria: 'nothing', techDebtAcceptable: 't' },
  };
  writeFileSync(
    join(projectDir, '.tasks', `task-${taskId}.json`),
    JSON.stringify(task),
    'utf-8',
  );
}

/** A stub runner emitting a scripted result (for the faithfulness clamp test). */
function stubRunner(
  result: AgenticRunnerResult,
): (opts: AgenticRunnerOptions) => Promise<AgenticRunnerResult> {
  return async (_opts: AgenticRunnerOptions) => result;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Class-B usage accumulation → .result.tokenUsage (328-005)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'api-usage-acc-'));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // ── A: multi-turn real loop accumulates summed usage into .result ──
  it('accumulates prompt_eval_count/eval_count across a multi-turn /api/chat loop into .result.tokenUsage', async () => {
    const taskId = '328-005-multi';
    seedTaskJson(projectDir, taskId);

    // 3 turns: two read_file turns keep the loop running, the third calls
    // task_done. EVERY turn carries usage — including the terminating turn —
    // because the runner accumulates right after parsing each response.
    const bodies = [
      ollamaTurn({ prompt_eval_count: 100, eval_count: 40 }, [
        { name: 'read_file', args: { path: 'out.ts' } },
      ]),
      ollamaTurn({ prompt_eval_count: 130, eval_count: 25 }, [
        { name: 'read_file', args: { path: 'out.ts' } },
      ]),
      ollamaTurn({ prompt_eval_count: 90, eval_count: 15 }, [
        { name: 'task_done', args: { selfAssessment: 'DONE', notes: 'accumulated' } },
      ]),
    ];

    const { result } = await runWorkerEntry([taskId, MODEL, HOST], projectDir, {
      fetchImpl: scriptFetch(bodies),
    });

    // Summed across all 3 turns — proves accumulation, not last-turn-only capture.
    expect(result.tokenUsage).toEqual({
      inputTokens: 100 + 130 + 90, // 320
      outputTokens: 40 + 25 + 15, // 80
      cacheReadTokens: 0,
      provider: 'ollama',
      model: MODEL,
    });
    // Non-zero is the headline Class-B guarantee (no silent 0/0 default).
    expect(result.tokenUsage.inputTokens).toBeGreaterThan(0);
    expect(result.tokenUsage.outputTokens).toBeGreaterThan(0);
    expect(result.selfAssessment).toBe('DONE');
  });

  // ── B: malformed provider usage is clamped — faithful, no fabricated counts ──
  it('clamps a malformed (negative/NaN) runner usage to honest 0 instead of propagating garbage', async () => {
    const taskId = '328-005-faithful';
    seedTaskJson(projectDir, taskId);

    const runResult: AgenticRunnerResult = {
      taskId,
      filesChanged: [],
      testsPassed: undefined,
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'malformed usage from a misbehaving provider',
      iterations: 1,
      terminationReason: 'task_done',
      // A provider that reports a negative input and a NaN output. Pre-normalize
      // wiring (`?? 0`) let -5 and NaN pass straight into `.result` — unfaithful.
      tokenUsage: {
        inputTokens: -5,
        outputTokens: Number.NaN,
        provider: 'ollama',
        cost: 0,
      },
    };

    const { result } = await runWorkerEntry([taskId, MODEL, HOST], projectDir, {
      runner: stubRunner(runResult),
    });

    expect(result.tokenUsage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: 'ollama',
      model: MODEL,
    });
    expect(Number.isNaN(result.tokenUsage.outputTokens)).toBe(false);
    expect(result.tokenUsage.inputTokens).toBeGreaterThanOrEqual(0);
  });

  // ── C: single-turn real loop — one HTTP response's usage surfaces non-zero ──
  it('captures usage from a single /api/chat response (task_done on the first turn)', async () => {
    const taskId = '328-005-single';
    seedTaskJson(projectDir, taskId);

    const bodies = [
      ollamaTurn({ prompt_eval_count: 256, eval_count: 64 }, [
        { name: 'task_done', args: { selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'one turn' } },
      ]),
    ];

    const { result } = await runWorkerEntry([taskId, MODEL, HOST], projectDir, {
      fetchImpl: scriptFetch(bodies),
    });

    expect(result.tokenUsage).toEqual({
      inputTokens: 256,
      outputTokens: 64,
      cacheReadTokens: 0,
      provider: 'ollama',
      model: MODEL,
    });
  });
});
