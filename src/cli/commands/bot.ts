/**
 * BOT-002 (MASTER-PLAN §4G) — `deckent bot listen` host command.
 *
 * The long-lived host for inbound approve/reject commands. Parks (autonomous-loop
 * triggers, nervous timeouts) outlive a single sprint, so the inbound poller needs
 * a host that outlives them too. The resolver writes DURABLE artifacts
 * (decisions.json / IPC queue) so a reply resolves a real parked gate even across
 * process restarts — the poller only has to be alive at reply time.
 *
 * i18n-first: all operator output via getMessage (en/tr). String-free transport
 * lives in connector-bootstrap; this command injects labels + lifecycle.
 */

import type { Command } from 'commander';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { loadConfig } from '../../core/config.js';
import { loadDeckSecrets } from '../../core/deck-file.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import {
  bootstrapConnectorCommands,
  type ConnectorCommandsHandle,
} from '../../connectors/connector-bootstrap.js';
import { makeChatResponder } from '../../connectors/chat-bridge.js';
import { createArtifactStore } from '../../connectors/capabilities/artifacts.js';
import { createVoiceAdapter } from '../../connectors/voice/types.js';
import { checkVoiceHealth } from '../../connectors/voice/health.js';
import {
  writeBotPid,
  clearBotPid,
  inspectBotPid,
  stopBot,
  startBotDaemon,
  type BotPidInspection,
  type StartBotResult,
  type StopBotResult,
} from '../../connectors/bot-daemon.js';
import type { DeckentConfig } from '../../core/types.js';
import { ApprovalRelay } from '../../core/approval-relay.js';
import { ApprovalTelegramChannel, type TelegramApprovalTransport } from '../../connectors/approval-telegram.js';
import {
  attachConfiguredApprovalChannels,
  type ApprovalClientsWireTransports,
} from '../../connectors/approval-clients-wire.js';
import { openApprovalAuthorityRuntime, type ApprovalAuthorityRuntimeOpenResult } from '../../core/approval-authority-runtime.js';
import { ChannelLiveApprovalAuthenticator, channelTierFor } from '../../core/approval-channel-authenticator.js';
import { resolveShortCode } from '../../core/approval-short-code.js';
import { createApprovalStoreWatch, type ApprovalStoreWatchHandle } from '../../core/approval-store-watch.js';
import type { ApprovalDecisionIngressOutcome } from '../../core/approval-decision-ingress.js';
import type { BrkDecider, ConnectorCommandsDeps } from '../../connectors/connector-bootstrap.js';
import { createNervousSystemIfEnabled } from '../../nervous/bootstrap.js';
import { getSprintStateSnapshot } from '../../orchestra/sprint-state-tracker.js';

export interface BotListenOptions {
  root?: string;
  lang?: string;
  /** Test seam: bring up the inbound connectors. Default: real disk-backed bootstrap. */
  bootstrap?: (
    root: string,
    notifyConnectors: DeckentConfig['notify_connectors'],
    approvalDeps?: Pick<ConnectorCommandsDeps, 'brkDecider' | 'onConnectorReady'>,
  ) => Promise<ConnectorCommandsHandle>;
  /** Optional pre-built approval clients; missing transports are skipped fail-soft. */
  approvalTransports?: ApprovalClientsWireTransports;
  /** Hermetic authority-runtime seam. */
  openApprovalRuntime?: (input: { projectRoot: string; tenantId: string }) => ApprovalAuthorityRuntimeOpenResult;
  /** Test seam: block until stopped. Default: resolve on SIGINT/SIGTERM. */
  waitForever?: () => Promise<void>;
  /** Output sink (default: console.log) — injectable for tests. */
  print?: (line: string) => void;
}

interface BotCommandOptions {
  root?: string;
  lang?: string;
  print?: (line: string) => void;
}

interface BotStartOptions extends BotCommandOptions {
  start?: (root: string) => StartBotResult;
}

