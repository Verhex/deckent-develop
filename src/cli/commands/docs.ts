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
}
