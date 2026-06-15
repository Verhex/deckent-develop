// ═══ Notify Bootstrap — Backend-Agnostic NotifyDispatcher Wiring ══════════════
// WIRE-001 (MASTER-PLAN §4G — Human-Interaction Wire). Extracts the dispatcher
// construction out of mcp/server.ts so ANY entry point can wire the
// DECKENT→USER:NOTIFY channel to the operator's terminal:
//   - the MCP host (passes its McpNotificationAdapter as an extra adapter),
//   - a pure-CLI `deckent start` sprint,
//   - the detached sprint-runner-entry child process.
//
// Before this, initializeNotifyDispatcher lived ONLY in mcp/server.ts, so a
// pure-CLI sprint had a null global dispatcher and every notify() (task-done,
// sprint-finalized, human-checkpoint-required) was a silent no-op — the
// "safe-but-deaf" gap (MASTER-PLAN §4G / W-L).
//
// String-free mechanism module: it constructs adapters only and emits no
// user-facing text, so no i18n surface is introduced here.

import { join } from 'node:path';
import { DECKENT_DIR } from './constants.js';
import {
  NotifyDispatcher,
  type NotificationAdapter,
} from './notification-dispatcher.js';
import { CliNotificationAdapter } from './notify-adapters/cli-adapter.js';
import { FileNotificationAdapter } from './notify-adapters/file-adapter.js';
import { setGlobalNotifyDispatcher } from './notify-registry.js';

/** Audit-trail JSONL filename for the file adapter (under <root>/.deckent/). */
export const NOTIFY_LOG_FILE = 'notify-log.jsonl' as const;

/** Default throttle window for non-critical notifications (1s — Alperen Q5). */
export const DEFAULT_NOTIFY_THROTTLE_MS = 1000 as const;

export interface NotifyBootstrapOptions {
  /** Project root — the file adapter writes to <root>/.deckent/notify-log.jsonl. */
  projectRoot: string;
  /**
   * Extra adapters appended after the CLI adapter and before the file adapter.
   * The MCP host passes its McpNotificationAdapter here; pure-CLI passes none.
   */
  extraAdapters?: NotificationAdapter[];
  /** Throttle window for non-critical notifications (ms). Default 1000. */
  throttleMs?: number;
}

/**
 * Construct a NotifyDispatcher (CLI parent-TTY → optional extras → file JSONL)
 * and register it as the process-global dispatcher so notify() delivers.
 *
 * Adapter order is CLI → extraAdapters → file, matching the original MCP wiring
 * exactly, so the MCP host's behavior is unchanged when it passes its adapter.
 *
 * Sets DECKENT_PARENT_PID (only when unset) so CliNotificationAdapter can resolve
 * the parent terminal's stdout fd on Linux; it never overrides an inherited value.
 *
 * Replaces any previously-registered global dispatcher. The `deckent` and
 * `deckent-mcp` bins never share a process (package.json separate bins), so no
 * cross-surface clobber occurs; each call builds a fresh dispatcher, so adapters
 * are never double-registered.
 */
export function bootstrapNotifyDispatcher(
  options: NotifyBootstrapOptions,
): NotifyDispatcher {
  if (!process.env['DECKENT_PARENT_PID']) {
    process.env['DECKENT_PARENT_PID'] = String(process.ppid);
  }

  const dispatcher = new NotifyDispatcher(
    options.throttleMs ?? DEFAULT_NOTIFY_THROTTLE_MS,
  );

  const cliAdapter = new CliNotificationAdapter();
  dispatcher.addAdapter(cliAdapter);
  const extras = options.extraAdapters ?? [];
  for (const adapter of extras) {
    dispatcher.addAdapter(adapter);
  }
  const fileAdapter = new FileNotificationAdapter(
    join(options.projectRoot, DECKENT_DIR, NOTIFY_LOG_FILE),
  );
  dispatcher.addAdapter(fileAdapter);

  setGlobalNotifyDispatcher(dispatcher);

  // W2 — notify-init breadcrumb (DECKENT_DEBUG only, stderr; never .brain/ERRORS.md):
  // list the wired adapters so an operator can confirm whether the connector
  // (Telegram/Discord = 'connector-broadcast') is in the chain — the diagnosis for
  // the "safe-but-deaf" silent-notify gap. Without an extra, the chain is just
  // cli-parent-tty + file-jsonl → notify never reaches the operator's phone.
  if (process.env['DECKENT_DEBUG']) {
    const names = [cliAdapter.name, ...extras.map((a) => a.name), fileAdapter.name];
    process.stderr.write(`[deckent:debug] notify-bootstrap: ${names.length} adapters wired — ${names.join(', ')}\n`);
  }

  return dispatcher;
}
