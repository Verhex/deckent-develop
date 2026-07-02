// tests/cli/term2-wire.test.ts
// ═══ Task 356-011 — TERM2-WIRE — bg-events → turn (native-agent-bridge) ═════
//
// native-agent-bridge.ts is the sole (engine-level) authority for connecting
// ChatTurnQueue (353-009, READ-ONLY here) to the native ReplEngine: bg-events
// enqueued while a turn is in flight must never be injected mid-turn — they
// buffer, then drain as brand-new synthetic user turns ("[bg] <summary>")
// once the active turn ends. Gated behind `bgTurnsEnabled` (the
// `repl_surface.bg_turns ?? false` config seam) — off by default, and the
// flag-off path must stay byte-identical to pre-356-011 createNativeEngine.

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { createNativeEngine, formatBgTurnInput } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { createChatTurnQueue } from '../../src/cli/repl/chat-turn-queue.js';
import type { ProviderAdapter, ProviderEvent, ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

// Same fake-adapter shape as tests/cli/native-agent-bridge.test.ts: one
// scripted ProviderEvent[] per `send()` call (turn), advancing a counter.
function scripted(scripts: ProviderEvent[][]): ProviderAdapter {
  let turn = 0;
  return { name: 'mock', async *send() { for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e; } };
}

function baseDeps() {
  return {
    registry: buildNativeToolRegistry({ cwd: () => tmpdir() }),
    cwd: tmpdir(),
    model: 'm',
    lang: 'en' as const,
    confirm: async () => 'y' as const,
    toolSink: () => {},
  };
}

describe('formatBgTurnInput', () => {
  it('prefixes each coalesced event summary with "[bg] ", newline-joined', () => {
    expect(formatBgTurnInput({ source: 'sprint-354', events: [{ source: 'sprint-354', summary: 'sprint-354 tamamlandı: 3/3 DONE' }] }))
      .toBe('[bg] sprint-354 tamamlandı: 3/3 DONE');
    expect(formatBgTurnInput({
      source: 'sprint-354',
      events: [
        { source: 'sprint-354', summary: 'task 001 done' },
        { source: 'sprint-354', summary: 'task 002 done' },
      ],
    })).toBe('[bg] task 001 done\n[bg] task 002 done');
  });
});

describe('createNativeEngine — bg-turns wiring (356-011)', () => {
  it('flag-off (no bgQueue): single turn, output/onTurnEnd unchanged — byte-identical', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 3, outputTokens: 1 }, { type: 'done' }]]);
    const out: string[] = [];
    const ends: unknown[] = [];
    const engine = createNativeEngine({ adapter, ...baseDeps() });
    await engine('hello', { output: (t) => out.push(t), onTurnEnd: (s) => ends.push(s) });
    expect(out).toEqual(['hi']);
    expect(ends).toEqual([{ inputTokens: 3, outputTokens: 1 }]);
  });

  it('flag-off (bgQueue supplied but bgTurnsEnabled false): still a single turn, queue left untouched', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    const queue = createChatTurnQueue();
    queue.enqueueBg({ source: 'sprint-354', summary: 'pre-existing, should never surface' });
    const out: string[] = [];
    const engine = createNativeEngine({ adapter, ...baseDeps(), bgQueue: queue, bgTurnsEnabled: false });
    await engine('hello', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out).toEqual(['hi']);
    expect(queue.size()).toBe(1); // never drained — flag was off
  });

  it('bgTurnsEnabled true but no bgQueue: falls back to the base engine (inert, no throw)', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    const out: string[] = [];
    const engine = createNativeEngine({ adapter, ...baseDeps(), bgTurnsEnabled: true });
    await engine('hello', { output: (t) => out.push(t), onTurnEnd: () => {} });
    expect(out).toEqual(['hi']);
  });

  it('flag-on (fake-loop): a bg event enqueued mid-turn is NOT injected until the turn ends, then drains as a synthetic "[bg] ..." turn', async () => {
    const queue = createChatTurnQueue();
    const adapter = scripted([
      [{ type: 'text-delta', text: 'hi' }, { type: 'usage', inputTokens: 1, outputTokens: 1 }, { type: 'done' }],   // real turn
      [{ type: 'text-delta', text: 'ack' }, { type: 'usage', inputTokens: 2, outputTokens: 2 }, { type: 'done' }],  // synthetic bg turn
    ]);
    const outputs: string[] = [];
    const turnEnds: Array<{ inputTokens: number; outputTokens: number }> = [];
    const recorded: Array<{ role: string; content: string }[]> = [];
    let midTurnDrain: unknown = 'not-run';
    let wasActiveMidTurn: boolean | null = null;

    const engine = createNativeEngine({
      adapter, ...baseDeps(), bgQueue: queue, bgTurnsEnabled: true,
      recordTurn: (messages: ProviderMessage[]) => recorded.push(messages.map((m) => ({ role: m.role, content: m.content }))),
    });

    await engine('hello', {
      output: (t) => {
        outputs.push(t);
        // First chunk arrives while the REAL turn is still in flight — simulate
        // a sprint-done notify firing mid-turn (the "event-source seam").
        if (t === 'hi' && wasActiveMidTurn === null) {
          wasActiveMidTurn = queue.userTurnActive;
          queue.enqueueBg({ source: 'sprint-354', summary: 'sprint-354 tamamlandı: 3/3 DONE' });
          midTurnDrain = queue.drainAsTurns(); // must no-op (queue still active) — never mid-turn-injected
        }
      },
      onTurnEnd: (s) => turnEnds.push(s),
    });

    expect(wasActiveMidTurn).toBe(true);
    expect(midTurnDrain).toEqual([]);
    expect(outputs).toEqual(['hi', 'ack']);          // real turn text, then the drained synthetic turn's text
    expect(turnEnds).toEqual([
      { inputTokens: 1, outputTokens: 1 },
      { inputTokens: 2, outputTokens: 2 },
    ]);
    // transcript() is the CROSS-TURN transcript (session.ts), so recorded[1] is
    // the full 4-message conversation after the synthetic turn — check the
    // user-role messages in order, not a single index.
    expect(recorded).toHaveLength(2);
    const userMessages = recorded[1]!.filter((m) => m.role === 'user').map((m) => m.content);
    expect(userMessages).toEqual(['hello', '[bg] sprint-354 tamamlandı: 3/3 DONE']);
    expect(queue.userTurnActive).toBe(false);        // idle again once fully drained
    expect(queue.size()).toBe(0);
  });

  it('flag-on: two different-source bg events enqueued mid-turn drain as two ordered synthetic turns', async () => {
    const queue = createChatTurnQueue();
    const adapter = scripted([
      [{ type: 'text-delta', text: 'real' }, { type: 'done' }],
      [{ type: 'text-delta', text: 'syn-a' }, { type: 'done' }],
      [{ type: 'text-delta', text: 'syn-b' }, { type: 'done' }],
    ]);
    const outputs: string[] = [];
    const recorded: Array<{ role: string; content: string }[]> = [];

    const engine = createNativeEngine({
      adapter, ...baseDeps(), bgQueue: queue, bgTurnsEnabled: true,
      recordTurn: (messages: ProviderMessage[]) => recorded.push(messages.map((m) => ({ role: m.role, content: m.content }))),
    });

    await engine('go', {
      output: (t) => {
        outputs.push(t);
        if (t === 'real') {
          queue.enqueueBg({ source: 'sprint-354', summary: 'sprint 354 finished' });
          queue.enqueueBg({ source: 'autonomous-tick', summary: 'tick #7 completed' });
        }
      },
      onTurnEnd: () => {},
    });

    expect(outputs).toEqual(['real', 'syn-a', 'syn-b']);
    // Last recordTurn call carries the full cross-turn transcript — check the
    // user-role messages, in order (real turn, then the two synthetic turns).
    const userMessages = recorded[recorded.length - 1]!.filter((m) => m.role === 'user').map((m) => m.content);
    expect(userMessages).toEqual([
      'go',
      '[bg] sprint 354 finished',
      '[bg] tick #7 completed',
    ]);
  });
});
