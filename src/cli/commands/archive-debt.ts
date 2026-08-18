import type { Command } from 'commander';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getDebtItems } from '../../core/debt-store.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

/**
 * `deckent archive-debt` — report tech-debt status from the Memory V2 DB.
 *
 * Task #4f (saf DB-first): tech debt lives in `memory.db` (`type=debt`
 * entries). Resolved debt is a status flag and is pruned automatically by
 * sprint decay. The legacy root `.brain/DEBT.md` file and the separate
 * `DEBT-ARCHIVE.md` were removed — there is no longer a file to "archive",
 * so this command is now a read-only reporter.
 */
export function registerArchiveDebt(program: Command): void {
  program
    .command('archive-debt')
    .description(getMessage('cli.archive_debt.desc', getLanguage(undefined)))
    .option('--count', 'Show only the open/resolved counts')
    .option('--before <sprint>', 'Also report resolved items originating before this sprint ID')
    .action((opts: { count?: boolean; before?: string }) => {
      const root = resolveProjectRoot();
      const all = getDebtItems(root);
      const resolved = all.filter(r => r.resolved);
      const open = all.filter(r => !r.resolved);

      print(`Tech debt (memory.db): ${open.length} open, ${resolved.length} resolved.`);

      if (opts.before) {
        const beforeNum = parseInt(opts.before.replace(/\D/g, ''), 10);
        if (!Number.isNaN(beforeNum)) {
          const older = resolved.filter(r => {
            const n = parseInt(r.originSprintId.replace(/\D/g, ''), 10);
            return !Number.isNaN(n) && n < beforeNum;
          });
          print(`${older.length} resolved item(s) originate before ${opts.before}.`);
        }
      }

      if (!opts.count) {
        print('Resolved debt is retained in memory.db and pruned by sprint decay —');
        print('no manual archival step is needed (Task #4f, saf DB-first).');
      }
    });
}