interface BotStopOptions extends BotCommandOptions {
  stop?: (root: string) => StopBotResult;
}

interface BotStatusOptions extends BotCommandOptions {
  inspect?: (root: string) => BotPidInspection;
}

interface BotApprovalConfig {
  approval?: {
    relay_enabled?: boolean;
    authority?: { enabled?: boolean; tenant_id?: string };
  };
  approval_channels?: Parameters<typeof attachConfiguredApprovalChannels>[1] extends infer T
    ? T extends { approval_channels?: infer C } ? C : never
    : never;
}

interface BotApprovalRelayHandle {
  readonly relay: ApprovalRelay;
  readonly brkDecider: BrkDecider;
  attachTelegram(transport: TelegramApprovalTransport, channelId: string): void;
  dispose(): void;
}

function renderChannelDecision(
  outcome: ApprovalDecisionIngressOutcome,
  lang: string,
  requestId: string,
): string {
  switch (outcome.kind) {
    case 'decided':
      return getMessage('approval.channel.decided', lang, { id: requestId });
    case 'idempotent':
      return getMessage('approval.channel.idempotent', lang, { id: requestId });
    case 'expired':
      return getMessage('approval.channel.expired', lang, { id: requestId });
    case 'rejected':
      return getMessage(
        outcome.reason === 'unauthorized'
          ? 'approval.channel.unauthorized'
          : 'approval.channel.rejected',
        lang,
        { id: requestId, reason: outcome.reason },
      );
  }
}

