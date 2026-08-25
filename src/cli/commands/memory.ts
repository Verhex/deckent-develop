import { Command } from 'commander';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { MemoryStore } from '../../core/memory-store.js';
import { parseDecisionsMd, parseMemoryMd, parseDebtMd } from '../../core/memory-import.js';
import { writeGuardedExports } from '../../core/memory-export.js';
import { syncAdrFilesToDb } from '../../core/adr-file-sync.js';
import { BRAIN_DIR, MEMORY_DB_FILE, MEMORY_EXPORTS_DIR } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { loadConfig } from '../../core/config.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import type { EntryRelation } from '../../core/memory-types.js';

export function registerMemory(program: Command): void {
  const mem = program.command('memory').description(getMessage('cli.memory.desc', getLanguage(undefined)));

  mem.command('rebuild')
    .description(getMessage('cli.memory.rebuild.desc', getLanguage(undefined)))
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
        // Bug M Sprint 166 T1: docs/adr/*.md is the primary source for ADRs.
        // Exports/decisions.md is used only as a fallback when no ADR files exist.
        const adrDir = join(root, 'docs', 'adr');
        let adrInsertedFromFiles = 0;
        if (existsSync(adrDir)) {
          const syncResult = syncAdrFilesToDb(store, adrDir, { changedBy: 'memory-rebuild' });
          adrInsertedFromFiles = syncResult.inserted + syncResult.updated;
          count += adrInsertedFromFiles;
          if (adrInsertedFromFiles > 0) {
            print(`  ADRs (from docs/adr/): ${adrInsertedFromFiles}`);
          }
        }

        // Fallback to exports/decisions.md only if no ADRs were imported from files.
        const decisionsPath = join(exportsDir, 'decisions.md');
        if (adrInsertedFromFiles === 0 && existsSync(decisionsPath)) {
          const entries = parseDecisionsMd(readFileSync(decisionsPath, 'utf-8'));
          for (const e of entries) { store.insert(e); count++; }
          print(`  ADRs (from exports/decisions.md): ${entries.length}`);
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

        // Final fallback: original .brain/DECISIONS.md if everything else empty.
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
    .description(getMessage('cli.memory.export.desc', getLanguage(undefined)))
    .action(() => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const brainDir = join(root, BRAIN_DIR);
      const exportsDir = join(brainDir, MEMORY_EXPORTS_DIR);
      const dbPath = join(brainDir, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError(getMessage('memory.export.not_found', lang));
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const result = writeGuardedExports(store, exportsDir);
        if (result.skipped.length > 0) {
          printError(getMessage('memory.export.guard_hold', lang, {
            files: result.skipped.join(', '),
            written: String(result.written.length),
          }));
          process.exitCode = 1;
          return;
        }
        print(getMessage('memory.export.success', lang, {
          count: String(result.written.length),
        }));
      } finally {
        store.close();
      }
    });

  mem.command('stats')
    .description(getMessage('cli.memory.stats.desc', getLanguage(undefined)))
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

  // ── Backup subcommand ─────────────────────────────────────────
  mem.command('backup')
    .description(getMessage('memory.backup.desc', getLanguage(undefined)))
    .option('--output <path>', getMessage('cli.runtime.memory.backup.opt.output', getLanguage(undefined)))
    .option('--checkpoint', getMessage('cli.runtime.memory.backup.opt.checkpoint', getLanguage(undefined)))
    .action(async (opts: { output?: string; checkpoint?: boolean }) => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root).catch(() => ({ language: 'en', last_sprint_id: undefined as string | undefined }));
      const lang = getLanguage((config as { language?: string }).language);
      const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);

      if (!existsSync(dbPath)) {
        printError(getMessage('memory.backup.not_found', lang));
        return;
      }

      const store = new MemoryStore(dbPath);
      try {
        const db = store.getRawDb();

        // Always run WAL checkpoint to flush write-ahead log into main DB file
        // so the backup contains a consistent, fully-written snapshot.
        db.pragma('wal_checkpoint(TRUNCATE)');
        if (opts.checkpoint) {
          print(getMessage('memory.backup.checkpoint_done', lang));
        }

        const sprintId = (config as { last_sprint_id?: string }).last_sprint_id ?? 'manual';
        const ts = Date.now();
        const outPath = opts.output ?? join(root, BRAIN_DIR, `memory.db.bak-${sprintId}-${ts}`);

        await db.backup(outPath);

        // Verify backup integrity by counting active entries
        const backupStore = new MemoryStore(outPath);
        let count = 0;
        try {
          count = backupStore.totalCount();
        } finally {
          backupStore.close();
        }

        print(getMessage('memory.backup.success', lang, { path: outPath, count: String(count) }));
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        printError(getMessage('memory.backup.error', lang, { error }));
      } finally {
        store.close();
      }
    });

  // ── Relations subcommand ──────────────────────────────────────
  const relations = mem.command('relations').description(getMessage('cli.memory.relations.desc', getLanguage(undefined)));

  relations.command('list')
    .description(getMessage('cli.memory.list.desc', getLanguage(undefined)))
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
    .description(getMessage('cli.memory.review.desc', getLanguage(undefined)))
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
