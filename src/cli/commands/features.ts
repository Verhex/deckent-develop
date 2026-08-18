// ═══ deckent features — Feature Manifest CLI ══════════════════════════════
// Sprint 150 Task 029 — Feature Manifest Canlılaştırma
// Lists features by category from .deckent/settings/features-manifest.json
// ADR-022-V2: CLI/MCP parity with deckent_feature_query MCP tool

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEATURES_MANIFEST_FILE } from '../../core/constants.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { print, printError } from '../helpers/output.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';

interface FeatureEntry {
  id: string;
  label: string;
  files: string[];
  description: string;
  [key: string]: unknown;
}

interface FeaturesManifest {
  _meta: {
    version: string;
    generatedAt: string;
    generatedBy: string;
    sprintId: string;
    [key: string]: unknown;
  };
  active: FeatureEntry[];
  lightly_used: FeatureEntry[];
  dormant: FeatureEntry[];
  dead: FeatureEntry[];
}

type FeatureCategory = 'active' | 'lightly_used' | 'dormant' | 'dead' | 'all';

const VALID_CATEGORIES: FeatureCategory[] = ['active', 'lightly_used', 'dormant', 'dead', 'all'];

function loadManifest(root: string): FeaturesManifest | null {
  const manifestPath = join(root, FEATURES_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as FeaturesManifest;
  } catch {
    return null;
  }
}

function getAllEntries(manifest: FeaturesManifest, category: FeatureCategory): Array<FeatureEntry & { category: string }> {
  if (category === 'all') {
    return [
      ...manifest.active.map(e => ({ ...e, category: 'active' })),
      ...manifest.lightly_used.map(e => ({ ...e, category: 'lightly_used' })),
      ...manifest.dormant.map(e => ({ ...e, category: 'dormant' })),
      ...manifest.dead.map(e => ({ ...e, category: 'dead' })),
    ];
  }
  const entries = manifest[category] ?? [];
  return entries.map(e => ({ ...e, category }));
}

function formatTable(entries: Array<FeatureEntry & { category: string }>, lang: string): string {
  if (entries.length === 0) return `  ${getMessage('features.empty_category', lang)}`;

  const lines: string[] = [];
  const idWidth = Math.max(4, ...entries.map(e => e.id.length));
  const catWidth = Math.max(8, ...entries.map(e => e.category.length));
  const labelWidth = Math.max(5, ...entries.map(e => Math.min(e.label.length, 50)));

  lines.push(
    `  ${'ID'.padEnd(idWidth)}  ${'Category'.padEnd(catWidth)}  ${'Label'.padEnd(labelWidth)}`,
  );
  lines.push(
    `  ${'─'.repeat(idWidth)}  ${'─'.repeat(catWidth)}  ${'─'.repeat(labelWidth)}`,
  );

  for (const entry of entries) {
    const truncLabel = entry.label.length > 50 ? entry.label.slice(0, 47) + '...' : entry.label;
    lines.push(
      `  ${entry.id.padEnd(idWidth)}  ${entry.category.padEnd(catWidth)}  ${truncLabel.padEnd(labelWidth)}`,
    );
  }

  return lines.join('\n');
}

export function registerFeatures(program: Command): void {
  program
    .command('features')
    .alias('feature-query')
    .description(getMessage('cli.features.desc', getLanguage(undefined)))
    .option('-c, --category <category>', 'Filter by category: active, lightly_used, dormant, dead, all', 'all')
    .option('--json', 'Output as JSON')
    .option('--id <featureId>', 'Show details for a specific feature')
    .action((opts: { category: string; json: boolean; id?: string }) => {
      const root = resolveProjectRoot();
      const lang = detectLang(root);
      const manifest = loadManifest(root);

      if (!manifest) {
        printError(getMessage('features.manifest_not_found', lang));
        process.exitCode = 1;
        return;
      }

      // Single feature detail
      if (opts.id) {
        const all = getAllEntries(manifest, 'all');
        const feature = all.find(e => e.id === opts.id);
        if (!feature) {
          printError(getMessage('features.feature_not_found', lang, { name: opts.id }));
          process.exitCode = 1;
          return;
        }
        if (opts.json) {
          print(JSON.stringify(feature, null, 2));
        } else {
          print(`${getMessage('features.detail_feature', lang)}: ${feature.id}`);
          print(`${getMessage('features.detail_category', lang)}: ${feature.category}`);
          print(`${getMessage('features.detail_label', lang)}: ${feature.label}`);
          print(`${getMessage('features.detail_files', lang)}: ${feature.files.join(', ')}`);
          print(`${getMessage('features.detail_description', lang)}: ${feature.description}`);
        }
        return;
      }

      // Category validation
      const category = opts.category as FeatureCategory;
      if (!VALID_CATEGORIES.includes(category)) {
        printError(getMessage('features.invalid_category', lang, {
          name: category,
          valid: VALID_CATEGORIES.join(', '),
        }));
        process.exitCode = 1;
        return;
      }

      const entries = getAllEntries(manifest, category);

      if (opts.json) {
        print(JSON.stringify({
          manifest_version: manifest._meta.version,
          sprint: manifest._meta.sprintId,
          category,
          count: entries.length,
          features: entries,
        }, null, 2));
        return;
      }

      // Table output
      const heading = category === 'all'
        ? getMessage('features.header_all', lang)
        : category;
      print(`\n${getMessage('features.header_title', lang, { category: heading })}`);
      print(getMessage('features.header_meta', lang, {
        sprint: manifest._meta.sprintId,
        generated: manifest._meta.generatedAt,
      }));
      print('');
      print(formatTable(entries, lang));
      print(`\n  ${getMessage('features.total', lang, { count: String(entries.length) })}`);
    });
}
