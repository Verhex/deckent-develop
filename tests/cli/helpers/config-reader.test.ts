import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

// Mock fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';
import { getLangFromConfig } from '../../../src/cli/helpers/config-reader.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

// getLangFromConfig delegates to the canonical resolveLanguage chain
// (DECKENT_LANGUAGE > DECKENT_LANG > config > LC_ALL > LANG > 'en'), so the
// host environment must be pinned for these tests to be hermetic.
const LANG_ENV_KEYS = ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of LANG_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of LANG_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('getLangFromConfig', () => {
  const root = '/test/project';

  it('should return language from config', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ language: 'tr' }));
    expect(getLangFromConfig(root)).toBe('tr');
  });

  it('should return "en" when config does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(getLangFromConfig(root)).toBe('en');
  });

  it('should return "en" on malformed JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not json');
    expect(getLangFromConfig(root)).toBe('en');
  });

  it('should return "en" when language field is missing', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ other: 'field' }));
    expect(getLangFromConfig(root)).toBe('en');
  });

  it('should return "en" when readFileSync throws', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    expect(getLangFromConfig(root)).toBe('en');
  });

  it('should fall through to the environment chain for an unsupported config language', () => {
    // Canonical contract (sprint-558 / 7085): an unsupported config value does
    // not pass through raw — it falls to the next source in the chain.
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ language: 'fr' }));
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLangFromConfig(root)).toBe('tr');
    delete process.env['LANG'];
    expect(getLangFromConfig(root)).toBe('en');
  });

  it('should be overridden by DECKENT_LANG env even when config is supported', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ language: 'tr' }));
    process.env['DECKENT_LANG'] = 'en';
    expect(getLangFromConfig(root)).toBe('en');
  });

  it('should read from PROJECT_CONFIG_PATH', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ language: 'en' }));
    getLangFromConfig(root);
    expect(mockExistsSync).toHaveBeenCalledWith(join(root, '.deckent', 'config.json'));
  });

  it('should return "en" for empty config object', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({}));
    expect(getLangFromConfig(root)).toBe('en');
  });
});

// Verify no local readJsonSafe/readLanguage in refactored files
describe('DRY verification', () => {

  const filesToCheck = [
    'src/cli/commands/finalize.ts',
    'src/cli/commands/run.ts',
    'src/monitor/auditor.ts',
    'src/orchestra/sprint-controller.ts',
    'src/orchestra/debt-manager.ts',
  ];

  for (const file of filesToCheck) {
    it(`${file} should not have local readJsonSafe definition`, async () => {
      const content = await readFile(join(process.cwd(), file), 'utf-8');
      expect(content).not.toMatch(/^function readJsonSafe/m);
    });
  }

  const langFilesToCheck = [
    'src/cli/commands/cleanup.ts',
    'src/cli/commands/doctor.ts',
    'src/cli/commands/finalize.ts',
  ];

  for (const file of langFilesToCheck) {
    it(`${file} should not have local readLanguage definition`, async () => {
      const content = await readFile(join(process.cwd(), file), 'utf-8');
      expect(content).not.toMatch(/^function readLanguage/m);
    });
  }
});
