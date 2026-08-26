import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node:fs before importing the module under test
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(42),
  closeSync: vi.fn(),
  fsyncSync: vi.fn(),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import {
  ensureGlobalDir,
  readGlobalConfig,
  writeGlobalConfig,
  mergeWithProjectConfig,
  getGlobalConfigPath,
  isGlobalConfigPresent,
} from '../../src/core/global-config.js';
import { GLOBAL_CONFIG_PATH, GLOBAL_CREDENTIALS_DIR, GLOBAL_DECKENT_DIR } from '../../src/core/constants.js';
import { getDefaultConfig } from '../../src/core/config.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── ensureGlobalDir ─────────────────────────────────────────────────

describe('ensureGlobalDir', () => {
  it('creates both directories when neither exists', () => {
    mockedExistsSync.mockReturnValue(false);

    ensureGlobalDir();

    expect(mockedMkdirSync).toHaveBeenCalledWith(GLOBAL_DECKENT_DIR, { recursive: true });
    expect(mockedMkdirSync).toHaveBeenCalledWith(GLOBAL_CREDENTIALS_DIR, { recursive: true });
    expect(mockedMkdirSync).toHaveBeenCalledTimes(2);
  });

  it('is idempotent — does not create when directories already exist', () => {
    mockedExistsSync.mockReturnValue(true);

    ensureGlobalDir();

    expect(mockedMkdirSync).not.toHaveBeenCalled();
  });

  it('creates only credentials dir when deckent dir already exists', () => {
    mockedExistsSync
      .mockReturnValueOnce(true)   // GLOBAL_DECKENT_DIR exists
      .mockReturnValueOnce(false); // GLOBAL_CREDENTIALS_DIR does not

    ensureGlobalDir();

    expect(mockedMkdirSync).toHaveBeenCalledTimes(1);
    expect(mockedMkdirSync).toHaveBeenCalledWith(GLOBAL_CREDENTIALS_DIR, { recursive: true });
  });
});

// ─── readGlobalConfig ────────────────────────────────────────────────

describe('readGlobalConfig', () => {
  it('returns null when config file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = readGlobalConfig();

    expect(result).toBeNull();
  });

  it('returns parsed config when file exists with valid JSON', () => {
    const config = { mode: 'pro_plan' as const };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(config));

    const result = readGlobalConfig();

    expect(result).toEqual(config);
  });

  it('returns null for malformed JSON (readJsonSafe returns null)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{ not valid json }');

    expect(readGlobalConfig()).toBeNull();
  });

  it('reads from GLOBAL_CONFIG_PATH', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{}');

    readGlobalConfig();

    expect(mockedReadFileSync).toHaveBeenCalledWith(GLOBAL_CONFIG_PATH, 'utf-8');
  });

  it('returns partial config with only language set', () => {
    const config = { language: 'tr' };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(config));

    const result = readGlobalConfig();

    expect(result).toEqual({ language: 'tr' });
  });
});

// ─── writeGlobalConfig ──────────────────────────────────────────────

describe('writeGlobalConfig', () => {
  it('writes config as formatted JSON with trailing newline', () => {
    mockedExistsSync.mockReturnValue(true); // dirs exist

    const config = { mode: 'api' as const };
    writeGlobalConfig(config);

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/.deckent/.config.json.'),
      JSON.stringify(config, null, 2) + '\n',
      { mode: 0o600 },
    );
    expect(renameSync).toHaveBeenCalledWith(expect.stringContaining('.config.json.'), GLOBAL_CONFIG_PATH);
  });

  it('calls ensureGlobalDir before writing', () => {
    mockedExistsSync.mockReturnValue(false);

    writeGlobalConfig({ mode: 'pro_plan' });

    // ensureGlobalDir creates dirs before writeFileSync
    expect(mockedMkdirSync).toHaveBeenCalled();
    expect(mockedWriteFileSync).toHaveBeenCalled();
  });

  it('writes empty partial config correctly', () => {
    mockedExistsSync.mockReturnValue(true);

    writeGlobalConfig({});

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/.deckent/.config.json.'),
      '{}\n',
      { mode: 0o600 },
    );
  });
});

// ─── mergeWithProjectConfig ─────────────────────────────────────────

describe('mergeWithProjectConfig', () => {
  it('project config overrides global config', () => {
    const project = getDefaultConfig();
    project.mode = 'pro_plan';

    const global = { mode: 'api' as const };

    const result = mergeWithProjectConfig(project, global);

    expect(result.mode).toBe('pro_plan'); // project wins
  });

  it('uses global values when project has defaults', () => {
    const project = getDefaultConfig();
    const global = { language: 'tr' };

    const result = mergeWithProjectConfig(project, global);

    expect(result.language).toBe('tr'); // global fills in
  });

  it('project language overrides global language', () => {
    const project = getDefaultConfig();
    project.language = 'en';
    const global = { language: 'tr' };

    const result = mergeWithProjectConfig(project, global);

    expect(result.language).toBe('en'); // project wins
  });

  it('deep merges nested mode configs — project takes priority', () => {
    const project = getDefaultConfig();
    project.modes.performance.max_workers = 4;

    const global = {
      modes: {
        performance: { max_workers: 10 },
      },
    } as Partial<typeof project>;

    const result = mergeWithProjectConfig(project, global);

    expect(result.modes.performance.max_workers).toBe(4); // project wins
  });

  it('preserves global nested values not overridden by project', () => {
    const project = getDefaultConfig();
    // project has default projectName (undefined)
    const global = { projectName: 'my-global-project' };

    const result = mergeWithProjectConfig(project, global);

    // global projectName fills in since project doesn't override it
    expect(result.projectName).toBe('my-global-project');
  });

  it('returns a new object — does not mutate inputs', () => {
    const project = getDefaultConfig();
    const global = { language: 'tr' };

    const result = mergeWithProjectConfig(project, global);

    expect(result).not.toBe(project);
    expect(project.language).toBeUndefined(); // original untouched
  });
});

// ─── getGlobalConfigPath ────────────────────────────────────────────

describe('getGlobalConfigPath', () => {
  it('returns the GLOBAL_CONFIG_PATH constant', () => {
    const path = getGlobalConfigPath();

    expect(path).toBe(GLOBAL_CONFIG_PATH);
  });

  it('path contains .deckent/config.json', () => {
    const path = getGlobalConfigPath();

    expect(path).toContain('.deckent');
    expect(path).toContain('config.json');
  });
});

// ─── isGlobalConfigPresent ──────────────────────────────────────────

describe('isGlobalConfigPresent', () => {
  it('returns true when config file exists', () => {
    mockedExistsSync.mockReturnValue(true);

    expect(isGlobalConfigPresent()).toBe(true);
  });

  it('returns false when config file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);

    expect(isGlobalConfigPresent()).toBe(false);
  });

  it('checks the correct path', () => {
    mockedExistsSync.mockReturnValue(false);

    isGlobalConfigPresent();

    expect(mockedExistsSync).toHaveBeenCalledWith(GLOBAL_CONFIG_PATH);
  });
});
