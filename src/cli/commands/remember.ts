import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';
import { detectLang } from '../helpers/i18n.js';

export function registerRemember(program: Command): void {
  program
    .command('remember')
    .argument('<note>', memoryCatalogMessage('cli.memcat.remember.arg.note', getLanguage(undefined)))
    .description(getMessage('cli.remember.desc', getLanguage(undefined)))
    .option('-t, --type <type>', memoryCatalogMessage('cli.memcat.remember.opt.type', getLanguage(undefined)), 'memory')
    .option('--tags <tags>', memoryCatalogMessage('cli.memcat.remember.opt.tags', getLanguage(undefined)), '')
    .option('--title <title>', memoryCatalogMessage('cli.memcat.remember.opt.title', getLanguage(undefined)))
    .addHelpText('after', memoryCatalogMessage('cli.memcat.remember.help.paths', getLanguage(undefined)))
    .action((note: string, opts) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError(getMessage('remember.db_not_found', lang));
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const id = `user-${Date.now()}`;
        const title = opts.title || note.slice(0, 60) + (note.length > 60 ? '...' : '');
        const tags = opts.tags ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

        store.insert({
          id,
          type: opts.type,
          source: 'user',
          title,
          content: note,
          tags,
        });

        print(getMessage('remember.stored', lang, { type: String(opts.type), title }));
        if (tags.length > 0) print(getMessage('remember.tags', lang, { tags: tags.join(', ') }));
      } finally {
        store.close();
      }
    });
}
