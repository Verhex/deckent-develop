// ─── Managed Doc Runner ───────────────────────────────────────────────────
// Orchestrates managed document updates during sprint finalization.
// Reads .deckent/docs.json, generates content for auto sections,
// and updates target files while preserving protected sections.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { debugLog } from '../../core/utils.js';
import type { DocUpdateContext, DocUpdateResult } from '../doc-updaters/types.js';
import { loadDocsConfig } from './docs-config.js';
import { generateAllSections } from './content-generators.js';
import { updateDocSections, trimToMaxLines } from './section-updater.js';

/**
 * Run managed doc updates for all configured documents.
 * Called from updateProjectDocs() in sprint-reporter.ts after built-in updaters.
 *
 * Non-fatal: errors in individual docs don't affect others or the sprint.
 */
export function runManagedDocUpdates(ctx: DocUpdateContext): DocUpdateResult[] {
  const config = loadDocsConfig(ctx.projectRoot);
  if (!config || config.docs.length === 0) return [];

  const results: DocUpdateResult[] = [];

  for (const entry of config.docs) {
    if (entry.enabled === false) continue;

    const filePath = join(ctx.projectRoot, entry.path);

    // Skip if target file doesn't exist
    if (!existsSync(filePath)) {
      results.push({ file: entry.path, updated: false, reason: 'file_not_found' });
      continue;
    }

    // Skip if no auto sections configured
    if (!entry.autoSections || entry.autoSections.length === 0) {
      results.push({ file: entry.path, updated: false, reason: 'no_auto_sections' });
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');

      // Generate content for auto sections
      const generated = generateAllSections(entry.autoSections, ctx);

      // Skip if no generators matched
      if (generated.size === 0) {
        results.push({ file: entry.path, updated: false, reason: 'no_generators_matched' });
        continue;
      }

      // Update auto sections, preserve protected
      const updated = updateDocSections(content, entry, generated);

      // Apply maxLines if configured
      const final = entry.maxLines ? trimToMaxLines(updated, entry.maxLines) : updated;

      // Write only if changed
      if (final !== content) {
        writeFileSync(filePath, final, 'utf-8');
        results.push({
          file: entry.path,
          updated: true,
          reason: `sections_updated: ${[...generated.keys()].join(', ')}`,
        });
      } else {
        results.push({ file: entry.path, updated: false, reason: 'no_changes' });
      }
    } catch (e) {
      debugLog('managed-doc-runner:update', `${entry.path}: ${e}`);
      results.push({ file: entry.path, updated: false, reason: 'error' });
    }
  }

  return results;
}
