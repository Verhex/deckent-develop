// tests/cli/native-parity-gate.test.ts
//
// NATIVE-M5-GATE (358-015, MASTER-PLAN Sıra-63 TERM-NAT) — legacy chat-loop vs
// native-engine behavior-parity matrix, in one hermetic, deterministic file.
//
//   legacy chat-loop = runChatNativeLoop        (src/cli/commands/chat-native.ts)
//   native-engine    = createNativeEngine        (src/cli/repl/native-agent-bridge.ts)
//                       (wraps createAgentSession/runAgentTurn, src/agent/session.ts + loop.ts)
//
// Confirmed naming by src/cli/repl/run.tsx:227 — "the legacy runChatNativeLoop
// path is unchanged when the [DECKENT_NATIVE_AGENT] flag is unset" next to the
// "Native-agent engine (SP-1 M3, flag-gated)" block that builds createNativeEngine.
//
// Both engines are driven through fully scripted mock adapters (the same
// canned-ProviderEvent[][]-per-adapter-call shape tests/agent/session.test.ts
// and src/cli/repl/native-transport.ts's DECKENT_NATIVE_MOCK parsing already
// use) — no real provider, no network. createNativeEngine reads
// `.deckent/permission-policy.json` / `.deckent/settings.local.json` under its
// `cwd`, so every native run gets a fresh mkdtempSync'd cwd, removed after use
// — no real project state is ever touched (test-hermeticity rule).
//
// KNOWN_DIVERGENCES below is the honest record the M5 default-flip decision
// needs: where the two engines behave differently ON PURPOSE or by omission,
// with the reasoning spelled out. Emptiness is not the goal — honesty is.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runChatNativeLoop,
  type ChatMessage,
  type ChatProviderAdapter,
  type ChatNativeOptions,
  type McpToolDispatcher,
} from '../../src/cli/commands/chat-native.js';
import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── KNOWN_DIVERGENCES ────────────────────────────────────────────────────

interface Divergence {
  id: string;
  area: string;
  legacy: string;
  native: string;
  rationale: string;
}

