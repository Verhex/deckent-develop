// BOT-001 (MASTER-PLAN §4G) — connector bootstrap.
//
// Reads config.notify_connectors and brings up each enabled connector in
// OUTBOUND mode, returning targets for the ConnectorNotificationAdapter (and a
// ready-to-register NotificationAdapter via buildConnectorNotificationAdapter).
//
// Connector modules are LAZILY imported so a missing optional dependency
// (discord.js is not a hard dep; discord.ts imports it statically) degrades to
// log + skip rather than crashing module load. Every failure path (unresolved
// $DECK token, missing dep, start error) is logged + skipped — startup never
// crashes on a misconfigured connector (advisor fail-safe).

import type { NotificationAdapter } from '../core/notification-dispatcher.js';
import type { DeckentConfig } from '../core/types.js';
import type { ConnectorId, IMessageConnector } from './types.js';
import {
  makeConnectorNotificationAdapter,
  type ConnectorTarget,
} from './connector-notify-adapter.js';
import { makeIncomingCommandRouter, type CommandResolver, type ResolveOutcome } from './incoming-command-router.js';
import { makeCommandResolver } from './incoming-command-resolver.js';
import { chunkMessage, type ChatResponder } from './chat-bridge.js';
import { takeBotAction } from './bot-action-store.js';
import { createCliToolDispatcher } from '../cli/commands/chat-tool-bridge.js';
import type { McpToolDispatcher } from '../cli/commands/chat-native.js';
import { getMessage } from '../cli/helpers/messages.js';

type NotifyConnectorsConfig = NonNullable<DeckentConfig['notify_connectors']>;

/** Keep an executed-action reply within one Telegram message. */
function truncate(text: string, limit = 3500): string {
  return text.length > limit ? text.slice(0, limit) + '\n…(truncated)' : text;
}

export interface ConnectorBootstrapDeps {
  /** Test/override hook: construct a connector instead of lazy-loading the real module. */
  makeConnector?: (id: ConnectorId) => IMessageConnector | null;
}

const SUPPORTED: ReadonlyArray<'telegram' | 'discord'> = ['telegram', 'discord'];

