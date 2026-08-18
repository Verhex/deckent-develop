import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getLanguage,
  resolveLanguage,
} from '../../src/cli/helpers/messages.js';
import { getLangFromConfig } from '../../src/cli/helpers/config-reader.js';
import { getLangFromRoot } from '../../src/cli/commands/status.js';
import { clearConfigCache, loadConfig } from '../../src/core/config.js';

const LANGUAGE_ENV_KEYS = [
  'DECKENT_LANGUAGE',
  'DECKENT_LANG',
  'LC_ALL',
  'LANG',
] as const;

type LanguageEnvKey = typeof LANGUAGE_ENV_KEYS[number];

describe('canonical language authority', () => {
  let root: string;
  let savedEnv: Record<LanguageEnvKey, string | undefined>;

  beforeEach(async () => {
    savedEnv = Object.fromEntries(
      LANGUAGE_ENV_KEYS.map((key) => [key, process.env[key]]),
    ) as Record<LanguageEnvKey, string | undefined>;
    for (const key of LANGUAGE_ENV_KEYS) delete process.env[key];
    clearConfigCache();
    root = await mkdtemp(join(tmpdir(), 'deckent-lang-authority-'));
  });

  afterEach(async () => {
    for (const key of LANGUAGE_ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearConfigCache();
    await rm(root, { recursive: true, force: true });
  });

  it('applies every precedence tier and normalizes locale values', () => {
    process.env['LANG'] = 'en_US.UTF-8';
    process.env['LC_ALL'] = 'tr_TR.UTF-8';
    process.env['DECKENT_LANG'] = 'en_GB';
    process.env['DECKENT_LANGUAGE'] = 'tr_TR';

    expect(resolveLanguage('en')).toBe('tr');
    delete process.env['DECKENT_LANGUAGE'];
    expect(resolveLanguage('tr')).toBe('en');
    delete process.env['DECKENT_LANG'];
    expect(resolveLanguage('en')).toBe('en');
    expect(resolveLanguage(undefined)).toBe('tr');
    delete process.env['LC_ALL'];
    expect(resolveLanguage(undefined)).toBe('en');
    delete process.env['LANG'];
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('keeps the short alias above config and lets unsupported sources fall through', () => {
    process.env['DECKENT_LANGUAGE'] = 'fr_FR';
    process.env['DECKENT_LANG'] = 'en';
    process.env['LC_ALL'] = 'fr_FR';
    process.env['LANG'] = 'tr_TR.UTF-8';

    expect(resolveLanguage('tr')).toBe('en');
    delete process.env['DECKENT_LANG'];
    expect(resolveLanguage('fr')).toBe('tr');
  });

  it('keeps getLanguage compatible while LANG supplies the no-config fallback', () => {
    process.env['LANG'] = 'tr_TR';
    expect(getLanguage(undefined)).toBe('tr');
  });

  it('makes all three public paths resolve the same config input', async () => {
    await mkdir(join(root, '.deckent'), { recursive: true });
    await writeFile(
      join(root, '.deckent', 'config.json'),
      JSON.stringify({ language: 'tr' }),
      'utf-8',
    );
    process.env['DECKENT_LANG'] = 'en';

    expect(resolveLanguage('tr')).toBe('en');
    expect(getLangFromConfig(root)).toBe('en');
    expect(getLangFromRoot(root)).toBe('en');
  });

  it('supports the short config env alias with long-name precedence', async () => {
    process.env['DECKENT_LANG'] = 'tr';
    expect((await loadConfig(root)).language).toBe('tr');

    clearConfigCache();
    process.env['DECKENT_LANGUAGE'] = 'en';
    expect((await loadConfig(root)).language).toBe('en');
  });
});
