// chat-session — Persistent claude session for the native REPL (Sprint 222 / 222-001).
//
// PROBLEM (cc system-debug 2026-06-02): the native REPL spawns the host claude
// CLI ONCE PER TURN via defaultSubscriptionSpawn (chat-native.ts) with
// `--print <prompt>`. Each spawn pays the claude CLI cold-start cost (~4.5s)
// so the REPL feels frozen on every reply. Measured: startup 0.188s, +1
// message 4.3s. claude-code itself does not pay this cost — it keeps one
// persistent session.
//
// SOLUTION: spawn the claude CLI ONCE in stream-json mode (see
// DEFAULT_PERSISTENT_ARGS) and reuse the SAME child across REPL turns. Each
// user message is one JSON line written to stdin; responses arrive as NDJSON
// events on stdout. First turn pays the cold-start; subsequent turns reuse the
// warm process and only pay the model latency.
//
// Why stream-json and not `--continue`: `--continue` attaches to the most
// recent on-disk session and complicates test isolation — it also still pays
// cold-start per spawn. Conversation continuity inside a REPL run is provided
// by the persistent stdin stream itself (every user message shares the same
// long-lived child). The session stays warm until exit() is called.
//
// PUBLIC SURFACE
//   • createPersistentClaudeSession(opts) — ChatProviderAdapter with reuse counters
//   • defaultPersistentSpawn(binary, args, env) — production spawn (node:child_process)
//   • parseStreamJsonLine(raw) — pure parser, exported for tests
//   • buildSubscriptionEnv(base?) — strips API-key vars so subscription auth wins
//
// CALLER: entry.ts buildReplProvider claude branch (follow-up task 222-002 wire).

