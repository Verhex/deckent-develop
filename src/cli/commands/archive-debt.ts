import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { BRAIN_DIR, DEBT_FILE, ARCHIVE_DIR, DEBT_TABLE_HEADER } from '../../core/constants.js';
import { print } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

interface DebtRow {
  id: string;
  description: string;
  task: string;
  sprint: string;
  priority: string;
  open: string;
  resolved: string;
  fixedIn: string;
  created: string;
}

function parseDebtRows(content: string): DebtRow[] {
  const lines = content.split('\n');
  const rows: DebtRow[] = [];
  let headerFound = false;

  for (const line of lines) {
    if (line.includes('| ID |')) { headerFound = true; continue; }
    if (!headerFound) continue;
    if (line.startsWith('|---') || line.startsWith('| ---')) continue;
    if (!line.startsWith('|')) continue;

    const cols = line.split('|').slice(1, -1).map(c => c.trim());
    if (cols.length < 9) continue;

    rows.push({
      id: cols[0]!,
      description: cols[1]!,
      task: cols[2]!,
      sprint: cols[3]!,
      priority: cols[4]!,
      open: cols[5]!,
      resolved: cols[6]!,
      fixedIn: cols[7]!,
      created: cols[8]!,
    });
  }
  return rows;
}

function formatDebtTable(rows: DebtRow[]): string {
  const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
  const lines = rows.map(r =>
    `| ${r.id} | ${r.description} | ${r.task} | ${r.sprint} | ${r.priority} | ${r.open} | ${r.resolved} | ${r.fixedIn} | ${r.created} |`,
  );
  return [DEBT_TABLE_HEADER, separator, ...lines].join('\n');
}

export function registerArchiveDebt(program: Command): void {
  program
    .command('archive-debt')
    .description('Archive resolved debt items from .brain/DEBT.md')
    .action(() => {
      const root = resolveProjectRoot();
      const debtPath = join(root, BRAIN_DIR, DEBT_FILE);

      if (!existsSync(debtPath)) {
        print('No resolved debt items to archive.');
        return;
      }

      const content = readFileSync(debtPath, 'utf-8');
      const rows = parseDebtRows(content);

      const resolved = rows.filter(r => r.resolved === 'true');
      const unresolved = rows.filter(r => r.resolved !== 'true');

      if (resolved.length === 0) {
        print('No resolved debt items to archive.');
        return;
      }

      // Write unresolved items back to DEBT.md
      writeFileSync(debtPath, formatDebtTable(unresolved), 'utf-8');

      // Append resolved items to archive
      const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR);
      const archivePath = join(archiveDir, 'DEBT-ARCHIVE.md');
      mkdirSync(archiveDir, { recursive: true });

      const archiveContent = resolved.map(r =>
        `| ${r.id} | ${r.description} | ${r.task} | ${r.sprint} | ${r.priority} | ${r.open} | ${r.resolved} | ${r.fixedIn} | ${r.created} |`,
      ).join('\n') + '\n';

      if (!existsSync(archivePath)) {
        const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
        writeFileSync(archivePath, [DEBT_TABLE_HEADER, separator, ''].join('\n'), 'utf-8');
      }

      appendFileSync(archivePath, archiveContent, 'utf-8');

      print(`Archived ${resolved.length} resolved debt items. ${unresolved.length} items remaining.`);
    });
}