/** Flag-gated composition root for the bot-hosted approval relay and authority. */
export function setupBotApprovalRelay(input: {
  root: string;
  config: DeckentConfig;
  lang: string;
  print: (line: string) => void;
  transports?: ApprovalClientsWireTransports;
  openRuntime?: (input: { projectRoot: string; tenantId: string }) => ApprovalAuthorityRuntimeOpenResult;
}): BotApprovalRelayHandle | null {
  const rawConfig = input.config as DeckentConfig & BotApprovalConfig;
  if (rawConfig.approval?.relay_enabled !== true || rawConfig.approval.authority?.enabled !== true) {
    return null;
  }
  const opened = (input.openRuntime ?? openApprovalAuthorityRuntime)({
    projectRoot: input.root,
    tenantId: rawConfig.approval.authority.tenant_id ?? 'main',
  });
  if (opened.state !== 'ready') {
    input.print(getMessage('approval.channel.runtime_hold', input.lang, {
      reason: opened.reasonCode,
      detail: opened.detailCode,
    }));
    return null;
  }

  const service = opened.service;
  const relay = new ApprovalRelay(
    service.broker,
    undefined,
    (decision) => getMessage('approval.channel.cross_decided', input.lang, { channel: decision.channel }),
  );
  relay.on('channel-error', ({ channel, error }) => {
    input.print(getMessage('approval.channel.transport_error', input.lang, {
      channel,
      detail: error instanceof Error ? error.message : String(error),
    }));
  });

  const consumedNonces = new Set<string>();
  const brkDecider: BrkDecider = async (parsed, chatCtx) => {
    const resolution = resolveShortCode(
      parsed.shortCode,
      service.broker.list('pending').map((request) => request.id),
    );
    if (resolution.state === 'ambiguous') {
      return getMessage('approval.channel.ambiguous', input.lang, {
        code: parsed.shortCode,
        ids: resolution.ids.join(', '),
      });
    }
    if (resolution.state === 'unknown') {
      return getMessage('approval.channel.unknown', input.lang, { code: parsed.shortCode });
    }
    const pendingRequest = service.broker.getRequest(resolution.id);
    if (pendingRequest && channelTierFor(pendingRequest.risk) === 'critical') {
      return getMessage('approval.channel.critical_cli_only', input.lang, { id: parsed.shortCode });
    }
    const principal = chatCtx.resolvePrincipal();
    if (!principal) {
      return getMessage('approval.channel.unauthorized', input.lang, { id: resolution.id });
    }
    const bindingDigest = createHash('sha256')
      .update([chatCtx.connector, chatCtx.channelId, principal.tenantId, principal.userId, principal.role].join('\0'))
      .digest('hex');
    const authenticator = new ChannelLiveApprovalAuthenticator({
      connector: chatCtx.connector,
      principal: { userId: principal.userId, role: principal.role },
      chatKey: chatCtx.connector + ':' + chatCtx.channelId,
      bindingDigest,
      nonce: parsed.nonce,
      isAuthorized: () => chatCtx.isAuthorized(),
      consumeNonce: (nonce) => {
        if (consumedNonces.has(nonce)) return false;
        consumedNonces.add(nonce);
        return true;
      },
    });
    const outcome = await service.decideChannel(input.root, authenticator, {
      requestId: resolution.id,
      action: parsed.action === 'approve' ? 'allow' : 'deny',
      idempotencyKey: 'channel:' + chatCtx.connector + ':' + chatCtx.channelId + ':' + parsed.nonce,
    });
    return renderChannelDecision(outcome, input.lang, resolution.id);
  };

  const transports = input.transports ?? {};
  attachConfiguredApprovalChannels(
    relay,
    { approval_channels: rawConfig.approval_channels },
    { slack: transports.slack, teams: transports.teams },
  );
  const watch: ApprovalStoreWatchHandle = createApprovalStoreWatch(
    join(input.root, '.deckent', 'approvals'),
    {
      onPending: (request) => service.broker.emit('pending', request),
      onDecided: (_id, decision) =>
        service.broker.emit('decided', decision, service.broker.getRequest(decision.requestId) ?? undefined),
    },
  );

  return {
    relay,
    brkDecider,
    attachTelegram(transport, channelId) {
      if (relay.channelNames.includes('telegram')) return;
      const pushTransport: TelegramApprovalTransport = {
        sendMessage: (message) => transport.sendMessage(message),
        onCallback: () => {},
        ...(transport.sendMessageReturningId
          ? { sendMessageReturningId: (message) => transport.sendMessageReturningId!(message) }
          : {}),
        ...(transport.editMessage
          ? { editMessage: (cid, mid, text, mode) => transport.editMessage!(cid, mid, text, mode) }
          : {}),
      };
      relay.attachChannel('telegram', new ApprovalTelegramChannel({
        transport: pushTransport,
        channelId,
        lang: input.lang,
      }));
      for (const request of service.broker.list('pending')) service.broker.emit('pending', request);
    },
    dispose() {
      watch.dispose();
      relay.dispose();
      service.close();
    },
  };
}

