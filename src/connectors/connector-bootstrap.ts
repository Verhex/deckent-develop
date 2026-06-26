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

import { join } from 'node:path';
import type { NotificationAdapter } from '../core/notification-dispatcher.js';
import type { DeckentConfig } from '../core/types.js';
import type { ConnectorId, IMessageConnector, IncomingMessage } from './types.js';
import { IdentityStore } from './identity/identity-store.js';
import { createIdentityProvider } from './identity/index.js';
import { resolvePrincipal, type ChannelBinding } from './identity/principal-resolver.js';
import type { ResolvedPrincipal } from './identity/provider.js';
import { chatKeyOf } from './gateway/gateway-router.js';
import { loadGatewayAccess } from './gateway/gateway-access.js';
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
import type { VoiceAdapter } from './voice/types.js';
import { resolveReplyLanguage } from './voice/language.js';
import { resolveReplyModality } from './voice/modality.js';

type NotifyConnectorsConfig = NonNullable<DeckentConfig['notify_connectors']>
  & Partial<Record<'whatsapp', { enabled: boolean; token: string; chat_id: string }>>;

/** Shape of raw.media as set by TelegramConnector inbound photo/document handlers. */
interface InboundMediaRaw {
  readonly fileId: string;
  readonly filename: string;
  readonly mime: string;
}

/** Shape of raw.voice as set by TelegramConnector inbound voice-note handlers. */
interface InboundVoiceRaw {
  readonly fileId: string;
  readonly mime: string;
  readonly duration?: number;
}

/**
 * Strip Markdown and HTML formatting from a string, producing clean text
 * suitable for TTS synthesis.  Handles the most common patterns from the
 * Telegram/Markdown render pipeline without pulling in a full DOM parser.
 */
function stripFormatting(text: string): string {
  return text
    // HTML tags (bold, italic, code, etc.)
    .replace(/<[^>]+>/g, '')
    // Markdown bold / italic (** and __)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // Markdown italic (* and _)
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Markdown inline code
    .replace(/`(.+?)`/g, '$1')
    // Markdown code blocks (``` ... ```)
    .replace(/```[\s\S]*?```/g, '')
    // Markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Trim surrounding whitespace
    .trim();
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
    const { data } = await getFileBuffer.call(connector, media.fileId);
    const ref = artifactStore.register(msg.channelId, {
      filename: media.filename,
      mime: media.mime,
      data,
    });
    const notice = getMessage('cap.inbound.attached', lang, { id: ref.id, filename: ref.filename });
    const text = msg.text ? `${notice}\n${msg.text}` : notice;
    return { ...msg, text };
  } catch {
    // Download/register failure must never crash the inbound poller
    return msg;
  }
}

/**
 * If msg.raw carries a `voice` field (inbound voice note from Telegram),
 * download it via connector.getFileBuffer, transcribe via voiceAdapter.transcribe,
 * and return a new message whose text is the transcribed text with voiceOrigin=true
 * injected into the raw field.
 *
 * When voiceAdapter is absent, stt is disabled, getFileBuffer is absent, or any
 * step fails, returns the original message unchanged (graceful degrade — never
 * crashes the inbound loop).  The returned value also carries `voiceOrigin: true`
 * in raw only when transcription succeeded, so the reply path can decide TTS.
 */
async function handleInboundVoice(
  msg: import('./types.js').IncomingMessage,
  connector: import('./types.js').IMessageConnector,
  voiceAdapter: VoiceAdapter | null | undefined,
  sttEnabled: boolean,
): Promise<{ msg: import('./types.js').IncomingMessage; voiceOrigin: boolean; detectedLang: string | undefined; transcribeError: boolean }> {
  const raw = msg.raw as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return { msg, voiceOrigin: false, detectedLang: undefined, transcribeError: false };
  const voiceRaw = raw['voice'] as InboundVoiceRaw | undefined;
  if (!voiceRaw || typeof voiceRaw.fileId !== 'string') return { msg, voiceOrigin: false, detectedLang: undefined, transcribeError: false };
  if (!voiceAdapter || !sttEnabled) return { msg, voiceOrigin: false, detectedLang: undefined, transcribeError: false };

  const getFileBuffer = (connector as unknown as {
    getFileBuffer?: (fileId: string) => Promise<{ data: Buffer; mime: string; filename?: string }>;
  }).getFileBuffer;
  if (typeof getFileBuffer !== 'function') return { msg, voiceOrigin: false, detectedLang: undefined, transcribeError: false };

  try {
    const { data, mime } = await getFileBuffer.call(connector, voiceRaw.fileId);
    const { text: transcribed, language } = await voiceAdapter.transcribe(data, mime);
    return {
      msg: { ...msg, text: transcribed, raw: { ...raw, voiceOrigin: true } },
      voiceOrigin: true,
      detectedLang: language,
      transcribeError: false,
    };
  } catch {
    // Download or transcription failure must never crash the inbound poller.
    // Return transcribeError=true so the callsite can notify the user honestly.
    return { msg, voiceOrigin: false, detectedLang: undefined, transcribeError: true };
  }
}