/** Lazily import + construct a real connector. Returns null if its dep is absent. */
async function loadConnector(id: 'telegram' | 'discord'): Promise<IMessageConnector | null> {
  try {
    if (id === 'telegram') {
      const mod = await import('./telegram.js');
      return new mod.TelegramConnector();
    }
    const mod = await import('./discord.js');
    return new mod.DiscordConnector();
  } catch (err) {
    console.error(
      `[connector-bootstrap] ${id} module load failed (dependency missing?): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Bring up each enabled connector (outbound) and return its send target.
 * Tokens must already be resolved (config load runs interpolateConfig); an
 * unresolved "$DECK:…" token is treated as unconfigured and skipped.
 */
export async function buildConnectorTargets(
  notifyConnectors: NotifyConnectorsConfig | undefined,
  deps: ConnectorBootstrapDeps = {},
): Promise<ConnectorTarget[]> {
  if (!notifyConnectors) return [];

  const targets: ConnectorTarget[] = [];
  for (const id of SUPPORTED) {
    const cfg = notifyConnectors[id];
    if (!cfg?.enabled) continue;

    if (!cfg.token || cfg.token.startsWith('$DECK:')) {
      console.error(`[connector-bootstrap] ${id}: token unresolved/missing — skipping (check .deck)`);
      continue;
    }
    if (!cfg.chat_id) {
      console.error(`[connector-bootstrap] ${id}: chat_id missing — skipping`);
      continue;
    }

    try {
      const connector = deps.makeConnector ? deps.makeConnector(id) : await loadConnector(id);
      if (!connector) continue;
      const startOutbound = connector.startOutbound?.bind(connector) ?? connector.start.bind(connector);
      await startOutbound({ enabled: true, token: cfg.token });
      targets.push({ connector, chatId: String(cfg.chat_id) });
    } catch (err) {
      console.error(
        `[connector-bootstrap] ${id} start failed — skipping: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return targets;
}

/**
 * Build a NotificationAdapter that broadcasts notifications to the configured
 * connectors, or null when none are configured/available.
 */
export async function buildConnectorNotificationAdapter(
  notifyConnectors: NotifyConnectorsConfig | undefined,
  deps: ConnectorBootstrapDeps = {},
): Promise<NotificationAdapter | null> {
  const targets = await buildConnectorTargets(notifyConnectors, deps);
  if (targets.length === 0) return null;
  return makeConnectorNotificationAdapter(targets);
}

// ─── BOT-002 — inbound command transport ──────────────────────────────────

export interface ConnectorCommandsDeps extends ConnectorBootstrapDeps {
  /** Resolve an approval command. Default: disk-backed resolver bound to `root`. */
  resolve?: CommandResolver;
  /**
   * Full agentic chat responder for authorized non-command messages (Telegram as
   * a conversation head). Omit → non-command messages stay silently ignored.
   */
  chat?: ChatResponder;
  /**
   * Dispatcher that EXECUTES a parked bot-action when the user approves it (slice
   * 2b). Default: the CLI tool bridge. Already-approved → raw (ungated) execution.
   */
  actionDispatcher?: McpToolDispatcher;
  /** Language for inbound acks. */
  lang?: string;
}

export interface ConnectorCommandsHandle {
  /**
   * NotificationAdapter over the SAME inbound instances — one connector object
   * per platform serves both directions (poll + send), so there is no second
   * poller and no 409 conflict. Null when nothing was brought up.
   */
  readonly adapter: NotificationAdapter | null;
  /** Ids of the connectors actually listening (for the host banner). */
  readonly active: ConnectorId[];
  /** Stop every started connector (poller + send path). Best-effort. */
  dispose(): Promise<void>;
}

/**
 * Bring up each enabled connector in INBOUND mode (full start → non-blocking
 * poll), register the approve/reject command router on it, and reply acks back
 * through the same connector. Returns a NotificationAdapter over those instances
 * so the outbound notify wire reuses them (see ConnectorCommandsHandle.adapter).
 *
 * Same fail-safe contract as the outbound bootstrap: unresolved $DECK token /
 * missing chat_id / missing dep / start error → log + skip, never crash startup.
 */
export async function bootstrapConnectorCommands(
  root: string,
  notifyConnectors: NotifyConnectorsConfig | undefined,
  deps: ConnectorCommandsDeps = {},
): Promise<ConnectorCommandsHandle> {
  const lang = deps.lang ?? 'en';
  const gateResolve = deps.resolve ?? makeCommandResolver(root);
  const actionDispatcher = deps.actionDispatcher ?? createCliToolDispatcher();
  // Composite resolver: a parked bot-action (slice 2b) is the THIRD gate type —
  // unlike autonomous/nervous (consumed by their own loops), approving here
  // EXECUTES the action in-process and replies the result. Falls through to the
  // autonomous/nervous gate resolver when the id is not a parked bot-action.
  const resolve: CommandResolver = async (id, action): Promise<ResolveOutcome> => {
    const parked = takeBotAction(root, id); // consume-once → approve twice ≠ run twice
    if (parked) {
      if (action === 'reject') {
        return { status: 'resolved', reply: getMessage('bot.action_rejected', lang, { tool: parked.tool }) };
      }
      try {
        const result = await actionDispatcher.dispatch(parked.tool, parked.args);
        const body = getMessage('bot.action_done', lang, { tool: parked.tool }) + '\n' + truncate(result);
        return { status: 'resolved', reply: body };
      } catch (err) {
        return {
          status: 'resolved',
          reply: getMessage('bot.action_failed', lang, {
            tool: parked.tool,
            error: err instanceof Error ? err.message : String(err),
          }),
        };
      }
    }
    return gateResolve(id, action);
  };
  const targets: ConnectorTarget[] = [];
  const started: IMessageConnector[] = [];

  if (notifyConnectors) {
    for (const id of SUPPORTED) {
      const cfg = notifyConnectors[id];
      if (!cfg?.enabled) continue;
      if (!cfg.token || cfg.token.startsWith('$DECK:')) {
        console.error(`[connector-bootstrap] ${id}: token unresolved/missing — skipping (check .deck)`);
        continue;
      }
      if (!cfg.chat_id) {
        console.error(`[connector-bootstrap] ${id}: chat_id missing — skipping`);
        continue;
      }

      try {
        const connector = deps.makeConnector ? deps.makeConnector(id) : await loadConnector(id);
        if (!connector) continue;
        const chatId = String(cfg.chat_id);
        const send = (channelId: string, text: string): Promise<void> =>
          connector.sendMessage({ connector: connector.id, channelId, text });
        const chat = deps.chat;
        connector.onMessage(
          makeIncomingCommandRouter({
            authorizedChatIds: [chatId],
            resolve,
            reply: send,
            lang,
            ...(chat
              ? {
                  onChat: async (channelId: string, text: string): Promise<void> => {
                    // Authorized non-command → full agentic conversation. The
                    // router already enforced the chat_id chokepoint.
                    try {
                      await send(channelId, getMessage('bot.chat_thinking', lang));
                      const reply = await chat(channelId, text);
                      const body = reply.trim() || getMessage('bot.chat_empty', lang);
                      for (const part of chunkMessage(body)) await send(channelId, part);
                    } catch {
                      await send(channelId, getMessage('bot.chat_error', lang)).catch(() => undefined);
                    }
                  },
                }
              : {}),
          }),
        );
        // INBOUND: full start() — launches the poll (non-blocking) AND enables send.
        await connector.start({ enabled: true, token: cfg.token });
        started.push(connector);
        targets.push({ connector, chatId });
      } catch (err) {
        console.error(
          `[connector-bootstrap] ${id} inbound start failed — skipping: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return {
    adapter: targets.length > 0 ? makeConnectorNotificationAdapter(targets) : null,
    active: started.map((c) => c.id),
    async dispose(): Promise<void> {
      for (const c of started) {
        try {
          await c.stop();
        } catch {
          // best-effort shutdown
        }
      }
      try {
        await deps.chat?.dispose?.(); // release the warm agentic provider child
      } catch {
        // best-effort
      }
    },
  };
}
