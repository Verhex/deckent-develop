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
import { parseApprovalCallback } from './callback-router.js';
import type { IncomingCallback } from './types.js';
import { type ChatResponder, type PerTurnMediaConnector } from './chat-bridge.js';
import { chunkMessage } from './message-format.js';
import { makeStreamThrottle } from './stream-throttle.js';
import { isBotSlash, handleBotSlash } from './bot-commands.js';
import { takeBotAction, checkExecutable } from './bot-action-store.js';
import { createCliToolDispatcher } from '../cli/commands/chat-tool-bridge.js';
import type { McpToolDispatcher } from '../cli/commands/chat-native.js';
import { killSprintById } from '../cli/commands/kill.js';
import { getCurrentSprintId } from '../monitor/sprint-state.js';
import { getMessage } from '../cli/helpers/messages.js';
import { markdownToTelegramHtml } from './markdown-to-html.js';
import { createBuiltinRegistry, buildMediaSink, runCapability } from './capabilities/index.js';
import { detectPlatform } from './capabilities/platform.js';
import { defaultSpawn } from './capabilities/spawn.js';
import { loadNodemailerTransport } from './capabilities/mail-transport.js';
import { createArtifactStore } from './capabilities/artifacts.js';
import type { ArtifactStore } from './capabilities/types.js';

type NotifyConnectorsConfig = NonNullable<DeckentConfig['notify_connectors']>;

/** Shape of raw.media as set by TelegramConnector inbound photo/document handlers. */
interface InboundMediaRaw {
  readonly fileId: string;
  readonly filename: string;
  readonly mime: string;
}

/**
 * If msg.raw carries a `media` field (inbound photo/document from Telegram),
 * download it via connector.getFileBuffer, register as an artifact for the channel,
 * and return a new message whose text has `[attached: <id>, <filename>]` prepended.
 * When getFileBuffer is absent (connector doesn't support it) or any step fails,
 * returns the original message unchanged (graceful degrade — never crashes the inbound loop).
 */
