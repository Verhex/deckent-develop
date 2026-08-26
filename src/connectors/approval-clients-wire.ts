// ─── attachConfiguredApprovalChannels — config-driven channel registration ─
// (CLIENTS-RELAY-WIRE, task 362-007). Finishes 361-010's Slack/Teams adapters
// (approval-slack.ts / approval-teams.ts) with the same config-gated
// registration `notify_connectors` already established (connector-bootstrap.ts
// `buildConnectorTargets`/`bootstrapConnectorCommands`, BOT-001): an `enabled`
// flag (default-off), a `$DECK:`-resolved secret, unresolved/missing secret ->
// skip + log (id only — the value is NEVER logged or forwarded), one
// misconfigured channel never blocks the other.
//
// This module owns ZERO ApprovalRelay or approval-channel adapter internals
// internals — it only constructs the adapters from their PUBLIC options shape
// and calls `relay.attachChannel(name, channel)`. Building a REAL Slack/Teams
// transport from the resolved token (a live SDK client / Bot Framework
// adapter) is explicit follow-up (bot-daemon bootstrap), same boundary the
// adapters' own header comments already draw for Telegram — this module only
// decides WHETHER an already-built transport gets attached, never how one is
// built.

import { ApprovalSlackChannel, type SlackApprovalTransport } from './approval-slack.js';
import { ApprovalTeamsChannel, type TeamsApprovalTransport } from './approval-teams.js';
import { ApprovalTelegramChannel, type TelegramApprovalTransport } from './approval-telegram.js';
import { join } from 'node:path';
import { getMessage } from '../cli/helpers/messages.js';
import { ApprovalNotifyDedup } from '../core/approval-notify-dedup.js';
import type {
  ApprovalRelay,
  ChannelDecisionInput,
  RelayChannel,
  RelayLifecycleNotification,
  RelayNotification,
} from '../core/approval-relay.js';

/**
 * One `approval_channels.<name>` entry. `config-types.ts` (`DeckentConfig`) is
 * out of this task's write scope — this describes the raw JSON shape a config
 * author writes, the same precedent `ApprovalConfig.api_decide`'s doc comment
 * already sets (an untyped raw-config field, resolved by its own caller).
 */
export interface ApprovalChannelEntryConfig {
  /** Activate this channel. Default: false (absent/false = fully off). */
  enabled?: boolean;
  /** Bot token or incoming-webhook URL — author as `"$DECK:NAME"`, resolved
   *  from `.deck` at config load (deck-interpolation.ts). This module never
   *  logs or forwards the resolved value — only its presence/resolution state. */
  token?: string;
  /** Target channel/conversation id every approval card is sent to. */
  channel_id?: string;
  /** UI language for the two fixed labels (header, buttons). Default 'en'. */
  lang?: string;
}

export interface ApprovalChannelsConfig {
  slack?: ApprovalChannelEntryConfig;
  teams?: ApprovalChannelEntryConfig;
  telegram?: {
    enabled?: boolean;
    chat_id?: string;
    lang?: string;
  };
}

/** Minimal config shape this module reads — a duck-typed slice of
 *  `DeckentConfig`/`ResolvedConfig`, not the type itself (see doc comment above). */
export interface ApprovalClientsWireConfig {
  approval_channels?: ApprovalChannelsConfig;
}

/** Already-built transports (real SDK client or a test fake) — this module
 *  never constructs one itself. Absent entry = that channel cannot be attached
 *  even if `enabled` is true (logged + skipped, never a throw). */
export interface ApprovalClientsWireTransports {
  slack?: SlackApprovalTransport;
  teams?: TeamsApprovalTransport;
  telegram?: TelegramApprovalTransport;
}

export interface ApprovalLifecycleClientAckStore {
  wasNotified(eventId: string): boolean;
  markNotified(eventId: string): void;
}

export interface ApprovalClientsWireOptions {
  /**
   * Durable parent directory for per-channel lifecycle ACK sets. One store per
   * channel prevents a Slack ACK from suppressing Telegram/Teams delivery.
   */
  lifecycleAckRoot?: string;
  /** Injection seam for a stronger/external durable ACK implementation. */
  lifecycleAcks?: Partial<Record<'slack' | 'teams' | 'telegram', ApprovalLifecycleClientAckStore>>;
}

function lifecycleFormatter(lang = 'en'): (notification: RelayLifecycleNotification) => string {
  return (notification) => getMessage(`approval.lifecycle.stage.${notification.evidence.stage}`, lang);
}

class LifecycleAckChannel implements RelayChannel {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly channel: RelayChannel,
    private readonly ack: ApprovalLifecycleClientAckStore,
  ) {}

  send(notification: RelayNotification): void | Promise<void> {
    if (notification.kind !== 'lifecycle-stage') return this.channel.send(notification);
    const eventId = notification.evidence.eventId;
    if (this.ack.wasNotified(eventId) || this.inFlight.has(eventId)) return;
    this.inFlight.add(eventId);
    try {
      const result = this.channel.send(notification);
      if (result instanceof Promise) {
        return result
          .then(() => { this.ack.markNotified(eventId); })
          .finally(() => { this.inFlight.delete(eventId); });
      }
      this.ack.markNotified(eventId);
      this.inFlight.delete(eventId);
    } catch (error) {
      this.inFlight.delete(eventId);
      throw error;
    }
  }

  onDecision(handler: (input: ChannelDecisionInput) => void): void {
    this.channel.onDecision(handler);
  }
}

