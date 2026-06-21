/**
 * Discord bot connector — discord.js Client wrapper.
 *
 * Users provide their own Discord bot token via `.deck` file ($DECK:DISCORD_TOKEN).
 * The connector listens for messages via GatewayIntentBits and relays them
 * through the BaseConnector handler chain.
 */

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { BaseConnector } from './base-connector.js';
import type { ConnectorConfig, IncomingMessage, OutgoingMessage } from './types.js';

export class DiscordConnector extends BaseConnector {
  readonly id = 'discord' as const;
  readonly name = 'Discord';

  private client?: Client;

  async start(config: ConnectorConfig): Promise<void> {
    if (!config.enabled) {
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.client.on(Events.MessageCreate, (msg) => {
      if (msg.author.bot) return;

      const incoming: IncomingMessage = {
        id: msg.id,
        connector: 'discord',
        fromUser: msg.author.id,
        channelId: msg.channelId,
        text: msg.content,
        timestamp: new Date(msg.createdTimestamp).toISOString(),
        raw: msg,
      };
      this.emitMessage(incoming);
    });

    await this.client.login(config.token);
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
      this.client = undefined;
    }
    await super.stop();
  }

  async sendMessage(msg: OutgoingMessage): Promise<void> {
    if (!this.client) {
      throw new Error('Discord connector not started');
    }

    const channel = await this.client.channels.fetch(msg.channelId);
    // Unresolvable / non-text / non-sendable channel was silently dropped here —
    // the caller awaited void and assumed delivery. Surface it (parity with the
    // not-started throw above) so a misconfigured channel id is never invisible.
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      throw new Error(`Discord channel ${msg.channelId} is not a sendable text channel`);
    }
    await (channel as unknown as { send(text: string): Promise<unknown> }).send(msg.text);
  }

  isHealthy(): boolean {
    return this.client?.ws.status === 0;
  }
}
