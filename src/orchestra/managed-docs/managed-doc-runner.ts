// ─── Managed Doc Runner ───────────────────────────────────────────────────
// Orchestrates managed document updates during sprint finalization.
// Reads .deckent/docs.json, generates content for auto sections,
// and updates target files while preserving protected sections.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { debugLog } from '../../core/utils.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import type { DocUpdateContext, DocUpdateResult } from '../doc-updaters/types.js';
import type { Sprint, SprintMetrics, SprintResult, ResolvedConfig } from '../../core/types.js';
import { loadDocsConfig } from './docs-config.js';
import { generateAllSections } from './content-generators.js';
import { updateDocSections, trimToMaxLines } from './section-updater.js';
import { renderTemplate } from './template-renderer.js';
import { loadUserGeneratorsSync } from './plugin-loader.js';
import { contentHash, readDocCache, writeDocCache } from './doc-cache.js';
import { MemoryStore } from '../../core/memory-store.js';

/**
 * Run managed doc updates for all configured documents.
 * Called from updateProjectDocs() in sprint-reporter.ts after built-in updaters.
 *
 * Non-fatal: errors in individual docs don't affect others or the sprint.
 */
export function runManagedDocUpdates(ctx: DocUpdateContext): DocUpdateResult[] {
  const config = loadDocsConfig(ctx.projectRoot);
  if (!config || config.docs.length === 0) return [];

  // Load user-defined generators once per run (non-fatal)
  const userGenerators = loadUserGeneratorsSync(ctx.projectRoot);
  // Load cache once per run
  const cache = readDocCache(ctx.projectRoot);
  let cacheDirty = false;

  const results: DocUpdateResult[] = [];

  for (const entry of config.docs) {
    if (entry.enabled === false) continue;

    const filePath = join(ctx.projectRoot, entry.path);

    // Skip if target file doesn't exist
    if (!existsSync(filePath)) {
      results.push({ file: entry.path, updated: false, reason: 'file_not_found' });
      continue;
    }

    const hasAutoSections = entry.autoSections && entry.autoSections.length > 0;
    const hasTemplates = entry.templates && Object.keys(entry.templates).length > 0;
    if (!hasAutoSections && !hasTemplates) {
      results.push({ file: entry.path, updated: false, reason: 'no_auto_sections' });
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');

      // Compute generator input hash: auto sections + templates + entry config
      // Cache skip optimization: if content + entry hash unchanged since last run, skip.
      const entryHash = contentHash(JSON.stringify({
        autoSections: entry.autoSections ?? [],
        templates: entry.templates ?? {},
        protectedSections: entry.protectedSections ?? [],
        maxLines: entry.maxLines ?? 0,
      }));
      const fileHash = contentHash(content);
      const cached = cache[entry.id];
      if (cached && cached.entryHash === entryHash && cached.fileHash === fileHash) {
        results.push({ file: entry.path, updated: false, reason: 'cached_no_change' });
        continue;
      }

      // Generate content: user generators first, then built-in generators
      const generated = generateAllSections(entry.autoSections ?? [], ctx, userGenerators);

      // User templates override everything (highest precedence)
      if (entry.templates) {
        for (const [section, template] of Object.entries(entry.templates)) {
          try {
            generated.set(section, renderTemplate(template, ctx));
          } catch (e) {
            debugLog('managed-doc-runner:template', `${entry.path}#${section}: ${e}`);
          }
        }
      }

      if (generated.size === 0) {
        results.push({ file: entry.path, updated: false, reason: 'no_generators_matched' });
        continue;
      }

      // Ensure template sections are present in entry.autoSections for updateDocSections loop
      const effectiveEntry = entry.templates
        ? { ...entry, autoSections: [...new Set([...(entry.autoSections ?? []), ...Object.keys(entry.templates)])] }
        : entry;

      const updated = updateDocSections(content, effectiveEntry, generated);
      const final = entry.maxLines ? trimToMaxLines(updated, entry.maxLines) : updated;

      if (final !== content) {
        writeFileSync(filePath, final, 'utf-8');
        cache[entry.id] = { entryHash, fileHash: contentHash(final), updatedAt: new Date().toISOString() };
        cacheDirty = true;
        results.push({
          file: entry.path,
          updated: true,
          reason: `sections_updated: ${[...generated.keys()].join(', ')}`,
        });
      } else {
        // Refresh cache even on no-change to avoid repeated generation work
        cache[entry.id] = { entryHash, fileHash, updatedAt: new Date().toISOString() };
        cacheDirty = true;
        results.push({ file: entry.path, updated: false, reason: 'no_changes' });
      }
    } catch (e) {
      debugLog('managed-doc-runner:update', `${entry.path}: ${e}`);
      results.push({ file: entry.path, updated: false, reason: 'error' });
    }
  }

  if (cacheDirty) {
    try { writeDocCache(ctx.projectRoot, cache); } catch (e) { debugLog('managed-doc-runner:cache', e); }
  }

  return results;
}

// ─── Standalone Context Builder ──────────────────────────────────────────
// Builds a DocUpdateContext without a real sprint, for use by `docs run`.

function emptyMetrics(): SprintMetrics {
  return {
    totalTasks: 0, completedTasks: 0, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 0, coveragePercent: 0, noGoRate: 0,
    newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
    boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
  };
}

/**
 * Build a DocUpdateContext for standalone (non-sprint) doc updates.
 * DB-first: reads latest sprint ID from MemoryStore when available.
 * Falls back to .brain/sprints/ directory scan.
 * Returns null if no docs config is found.
 */
export function buildStandaloneDocContext(projectRoot: string): DocUpdateContext | null {
  const config = loadDocsConfig(projectRoot);
  if (!config || config.docs.length === 0) return null;

  // Try to open MemoryStore (non-fatal)
  let store: MemoryStore | undefined;
  try {
    const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (existsSync(dbPath)) {
      store = new MemoryStore(dbPath);
    }
  } catch { /* non-fatal — DB might be locked or corrupted */ }

  // Try to find the latest sprint ID — DB-first
  let sprintId = 'standalone';
  if (store) {
    try {
      const sprintEntries = store.getByType('sprint');
      if (sprintEntries.length > 0) {
        const sorted = [...sprintEntries].sort((a, b) => a.sprint_num - b.sprint_num);
        const latest = sorted.at(-1);
        if (latest?.sprint_id) sprintId = latest.sprint_id;
        else if (latest?.id) sprintId = latest.id;
      }
    } catch { /* fall through to file-based */ }
  }
  // V2: no file-based fallback — DB is single source of truth

  const sprintResult: SprintResult = {
    sprint: { id: sprintId, number: parseInt(sprintId.replace(/\D/g, '') || '0', 10), tasks: [] } as unknown as Sprint,
    evaluations: new Map(),
    metrics: emptyMetrics(),
  };

  // Read language from config.json if available
  let language: 'en' | 'tr' = 'en';
  try {
    const configPath = join(projectRoot, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (raw.language === 'tr') language = 'tr';
    }
  } catch { /* default en */ }

  return {
    projectRoot,
    sprintResult,
    config: { language, auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: existsSync(join(projectRoot, 'DECKENT-MASTER-BLUEPRINT.md')),
    store,
  };
}
