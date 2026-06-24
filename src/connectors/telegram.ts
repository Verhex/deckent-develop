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
    sendPhoto(chatId: string | number, photo: unknown, other?: { caption?: string }): Promise<unknown>;
    sendDocument(chatId: string | number, doc: unknown, other?: { caption?: string }): Promise<unknown>;
  };
}

/** InputFile constructor — injected in tests; loaded from grammy in production. */
interface InputFileCtor { new (data: Buffer, filename?: string): unknown }

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
  private InputFileCtor?: InputFileCtor;

  /** Allow injecting a grammY Bot constructor and InputFile constructor for testing. */
  constructor(private readonly BotClass?: GrammyBotConstructor, InputFileCtorArg?: InputFileCtor) {
    super();
    this.InputFileCtor = InputFileCtorArg;
  }

  /**
   * Register a handler for inline-button presses (rich-approval bot). The bot
   * daemon routes these to the approval gate (NOT the LLM) — a press is a
   * machine decision. Set before start() so the callback_query:data handler can
   * forward presses.
   */
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

    // Rich-approval bot: an inline-button press arrives as a callback_query:data.
    // Forward its callback_data to the registered handler (the bot daemon routes
    // it to the approval gate — never to the LLM) and ACK so the button's spinner
    // clears. Best-effort: a missing handler or ACK failure never crashes the host.
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

  /**
   * Outbound-only init (BOT-001): create the Bot for sending, do NOT start the poll.
   * In long-polling mode grammY's start() does not resolve until stop(), which would
   * hang an awaited startup — and the inbound poller is BOT-002's concern.
   * sendMessage() works without start().
   */
  async startOutbound(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) { await super.start(config); return; }
    const BotCtor = this.BotClass ?? await this.loadGrammy();
    this.bot = new BotCtor(config.token);
    // No start() — outbound only.
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
    // Rich-approval bot: attach inline buttons (approve/reject) and/or a rich-text
    // parse_mode when present. No extras → plain 2-arg call, byte-identical to the
    // pre-button behaviour (keeps the legacy send path untouched).
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

  async sendMedia(channelId: string, media: import('./types.js').MediaAttachment): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    if (!this.InputFileCtor) await this.loadGrammy(); // ensure InputFile available (outbound path may skip start)
    const file = new (this.InputFileCtor as InputFileCtor)(Buffer.from(media.data), media.filename);
    const extra = media.caption ? { caption: media.caption } : undefined;
    if (media.kind === 'photo') await this.bot.api.sendPhoto(channelId, file, extra);
    else await this.bot.api.sendDocument(channelId, file, extra);
  }

  isHealthy(): boolean {
    return this.bot !== undefined && this.started;
  }

  /** Dynamic import of grammy — only loaded when actually starting (not in unit tests). */
  private async loadGrammy(): Promise<GrammyBotConstructor> {
    try {
      const moduleName = 'grammy';
      const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ Bot: unknown; InputFile: unknown }>);
      this.InputFileCtor = this.InputFileCtor ?? (mod.InputFile as InputFileCtor);
      return mod.Bot as unknown as GrammyBotConstructor;
    } catch {
      throw new Error('grammy package not installed. Run: npm install grammy');
    }
  }
}
