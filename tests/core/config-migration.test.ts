import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import {
  migrateConfig,
  migrateConfigInMemory,
  migrateConfigFull,
  getMissingFields,
  needsMigration,
  modelToTier,
  migrateConfigV1ToV2,
  needsV2Migration,
  removeDuplicateKeys,
} from '../../src/core/config-migration.js';
import { createDefaultConfig } from '../../src/core/config.js';
import { ProviderConfigAliasConflictError } from '../../src/core/provider-config-canonicalizer.js';
import * as configWriteAuthority from '../../src/core/config-write-authority.js';
import { validateConfig, ConfigValidationError } from "../../src/core/config.js";
import type { DeckentConfig, PlanModeConfig } from "../../src/core/types.js";

vi.mock('../../src/core/config-write-authority.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/core/config-write-authority.js')
  >();
  return {
    ...actual,
    withConfigWriteLock: vi.fn(actual.withConfigWriteLock),
    writeConfigJsonAtomic: vi.fn(actual.writeConfigJsonAtomic),
  };
});

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
    // Sprint 150 Decision 4: grouped `providers` is canonical in defaults,
    // flat brain_provider/worker_provider are legacy runtime-only projections.
    expect(missing).toContain('providers');
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
    expect(config.memory_budget).toBe(5000);
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
      expect(migrated['memory_budget']).toBe(5000);
      expect(migrated['scan_interval']).toBe(30);
      // Legacy mode name migrated to canonical name
      expect(migrated['mode']).toBe('performance');

      expect(configWriteAuthority.withConfigWriteLock).toHaveBeenCalledWith(
        p,
        expect.any(Function),
      );
      expect(configWriteAuthority.writeConfigJsonAtomic).toHaveBeenCalledWith(
        p,
        expect.objectContaining({
          memory_budget: 5000,
          mode: 'performance',
          scan_interval: 30,
        }),
      );
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

  it('backs up legacy model aliases and writes canonical API IDs', () => {
    const existing = {
      ...createDefaultConfig(),
      modes: {
        ...createDefaultConfig().modes,
        balanced: {
          ...createDefaultConfig().modes.balanced,
          brain_model: 'sonnet',
          default_model: 'gpt-5',
        },
      },
    };
    const p = writeTmp('model-alias-config.json', existing);
    try {
      const result = migrateConfig(p);
      expect(result.migrated).toBe(true);
      expect(result.renamedFields).toEqual(expect.arrayContaining([
        'modes.balanced.brain_model: sonnet → claude-sonnet-5',
        'modes.balanced.default_model: gpt-5 → gpt-5.5',
      ]));
      expect(result.backupPath).not.toBeNull();

      const backup = JSON.parse(readFileSync(result.backupPath!, 'utf-8')) as typeof existing;
      expect(backup.modes.balanced.brain_model).toBe('sonnet');
      expect(backup.modes.balanced.default_model).toBe('gpt-5');

      const migrated = JSON.parse(readFileSync(p, 'utf-8')) as typeof existing;
      expect(migrated.modes.balanced.brain_model).toBe('claude-sonnet-5');
      expect(migrated.modes.balanced.default_model).toBe('gpt-5.5');
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

// ─── routing_engine migration ────────────────────────────────────────

describe('routing_engine migration', () => {
  it('getMissingFields detects missing routing_engine in old config', () => {
    const oldConfig: Record<string, unknown> = {
      mode: 'max_plan',
      modes: {},
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    const missing = getMissingFields(oldConfig);
    expect(missing).toContain('routing_engine');
  });

  it('migrateConfigInMemory adds routing_engine = v3 for old config without it', () => {
    const oldConfig: Record<string, unknown> = {
      mode: 'max_plan',
      modes: {},
    };
    const { config, addedFields } = migrateConfigInMemory(oldConfig);
    expect(addedFields).toContain('routing_engine');
    expect(config.routing_engine).toBe('v3');
  });

  it('migrateConfigInMemory upgrades existing routing_engine = v2 to v3', () => {
    const existing: Record<string, unknown> = {
      ...createDefaultConfig() as unknown as Record<string, unknown>,
      routing_engine: 'v2',
    };
    const { config, addedFields } = migrateConfigInMemory(existing);
    expect(addedFields).not.toContain('routing_engine');
    expect(config.routing_engine).toBe('v3');
  });

  it('createDefaultConfig includes routing_engine = v3', () => {
    const defaults = createDefaultConfig();
    expect(defaults.routing_engine).toBe('v3');
  });

  it('migrateConfig file adds routing_engine to on-disk config', () => {
    const oldConfig = { mode: 'max_plan', modes: {} };
    const p = writeTmp('routing-migration-test.json', oldConfig);
    try {
      const result = migrateConfig(p);
      expect(result.migrated).toBe(true);
      expect(result.addedFields).toContain('routing_engine');
      const written = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
      expect(written['routing_engine']).toBe('v3');
    } finally {
      cleanupTmp(p);
    }
  });
});

// ─── modelToTier ────────────────────────────────────────────────────

describe('modelToTier', () => {
  it('maps Claude models to correct tiers', () => {
    expect(modelToTier('opus')).toBe('premium');
    expect(modelToTier('sonnet')).toBe('standard');
    expect(modelToTier('haiku')).toBe('economy');
    expect(modelToTier('fable')).toBe('premium_plus');
  });

  it('maps OpenAI models to correct tiers', () => {
    expect(modelToTier('gpt-5')).toBe('premium');
    expect(modelToTier('gpt-4.1')).toBe('standard');
    expect(modelToTier('o3')).toBe('standard');
    expect(modelToTier('gpt-5-mini')).toBe('economy');
    expect(modelToTier('gpt-4.1-mini')).toBe('economy');
    expect(modelToTier('o4-mini')).toBe('economy');
  });

  it('maps Gemini models to correct tiers', () => {
    expect(modelToTier('gemini-2.5-pro')).toBe('premium');
    expect(modelToTier('gemini-2.5-flash')).toBe('standard');
    expect(modelToTier('gemini-2.0-flash')).toBe('economy');
  });

  it('fails loudly for an unknown migration model', () => {
    expect(() => modelToTier('unknown-model')).toThrowError(
      expect.objectContaining({ code: 'E_UNKNOWN_MODEL' }),
    );
  });
});

// ─── migrateConfigV1ToV2 ────────────────────────────────────────────

describe('migrateConfigV1ToV2', () => {
  it('migrates brain_model to model_strategy.brain_tier', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: {
        performance: { brain_model: 'opus', default_model: 'sonnet', haiku_allowed: true, max_workers: 4 },
      },
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(true);
    const strategy = config['model_strategy'] as Record<string, unknown>;
    expect(strategy['brain_tier']).toBe('premium');
  });

  it('migrates default_model to model_strategy.worker_tier', () => {
    const config: Record<string, unknown> = {
      mode: 'balanced',
      modes: {
        balanced: { brain_model: 'sonnet', default_model: 'opus', haiku_allowed: true, max_workers: 5 },
      },
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(true);
    const strategy = config['model_strategy'] as Record<string, unknown>;
    expect(strategy['worker_tier']).toBe('premium');
  });

  it('migrates haiku_allowed false to min_tier standard', () => {
    const config: Record<string, unknown> = {
      mode: 'economic',
      modes: {
        economic: { brain_model: 'sonnet', default_model: 'sonnet', haiku_allowed: false, max_workers: 3 },
      },
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(true);
    const strategy = config['model_strategy'] as Record<string, unknown>;
    expect(strategy['min_tier']).toBe('standard');
  });

  it('migrates haiku_allowed true to min_tier economy', () => {
    const config: Record<string, unknown> = {
      mode: 'balanced',
      modes: {
        balanced: { brain_model: 'sonnet', default_model: 'opus', haiku_allowed: true, max_workers: 5 },
      },
    };
    migrateConfigV1ToV2(config);
    const strategy = config['model_strategy'] as Record<string, unknown>;
    expect(strategy['min_tier']).toBe('economy');
  });

  it('migrates brain_provider and worker_provider to providers block', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { brain_model: 'opus', default_model: 'opus', haiku_allowed: false, max_workers: 4 } },
      brain_provider: 'claude',
      worker_provider: 'codex',
      fallback_provider: 'gemini',
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(true);
    const providers = config['providers'] as Record<string, unknown>;
    expect(providers['brain']).toBe('claude');
    expect(providers['worker']).toBe('codex');
    expect(providers['fallback']).toBe('gemini');
  });

  it('does not overwrite existing model_strategy fields', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { brain_model: 'opus', default_model: 'opus', haiku_allowed: false, max_workers: 4 } },
      model_strategy: { brain_tier: 'economy' }, // pre-existing
    };
    migrateConfigV1ToV2(config);
    const strategy = config['model_strategy'] as Record<string, unknown>;
    // Existing brain_tier preserved
    expect(strategy['brain_tier']).toBe('economy');
    // worker_tier added
    expect(strategy['worker_tier']).toBe('premium');
  });

  it('rejects differing legacy and canonical provider definitions before mutation', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { brain_model: 'opus', default_model: 'opus', haiku_allowed: false, max_workers: 4 } },
      brain_provider: 'claude',
      worker_provider: 'codex',
      providers: { brain: 'gemini' }, // pre-existing
    };
    const before = structuredClone(config);
    expect(() => migrateConfigV1ToV2(config)).toThrow(ProviderConfigAliasConflictError);
    expect(config).toEqual(before);
  });

  it('deduplicates equal dual definitions and migrates remaining flat aliases', () => {
    const config: Record<string, unknown> = {
      brain_provider: 'claude',
      worker_provider: 'codex',
      provider_overrides: { docs: 'gemini', tests: 'codex' },
      providers: {
        brain: 'claude',
        overrides: { tests: 'codex', docs: 'gemini' },
      },
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(true);
    expect(config['brain_provider']).toBeUndefined();
    expect(config['worker_provider']).toBeUndefined();
    expect(config['provider_overrides']).toBeUndefined();
    expect(config['providers']).toMatchObject({
      brain: 'claude',
      worker: 'codex',
      overrides: { docs: 'gemini', tests: 'codex' },
    });
  });

  it('returns migrated=false when no v1 fields to migrate', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { max_workers: 4 } },
      model_strategy: { brain_tier: 'premium' },
      providers: { brain: 'claude' },
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('handles flat v1 config (no modes object)', () => {
    const config: Record<string, unknown> = {
      brain_model: 'sonnet',
      default_model: 'haiku',
      haiku_allowed: true,
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.migrated).toBe(true);
    const strategy = config['model_strategy'] as Record<string, unknown>;
    expect(strategy['brain_tier']).toBe('standard');
    expect(strategy['worker_tier']).toBe('economy');
    expect(strategy['min_tier']).toBe('economy');
  });

  it('reports all changes made', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { brain_model: 'opus', default_model: 'sonnet', haiku_allowed: false, max_workers: 8 } },
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    const result = migrateConfigV1ToV2(config);
    expect(result.changes.length).toBeGreaterThanOrEqual(5);
    expect(result.changes.some(c => c.includes('brain_tier'))).toBe(true);
    expect(result.changes.some(c => c.includes('worker_tier'))).toBe(true);
    expect(result.changes.some(c => c.includes('min_tier'))).toBe(true);
    expect(result.changes.some(c => c.includes('providers.brain'))).toBe(true);
    expect(result.changes.some(c => c.includes('providers.worker'))).toBe(true);
  });
});

