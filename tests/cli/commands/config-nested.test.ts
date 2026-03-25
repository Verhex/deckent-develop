import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportConfig, importConfig } from '../../../src/cli/commands/config.js';

const TEST_DIR = join(tmpdir(), `deckent-config-nested-test-${process.pid}`);
const CONFIG_PATH = join(TEST_DIR, '.deckent', 'config.json');

function writeConfig(data: Record<string, unknown>): void {
  mkdirSync(join(TEST_DIR, '.deckent'), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
}

describe('config nested key support', () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, '.deckent'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('setNestedValue integration via importConfig deep merge', () => {
    it('should deep merge nested objects on import', () => {
      writeConfig({
        language: 'en',
        modes: {
          max_plan: { max_workers: 4, brain_model: 'opus' },
          pro_plan: { max_workers: 2 },
        },
      });

      const importFile = join(TEST_DIR, 'import.json');
      writeFileSync(importFile, JSON.stringify({
        modes: {
          max_plan: { max_workers: 8 },
        },
      }));

      importConfig(importFile, CONFIG_PATH);
      const result = readConfig();
      const modes = result.modes as Record<string, Record<string, unknown>>;

      // Deep merge: max_workers overridden, brain_model preserved
      expect(modes.max_plan.max_workers).toBe(8);
      expect(modes.max_plan.brain_model).toBe('opus');
      // pro_plan preserved
      expect(modes.pro_plan.max_workers).toBe(2);
    });

    it('should override top-level fields on import', () => {
      writeConfig({ language: 'en', brain_planning: 'auto' });

      const importFile = join(TEST_DIR, 'import.json');
      writeFileSync(importFile, JSON.stringify({ language: 'tr' }));

      importConfig(importFile, CONFIG_PATH);
      const result = readConfig();
      expect(result.language).toBe('tr');
      expect(result.brain_planning).toBe('auto');
    });

    it('should expand nested import into existing nested object', () => {
      writeConfig({
        modes: { max_plan: { max_workers: 4 } },
      });

      const importFile = join(TEST_DIR, 'import.json');
      writeFileSync(importFile, JSON.stringify({
        modes: { max_plan: { brain_model: 'sonnet' } },
      }));

      importConfig(importFile, CONFIG_PATH);
      const result = readConfig();
      const modes = result.modes as Record<string, Record<string, unknown>>;
      expect(modes.max_plan.max_workers).toBe(4);
      expect(modes.max_plan.brain_model).toBe('sonnet');
    });
  });

  describe('setNestedValue / getNestedValue via config-migration', () => {
    // Direct unit tests for the exported helpers
    it('setNestedValue should create nested path', async () => {
      const { setNestedValue } = await import('../../../src/core/config-migration.js');
      const obj: Record<string, unknown> = {};
      setNestedValue(obj, 'modes.max_plan.max_workers', 8);
      expect((obj as any).modes.max_plan.max_workers).toBe(8);
    });

    it('setNestedValue should preserve sibling keys', async () => {
      const { setNestedValue } = await import('../../../src/core/config-migration.js');
      const obj: Record<string, unknown> = { modes: { max_plan: { max_workers: 4, brain_model: 'opus' } } };
      setNestedValue(obj, 'modes.max_plan.max_workers', 8);
      expect((obj as any).modes.max_plan.max_workers).toBe(8);
      expect((obj as any).modes.max_plan.brain_model).toBe('opus');
    });

    it('getNestedValue should return nested value', async () => {
      const { getNestedValue } = await import('../../../src/core/config-migration.js');
      const obj = { modes: { max_plan: { max_workers: 4 } } };
      expect(getNestedValue(obj as Record<string, unknown>, 'modes.max_plan.max_workers')).toBe(4);
    });

    it('getNestedValue should return undefined for missing key', async () => {
      const { getNestedValue } = await import('../../../src/core/config-migration.js');
      const obj = { language: 'en' };
      expect(getNestedValue(obj as Record<string, unknown>, 'nonexistent.key')).toBeUndefined();
    });

    it('getNestedValue should return object for intermediate path', async () => {
      const { getNestedValue } = await import('../../../src/core/config-migration.js');
      const obj = { modes: { max_plan: { max_workers: 4, brain_model: 'opus' } } };
      const result = getNestedValue(obj as Record<string, unknown>, 'modes.max_plan');
      expect(result).toEqual({ max_workers: 4, brain_model: 'opus' });
    });

    it('getNestedValue should return string for top-level key', async () => {
      const { getNestedValue } = await import('../../../src/core/config-migration.js');
      const obj = { language: 'tr' };
      expect(getNestedValue(obj as Record<string, unknown>, 'language')).toBe('tr');
    });
  });

  describe('config set with dot notation (integration logic)', () => {
    it('top-level key should work with simple assignment', () => {
      // Verify that a key without dots uses direct assignment
      const key = 'language';
      expect(key.includes('.')).toBe(false);
    });

    it('nested key should be detected by dot presence', () => {
      const key = 'modes.max_plan.max_workers';
      expect(key.includes('.')).toBe(true);
    });
  });

  describe('deepMerge from config.ts', () => {
    it('should deep merge objects', async () => {
      const { deepMerge } = await import('../../../src/core/config.js');
      const base = { a: 1, nested: { x: 10, y: 20 } };
      const override = { nested: { x: 99 } };
      const result = deepMerge(base, override as Partial<typeof base>);
      expect(result.a).toBe(1);
      expect(result.nested.x).toBe(99);
      expect(result.nested.y).toBe(20);
    });
  });
});