export const KNOWN_DIVERGENCES: Divergence[] = [
  {
    id: 'tool-denial-marker-text',
    area: 'tool-call → confirm(deny) → result',
    legacy: 'Denial is a caller-composed dispatcher wrapper; this suite\'s wrapper (mirroring ' +
      'src/cli/repl/run.tsx\'s real production dispatcher) returns the literal ' +
      '"[deckent-denied] <tool>" marker string as the tool-result content fed back to the model.',
    native: 'Denial is decided centrally by runAgentTurn (src/agent/loop.ts) on a permission ' +
      '\'deny\' response and always yields tool-result output "[rejected by user]".',
    rationale: 'The two engines were built independently (legacy = Sprint 203/211, native = ' +
      'SP-1 M2/M3) and never unified their denial vocabulary. Both are honest, human-readable ' +
      'markers, but a consumer that pattern-matches the exact string (e.g. a trace analyzer, or ' +
      'a training-data label) will see different tokens for the same semantic event across the ' +
      'two engines. Not a blocker for M5, but should be normalized before default-flip if any ' +
      'downstream tooling depends on the literal text.',
  },
  {
    id: 'confirm-gate-ownership',
    area: 'tool-call → confirm → result (architecture)',
    legacy: 'runChatNativeLoop has NO built-in permission tiering. Any confirm-gating (as in ' +
      'run.tsx\'s dispatcher wrapper, or this suite\'s confirmingDispatcher) is bolted on by the ' +
      'CALLER around McpToolDispatcher — there is no compile-time or runtime guarantee that a ' +
      'given caller gates every risky tool.',
    native: 'createAgentSession/runAgentTurn enforce PermissionPolicy centrally, per registered ' +
      'ToolRegistry tier (silent/confirm/always), for EVERY tool and EVERY caller — a caller ' +
      'cannot forget to gate a tool because the gate lives inside the loop, not around it.',
    rationale: 'This is the single most decision-relevant divergence for M5: native is safe-by-' +
      'construction (governance-by-construction, per this project\'s pivot notes), legacy is ' +
      'safe-by-convention. Any M5 default-flip argument should weigh this centralization as a ' +
      'point IN FAVOR of native, independent of feature parity.',
  },
  {
    id: 'error-handling-opt-in',
    area: 'cancel/hata-yolu (pre-call and mid-stream provider failure)',
    legacy: 'A provider failure is only converted into an inline error turn when the caller ' +
      'explicitly sets `gracefulErrors: true` (default false → the failure is rethrown out of ' +
      'runChatNativeLoop). Even with gracefulErrors on, ONLY a failure before any output has ' +
      'been streamed for that turn is caught — once ANY text chunk has already reached the ' +
      'output sink, a later stream failure still rethrows (chat-native.ts: `if (!opts.' +
      'gracefulErrors || outputCount > 0) throw err;`).',
    native: 'runAgentTurn wraps the entire adapter.send() drain in a single try/catch and ALWAYS ' +
      'converts a failure (pre- or mid-stream, no opt-out) into an inline `error` AgentEvent + ' +
      '`turn-end`, never rethrowing out of session.send()/createNativeEngine.',
    rationale: 'Verified with concrete test evidence in this file (see the "cancel/error path" ' +
      'group): the legacy default (no flag) still crashes the loop on a plain provider throw, ' +
      'and even the opt-in does not cover a mid-stream failure. A legacy caller that forgets the ' +
      'flag, or hits a failure after the first token streamed, gets an uncaught exception; the ' +
      'native engine never does. This is a real robustness gap the M5 decision should weigh, not ' +
      'just a naming difference.',
  },
  {
    id: 'onturnend-stats-shape',
    area: 'token-istatistiği (per-turn stats callback)',
    legacy: 'onTurnEnd receives `{ elapsedMs: number; usage?: { inputTokens: number; ' +
      'outputTokens: number } }` — wall-clock timing is always present, token usage is an ' +
      'OPTIONAL nested object (absent when the provider never surfaced usage).',
    native: 'ReplEngine.onTurnEnd receives `{ inputTokens: number; outputTokens: number }` — no ' +
      'timing field at all, and both token counts are ALWAYS present (defaulting to 0 when no ' +
      '`usage` ProviderEvent ever arrived), never nested/optional.',
    rationale: 'These are literally different TypeScript shapes, not just different values for ' +
      'the same shape. Any M5 cutover consumer that currently reads `stats.elapsedMs` or `stats.' +
      'usage?.outputTokens` (e.g. a REPL footer, or a trace/telemetry sink) will silently break ' +
      'or read `undefined` if the engine is swapped without an explicit adapter — this needs a ' +
      'shim or a consumer-side migration BEFORE default-flip, not after.',
  },
];

describe('NATIVE-M5-GATE — KNOWN_DIVERGENCES is honest (mechanical check)', () => {
  it('every declared divergence names both sides and carries a real rationale (not a hand-wave)', () => {
    expect(KNOWN_DIVERGENCES.length).toBeGreaterThan(0);
    for (const d of KNOWN_DIVERGENCES) {
      expect(d.id.length, `id for ${d.area}`).toBeGreaterThan(0);
      expect(d.area.length, `area for ${d.id}`).toBeGreaterThan(0);
      expect(d.legacy.length, `legacy text for ${d.id}`).toBeGreaterThan(0);
      expect(d.native.length, `native text for ${d.id}`).toBeGreaterThan(0);
      expect(d.rationale.length, `rationale for ${d.id}`).toBeGreaterThan(20);
    }
    // ids are unique — a duplicated id would silently shadow a real divergence.
    expect(new Set(KNOWN_DIVERGENCES.map((d) => d.id)).size).toBe(KNOWN_DIVERGENCES.length);
  });
});

// ─── Legacy driver (runChatNativeLoop) ─────────────────────────────────────

async function* linesIter(lines: readonly string[]): AsyncGenerator<string> {
  for (const l of lines) yield l;
}

/** Mirrors run.tsx's real production dispatch: base dispatcher only knows one tool. */
function baseDispatcher(onCall: (name: string, args: Record<string, unknown>) => void): McpToolDispatcher {
  return {
    async dispatch(name, args) {
      onCall(name, args);
      if (name === 'deckent_write_file') return `wrote:${String(args['path'] ?? '')}`;
      return `[mcp-error] unknown tool: ${name}`;
    },
  };
}

