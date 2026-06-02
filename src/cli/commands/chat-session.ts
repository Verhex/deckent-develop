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
import type { Writable } from 'node:stream';

import type {
  ChatMessage,
  ChatProviderAdapter,
  StreamChunk,
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
 * Production spawn — invokes the CLI with three-way piped stdio and parses
 * stdout into newline-delimited lines via node:readline. The handle exposes
 * a Writable stdin (for stream-json input), an async-iterable of lines (for
 * NDJSON output parsing), a close-wait promise, and a kill control.
 */
export function defaultPersistentSpawn(
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): PersistentClaudeHandle {
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
  const stdoutLines: AsyncIterable<string> = {
    async *[Symbol.asyncIterator]() {
      for await (const line of rl) yield line as string;
    },
  };
  const wait = new Promise<{ exitCode: number | null }>((resolve) => {
    child.once('close', (code) => resolve({ exitCode: code }));
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
    return { text: '', done: true, resultText };
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
  const extraArgs = opts.extraArgs ?? DEFAULT_PERSISTENT_ARGS;
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
    return handle;
  }

  function lastUserText(messages: readonly ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === 'user') return m.content;
    }
    return '';
  }

  async function* runTurn(prompt: string): AsyncGenerator<StreamChunk> {
    const h = ensureSpawn();
    h.stdin.write(buildUserMessageLine(prompt));
    const it = lineIter;
    if (!it) return;
    let collected = '';
    while (true) {
      const next = await it.next();
      if (next.done) break;
      const parsed = parseStreamJsonLine(next.value);
      if (parsed.text.length > 0) {
        collected += parsed.text;
        yield { text: parsed.text };
      }
      if (parsed.done) {
        if (collected.length === 0 && parsed.resultText) {
          collected = parsed.resultText;
          yield { text: parsed.resultText };
        }
        break;
      }
    }
    yield { done: { text: collected, stopReason: 'end_turn' } };
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
      for await (const chunk of runTurn(lastUserText(messages))) {
        if (chunk.text) collected += chunk.text;
        if (chunk.done) return chunk.done;
      }
      return { text: collected, stopReason: 'end_turn' };
    },
    async *stream(messages) {
      yield* runTurn(lastUserText(messages));
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
