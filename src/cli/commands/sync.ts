import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE } from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference')
    .action(() => {
      const root = resolveProjectRoot();

      if (!existsSync(join(root, DECKENT_FILE))) {
        printError(new Error('DECKENT.md not found. Run deckent init first.'));
        process.exitCode = 1;
        return;
      }

      ensureDeckentImport(join(root, CLAUDE_FILE));
      print('CLAUDE.md synced → @DECKENT.md ensured');

      ensureDeckentImport(join(root, AGENTS_FILE));
      print('AGENTS.md synced → @DECKENT.md ensured');

      print('Sync complete. Existing file contents preserved.');
    });
}
