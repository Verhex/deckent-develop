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
  on(filter: 'message:photo', handler: (ctx: GrammyPhotoContext) => void): void;
  on(filter: 'message:document', handler: (ctx: GrammyDocumentContext) => void): void;
  on(filter: 'message:voice', handler: (ctx: GrammyVoiceContext) => void): void;
  on(filter: 'callback_query:data', handler: (ctx: GrammyCallbackContext) => void): void;
  start(opts?: { drop_pending_updates?: boolean }): Promise<void>;
  stop(): Promise<void>;
  api: {
    sendMessage(chatId: string | number, text: string, other?: SendExtra): Promise<{ message_id: number } | unknown>;
    editMessageText(chatId: string | number, messageId: number, text: string, other?: SendExtra): Promise<unknown>;
    sendChatAction(chatId: string | number, action: string): Promise<unknown>;
    sendPhoto(chatId: string | number, photo: unknown, other?: { caption?: string }): Promise<unknown>;
    sendDocument(chatId: string | number, doc: unknown, other?: { caption?: string }): Promise<unknown>;
    sendVoice(chatId: string | number, voice: unknown): Promise<unknown>;
    getFile(fileId: string): Promise<{ file_id: string; file_path?: string; file_size?: number }>;
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

/** grammY context for a photo message (message:photo update). */
interface GrammyPhotoContext {
  /** photo is an array of PhotoSize objects; last entry is the largest. */
  message: {
    message_id: number;
    date: number;
    photo: ReadonlyArray<{ file_id: string; file_size?: number; width: number; height: number }>;
    caption?: string;
  };
  from: { id: number };
  chat: { id: number };
}

/** grammY context for a document message (message:document update). */
interface GrammyDocumentContext {
  message: {
    message_id: number;
    date: number;
    document: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    caption?: string;
  };
  from: { id: number };
  chat: { id: number };
}

/** grammY context for a voice message (message:voice update). */
interface GrammyVoiceContext {
  message: {
    message_id: number;
    date: number;
    voice: { file_id: string; mime_type?: string; duration?: number; file_size?: number };
  };
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

/** Map file extension to MIME type for inbound file downloads. */
const EXT_TO_MIME: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
};

export class TelegramConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Telegram';

  private bot?: GrammyBotInstance;
  private callbackHandler?: (cb: IncomingCallback) => void;
  private InputFileCtor?: InputFileCtor;
  /** Bot token stored at start() time — required to build Telegram file download URLs. */
  private botToken?: string;

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

    this.botToken = config.token;
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

    // Inbound photo — use the LARGEST size's file_id (last element per Telegram API).
    this.bot.on('message:photo', (ctx: GrammyPhotoContext) => {
      const sizes = ctx.message.photo;
      const largest = sizes[sizes.length - 1];
      if (!largest) return;
      this.emitMessage({
        id: String(ctx.message.message_id),
        connector: 'telegram',
        fromUser: String(ctx.from.id),
        channelId: String(ctx.chat.id),
        text: ctx.message.caption ?? '',
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        raw: {
          ...ctx.message,
          media: { fileId: largest.file_id, filename: 'photo.jpg', mime: 'image/jpeg' },
        },
      });
    });

    // Inbound document — carry file_id, file_name, mime_type.
    this.bot.on('message:document', (ctx: GrammyDocumentContext) => {
      const doc = ctx.message.document;
      this.emitMessage({
        id: String(ctx.message.message_id),
        connector: 'telegram',
        fromUser: String(ctx.from.id),
        channelId: String(ctx.chat.id),
        text: ctx.message.caption ?? '',
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        raw: {
          ...ctx.message,
          media: {
            fileId: doc.file_id,
            filename: doc.file_name ?? 'document',
            mime: doc.mime_type ?? 'application/octet-stream',
          },
        },
      });
    });

    // Inbound voice message — carry file_id and mime type (default audio/ogg per Telegram spec).
    this.bot.on('message:voice', (ctx: GrammyVoiceContext) => {
      const voice = ctx.message.voice;
      this.emitMessage({
        id: String(ctx.message.message_id),
        connector: 'telegram',
        fromUser: String(ctx.from.id),
        channelId: String(ctx.chat.id),
        text: '',
        timestamp: new Date(ctx.message.date * 1000).toISOString(),
        raw: {
          ...ctx.message,
          voice: { fileId: voice.file_id, mime: voice.mime_type ?? 'audio/ogg' },
        },
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
    this.botToken = config.token;
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
    // InputFile may be unset if a Bot was injected without an InputFile ctor and startOutbound() skipped loadGrammy(); load it now. (In production, loadGrammy already set it.)
    if (!this.InputFileCtor) await this.loadGrammy();
    const file = new (this.InputFileCtor as InputFileCtor)(Buffer.from(media.data), media.filename);
    const extra = media.caption ? { caption: media.caption } : undefined;
    if (media.kind === 'photo') await this.bot.api.sendPhoto(channelId, file, extra);
    else await this.bot.api.sendDocument(channelId, file, extra);
  }

  async sendVoice(channelId: string, audio: { data: Buffer; mime: string }): Promise<void> {
    if (!this.bot) throw new Error('Telegram connector not started');
    if (!this.InputFileCtor) await this.loadGrammy();
    const file = new (this.InputFileCtor as InputFileCtor)(audio.data);
    await this.bot.api.sendVoice(channelId, file);
  }

  /**
   * Fetch a platform file by fileId and return its raw buffer + mime + filename.
   *
   * Calls bot.api.getFile(fileId) to retrieve the file_path, then constructs
   * the Telegram download URL: `https://api.telegram.org/file/bot<token>/<file_path>`
   * and fetches it. MIME is derived from the file extension in file_path; falls back
   * to `application/octet-stream` for unknown extensions.
   */
  async getFileBuffer(fileId: string): Promise<{ data: Buffer; mime: string; filename?: string }> {
    if (!this.bot) throw new Error('Telegram connector not started');
    if (!this.botToken) throw new Error('Telegram connector not started');

    const fileInfo = await this.bot.api.getFile(fileId);
    if (!fileInfo.file_path) throw new Error(`Telegram getFile returned no file_path for fileId: ${fileId}`);
    const filePath = fileInfo.file_path;
    const url = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const data = Buffer.from(arrayBuf);

    // Derive mime and filename from the file_path (last path component)
    const basename = filePath.split('/').pop() ?? filePath;
    const ext = basename.split('.').pop()?.toLowerCase() ?? '';
    const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';

    return { data, mime, filename: basename || undefined };
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
