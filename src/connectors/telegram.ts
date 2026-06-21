/**
 * Telegram bot connector using Telegraf.
 *
 * Implements IMessageConnector via BaseConnector for Telegram Bot API.
 * Token comes from .deck interpolation ($DECK:TELEGRAM_TOKEN).
 *
 * Usage:
 *   const tg = new TelegramConnector();
 *   tg.onMessage((msg) => console.log(msg.text));
 *   await tg.start({ enabled: true, token: 'bot123:ABC...' });
 */

import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, OutgoingMessage, IncomingCallback } from './types.js';

/** Telegram sendMessage `extra` (rich-approval buttons + rich-text mode). */
interface SendExtra {
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
  };
  parse_mode?: 'HTML' | 'MarkdownV2';
}

/** Minimal Telegraf type surface we rely on (avoids hard import-time dependency) */
interface TelegrafInstance {
  on(event: 'text', handler: (ctx: TelegramTextContext) => void): void;
  on(event: 'callback_query', handler: (ctx: TelegramCallbackContext) => void): void;
  launch(opts?: { dropPendingUpdates?: boolean }): Promise<void>;
  stop(): void;
  telegram: {
    sendMessage(chatId: string | number, text: string, extra?: SendExtra): Promise<{ message_id: number } | unknown>;
    editMessageText(chatId: string | number, messageId: number, inlineMessageId: undefined, text: string, extra?: SendExtra): Promise<unknown>;
    sendChatAction(chatId: string | number, action: string): Promise<unknown>;
  };
}

interface TelegrafConstructor {
  new (token: string): TelegrafInstance;
}

interface TelegramTextContext {
  message: {
    message_id: number;
    text: string;
    date: number;
  };
  from: {
    id: number;
  };
  chat: {
    id: number;
  };
}

/** Telegraf context for an inline-button press (callback_query update). */
interface TelegramCallbackContext {
  callbackQuery: { id?: string; data?: string };
  from: { id: number };
  chat?: { id: number };
  /** Acknowledge the press so Telegram stops the button's loading spinner. */
  answerCbQuery?: () => Promise<unknown>;
}

export class TelegramConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Telegram';

  private bot?: TelegrafInstance;
  private callbackHandler?: (cb: IncomingCallback) => void;

  /** Allow injecting a Telegraf constructor for testing */
  constructor(private readonly TelegrafClass?: TelegrafConstructor) {
    super();
  }

  /**
   * Register a handler for inline-button presses (rich-approval bot). The bot
   * daemon routes these to the approval gate (NOT the LLM) — a press is a
   * machine decision. Set before start() so the callback_query handler can
   * forward presses.
   */
  onCallback(handler: (cb: IncomingCallback) => void): void {
    this.callbackHandler = handler;
  }

  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) {
      await super.start(config);
      return;
    }

    const TelegrafCtor = this.TelegrafClass ?? await this.loadTelegraf();
    this.bot = new TelegrafCtor(config.token);

    this.bot.on('text', (ctx: TelegramTextContext) => {
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

    // Rich-approval bot: an inline-button press arrives as a callback_query.
    // Forward its callback_data to the registered handler (the bot daemon routes
    // it to the approval gate — never to the LLM) and ACK so the button's spinner
    // clears. Best-effort: a missing handler or ACK failure never crashes the host.
    this.bot.on('callback_query', (ctx: TelegramCallbackContext) => {
      const data = ctx.callbackQuery?.data;
      if (data && this.callbackHandler) {
        this.callbackHandler({
          connector: 'telegram',
          channelId: String(ctx.chat?.id ?? ''),
          fromUser: String(ctx.from.id),
          data,
        });
      }
      void ctx.answerCbQuery?.().catch(() => {});
    });

    // Telegraf v4 launch() in long-polling mode does not resolve until stop() —
    // awaiting it would hang startup. Fire it and return; polling runs in the
    // background and the registered 'text' handler receives inbound messages.
    // dropPendingUpdates discards the backlog buffered while we were offline so a
    // stale "approve <id>" can't replay on reconnect (defense in depth atop the
    // router's acceptFrom guard + parked-action TTL).
    void this.bot.launch({ dropPendingUpdates: true }).catch(() => {
      // Launch/poll failure must not crash the host (BOT-002 inbound is best-effort).
    });
    await super.start(config);
  }

  /**
   * Outbound-only init (BOT-001): create the Telegraf instance for sending but
   * do NOT call launch(). In long-polling mode Telegraf's launch() does not
   * resolve until stop(), which would hang an awaited startup — and the inbound
   * poller is BOT-002's concern. sendMessage() works without launch().
   */
  async startOutbound(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) {
      await super.start(config);
      return;
    }
    const TelegrafCtor = this.TelegrafClass ?? await this.loadTelegraf();
    this.bot = new TelegrafCtor(config.token);
    // No launch() — outbound only.
    await super.start(config);
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = undefined;
    }
    await super.stop();
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram connector not started');
    }
    // Rich-approval bot: attach inline buttons (approve/reject) and/or a rich-text
    // parse_mode when present. No extras → plain 2-arg call, byte-identical to the
    // pre-button behaviour (keeps the legacy send path untouched).
    const extra: SendExtra = {};
    if (msg.buttons && msg.buttons.length > 0) {
      extra.reply_markup = {
        inline_keyboard: msg.buttons.map((row) =>
          row.map((b) => ({ text: b.text, callback_data: b.callbackData })),
        ),
      };
    }
    if (msg.parseMode) extra.parse_mode = msg.parseMode;
    if (extra.reply_markup || extra.parse_mode) {
      await this.bot.telegram.sendMessage(msg.channelId, msg.text, extra);
      return;
    }
    await this.bot.telegram.sendMessage(msg.channelId, msg.text);
  }

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

  isHealthy(): boolean {
    return this.bot !== undefined && this.started;
  }

  /** Dynamic import of telegraf — only loaded when actually starting */
  private async loadTelegraf(): Promise<TelegrafConstructor> {
    try {
      // Dynamic string-based import avoids tsc error when telegraf is not installed
      const moduleName = 'telegraf';
      const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ Telegraf: unknown }>);
      return mod.Telegraf as unknown as TelegrafConstructor;
    } catch {
      throw new Error(
        'telegraf package not installed. Run: npm install telegraf'
      );
    }
  }
}