import { spawn as nodeSpawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import type { Writable } from 'node:stream';

import { getMessage } from '../helpers/messages.js';

import type {
  ChatMessage,
  ChatProviderAdapter,
  StreamChunk,
  ToolCall,
} from './chat-native.js';

// ─── Types ──────────────────────────────────────────────────────────

/** Minimal stdio surface a persistent claude child must expose. */
export interface PersistentClaudeHandle {
  stdin: Writable;
  stdoutLines: AsyncIterable<string>;
  wait: Promise<{ exitCode: number | null }>;
  kill(): void;
}

/** Spawn shim — production wraps node:child_process.spawn; tests inject a fake. */
export interface PersistentSpawnFn {
  (binary: string, args: readonly string[], env: NodeJS.ProcessEnv): PersistentClaudeHandle;
}

export interface PersistentClaudeSessionOptions {
  /** Override CLI binary (default: 'claude'). */
  binary?: string;
  /** Inject a custom spawn — primarily for tests. */
  spawnFn?: PersistentSpawnFn;
  /** Args inserted before stdin (default: stream-json persistent mode). */
  extraArgs?: readonly string[];
  /** Env override (default: process.env minus ANTHROPIC_API_KEY for subscription auth). */
  env?: NodeJS.ProcessEnv;
  /**
   * Sprint 224 T-224-005/006 — agentic system prompt. When set, it is passed
   * via `--append-system-prompt` so the model emits `<deckent_tool>{json}</…>`
   * directives for file/shell actions, which {@link parseDeckentToolCalls}
   * turns into tool_use the REPL loop confirms + executes. Omit for plain chat.
   */
  systemPrompt?: string;
  /**
   * UI language for telemetry warnings (default: 'en'). Set to 'tr' to emit
   * Turkish-language mismatch warnings. Full wiring from the entry point is a
   * follow-up; 'en' default is correct for all existing callers.
   */
  lang?: string;
}

// ─── Agentic tool-use tag protocol (Sprint 224 T-224-005/006) ────────
//
// Provider-agnostic, text-based tool-use: the model is instructed (system
// prompt) to emit `<deckent_tool>{"name":"deckent_write_file","args":{…}}</…>`
// for actions. We parse those tags out of the reply and surface them as
// ToolCall objects so runChatNativeLoop dispatches them (through the confirm-
// gated tool-exec dispatcher). The text-tag approach avoids coupling to any
// one provider's native tool_use schema (claude/codex/gemini all just emit text).

const DECKENT_TOOL_TAG_RE = /<deckent_tool>\s*([\s\S]*?)\s*<\/deckent_tool>/gi;

/** Default agentic system prompt — instructs the model to emit tool tags. */
export const DECKENT_AGENTIC_SYSTEM_PROMPT = [
  'Sen deckent: doğal dilde sohbet eden, ama dosya/komut AKSİYONU gerektiğinde',
  'GERÇEKTEN iş yapabilen bir AI agent\'sın. Kullanıcı bir dosya yazmanı/düzenlemeni/',
  'okumanı veya komut çalıştırmanı isterse, kısa bir açıklamadan sonra şu etiketi',
  '(veya birden fazlasını) üret:',
  '<deckent_tool>{"name":"<tool>","args":{...}}</deckent_tool>',
  'Geçerli tool\'lar: deckent_write_file{path,content}, deckent_read_file{path},',
  'deckent_edit_file{path,old,new}, deckent_bash{cmd}. Aksiyon gerekmiyorsa normal',
  'sohbet et. Etiketten sonra deckent onay alıp çalıştırır ve sonucu sana iletir;',
  'o zaman kullanıcıya kısaca sonucu bildirirsin.',
].join(' ');

/** Telemetry result from parsing tool-call tags. */
export interface ToolCallsResult {
  /** Valid, dispatchable tool calls. */
  calls: ToolCall[];
  /** Total regex matches (valid + malformed). */
  tagCount: number;
  /** Tags that matched but had un-parseable JSON, missing name, or empty body. */
  malformedCount: number;
}

/**
 * Parse `<deckent_tool>…</deckent_tool>` directives with full telemetry.
 * Returns valid calls plus counts for mismatch detection. Malformed tags are
 * no longer silently dropped — callers can surface a warning to the user.
 */
export function parseDeckentToolCallsFull(text: string): ToolCallsResult {
  if (typeof text !== 'string' || text.length === 0) {
    return { calls: [], tagCount: 0, malformedCount: 0 };
  }
  const calls: ToolCall[] = [];
  let malformedCount = 0;
  let m: RegExpExecArray | null;
  DECKENT_TOOL_TAG_RE.lastIndex = 0;
  while ((m = DECKENT_TOOL_TAG_RE.exec(text)) !== null) {
    const body = (m[1] ?? '').trim();
    if (!body) { malformedCount++; continue; }
    try {
      const parsed = JSON.parse(body) as { name?: unknown; args?: unknown };
      if (typeof parsed.name !== 'string') { malformedCount++; continue; }
      const args = parsed.args && typeof parsed.args === 'object'
        ? (parsed.args as Record<string, unknown>)
        : {};
      calls.push({ id: `tool-${calls.length}`, name: parsed.name, args });
    } catch {
      malformedCount++;
    }
  }
  return { calls, tagCount: calls.length + malformedCount, malformedCount };
}

/**
 * Parse `<deckent_tool>…</deckent_tool>` directives out of a reply into
 * ToolCall objects. Ids are positional (`tool-<n>`) so they are deterministic
 * (no Date.now/Math.random). Backward-compat wrapper — use
 * {@link parseDeckentToolCallsFull} when telemetry is needed.
 */
export function parseDeckentToolCalls(text: string): ToolCall[] {
  return parseDeckentToolCallsFull(text).calls;
}

/** Session interface — extends ChatProviderAdapter with lifecycle controls + counters. */
export interface PersistentClaudeSession extends ChatProviderAdapter {
  /** Number of child processes actually spawned (1 after first send, no growth). */
  readonly spawnCount: number;
  /** Number of times an existing child was reused for a subsequent turn. */
  readonly reuseCount: number;
  /** True while the persistent child is alive (between first send and exit()). */
  isAlive(): boolean;
  /** Close stdin, kill the child, await close. Idempotent. */
  exit(): Promise<void>;
}

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Default args for the persistent claude session. `--print` enables the
 * non-interactive surface required for stream-json I/O; `--input-format
 * stream-json` keeps the child accepting new user turns over stdin (THIS is
 * the key flag that turns the one-shot CLI into a persistent session);
 * `--include-partial-messages` surfaces incremental token deltas so the REPL
 * can stream output without waiting for the full turn.
 */
export const DEFAULT_PERSISTENT_ARGS: readonly string[] = Object.freeze([
  '--print',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--include-partial-messages',
  '--verbose',
]);

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Subscription env — drop API-key vars so the child claude CLI uses its
 * bundled session auth (matches subscriptionReplEnv in entry.ts).
 */
export function buildSubscriptionEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  delete env['ANTHROPIC_API_KEY'];
  delete env['DECKENT_CLAUDE_API_KEY'];
  return env;
}