async function handleInboundMedia(
  msg: import('./types.js').IncomingMessage,
  connector: import('./types.js').IMessageConnector,
  artifactStore: ArtifactStore,
  lang: string,
): Promise<import('./types.js').IncomingMessage> {
  const raw = msg.raw as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return msg;
  const media = raw['media'] as InboundMediaRaw | undefined;
  if (!media || typeof media.fileId !== 'string') return msg;

  const getFileBuffer = (connector as unknown as {
    getFileBuffer?: (fileId: string) => Promise<{ data: Buffer; mime: string; filename?: string }>;
  }).getFileBuffer;
  if (typeof getFileBuffer !== 'function') return msg; // graceful degrade

  try {
    const { data, filename: dlFilename } = await getFileBuffer.call(connector, media.fileId);
    const ref = artifactStore.register(msg.channelId, {
      filename: media.filename,
      mime: media.mime,
      data,
    });
    const notice = getMessage('cap.inbound.attached', lang, { id: ref.id, filename: ref.filename });
    const text = msg.text ? `${notice}\n${msg.text}` : notice;
    // Suppress unused variable warning — dlFilename used for future extension
    void dlFilename;
    return { ...msg, text };
  } catch {
    // Download/register failure must never crash the inbound poller
    return msg;
  }
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

/**
 * Streaming variant of ChatResponder: receives a per-call `onPartial` callback and
 * an OPTIONAL `mediaConnector` (Slice 1.1) for per-turn media delivery.
 * Existing 3-arg callers are unaffected — the 4th arg is additive and optional.
 */
export type ChatStreamResponder = (
  channelId: string,
  text: string,
  onPartial: (partial: string) => void,
  mediaConnector?: PerTurnMediaConnector,
) => Promise<string>;

export interface ConnectorCommandsDeps extends ConnectorBootstrapDeps {
  /** Resolve an approval command. Default: disk-backed resolver bound to `root`. */
  resolve?: CommandResolver;
  /**
   * Full agentic chat responder for authorized non-command messages (Telegram as
   * a conversation head). Omit → non-command messages stay silently ignored.
   */
  chat?: ChatResponder;
  /**
   * Faz-1 T4 — streaming-capable responder. When provided AND the connector exposes
   * `sendChatAction` + `sendMessageReturningId` + `editMessage`, the bot uses a
   * typing-indicator + edit-in-place pattern instead of the send-final fallback.
   * When absent (or the connector lacks the streaming caps), the path falls back to
   * the byte-identical send-final behavior (send thinking → chat → send reply).
   * Supplied by bot.ts (Task 5). Existing callers that omit it are unaffected.
   */
  onChatStreaming?: ChatStreamResponder;
  /**
   * Dispatcher that EXECUTES a parked bot-action when the user approves it (slice
   * 2b). Default: the CLI tool bridge. Already-approved → raw (ungated) execution.
   */
  actionDispatcher?: McpToolDispatcher;
  /** Language for inbound acks. */
  lang?: string;
  /**
   * Slice 1 T10 — bot capabilities config. When provided and enabled, parked
   * capability tools (screenshot, send_mail …) on the approve-path are routed
   * through runCapability instead of the generic actionDispatcher.
   * Default: undefined → { enabled: false } → capabilities surface is OFF.
   */
  botCapabilities?: import('./capabilities/types.js').BotCapabilitiesConfig;
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
  const gateResolve = deps.resolve ?? makeCommandResolver(root, {}, lang);
  const actionDispatcher = deps.actionDispatcher ?? createCliToolDispatcher();
  // Artifact store — used for inbound media (Task 8). Task 13 will unify this with
  // the capability context; for now we construct one locally here. The store writes
  // to <root>/.deckent/artifacts/ which is created on first use.
  const artifactStore: ArtifactStore = createArtifactStore(root);
  // Capability registry — shared across the bootstrap lifecycle (flag-gated default-off).
  const capRegistry = createBuiltinRegistry();
  // Composite resolver: a parked bot-action (slice 2b) is the THIRD gate type —
  // unlike autonomous/nervous (consumed by their own loops), approving here
  // EXECUTES the action in-process and replies the result. Falls through to the
  // autonomous/nervous gate resolver when the id is not a parked bot-action.
  const resolve: CommandResolver = async (id, action): Promise<ResolveOutcome> => {
    const parked = takeBotAction(root, id); // consume-once → approve twice ≠ run twice
    if (parked) {
      /**
       * Edit-on-resolve: after producing the outcome, edit the original approval
       * message (remove buttons, show result) if approvalMessageId is set and the
       * connector exposes editMessage. Best-effort — never crashes the resolve path.
       */
      const editApprovalMessage = async (outcome: string): Promise<void> => {
        if (!parked.approvalMessageId) return;
        const target = targets.find((t) => t.chatId === parked.channelId);
        if (!target) return;
        const editable = target.connector as unknown as {
          editMessage?(c: string, id: string, t: string, pm?: 'HTML' | 'MarkdownV2'): Promise<void>;
        };
        if (typeof editable.editMessage !== 'function') return;
        await editable.editMessage(
          parked.channelId,
          parked.approvalMessageId,
          markdownToTelegramHtml(outcome),
          'HTML',
        ).catch(() => {}); // best-effort: Telegram errors must not crash resolve
      };

      if (action === 'reject') {
        const rejectOutcome = getMessage('cap.approval.rejected', lang);
        await editApprovalMessage(rejectOutcome);
        return { status: 'resolved', reply: getMessage('bot.action_rejected', lang, { tool: parked.tool }) };
      }
      // Re-verify at execute time (advisor's two flat rules): TTL + sprint-binding.
      // A stale/backlog approval, or one tied to a sprint that is no longer active,
      // is REFUSED — never executed (this is the wrong-kill-next-sprint guard).
      const exec = checkExecutable(parked, { now: Date.now(), currentSprintId: getCurrentSprintId(root) });
      if (!exec.ok) {
        const key = exec.reason === 'expired' ? 'bot.action_expired' : 'bot.action_sprint_changed';
        const refusalText = getMessage(key, lang, { tool: parked.tool, sprint: parked.boundSprintId ?? '—' });
        await editApprovalMessage(refusalText);
        return { status: 'resolved', reply: refusalText };
      }
      try {
        // Capability-aware approve path: capability tools (e.g. screenshot, send_mail)
        // route through runCapability (single chokepoint) instead of actionDispatcher.
        // The media sink uses the connector paired with the approved channelId when
        // available (for sendMedia); falls back to honest text otherwise.
        if (capRegistry.has(parked.tool)) {
          // targets may not be populated yet at resolve-definition time but IS
          // populated by approval time (lazy closure eval).
          const target = targets.find((t) => t.chatId === parked.channelId);
          const capConnector = target?.connector ?? { id: 'unknown' };
          const sendText = async (channelId: string, text: string): Promise<void> => {
            const t = targets.find((t) => t.chatId === channelId);
            if (t) { for (const part of chunkMessage(text)) await t.connector.sendMessage({ connector: t.connector.id, channelId, text: part }); }
          };
          const capConfig = deps.botCapabilities ?? { enabled: false };
          const mediaSink = buildMediaSink(capConnector, lang, sendText);
          const capCtx = {
            chatKey: parked.channelId,
            project: root,
            lang,
            config: capConfig,
            now: Date.now(),
            platform: detectPlatform(),
            spawn: defaultSpawn,
            loadMailTransport: loadNodemailerTransport,
          };
          const result = await runCapability(capRegistry, parked.tool, parked.args, capCtx, parked.channelId, mediaSink, 'confirm');
          const approvedOutcome = getMessage('cap.approval.approved', lang, { result });
          await editApprovalMessage(approvedOutcome);
          return { status: 'resolved', reply: getMessage('bot.action_done', lang, { tool: parked.tool }) + '\n' + result };
        }
        // A bound kill routes to the ownership-validated precise primitive — kills
        // EXACTLY the bound sprint (never --all, never a pid-reused foreign process).
        if (parked.tool === 'deckent_kill' && parked.boundSprintId) {
          const r = await killSprintById(root, parked.boundSprintId);
          const key =
            r.status === 'killed' ? 'bot.kill_done'
            : r.status === 'reused' ? 'bot.kill_reused'
            : 'bot.kill_already_stopped';
          const reply = getMessage(key, lang, {
            sprint: parked.boundSprintId,
            pid: r.status === 'killed' ? String(r.pid) : '',
          });
          await editApprovalMessage(getMessage('cap.approval.approved', lang, { result: reply }));
          return { status: 'resolved', reply };
        }
        const result = await actionDispatcher.dispatch(parked.tool, parked.args);
        // BOT-LEN: carry the FULL result — the lossless `send` below chunks it
        // into Telegram-safe parts instead of hard-cutting (the old truncate()).
        const body = getMessage('bot.action_done', lang, { tool: parked.tool }) + '\n' + result;
        await editApprovalMessage(getMessage('cap.approval.approved', lang, { result }));
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
  // Backlog-replay guard cutoff: only process messages sent at/after the moment
  // this listener came up (buffered backlog from while it was offline is dropped).
  const acceptFrom = Date.now();

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
        // BOT-LEN: lossless send — split any over-limit text into Telegram-safe
        // parts (never cut). Single chokepoint for every outbound bot message
        // (command acks, bot-action results, chat replies). The onChat path's own
        // chunkMessage stays a harmless no-op (parts are already ≤ limit).
        const send = async (channelId: string, text: string): Promise<void> => {
          for (const part of chunkMessage(text)) {
            await connector.sendMessage({ connector: connector.id, channelId, text: part });
          }
        };
        // Rich chat-reply send: render Markdown → Telegram HTML, falling back to
        // PLAIN per-chunk if Telegram rejects the HTML (malformed entities). Chunk
        // the Markdown SOURCE (line boundaries) BEFORE converting so inline tags
        // stay balanced per chunk.
        const sendRich = async (channelId: string, mdText: string): Promise<void> => {
          for (const part of chunkMessage(mdText)) {
            try {
              await connector.sendMessage({ connector: connector.id, channelId, text: markdownToTelegramHtml(part), parseMode: 'HTML' });
            } catch {
              await connector.sendMessage({ connector: connector.id, channelId, text: part });
            }
          }
        };
        const chat = deps.chat;
        const commandRouter = makeIncomingCommandRouter({
            authorizedChatIds: [chatId],
            resolve,
            reply: send,
            lang,
            acceptFrom,
            ...(chat
              ? {
                  onChat: async (channelId: string, text: string): Promise<void> => {
                    // Authorized non-command. The router already enforced the
                    // chat_id chokepoint.
                    try {
                      // Curated bot slash → bot surface ONLY. Intercept EVERY
                      // slash so the chat engine's 30-command CLI registry never
                      // leaks (and is never a gate-bypass — slashes are read-only).
                      if (isBotSlash(text)) {
                        const reply = await handleBotSlash(text, {
                          root,
                          lang,
                          readOnlyDispatcher: actionDispatcher,
                        });
                        for (const part of chunkMessage(reply)) await send(channelId, part);
                        return;
                      }
                      // Natural language → full agentic conversation.
                      // Streaming path: typing indicator + edit-in-place as reply
                      // accumulates. Activates ONLY when (a) the connector exposes
                      // the 3 optional streaming caps AND (b) onChatStreaming is
                      // provided. Otherwise: byte-identical send-final fallback.
                      const streamCap = connector as unknown as {
                        sendChatAction?: (c: string, a: 'typing') => Promise<void>;
                        sendMessageReturningId?: (m: { connector: string; channelId: string; text: string }) => Promise<string | undefined>;
                        editMessage?: (c: string, id: string, t: string, pm?: 'HTML' | 'MarkdownV2') => Promise<void>;
                      };
                      const canStream =
                        deps.onChatStreaming !== undefined &&
                        typeof streamCap.sendChatAction === 'function' &&
                        typeof streamCap.sendMessageReturningId === 'function' &&
                        typeof streamCap.editMessage === 'function';

                      if (canStream) {
                        const chatStreaming = deps.onChatStreaming!;
                        await streamCap.sendChatAction!(channelId, 'typing').catch(() => undefined);
                        const placeholder = getMessage('bot.chat_thinking', lang);
                        const msgId = await streamCap.sendMessageReturningId!({ connector: connector.id, channelId, text: placeholder });
                        const throttle = msgId
                          ? makeStreamThrottle({ edit: (t) => streamCap.editMessage!(channelId, msgId, t.slice(0, 4000)) })
                          : null;
                        // Slice 1.1: pass the live connector as the per-turn mediaConnector so
                        // capability media (e.g. screenshot photo) is delivered to the right transport.
                        const reply = await chatStreaming(channelId, text, (partial) => throttle?.push(partial), connector as PerTurnMediaConnector);
                        const body = reply.trim() || getMessage('bot.chat_empty', lang);
                        if (msgId && throttle) {
                          // Final: edit the placeholder in place with the first part
                          // rendered as HTML; overflow parts sent as rich messages.
                          const parts = chunkMessage(body);
                          const html0 = markdownToTelegramHtml(parts[0]!);
                          await streamCap.editMessage!(channelId, msgId, html0, 'HTML')
                            .catch(async () => {
                              await streamCap.editMessage!(channelId, msgId, parts[0]!).catch(async () => { await send(channelId, parts[0]!); });
                            });
                          for (let i = 1; i < parts.length; i++) await sendRich(channelId, parts[i]!);
                        } else {
                          await sendRich(channelId, body);
                        }
                      } else {
                        // Non-streaming fallback — rich reply.
                        // Slice 1.1: pass the live connector as the per-turn mediaConnector so
                        // capability media (e.g. screenshot photo) is delivered to the right transport.
                        await send(channelId, getMessage('bot.chat_thinking', lang));
                        const reply = await chat(channelId, text, connector as PerTurnMediaConnector);
                        const body = reply.trim() || getMessage('bot.chat_empty', lang);
                        await sendRich(channelId, body);
                      }
                    } catch {
                      await send(channelId, getMessage('bot.chat_error', lang)).catch(() => undefined);
                    }
                  },
                }
              : {}),
          });
        // Inbound media gate (Task 8): if a message carries raw.media (photo/document),
        // download the file via getFileBuffer, register as artifact, prepend [attached]
        // to the text — BEFORE the command router sees the message (the router then passes
        // the enriched text to onChat). Best-effort: any failure leaves the original message.
        connector.onMessage((msg) => {
          void handleInboundMedia(msg, connector, artifactStore, lang).then((processedMsg) => {
            commandRouter(processedMsg);
          }).catch(() => {
            // Fail-safe: media processing error must never crash the inbound poller
            commandRouter(msg);
          });
        });
        // Rich-approval bot: a button press (Telegram callback_query) becomes a
        // synthetic `approve <id>` / `reject <id>` command fed to the SAME router —
        // reusing the chat-id auth chokepoint, the gate resolve, and the ack reply.
        // Only the Telegram connector exposes onCallback; others are unaffected
        // (feature-detected). A press is a machine decision → never the LLM/onChat.
        const cbCapable = connector as unknown as { onCallback?: (h: (cb: IncomingCallback) => void) => void };
        if (typeof cbCapable.onCallback === 'function') {
          cbCapable.onCallback((cb: IncomingCallback) => {
            const parsed = parseApprovalCallback(cb.data);
            if (!parsed) return;
            commandRouter({
              id: `cb-${cb.data}`,
              connector: connector.id,
              fromUser: cb.fromUser,
              channelId: cb.channelId,
              text: `${parsed.action} ${parsed.triggerId}`,
              timestamp: new Date().toISOString(),
              raw: { callback: cb.data },
            });
          });
        }
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
    adapter: targets.length > 0
      ? makeConnectorNotificationAdapter(targets)
      : null,
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
