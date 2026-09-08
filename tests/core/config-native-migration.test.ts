import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createDefaultConfig } from '../../src/core/config.js';
import { migrateConfig } from '../../src/core/config-migration.js';
import * as configWriteAuthority from '../../src/core/config-write-authority.js';

vi.mock('../../src/core/config-write-authority.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config-write-authority.js')>();
  return {
    ...actual,
    withConfigWriteLock: vi.fn(actual.withConfigWriteLock),
    writeConfigJsonAtomic: vi.fn(actual.writeConfigJsonAtomic),
  };
});

const roots: string[] = [];

function writeConfig(overrides: Record<string, unknown> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-native-migration-'));
  roots.push(root);
  const configPath = join(root, 'config.json');
  const config = {
    ...(createDefaultConfig() as unknown as Record<string, unknown>),
    ...overrides,
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return configPath;
}

function backups(configPath: string): string[] {
  const prefix = `${basename(configPath)}.bak.`;
  return readdirSync(join(configPath, '..')).filter((entry) => entry.startsWith(prefix)).sort();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('explicit native config migration', () => {
  it('reports legacy selection-required without inventing a native target', () => {
    const configPath = writeConfig({ chat_provider: 'codex' });
    const before = readFileSync(configPath, 'utf8');

    const result = migrateConfig(configPath);

    expect(result).toMatchObject({
      migrated: false,
      backupPath: null,
      nativeMigration: { status: 'selection-required' },
    });
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(backups(configPath)).toEqual([]);
  });

  it('reports not-applicable when neither legacy nor native selection exists', () => {
    const configPath = writeConfig();
    expect(migrateConfig(configPath)).toMatchObject({
      migrated: false,
      backupPath: null,
      nativeMigration: { status: 'not-applicable' },
    });
  });

  it('dry-runs an explicit pair without lock, backup, or mutation', () => {
    const configPath = writeConfig({ chat_provider: 'codex' });
    const before = readFileSync(configPath, 'utf8');

    const result = migrateConfig(configPath, {
      dryRun: true,
      nativeProvider: 'openai',
      nativeModel: 'gpt-5.6-sol',
    });

    expect(result).toMatchObject({
      migrated: true,
      backupPath: null,
      nativeMigration: { status: 'planned', provider: 'openai', model: 'gpt-5.6-sol' },
    });
    expect(configWriteAuthority.withConfigWriteLock).not.toHaveBeenCalled();
    expect(configWriteAuthority.writeConfigJsonAtomic).not.toHaveBeenCalled();
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(backups(configPath)).toEqual([]);
  });

  it('applies an explicit pair atomically and preserves legacy and Brain identities', () => {
    const configPath = writeConfig({
      chat_provider: 'codex',
      providers: { brain: 'gemini', worker: 'claude' },
    });
    const before = readFileSync(configPath, 'utf8');

    const result = migrateConfig(configPath, {
      nativeProvider: 'openai',
      nativeModel: 'gpt-5.6-sol',
    });

    expect(result).toMatchObject({
      migrated: true,
      nativeMigration: { status: 'applied', provider: 'openai', model: 'gpt-5.6-sol' },
    });
    expect(configWriteAuthority.withConfigWriteLock).toHaveBeenCalledTimes(1);
    expect(configWriteAuthority.writeConfigJsonAtomic).toHaveBeenCalledTimes(1);
    expect(readFileSync(result.backupPath!, 'utf8')).toBe(before);
    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written).toMatchObject({
      chat_provider: 'codex',
      native_provider: 'openai',
      native_model: 'gpt-5.6-sol',
      providers: { brain: 'gemini', worker: 'claude' },
    });
  });

  it('is byte-and-backup idempotent when the exact native pair is already present', () => {
    const configPath = writeConfig({ chat_provider: 'codex' });
    migrateConfig(configPath, { nativeProvider: 'ollama', nativeModel: 'qwen2.5-coder:32b' });
    const afterFirst = readFileSync(configPath, 'utf8');
    const backupsAfterFirst = backups(configPath);
    vi.clearAllMocks();

    const result = migrateConfig(configPath, {
      nativeProvider: 'ollama',
      nativeModel: 'qwen2.5-coder:32b',
    });

    expect(result).toMatchObject({
      migrated: false,
      backupPath: null,
      nativeMigration: { status: 'already-native', provider: 'ollama', model: 'qwen2.5-coder:32b' },
    });
    expect(configWriteAuthority.writeConfigJsonAtomic).not.toHaveBeenCalled();
    expect(readFileSync(configPath, 'utf8')).toBe(afterFirst);
    expect(backups(configPath)).toEqual(backupsAfterFirst);
  });

  it.each([
    [{ nativeProvider: 'openai' }, 'NATIVE_SELECTION_INCOMPLETE'],
    [{ nativeModel: 'gpt-5.6' }, 'NATIVE_SELECTION_INCOMPLETE'],
    [{ nativeProvider: 'codex', nativeModel: 'gpt-5.6-sol' }, 'NATIVE_PROVIDER_INVALID'],
    [{ nativeProvider: 'openai', nativeModel: '' }, 'NATIVE_MODEL_INVALID'],
    [{ nativeProvider: 'openai', nativeModel: 'gpt-5.6\nunsafe' }, 'NATIVE_MODEL_INVALID'],
    [{ nativeProvider: 'openai', nativeModel: 'gpt-5.6' }, 'NATIVE_MODEL_INVALID'],
    [{ nativeProvider: 'ollama', nativeModel: 'opus' }, 'NATIVE_MODEL_INVALID'],
    [{ nativeProvider: 'openai', nativeModel: ' gpt-5.6-sol' }, 'NATIVE_MODEL_INVALID'],
    [{ nativeProvider: 'openai', nativeModel: 'gpt-5.6-sol ' }, 'NATIVE_MODEL_INVALID'],
  ] as const)('refuses invalid requested selection %j without mutation', (options, code) => {
    // Explicit aliases and whitespace must fail here exactly as
    // resolveNativeSelection fails them before adapter/credential lookup.
    const configPath = writeConfig({ chat_provider: 'claude' });
    const before = readFileSync(configPath, 'utf8');

    const result = migrateConfig(configPath, options);

    expect(result).toMatchObject({ migrated: false, backupPath: null, nativeMigrationError: code });
    expect(configWriteAuthority.writeConfigJsonAtomic).not.toHaveBeenCalled();
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(backups(configPath)).toEqual([]);
  });

  it('rejects runtime-incompatible aliases and fills an existing matching exact half', () => {
    const conflictPath = writeConfig({
      chat_provider: 'claude',
      native_provider: 'ollama',
      native_model: 'qwen2.5-coder:32b',
    });
    const conflictBefore = readFileSync(conflictPath, 'utf8');
    const conflict = migrateConfig(conflictPath, { nativeProvider: 'openai', nativeModel: 'gpt-5.6-sol' });
    expect(conflict.nativeMigrationError).toBe('NATIVE_TARGET_CONFLICT');
    expect(readFileSync(conflictPath, 'utf8')).toBe(conflictBefore);
    expect(backups(conflictPath)).toEqual([]);

    const partialPath = writeConfig({ chat_provider: 'claude', native_provider: 'openai' });
    expect(migrateConfig(partialPath, { nativeProvider: 'openai', nativeModel: 'gpt-5.6-sol' })).toMatchObject({
      migrated: true,
      nativeMigration: { status: 'applied', provider: 'openai', model: 'gpt-5.6-sol' },
    });
    expect(JSON.parse(readFileSync(partialPath, 'utf8'))).toMatchObject({
      native_provider: 'openai',
      native_model: 'gpt-5.6-sol',
    });
  });

  it('preserves provider-only and model-only boot configs in ordinary generic migration', () => {
    for (const overrides of [
      { native_provider: 'ollama' },
      { native_model: 'qwen2.5-coder:32b' },
    ]) {
      const configPath = writeConfig(overrides);
      const before = readFileSync(configPath, 'utf8');
      const result = migrateConfig(configPath);
      expect(result.nativeMigrationError).toBeUndefined();
      expect(readFileSync(configPath, 'utf8')).toBe(before);
      expect(backups(configPath)).toEqual([]);
    }
  });

  it('refuses an explicit legacy opt-out without mutation', () => {
    const defaults = createDefaultConfig();
    const configPath = writeConfig({
      chat_provider: 'claude',
      terminal: { ...defaults.terminal, native_agent: false },
    });
    const before = readFileSync(configPath, 'utf8');

    const result = migrateConfig(configPath, { nativeProvider: 'openai', nativeModel: 'gpt-5.6-sol' });

    expect(result).toMatchObject({
      migrated: false,
      backupPath: null,
      nativeMigrationError: 'NATIVE_LEGACY_OPT_OUT',
    });
    expect(readFileSync(configPath, 'utf8')).toBe(before);
    expect(backups(configPath)).toEqual([]);
  });

  it('never overwrites an existing same-timestamp backup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T10:11:12.345Z'));
    const configPath = writeConfig({ chat_provider: 'codex' });
    const collidingPath = `${configPath}.bak.2026-09-08T10-11-12-345Z`;
    writeFileSync(collidingPath, 'existing-backup-sentinel', 'utf8');

    const result = migrateConfig(configPath, { nativeProvider: 'openai', nativeModel: 'gpt-5.6-sol' });

    expect(readFileSync(collidingPath, 'utf8')).toBe('existing-backup-sentinel');
    const backupName = basename(result.backupPath!);
    const collisionName = basename(collidingPath);
    expect(backupName.startsWith(`${collisionName}.`)).toBe(true);
    expect(backupName.slice(collisionName.length + 1)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(existsSync(result.backupPath!)).toBe(true);
  });

  it('reads the apply preimage only after entering the write lock', () => {
    const configPath = writeConfig({ chat_provider: 'claude' });
    const latest = {
      ...(createDefaultConfig() as unknown as Record<string, unknown>),
      chat_provider: 'gemini',
    };
    vi.mocked(configWriteAuthority.withConfigWriteLock).mockImplementationOnce((_path, action) => {
      writeFileSync(configPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
      return action();
    });

    migrateConfig(configPath, { nativeProvider: 'openai', nativeModel: 'gpt-5.6-sol' });

    const written = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    expect(written['chat_provider']).toBe('gemini');
  });
});
