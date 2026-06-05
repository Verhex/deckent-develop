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
import type { ConnectorConfig, OutgoingMessage } from './types.js';

/** Minimal Telegraf type surface we rely on (avoids hard import-time dependency) */
interface TelegrafInstance {
  on(event: string, handler: (ctx: TelegramTextContext) => void): void;
  launch(opts?: { dropPendingUpdates?: boolean }): Promise<void>;
  stop(): void;
  telegram: {
    sendMessage(chatId: string | number, text: string): Promise<unknown>;
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

export class TelegramConnector extends BaseConnector {
  readonly id = 'telegram' as const;
  readonly name = 'Telegram';

  private bot?: TelegrafInstance;

  /** Allow injecting a Telegraf constructor for testing */
  constructor(private readonly TelegrafClass?: TelegrafConstructor) {
    super();
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
    await this.bot.telegram.sendMessage(msg.channelId, msg.text);
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
