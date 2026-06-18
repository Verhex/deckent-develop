// ─── CLI: deckent docs ────────────────────────────────────────────────────
// Manage user-defined documents in sprint lifecycle.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { addDoc, removeDoc, loadDocsConfig, saveDocsConfig } from '../../orchestra/managed-docs/docs-config.js';
import { runManagedDocUpdates, buildStandaloneDocContext } from '../../orchestra/managed-docs/managed-doc-runner.js';
import { clearDocCache } from '../../orchestra/managed-docs/doc-cache.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadDocTrackingConfig } from '../../core/doc-tracking/config.js';
import { scanDocs } from '../../core/doc-tracking/scanner.js';
import { DocTrackingStore } from '../../core/doc-tracking/store.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

// ─── doc-tracking handlers (ADR-090; exported for testability) ─────────────
export async function runDocsTrackScan(
  root: string,
  opts: { write: boolean; prune: boolean },
): Promise<{ count: number; stale: number }> {
  const config = loadDocTrackingConfig(root);
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    const { records } = await scanDocs(root, config, store, { write: opts.write, prune: opts.prune });
    const stale = records.filter(r => r.state === 'STALE' || r.state === 'CRITICAL_STALE').length;
    return { count: records.length, stale };
  } finally {
    store.close();
  }
}

export function runDocsTrackStatus(
  root: string,
  filter: { stale: boolean; rank?: number },
): Array<{ doc_rank: number; state: string; priority_score: number; path: string }> {
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    return store.getAll()
      .filter(r => (filter.stale ? r.state === 'STALE' || r.state === 'CRITICAL_STALE' || r.state === 'DRIFT' : true))
      .filter(r => (filter.rank === undefined ? true : r.doc_rank <= filter.rank))
      .map(r => ({ doc_rank: r.doc_rank, state: r.state, priority_score: r.priority_score, path: r.path }));
  } finally {
    store.close();
  }
}

