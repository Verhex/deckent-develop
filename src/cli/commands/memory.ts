import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { parseDecisionsMd, parseMemoryMd, parseDebtMd } from '../../core/memory-import.js';
import { exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd } from '../../core/memory-export.js';
import { BRAIN_DIR, MEMORY_DB_FILE, MEMORY_EXPORTS_DIR } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';

export function registerMemory(program: Command): void {
  const mem = program.command('memory').description('Memory V2 management');

  mem.command('rebuild')
    .description('Rebuild memory.db from .brain/exports/*.md files')
    .action(() => {
      const root = resolveProjectRoot();
      const brainDir = join(root, BRAIN_DIR);
      const exportsDir = join(brainDir, MEMORY_EXPORTS_DIR);
      const dbPath = join(brainDir, MEMORY_DB_FILE);

      if (existsSync(dbPath)) {
        printError('memory.db already exists. Delete it first to rebuild.');
        return;
      }

      if (!existsSync(exportsDir)) {
        printError('No exports directory found. Cannot rebuild without .brain/exports/*.md files.');
        return;
      }

      const store = new MemoryStore(dbPath);
      let count = 0;

      try {
        // Import from exported .md files
        const decisionsPath = join(exportsDir, 'decisions.md');
        if (existsSync(decisionsPath)) {
          const entries = parseDecisionsMd(readFileSync(decisionsPath, 'utf-8'));
          for (const e of entries) { store.insert(e); count++; }
          print(`  ADRs: ${entries.length}`);
        }

        const memoryPath = join(exportsDir, 'memory.md');
        if (existsSync(memoryPath)) {
          const entries = parseMemoryMd(readFileSync(memoryPath, 'utf-8'));
          for (const e of entries) { store.insert(e); count++; }
          print(`  Memory: ${entries.length}`);
        }

        const debtPath = join(exportsDir, 'debt.md');
        if (existsSync(debtPath)) {
          const entries = parseDebtMd(readFileSync(debtPath, 'utf-8'));
          for (const e of entries) { store.insert(e); count++; }
          print(`  Debt: ${entries.length}`);
        }

        // Also try original .brain/ files as secondary source
        const origDecisions = join(brainDir, 'DECISIONS.md');
        if (count === 0 && existsSync(origDecisions)) {
          const entries = parseDecisionsMd(readFileSync(origDecisions, 'utf-8'));
          for (const e of entries) { store.insert(e); count++; }
          print(`  ADRs (from original): ${entries.length}`);
        }

        print(`\n  Rebuilt memory.db with ${count} entries.`);
      } finally {
        store.close();
      }
    });

  mem.command('export')
    .description('Export memory.db to .brain/exports/*.md')
    .action(() => {
      const root = resolveProjectRoot();
      const brainDir = join(root, BRAIN_DIR);
      const exportsDir = join(brainDir, MEMORY_EXPORTS_DIR);
      const dbPath = join(brainDir, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError('memory.db not found. Run migration first.');
        return;
      }

      mkdirSync(exportsDir, { recursive: true });
      const store = new MemoryStore(dbPath);
      try {
        writeFileSync(join(exportsDir, 'summary.md'), exportSummaryMd(store));
        writeFileSync(join(exportsDir, 'decisions.md'), exportDecisionsMd(store));
        writeFileSync(join(exportsDir, 'memory.md'), exportMemoryMd(store));
        writeFileSync(join(exportsDir, 'debt.md'), exportDebtMd(store));
        print('  Exported 4 .md files to .brain/exports/');
      } finally {
        store.close();
      }
    });

  mem.command('stats')
    .description('Show memory.db statistics')
    .action(() => {
      const root = resolveProjectRoot();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError('memory.db not found.');
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const counts = store.countByType();
        const total = store.totalCount();
        print('\n  Memory V2 Statistics:');
        for (const [type, count] of counts) {
          print(`    ${type}: ${count}`);
        }
        print(`    ────────────`);
        print(`    Total: ${total}`);
        print(`    Schema: v${store.getSchemaVersion()}`);
      } finally {
        store.close();
      }
    });
}
