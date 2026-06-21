# Telegraf → grammY Swap (G2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Replace Telegraf with grammY as the Telegram transport (the user's "Telegraf'tan memnun değilim" grievance), preserving the FULL `IMessageConnector` contract + the streaming capabilities (sendChatAction/editMessage/sendMessageReturningId) + inline-button callbacks. Telegraf stays installed as a rollback until grammY is live-verified, then removed (G2a-T3).

**Architecture:** `telegram.ts` is the ONLY file touching telegraf — it already hides telegraf behind a minimal `TelegrafInstance` interface + a dynamic `loadTelegraf()`. The swap rewrites that one file: a minimal `GrammyBotInstance` interface + `loadGrammy()` (dynamic import of `grammy`), porting every method to grammY's `bot.api.*` surface and grammY's filter strings (`message:text`, `callback_query:data`). Callers (connector-bootstrap, gateway, notify-adapter) are untouched — the contract is identical. Unit tests inject a fake `Bot` constructor, so tsc + unit tests pass WITHOUT grammy installed; only the live real-binary Smoke needs the dependency.

**Tech Stack:** TypeScript ESM (Node16, `.js`), Node ≥24, vitest, **grammy** (NEW dep — user runs `npm install grammy` before the live Smoke). telegraf retained until rollback window closes.

> grammY API (verified via context7 `/grammyjs/website`): `new Bot(token)` · `bot.api.sendMessage(chatId, text, {reply_markup, parse_mode})` (returns Message w/ `message_id`) · `bot.api.editMessageText(chatId, messageId, text, {parse_mode})` (NO `undefined` positional, unlike telegraf) · `bot.api.sendChatAction(chatId, action)` · `bot.on('message:text', ctx => …)` (`ctx.message.text/message_id/date`, `ctx.from.id`, `ctx.chat.id`) · `bot.on('callback_query:data', ctx => …)` (`ctx.callbackQuery.data`, `ctx.answerCallbackQuery()`) · `bot.start({drop_pending_updates:true})` (long-poll, resolves on stop — fire-and-forget like telegraf launch) · `await bot.stop()` (async).

## Global Constraints

- ESM imports MUST use `.js` extension. grammy imported DYNAMICALLY (string-based) so tsc/unit-tests don't require it installed (mirror the existing `loadTelegraf` pattern).
- The `IMessageConnector` contract is IDENTICAL — NO caller changes (connector-bootstrap, gateway-daemon, notify-adapter untouched). Same method names/signatures/behavior: `start`/`startOutbound`/`stop`/`sendMessage`/`sendMessageReturningId`/`sendChatAction`/`editMessage`/`onMessage`/`onCallback`/`isHealthy`.
- Preserve exact behaviors: `drop_pending_updates:true` on poll start; fire-and-forget poll launch (never block startup, `.catch` swallow); `startOutbound` = no poll; callback ACK (`answerCallbackQuery`) best-effort; `sendMessage` no-extras → 2-arg call; `editMessage` Number(messageId) coercion; per-method `if (!this.bot) throw`.
- i18n: the only user-facing string is the "package not installed" error — update it to grammy.
- Hermetic tests: inject a fake `Bot` constructor (no network, no real grammy). Gate: `npx tsc --noEmit` clean + `npx vitest run tests/connectors` GREEN — these MUST pass WITHOUT grammy installed (fake injection + minimal interface). The real-binary Smoke (G2a-T2) needs grammy.
- Commits on `feat/grammy-swap`; stage only each task's files.

---

## Task 1: Rewrite telegram.ts on grammY (contract-preserving)

**Files:**
- Rewrite: `src/connectors/telegram.ts`
- Modify: `tests/connectors/telegram.test.ts` + `tests/connectors/telegram-streaming.test.ts` (fake grammY `Bot` instead of fake Telegraf)

**Interfaces (produced — identical public contract):** `TelegramConnector` with the SAME methods. The constructor test-seam changes from `TelegrafConstructor` to a grammY `Bot` constructor: `constructor(private readonly BotClass?: GrammyBotConstructor)`.

- [ ] **Step 1: Update/inspect the two existing tests' fakes**