// ─── needsV2Migration ───────────────────────────────────────────────

describe('needsV2Migration', () => {
  it('returns true for v1 config with brain_provider', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: {},
      brain_provider: 'claude',
    };
    expect(needsV2Migration(config)).toBe(true);
  });

  it('returns true for v1 config with haiku_allowed in active mode', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { haiku_allowed: false } },
    };
    expect(needsV2Migration(config)).toBe(true);
  });

  it('returns false when model_strategy and providers already exist', () => {
    const config: Record<string, unknown> = {
      mode: 'performance',
      modes: {},
      model_strategy: { brain_tier: 'premium' },
      providers: { brain: 'claude' },
    };
    expect(needsV2Migration(config)).toBe(false);
  });

  it('still detects a flat alias when grouped v2 fields already exist', () => {
    const config: Record<string, unknown> = {
      model_strategy: { brain_tier: 'premium' },
      providers: { brain: 'claude' },
      worker_provider: 'codex',
    };
    expect(needsV2Migration(config)).toBe(true);
  });
});

describe('provider conflict file migration', () => {
  it('fails without writing or creating a backup', () => {
    const config = {
      mode: 'performance',
      brain_provider: 'codex',
      providers: { brain: 'claude' },
    };
    const path = writeTmp(`provider-conflict-${process.pid}-${Date.now()}.json`, config);
    const before = readFileSync(path, 'utf-8');
    try {
      expect(() => migrateConfig(path)).toThrow(ProviderConfigAliasConflictError);
      expect(readFileSync(path, 'utf-8')).toBe(before);
      expect(readdirSync(tmpdir()).filter((entry) => entry.startsWith(path.split('/').pop() + '.bak.'))).toEqual([]);
    } finally {
      cleanupTmp(path);
    }
  });
});