/**
 * Test-only mock handle factory — used when `DECKENT_PTY_MOCK` env var is set.
 * Each element of `responses` is a full-text LLM reply for one turn; the mock
 * wraps it in a `result` NDJSON event and emits it when stdin receives a line.
 */
function createMockPersistentHandle(responses: string[]): PersistentClaudeHandle {
  let responseIdx = 0;
  const queuedLines: string[] = [];
  let resolveNext: (() => void) | null = null;
  let stdinEnded = false;

  const stdinPt = new PassThrough();
  stdinPt.on('data', (chunk: Buffer) => {
    if (chunk.toString().includes('\n')) {
      const resp = responses[responseIdx] ?? responses[responses.length - 1];
      if (resp != null) {
        queuedLines.push(JSON.stringify({ type: 'result', result: resp }));
        resolveNext?.();
        resolveNext = null;
      }
      responseIdx++;
    }
  });
  stdinPt.on('end', () => {
    stdinEnded = true;
    resolveNext?.();
    resolveNext = null;
  });

  const stdoutLines: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (queuedLines.length > 0) yield queuedLines.shift()!;
        if (stdinEnded && queuedLines.length === 0) break;
        await new Promise<void>((r) => { resolveNext = r; });
      }
    },
  };
  const wait = new Promise<{ exitCode: number | null }>((resolve) => {
    stdinPt.once('end', () => resolve({ exitCode: 0 }));
    stdinPt.once('close', () => resolve({ exitCode: 0 }));
  });
  return {
    stdin: stdinPt,
    stdoutLines,
    wait,
    kill() { try { stdinPt.destroy(); } catch { /* already destroyed */ } },
  };
}

/**
 * Production spawn — invokes the CLI with three-way piped stdio and parses
 * stdout into newline-delimited lines via node:readline. The handle exposes
 * a Writable stdin (for stream-json input), an async-iterable of lines (for
 * NDJSON output parsing), a close-wait promise, and a kill control.
 *
 * When `DECKENT_PTY_MOCK` env var is set, returns a scripted mock handle
 * (test-only injection for PTY harness verification).
 */
export function defaultPersistentSpawn(
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): PersistentClaudeHandle {
  const mockData = process.env['DECKENT_PTY_MOCK'];
  if (mockData) {
    try {
      const responses = JSON.parse(mockData) as string[];
      if (Array.isArray(responses)) return createMockPersistentHandle(responses);
    } catch { /* fall through to real spawn */ }
  }

  const child = nodeSpawn(binary, [...args], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = child.stdout;
  if (!stdout) {
    // Defensive: stdio: 'pipe' guarantees stdout, but the type is nullable.
    throw new Error('chat-session: child.stdout missing — spawn returned no readable pipe');
  }
  stdout.setEncoding('utf-8');
  const rl = createInterface({ input: stdout, crlfDelay: Infinity });

  // Sprint 380 T-380-005 — a spawn failure (e.g. ENOENT for a missing or
  // misconfigured provider binary) fires Node's 'error' event on the
  // ChildProcess AND independently on its stdio streams. An EventEmitter
  // 'error' event with NO listener is thrown as an uncaught exception (Node
  // contract) — with none of the four listeners below wired, a bad provider
  // binary crashed the whole REPL process instead of producing a handled
  // turn. `stdoutLines` re-throws the captured error once the readline loop
  // ends — that turns into a real rejection out of `runTurn`'s
  // `await it.next()`, which `send()`/`stream()` propagate as a thrown
  // error. That is exactly the pre-call-throw shape chat-native.ts's
  // existing `gracefulErrors` option already converts into a handled
  // `chat.provider_error` turn (chat-native.ts is out of this task's write
  // scope — reuse its contract rather than duplicate it here).
  //
  // `settled`/`settledPromise` below exist because whether 'error' or the
  // stdout pipe's own natural close is delivered FIRST is not guaranteed:
  // Node can detect a failed spawn either synchronously (fast path,
  // 'error' fires immediately via process.nextTick — always before any
  // stdio stream event) OR by forking and discovering the exec() failure
  // asynchronously through an internal error pipe (slow path — that read
  // is itself a poll-phase I/O callback racing the stdout pipe's own
  // close callback at the libuv/kernel level, so either can win). If the
  // readline loop below finished simply because `rl` closed naturally, that
  // is NOT proof the spawn succeeded — a pending 'error' may just not have
  // been delivered yet. `settledPromise` resolves on whichever of 'error' /
  // 'close' the child reports first, so we always know the true outcome
  // before deciding to throw — `close` is guaranteed to eventually fire
  // once the process has ended and stdio has closed (Node contract), so
  // this wait is bounded, not an arbitrary timeout.
  let spawnError: Error | null = null;
  let settled = false;
  let resolveSettled: (() => void) | null = null;
  const settledPromise = new Promise<void>((resolve) => { resolveSettled = resolve; });
  const markSettled = (): void => {
    if (settled) return;
    settled = true;
    resolveSettled?.();
  };
  const onSpawnError = (err: unknown): void => {
    if (!spawnError) spawnError = err instanceof Error ? err : new Error(String(err));
    markSettled();
    rl.close();
  };
  child.on('error', onSpawnError);
  child.stdin?.on('error', onSpawnError);
  child.stdout?.on('error', onSpawnError);
  child.stderr?.on('error', onSpawnError);
  child.once('close', markSettled);

  const stdoutLines: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      for await (const line of rl) yield line as string;
      if (!settled) await settledPromise;
      if (spawnError) throw spawnError;
    },
  };
  const wait = new Promise<{ exitCode: number | null }>((resolve) => {
    child.once('close', (code) => resolve({ exitCode: code }));
    child.once('error', () => resolve({ exitCode: null }));
  });
  return {
    stdin: child.stdin as Writable,
    stdoutLines,
    wait,
    kill() {
      try {
        child.kill();
      } catch {
        // already dead
      }
    },
  };
}