The current tests inject a fake Telegraf (`{ on, launch, stop, telegram: { sendMessage, editMessageText, sendChatAction } }`). Read `tests/connectors/telegram.test.ts` + `tests/connectors/telegram-streaming.test.ts` and rewrite the fake to the grammY shape:
```typescript
function fakeGrammyBot() {
  const calls: { method: string; args: unknown[] }[] = [];
  const handlers: Record<string, (ctx: unknown) => void> = {};
  class FakeBot {
    constructor(public token: string) {}
    on(filter: string, h: (ctx: unknown) => void) { handlers[filter] = h; }
    async start() { /* long-poll no-op in tests */ }
    async stop() { calls.push({ method: 'stop', args: [] }); }
    api = {
      sendMessage: async (...a: unknown[]) => { calls.push({ method: 'sendMessage', args: a }); return { message_id: 4242 }; },
      editMessageText: async (...a: unknown[]) => { calls.push({ method: 'editMessageText', args: a }); return true; },
      sendChatAction: async (...a: unknown[]) => { calls.push({ method: 'sendChatAction', args: a }); return true; },
    };
  }
  return { FakeBot: FakeBot as unknown as new (t: string) => unknown, calls, handlers };
}
```
Update the existing assertions to the grammY API:
- `bot.telegram.sendMessage(chatId, text, extra)` → `bot.api.sendMessage(chatId, text, extra)` — same arg order; assertions on `args[0]/[1]/[2]` hold.
- `editMessageText(chatId, msgId, undefined, text, extra)` → `editMessageText(chatId, msgId, text, extra)` — the streaming test MUST update: `edit.args[1] === 4242` (messageId), `edit.args[2] === 'edited'` (text, was args[3]).
- Inbound-message tests: instead of `bot.on('text', ctx)` with `ctx.message`, use `handlers['message:text']({ message: { message_id, text, date }, from: { id }, chat: { id } })`.
- Callback tests: `handlers['callback_query:data']({ callbackQuery: { data }, from: { id }, chat: { id }, answerCallbackQuery: async () => {} })`.

- [ ] **Step 2: Run the tests → they FAIL (telegram.ts still on telegraf)**

Run: `npx vitest run tests/connectors/telegram.test.ts tests/connectors/telegram-streaming.test.ts`
Expected: FAIL (fakes now grammY-shaped, impl still telegraf-shaped).

- [ ] **Step 3: Rewrite `src/connectors/telegram.ts` on grammY**