/**
 * Mirrors run.tsx's real production `dispatcher` wrapper (src/cli/repl/run.tsx:172-224):
 * confirm BEFORE calling the base dispatcher; on denial, return the same
 * `[deckent-denied] <tool>` marker run.tsx's own isDenied check looks for,
 * WITHOUT ever reaching the base dispatcher.
 */
function confirmingDispatcher(
  base: McpToolDispatcher,
  confirmFn: (toolName: string, args: Record<string, unknown>) => Promise<boolean>,
): McpToolDispatcher {
  return {
    async dispatch(name, args) {
      const ok = await confirmFn(name, args);
      if (!ok) return `[deckent-denied] ${name}`;
      return base.dispatch(name, args);
    },
  };
}

function scriptedLegacyProvider(responses: readonly import('../../src/cli/commands/chat-native.js').ProviderResponse[]): {
  adapter: ChatProviderAdapter;
  calls: ChatMessage[][];
} {
  const calls: ChatMessage[][] = [];
  let turn = 0;
  return {
    calls,
    adapter: {
      async send(messages) {
        // Snapshot defensively: getRecentTurns() returns the live transcript array
        // by reference when no contextWindowSize is set, and the loop pushes the
        // assistant reply onto that SAME array right after this call resolves —
        // capturing `messages` as-is would alias future mutations (mirrors the
        // defensive copy Transcript.toProviderMessages() already does natively).
        calls.push(messages.map((m) => ({ ...m })));
        const r = responses[turn++];
        if (!r) throw new Error('scripted legacy provider: no more scripted turns');
        return r;
      },
    },
  };
}

/** A legacy provider whose `stream()` emits partial text THEN throws — used to prove the
 *  mid-stream-error divergence (gracefulErrors only protects PRE-output failures). */
function midStreamThrowLegacyProvider(partialText: string, message: string): ChatProviderAdapter {
  return {
    async send() { throw new Error('midStreamThrowLegacyProvider.send should never be called (stream() is defined)'); },
    async *stream() {
      yield { text: partialText };
      throw new Error(message);
    },
  };
}

interface LegacyRun {
  output: string[];
  transcript: ChatMessage[];
  stats: Array<{ elapsedMs: number; usage?: { inputTokens: number; outputTokens: number } }>;
  threw: unknown;
}

async function runLegacy(
  provider: ChatProviderAdapter,
  dispatcher: McpToolDispatcher,
  lines: readonly string[],
  extra: Partial<ChatNativeOptions> = {},
): Promise<LegacyRun> {
  const output: string[] = [];
  const stats: LegacyRun['stats'] = [];
  let transcript: ChatMessage[] = [];
  let threw: unknown = null;
  try {
    transcript = await runChatNativeLoop({
      ...extra,
      provider,
      dispatcher,
      input: linesIter(lines),
      output: (l) => { output.push(l); },
      onTurnEnd: (s) => { stats.push(s); },
    });
  } catch (e) {
    threw = e;
  }
  return { output, transcript, stats, threw };
}

// ─── Native driver (createNativeEngine) ────────────────────────────────────

function scriptedNativeAdapter(scripts: readonly ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  return {
    requests,
    adapter: {
      name: 'scripted',
      async *send(req) {
        requests.push(req);
        const script = scripts[turn++];
        if (!script) throw new Error('scripted native adapter: no more scripted turns');
        for (const e of script) yield e;
      },
    },
  };
}

/** A native adapter whose generator yields partial text THEN throws — the native-side
 *  counterpart of midStreamThrowLegacyProvider, to show native recovers where legacy doesn't. */
function midStreamThrowNativeAdapter(partialText: string, message: string): ProviderAdapter {
  return {
    name: 'mid-stream-throw',
    async *send() {
      yield { type: 'text-delta', text: partialText };
      throw new Error(message);
    },
  };
}

/** A native adapter that fails before yielding anything — the pre-call counterpart. */
function preCallThrowNativeAdapter(message: string): ProviderAdapter {
  return {
    name: 'pre-call-throw',
    async *send(): AsyncGenerator<ProviderEvent> {
      throw new Error(message);
    },
  };
}

interface NativeToolSinkCall { verb: string; target: string; failed?: boolean }
interface NativeRun {
  output: string[];
  stats: Array<{ inputTokens: number; outputTokens: number }>;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  toolSinkCalls: NativeToolSinkCall[];
  threw: unknown;
}

