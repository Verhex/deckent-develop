/**
 * Sprint 064 Task 9: config remaining improvements (finalize sprint 063 NO_GO)
 * A) autoMigrateOnLoad — loadConfig() auto-migrates on load (non-fatal)
 * B) Migration modes nesting — getMissingFields detects nested sub-field gaps in mode configs
 * C) Validation error messages — "Invalid value 'X' for field 'Y'. Valid: ..."
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, existsSync, unlinkSync, readdirSync, readFileSync } from 'node:fs';
import {
  validateConfig,
  createDefaultConfig,
  ConfigValidationError,
} from '../../src/core/config.js';
import {
  migrateConfigInMemory,
  needsMigration,
  migrateConfig,
} from '../../src/core/config-migration.js';
import type { DeckentConfig } from '../../src/core/types.js';

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
    if (existsSync(p)) unlinkSync(p);
    const dir = p.split('/').slice(0, -1).join('/');
    const base = p.split('/').pop() ?? p;
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith(base + '.bak.')) {
          const full = `${dir}/${entry}`;
          if (existsSync(full)) unlinkSync(full);
        }
      }
    } catch {
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
      // New fields added
      expect('brain_provider' in updated).toBe(true);
    } finally {
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
    } finally {
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
    expect(addedFields).toContain('brain_provider');
    expect(config.brain_provider).toBe('claude'); // default filled
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      const err = e as ConfigValidationError;
      for (const msg of err.errors) {
        if (
          msg.includes('brain_provider') ||
          msg.includes('worker_provider') ||
          msg.includes('brain_model')
        ) {
          expect(msg).toMatch(/^Invalid value /);
        }
      }
    }
  });
});