/** Build the JSON line we feed to stream-json input for one user message. */
function buildUserMessageLine(text: string): string {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  }) + '\n';
}

/** Parsed stream-json event — text fragment + done marker + optional result fallback. */
export interface ParsedStreamEvent {
  text: string;
  done: boolean;
  /** Final aggregated text from the `result` event — fallback when no deltas arrived. */
  resultText?: string;
  /** Full text extracted from the `assistant` complete-message event (content[].text join). */
  assistantText?: string;
  /** Sprint 224 T-224-021 — token usage from the `result` event (for the stats footer). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Parse one NDJSON line from claude's stream-json output. Recognises:
 *   • `content_block_delta` → incremental token text
 *   • `result` → end-of-turn marker (carries aggregated text as fallback)
 * Everything else (system init, message_start, content_block_start, etc.) is
 * ignored so the REPL output is not polluted with metadata events.
 */
export function parseStreamJsonLine(raw: string): ParsedStreamEvent {
  if (typeof raw !== 'string' || raw.length === 0) return { text: '', done: false };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { text: '', done: false };
  }
  if (obj === null || typeof obj !== 'object') return { text: '', done: false };
  const rec = obj as Record<string, unknown>;

  // `result` is emitted at the top level (end-of-turn marker).
  if (rec['type'] === 'result') {
    const resultText = typeof rec['result'] === 'string' ? (rec['result'] as string) : '';
    // T-224-021 — pull token usage off the result event for the stats footer.
    let usage: ParsedStreamEvent['usage'];
    const u = rec['usage'];
    if (u !== null && typeof u === 'object') {
      const ur = u as Record<string, unknown>;
      const inTok = typeof ur['input_tokens'] === 'number' ? (ur['input_tokens'] as number) : 0;
      const outTok = typeof ur['output_tokens'] === 'number' ? (ur['output_tokens'] as number) : 0;
      usage = { inputTokens: inTok, outputTokens: outTok };
    }
    return { text: '', done: true, resultText, usage };
  }