export function registerDocs(program: Command): void {
  const docs = program
    .command('docs')
    .description('Manage user-defined documents');

  // ─── docs add ─────────────────────────────────────────────────────────
  docs
    .command('add <path>')
    .description('Add a document to managed docs')
    .option('--auto <sections>', 'Comma-separated auto-update section headings')
    .option('--protect <sections>', 'Comma-separated protected section headings')
    .option('--skills <skills>', 'Comma-separated skill IDs')
    .option('--max-lines <n>', 'Max lines for auto sections', parseInt)
    .action((filePath: string, opts: { auto?: string; protect?: string; skills?: string; maxLines?: number }) => {
      const root = resolveProjectRoot();
      const fullPath = join(root, filePath);
      if (!existsSync(fullPath)) {
        printError(`File not found: ${filePath}`);
        return;
      }

      const autoSections = opts.auto ? opts.auto.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const protectedSections = opts.protect ? opts.protect.split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const skills = opts.skills ? opts.skills.split(',').map(s => s.trim()).filter(Boolean) : undefined;

      const id = addDoc(root, {
        path: filePath,
        autoSections,
        protectedSections,
        skills,
        maxLines: opts.maxLines,
      });

      print(`✓ Added: ${filePath} (id: ${id})`);
      if (autoSections?.length) print(`  Auto sections: ${autoSections.join(', ')}`);
      if (protectedSections?.length) print(`  Protected: ${protectedSections.join(', ')}`);
    });

  // ─── docs remove ──────────────────────────────────────────────────────
  docs
    .command('remove <pathOrId>')
    .description('Remove a document from managed docs')
    .action((pathOrId: string) => {
      const root = resolveProjectRoot();
      const removed = removeDoc(root, pathOrId);
      if (removed) {
        print(`✓ Removed: ${pathOrId}`);
      } else {
        printError(`Not found: ${pathOrId}`);
      }
    });

  // ─── docs list ────────────────────────────────────────────────────────
  docs
    .command('list')
    .description('List all managed documents')
    .action(() => {
      const root = resolveProjectRoot();
      const config = loadDocsConfig(root);
      if (!config || config.docs.length === 0) {
        print('No managed documents configured.');
        print('Use `deckent docs add <path>` to add a document.');
        return;
      }

      print(`Managed Documents (${config.docs.length}):\n`);
      for (const doc of config.docs) {
        const status = doc.enabled === false ? ' [disabled]' : '';
        print(`  ${doc.id}${status}`);
        print(`    Path: ${doc.path}`);
        if (doc.autoSections?.length) print(`    Auto: ${doc.autoSections.join(', ')}`);
        if (doc.protectedSections?.length) print(`    Protected: ${doc.protectedSections.join(', ')}`);
        if (doc.skills?.length) print(`    Skills: ${doc.skills.join(', ')}`);
        if (doc.maxLines) print(`    Max Lines: ${doc.maxLines}`);
        print('');
      }
    });

  // ─── docs update ──────────────────────────────────────────────────────
  docs
    .command('update <pathOrId>')
    .description('Update rules for an existing managed doc')
    .option('--add-auto <sections>', 'Add auto-update sections (comma-separated)')
    .option('--add-protect <sections>', 'Add protected sections (comma-separated)')
    .option('--remove-auto <sections>', 'Remove auto sections (comma-separated)')
    .option('--max-lines <n>', 'Set max lines', parseInt)
    .action((pathOrId: string, opts: { addAuto?: string; addProtect?: string; removeAuto?: string; maxLines?: number }) => {
      const root = resolveProjectRoot();
      const config = loadDocsConfig(root);
      if (!config) { printError('No docs config found.'); return; }

      const entry = config.docs.find(d => d.id === pathOrId || d.path === pathOrId);
      if (!entry) { printError(`Not found: ${pathOrId}`); return; }

      if (opts.addAuto) {
        const add = opts.addAuto.split(',').map(s => s.trim()).filter(Boolean);
        entry.autoSections = [...new Set([...(entry.autoSections ?? []), ...add])];
      }
      if (opts.addProtect) {
        const add = opts.addProtect.split(',').map(s => s.trim()).filter(Boolean);
        entry.protectedSections = [...new Set([...(entry.protectedSections ?? []), ...add])];
      }
      if (opts.removeAuto) {
        const remove = new Set(opts.removeAuto.split(',').map(s => s.trim().toLowerCase()));
        entry.autoSections = (entry.autoSections ?? []).filter(s => !remove.has(s.toLowerCase()));
      }
      if (opts.maxLines !== undefined) {
        entry.maxLines = opts.maxLines;
      }

      // Save back
      saveDocsConfig(root, config);
      print(`✓ Updated: ${entry.id}`);
    });

  // ─── docs run ─────────────────────────────────────────────────────────
  docs
    .command('run')
    .description('Run managed doc updates without a sprint')
    .option('--no-cache', 'Clear the doc cache before running')
    .action((opts: { cache?: boolean }) => {
      const root = resolveProjectRoot();
      if (opts.cache === false) {
        clearDocCache(root);
      }
      const ctx = buildStandaloneDocContext(root);
      if (!ctx) {
        printError('No docs config found. Use `deckent docs add <path>` first.');
        return;
      }
      const results = runManagedDocUpdates(ctx);
      if (results.length === 0) {
        print('No managed documents to update.');
        return;
      }
      for (const r of results) {
        if (r.updated) {
          print(`  ✓ ${r.file}: ${r.reason}`);
        } else {
          print(`  - ${r.file}: ${r.reason}`);
        }
      }
      print(`\nDone. ${results.filter(r => r.updated).length}/${results.length} docs updated.`);
    });

  // ─── docs track (ADR-090) ─────────────────────────────────────────────
  const track = docs.command('track').description('Track doc freshness (hash + DCR + stale)');

  track
    .command('scan')
    .description('Hash + timestamp + rank all docs; write front-matter; sync memory.db')
    .option('--no-write', 'Do not modify front-matter (DB-only)')
    .option('--prune', 'Remove records for deleted docs')
    .action(async (opts: { write: boolean; prune?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const { count, stale } = await runDocsTrackScan(root, { write: opts.write, prune: !!opts.prune });
      print(getMessage('docs.track.scanned', lang, { count: String(count), stale: String(stale) }));
    });

  track
    .command('status')
    .description('Report tracked docs by rank + stale state')
    .option('--stale', 'Only DRIFT/STALE/CRITICAL_STALE')
    .option('--rank <n>', 'Only docs with doc_rank <= n', parseInt)
    .option('--json', 'Raw JSON output')
    .action((opts: { stale?: boolean; rank?: number; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const rows = runDocsTrackStatus(root, { stale: !!opts.stale, rank: opts.rank });
      if (opts.json) { print(JSON.stringify(rows, null, 2)); return; }
      if (rows.length === 0) { print(getMessage('docs.track.none', lang)); return; }
      print(getMessage('docs.track.header', lang));
      for (const r of rows) {
        print(`${String(r.doc_rank).padEnd(5)} ${r.state.padEnd(15)} ${String(Math.round(r.priority_score)).padEnd(6)} ${r.path}`);
      }
    });

  track
    .command('sync')
    .description('Update memory.db only (no front-matter writes)')
    .action(async () => {
      const root = resolveProjectRoot();
      const lang = getLanguage();
      const { count } = await runDocsTrackScan(root, { write: false, prune: false });
      print(getMessage('docs.track.synced', lang, { count: String(count) }));
    });
}
