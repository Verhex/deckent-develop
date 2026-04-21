// ═══ deckent features — Feature Manifest CLI ══════════════════════════════
// Sprint 150 Task 029 — Feature Manifest Canlılaştırma
// Lists features by category from .deckent/features-manifest.json
// ADR-022-V2: CLI/MCP parity with deckent_feature_query MCP tool

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../core/constants.js';

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
  const manifestPath = join(root, DECKENT_DIR, 'features-manifest.json');
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

function formatTable(entries: Array<FeatureEntry & { category: string }>): string {
  if (entries.length === 0) return '  (no features in this category)';

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
    .description('List features from .deckent/features-manifest.json by category')
    .option('-c, --category <category>', 'Filter by category: active, lightly_used, dormant, dead, all', 'all')
    .option('--json', 'Output as JSON')
    .option('--id <featureId>', 'Show details for a specific feature')
    .action((opts: { category: string; json: boolean; id?: string }) => {
      const root = process.cwd();
      const manifest = loadManifest(root);

      if (!manifest) {
        console.error('Error: features-manifest.json not found. Run `node scripts/sync-manifest.mjs` to generate.');
        process.exit(1);
      }

      // Single feature detail
      if (opts.id) {
        const all = getAllEntries(manifest, 'all');
        const feature = all.find(e => e.id === opts.id);
        if (!feature) {
          console.error(`Error: feature "${opts.id}" not found.`);
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify(feature, null, 2));
        } else {
          console.log(`Feature: ${feature.id}`);
          console.log(`Category: ${feature.category}`);
          console.log(`Label: ${feature.label}`);
          console.log(`Files: ${feature.files.join(', ')}`);
          console.log(`Description: ${feature.description}`);
        }
        return;
      }

      // Category validation
      const category = opts.category as FeatureCategory;
      if (!VALID_CATEGORIES.includes(category)) {
        console.error(`Error: invalid category "${category}". Valid: ${VALID_CATEGORIES.join(', ')}`);
        process.exit(1);
      }

      const entries = getAllEntries(manifest, category);

      if (opts.json) {
        console.log(JSON.stringify({
          manifest_version: manifest._meta.version,
          sprint: manifest._meta.sprintId,
          category,
          count: entries.length,
          features: entries,
        }, null, 2));
        return;
      }

      // Table output
      console.log(`\nDeckent Features — ${category === 'all' ? 'All Categories' : category}`);
      console.log(`Sprint: ${manifest._meta.sprintId} | Generated: ${manifest._meta.generatedAt}`);
      console.log('');
      console.log(formatTable(entries));
      console.log(`\n  Total: ${entries.length} features`);
    });
}
