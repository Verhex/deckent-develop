import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Features Manifest Schema Tests ────────────────────────────────────────
// Sprint 139 Task 038 — Dead Code Audit Step 2
// Validates .deckent/features-manifest.json schema, category membership, and
// usage tracking metadata integrity.

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
  it('active features have evidenceSprints array', () => {
    for (const entry of manifest.active) {
      expect(entry).toHaveProperty('evidenceSprints');
      expect(Array.isArray(entry.evidenceSprints)).toBe(true);
      expect((entry.evidenceSprints as string[]).length).toBeGreaterThan(0);
    }
  });

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