```typescript
/**
 * Telegram bot connector using grammY (replaces Telegraf — G2a).
 *
 * Implements IMessageConnector via BaseConnector for the Telegram Bot API.
 * Token comes from .deck interpolation ($DECK:TELEGRAM_TOKEN). grammY is loaded
 * dynamically so tsc/unit-tests don't require it installed (tests inject a fake Bot).
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, OutgoingMessage, IncomingCallback } from './types.js';

/** grammY sendMessage/editMessageText `other` (inline buttons + parse mode). */
interface SendExtra {
  reply_markup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
  parse_mode?: 'HTML' | 'MarkdownV2';
}

/** Minimal grammY Bot surface we rely on (avoids an import-time hard dependency). */
interface GrammyBotInstance {
  on(filter: 'message:text', handler: (ctx: GrammyTextContext) => void): void;
  on(filter: 'callback_query:data', handler: (ctx: GrammyCallbackContext) => void): void;
  start(opts?: { drop_pending_updates?: boolean }): Promise<void>;
  stop(): Promise<void>;
  api: {
    sendMessage(chatId: string | number, text: string, other?: SendExtra): Promise<{ message_id: number } | unknown>;
    editMessageText(chatId: string | number, messageId: number, text: string, other?: SendExtra): Promise<unknown>;
    sendChatAction(chatId: string | number, action: string): Promise<unknown>;
  };
}

interface GrammyBotConstructor { new (token: string): GrammyBotInstance }

interface GrammyTextContext {
  message: { message_id: number; text: string; date: number };
  from: { id: number };
  chat: { id: number };
}

/** grammY context for an inline-button press (callback_query:data update). */
interface GrammyCallbackContext {
  callbackQuery: { id?: string; data?: string };
  from: { id: number };
  chat?: { id: number };
  /** ACK the press so Telegram clears the button's loading spinner. */
  answerCallbackQuery?: () => Promise<unknown>;
}

export class TelegramConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Telegram';

  private bot?: GrammyBotInstance;
  private callbackHandler?: (cb: IncomingCallback) => void;

  /** Allow injecting a grammY Bot constructor for testing. */
  constructor(private readonly BotClass?: GrammyBotConstructor) {
    super();
  }

  /** Register a handler for inline-button presses (set before start()). */
  onCallback(handler: (cb: IncomingCallback) => void): void {
    this.callbackHandler = handler;
  }

  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) { await super.start(config); return; }

    const BotCtor = this.BotClass ?? await this.loadGrammy();
    this.bot = new BotCtor(config.token);

    this.bot.on('message:text', (ctx: GrammyTextContext) => {
      this.emitMessage({
        id: String(ctx.message.message_id),
        connector: 'telegram',
        fromUser: String(ctx.from.id),
        channelId: String(ctx.chat.id),
        text: ctx.message.text,
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        raw: ctx.message,
      });
    });

    this.bot.on('callback_query:data', (ctx: GrammyCallbackContext) => {
      const data = ctx.callbackQuery?.data;
      if (data && this.callbackHandler) {
        this.callbackHandler({
          connector: 'telegram',
          channelId: String(ctx.chat?.id ?? ''),
          fromUser: String(ctx.from.id),
          data,
        });
      }
      void ctx.answerCallbackQuery?.().catch(() => {});
    });

    // grammY start() in long-polling mode resolves only on stop() — awaiting it
    // would hang startup. Fire it and return; drop_pending_updates discards the
    // offline backlog (defense in depth atop the router's acceptFrom guard).
    void this.bot.start({ drop_pending_updates: true }).catch(() => {
      // Poll failure must not crash the host (BOT-002 inbound is best-effort).
    });
    await super.start(config);
  }

  /** Outbound-only init (BOT-001): create the Bot for sending, do NOT start the poll. */
  async startOutbound(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) { await super.start(config); return; }
    const BotCtor = this.BotClass ?? await this.loadGrammy();
    this.bot = new BotCtor(config.token);
    await super.start(config);
  }

  async stop(): Promise<void> {
    if (this.bot) {
      await this.bot.stop().catch(() => {}); // grammY stop() is async; best-effort
      this.bot = undefined;
    }
    await super.stop();
  }

  private buildExtra(msg: Pick<OutgoingMessage, 'buttons' | 'parseMode'>): SendExtra {
    const extra: SendExtra = {};
    if (msg.buttons && msg.buttons.length > 0) {
      extra.reply_markup = {
        inline_keyboard: msg.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.callbackData }))),
      };
    }
    if (msg.parseMode) extra.parse_mode = msg.parseMode;
    return extra;
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    const extra = this.buildExtra(msg);
    if (extra.reply_markup || extra.parse_mode) {
      await this.bot.api.sendMessage(msg.channelId, msg.text, extra);
      return;
    }
    await this.bot.api.sendMessage(msg.channelId, msg.text);
  }

  async sendChatAction(channelId: string, action: 'typing'): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    await this.bot.api.sendChatAction(channelId, action);
  }

  async sendMessageReturningId(msg: OutgoingMessage): Promise<string | undefined> {
    if (!this.bot) throw new Error('Telegram connector not started');
    const sent = (await this.bot.api.sendMessage(msg.channelId, msg.text, this.buildExtra(msg))) as { message_id?: number };
    return sent && typeof sent.message_id === 'number' ? String(sent.message_id) : undefined;
  }

  async editMessage(channelId: string, messageId: string, text: string, parseMode?: 'HTML' | 'MarkdownV2'): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    const extra: SendExtra = {};
    if (parseMode) extra.parse_mode = parseMode;
    // grammY: editMessageText(chat_id, message_id, text, other?) — NO undefined positional.
    await this.bot.api.editMessageText(channelId, Number(messageId), text, extra);
  }

  isHealthy(): boolean {
    return this.bot !== undefined && this.started;
  }

  /** Dynamic import of grammy — only loaded when actually starting (not in unit tests). */
  private async loadGrammy(): Promise<GrammyBotConstructor> {
    try {
      const moduleName = 'grammy';
      const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ Bot: unknown }>);
      return mod.Bot as unknown as GrammyBotConstructor;
    } catch {
      throw new Error('grammy package not installed. Run: npm install grammy');
    }
  }
}
```

