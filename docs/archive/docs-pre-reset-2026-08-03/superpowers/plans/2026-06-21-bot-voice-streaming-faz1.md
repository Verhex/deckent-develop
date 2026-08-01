# Bot Voice & Streaming (Faz-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Fix the "unintelligible / disgusting" Telegram experience by (A) retiring the `bot-humanizer` (a 4B local model that LLM-rephrases already-clean notifications with up to 20s latency) so notifications are deterministic + instant, and (B) adding a live typing indicator + throttled progressive streaming (the bot edits one message as the agentic reply is produced, instead of going silent then dumping a wall of text).

**Architecture:** Part A deletes `bot-humanizer.ts` + `bot-completion.ts` and unwires them from the notification adapter + 4 call sites — `formatNotificationHtml` already renders clean deterministic output, so the adapter sends it directly (chunked). Part B adds optional streaming capabilities to the connector (`sendChatAction`, `editMessage`, `sendMessageReturningId`), a `onPartial` streaming hook on the chat responder (the chat-native loop already emits output line-by-line), and rewires the inbound chat path to: typing → placeholder → throttled edit-in-place as text accumulates → final edit.

**Tech Stack:** TypeScript ESM (Node16, `.js`), Node ≥24, vitest, telegraf (existing), `node:timers` (throttle). No new dependency.

> Diagnosis confirmed from live config: `bot_agent: { enabled: true, model: 'qwen3.5:4b', timeout_ms: 20000, lang: 'tr' }`. Humanizer is the culprit; it only touches NOTIFICATIONS (chat replies already bypass it).

## Global Constraints

- ESM imports MUST use `.js` extension. No new runtime dependency.
- i18n-first: every user-facing string via `getMessage` (en+tr). No hardcoded strings.
- Hermetic tests: tmpdir, async only, no spawnSync, no network; inject fakes (fake connector/clock).
- Telegram editMessageText is rate-limited (~1 edit/sec/chat) → streaming edits MUST be throttled (≥~900ms apart); a 429/edit failure is best-effort (swallow) and the FINAL edit always lands.
- Gate before each commit: `npx tsc --noEmit` clean + named tests GREEN (worktree root).
- Commits on `feat/bot-voice-streaming`; stage only each task's files.
- Streaming capabilities are OPTIONAL on the connector interface (feature-detected); connectors without them degrade to the current send-final behavior (no regression for Discord etc.).

---

## File Structure

| File | Change |
|---|---|
| `src/connectors/connector-notify-adapter.ts` | Remove `humanizer` option + `makeBotHumanizer` import; send `formatNotification(Html)` via `chunkMessage` directly |
| `src/connectors/connector-bootstrap.ts` | Drop the `humanizer` param/field + usages |
| `src/cli/commands/bot.ts`, `start.ts`, `autonomous.ts`, `src/orchestra/sprint-runner-entry.ts` | Drop `buildBotHumanizer` import + arg |
| `src/connectors/bot-humanizer.ts`, `bot-completion.ts` | **DELETE** (+ their tests) |
| `src/connectors/types.ts` | Add optional `sendChatAction?`, `editMessage?`, `sendMessageReturningId?` to `IMessageConnector` |
| `src/connectors/telegram.ts` | Implement the three optional capabilities |
| `src/connectors/chat-bridge.ts` | Add `onPartial?` to `ChatResponderDeps`; call it from `runTurn` output |
| `src/connectors/stream-throttle.ts` | NEW: `makeStreamThrottle(editFn, intervalMs)` |
| `src/connectors/connector-bootstrap.ts` (onChat) | typing + placeholder + throttled streaming edit + final edit |

---

## Task 1: Retire the humanizer (delete + unwire → deterministic notifications)