export async function handleBotListen(opts: BotListenOptions = {}): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const print = opts.print ?? ((line: string): void => console.log(line));

  const config = await loadConfig(root);

  // Hoist deck secrets read to handleBotListen scope so BOTH the bootstrap closure
  // (voiceAdapter construction) and the post-bootstrap voice health-check can share
  // the same single disk read. Gate: read only when caps are on — when caps are off,
  // neither the voiceAdapter nor the health-check path ever uses deck secrets.
  const capsOn = !!config.bot_capabilities?.enabled;
  const deckSecrets: Record<string, string> = capsOn ? loadDeckSecrets(root) : {};

  const bootstrap =
    opts.bootstrap ??
    ((r, n, approvalDeps): Promise<ConnectorCommandsHandle> => {
      // Per-channel map of in-flight partial sinks: keyed by channelId, holds the
      // onPartial callback supplied by the streaming path in connector-bootstrap so
      // the responder's output hook reaches the right active Telegram edit closure.
      const partialSinks = new Map<string, (t: string) => void>();

      // Finding 1 fix — single shared artifact store per bot.ts lifecycle.
      // Constructed once here and passed to BOTH makeChatResponder (artifacts dep)
      // AND bootstrapConnectorCommands (artifacts dep) so screenshot artifacts
      // registered during a chat turn are resolvable by send_mail on the approve-path.
      // Gated on bot_capabilities being enabled (default-off: undefined store when off).
      const artifactStore = config.bot_capabilities?.enabled
        ? createArtifactStore(r)
        : undefined;

      // Finding 2 fix — single shared voice adapter per bot.ts lifecycle.
      // createVoiceAdapter returns null when disabled/misconfigured — default-off is
      // byte-identical. Deck secrets are captured from outer scope (deckSecrets, hoisted
      // above) so no second loadDeckSecrets disk read occurs here.
      const voiceAdapter = capsOn
        ? createVoiceAdapter(
            config.bot_capabilities?.voice ?? { enabled: false },
            deckSecrets,
          )
        : null;

      // Build ONE warm responder shared by both the streaming path (onChatStreaming)
      // and the non-streaming fallback (chat), so the agentic persistent child is
      // never duplicated. The onPartial hook dispatches into the per-channel sink
      // map; sinks are set/cleared by onChatStreaming around each turn.
      // Full conversational head with model-driven actions (slice 2): the agentic
      // provider can call tools; the gated dispatcher auto-runs read-only ones and
      // PARKS risky ones for phone approval (approve <id>) — no destructive
      // action ever executes without explicit human approval.
      const responder = makeChatResponder({
        agentic: true,
        root: r,
        lang,
        onPartial: (sid, txt) => partialSinks.get(sid)?.(txt),
        capConfig: config.bot_capabilities,
        // Finding 1: thread the shared artifact store into the responder so
        // screenshot artifacts are registered into the SAME instance that
        // bootstrapConnectorCommands uses for send_mail resolution.
        ...(artifactStore !== undefined ? { artifacts: artifactStore } : {}),
        // capConnector is intentionally omitted here — the per-turn connector is
        // threaded live via the 3rd/4th arg of ChatResponder / ChatStreamResponder
        // (Slice 1.1). bootstrapConnectorCommands passes connector as mediaConnector
        // when invoking chat()/onChatStreaming(), so the mediaSink is built from the
        // correct per-turn connector at call time. No static capConnector needed.
      });

      return bootstrapConnectorCommands(r, n, {
        chat: responder,
        // Slice 1.1: forward the per-turn mediaConnector (4th arg from bootstrap) into
        // the responder call so capability media reaches the right connector transport.
        onChatStreaming: (channelId, text, onPartial, mediaConnector, detectedLang, principal) => {
          partialSinks.set(channelId, onPartial);
          // Forward the per-message principal (5th responder arg) so a chat-turn
          // capability runs under / parks with the requester's RBAC (ADR-092).
          // detectedLang is forwarded for parity (responder ignores it). Identity-
          // disabled → principal undefined → behavior unchanged.
          return responder(channelId, text, mediaConnector, detectedLang, principal).finally(() => {
            partialSinks.delete(channelId);
          });
        },
        botCapabilities: config.bot_capabilities,
        // ADR-092 I-1 (final review): thread the per-user identity config into the
        // bootstrap so config.identity.channels bindings are seeded and the L2 RBAC
        // gate activates on the live path (it was previously inert — never wired).
        // Guarded by presence → identity absent = byte-for-byte the legacy path.
        ...(config.identity ? { identityCfg: config.identity } : {}),
        // Finding 1: pass the shared store so bootstrap uses the SAME instance
        // (not a fresh internal one) — send_mail can resolve screenshot artifacts.
        ...(artifactStore !== undefined ? { artifacts: artifactStore } : {}),
        // Finding 2: pass the shared voice adapter — bootstrap's handleInboundVoice
        // and tryReplyWithVoice now use this instance (previously always null).
        voiceAdapter,
        ...(approvalDeps?.brkDecider ? { brkDecider: approvalDeps.brkDecider } : {}),
        ...(approvalDeps?.onConnectorReady ? { onConnectorReady: approvalDeps.onConnectorReady } : {}),
      });
    });
  const approvalRelay = setupBotApprovalRelay({
    root,
    config,
    lang,
    print,
    transports: opts.approvalTransports,
    openRuntime: opts.openApprovalRuntime,
  });
  const handle = approvalRelay
    ? await bootstrap(root, config.notify_connectors, {
        brkDecider: approvalRelay.brkDecider,
        onConnectorReady: (id, connector, chatId) => {
          if (id === 'telegram') {
            approvalRelay.attachTelegram(connector as unknown as TelegramApprovalTransport, chatId);
          }
        },
      })
    : await bootstrap(root, config.notify_connectors);

  // Voice health-check: when voice is explicitly enabled, verify the backend is
  // reachable on start-up. Non-fatal — the bot continues regardless (Pillar-1
  // runtime degrade covers transcribe/synthesize failures). Default-off: deck
  // secrets are NOT read unless voice is actually enabled (gate: capsOn above).
  // deckSecrets reused from outer scope — no second loadDeckSecrets disk read.
  if (config.bot_capabilities?.voice?.enabled) {
    const health = await checkVoiceHealth(config.bot_capabilities.voice, deckSecrets);
    if (!health.ok) {
      print(
        getMessage('voice.wrapper_unreachable', lang, {
          provider: health.provider,
          url: health.url ?? '',
          detail: health.detail ?? '',
        }),
      );
    }
  }

  if (handle.active.length === 0) {
    print(getMessage('bot.listen_none', lang));
    await handle.dispose();
    approvalRelay?.dispose();
    return;
  }

  print(getMessage('bot.listen_active', lang, { connectors: handle.active.join(', ') }));

  // Record this listener's pid so `bot status`/`bot stop` can manage it, whether
  // it was launched via `bot start` (detached) or `bot listen` directly.
  if (!writeBotPid(root)) {
    print(getMessage('bot.daemon_pid_record_failed', lang));
    process.exitCode = 1;
    await handle.dispose();
    approvalRelay?.dispose();
    return;
  }

  // executor-always-live yan-fix: the bot is the always-on process, so it hosts
  // the nervous system (observer + executor + IPC poll + heartbeat). This makes
  // cross-source approvals (bot / CLI / MCP) consumable + acked even when no sprint
  // or `deckent autonomous` is running — closing the idle gap where an accept only
  // hit the CLI dismiss-fallback. The single-owner guard inside
  // createNervousSystemIfEnabled prevents a duplicate observer if a sprint later
  // hosts its own (first-to-start wins). Returns null when nervous is disabled.
  const nervousHandle = createNervousSystemIfEnabled(
    config as unknown as DeckentConfig,
    root,
    () => getSprintStateSnapshot(root),
    undefined, // default actionHandler (the real handlers)
    { observerActiveInAnyPhase: true }, // bot has no hosted sprint → fire in any phase
  );
  if (nervousHandle) {
    print(getMessage('bot.nervous_active', lang));
  }

  const wait = opts.waitForever ?? waitForSignal;
  try {
    await wait();
  } finally {
    // Each disposal step is best-effort here: this listener's pid record is
    // this process's own to retire, and a connector/nervous disposal failure
    // during SIGTERM-triggered shutdown must never leave it behind (ADR-G-013
    // pid hygiene) — the whole point of a graceful path over an operator's
    // OS-level `kill` fallback is that pid cleanup actually runs.
    try {
      nervousHandle?.dispose();
    } catch { /* pid cleanup below must still run */ }
    try {
      await handle.dispose();
    } catch { /* pid cleanup below must still run */ }
    try {
      approvalRelay?.dispose();
    } catch { /* pid cleanup below must still run */ }
    clearBotPid(root);
    print(getMessage('bot.listen_stopped', lang));
  }
}

