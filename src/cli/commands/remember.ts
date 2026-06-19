import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';

export function registerRemember(program: Command): void {
  program
    .command('remember <note>')
    .description('Store a note in project memory')
    .option('-t, --type <type>', 'Entry type (default: memory)', 'memory')
    .option('--tags <tags>', 'Comma-separated tags', '')
    .option('--title <title>', 'Entry title (default: first 60 chars of note)')
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
