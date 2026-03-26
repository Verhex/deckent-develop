import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, DEBT_FILE, ARCHIVE_DIR, DEBT_TABLE_HEADER } from '../../core/constants.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { parseDebtTable, generateDebtTable } from '../../core/utils.js';
import type { DebtItem } from '../../core/types.js';

// ─── Rotation Config ────────────────────────────────────────────────

const DEFAULT_MAX_ARCHIVE_SIZE_BYTES = 1_000_000; // 1MB

function formatDebtRow(r: DebtItem): string {
  return `| ${r.id} | ${r.description} | ${r.originTaskId} | ${r.originSprintId} | ${r.priority} | ${r.sprintsOpen} | ${r.resolved} | ${r.resolvedInSprintId ?? '-'} | ${r.createdAt} |`;
}

export function registerArchiveDebt(program: Command): void {
  program
    .command('archive-debt')
    .description('Archive resolved debt items from .brain/DEBT.md')
    .option('--dry-run', 'Preview what would be archived without making changes')
    .option('--count', 'Show count of items that would be archived and exit')
    .option('--before <sprint>', 'Only archive items from sprints before this sprint ID (e.g. sprint-050)')
    .option('--max-archive-size <bytes>', 'Max archive file size in bytes before rotation', String(DEFAULT_MAX_ARCHIVE_SIZE_BYTES))
    .action((opts: { dryRun?: boolean; count?: boolean; before?: string; maxArchiveSize?: string }) => {
      const root = resolveProjectRoot();
      const debtPath = join(root, BRAIN_DIR, DEBT_FILE);

      if (!existsSync(debtPath)) {
        print('No resolved debt items to archive.');
        return;
      }

      const content = readFileSync(debtPath, 'utf-8');
      // P) Use shared parseDebtTable from utils.ts
      const rows = parseDebtTable(content);

      let resolved = rows.filter(r => r.resolved === true);
      const unresolved = rows.filter(r => r.resolved !== true);

      // --count: just show how many would be archived and exit
      if (opts.count) {
        if (opts.before) {
          const beforeNum = parseInt(opts.before.replace(/\D/g, ''), 10);
          if (!isNaN(beforeNum)) {
            const filteredCount = resolved.filter(item => {
              const itemNum = parseInt(item.originSprintId.replace(/\D/g, ''), 10);
              return !isNaN(itemNum) && itemNum < beforeNum;
            }).length;
            print(`${filteredCount} resolved item(s) would be archived (from sprints before ${opts.before}).`);
            print(`${resolved.length - filteredCount} resolved item(s) would remain (sprint >= ${opts.before}).`);
          } else {
            print(`${resolved.length} resolved item(s) would be archived.`);
          }
        } else {
          print(`${resolved.length} resolved item(s) would be archived.`);
          print(`${unresolved.length} unresolved item(s) would remain.`);
        }
        return;
      }

      // O) --before filter: only archive items from sprints before the given sprint
      if (opts.before) {
        const beforeSprint = opts.before;
        const beforeNum = parseInt(beforeSprint.replace(/\D/g, ''), 10);

        if (!isNaN(beforeNum)) {
          const filteredResolved: DebtItem[] = [];
          const keptResolved: DebtItem[] = [];

          for (const item of resolved) {
            const itemSprintNum = parseInt(item.originSprintId.replace(/\D/g, ''), 10);
            if (!isNaN(itemSprintNum) && itemSprintNum < beforeNum) {
              filteredResolved.push(item);
            } else {
              keptResolved.push(item);
            }
          }

          if (opts.dryRun) {
            print(`[dry-run] Would archive ${filteredResolved.length} resolved item(s) from sprints before ${beforeSprint}.`);
            print(`[dry-run] ${keptResolved.length} resolved item(s) would remain (sprint >= ${beforeSprint}).`);
            print(`[dry-run] ${unresolved.length} unresolved item(s) untouched.`);
            if (filteredResolved.length > 0) {
              print('\nItems that would be archived:');
              for (const item of filteredResolved) {
                print(`  - ${item.id}: ${item.description} (sprint: ${item.originSprintId})`);
              }
            }
            return;
          }

          resolved = filteredResolved;
          // Keep the newer resolved items in the debt file
          unresolved.push(...keptResolved);
        }
      } else if (opts.dryRun) {
        print(`[dry-run] Would archive ${resolved.length} resolved item(s).`);
        print(`[dry-run] ${unresolved.length} unresolved item(s) would remain.`);
        if (resolved.length > 0) {
          print('\nItems that would be archived:');
          for (const item of resolved) {
            print(`  - ${item.id}: ${item.description} (sprint: ${item.originSprintId})`);
          }
        }
        return;
      }

      if (resolved.length === 0) {
        print('No resolved debt items to archive.');
        return;
      }

      // Write unresolved items back to DEBT.md using shared generateDebtTable
      writeFileSync(debtPath, generateDebtTable(unresolved), 'utf-8');

      // Append resolved items to archive
      const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR);
      mkdirSync(archiveDir, { recursive: true });

      // O) Rotation: check archive file size
      const maxSize = parseInt(opts.maxArchiveSize ?? String(DEFAULT_MAX_ARCHIVE_SIZE_BYTES), 10);
      const archivePath = getRotatedArchivePath(archiveDir, maxSize);

      const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
      const archiveContent = resolved.map(r => formatDebtRow(r)).join('\n') + '\n';

      if (!existsSync(archivePath)) {
        writeFileSync(archivePath, [DEBT_TABLE_HEADER, separator, ''].join('\n'), 'utf-8');
      }

      appendFileSync(archivePath, archiveContent, 'utf-8');

      print(`Archived ${resolved.length} resolved debt items. ${unresolved.length} items remaining.`);
      print(`  Archive: ${archivePath}`);
    });
}

/**
 * Get the current archive file path, rotating if it exceeds maxSize.
 * Creates numbered archive files: DEBT-ARCHIVE.md, DEBT-ARCHIVE-2.md, etc.
 */
function getRotatedArchivePath(archiveDir: string, maxSizeBytes: number): string {
  let index = 1;
  let archivePath = join(archiveDir, 'DEBT-ARCHIVE.md');

  while (existsSync(archivePath)) {
    const size = statSync(archivePath).size;
    if (size < maxSizeBytes) {
      return archivePath;
    }
    // File too large, try next rotation
    index++;
    archivePath = join(archiveDir, `DEBT-ARCHIVE-${index}.md`);
  }

  return archivePath;
}
