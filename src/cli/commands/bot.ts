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
import { buildBotHumanizer } from '../../connectors/bot-completion.js';
import {
  writeBotPid, clearBotPid, readBotPid, stopBot, startBotDaemon,
} from '../../connectors/bot-daemon.js';
import type { DeckentConfig } from '../../core/types.js';

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
    ((r, n): Promise<ConnectorCommandsHandle> =>
      // Full conversational head with model-driven actions (slice 2): the agentic
      // provider can call tools; the gated dispatcher auto-runs read-only ones and
      // PARKS risky ones for phone approval (approve <id>) — no destructive
      // action ever executes without explicit human approval.
      bootstrapConnectorCommands(r, n, {
        chat: makeChatResponder({ agentic: true, root: r, lang }),
        humanizer: buildBotHumanizer(config as unknown as Record<string, unknown>),
      }));
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

  const wait = opts.waitForever ?? waitForSignal;
  try {
    await wait();
  } finally {
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