export interface ConnectorBootstrapDeps {
  /** Test/override hook: construct a connector instead of lazy-loading the real module. */
  makeConnector?: (id: ConnectorId) => IMessageConnector | null;
}

const SUPPORTED: ReadonlyArray<'telegram' | 'discord' | 'whatsapp'> = ['telegram', 'discord', 'whatsapp'];

/** Lazily import + construct a real connector. Returns null if its dep is absent. */
async function loadConnector(id: 'telegram' | 'discord' | 'whatsapp'): Promise<IMessageConnector | null> {
  try {
    if (id === 'telegram') {
      const mod = await import('./telegram.js');
      return new mod.TelegramConnector();
    }
    if (id === 'discord') {
      const mod = await import('./discord.js');
      return new mod.DiscordConnector();
    }
    const mod = await import('./whatsapp.js');
    return new mod.WhatsAppConnector();
  } catch (err) {
    console.error(
      `[connector-bootstrap] ${id} module load failed (dependency missing?): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * Build a per-message principal resolver from identity config. Pure + O(1) local.
 * Returns a closure (msg, binding) → ResolvedPrincipal | null (fail-closed).
 * Suitable for unit-testing in isolation (no connector required).
 */
export function buildIdentityResolver(
  identityCfg: NonNullable<DeckentConfig['identity']>,
  store: IdentityStore,
  projectRoot: string,
): (input: { connector: ConnectorId; fromUser: string }, binding: ChannelBinding) => ResolvedPrincipal | null {
  const provider = createIdentityProvider({
    kind: 'local', store,
    local: {
      edition: identityCfg.enforcement === 'strict' ? 'enterprise' : 'team',
      roleMap: identityCfg.roleMap as never,
      owner: identityCfg.owner as never,
    },
  });
  const roleMap = identityCfg.roleMap as never;
  return (input, binding) => {
    try {
      return resolvePrincipal(input, binding, provider, projectRoot, roleMap);
    } catch {
      return null; // fail-closed: any resolution error → treat as unknown sender
    }
  };
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
  detectedLang?: string,
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
  /**
   * VoiceAdapter for inbound STT + reply TTS (Task 11, unified by Task 13).
   * When provided and botCapabilities.voice.stt is true, inbound voice messages
   * are transcribed before being routed to the chat responder. When
   * botCapabilities.voice.tts is not 'off', replies to voice-origin turns (or
   * all turns when tts='always') are synthesized and sent via connector.sendVoice.
   * Default: undefined → voice processing is OFF (backward-compat, default-off).
   * Construct ONE instance at bootstrap level and pass it here; bootstrapConnectorCommands
   * holds a single voiceAdapter per connector lifetime (Task 13 unification).
   */
  voiceAdapter?: VoiceAdapter | null;
  /**
   * Shared artifact store threaded from bot.ts (Finding 1 — production wiring fix).
   * When provided, the inbound media gate + capability approve-path use THIS instance
   * instead of creating an internal one. Ensures screenshot artifacts registered via
   * makeChatResponder are resolvable by send_mail in the same bootstrap lifecycle.
   * Default: undefined → internal createArtifactStore(root) (backward-compat for tests
   * that construct bootstrap directly without a pre-built store).
   */
  artifacts?: ArtifactStore;
  /**
   * Per-message sender identity config (ADR-092). When absent or enabled:false,
   * the connector inbound path is byte-for-byte unchanged — identity is opt-in.
   */
  identityCfg?: NonNullable<DeckentConfig['identity']>;
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
  // Artifact store — single instance per connector (Task 13 unification).
  // Used by BOTH the inbound media gate (Task 8: register inbound photos/documents)
  // AND the capability context (Task 13: screenshot registers → send_mail resolves).
  // The same store is threaded into capCtx.artifacts on the approve-path below so an
  // inbound-registered photo is resolvable by send_mail's attachIds in the same session.
  // When deps.artifacts is provided (production bot.ts path), use THAT instance so the
  // responder (makeChatResponder) and the bootstrap resolver share ONE store — the key
  // invariant for screenshot→mail-attach (Finding 1 fix). Fall back to a fresh internal
  // store only for callers that don't inject one (backward-compat, tests).
  // Writes to <root>/.deckent/artifacts/ which is created on first use.
  const artifactStore: ArtifactStore = deps.artifacts ?? createArtifactStore(root);
  // Voice adapter — single instance per connector (Task 13).
  // Shared between inbound STT path (Task 11) and the reply TTS path.
  // deps.voiceAdapter takes precedence (test seam / pre-constructed instance).
  const voiceAdapter: VoiceAdapter | null = deps.voiceAdapter ?? null;
  const voiceCfg = deps.botCapabilities?.voice;
  const sttEnabled = Boolean(voiceCfg?.stt);
  const ttsModeValue = voiceCfg?.tts ?? 'off';
  // Capability registry — shared across the bootstrap lifecycle (flag-gated default-off).
  const capRegistry = createBuiltinRegistry();
  // Per-channel principal cache — populated by onChat, consumed by the approval capCtx.
  // Keyed by raw channelId (same key used by parked.channelId on the approve path).
  // Identity-disabled: never populated → principal stays undefined → L2 gate is a no-op.
  const lastPrincipals = new Map<string, ResolvedPrincipal | undefined>();
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
            artifacts: artifactStore,
            // Thread the latest principal for this channel (identity-disabled → undefined → L2 gate no-op).
            principal: lastPrincipals.get(parked.channelId),
            tenantId: lastPrincipals.get(parked.channelId)?.tenantId,
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

  // Identity: load gateway access + build resolver when enabled. Null when disabled.
  // When disabled, resolveIdentity=null → onChat closure is byte-identical (no identity path).
  // Fail-closed: any initialization error → log + disable identity for this session (never crash).
  const identityAccess = deps.identityCfg?.enabled
    ? await loadGatewayAccess().catch((err) => {
        console.error(`[connector-bootstrap] identity: failed to load gateway access — identity disabled: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      })
    : null;
  let resolveIdentity: ((input: { connector: ConnectorId; fromUser: string }, binding: ChannelBinding) => ResolvedPrincipal | null) | null = null;
  if (deps.identityCfg?.enabled && identityAccess) {
    try {
      const identityStore = new IdentityStore(join(root, '.deckent', 'identity.db'));
      resolveIdentity = buildIdentityResolver(deps.identityCfg, identityStore, root);
    } catch (err) {
      console.error(`[connector-bootstrap] identity: failed to initialize IdentityStore — identity disabled: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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
        // Task 11: track whether the current inbound turn was voice-origin so the
        // onChat handler can decide whether to TTS-reply.  A simple per-channel map
        // keyed on channelId is safe: turns for the same channel are serialized by
        // the command router (one turn at a time per channel), so there is no race.
        const pendingVoiceOrigin = new Map<string, boolean>();
        // Task 3 (WS1): parallel map for the STT-detected language (BCP-47 tag).
        // Set alongside pendingVoiceOrigin when transcription returns a language.
        // Consumed (read + deleted) in onChat — Task 5 reads it here to inject the
        // reply-language instruction into the turn before calling chat()/chatStreaming().
        const pendingVoiceLang = new Map<string, string>();

        /**
         * Task 11: attempt TTS + sendVoice after a reply is produced.
         * Returns true when voice was sent (caller skips text reply).
         * Returns false on any error (caller falls through to text reply).
         *
         * Voice decision contract (Finding 1 fix):
         *   'always'        → synthesize on EVERY turn (text-origin OR voice-origin)
         *   'reply-in-kind' → synthesize only when inbound was voice-origin
         *   'off' (default) → never
         */
        const tryReplyWithVoice = async (
          channelId: string,
          replyText: string,
          shouldVoiceThisTurn: boolean,
          replyLangTag?: string | null,
        ): Promise<boolean> => {
          if (!voiceAdapter) return false;
          if (!shouldVoiceThisTurn) return false;

          const sendVoiceFn = (connector as unknown as {
            sendVoice?: (channelId: string, audio: { data: Buffer; mime: string }) => Promise<void>;
          }).sendVoice;
          if (typeof sendVoiceFn !== 'function') return false;

          try {
            const stripped = stripFormatting(replyText);
            // WS1 Task 5 (b): pass the resolved language tag to the TTS backend so it
            // can choose the right voice/model for the output language.  When the mode
            // is 'mirror' (tag=null) we omit the hint — the backend uses its default.
            const synthOpts = replyLangTag ? { language: replyLangTag } : undefined;
            const audio = await voiceAdapter.synthesize(stripped, synthOpts);
            await sendVoiceFn.call(connector, channelId, audio);
            return true; // voice sent — for reply-in-kind, skip text reply
          } catch {
            // TTS or sendVoice failure → honest degrade → caller sends text reply
            return false;
          }
        };

        const commandRouter = makeIncomingCommandRouter({
            authorizedChatIds: [chatId],
            resolve,
            reply: send,
            lang,
            acceptFrom,
            ...(chat
              ? {
                  onChat: async (channelId: string, text: string, msg: IncomingMessage): Promise<void> => {
                    // Consume voice-origin flag for THIS turn (set by onMessage below).
                    const isVoiceOrigin = pendingVoiceOrigin.get(channelId) ?? false;
                    pendingVoiceOrigin.delete(channelId);
                    // Task 3 (WS1): consume the STT-detected language for this turn.
                    const detectedLang = pendingVoiceLang.get(channelId);
                    pendingVoiceLang.delete(channelId);

                    // Identity resolution (ADR-092, Task 4). Opt-in — disabled path is byte-for-byte unchanged.
                    // When resolveIdentity is null (identity disabled), principal stays undefined → L2 gate no-op.
                    // Fail-closed: unknown sender on a bound channel with no guestRole → verify prompt + return.
                    if (resolveIdentity && identityAccess) {
                      const binding = identityAccess.getBinding(chatKeyOf(msg.connector, channelId));
                      if (binding) {
                        const resolved = resolveIdentity({ connector: msg.connector, fromUser: msg.fromUser }, binding);
                        if (resolved === null && !binding.guestRole) {
                          // Unknown sender on a tenant-locked channel — send verify prompt, drop turn.
                          await send(channelId, getMessage('identity.verify_prompt', lang, { method: '/verify' })).catch(() => undefined);
                          return;
                        }
                        // Cache resolved principal for the approval capCtx (parked-action path).
                        lastPrincipals.set(channelId, resolved ?? undefined);
                      }
                    }

                    // WS1 Task 5 (a): resolve the reply-language for this turn and build
                    // the instruction to prepend to the agentic turn text.
                    // Only fires when voice config is present (voiceCfg is non-null/undefined).
                    // Default-off contract: when voiceCfg is absent, no instruction is injected
                    // and behavior is 100% unchanged (backward-compat).
                    let turnText = text;
                    let replyLangTag: string | null = null;
                    if (voiceCfg) {
                      const replyLang = resolveReplyLanguage(voiceCfg, detectedLang);
                      replyLangTag = replyLang.tag;
                      const capabilityCtx = getMessage('voice.capability_context', lang);
                      const replyLangInstruction =
                        replyLang.mode === 'forced' && replyLang.tag
                          ? getMessage('voice.reply_lang_forced', lang, { language: replyLang.tag })
                          : getMessage('voice.reply_lang_mirror', lang);
                      // Prepend as a system-level preamble block before the user's message.
                      // Order: voice-awareness context first, then the language directive, then user text.
                      // A blank line separates each segment so the LLM treats them as distinct.
                      turnText = `${capabilityCtx}\n${replyLangInstruction}\n\n${text}`;
                    }

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

                      // Task 11 (Finding 2) + WS2 Task 2: compute shouldVoice BEFORE choosing
                      // streaming vs text path. WS2: use resolveReplyModality so a per-message
                      // phrase ("bana yaz", "sesli cevap ver") overrides the ttsMode default in
                      // both directions.  `text` is the inbound user message (pre-instruction
                      // prepend, post-transcription) so voice transcripts are checked correctly.
                      const shouldVoiceThisTurn = resolveReplyModality(text, {
                        ttsMode: ttsModeValue,
                        voiceOrigin: isVoiceOrigin,
                      }).modality === 'voice';

                      if (canStream && !shouldVoiceThisTurn) {
                        const chatStreaming = deps.onChatStreaming!;
                        await streamCap.sendChatAction!(channelId, 'typing').catch(() => undefined);
                        const placeholder = getMessage('bot.chat_thinking', lang);
                        const msgId = await streamCap.sendMessageReturningId!({ connector: connector.id, channelId, text: placeholder });
                        const throttle = msgId
                          ? makeStreamThrottle({ edit: (t) => streamCap.editMessage!(channelId, msgId, t.slice(0, 4000)) })
                          : null;
                        // Slice 1.1: pass the live connector as the per-turn mediaConnector so
                        // capability media (e.g. screenshot photo) is delivered to the right transport.
                        // WS1 Task 5: turnText carries the reply-language instruction; detectedLang
                        // still threaded as 5th arg for downstream consumers.
                        const reply = await chatStreaming(channelId, turnText, (partial) => throttle?.push(partial), connector as PerTurnMediaConnector, detectedLang);
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
                      } else if (canStream && shouldVoiceThisTurn) {
                        // Voice-reply turn + streaming capable: collect full reply WITHOUT
                        // streaming it as text first, then attempt TTS+sendVoice.
                        // On TTS success → voice only (text never sent).
                        // On TTS failure → fall back to non-streaming text reply.
                        const chatStreaming = deps.onChatStreaming!;
                        await streamCap.sendChatAction!(channelId, 'typing').catch(() => undefined);
                        // WS1 Task 5: turnText carries the reply-language instruction.
                        const reply = await chatStreaming(channelId, turnText, () => {/* collect only — no streaming edits */}, connector as PerTurnMediaConnector, detectedLang);
                        const body = reply.trim() || getMessage('bot.chat_empty', lang);
                        // WS1 Task 5 (b): pass resolved language tag to TTS synthesizer.
                        const sentVoice = await tryReplyWithVoice(channelId, body, shouldVoiceThisTurn, replyLangTag);
                        if (!sentVoice) {
                          await sendRich(channelId, body);
                        }
                      } else {
                        // Non-streaming fallback — rich reply.
                        // Slice 1.1: pass the live connector as the per-turn mediaConnector so
                        // capability media (e.g. screenshot photo) is delivered to the right transport.
                        await send(channelId, getMessage('bot.chat_thinking', lang));
                        // WS1 Task 5: turnText carries the reply-language instruction; detectedLang
                        // still threaded as 4th arg for downstream consumers.
                        const reply = await chat(channelId, turnText, connector as PerTurnMediaConnector, detectedLang);
                        const body = reply.trim() || getMessage('bot.chat_empty', lang);
                        // Task 11 TTS: try voice reply first; skip text when voice succeeded
                        // (covers both 'always' and 'reply-in-kind' — voice replaces text).
                        // WS1 Task 5 (b): pass resolved language tag to TTS synthesizer.
                        const sentVoice = await tryReplyWithVoice(channelId, body, shouldVoiceThisTurn, replyLangTag);
                        if (!sentVoice) {
                          await sendRich(channelId, body);
                        }
                      }
                    } catch {
                      await send(channelId, getMessage('bot.chat_error', lang)).catch(() => undefined);
                    }
                  },
                }
              : {}),
          });
        // Inbound media gate (Task 8) + voice gate (Task 11):
        //   1. If raw.media → download + register artifact + prepend [attached]
        //   2. If raw.voice + voiceAdapter + stt → download + transcribe → replace text
        //      and set pendingVoiceOrigin[channelId]=true so onChat knows the origin.
        //   3. If transcription fails → notify user honestly (Finding 3: voice.transcribe.error)
        //      then route the original message (connector sees it as text, best-effort).
        // Both gates are best-effort: any failure leaves the original message.
        connector.onMessage((msg) => {
          void (async () => {
            // Gate 1: inbound media (Task 8)
            let processedMsg = await handleInboundMedia(msg, connector, artifactStore, lang).catch(() => msg);
            // Gate 2: inbound voice (Task 11 + Task 3 WS1)
            const { msg: voiceMsg, voiceOrigin, detectedLang: voiceLang, transcribeError } = await handleInboundVoice(
              processedMsg, connector, voiceAdapter, sttEnabled,
            ).catch(() => ({ msg: processedMsg, voiceOrigin: false, detectedLang: undefined as string | undefined, transcribeError: false }));
            if (transcribeError) {
              // Honest degrade: tell the user their voice note couldn't be understood.
              // Best-effort send — never crashes the poller if sendMessage throws.
              await send(msg.channelId, getMessage('voice.transcribe.error', lang)).catch(() => undefined);
            }
            if (voiceOrigin) {
              // Mark this channel's next onChat turn as voice-origin for TTS reply decision.
              pendingVoiceOrigin.set(voiceMsg.channelId, true);
              // Task 3 (WS1): record the STT-detected language for this turn.
              // Only set when the STT provider returned a language tag; absent = provider
              // did not detect / did not support language detection — no injection.
              if (voiceLang !== undefined) {
                pendingVoiceLang.set(voiceMsg.channelId, voiceLang);
              }
            }
            commandRouter(voiceMsg);
          })().catch(() => {
            // Fail-safe: any gate error must never crash the inbound poller
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