function lifecycleAck(
  name: 'slack' | 'teams' | 'telegram',
  options: ApprovalClientsWireOptions,
): ApprovalLifecycleClientAckStore | undefined {
  const injected = options.lifecycleAcks?.[name];
  if (injected) return injected;
  if (!options.lifecycleAckRoot) return undefined;
  return new ApprovalNotifyDedup(options.lifecycleAckRoot, {
    storeDir: join(options.lifecycleAckRoot, name),
  });
}

function withLifecycleAck(
  name: 'slack' | 'teams' | 'telegram',
  channel: RelayChannel,
  options: ApprovalClientsWireOptions,
): RelayChannel {
  const ack = lifecycleAck(name, options);
  return ack ? new LifecycleAckChannel(channel, ack) : channel;
}

function skip(name: string, reason: string): void {
  console.error(`[approval-clients-wire] ${name}: ${reason} — skipping`);
}

/** A resolved-looking secret only in the sense that it isn't empty and isn't
 *  still carrying the unresolved `$DECK:` placeholder — never logged either way. */
function isResolvedSecret(token: string | undefined): token is string {
  return typeof token === 'string' && token.length > 0 && !token.startsWith('$DECK:');
}

function attachSlack(
  relay: ApprovalRelay,
  cfg: ApprovalChannelEntryConfig | undefined,
  transport: SlackApprovalTransport | undefined,
  options: ApprovalClientsWireOptions,
): void {
  if (!cfg?.enabled) return;
  if (!cfg.channel_id) return skip('slack', 'channel_id missing');
  if (!isResolvedSecret(cfg.token)) return skip('slack', 'token unresolved/missing (check .deck)');
  if (!transport) return skip('slack', 'enabled but no transport provided');

  const channel = new ApprovalSlackChannel({
    transport,
    channelId: cfg.channel_id,
    lang: cfg.lang,
    formatLifecycleStage: lifecycleFormatter(cfg.lang),
  });
  relay.attachChannel('slack', withLifecycleAck('slack', channel, options));
}

function attachTeams(
  relay: ApprovalRelay,
  cfg: ApprovalChannelEntryConfig | undefined,
  transport: TeamsApprovalTransport | undefined,
  options: ApprovalClientsWireOptions,
): void {
  if (!cfg?.enabled) return;
  if (!cfg.channel_id) return skip('teams', 'channel_id missing');
  if (!isResolvedSecret(cfg.token)) return skip('teams', 'token unresolved/missing (check .deck)');
  if (!transport) return skip('teams', 'enabled but no transport provided');

  const channel = new ApprovalTeamsChannel({
    transport,
    channelId: cfg.channel_id,
    lang: cfg.lang,
    formatLifecycleStage: lifecycleFormatter(cfg.lang),
  });
  relay.attachChannel('teams', withLifecycleAck('teams', channel, options));
}

function attachTelegram(
  relay: ApprovalRelay,
  cfg: ApprovalChannelsConfig['telegram'],
  transport: TelegramApprovalTransport | undefined,
  options: ApprovalClientsWireOptions,
): void {
  if (!cfg?.enabled || !cfg.chat_id || !transport) return;

  const channel = new ApprovalTelegramChannel({
    transport,
    channelId: cfg.chat_id,
    lang: cfg.lang,
    formatLifecycleStage: lifecycleFormatter(cfg.lang),
  });
  relay.attachChannel('telegram', withLifecycleAck('telegram', channel, options));
}

/**
 * Attach every configured+enabled approval channel (`approval_channels.slack`,
 * `.teams`, and `.telegram`) onto `relay`, given already-built transports.
 * Absent config block / disabled entry / unresolved secret / missing transport
 * -> that channel is silently skipped (logged, never thrown) — one channel's
 * misconfiguration never prevents the other from attaching.
 */
export function attachConfiguredApprovalChannels(
  relay: ApprovalRelay,
  config: ApprovalClientsWireConfig | undefined,
  transports: ApprovalClientsWireTransports,
  options: ApprovalClientsWireOptions = {},
): void {
  const channels = config?.approval_channels;
  if (!channels) return;

  try {
    attachSlack(relay, channels.slack, transports.slack, options);
  } catch (error) {
    console.error(`[approval-clients-wire] slack: attach failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    attachTeams(relay, channels.teams, transports.teams, options);
  } catch (error) {
    console.error(`[approval-clients-wire] teams: attach failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    attachTelegram(relay, channels.telegram, transports.telegram, options);
  } catch (error) {
    console.error(`[approval-clients-wire] telegram: attach failed — ${error instanceof Error ? error.message : String(error)}`);
  }
}