**Files:**
- Modify: `src/connectors/connector-notify-adapter.ts`, `src/connectors/connector-bootstrap.ts`, `src/cli/commands/bot.ts`, `src/cli/commands/start.ts`, `src/cli/commands/autonomous.ts`, `src/orchestra/sprint-runner-entry.ts`
- Modify: `tests/connectors/connector-notify-adapter.test.ts` (drop humanizer-specific assertions)
- Delete: `src/connectors/bot-humanizer.ts`, `src/connectors/bot-completion.ts`, `tests/connectors/bot-humanizer.test.ts`, `tests/connectors/bot-completion.test.ts`

> This is ONE atomic task: you cannot delete the modules while callers still import them, so the unwire + delete must land together for `tsc` to pass.

- [ ] **Step 1: Make the notification adapter deterministic**

In `src/connectors/connector-notify-adapter.ts`:
- Remove the import `import { makeBotHumanizer, type BotHumanizer } from './bot-humanizer.js';`
- Add `import { chunkMessage } from './message-format.js';`
- Remove `humanizer?: BotHumanizer;` from `ConnectorNotifyOptions` (and its doc comment).
- In `makeConnectorNotificationAdapter`, delete `const humanizer = opts.humanizer ?? makeBotHumanizer();` and replace `const parts = await humanizer.toParts(rendered);` with `const parts = chunkMessage(rendered);`.

- [ ] **Step 2: Drop the humanizer from connector-bootstrap**

In `src/connectors/connector-bootstrap.ts`:
- Remove `import type { BotHumanizer } from './bot-humanizer.js';`
- In `buildConnectorNotificationAdapter`, remove the `humanizer?: BotHumanizer` parameter and pass no humanizer: `return makeConnectorNotificationAdapter(targets);`
- In `ConnectorCommandsDeps`, remove the `humanizer?: BotHumanizer;` field (+ doc).
- At the adapter construction (the `makeConnectorNotificationAdapter(targets, deps.humanizer ? ... : {})`), replace with `makeConnectorNotificationAdapter(targets)`.

- [ ] **Step 3: Unwire the 4 call sites**

- `src/cli/commands/bot.ts`: remove `import { buildBotHumanizer } ...` (line 23) and the `humanizer: buildBotHumanizer(...)` key in the `bootstrapConnectorCommands` deps (line ~58).
- `src/cli/commands/start.ts`: remove `import { buildBotHumanizer } ...` (line 19); change the `buildConnectorNotificationAdapter(config.notify_connectors, {}, buildBotHumanizer(...))` call (line ~292) to drop the 3rd arg: `buildConnectorNotificationAdapter(config.notify_connectors, {})`.
- `src/cli/commands/autonomous.ts`: remove import (line 32); drop the 3rd arg at line ~680.
- `src/orchestra/sprint-runner-entry.ts`: remove the dynamic `const { buildBotHumanizer } = await import(...)` (line ~228) and drop the 3rd arg at line ~230.

- [ ] **Step 4: Delete the modules + their tests**

```bash
cd /home/alperen/deckent-dev/.claude/worktrees/bot-voice
git rm src/connectors/bot-humanizer.ts src/connectors/bot-completion.ts tests/connectors/bot-humanizer.test.ts tests/connectors/bot-completion.test.ts
```

- [ ] **Step 5: Fix the notify-adapter test**

In `tests/connectors/connector-notify-adapter.test.ts`: remove any test/assertion that injects or asserts on a `humanizer` (the option no longer exists). Keep the tests that assert the rendered notification text + buttons + per-target isolation (those still hold — they now assert the deterministic output directly). If a test passed a `humanizer` in opts, drop that arg.

- [ ] **Step 6: Verify (the gate)**

