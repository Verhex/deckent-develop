#!/usr/bin/env node

import { buildProgram } from './index.js';
import { handleCliError } from './helpers/process.js';
import { interruptActiveSprint } from '../orchestra/sprint-controller.js';
import { killAllSessions } from '../orchestra/tmux.js';
import { bootstrapFromCatalog } from '../core/model-catalog.js';

// ─── Default REPL Routing (Sprint 219 T-219-001) ────────────────────────────
//
// When `deckent` is invoked with no subcommand and no help/version flag, route
// to `deckent chat --native` so the binary behaves like `claude` — opening an
// agentic REPL by default. Explicit subcommands and help/version flags are
// left untouched so existing UX is preserved.

/** Top-level flags / tokens that must short-circuit the default REPL route. */
const HELP_AND_VERSION_FLAGS: ReadonlySet<string> = new Set([
  '--help', '-h', 'help',
  '--version', '-V', '--version-json',
]);

/**
 * Decide whether the given argv should be redirected to `chat --native`.
 *
 * Pure function so tests can exercise the routing without spawning Node.
 *
 * @param argv Full argv (with argv[0]=node, argv[1]=entry script path).
 */
export function shouldLaunchDefaultRepl(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  if (args.length === 0) return true;

  for (const a of args) {
    if (HELP_AND_VERSION_FLAGS.has(a)) return false;
  }

  // Any non-flag token is treated as a subcommand candidate — pass through to
  // Commander so it can handle the dispatch (or surface a "did-you-mean"
  // error for typos). Top-level flag-only argv (e.g. `deckent --foo`) also
  // passes through so Commander can surface its unknown-option error.
  return false;
}

/**
 * Build the argv that `parseAsync` should consume. When the default REPL is
 * triggered, append `chat --native` after argv[0] and argv[1]; otherwise
 * return the original argv unchanged.
 */
export function buildEntryArgv(argv: readonly string[]): string[] {
  if (!shouldLaunchDefaultRepl(argv)) return [...argv];
  const [node = 'node', script = 'deckent'] = argv;
  return [node, script, 'chat', '--native'];
}

// ─── Node Version Guard ─────────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if ((major ?? 0) < 24) {
  process.stderr.write(
    `deckent requires Node.js >= 24 (Active LTS). Current version: ${process.versions.node}\n`,
  );
  process.exit(1);
}

// ─── Unhandled Rejections ────────────────────────────────────────────────────
process.on('unhandledRejection', (reason: unknown) => {
  handleCliError(reason);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
function onSignal(signal: string): void {
  process.stderr.write(`\nReceived ${signal}, exiting…\n`);
  if (signal === 'SIGINT') {
    // Interrupt active sprint: mark tasks INTERRUPTED, heartbeats ABORTED, release locks
    try { interruptActiveSprint(); } catch { /* non-fatal */ }
    // Kill tmux sessions used by workers
    try { killAllSessions(); } catch { /* non-fatal */ }
  }
  process.exit(0);
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

// ─── Entry ───────────────────────────────────────────────────────────────────
// Rewrite argv in place so the default-REPL route appears to Commander as a
// normal `deckent chat --native` invocation — and so downstream code that
// later inspects process.argv sees the resolved command.
process.argv = buildEntryArgv(process.argv);

buildProgram()
  .hook('preAction', async () => {
    await bootstrapFromCatalog({ offline: process.env['DECKENT_OFFLINE'] === '1' });
  })
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    handleCliError(err);
  });
