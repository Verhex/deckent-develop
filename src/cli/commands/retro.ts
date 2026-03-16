import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, RETRO_FILE } from '../../core/constants.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function registerRetro(program: Command): void {
  program
    .command('retro')
    .description('Show the latest sprint retrospective')
    .action(() => {
      const root = resolveProjectRoot();
      const retroPath = join(root, BRAIN_DIR, RETRO_FILE);
      if (!existsSync(retroPath)) {
        print('No retrospective found. Run `deckent start` to complete a sprint first.');
        return;
      }
      const content = readFileSync(retroPath, 'utf-8');
      if (!content.trim()) {
        print('Retrospective file is empty.');
        return;
      }
      print(content);
    });
}