Run: `npx tsc --noEmit` → clean (no dangling humanizer imports).
Run: `npx vitest run tests/connectors` → GREEN (notify-adapter + bootstrap + others; the 2 deleted test files are gone).
Run: `grep -rn "bot-humanizer\|bot-completion\|buildBotHumanizer\|makeBotHumanizer" src tests` → NO matches (fully retired).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(bot): Faz-1 T1 — retire bot-humanizer (deterministic notifications, delete 4B-rephrase layer)"
```

---

## Task 2: Telegram connector streaming capabilities

**Files:**
- Modify: `src/connectors/types.ts` (add optional capabilities to `IMessageConnector`)
- Modify: `src/connectors/telegram.ts` (implement them)
- Test: `tests/connectors/telegram-streaming.test.ts`

**Interfaces:**
- `IMessageConnector` gains (all OPTIONAL — feature-detected):
  - `sendChatAction?(channelId: string, action: 'typing'): Promise<void>`
  - `sendMessageReturningId?(msg: OutgoingMessage): Promise<string | undefined>`
  - `editMessage?(channelId: string, messageId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/telegram-streaming.test.ts
import { describe, it, expect } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';

// Minimal fake Telegraf capturing the calls the streaming path makes.
function fakeTelegraf() {
  const calls: { method: string; args: unknown[] }[] = [];
  class FakeBot {
    constructor(public token: string) {}
    on() {}
    async launch() {}
    stop() {}
    telegram = {
      sendMessage: async (...a: unknown[]) => { calls.push({ method: 'sendMessage', args: a }); return { message_id: 4242 }; },
      editMessageText: async (...a: unknown[]) => { calls.push({ method: 'editMessageText', args: a }); return true; },
      sendChatAction: async (...a: unknown[]) => { calls.push({ method: 'sendChatAction', args: a }); return true; },
    };
  }
  return { FakeBot: FakeBot as unknown as new (t: string) => unknown, calls };
}

describe('TelegramConnector streaming capabilities', () => {
  it('sendMessageReturningId returns the message_id; editMessage + sendChatAction call telegram', async () => {
    const { FakeBot, calls } = fakeTelegraf();
    const tg = new TelegramConnector(FakeBot as never);
    await tg.startOutbound({ enabled: true, token: 't' });

    const id = await tg.sendMessageReturningId!({ connector: 'telegram', channelId: '99', text: 'hi' });
    expect(id).toBe('4242');

    await tg.sendChatAction!('99', 'typing');
    await tg.editMessage!('99', '4242', 'edited', 'HTML');

    expect(calls.map((c) => c.method)).toEqual(['sendMessage', 'sendChatAction', 'editMessageText']);
    const edit = calls.find((c) => c.method === 'editMessageText')!;
    // telegraf editMessageText signature: (chatId, messageId, inlineMessageId, text, extra)
    expect(edit.args[0]).toBe('99');
    expect(edit.args[1]).toBe(4242);
    expect(edit.args[3]).toBe('edited');
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run tests/connectors/telegram-streaming.test.ts`
Expected: FAIL (methods not defined).

- [ ] **Step 3: Add the optional capabilities to `types.ts`**

In `IMessageConnector`, after `sendMessage(...)`, add:
```typescript
  /** Send a chat action (e.g. 'typing') so the user sees the bot is working. Optional/feature-detected. */
  sendChatAction?(channelId: string, action: 'typing'): Promise<void>;
  /** Like sendMessage but returns the platform message id (for later edits). Optional. */
  sendMessageReturningId?(msg: OutgoingMessage): Promise<string | undefined>;
  /** Edit a previously-sent message in place (streaming). Optional/feature-detected. */
  editMessage?(channelId: string, messageId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void>;
```

- [ ] **Step 4: Implement them in `telegram.ts`**

Extend the `TelegrafInstance['telegram']` minimal type to include `editMessageText` and `sendChatAction`:
```typescript
  telegram: {
    sendMessage(chatId: string | number, text: string, extra?: SendExtra): Promise<{ message_id: number } | unknown>;
    editMessageText(chatId: string | number, messageId: number, inlineMessageId: undefined, text: string, extra?: SendExtra): Promise<unknown>;
    sendChatAction(chatId: string | number, action: string): Promise<unknown>;
  };
```
Add the methods to `TelegramConnector` (guard `if (!this.bot) throw ...` like sendMessage):
```typescript
  async sendChatAction(channelId: string, action: 'typing'): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    await this.bot.telegram.sendChatAction(channelId, action);
  }

  async sendMessageReturningId(msg: OutgoingMessage): Promise<string | undefined> {
    if (!this.bot) throw new Error('Telegram connector not started');
    const extra: SendExtra = {};
    if (msg.buttons && msg.buttons.length > 0) {
      extra.reply_markup = { inline_keyboard: msg.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.callbackData }))) };
    }
    if (msg.parseMode) extra.parse_mode = msg.parseMode;
    const sent = (await this.bot.telegram.sendMessage(msg.channelId, msg.text, extra)) as { message_id?: number };
    return sent && typeof sent.message_id === 'number' ? String(sent.message_id) : undefined;
  }

  async editMessage(channelId: string, messageId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    const extra: SendExtra = {};
    if (parseMode) extra.parse_mode = parseMode;
    await this.bot.telegram.editMessageText(channelId, Number(messageId), undefined, text, extra);
  }
```

- [ ] **Step 5: Run → pass**

Run: `npx vitest run tests/connectors/telegram-streaming.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/types.ts src/connectors/telegram.ts tests/connectors/telegram-streaming.test.ts
git commit -m "feat(bot): Faz-1 T2 — Telegram streaming capabilities (sendChatAction/editMessage/sendMessageReturningId)"
```

---

## Task 3: chat-bridge `onPartial` streaming hook

**Files:**
- Modify: `src/connectors/chat-bridge.ts`
- Test: `tests/connectors/chat-bridge-onpartial.test.ts`

**Interfaces:**
- `ChatResponderDeps` gains: `onPartial?: (sessionId: string, partialText: string) => void` — invoked as the reply accumulates (each output line), with the cumulative text so far.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/connectors/chat-bridge-onpartial.test.ts
import { describe, it, expect } from 'vitest';
import { makeChatResponder } from '../../src/connectors/chat-bridge.js';
import type { ChatProviderAdapter } from '../../src/cli/commands/chat-native.js';

// Fake provider that streams two text deltas then done.
const fakeProvider: ChatProviderAdapter = {
  async *stream() {
    yield { type: 'text-delta', text: 'Hel' } as never;
    yield { type: 'text-delta', text: 'lo' } as never;
    yield { type: 'done', response: { content: [{ type: 'text', text: 'Hello' }], stopReason: 'end_turn' } } as never;
  },
} as unknown as ChatProviderAdapter;

describe('chat-bridge onPartial', () => {
  it('invokes onPartial with cumulative text as the reply streams', async () => {
    const partials: string[] = [];
    const responder = makeChatResponder({
      provider: fakeProvider,
      onPartial: (_sid, txt) => partials.push(txt),
    });
    const reply = await responder('chan1', 'hi');
    expect(reply).toContain('Hello');
    expect(partials.length).toBeGreaterThan(0);
    // cumulative — last partial equals (or is a prefix-growth toward) the final
    expect(partials[partials.length - 1]).toContain('Hel');
  });
});
```

> Note: if the fake provider shape doesn't match the real `ChatProviderAdapter`/`StreamChunk` exactly, adjust the fake to satisfy `runChatNativeLoop`'s consumption (the goal is: the loop's `output` callback fires ≥1 time). Read `src/cli/commands/chat-native.ts` (`ChatProviderAdapter`, `StreamChunk`) and match it.

- [ ] **Step 2: Run → fail**

Run: `npx vitest run tests/connectors/chat-bridge-onpartial.test.ts`
Expected: FAIL (onPartial never called).

- [ ] **Step 3: Wire onPartial in `chat-bridge.ts`**

Add `onPartial?: (sessionId: string, partialText: string) => void;` to `ChatResponderDeps`.
In `runTurn`, change the loop's `output` callback to also emit the cumulative partial:
```typescript
      output: (line) => {
        if (line) {
          collected.push(line);
          deps.onPartial?.(sessionId, collected.join(''));
        }
      },
```
(No other change — `collected.join('')` is the cumulative reply-so-far.)

- [ ] **Step 4: Run → pass**

Run: `npx vitest run tests/connectors/chat-bridge-onpartial.test.ts && npx tsc --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/chat-bridge.ts tests/connectors/chat-bridge-onpartial.test.ts
git commit -m "feat(bot): Faz-1 T3 — chat-bridge onPartial streaming hook"
```

---

## Task 4: throttle util + onChat streaming wire

**Files:**
- Create: `src/connectors/stream-throttle.ts`
- Modify: `src/connectors/connector-bootstrap.ts` (the `onChat` path)
- Test: `tests/connectors/stream-throttle.test.ts`

**Interfaces:**
- `makeStreamThrottle(opts: { edit: (text: string) => Promise<void>; intervalMs?: number; now?: () => number }): { push(text: string): void; flush(): Promise<void> }` — `push` coalesces rapid updates and calls `edit` at most once per `intervalMs`; `flush` forces a final `edit` with the latest text.

- [ ] **Step 1: Write the failing throttle test**

```typescript
// tests/connectors/stream-throttle.test.ts
import { describe, it, expect } from 'vitest';
import { makeStreamThrottle } from '../../src/connectors/stream-throttle.js';

describe('makeStreamThrottle', () => {
  it('coalesces rapid pushes and always flushes the final text', async () => {
    const edits: string[] = [];
    let t = 0;
    const th = makeStreamThrottle({ edit: async (s) => { edits.push(s); }, intervalMs: 100, now: () => t });
    th.push('a');           // t=0 → first edit allowed
    await Promise.resolve();
    th.push('ab');          // t=0 → within interval, coalesced (no edit)
    t = 150; th.push('abc'); // t=150 → interval passed → edit 'abc'
    await Promise.resolve();
    await th.flush();        // final → edit latest 'abc' (dedup: skip if identical to last)
    expect(edits[0]).toBe('a');
    expect(edits).toContain('abc');
    // never edits the same text twice in a row
    for (let i = 1; i < edits.length; i++) expect(edits[i]).not.toBe(edits[i - 1]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run tests/connectors/stream-throttle.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `stream-throttle.ts`**

```typescript
// src/connectors/stream-throttle.ts
export interface StreamThrottleOptions {
  edit: (text: string) => Promise<void>;
  intervalMs?: number;
  now?: () => number;
}
export interface StreamThrottle {
  push(text: string): void;
  flush(): Promise<void>;
}

/**
 * Coalesce rapid streaming updates into rate-limited edits. `push` triggers an
 * `edit` at most once per intervalMs (Telegram editMessageText is ~1/sec/chat);
 * `flush` forces a final edit with the latest text. Identical consecutive text is
 * skipped; edit errors are swallowed (best-effort — the final flush still tries).
 */
export function makeStreamThrottle(opts: StreamThrottleOptions): StreamThrottle {
  const intervalMs = opts.intervalMs ?? 900;
  const now = opts.now ?? ((): number => Date.now());
  let latest = '';
  let lastEdited = '';
  let lastAt = -Infinity;

  async function tryEdit(): Promise<void> {
    if (latest === lastEdited) return;
    const text = latest;
    lastEdited = text;
    lastAt = now();
    try { await opts.edit(text); } catch { /* best-effort (rate limit / transient) */ }
  }

  return {
    push(text: string): void {
      latest = text;
      if (now() - lastAt >= intervalMs) void tryEdit();
    },
    async flush(): Promise<void> { await tryEdit(); },
  };
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run tests/connectors/stream-throttle.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire the `onChat` path in `connector-bootstrap.ts`**

Find the `onChat` handler (inside `bootstrapConnectorCommands`, the block that does `await send(channelId, getMessage('bot.chat_thinking', lang)); const reply = await chat(channelId, text); ...`). Replace the natural-language branch so it streams when the connector supports it, falling back to the current send-final when it doesn't:

```typescript
                  onChat: async (channelId: string, text: string): Promise<void> => {
                    try {
                      if (isBotSlash(text)) {
                        const reply = await handleBotSlash(text, { root, lang, readOnlyDispatcher: actionDispatcher });
                        for (const part of chunkMessage(reply)) await send(channelId, part);
                        return;
                      }
                      // Streaming path: typing + a placeholder we edit in place as the
                      // reply accumulates. Requires the connector's optional streaming
                      // capabilities; otherwise fall back to send-final.
                      const streamCap = connector as unknown as {
                        sendChatAction?: (c: string, a: 'typing') => Promise<void>;
                        sendMessageReturningId?: (m: { connector: string; channelId: string; text: string }) => Promise<string | undefined>;
                        editMessage?: (c: string, id: string, t: string, pm?: 'HTML' | 'MarkdownV2') => Promise<void>;
                      };
                      const canStream =
                        typeof streamCap.sendChatAction === 'function' &&
                        typeof streamCap.sendMessageReturningId === 'function' &&
                        typeof streamCap.editMessage === 'function';

                      if (canStream) {
                        await streamCap.sendChatAction!(channelId, 'typing').catch(() => undefined);
                        const placeholder = getMessage('bot.chat_thinking', lang);
                        const msgId = await streamCap.sendMessageReturningId!({ connector: connector.id, channelId, text: placeholder });
                        const throttle = msgId
                          ? makeStreamThrottle({ edit: (t) => streamCap.editMessage!(channelId, msgId, t.slice(0, 4000)) })
                          : null;
                        const reply = await chatStreaming(channelId, text, (partial) => throttle?.push(partial));
                        const body = reply.trim() || getMessage('bot.chat_empty', lang);
                        if (msgId && throttle) {
                          // final: edit in place with the first part; extra parts (rare, >4000) sent as new messages
                          const parts = chunkMessage(body);
                          await streamCap.editMessage!(channelId, msgId, parts[0]!).catch(async () => { await send(channelId, parts[0]!); });
                          for (let i = 1; i < parts.length; i++) await send(channelId, parts[i]!);
                        } else {
                          for (const part of chunkMessage(body)) await send(channelId, part);
                        }
                        return;
                      }

                      // Non-streaming fallback (unchanged behavior).
                      await send(channelId, getMessage('bot.chat_thinking', lang));
                      const reply = await chat(channelId, text);
                      const body = reply.trim() || getMessage('bot.chat_empty', lang);
                      for (const part of chunkMessage(body)) await send(channelId, part);
                    } catch {
                      await send(channelId, getMessage('bot.chat_error', lang)).catch(() => undefined);
                    }
                  },
```

To get `chatStreaming` (a per-call streaming variant), the `chat` responder must expose partials. Since `ChatResponder` is `(sessionId, text) => Promise<string>` and `onPartial` is a deps-level callback keyed by sessionId, wire it at responder-construction in `bot.ts` (Task is cross-file — see note). For THIS task, add a thin local adapter: the `deps.chat` passed to `bootstrapConnectorCommands` stays the same; add an OPTIONAL `deps.onChatPartial?: (channelId, cb) => void` registration is over-engineered — instead, change `bot.ts` (next step) to build the responder with an `onPartial` that looks up a per-channel throttle from a `Map` the bootstrap exposes.

> **Simplel approach (use this):** Do NOT add `chatStreaming`. Instead: in `bootstrapConnectorCommands`, accept an optional `deps.registerPartial?: (fn: (channelId: string, partial: string) => void) => void`. The streaming branch creates the throttle, stores it in a `Map<channelId, StreamThrottle>`, and a module-level partial-dispatch calls `map.get(channelId)?.push(partial)`. `bot.ts` builds the responder with `onPartial: (sid, txt) => partialDispatch(sid, txt)` and passes `registerPartial`. Keep it minimal: the Map + a `setPartialSink(fn)` exported from bootstrap deps.

Given the cross-file coupling, implement it as: `bootstrapConnectorCommands` creates `const throttles = new Map<string, StreamThrottle>()`; exposes `deps.onPartial?` is set by the caller. **Concretely for this task:** add `onChatStreaming?: ChatStreamResponder` to `ConnectorCommandsDeps` where `ChatStreamResponder = (channelId: string, text: string, onPartial: (t: string) => void) => Promise<string>`. The streaming branch calls `deps.onChatStreaming` when present, else `deps.chat`. `bot.ts` (Task 5-prep) supplies `onChatStreaming` by building the responder with an `onPartial` that forwards to the per-call callback via a Map keyed by channelId.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run tests/connectors`
Expected: clean + GREEN (existing onChat tests still pass via the non-streaming fallback; new throttle test green).

- [ ] **Step 7: Commit**

```bash
git add src/connectors/stream-throttle.ts src/connectors/connector-bootstrap.ts tests/connectors/stream-throttle.test.ts
git commit -m "feat(bot): Faz-1 T4 — throttle util + onChat streaming wire (typing + edit-in-place)"
```

> **Implementer note:** Task 4's cross-file wiring is the subtle part. Keep the connector-bootstrap change ADDITIVE + feature-detected so all existing tests pass unchanged via the fallback. If the `onChatStreaming` deps approach proves awkward against the real code, prefer the smallest change that makes the streaming path work for Telegram while leaving the non-streaming path byte-identical — and record any deviation in the report.

---

## Task 5: bot.ts streaming responder wire + build + Smoke + ADR

**Files:**
- Modify: `src/cli/commands/bot.ts` (build the agentic responder with `onPartial` and pass `onChatStreaming`)
- Build + real-binary Smoke (user-coordinated) + ADR note.

- [ ] **Step 1: Wire the streaming responder in `bot.ts`**

Build a per-channel partial bridge: a `Map<string, (t: string) => void>` of in-flight partial sinks. Construct the responder with `onPartial: (sid, txt) => sinks.get(sid)?.(txt)`. Pass `onChatStreaming: (channelId, text, onPartial) => { sinks.set(channelId, onPartial); return responder(channelId, text).finally(() => sinks.delete(channelId)); }` to `bootstrapConnectorCommands`. Keep `chat: responder` for the fallback. (Adjust to the exact deps shape Task 4 introduced.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run tests/connectors tests/cli` → clean + GREEN.

- [ ] **Step 3: Whole-branch green check**

Run: `npx vitest run tests/connectors tests/cli && npx tsc --noEmit`.

- [ ] **Step 4: Build + Tier-1 Smoke (user-coordinated — needs `npm run build` + bot restart)**

After the user builds: the real win is observed live (notifications are instant/clean; the bot shows typing + edits one message as it answers). Document the manual check: send a message to the bot → observe typing indicator → one message that fills in (no "thinking" orphan) → no 4B-rephrased notifications. (A pure unit Smoke can't exercise the live Telegram edit; record the manual observation.)

- [ ] **Step 5: ADR note**

Append a memory note / ADR (proposed) "Bot Voice Determinism + Streaming" — notifications are deterministic (humanizer retired); chat replies stream via throttled editMessageText. Relates to ADR-016/ADR-091.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/bot.ts
git commit -m "feat(bot): Faz-1 T5 — wire streaming responder in bot listener"
```

---

## Self-Review

**Spec coverage:** humanizer retired + deleted (T1) · deterministic notifications (T1) · telegram streaming caps (T2) · chat-bridge onPartial (T3) · throttle + onChat streaming (T4) · bot.ts wire (T5). ✅

**Placeholder scan:** Task 4's cross-file wiring is described with a concrete `onChatStreaming` deps approach + an implementer note to keep it additive/feature-detected; not a placeholder but flagged as the subtle task.

**Type consistency:** `onPartial(sessionId, partialText)` (chat-bridge) ↔ `onChatStreaming(channelId, text, onPartial)` (bootstrap) ↔ per-channel sink Map (bot.ts). `editMessage(channelId, messageId, text, parseMode?)` consistent across telegram.ts (impl), types.ts (interface), throttle edit closure (T4).

## Out of scope (Faz-1b / later)

True token-by-token streaming beyond line-granularity · streaming for the gateway runtime path (G-series, gateway-ipc already partial-frame-ready) · Discord streaming (Telegram-only here; others feature-detect to fallback) · richer notification templates (content quality of the notification SOURCES).
