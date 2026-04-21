import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Features Manifest Schema + Integrity Tests ───────────────────────────
// Sprint 139 Task 038 — Schema validation (original)
// Sprint 150 Task 029 — Content-vs-code integrity, CLI/MCP wire, staleness detection

const MANIFEST_PATH = join(process.cwd(), '.deckent', 'features-manifest.json');

type FeatureEntry = {
  id: string;
  label: string;
  files: string[];
  description: string;
  [key: string]: unknown;
};

type FeaturesManifest = {
  _meta: {
    version: string;
    generatedAt: string;
    generatedBy: string;
    sprintId: string;
    description: string;
    usageWindow: string;
    sourceAnalysis: {
      sprintsChecked: string[];
      methodology: string;
    };
  };
  active: FeatureEntry[];
  lightly_used: FeatureEntry[];
  dormant: FeatureEntry[];
  dead: FeatureEntry[];
};

let manifest: FeaturesManifest;

beforeAll(() => {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  manifest = JSON.parse(raw) as FeaturesManifest;
});

// ─── Test 1: File Existence ─────────────────────────────────────────────────
describe('features-manifest.json — file existence', () => {
  it('manifest file exists at .deckent/features-manifest.json', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it('manifest is valid JSON', () => {
    expect(() => JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))).not.toThrow();
  });
});

