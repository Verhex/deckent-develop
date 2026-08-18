/**
 * 559-002 — CLI description catalog coverage.
 *
 * Mechanical scan (no command-name allowlist, no golden snapshot): walk every command
 * registered by buildProgram() and prove its help description is served by the shared
 * bilingual MESSAGES catalog rather than a hardcoded literal. A new command registered
 * with an English literal fails here without anyone remembering to update a list.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Command } from 'commander';
import { buildProgram } from '../../src/cli/index.js';
import {
  MESSAGE_KEYS,
  getMessage,
  getMessageLanguages,
} from '../../src/cli/helpers/messages.js';

const LANG_ENV_VARS = ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG'] as const;

interface WalkedCommand {
  readonly path: string;
  readonly description: string;
}

function walk(cmd: Command, prefix: string[] = []): WalkedCommand[] {
  const path = [...prefix, cmd.name()];
  const self: WalkedCommand = { path: path.join(' '), description: cmd.description() };
  return cmd.commands.reduce<WalkedCommand[]>(
    (acc, child) => acc.concat(walk(child as Command, path)),
    [self],
  );
}

/** text -> catalog keys whose `en` row renders exactly that text. */
function buildReverseIndex(lang: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const key of MESSAGE_KEYS) {
    const text = getMessage(key, lang);
    const bucket = index.get(text);
    if (bucket) bucket.push(key);
    else index.set(text, [key]);
  }
  return index;
}

function withLanguage(lang: string, fn: () => void): void {
  for (const name of LANG_ENV_VARS) delete process.env[name];
  process.env['DECKENT_LANGUAGE'] = lang;
  fn();
}

describe('CLI description catalog', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of LANG_ENV_VARS) saved.set(name, process.env[name]);
  });

  afterEach(() => {
    for (const name of LANG_ENV_VARS) {
      const value = saved.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('registers at least the known command surface', () => {
    let commands: WalkedCommand[] = [];
    withLanguage('en', () => {
      commands = walk(buildProgram());
    });
    // Guards against a silently empty walk making the assertions below vacuous.
    expect(commands.length).toBeGreaterThan(150);
  });

  it('gives every registered command a non-empty description', () => {
    let commands: WalkedCommand[] = [];
    withLanguage('en', () => {
      commands = walk(buildProgram());
    });

    const empty = commands.filter((c) => c.description.trim() === '').map((c) => c.path);
    expect(empty, `commands without a description: ${empty.join(', ')}`).toEqual([]);
  });

  it('serves every command description from a catalog key that carries both en and tr', () => {
    let commands: WalkedCommand[] = [];
    withLanguage('en', () => {
      commands = walk(buildProgram());
    });

    const byEnglishText = buildReverseIndex('en');
    const offenders: string[] = [];

    for (const command of commands) {
      const keys = byEnglishText.get(command.description) ?? [];
      const bilingual = keys.filter((key) => {
        const langs = getMessageLanguages(key);
        return langs.includes('en') && langs.includes('tr');
      });
      if (bilingual.length === 0) {
        offenders.push(
          keys.length === 0
            ? `${command.path}: off-catalog literal (${JSON.stringify(command.description)})`
            : `${command.path}: catalog key(s) ${keys.join('/')} lack a tr row`,
        );
      }
    }

    expect(offenders, `off-catalog descriptions:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps every cli.*.desc catalog entry bilingual and non-empty', () => {
    const descKeys = MESSAGE_KEYS.filter((k) => k.startsWith('cli.') && k.endsWith('.desc'));
    expect(descKeys.length).toBeGreaterThan(150);

    const broken = descKeys.filter((key) => {
      const langs = getMessageLanguages(key);
      return (
        !langs.includes('en') ||
        !langs.includes('tr') ||
        getMessage(key, 'en').trim() === '' ||
        getMessage(key, 'tr').trim() === ''
      );
    });
    expect(broken, `incomplete catalog rows: ${broken.join(', ')}`).toEqual([]);
  });

  it('resolves descriptions in the language DECKENT_LANGUAGE selects', () => {
    const samples = [
      { path: 'plan', key: 'cli.plan.desc' },
      { path: 'agent', key: 'cli.agent.desc' },
    ] as const;

    for (const lang of ['en', 'tr'] as const) {
      let commands: WalkedCommand[] = [];
      withLanguage(lang, () => {
        commands = walk(buildProgram());
      });

      for (const sample of samples) {
        const found = commands.find((c) => c.path === `deckent ${sample.path}`);
        expect(found, `command "${sample.path}" not registered`).toBeDefined();
        expect(found?.description).toBe(getMessage(sample.key, lang));
      }
    }

    // The two languages must actually differ — otherwise the assertions above
    // would pass on an English-only catalog.
    for (const sample of samples) {
      expect(getMessage(sample.key, 'tr')).not.toBe(getMessage(sample.key, 'en'));
    }
  });
});
