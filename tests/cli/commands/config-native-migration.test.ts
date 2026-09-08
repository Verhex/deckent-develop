import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { join } from 'node:path';

vi.mock('../../../src/core/config-migration.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/config-migration.js')>();
  return { ...actual, migrateConfig: vi.fn() };
});
vi.mock('../../../src/cli/helpers/output.js', () => ({ print: vi.fn(), printError: vi.fn() }));
vi.mock('../../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: vi.fn(() => '/fixture/project') }));
vi.mock('../../../src/cli/helpers/i18n.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/cli/helpers/i18n.js')>();
  return { ...actual, detectLang: vi.fn(() => 'en') };
});

import { migrateConfig } from '../../../src/core/config-migration.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { detectLang } from '../../../src/cli/helpers/i18n.js';
import { registerConfig } from '../../../src/cli/commands/config.js';

async function run(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerConfig(program);
  await program.parseAsync(['node', 'test', 'config', 'migrate', ...args]);
}

const base = { migrated: false, addedFields: [], backupPath: null };

describe('config migrate explicit native selection', () => {
  beforeEach(() => { vi.clearAllMocks(); process.exitCode = undefined; });
  afterEach(() => { process.exitCode = undefined; });

  it('passes the explicit provider/model pair to the canonical migration service', async () => {
    vi.mocked(migrateConfig).mockReturnValue({ ...base, migrated: true, nativeMigration: { status: 'applied', provider: 'openai', model: 'gpt-native' } });
    await run(['--native-provider', 'openai', '--native-model', 'gpt-native']);
    expect(migrateConfig).toHaveBeenCalledWith(expect.stringContaining(join('.deckent', 'config.json')), {
      dryRun: undefined, nativeProvider: 'openai', nativeModel: 'gpt-native',
    });
    expect(print).toHaveBeenCalledWith(expect.stringContaining('openai / gpt-native'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Restart Deckent'));
  });

  it.each([
    ['selection-required', 'Native migration needs an explicit provider and model selection.'],
    ['already-native', 'Native target is already configured: openai / gpt-native.'],
    ['planned', '[dry-run] Native target would be configured: openai / gpt-native.'],
  ] as const)('renders the %s state truthfully', async (status, expected) => {
    vi.mocked(migrateConfig).mockReturnValue({ ...base, nativeMigration: { status, provider: 'openai', model: 'gpt-native' } });
    await run(status === 'planned' ? ['--dry-run', '--native-provider', 'openai', '--native-model', 'gpt-native'] : []);
    expect(print).toHaveBeenCalledWith(expected);
  });

  it('localizes a typed refusal without exposing a raw migration error', async () => {
    vi.mocked(detectLang).mockReturnValue('tr');
    vi.mocked(migrateConfig).mockReturnValue({ ...base, nativeMigrationError: 'NATIVE_TARGET_CONFLICT' });
    await run(['--native-provider', 'openai', '--native-model', 'other']);
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('değişiklik yapılmadı') }));
    expect(process.exitCode).toBe(1);
  });

  it('emits one bounded JSON result without raw error or backup paths', async () => {
    vi.mocked(migrateConfig).mockReturnValue({
      ...base, nativeMigrationError: 'NATIVE_MODEL_INVALID',
      error: 'secret=/private/config api_key=must-not-print', backupPath: '/private/backup.json',
    });
    await run(['--native-provider', 'openai', '--native-model', 'bad', '--json']);
    expect(print).toHaveBeenCalledTimes(1);
    const output = String(vi.mocked(print).mock.calls[0]?.[0]);
    expect(JSON.parse(output)).toEqual({
      ok: false, migrated: false, addedFields: [], backupCreated: true,
      nativeMigrationError: 'NATIVE_MODEL_INVALID', errorCode: 'CONFIG_MIGRATION_FAILED',
    });
    expect(output).not.toContain('secret');
    expect(output).not.toContain('/private');
  });

  it('keeps thrown failures machine-readable without inventing mutation certainty', async () => {
    vi.mocked(migrateConfig).mockImplementation(() => { throw new Error('secret=/private/config'); });
    await run(['--json']);
    expect(print).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(print).mock.calls[0]?.[0]))).toEqual({
      ok: false, errorCode: 'CONFIG_MIGRATION_FAILED', mutationState: 'unknown',
    });
    expect(printError).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