// ─── Test 2: Schema Validation ──────────────────────────────────────────────
describe('features-manifest.json — schema validation', () => {
  it('has required top-level keys: _meta, active, lightly_used, dormant, dead', () => {
    expect(manifest).toHaveProperty('_meta');
    expect(manifest).toHaveProperty('active');
    expect(manifest).toHaveProperty('lightly_used');
    expect(manifest).toHaveProperty('dormant');
    expect(manifest).toHaveProperty('dead');
  });

  it('_meta has required fields', () => {
    const { _meta } = manifest;
    expect(_meta).toHaveProperty('version');
    expect(_meta).toHaveProperty('generatedAt');
    expect(_meta).toHaveProperty('generatedBy');
    expect(_meta).toHaveProperty('sprintId');
    expect(_meta).toHaveProperty('description');
    expect(_meta).toHaveProperty('usageWindow');
    expect(_meta).toHaveProperty('sourceAnalysis');
  });

  it('sourceAnalysis has sprintsChecked array and methodology string', () => {
    const { sourceAnalysis } = manifest._meta;
    expect(Array.isArray(sourceAnalysis.sprintsChecked)).toBe(true);
    expect(sourceAnalysis.sprintsChecked.length).toBeGreaterThan(0);
    expect(typeof sourceAnalysis.methodology).toBe('string');
  });

  it('all categories are arrays', () => {
    expect(Array.isArray(manifest.active)).toBe(true);
    expect(Array.isArray(manifest.lightly_used)).toBe(true);
    expect(Array.isArray(manifest.dormant)).toBe(true);
    expect(Array.isArray(manifest.dead)).toBe(true);
  });

  it('every feature entry has required fields: id, label, files, description', () => {
    const allEntries = [
      ...manifest.active,
      ...manifest.lightly_used,
      ...manifest.dormant,
      ...manifest.dead,
    ];
    for (const entry of allEntries) {
      expect(entry).toHaveProperty('id');
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);

      expect(entry).toHaveProperty('label');
      expect(typeof entry.label).toBe('string');

      expect(entry).toHaveProperty('files');
      expect(Array.isArray(entry.files)).toBe(true);
      expect(entry.files.length).toBeGreaterThan(0);

      expect(entry).toHaveProperty('description');
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it('all feature IDs are unique across all categories', () => {
    const allEntries = [
      ...manifest.active,
      ...manifest.lightly_used,
      ...manifest.dormant,
      ...manifest.dead,
    ];
    const ids = allEntries.map(e => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ─── Test 3: Category Membership Validation ─────────────────────────────────
describe('features-manifest.json — category membership', () => {
  it('active category has at least 10 entries (core features)', () => {
    expect(manifest.active.length).toBeGreaterThanOrEqual(10);
  });

  it('dead category contains decision-orchestrator-v1', () => {
    const deadIds = manifest.dead.map(e => e.id);
    expect(deadIds).toContain('decision-orchestrator-v1');
  });

  it('dead decision-orchestrator-v1 has adrRef pointing to ADR-028', () => {
    const v1 = manifest.dead.find(e => e.id === 'decision-orchestrator-v1');
    expect(v1).toBeDefined();
    expect(v1?.adrRef).toBe('ADR-028');
  });

  it('active category contains sprint-controller', () => {
    const activeIds = manifest.active.map(e => e.id);
    expect(activeIds).toContain('sprint-controller');
  });

  it('active category contains event-stream', () => {
    const activeIds = manifest.active.map(e => e.id);
    expect(activeIds).toContain('event-stream');
  });

  it('active category contains dependency-scheduler', () => {
    const activeIds = manifest.active.map(e => e.id);
    expect(activeIds).toContain('dependency-scheduler');
  });

  it('dormant category contains heartbeat-daemon', () => {
    const dormantIds = manifest.dormant.map(e => e.id);
    expect(dormantIds).toContain('heartbeat-daemon');
  });

  it('dormant category contains shared-memory', () => {
    const dormantIds = manifest.dormant.map(e => e.id);
    expect(dormantIds).toContain('shared-memory');
  });

  it('no feature appears in multiple categories', () => {
    const activeIds = new Set(manifest.active.map(e => e.id));
    const lightIds = new Set(manifest.lightly_used.map(e => e.id));
    const dormantIds = new Set(manifest.dormant.map(e => e.id));
    const deadIds = new Set(manifest.dead.map(e => e.id));

    // Check pairwise intersections
    for (const id of activeIds) {
      expect(lightIds.has(id)).toBe(false);
      expect(dormantIds.has(id)).toBe(false);
      expect(deadIds.has(id)).toBe(false);
    }
    for (const id of lightIds) {
      expect(dormantIds.has(id)).toBe(false);
      expect(deadIds.has(id)).toBe(false);
    }
    for (const id of dormantIds) {
      expect(deadIds.has(id)).toBe(false);
    }
  });
});

// ─── Test 4: Usage Tracking Metadata ────────────────────────────────────────
describe('features-manifest.json — usage tracking metadata', () => {
  it('dead features have supersededBy or deprecatedSince field', () => {
    for (const entry of manifest.dead) {
      const hasSupersededBy = 'supersededBy' in entry;
      const hasDeprecatedSince = 'deprecatedSince' in entry;
      expect(hasSupersededBy || hasDeprecatedSince).toBe(true);
    }
  });

  it('dormant features have blockedBy or roadmap field explaining dormancy', () => {
    for (const entry of manifest.dormant) {
      const hasBlockedBy = 'blockedBy' in entry;
      const hasRoadmap = 'roadmap' in entry;
      expect(hasBlockedBy || hasRoadmap).toBe(true);
    }
  });

  it('_meta.usageWindow is set to last-10-sprints', () => {
    expect(manifest._meta.usageWindow).toBe('last-10-sprints');
  });

  it('total feature count is at least 20 entries', () => {
    const total =
      manifest.active.length +
      manifest.lightly_used.length +
      manifest.dormant.length +
      manifest.dead.length;
    expect(total).toBeGreaterThanOrEqual(20);
  });
});

// ─── Test 5: Content-vs-Code Integrity (Sprint 150 Task 029) ───────────────
describe('features-manifest.json — content-vs-code integrity', () => {
  it('all feature files[] entries exist on filesystem (or are valid directories)', () => {
    const allEntries = [
      ...manifest.active,
      ...manifest.lightly_used,
      ...manifest.dormant,
      // Dead features may have deleted files, skip those
    ];
    const missing: string[] = [];
    for (const entry of allEntries) {
      for (const file of entry.files) {
        const fullPath = join(process.cwd(), file);
        if (!existsSync(fullPath)) {
          missing.push(`${entry.id}: ${file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('active features have at least 1 file that is imported by other src/ files', () => {
    // Spot-check: sprint-controller must be imported by other files
    const controller = manifest.active.find(e => e.id === 'sprint-controller');
    expect(controller).toBeDefined();

    const result = spawnSync('grep', [
      '-rl', '--include=*.ts',
      'sprint-controller',
      join(process.cwd(), 'src'),
    ], { encoding: 'utf-8', timeout: 10000 });

    const importers = (result.stdout || '').trim().split('\n').filter(Boolean);
    // Should be imported by at least 2 files (excluding itself)
    expect(importers.length).toBeGreaterThanOrEqual(2);
  });

  it('dead features are actually deprecated or superseded', () => {
    for (const entry of manifest.dead) {
      expect(
        'deprecatedSince' in entry || 'supersededBy' in entry || 'adrRef' in entry,
      ).toBe(true);
    }
  });

  it('stale entry detection: learning-decay.ts should not be in manifest', () => {
    const allEntries = [
      ...manifest.active,
      ...manifest.lightly_used,
      ...manifest.dormant,
      ...manifest.dead,
    ];
    const learningDecay = allEntries.find(e =>
      e.files.some(f => f.includes('learning-decay')),
    );
    expect(learningDecay).toBeUndefined();
  });

  it('manifest _meta.generatedBy references sync-manifest.mjs', () => {
    expect(manifest._meta.generatedBy).toContain('sync-manifest');
  });
});

// ─── Test 6: Generator Script Validation (Sprint 150 Task 029) ─────────────
describe('sync-manifest.mjs — generator validation', () => {
  it('sync-manifest.mjs script exists', () => {
    const scriptPath = join(process.cwd(), 'scripts', 'sync-manifest.mjs');
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('dry-run produces valid output', () => {
    const result = spawnSync('node', [
      join(process.cwd(), 'scripts', 'sync-manifest.mjs'),
      '--dry-run',
    ], { encoding: 'utf-8', timeout: 30000, cwd: process.cwd() });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Features Manifest Sync');
    expect(result.stdout).toContain('Active:');
    expect(result.stdout).toContain('Total:');
  });

  it('json output is valid JSON with correct structure', () => {
    const result = spawnSync('node', [
      join(process.cwd(), 'scripts', 'sync-manifest.mjs'),
      '--json',
    ], { encoding: 'utf-8', timeout: 30000, cwd: process.cwd() });

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed).toHaveProperty('_meta');
    expect(parsed).toHaveProperty('active');
    expect(parsed).toHaveProperty('dormant');
    expect(parsed).toHaveProperty('dead');
  });
});

// ─── Test 7: CLI + MCP Wire Existence (Sprint 150 Task 029) ────────────────
describe('features CLI + MCP — wire existence', () => {
  it('features.ts CLI command file exists', () => {
    const cliPath = join(process.cwd(), 'src', 'cli', 'commands', 'features.ts');
    expect(existsSync(cliPath)).toBe(true);
  });

  it('feature-query.ts MCP tool file exists', () => {
    const mcpPath = join(process.cwd(), 'src', 'mcp', 'tools', 'feature-query.ts');
    expect(existsSync(mcpPath)).toBe(true);
  });

  it('features CLI is registered in src/cli/index.ts', () => {
    const indexContent = readFileSync(join(process.cwd(), 'src', 'cli', 'index.ts'), 'utf-8');
    expect(indexContent).toContain('registerFeatures');
    expect(indexContent).toContain('./commands/features.js');
  });

  it('feature-query MCP tool is registered in src/mcp/tools/index.ts', () => {
    const indexContent = readFileSync(join(process.cwd(), 'src', 'mcp', 'tools', 'index.ts'), 'utf-8');
    expect(indexContent).toContain('registerFeatureQueryTool');
    expect(indexContent).toContain('./feature-query.js');
  });
});

// ─── Test 8: Sprint Finalizer Hook (Sprint 150 Task 029) ──────────────────
describe('sprint-finalizer — features manifest hook', () => {
  it('sprint-finalizer.ts contains features manifest sync hook', () => {
    const finalizerContent = readFileSync(
      join(process.cwd(), 'src', 'orchestra', 'sprint-finalizer.ts'), 'utf-8',
    );
    expect(finalizerContent).toContain('sync-manifest.mjs');
    expect(finalizerContent).toContain('featuresManifest');
  });
});