  // `assistant` complete-message event — carries the full reply in message.content.
  // Delta streams can be partial; this event is the authoritative complete text.
  // We extract it as `assistantText` (not `text`) so callers can reconcile at
  // turn-end without double-yielding the already-streamed delta content.
  if (rec['type'] === 'assistant') {
    const msg = rec['message'];
    if (msg !== null && typeof msg === 'object') {
      const content = (msg as Record<string, unknown>)['content'];
      if (Array.isArray(content)) {
        const parts = (content as unknown[]).filter(
          (b): b is { type: string; text: string } =>
            b !== null &&
            typeof b === 'object' &&
            (b as Record<string, unknown>)['type'] === 'text' &&
            typeof (b as Record<string, unknown>)['text'] === 'string',
        );
        const joined = parts.map((b) => b.text).join('');
        if (joined.length > 0) return { text: '', done: false, assistantText: joined };
      }
    }
    return { text: '', done: false };
  }

  // Sprint 224 T-224-011 — claude `--include-partial-messages` wraps the SSE
  // stream in an envelope: `{ type: 'stream_event', event: { type:
  // 'content_block_delta', delta: { text } } }`. The incremental token deltas
  // live INSIDE `event`, so we must unwrap it — otherwise no partial deltas are
  // ever matched and the whole reply only arrives via the final `result`
  // event, making the REPL feel like it dumps the answer at once (chunky/slow).
  // Fall back to the raw record so un-wrapped `content_block_delta` lines
  // (other providers / older formats / existing tests) still parse.
  const evt =
    rec['type'] === 'stream_event' && rec['event'] !== null && typeof rec['event'] === 'object'
      ? (rec['event'] as Record<string, unknown>)
      : rec;

  if (evt['type'] === 'content_block_delta') {
    const delta = evt['delta'];
    if (delta !== null && typeof delta === 'object') {
      const t = (delta as Record<string, unknown>)['text'];
      if (typeof t === 'string') return { text: t, done: false };
    }
  }

