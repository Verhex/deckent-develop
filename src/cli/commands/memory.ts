import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { MemoryStore } from '../../core/memory-store.js';
import { parseDecisionsMd, parseMemoryMd, parseDebtMd } from '../../core/memory-import.js';
import { exportSummaryMd, exportDecisionsMd, exportMemoryMd, exportDebtMd } from '../../core/memory-export.js';
import { BRAIN_DIR, MEMORY_DB_FILE, MEMORY_EXPORTS_DIR } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import type { EntryRelation } from '../../core/memory-types.js';

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

  // ── Relations subcommand ──────────────────────────────────────
  const relations = mem.command('relations').description('Manage memory relations');

  relations.command('list')
    .description('List all relations in memory.db')
    .action(() => {
      const root = resolveProjectRoot();
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError('memory.db not found.');
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const count = store.countRelations();
        const db = store.getRawDb();
        const rows = db.prepare(
          `SELECT from_id, to_id, rel_type, created_at FROM relations ORDER BY created_at DESC LIMIT 50`,
        ).all() as EntryRelation[];

        print(`\n  Relations (${count} total, showing last 50):`);
        print('  ──────────────────────────────────────────');
        for (const r of rows) {
          print(`    ${r.from_id} → ${r.to_id} [${r.rel_type}]`);
        }
      } finally {
        store.close();
      }
    });

  relations.command('review')
    .description('Review pending relations from backfill preview')
    .action(async () => {
      const root = resolveProjectRoot();
      const previewPath = join(root, BRAIN_DIR, MEMORY_EXPORTS_DIR, 'relations-backfill-preview.md');

      if (!existsSync(previewPath)) {
        printError('No backfill preview found. Run: node scripts/backfill-relations.mjs --dry-run');
        return;
      }

      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
      if (!existsSync(dbPath)) {
        printError('memory.db not found.');
        return;
      }

      const content = readFileSync(previewPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('From'));

      if (lines.length === 0) {
        print('  No pending relations to review.');
        return;
      }

      const store = new MemoryStore(dbPath);
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));

      let accepted = 0;
      let rejected = 0;

      try {
        for (const line of lines) {
          const cells = line.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length < 3) continue;

          const fromId = cells[0]!;
          const toId = cells[1]!;
          const relType = cells[2]!;
          const answer = await ask(`  ${fromId} → ${toId} [${relType}] — Accept? (y/n/q): `);

          if (answer.toLowerCase() === 'q') break;
          if (answer.toLowerCase() === 'y') {
            store.insertRelation(fromId, toId, relType as EntryRelation['rel_type']);
            accepted++;
          } else {
            rejected++;
          }
        }

        print(`\n  Review complete: ${accepted} accepted, ${rejected} rejected.`);
      } finally {
        rl.close();
        store.close();
      }
    });
}
