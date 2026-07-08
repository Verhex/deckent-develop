// tests/cli/native-turn-accounting.test.ts
// ═══ Task 383-005 (born-520) — NATIVE-TURN-ACCOUNTING ═══════════════════════
// `runTurn` (native-agent-bridge.ts) streams one 'usage' AgentEvent per
// loop.ts round (src/agent/loop.ts:114-130) — a multi-tool-call turn runs
// multiple rounds. Before this fix, the 'usage' case did a plain `=`
// assignment, so each round overwrote the previous one and onTurnEnd only
// ever reported the LAST round's tokens — undercounting displayed
// token/cost for any 2+-round turn. Fix: accumulate with `+=`.
//
// `runTurn` is the single function reused for both the caller's real turn
// AND every drained bg-turn (bgTurnsEnabled wrapper, tests/cli/term2-wire.test.ts,
// task 356-011) — fixing the accumulator once fixes onTurnEnd correctness for
// every reused call. That existing test locks in "one onTurnEnd call per
// runTurn invocation, each with its OWN isolated stats" as the contract; this
// file proves accumulation is correct within each call AND that reused calls
// (main turn vs. bg turn) never leak totals into each other.

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { createChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';
import type { ProviderAdapter, ProviderEvent } from '../../src/agent/provider-tooluse/types.js';

// One scripted ProviderEvent[] per `adapter.send()` call — i.e. per loop.ts
// round, NOT per logical turn. A multi-round turn is expressed as multiple
// consecutive script entries consumed within a single engine(...) call.
function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let round = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[round++] ?? [{ type: 'done' }])) yield e; } };
}

function baseDeps(dir: string) {
  return {
    registry: buildNativeToolRegistry({ cwd: () => dir }),
    cwd: dir,
    model: 'm',
    lang: 'en' as const,
    confirm: async () => 'y' as const,
    toolSink: () => {},
  };
}

describe('native turn accounting (born-520)', () => {
  it('accumulates usage across ALL rounds of a multi-tool-call turn, not just the last round', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nta-'));
    try {
      const adapter = scripted([
        // round 1: a tool call, carrying its own usage
        [
          { type: 'tool-call', id: 'w', name: 'deckent_write_file', args: { path: 'out.txt', content: 'X' } },
          { type: 'usage', inputTokens: 100, outputTokens: 20 },
          { type: 'done' },
        ],
        // round 2: the model's final answer after seeing the tool result, its own usage
        [
          { type: 'text-delta', text: 'done' },
          { type: 'usage', inputTokens: 50, outputTokens: 10 },
          { type: 'done' },
        ],
      ]);
      let stats: { inputTokens: number; outputTokens: number } | null = null;
      const engine = createNativeEngine({ adapter, ...baseDeps(dir) });
      await engine('write it', { output: () => {}, onTurnEnd: (s) => { stats = s; } });
      // Sum of both rounds (100+50, 20+10) — NOT the last round alone (50, 10).
      expect(stats).toEqual({ inputTokens: 150, outputTokens: 30 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a three-round turn sums all three rounds', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nta-3r-'));
    try {
      const adapter = scripted([
        [{ type: 'tool-call', id: 'a', name: 'deckent_write_file', args: { path: 'a.txt', content: '1' } }, { type: 'usage', inputTokens: 10, outputTokens: 1 }, { type: 'done' }],
        [{ type: 'tool-call', id: 'b', name: 'deckent_write_file', args: { path: 'b.txt', content: '2' } }, { type: 'usage', inputTokens: 20, outputTokens: 2 }, { type: 'done' }],
        [{ type: 'text-delta', text: 'ok' }, { type: 'usage', inputTokens: 30, outputTokens: 3 }, { type: 'done' }],
      ]);
      let stats: { inputTokens: number; outputTokens: number } | null = null;
      const engine = createNativeEngine({ adapter, ...baseDeps(dir) });
      await engine('go', { output: () => {}, onTurnEnd: (s) => { stats = s; } });
      expect(stats).toEqual({ inputTokens: 60, outputTokens: 6 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a single-round turn still reports exactly that round\'s usage (no double-count from a fresh accumulator)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nta-1r-'));
    try {
      const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 7, outputTokens: 3 }, { type: 'done' }]]);
      let stats: { inputTokens: number; outputTokens: number } | null = null;
      const engine = createNativeEngine({ adapter, ...baseDeps(dir) });
      await engine('hello', { output: () => {}, onTurnEnd: (s) => { stats = s; } });
      expect(stats).toEqual({ inputTokens: 7, outputTokens: 3 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('bg-turns wiring: a multi-round real turn and a multi-round bg turn each report their OWN accumulated total — reused onTurnEnd never leaks totals across calls', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nta-bg-'));
    try {
      const queue = createChatTurnQueue();
      const adapter = scripted([
        // real turn: 2 rounds
        [{ type: 'tool-call', id: 'w1', name: 'deckent_write_file', args: { path: 'real.txt', content: 'R' } }, { type: 'usage', inputTokens: 1, outputTokens: 1 }, { type: 'done' }],
        [{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 2, outputTokens: 2 }, { type: 'done' }],
        // synthetic bg turn (drained after the real turn ends): 2 rounds
        [{ type: 'tool-call', id: 'w2', name: 'deckent_write_file', args: { path: 'bg.txt', content: 'B' } }, { type: 'usage', inputTokens: 10, outputTokens: 10 }, { type: 'done' }],
        [{ type: 'text-delta', text: 'ack' }, { type: 'usage', inputTokens: 20, outputTokens: 20 }, { type: 'done' }],
      ]);
      const turnEnds: Array<{ inputTokens: number; outputTokens: number }> = [];

      const engine = createNativeEngine({ adapter, ...baseDeps(dir), bgQueue: queue, bgTurnsEnabled: true });

      await engine('hello', {
        output: (t) => {
          // enqueue the bg event mid real-turn (never mid-turn-injected — drains after)
          if (t === 'hi') queue.enqueueBg({ source: 'sprint-x', summary: 'sprint-x done' });
        },
        onTurnEnd: (s) => turnEnds.push(s),
      });

      // Real turn: 1+2=3 in, 1+2=3 out. BG turn (own accumulator, no leak from real turn): 10+20=30 in, 10+20=30 out.
      expect(turnEnds).toEqual([
        { inputTokens: 3, outputTokens: 3 },
        { inputTokens: 30, outputTokens: 30 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