/** `deckent bot start` — run the listener detached (always-on while the box is up). */
export function handleBotStart(opts: BotStartOptions = {}): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const print = opts.print ?? ((line: string): void => console.log(line));
  const res = (opts.start ?? startBotDaemon)(root);
  if (res.status === 'already-running') {
    print(getMessage('bot.daemon_already', lang, { pid: String(res.pid) }));
  } else if (res.status === 'ownership-unknown') {
    print(getMessage('bot.daemon_ownership_unknown', lang, {
      pid: res.pid === null ? 'unknown' : String(res.pid),
      reason: res.reason,
    }));
    process.exitCode = 1;
  } else if (res.status === 'spawn-failed') {
    print(getMessage('bot.daemon_spawn_failed', lang));
    process.exitCode = 1;
  } else {
    print(getMessage('bot.daemon_started', lang, { pid: String(res.pid) }));
    print(getMessage('bot.daemon_reboot_note', lang));
  }
}

/** `deckent bot stop` — stop a running bot daemon. */
export function handleBotStop(opts: BotStopOptions = {}): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const print = opts.print ?? ((line: string): void => console.log(line));
  const res = (opts.stop ?? stopBot)(root);
  if (res.status === 'ownership-unknown') {
    print(getMessage('bot.daemon_ownership_unknown', lang, {
      pid: res.pid === null ? 'unknown' : String(res.pid),
      reason: res.reason,
    }));
    process.exitCode = 1;
    return;
  }
  print(res.status === 'stopped'
    ? getMessage('bot.daemon_stopped', lang, { pid: String(res.pid) })
    : getMessage('bot.daemon_not_running', lang));
}

