#!/usr/bin/env node

import { buildProgram } from './index.js';
import { handleCliError } from './helpers/process.js';

// ─── Node Version Guard ─────────────────────────────────────────────────────
const [major] = process.versions.node.split('.').map(Number);
if ((major ?? 0) < 18) {
  process.stderr.write(
    `deckent requires Node.js >= 18. Current version: ${process.versions.node}\n`,
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
  process.exit(0);
}

process.on('SIGINT', () => onSignal('SIGINT'));
process.on('SIGTERM', () => onSignal('SIGTERM'));

// ─── Entry ───────────────────────────────────────────────────────────────────
buildProgram().parseAsync(process.argv).catch((err: unknown) => {
  handleCliError(err);
});
