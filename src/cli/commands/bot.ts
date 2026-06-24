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
import { loadConfig } from '../../core/config.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import {
  bootstrapConnectorCommands,
  type ConnectorCommandsHandle,
} from '../../connectors/connector-bootstrap.js';
import { makeChatResponder } from '../../connectors/chat-bridge.js';
import {
  writeBotPid, clearBotPid, readBotPid, stopBot, startBotDaemon,
} from '../../connectors/bot-daemon.js';
import type { DeckentConfig } from '../../core/types.js';
import { createNervousSystemIfEnabled } from '../../nervous/bootstrap.js';
import { getSprintStateSnapshot } from '../../orchestra/sprint-state-tracker.js';

export interface BotListenOptions {
  root?: string;
  lang?: string;
  /** Test seam: bring up the inbound connectors. Default: real disk-backed bootstrap. */
  bootstrap?: (
    root: string,
    notifyConnectors: DeckentConfig['notify_connectors'],
  ) => Promise<ConnectorCommandsHandle>;
  /** Test seam: block until stopped. Default: resolve on SIGINT/SIGTERM. */
  waitForever?: () => Promise<void>;
  /** Output sink (default: console.log) — injectable for tests. */
  print?: (line: string) => void;
}

export async function handleBotListen(opts: BotListenOptions = {}): Promise<void> {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const print = opts.print ?? ((line: string): void => console.log(line));

  const config = await loadConfig(root);
  const bootstrap =
    opts.bootstrap ??
    ((r, n): Promise<ConnectorCommandsHandle> => {
      // Per-channel map of in-flight partial sinks: keyed by channelId, holds the
      // onPartial callback supplied by the streaming path in connector-bootstrap so
      // the responder's output hook reaches the right active Telegram edit closure.
      const partialSinks = new Map<string, (t: string) => void>();

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
      });

      return bootstrapConnectorCommands(r, n, {
        chat: responder,
        onChatStreaming: (channelId, text, onPartial) => {
          partialSinks.set(channelId, onPartial);
          return responder(channelId, text).finally(() => {
            partialSinks.delete(channelId);
          });
        },
      });
    });
  const handle = await bootstrap(root, config.notify_connectors);

  if (handle.active.length === 0) {
    print(getMessage('bot.listen_none', lang));
    await handle.dispose();
    return;
  }

  print(getMessage('bot.listen_active', lang, { connectors: handle.active.join(', ') }));

  // Record this listener's pid so `bot status`/`bot stop` can manage it, whether
  // it was launched via `bot start` (detached) or `bot listen` directly.
  writeBotPid(root);

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
    nervousHandle?.dispose();
    await handle.dispose();
    clearBotPid(root);
    print(getMessage('bot.listen_stopped', lang));
  }
}

/** `deckent bot start` — run the listener detached (always-on while the box is up). */
export function handleBotStart(opts: { root?: string; lang?: string } = {}): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const res = startBotDaemon(root);
  if (res.status === 'already-running') {
    console.log(getMessage('bot.daemon_already', lang, { pid: String(res.pid) }));
  } else if (res.status === 'spawn-failed') {
    console.log(getMessage('bot.daemon_spawn_failed', lang));
    process.exitCode = 1;
  } else {
    console.log(getMessage('bot.daemon_started', lang, { pid: String(res.pid) }));
    console.log(getMessage('bot.daemon_reboot_note', lang));
  }
}

/** `deckent bot stop` — stop a running bot daemon. */
export function handleBotStop(opts: { root?: string; lang?: string } = {}): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const res = stopBot(root);
  console.log(
    res.status === 'stopped'
      ? getMessage('bot.daemon_stopped', lang, { pid: String(res.pid) })
      : getMessage('bot.daemon_not_running', lang),
  );
}

/** `deckent bot status` — report whether the bot daemon is running. */
export function handleBotStatus(opts: { root?: string; lang?: string } = {}): void {
  const lang = getLanguage(opts.lang);
  const root = opts.root ?? resolveProjectRoot();
  const pid = readBotPid(root);
  console.log(
    pid !== null
      ? getMessage('bot.daemon_status_running', lang, { pid: String(pid) })
      : getMessage('bot.daemon_not_running', lang),
  );
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
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action(async (opts: { root?: string; lang?: string }) => {
      await handleBotListen(opts);
    });

  cmd
    .command('start')
    .description(getMessage('bot.daemon_desc', getLanguage(undefined)))
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { root?: string; lang?: string }) => { handleBotStart(opts); });

  cmd
    .command('stop')
    .description('Stop the bot daemon')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { root?: string; lang?: string }) => { handleBotStop(opts); });

  cmd
    .command('status')
    .description('Show whether the bot daemon is running')
    .option('--root <path>', 'Project root override')
    .option('--lang <code>', 'Language override (en|tr)')
    .action((opts: { root?: string; lang?: string }) => { handleBotStatus(opts); });
}