> **Refactor note:** I extracted `buildExtra` (used by sendMessage + sendMessageReturningId — it was duplicated in the telegraf version). That is the only structural improvement; behavior is byte-identical.

- [ ] **Step 4: Run the tests → PASS**

Run: `npx vitest run tests/connectors/telegram.test.ts tests/connectors/telegram-streaming.test.ts && npx tsc --noEmit`
Expected: PASS + clean. (No grammy install needed — fake Bot injected.)
Also run `npx vitest run tests/connectors` → whole connector suite GREEN (callers unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/telegram.ts tests/connectors/telegram.test.ts tests/connectors/telegram-streaming.test.ts
git commit -m "feat(bot): G2a T1 — rewrite TelegramConnector on grammY (contract-preserving)"
```

---

## Task 2: Add grammy dep + real-binary Smoke (USER-COORDINATED install)

**Files:** `package.json` (add grammy)

- [ ] **Step 1: Add grammy to package.json**

Add `"grammy": "^1.30.0"` to `dependencies` (next to `telegraf` — keep telegraf for rollback). Do NOT remove telegraf yet.

- [ ] **Step 2: Install (USER-COORDINATED — needs `npm install`)**

The user runs `npm install grammy` (build-adjacent; coordinate around the active sprint). After install, the symlinked worktree node_modules has grammy.

- [ ] **Step 3: Real-binary Smoke (after install + build)**

After `npm run build`: the live bot now runs on grammY. Restart the bot and verify from a phone: inbound text reaches the agentic chat; an inline approve/reject button press is ACK'd + routed; a notification renders (buttons + HTML). Record the manual observation. (A pure unit Smoke can't exercise the live Telegram round-trip; the fake-Bot unit tests cover the wiring, the live check covers grammY itself.)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat(bot): G2a T2 — add grammy dependency (telegraf retained for rollback)"
```

---

## Task 3: Remove telegraf (AFTER grammY live-verified — rollback window closed)

> Do this ONLY after the user confirms the grammY bot works live. Until then telegraf stays as a one-config-flip rollback.

- [ ] **Step 1:** Remove `"telegraf": "^4.16.0"` from package.json dependencies.
- [ ] **Step 2:** `grep -rn "telegraf\|Telegraf" src tests` → confirm ZERO references (telegram.ts is fully grammY; the only remaining mention should be none).
- [ ] **Step 3:** `npm install` (regenerate lockfile without telegraf — user-coordinated) + `npx tsc --noEmit` + `npx vitest run tests/connectors` GREEN.
- [ ] **Step 4:** Commit `chore(bot): G2a T3 — remove telegraf (grammY live-verified)`.

---

## Self-Review

**Spec coverage:** grammY rewrite preserving the full contract (T1) · streaming caps ported (T1: editMessageText 4-arg, sendChatAction, sendMessageReturningId) · callbacks ported (`callback_query:data` + answerCallbackQuery) · poll fire-and-forget + drop_pending_updates (T1) · dep add (T2) · telegraf removal after verify (T3). ✅

**Placeholder scan:** none. The live Smoke (T2-S3) is honestly marked as the manual post-build check (the swap's live correctness needs real grammy + a phone — unit tests use the fake Bot).

**Type consistency:** `GrammyBotInstance` (minimal interface) used identically in impl + the fake. `editMessageText(chatId, messageId, text, extra)` 4-arg (vs telegraf's 5-arg) reflected in BOTH the impl AND the streaming test assertion update.

## Out of scope (G2b/G2c)

Webhook transport mode (grammY `webhookCallback` + an HTTP receiver) = **G2b**. Discord parity (streaming caps on the discord.js connector) = **G2c**. The grammY **Stream plugin** (native long-text streaming / message-splitting) is a Faz-1b candidate to supersede the custom `stream-throttle` — out of G2a scope.
