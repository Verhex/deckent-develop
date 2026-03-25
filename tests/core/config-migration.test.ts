import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import {
  migrateConfig,
  migrateConfigInMemory,
  getMissingFields,
  needsMigration,
} from '../../src/core/config-migration.js';
import { createDefaultConfig } from '../../src/core/config.js';

// ─── Helpers ────────────────────────────────────────────────────────

function writeTmp(name: string, content: unknown): string {
  const p = join(tmpdir(), name);
  writeFileSync(p, JSON.stringify(content, null, 2));
  return p;
}

function cleanupTmp(...paths: string[]): void {
  for (const p of paths) {
    if (existsSync(p)) unlinkSync(p);
    // Also clean up any timestamp backups (config.json.bak.<timestamp>)
    const dir = p.includes('/') ? p.split('/').slice(0, -1).join('/') : '.';
    const base = p.split('/').pop() ?? p;
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith(base + '.bak.')) {
          const full = dir + '/' + entry;
          if (existsSync(full)) unlinkSync(full);
        }
      }
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/** Find the first .bak.* file for a given config path */
function findBackupPath(p: string): string | null {
  const dir = p.includes('/') ? p.split('/').slice(0, -1).join('/') : '.';
  const base = p.split('/').pop() ?? p;
  try {
    const entries = readdirSync(dir);
    const bak = entries.find(e => e.startsWith(base + '.bak.'));
    return bak ? dir + '/' + bak : null;
  } catch {
    return null;
  }
}

// ─── getMissingFields ───────────────────────────────────────────────

describe('getMissingFields', () => {
  it('returns empty array for a complete config', () => {
    const full = createDefaultConfig() as unknown as Record<string, unknown>;
    const missing = getMissingFields(full);
    expect(missing).toHaveLength(0);
  });

  it('detects missing top-level fields', () => {
    const minimal = { mode: 'max_plan', modes: {} };
    const missing = getMissingFields(minimal);
    expect(missing.length).toBeGreaterThan(0);
    // Known fields that would be missing from a minimal config
    expect(missing).toContain('brain_provider');
    expect(missing).toContain('worker_provider');
    expect(missing).toContain('memory_budget');
    expect(missing).toContain('scan_interval');
  });

  it('does not include modes key in missing fields', () => {
    const minimal = { mode: 'max_plan', modes: {} };
    const missing = getMissingFields(minimal);
    expect(missing).not.toContain('modes');
  });

  it('preserves existing optional fields that happen to be null', () => {
    const existing = {
      ...createDefaultConfig(),
      notify_channel: null,
    } as unknown as Record<string, unknown>;
    // notify_channel is present (even if null) → should not be missing
    const missing = getMissingFields(existing);
    expect(missing).not.toContain('notify_channel');
  });
});

// ─── needsMigration ─────────────────────────────────────────────────

describe('needsMigration', () => {
  it('returns false for a full config', () => {
    const full = createDefaultConfig() as unknown as Record<string, unknown>;
    expect(needsMigration(full)).toBe(false);
  });

  it('returns true for a minimal config', () => {
    expect(needsMigration({ mode: 'max_plan', modes: {} })).toBe(true);
  });
});

// ─── migrateConfigInMemory ──────────────────────────────────────────

describe('migrateConfigInMemory', () => {
  it('adds missing fields with default values', () => {
    const minimal = { mode: 'max_plan', modes: {} };
    const { config, addedFields } = migrateConfigInMemory(minimal as Record<string, unknown>);
    expect(addedFields.length).toBeGreaterThan(0);
    expect(addedFields).toContain('memory_budget');
    // Default value should match createDefaultConfig()
    expect(config.memory_budget).toBe(600);
    expect(config.scan_interval).toBe(30);
  });

  it('preserves existing values', () => {
    const existing = { mode: 'pro_plan', modes: {}, memory_budget: 999 };
    const { config } = migrateConfigInMemory(existing as Record<string, unknown>);
    expect(config.memory_budget).toBe(999);
    expect(config.mode).toBe('pro_plan');
  });

  it('returns empty addedFields for already-complete config', () => {
    const full = createDefaultConfig() as unknown as Record<string, unknown>;
    const { addedFields } = migrateConfigInMemory(full);
    expect(addedFields).toHaveLength(0);
  });

  it('does not add fields with undefined defaults', () => {
    const minimal = { mode: 'max_plan', modes: {} };
    const { addedFields } = migrateConfigInMemory(minimal as Record<string, unknown>);
    // fallback_provider, provider_overrides, skill_routing have undefined defaults
    // → they should not be added
    expect(addedFields).not.toContain('fallback_provider');
    expect(addedFields).not.toContain('provider_overrides');
    expect(addedFields).not.toContain('skill_routing');
  });
});

// ─── migrateConfig (file-based) ─────────────────────────────────────

