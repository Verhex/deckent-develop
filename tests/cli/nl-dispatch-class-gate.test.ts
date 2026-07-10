import { describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  type ChatNativeOptions,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ProviderResponse,
} from '../../src/cli/commands/chat-native.js';
import type { AgenticAction } from '../../src/cli/commands/agentic-confirm.js';

// ═══ nl-dispatch-class-gate — ADR-D-013 Option C regression (task 375-003) ═══
//
// Verifies the class-gate wired into chat-native.ts's `opts.agenticDispatch`
// block: a matched tool's command-registry `CommandRisk` decides whether the
// confirm function is even called. `'Oku'` (read-only) tools dispatch
// directly — the confirm function must NOT be invoked at all. Any other
// tier (today only `deckent_plan`, `'Değiştir'`) still requires confirm via
// the existing mechanism, unchanged. A non-matching line still falls
// through to the provider untouched.
//
// Also folds in a defense-in-depth check inspired by the sprint-359 task
// 359-009 false-positive evidence (tests/cli/nl-dispatch-evidence.test.ts):
// under the class-gate, an `'Oku'`-tier match is harmless even if it were a
// misclassification (direct dispatch of a read-only tool), and a
// `'Değiştir'`-tier match still requires confirm before anything runs — the
// worst case is an extra prompt, never a silent destructive action. The
// specific false-positive utterances 359-009 found were fixed at the
// classifier level by born-514 (task 380-007, AGENTIC-DISPATCH-OVERMATCH —
// see tests/cli/nl-dispatch-evidence.test.ts, now a regression guard), so
// the utterances below are genuine matches rather than false positives; they
// still exercise the same tier-based class-gate behavior the false
// positives used to.

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function queuedProvider(responses: ProviderResponse[]): {
  adapter: ChatProviderAdapter;
  sendSpy: ReturnType<typeof vi.fn>;
} {
  const remaining = [...responses];
  const sendSpy = vi.fn(async () => {
    const next = remaining.shift();
    if (!next) throw new Error('queuedProvider: response queue exhausted');
    return next;
  });
  return { adapter: { send: sendSpy }, sendSpy };
}

function fakeDispatcher(canned: string = 'tool-ok'): {
  dispatcher: McpToolDispatcher;
  dispatchSpy: ReturnType<typeof vi.fn>;
} {
  const dispatchSpy = vi.fn(async () => canned);
  return { dispatcher: { dispatch: dispatchSpy }, dispatchSpy };
}

function baseOpts(overrides: Partial<ChatNativeOptions> & {
  provider: ChatProviderAdapter;
  dispatcher: McpToolDispatcher;
  input: AsyncIterable<string>;
}): ChatNativeOptions {
  return {
    output: vi.fn(),
    agenticDispatch: true,
    ...overrides,
  };
}

describe('nl-dispatch-class-gate — ADR-D-013 Option C (task 375-003)', () => {
  it("path 1/3 — Oku-direct: 'sprint durumu ne' dispatches deckent_status WITHOUT ever calling confirm", async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('STATUS=GREEN');
    const confirmSpy = vi.fn(async () => true);

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('sprint durumu ne'),
      agenticConfirm: confirmSpy,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_status', { root: '.' });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(transcript).toEqual([
      { role: 'user', content: 'sprint durumu ne' },
      { role: 'assistant', content: 'STATUS=GREEN' },
    ]);
  });

  it("path 1/3 — Oku-direct: recall intent (deckent_memory_query) also skips confirm entirely", async () => {
    const { adapter } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('{"found":1}');
    const confirmSpy = vi.fn(async () => true);

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('hafızada docker ara'),
      agenticConfirm: confirmSpy,
    }));

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("path 2/3 — Değiştir-confirm: 'sprint planla' still calls confirm; decline → cancelled, no dispatch", async () => {
    const { adapter, sendSpy } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const output = vi.fn();
    const confirmSpy = vi.fn(async () => false);

    const transcript = await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('sprint planla'),
      output,
      agenticConfirm: confirmSpy,
    }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const action = confirmSpy.mock.calls[0]![0] as AgenticAction;
    expect(action.name).toBe('deckent_plan');
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith('[agentic] cancelled: deckent_plan');
    expect(transcript).toEqual([]);
  });

  it("path 2/3 — Değiştir-confirm: 'sprint planla' + approved confirm → dispatcher called", async () => {
    const { adapter } = queuedProvider([]);
    const { dispatcher, dispatchSpy } = fakeDispatcher('plan-ok');
    const confirmSpy = vi.fn(async () => true);

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines('sprint planla'),
      agenticConfirm: confirmSpy,
    }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith('deckent_plan', { mode: 'auto' });
  });

  it('path 3/3 — no-match passthrough: ordinary sentence bypasses the class-gate entirely', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'lunch sounds great', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();
    const confirmSpy = vi.fn(async () => true);

    await runChatNativeLoop(baseOpts({
      provider: adapter,
      dispatcher,
      input: lines("let's grab lunch tomorrow"),
      agenticConfirm: confirmSpy,
    }));

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  describe('born-514-sonrası hâlâ meşru-eşleşen utterances keep the class-gate defense-in-depth honest', () => {
    it("Oku-tier match: 'recall the incident postmortem' dispatches deckent_memory_query directly, no confirm", async () => {
      const { adapter } = queuedProvider([]);
      const { dispatcher, dispatchSpy } = fakeDispatcher('{"found":0}');
      const confirmSpy = vi.fn(async () => true);

      await runChatNativeLoop(baseOpts({
        provider: adapter,
        dispatcher,
        input: lines('recall the incident postmortem'),
        agenticConfirm: confirmSpy,
      }));

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const [tool] = dispatchSpy.mock.calls[0]!;
      expect(tool).toBe('deckent_memory_query');
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it("Değiştir-tier match: 'generate plan for the migration' still requires confirm before anything runs", async () => {
      const { adapter } = queuedProvider([]);
      const { dispatcher, dispatchSpy } = fakeDispatcher();
      const output = vi.fn();
      const confirmSpy = vi.fn(async () => false);

      await runChatNativeLoop(baseOpts({
        provider: adapter,
        dispatcher,
        input: lines('generate plan for the migration'),
        output,
        agenticConfirm: confirmSpy,
      }));

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(output).toHaveBeenCalledWith('[agentic] cancelled: deckent_plan');
    });
  });

  it('agenticDispatch: false (default) → unaffected, class-gate never runs', async () => {
    const { adapter, sendSpy } = queuedProvider([
      { text: 'provider replied', stopReason: 'end_turn' },
    ]);
    const { dispatcher, dispatchSpy } = fakeDispatcher();

    await runChatNativeLoop({
      provider: adapter,
      dispatcher,
      input: lines('sprint durumu ne'),
      output: vi.fn(),
      // agenticDispatch intentionally omitted — relies on default false
    });

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
