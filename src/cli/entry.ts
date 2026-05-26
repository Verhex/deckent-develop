#!/usr/bin/env node

import { buildProgram } from './index.js';
import { handleCliError } from './helpers/process.js';
import { interruptActiveSprint } from '../orchestra/sprint-controller.js';
import { killAllSessions } from '../orchestra/tmux.js';
import { bootstrapFromCatalog } from '../core/model-catalog.js';

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
buildProgram()
  .hook('preAction', async () => {
    await bootstrapFromCatalog({ offline: process.env['DECKENT_OFFLINE'] === '1' });
  })
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    handleCliError(err);
  });