/** `deckent bot status` — report whether the bot daemon is running. */
export function handleBotStatus(opts: BotStatusOptions = {}): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const print = opts.print ?? ((line: string): void => console.log(line));
  const inspection = (opts.inspect ?? inspectBotPid)(root);
  if (inspection.status === 'ownership-unknown') {
    print(getMessage('bot.daemon_ownership_unknown', lang, {
      pid: inspection.pid === null ? 'unknown' : String(inspection.pid),
      reason: inspection.reason,
    }));
    process.exitCode = 1;
    return;
  }
  print(inspection.status === 'running'
    ? getMessage('bot.daemon_status_running', lang, {
      pid: String(inspection.pid),
    })
    : getMessage('bot.daemon_not_running', lang));
}

/** Block until SIGINT/SIGTERM, then resolve (handlers cleaned up). */
function waitForSignal(): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

export function registerBot(program: Command): void {
  const cmd = program
    .command('bot')
    .description(getMessage('bot.group_desc', getLanguage(undefined)));

  cmd
    .command('listen')
    .description(getMessage('bot.listen_desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('bot.root_option', getLanguage(undefined)))
    .option('--lang <code>', getMessage('bot.lang_option', getLanguage(undefined)))
    .action(async (opts: { root?: string; lang?: string }) => {
      await handleBotListen(opts);
    });

  cmd
    .command('start')
    .description(getMessage('bot.daemon_desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('bot.root_option', getLanguage(undefined)))
    .option('--lang <code>', getMessage('bot.lang_option', getLanguage(undefined)))
    .action((opts: { root?: string; lang?: string }) => { handleBotStart(opts); });

  cmd
    .command('stop')
    .description(getMessage('bot.stop_desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('bot.root_option', getLanguage(undefined)))
    .option('--lang <code>', getMessage('bot.lang_option', getLanguage(undefined)))
    .action((opts: { root?: string; lang?: string }) => { handleBotStop(opts); });

  cmd
    .command('status')
    .description(getMessage('bot.status_desc', getLanguage(undefined)))
    .option('--root <path>', getMessage('bot.root_option', getLanguage(undefined)))
    .option('--lang <code>', getMessage('bot.lang_option', getLanguage(undefined)))
    .action((opts: { root?: string; lang?: string }) => { handleBotStatus(opts); });
}