async function runNative(
  adapter: ProviderAdapter,
  lines: readonly string[],
  opts: {
    toolHandler?: (args: Record<string, unknown>) => Promise<{ ok: boolean; output: string }>;
    confirmAnswers?: Array<'y' | 'a' | 'n'>;
  } = {},
): Promise<NativeRun> {
  const dir = mkdtempSync(join(tmpdir(), 'native-parity-'));
  try {
    const toolCalls: NativeRun['toolCalls'] = [];
    const reg = new ToolRegistry();
    reg.register({
      name: 'writer',
      description: 'writes a file',
      inputSchema: { type: 'object' },
      category: 'coding',
      tier: 'confirm',
      source: 'builtin',
      handler: async (args) => {
        toolCalls.push({ name: 'writer', args });
        if (opts.toolHandler) return opts.toolHandler(args);
        return { ok: true, output: `wrote:${String(args['path'] ?? '')}` };
      },
    });

    const output: string[] = [];
    const stats: NativeRun['stats'] = [];
    const toolSinkCalls: NativeToolSinkCall[] = [];
    const answers = opts.confirmAnswers ?? [];
    let answerIdx = 0;

    const engine = createNativeEngine({
      adapter,
      registry: reg,
      cwd: dir,
      model: 'mock-model',
      lang: 'en',
      confirm: async () => answers[answerIdx++] ?? 'y',
      toolSink: (info) => { toolSinkCalls.push(info as NativeToolSinkCall); },
    });

    let threw: unknown = null;
    try {
      for (const line of lines) {
        await engine(line, {
          output: (t) => { output.push(t); },
          onTurnEnd: (s) => { stats.push(s); },
        });
      }
    } catch (e) {
      threw = e;
    }
    return { output, stats, toolCalls, toolSinkCalls, threw };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── 1. Simple-turn response ────────────────────────────────────────────────

describe('NATIVE-M5-GATE — 1. simple-turn response (no tool call)', () => {
  it('legacy and native surface the identical final reply text for a plain conversational turn', async () => {
    const replyText = 'merhaba! nasil yardimci olabilirim?';

    const legacyProvider = scriptedLegacyProvider([{ text: replyText, stopReason: 'end_turn' }]);
    const legacy = await runLegacy(legacyProvider.adapter, baseDispatcher(() => {}), ['hi']);

    const nativeAdapter = scriptedNativeAdapter([[{ type: 'text-delta', text: replyText }, { type: 'done' }]]);
    const native = await runNative(nativeAdapter.adapter, ['hi']);

    expect(legacy.threw).toBeNull();
    expect(native.threw).toBeNull();
    expect(legacy.output.join('')).toBe(replyText);
    expect(native.output.join('')).toBe(replyText);
    expect(legacy.stats.length).toBe(1);
    expect(native.stats.length).toBe(1);
    expect(native.toolCalls.length).toBe(0);
  });
});

// ─── 2. tool-call → confirm → result ────────────────────────────────────────

describe('NATIVE-M5-GATE — 2. tool-call → confirm → result', () => {
  it('confirm(allow): both engines dispatch the tool exactly once with identical args, then reach the same final reply', async () => {
    const finalText = 'dosyayi yazdim.';

    const legacyProvider = scriptedLegacyProvider([
      { toolCalls: [{ id: 't1', name: 'deckent_write_file', args: { path: 'notes.md' } }], stopReason: 'tool_use' },
      { text: finalText, stopReason: 'end_turn' },
    ]);
    const legacyCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const legacyDispatcher = confirmingDispatcher(
      baseDispatcher((name, args) => legacyCalls.push({ name, args })),
      async () => true,
    );
    const legacy = await runLegacy(legacyProvider.adapter, legacyDispatcher, ['write notes.md']);

    const nativeAdapter = scriptedNativeAdapter([
      [{ type: 'tool-call', id: 't1', name: 'writer', args: { path: 'notes.md' } }, { type: 'done' }],
      [{ type: 'text-delta', text: finalText }, { type: 'done' }],
    ]);
    const native = await runNative(nativeAdapter.adapter, ['write notes.md'], { confirmAnswers: ['y'] });

    expect(legacy.threw).toBeNull();
    expect(native.threw).toBeNull();

    expect(legacyCalls).toEqual([{ name: 'deckent_write_file', args: { path: 'notes.md' } }]);
    expect(native.toolCalls).toEqual([{ name: 'writer', args: { path: 'notes.md' } }]);

    expect(legacy.output.join('')).toBe(finalText);
    expect(native.output.join('')).toBe(finalText);

    expect(native.toolSinkCalls.some((c) => c.failed === true)).toBe(false);
  });

  it('confirm(deny): both engines skip real execution and still recover with a final reply — denial MARKER TEXT diverges (see KNOWN_DIVERGENCES "tool-denial-marker-text")', async () => {
    const finalText = 'anladim, yazmiyorum.';

    const legacyProvider = scriptedLegacyProvider([
      { toolCalls: [{ id: 't1', name: 'deckent_write_file', args: { path: 'notes.md' } }], stopReason: 'tool_use' },
      { text: finalText, stopReason: 'end_turn' },
    ]);
    const legacyCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const legacyDispatcher = confirmingDispatcher(
      baseDispatcher((name, args) => legacyCalls.push({ name, args })),
      async () => false,
    );
    const legacy = await runLegacy(legacyProvider.adapter, legacyDispatcher, ['write notes.md']);

    const nativeAdapter = scriptedNativeAdapter([
      [{ type: 'tool-call', id: 't1', name: 'writer', args: { path: 'notes.md' } }, { type: 'done' }],
      [{ type: 'text-delta', text: finalText }, { type: 'done' }],
    ]);
    const native = await runNative(nativeAdapter.adapter, ['write notes.md'], { confirmAnswers: ['n'] });

    expect(legacy.threw).toBeNull();
    expect(native.threw).toBeNull();

    // Neither engine actually ran the real tool.
    expect(legacyCalls).toEqual([]);
    expect(native.toolCalls).toEqual([]);

    // Both still recover and reach the same final reply text.
    expect(legacy.output.join('')).toBe(finalText);
    expect(native.output.join('')).toBe(finalText);

    // The denial marker fed back to the model as the tool-result content differs — documented.
    const legacyToolResult = legacy.transcript.find((m) => m.role === 'tool');
    expect(legacyToolResult?.content).toBe('[deckent-denied] deckent_write_file');
    expect(native.toolSinkCalls).toEqual([{ verb: expect.stringContaining('writer'), target: '', failed: true }]);
  });
});

// ─── 3. multi-turn context ───────────────────────────────────────────────────

describe('NATIVE-M5-GATE — 3. multi-turn context', () => {
  it('turn-2\'s outbound request carries turn-1\'s user+assistant content — role/content sequence is byte-identical across both engines', async () => {
    const legacyProvider = scriptedLegacyProvider([
      { text: 'Merhaba Ali!', stopReason: 'end_turn' },
      { text: 'Adin Ali.', stopReason: 'end_turn' },
    ]);
    const legacy = await runLegacy(legacyProvider.adapter, baseDispatcher(() => {}), [
      'benim adim Ali',
      'adim neydi?',
    ]);

    const nativeAdapter = scriptedNativeAdapter([
      [{ type: 'text-delta', text: 'Merhaba Ali!' }, { type: 'done' }],
      [{ type: 'text-delta', text: 'Adin Ali.' }, { type: 'done' }],
    ]);
    const native = await runNative(nativeAdapter.adapter, ['benim adim Ali', 'adim neydi?']);

    expect(legacy.threw).toBeNull();
    expect(native.threw).toBeNull();
    expect(legacyProvider.calls.length).toBe(2);
    expect(nativeAdapter.requests.length).toBe(2);

    const legacySecondCall = legacyProvider.calls[1]!.map((m) => ({ role: m.role, content: m.content }));
    const nativeSecondCall = nativeAdapter.requests[1]!.messages.map((m) => ({ role: m.role, content: m.content }));

    const expectedSequence = [
      { role: 'user', content: 'benim adim Ali' },
      { role: 'assistant', content: 'Merhaba Ali!' },
      { role: 'user', content: 'adim neydi?' },
    ];
    expect(legacySecondCall).toEqual(expectedSequence);
    expect(nativeSecondCall).toEqual(expectedSequence);
  });
});

// ─── 4. cancel/error path ─────────────────────────────────────────────────────

describe('NATIVE-M5-GATE — 4. cancel/error path', () => {
  it('pre-call provider failure: native ALWAYS recovers inline; legacy recovers ONLY when gracefulErrors is opted in', async () => {
    const message = 'network down';

    const legacyProvider: ChatProviderAdapter = { async send() { throw new Error(message); } };
    const legacy = await runLegacy(legacyProvider, baseDispatcher(() => {}), ['hi'], { gracefulErrors: true });

    const native = await runNative(preCallThrowNativeAdapter(message), ['hi']);

    expect(legacy.threw).toBeNull();
    expect(native.threw).toBeNull();

    const expectedLegacyText = getMessage('chat.provider_error', 'en', { message });
    expect(legacy.output.join('')).toBe(expectedLegacyText);
    expect(legacy.output.join('')).toContain(message);
    expect(native.output.join('')).toContain(message);

    // onTurnEnd still fires on both even though the turn errored.
    expect(legacy.stats.length).toBe(1);
    expect(native.stats.length).toBe(1);
  });

  it('divergence evidence: legacy default (gracefulErrors unset) RETHROWS a pre-call provider failure — native never does', async () => {
    const message = 'network down';

    const legacyProvider: ChatProviderAdapter = { async send() { throw new Error(message); } };
    const legacy = await runLegacy(legacyProvider, baseDispatcher(() => {}), ['hi']); // no gracefulErrors

    const native = await runNative(preCallThrowNativeAdapter(message), ['hi']);

    expect(legacy.threw).toBeInstanceOf(Error);
    expect((legacy.threw as Error).message).toBe(message);
    expect(legacy.output.length).toBe(0);

    expect(native.threw).toBeNull();
    expect(native.output.join('')).toContain(message);
  });

  it('divergence evidence: legacy gracefulErrors does NOT protect a MID-STREAM failure (output already emitted) — native has no such gap', async () => {
    const partial = 'kismi yanit... ';
    const message = 'mid-stream boom';

    const legacy = await runLegacy(
      midStreamThrowLegacyProvider(partial, message),
      baseDispatcher(() => {}),
      ['hi'],
      { gracefulErrors: true }, // opted in, but still rethrows — that's the point
    );

    const native = await runNative(midStreamThrowNativeAdapter(partial, message), ['hi']);

    // Legacy: partial text already reached output, so gracefulErrors' outputCount>0
    // guard forces a rethrow instead of an inline error turn.
    expect(legacy.threw).toBeInstanceOf(Error);
    expect((legacy.threw as Error).message).toBe(message);
    expect(legacy.output).toEqual([partial]);

    // Native: the SAME shape of failure (partial text, then throw) never escapes —
    // it always becomes an inline error + turn-end, on top of the partial text.
    expect(native.threw).toBeNull();
    expect(native.output.join('')).toContain(partial);
    expect(native.output.join('')).toContain(message);
    expect(native.stats.length).toBe(1);
  });
});

// ─── 5. token/usage stats ─────────────────────────────────────────────────────

describe('NATIVE-M5-GATE — 5. token/usage stats', () => {
  it('both surface the same token numbers via onTurnEnd, but the callback payload SHAPE diverges (see KNOWN_DIVERGENCES "onturnend-stats-shape")', async () => {
    const usage = { inputTokens: 120, outputTokens: 45 };

    const legacyProvider = scriptedLegacyProvider([{ text: 'ok', stopReason: 'end_turn', usage }]);
    const legacy = await runLegacy(legacyProvider.adapter, baseDispatcher(() => {}), ['hi']);

    const nativeAdapter = scriptedNativeAdapter([[
      { type: 'text-delta', text: 'ok' },
      { type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      { type: 'done' },
    ]]);
    const native = await runNative(nativeAdapter.adapter, ['hi']);

    expect(legacy.threw).toBeNull();
    expect(native.threw).toBeNull();

    // Same values, reached through each engine's own shape.
    expect(legacy.stats[0]?.usage).toEqual(usage);
    expect(native.stats[0]).toEqual(usage);

    // Shape divergence, pinned mechanically: legacy always carries elapsedMs, native never does.
    expect(typeof legacy.stats[0]?.elapsedMs).toBe('number');
    expect('elapsedMs' in (native.stats[0] as object)).toBe(false);
  });
});
