import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { searchMemory } from '../../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';
import { detectLang } from '../helpers/i18n.js';

export function registerRecall(program: Command): void {
  program
    .command('recall')
    .argument('<query>', memoryCatalogMessage('cli.memcat.recall.arg.query', getLanguage(undefined)))
    .description(getMessage('cli.recall.desc', getLanguage(undefined)))
    .option('-t, --type <types>', memoryCatalogMessage('cli.memcat.recall.opt.type', getLanguage(undefined)), '')
    .option('-n, --limit <n>', memoryCatalogMessage('cli.memcat.recall.opt.limit', getLanguage(undefined)), '5')
    .option('--sprint-min <n>', memoryCatalogMessage('cli.memcat.recall.opt.sprint_min', getLanguage(undefined)))
    .option('-m, --mode <mode>', memoryCatalogMessage('cli.memcat.recall.opt.mode', getLanguage(undefined)), 'or')
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .addHelpText('after', memoryCatalogMessage('cli.memcat.recall.help.paths', getLanguage(undefined)))
    .action((query: string, opts) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError(getMessage('recall.db_not_found', lang));
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const types = opts.type ? opts.type.split(',').filter(Boolean) : undefined;
        const mode = opts.mode === 'and' ? 'and' as const : 'or' as const;
        const results = searchMemory(store, {
          text: query,
          type: types,
          limit: parseInt(opts.limit, 10) || 5,
          sprint_range: opts.sprintMin ? { min: parseInt(opts.sprintMin, 10) } : undefined,
          mode,
        });

        if (opts.json) {
          print(JSON.stringify(results.map((r) => ({
            type: r.entry.type,
            title: r.entry.title,
            sprintId: r.entry.sprint_id,
            summary: r.entry.summary,
            snippet: r.snippet,
          }))));
          return;
        }

        if (results.length === 0) {
          print(getMessage('recall.no_results', lang, { query }));
          return;
        }

        print(getMessage('recall.results_header', lang, { count: String(results.length), query }));
        for (let i = 0; i < results.length; i++) {
          const r = results[i]!;
          const sprint = r.entry.sprint_id ? ` (${r.entry.sprint_id})` : '';
          print(`  ${i + 1}. [${r.entry.type}] ${r.entry.title}${sprint}`);
          if (r.snippet) print(`     ${r.snippet.replace(/>>>/g, '\x1b[1m').replace(/<<</g, '\x1b[0m')}`);
          if (r.entry.summary) print(`     ${r.entry.summary}`);
          print('');
        }
      } finally {
        store.close();
      }
    });
}