  return { text: '', done: false };
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a persistent claude session. The child is spawned LAZILY on the
 * first `send()`/`stream()` call so constructing the session has zero cost
 * (constructor is a pure factory). Every subsequent turn reuses the same
 * child — measured by `reuseCount` so the dashboard / smoke verifier can
 * assert the cold-start is paid exactly once per session.
 *
 * Pair with entry.ts → buildReplProvider claude branch (follow-up task) so
 * the native REPL stops paying the per-turn ~4.5s cold-start.
 */
export function createPersistentClaudeSession(
  opts: PersistentClaudeSessionOptions = {},
): PersistentClaudeSession {
  const binary = opts.binary ?? 'claude';
  const spawnFn = opts.spawnFn ?? defaultPersistentSpawn;
  const baseArgs = opts.extraArgs ?? DEFAULT_PERSISTENT_ARGS;
  const lang = opts.lang ?? 'en';
  // T-224-005/006 — append the agentic system prompt once at spawn so the model
  // emits <deckent_tool> directives for actions across the whole session.
  const extraArgs = opts.systemPrompt
    ? [...baseArgs, '--append-system-prompt', opts.systemPrompt]
    : baseArgs;
  const env = opts.env ?? buildSubscriptionEnv();

  let handle: PersistentClaudeHandle | null = null;
  let lineIter: AsyncIterator<string> | null = null;
  let spawnCount = 0;
  let reuseCount = 0;
  let exited = false;

  function ensureSpawn(): PersistentClaudeHandle {
    if (handle && !exited) {
      // Existing warm child — this is the win. reuseCount tracks the saving.
      reuseCount++;
      return handle;
    }
    handle = spawnFn(binary, extraArgs, env);
    lineIter = handle.stdoutLines[Symbol.asyncIterator]();
    spawnCount++;
    // Sprint 380 T-380-005 — a fresh spawn after exit() must clear the
    // teardown flag; otherwise isAlive() (handle !== null && !exited) stays
    // falsely `false` for a brand-new, alive child on a kill+restart cycle.
    exited = false;
    return handle;
  }

  function lastUserText(messages: readonly ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === 'user') return m.content;
    }
    return '';
  }

  // T-224-005/006 — what to send to the model for THIS turn. After a tool the
  // loop appends a `tool` result message and re-invokes; feed that result back
  // (as a user turn) so the model knows the action ran and replies to the user
  // (a final, tag-free message) instead of re-emitting the tool tag in a loop.
  //
  // T-285-004 — collect ALL consecutive trailing tool messages so that when N
  // tools run in one turn, the model receives all N results (not just the last).
  function turnInput(messages: readonly ChatMessage[]): string {
    // Walk backward to find the start of the trailing tool-result run.
    let toolStart = messages.length;
    while (toolStart > 0 && messages[toolStart - 1]?.role === 'tool') {
      toolStart--;
    }
    const toolMessages = messages.slice(toolStart);

    if (toolMessages.length === 0) {
      return lastUserText(messages);
    }

    if (toolMessages.length === 1) {
      // Single tool: preserve the existing format exactly (backward-compat).
      return `[deckent tool sonucu]\n${toolMessages[0]!.content}\n\nKullanıcıya kısaca sonucu bildir.`;
    }

    // Multiple tools: combined block with [i/N] order + toolUseId labels.
    const n = toolMessages.length;
    const entries = toolMessages.map((m, i) => {
      const label = m.toolUseId ?? `tool-${i}`;
      return `[${i + 1}/${n}] ${label}: ${m.content}`;
    });
    return `[deckent tool sonuçları]\n${entries.join('\n')}\n\nKullanıcıya kısaca sonuçları bildir.`;
  }

  async function* runTurn(prompt: string): AsyncGenerator<StreamChunk> {
    const h = ensureSpawn();
    h.stdin.write(buildUserMessageLine(prompt));
    const it = lineIter;
    if (!it) return;
    let collected = '';
    let assistantText = ''; // full text from `assistant` complete-message events
    let lastUsage: ParsedStreamEvent['usage']; // T-224-021 — token usage off the result event
    while (true) {
      const next = await it.next();
      if (next.done) break;
      const parsed = parseStreamJsonLine(next.value);
      if (parsed.text.length > 0) {
        collected += parsed.text;
        yield { text: parsed.text };
      }
      if (parsed.assistantText && parsed.assistantText.length > 0) {
        // Store full message text for reconciliation — do not yield here to avoid
        // double-streaming content already covered by the delta stream.
        assistantText = parsed.assistantText;
      }
      if (parsed.done) {
        if (parsed.usage) lastUsage = parsed.usage;
        // Fallback yield: no deltas arrived at all — stream the best full text once
        // so the consumer receives something visible.
        if (collected.length === 0) {
          const fallback = parsed.resultText || assistantText;
          if (fallback) yield { text: fallback };
        }
        // Reconcile: prefer the most comprehensive text source for tool-call parsing.
        // Delta streams can be partial; `resultText` and `assistantText` carry the
        // complete reply. Use whichever is longest (longer = more complete).
        const rt = parsed.resultText ?? '';
        if (rt.length > collected.length) collected = rt;
        if (assistantText.length > collected.length) collected = assistantText;
        break;
      }
    }
    // T-224-005/006 — if the reply carries <deckent_tool> directives, surface
    // them as tool_use so the loop confirms + executes them; otherwise it's a
    // normal end_turn reply. T-224-021 — carry token usage for the stats footer.
    // T-285-005 — telemetry: surface malformed-tag count as user-visible warning.
    const { calls: toolCalls, malformedCount } = parseDeckentToolCallsFull(collected);
    if (malformedCount > 0) {
      const warn = getMessage('tui.tool_telemetry_mismatch', lang, {
        found: String(toolCalls.length + malformedCount),
        executed: String(toolCalls.length),
        malformed: String(malformedCount),
      });
      yield { text: '\n' + warn + '\n' };
    }
    if (toolCalls.length > 0) {
      yield { done: { text: collected, stopReason: 'tool_use', toolCalls, usage: lastUsage } };
      return;
    }
    yield { done: { text: collected, stopReason: 'end_turn', usage: lastUsage } };
  }

  return {
    get spawnCount() {
      return spawnCount;
    },
    get reuseCount() {
      return reuseCount;
    },
    isAlive() {
      return handle !== null && !exited;
    },
    async send(messages) {
      let collected = '';
      for await (const chunk of runTurn(turnInput(messages))) {
        if (chunk.text) collected += chunk.text;
        if (chunk.done) return chunk.done;
      }
      return { text: collected, stopReason: 'end_turn' };
    },
    async *stream(messages) {
      yield* runTurn(turnInput(messages));
    },
    async exit() {
      if (!handle || exited) return;
      exited = true;
      try {
        handle.stdin.end();
      } catch {
        // already closed
      }
      try {
        handle.kill();
      } catch {
        // already dead
      }
      await handle.wait.catch(() => undefined);
      handle = null;
      lineIter = null;
    },
  };
}
