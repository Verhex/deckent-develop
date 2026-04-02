import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { DIRECTIVES_FILE } from '../../core/constants.js';
import { loadConfig } from '../../core/config.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';

/**
 * Count task blocks in DIRECTIVES.md content.
 * Matches ## Task N: or ## Görev N: headers.
 */
function countTaskBlocks(content: string): number {
  return (content.match(/^##\s+(Görev|Task)\s+\d+/gm) ?? []).length;
}

/**
 * Read content from stdin (pipe support).
 * Returns a Promise that resolves with the full stdin content.
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

export function registerSetDirectives(program: Command): void {
  program
    .command('set-directives')
    .description('Write sprint goals to DIRECTIVES.md (content, file, or stdin)')
    .option('--content <string>', 'Directive content to write directly')
    .option('--file <path>', 'Read content from a file')
    .action(async (opts: { content?: string; file?: string }) => {
      const root = resolveProjectRoot();

      try {
        const config = await loadConfig(root);
        const lang = config.language;

        let content: string;

        if (opts.content !== undefined) {
          // --content flag: use directly
          content = opts.content;
        } else if (opts.file !== undefined) {
          // --file flag: read from file
          const filePath = opts.file;
          if (!existsSync(filePath)) {
            printError(new Error(getMessage('set_directives.file_not_found', lang, { path: filePath })));
            process.exitCode = 1;
            return;
          }
          content = readFileSync(filePath, 'utf-8');
        } else {
          // No flags: read from stdin (pipe support)
          if (process.stdin.isTTY) {
            printError(new Error(getMessage('set_directives.no_input', lang)));
            process.exitCode = 1;
            return;
          }
          content = await readStdin();
        }

        if (!content.trim()) {
          printError(new Error(getMessage('set_directives.empty_content', lang)));
          process.exitCode = 1;
          return;
        }

        const directivesPath = join(root, DIRECTIVES_FILE);
        writeFileSync(directivesPath, content, 'utf-8');

        const taskCount = countTaskBlocks(content);
        print(getMessage('set_directives.updated', lang, { count: String(taskCount) }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