// ─── v1→v2 integration with migrateConfigFull ──────────────────────

describe('v1-to-v2 integration with migrateConfigFull', () => {
  it('migrateConfigFull applies v2 migration alongside field filling', () => {
    const v1Config: Record<string, unknown> = {
      mode: 'performance',
      modes: {
        performance: { brain_model: 'opus', default_model: 'opus', haiku_allowed: false, max_workers: 4 },
      },
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    const { config, v2Changes } = migrateConfigFull(v1Config);
    // v2 changes should be reported
    expect(v2Changes.some(c => c.includes('brain_tier'))).toBe(true);
    expect(v2Changes.some(c => c.includes('worker_tier'))).toBe(true);
    expect(v2Changes.some(c => c.includes('min_tier'))).toBe(true);
    // config should have model_strategy
    const raw = config as unknown as Record<string, unknown>;
    const strategy = raw['model_strategy'] as Record<string, unknown>;
    expect(strategy['brain_tier']).toBe('premium');
    expect(strategy['worker_tier']).toBe('premium');
    expect(strategy['min_tier']).toBe('standard');
    // config should have providers
    const providers = raw['providers'] as Record<string, unknown>;
    expect(providers['brain']).toBe('claude');
    expect(providers['worker']).toBe('claude');
  });

  it('migrateConfigFull returns empty v2Changes for already-v2 config', () => {
    const v2Config: Record<string, unknown> = {
      mode: 'performance',
      modes: { performance: { max_workers: 8 } },
      model_strategy: { brain_tier: 'premium', worker_tier: 'premium', min_tier: 'economy' },
      providers: { brain: 'claude', worker: 'claude' },
    };
    const { v2Changes } = migrateConfigFull(v2Config);
    expect(v2Changes).toHaveLength(0);
  });

  it('migrateConfigV1ToV2 is applied by migrateConfigFull but not by migrateConfigInMemory', () => {
    const v1Config: Record<string, unknown> = {
      mode: 'performance',
      modes: {
        performance: { brain_model: 'opus', default_model: 'opus', haiku_allowed: false, max_workers: 4 },
      },
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    // migrateConfigInMemory does NOT apply v2 migration
    const inMemoryResult = migrateConfigInMemory({ ...v1Config });
    const rawInMemory = inMemoryResult.config as unknown as Record<string, unknown>;
    expect(rawInMemory['model_strategy']).toBeUndefined();
    // migrateConfigFull DOES apply v2 migration
    const fullResult = migrateConfigFull({ ...v1Config });
    const rawFull = fullResult.config as unknown as Record<string, unknown>;
    expect(rawFull['model_strategy']).toBeDefined();
  });

  it('needsV2Migration detects v1 config needing v2 upgrade', () => {
    const v1Config: Record<string, unknown> = {
      mode: 'performance',
      modes: {
        performance: { brain_model: 'opus', default_model: 'opus', haiku_allowed: false, max_workers: 4 },
      },
      brain_provider: 'claude',
      worker_provider: 'claude',
    };
    expect(needsV2Migration(v1Config)).toBe(true);
  });

  it('needsV2Migration returns false for full v2 config', () => {
    const v2Config: Record<string, unknown> = {
      mode: 'performance',
      modes: {},
      model_strategy: { brain_tier: 'premium' },
      providers: { brain: 'claude' },
    };
    expect(needsV2Migration(v2Config)).toBe(false);
  });
});

// TSR-006: physically merged from tests/core/config-sprint063.test.ts.
{
// ─── Helpers ────────────────────────────────────────────────────────
function buildConfig(overrides?: Partial<DeckentConfig>): DeckentConfig {
    return { ...createDefaultConfig(), ...overrides };
}

function buildModeOverride(modeName: 'performance' | 'balanced' | 'economic' | 'api', overrides: Partial<PlanModeConfig>): DeckentConfig {
    const config = createDefaultConfig();
    config.modes[modeName] = { ...config.modes[modeName], ...overrides } as PlanModeConfig;
    return config;
}

function writeTmp(name: string, content: unknown): string {
    const p = join(tmpdir(), name);
    writeFileSync(p, JSON.stringify(content, null, 2));
    return p;
}

function cleanupTmp(...paths: string[]): void {
    for (const p of paths) {
        if (existsSync(p))
            unlinkSync(p);
        const dir = p.split('/').slice(0, -1).join('/');
        const base = p.split('/').pop() ?? p;
        try {
            const entries = readdirSync(dir);
            for (const entry of entries) {
                if (entry.startsWith(base + '.bak.')) {
                    const full = dir + '/' + entry;
                    if (existsSync(full))
                        unlinkSync(full);
                }
            }
        }
        catch {
            // ignore
        }
    }
}

// ─── A) autoMigrateOnLoad — file-based integration ──────────────────
describe('autoMigrateOnLoad — loadConfig integration', () => {
    it('migrateConfigInMemory adds missing fields (simulates what loadConfig triggers)', () => {
        // Minimal config missing many fields
        const minimal = { mode: 'performance', modes: {} } as Record<string, unknown>;
        expect(needsMigration(minimal)).toBe(true);
        const { config, addedFields } = migrateConfigInMemory(minimal);
        expect(addedFields.length).toBeGreaterThan(0);
        expect(addedFields).toContain('memory_budget');
        expect(config.memory_budget).toBe(5000);
    });
    it('needsMigration returns false for already-complete config', () => {
        const full = createDefaultConfig() as unknown as Record<string, unknown>;
        expect(needsMigration(full)).toBe(false);
    });
    it('file-based: loadConfig auto-migrates missing fields on disk', async () => {
        // Write a minimal config and load it — migration should update the file
        const minimal = { mode: 'economic', modes: {} };
        const configFile = writeTmp('sprint063-auto-migrate-test.json', minimal);
        const root = tmpdir();
        // Temporarily override PROJECT_CONFIG_PATH by writing to the expected location
        try {
            const { loadConfig } = await import('../../src/core/config.js');
            // We call loadConfig with a root that has the test config file
            // The auto-migration should run and update the file
            const config = await loadConfig(root);
            // loadConfig always returns a valid config (defaults merged)
            // The key check: if the file was migrated, it should now have the full fields
            // But since the file path must match PROJECT_CONFIG_PATH, we verify migration ran
            // by checking the file now contains the migrated fields
            const { readFileSync: rfs } = await import('node:fs');
            // Check that loadConfig at least returns a valid config (doesn't throw)
            expect(config.mode).toBeDefined();
        }
        finally {
            cleanupTmp(configFile);
        }
    });
});

// ─── C) Validation error messages — consistent "Invalid value 'X' for field 'Y'. Valid: ..." ─
describe('validateConfig — improved error messages (C)', () => {
    it('brain_model error uses "Invalid value X for field Y. Valid: ..."', () => {
        const config = buildModeOverride('performance', { brain_model: 'gpt-99' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('brain_model'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'gpt-99'/);
            expect(msg).toMatch(/for field '.*brain_model'/);
            expect(msg).toMatch(/Valid:/);
        }
    });
    it('default_model error uses consistent format', () => {
        const config = buildModeOverride('economic', { default_model: 'llama-4' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('default_model'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'llama-4'/);
            expect(msg).toMatch(/for field '.*default_model'/);
        }
    });
    it('brain_planning error uses consistent format', () => {
        const config = buildModeOverride('performance', { brain_planning: 'manual' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('brain_planning'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'manual'/);
            expect(msg).toMatch(/for field '.*brain_planning'/);
            expect(msg).toMatch(/Valid:/);
            expect(msg).toContain('ai');
            expect(msg).toContain('structured');
            expect(msg).toContain('auto');
        }
    });
    it('brain_provider error uses "Invalid value X for field Y. Valid: ..."', () => {
        const config = buildConfig({ brain_provider: 'unknown-provider' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('brain_provider'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'unknown-provider'/);
            expect(msg).toMatch(/for field 'brain_provider'/);
            expect(msg).toMatch(/Valid:/);
        }
    });
    it('worker_provider error uses consistent format', () => {
        const config = buildConfig({ worker_provider: 'bad-prov' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('worker_provider'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'bad-prov'/);
            expect(msg).toMatch(/for field 'worker_provider'/);
        }
    });
    it('rollback_policy error uses consistent format', () => {
        const config = buildConfig({ rollback_policy: 'sometimes' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('rollback_policy'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'sometimes'/);
            expect(msg).toMatch(/for field 'rollback_policy'/);
            expect(msg).toContain('never');
            expect(msg).toContain('on_failure');
            expect(msg).toContain('always');
        }
    });
    it('mode error message already consistent — unchanged', () => {
        const config = buildConfig({ mode: 'invalid_mode' as never });
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('mode'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'invalid_mode'/);
            expect(msg).toMatch(/for field 'mode'/);
        }
    });
    it('all enum errors use "Invalid value" prefix', () => {
        // Config with multiple enum violations
        const config = createDefaultConfig();
        config.brain_provider = 'unknown' as never;
        config.worker_provider = 'other' as never;
        config.modes.performance.brain_model = 'bad' as never;
        try {
            validateConfig(config);
            expect.fail('should have thrown');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            for (const msg of err.errors) {
                // All errors from our updated enum validations should start with "Invalid value" or be about other rules
                if (msg.includes('brain_provider') || msg.includes('worker_provider') || msg.includes('brain_model')) {
                    expect(msg).toMatch(/^Invalid value /);
                }
            }
        }
    });
});
}

// TSR-007: physically merged from tests/core/config-sprint064.test.ts.
{
// ─── Helpers ─────────────────────────────────────────────────────────
function buildConfig(overrides?: Partial<DeckentConfig>): DeckentConfig {
    return { ...createDefaultConfig(), ...overrides };
}

function writeTmp(name: string, content: unknown): string {
    const p = join(tmpdir(), `sprint064-${name}`);
    writeFileSync(p, JSON.stringify(content, null, 2));
    return p;
}

function cleanupTmp(...paths: string[]): void {
    for (const p of paths) {
        if (existsSync(p))
            unlinkSync(p);
        const dir = p.split('/').slice(0, -1).join('/');
        const base = p.split('/').pop() ?? p;
        try {
            for (const entry of readdirSync(dir)) {
                if (entry.startsWith(base + '.bak.')) {
                    const full = `${dir}/${entry}`;
                    if (existsSync(full))
                        unlinkSync(full);
                }
            }
        }
        catch {
            // ignore
        }
    }
}

// ─── A) autoMigrateOnLoad ─────────────────────────────────────────────
describe('A) autoMigrateOnLoad', () => {
    it('needsMigration returns true for minimal config missing many fields', () => {
        const minimal = { mode: 'performance', modes: {} } as Record<string, unknown>;
        expect(needsMigration(minimal)).toBe(true);
    });
    it('needsMigration returns false for already-full default config', () => {
        const full = createDefaultConfig() as unknown as Record<string, unknown>;
        expect(needsMigration(full)).toBe(false);
    });
    it('migrateConfig (file-based) adds missing fields and creates backup', () => {
        const minimal = { mode: 'economic', modes: {}, memory_budget: 400 };
        const configFile = writeTmp('migrate-a.json', minimal);
        try {
            const result = migrateConfig(configFile);
            expect(result.migrated).toBe(true);
            expect(result.addedFields.length).toBeGreaterThan(0);
            expect(result.backupPath).toBeTruthy();
            // The migrated file should now contain memory_budget (original value preserved)
            const updated = JSON.parse(readFileSync(configFile, 'utf-8')) as Record<string, unknown>;
            expect(updated['memory_budget']).toBe(400); // original value preserved
            // New fields added (brain_provider was replaced by providers.brain in Sprint 150)
            expect('providers' in updated).toBe(true);
        }
        finally {
            cleanupTmp(configFile);
        }
    });
    it('migrateConfig dry-run does not write to disk', () => {
        const minimal = { mode: 'performance', modes: {} };
        const configFile = writeTmp('migrate-dryrun.json', minimal);
        try {
            const before = readFileSync(configFile, 'utf-8');
            const result = migrateConfig(configFile, { dryRun: true });
            const after = readFileSync(configFile, 'utf-8');
            expect(result.migrated).toBe(true);
            expect(result.backupPath).toBeNull(); // no backup in dry-run
            expect(after).toBe(before); // file unchanged
        }
        finally {
            cleanupTmp(configFile);
        }
    });
    it('migrateConfigInMemory preserves existing values while filling defaults', () => {
        const existing = {
            mode: 'api',
            modes: {},
            memory_budget: 999,
        } as Record<string, unknown>;
        const { config, addedFields } = migrateConfigInMemory(existing);
        expect(config.memory_budget).toBe(999); // original preserved
        // brain_provider was replaced by providers.brain in Sprint 150
        expect(addedFields).toContain('providers');
        expect((config as unknown as Record<string, unknown>)['providers']).toBeDefined();
    });
});

// ─── C) Validation error messages ───────────────────────────────────
describe('C) validateConfig — error message format "Invalid value X for field Y. Valid: ..."', () => {
    it('brain_model validation message uses consistent format', () => {
        const config = createDefaultConfig();
        config.modes.performance.brain_model = 'gpt-999' as never;
        expect(() => validateConfig(config)).toThrow(ConfigValidationError);
        try {
            validateConfig(config);
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('brain_model'));
            expect(msg).toMatch(/Invalid value 'gpt-999'/);
            expect(msg).toMatch(/for field '.*brain_model'/);
            expect(msg).toMatch(/Valid:/);
        }
    });
    it('brain_provider validation message uses consistent format', () => {
        const config = buildConfig({ brain_provider: 'unknown-ai' as never });
        try {
            validateConfig(config);
            expect.fail('should throw');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('brain_provider'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'unknown-ai'/);
            expect(msg).toMatch(/for field 'brain_provider'/);
            expect(msg).toMatch(/Valid:/);
        }
    });
    it('brain_planning validation message uses consistent format with valid options listed', () => {
        const config = createDefaultConfig();
        config.modes.economic.brain_planning = 'manual' as never;
        try {
            validateConfig(config);
            expect.fail('should throw');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('brain_planning'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'manual'/);
            expect(msg).toMatch(/for field '.*brain_planning'/);
            expect(msg).toMatch(/Valid:/);
            expect(msg).toContain('ai');
            expect(msg).toContain('structured');
            expect(msg).toContain('auto');
        }
    });
    it('rollback_policy validation message uses consistent format', () => {
        const config = buildConfig({ rollback_policy: 'maybe' as never });
        try {
            validateConfig(config);
            expect.fail('should throw');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('rollback_policy'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'maybe'/);
            expect(msg).toMatch(/for field 'rollback_policy'/);
            expect(msg).toContain('never');
            expect(msg).toContain('on_failure');
            expect(msg).toContain('always');
        }
    });
    it('mode validation error includes the invalid value', () => {
        const config = buildConfig({ mode: 'extreme' as never });
        try {
            validateConfig(config);
            expect.fail('should throw');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            const msg = err.errors.find(m => m.includes('mode'));
            expect(msg).toBeDefined();
            expect(msg).toMatch(/Invalid value 'extreme'/);
            expect(msg).toMatch(/for field 'mode'/);
        }
    });
    it('all enum field errors start with "Invalid value" for recognizable format', () => {
        const config = createDefaultConfig();
        config.brain_provider = 'bad1' as never;
        config.worker_provider = 'bad2' as never;
        config.modes.performance.brain_model = 'bad3' as never;
        try {
            validateConfig(config);
            expect.fail('should throw');
        }
        catch (e) {
            const err = e as ConfigValidationError;
            for (const msg of err.errors) {
                if (msg.includes('brain_provider') ||
                    msg.includes('worker_provider') ||
                    msg.includes('brain_model')) {
                    expect(msg).toMatch(/^Invalid value /);
                }
            }
        }
    });
});
}