describe('migrateConfig', () => {
  it('returns error when file does not exist', () => {
    const result = migrateConfig('/nonexistent/path/config.json');
    expect(result.migrated).toBe(false);
    expect(result.error).toMatch(/not found/i);
    expect(result.backupPath).toBeNull();
  });

  it('returns error for invalid JSON', () => {
    const p = join(tmpdir(), 'bad-config.json');
    writeFileSync(p, '{ invalid json }');
    try {
      const result = migrateConfig(p);
      expect(result.migrated).toBe(false);
      expect(result.error).toMatch(/parse/i);
    } finally {
      cleanupTmp(p);
    }
  });

  it('returns migrated=false and no backup for already-complete config', () => {
    const full = createDefaultConfig();
    const p = writeTmp('full-config.json', full);
    try {
      const result = migrateConfig(p);
      expect(result.migrated).toBe(false);
      expect(result.addedFields).toHaveLength(0);
      expect(result.backupPath).toBeNull();
      // No backup file created
      expect(existsSync(p + '.bak')).toBe(false);
    } finally {
      cleanupTmp(p, p + '.bak');
    }
  });

  it('adds missing fields and creates backup for minimal config', () => {
    const minimal = { mode: 'max_plan', modes: {} };
    const p = writeTmp('minimal-config.json', minimal);
    try {
      const result = migrateConfig(p);
      expect(result.migrated).toBe(true);
      expect(result.addedFields.length).toBeGreaterThan(0);
      // Backup path should be timestamped
      expect(result.backupPath).toBeTruthy();
      expect(result.backupPath).toMatch(/\.bak\.\d{4}-\d{2}-\d{2}/);
      expect(existsSync(result.backupPath!)).toBe(true);

      // Verify backup contains original content
      const backup = JSON.parse(readFileSync(result.backupPath!, 'utf-8')) as Record<string, unknown>;
      expect(backup).toEqual(minimal);

      // Verify migrated file has new fields
      const migrated = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      expect(migrated['memory_budget']).toBe(600);
      expect(migrated['scan_interval']).toBe(30);
      // Original fields preserved
      expect(migrated['mode']).toBe('max_plan');
    } finally {
      cleanupTmp(p);
    }
  });

  it('preserves existing custom values during migration', () => {
    const existing = { mode: 'pro_plan', modes: {}, memory_budget: 800 };
    const p = writeTmp('custom-config.json', existing);
    try {
      const result = migrateConfig(p);
      expect(result.migrated).toBe(true);

      const migrated = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      // Custom value preserved
      expect(migrated['memory_budget']).toBe(800);
      // New fields added
      expect(migrated['scan_interval']).toBe(30);
    } finally {
      cleanupTmp(p);
    }
  });

  it('dry-run does not modify the file or create backup', () => {
    const minimal = { mode: 'max_plan', modes: {} };
    const p = writeTmp('dryrun-config.json', minimal);
    try {
      const result = migrateConfig(p, { dryRun: true });
      expect(result.migrated).toBe(true);
      expect(result.addedFields.length).toBeGreaterThan(0);
      // No backup created in dry-run
      expect(findBackupPath(p)).toBeNull();
      // File unchanged
      const content = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      expect(content).toEqual(minimal);
      // backupPath null for dry-run
      expect(result.backupPath).toBeNull();
    } finally {
      cleanupTmp(p);
    }
  });

  it('adds rollback_policy and fix_phase_enabled for sprint config', () => {
    const existing = { mode: 'max_plan', modes: {} };
    const p = writeTmp('sprint-config.json', existing);
    try {
      migrateConfig(p);
      const migrated = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      expect(migrated['rollback_policy']).toBe('never');
      expect(migrated['fix_phase_enabled']).toBe(true);
      expect(migrated['max_fix_retries']).toBe(2);
    } finally {
      cleanupTmp(p);
    }
  });

  it('detects and adds missing mode-level fields (G: modes migration)', () => {
    // Config with modes that are missing some fields
    const existing = {
      mode: 'max_plan',
      modes: {
        max_plan: { max_workers: 8, brain_model: 'opus', default_model: 'opus', haiku_allowed: true },
        // Missing brain_planning field
      },
    };
    const missingFields = getMissingFields(existing as Record<string, unknown>);
    // Should detect missing mode fields
    const modeFields = missingFields.filter(f => f.startsWith('modes.'));
    expect(modeFields.length).toBeGreaterThan(0);
  });

  it('timestamp backup has valid ISO 8601 date format (H: backup naming)', () => {
    const existing = { mode: 'max_plan', modes: {} };
    const p = writeTmp('ts-backup-test.json', existing);
    try {
      const result = migrateConfig(p);
      expect(result.backupPath).toBeTruthy();
      // Pattern: config.json.bak.2026-03-25T10-00-00-000Z (colons replaced with dashes)
      expect(result.backupPath).toMatch(/\.bak\.\d{4}-\d{2}-\d{2}T/);
    } finally {
      cleanupTmp(p);
    }
  });
});
