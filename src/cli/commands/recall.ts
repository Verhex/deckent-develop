import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { searchMemory } from '../../core/memory-query.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';

export function registerRecall(program: Command): void {
  program
    .command('recall <query>')
    .description('Search project memory — ADRs, sprint learnings, patterns, debt')
    .option('-t, --type <types>', 'Filter by type (comma-separated: adr,memory,sprint,debt,pattern)', '')
    .option('-n, --limit <n>', 'Max results', '5')
    .option('--sprint-min <n>', 'Minimum sprint number')
    .option('-m, --mode <mode>', 'FTS5 token join mode: or (default, broader) | and (all tokens must match)', 'or')
    .action((query: string, opts) => {
      const root = resolveProjectRoot();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError('Memory V2 DB not found. Run `deckent memory migrate` first.');
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

        if (results.length === 0) {
          print(`No results for "${query}".`);
          return;
        }

        print(`\n  ${results.length} result(s) for "${query}":\n`);
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
