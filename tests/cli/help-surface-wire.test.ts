/**
 * help-surface-wire.test.ts — CLI-CONTRACT-001
 *
 * `deckent --help` used to render Turkish command descriptions inside an
 * English frame: Commander emits its own section headings ('Usage:',
 * 'Options:', 'Commands:', …), its built-in `--help` labels, and index.ts
 * baked the root footer and the version-flag descriptions in as literals.
 *
 * This file proves the closure on both sides:
 *   1. WIRING   — the localized help chrome is actually attached to the real
 *                 program returned by buildProgram(), across the whole tree.
 *   2. NO-REGRESSION — the ENGLISH help output is byte-identical to what
 *                 Commander/index.ts rendered before (the `en` catalog rows
 *                 are the old literals), so localization changed nothing for
 *                 English users.
 *   3. CATALOG  — the family-merge mechanism rejects key collisions, and every
 *                 injected key is a real bilingual row.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Command, Help } from 'commander';

import {
  COMMANDER_DEFAULT_HEADINGS,
  COMMANDER_DEFAULT_HELP_DESCRIPTION,
  CLI_HELP_MESSAGE_KEYS,
  applyLocalizedHelp,
  attachRootHelpFooter,
  buildCliHelpLabels,
  collectCommandTree,
  localizeHelpTitle,
} from '../../src/cli/helpers/cli-help.js';
import {
  MESSAGE_CATALOG_FAMILIES,
  getMessage,
  getMessageLanguages,
  mergeMessageFamilies,
} from '../../src/cli/helpers/messages.js';
import { CLI_COMMON_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-common.js';
import { CLI_RUN_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-run.js';
import { CLI_MEMORY_CATALOG_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-memory-catalog.js';
import { CLI_GOVERNANCE_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-governance.js';
import { CLI_RUNTIME_HELP_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-runtime-help.js';
import { CLI_REFERENCE_MESSAGES } from '../../src/cli/helpers/message-catalog/cli-reference.js';

let buildProgram: () => Command;

beforeAll(async () => {
  const mod = await import('../../src/cli/index.js');
  buildProgram = mod.buildProgram;
});

/** A throwaway 2-level program — no dependency on the real CLI registration. */
function fixtureProgram(): Command {
  const root = new Command()
    .name('root')
    .description('root description')
    .option('-f, --flag', 'a flag');
  root
    .command('child')
    .description('child description')
    .argument('<name>', 'the name')
    .option('--deep', 'a deep flag');
  return root;
}

describe('cli-help — English output is byte-identical to Commander defaults', () => {
  it('every `en` heading row equals the exact string Commander emits', () => {
    const labels = buildCliHelpLabels('en');
    expect(labels.headings.usage).toBe(COMMANDER_DEFAULT_HEADINGS.usage);
    expect(labels.headings.arguments).toBe(COMMANDER_DEFAULT_HEADINGS.arguments);
    expect(labels.headings.options).toBe(COMMANDER_DEFAULT_HEADINGS.options);
    expect(labels.headings.globalOptions).toBe(COMMANDER_DEFAULT_HEADINGS.globalOptions);
    expect(labels.headings.commands).toBe(COMMANDER_DEFAULT_HEADINGS.commands);
  });

  it('the `en` built-in help labels equal Commander\'s own description', () => {
    const labels = buildCliHelpLabels('en');
    expect(labels.helpOptionDescription).toBe(COMMANDER_DEFAULT_HELP_DESCRIPTION);
    expect(labels.helpCommandDescription).toBe(COMMANDER_DEFAULT_HELP_DESCRIPTION);
  });

  it('the `en` root footer is the exact literal index.ts used to inline', () => {
    expect(buildCliHelpLabels('en').rootFooter).toBe(
      '\nRun `deckent info` for a localized (TR/EN) quick-reference of common commands.\n',
    );
  });

  it('the `en` version-flag descriptions are the exact previous literals', () => {
    const labels = buildCliHelpLabels('en');
    expect(labels.versionOptionDescription).toBe('output the version number with splash');
    expect(labels.versionJsonOptionDescription).toBe('output version info as JSON');
  });

  it('applying `en` labels leaves a fixture program\'s help output unchanged', () => {
    const before = fixtureProgram().helpInformation();
    const after = applyLocalizedHelp(fixtureProgram(), buildCliHelpLabels('en')).helpInformation();
    expect(after).toBe(before);
  });

  it('applying `en` labels leaves a SUBCOMMAND\'s help output unchanged', () => {
    const plain = fixtureProgram().commands[0]!.helpInformation();
    const wired = applyLocalizedHelp(fixtureProgram(), buildCliHelpLabels('en')).commands[0]!.helpInformation();
    expect(wired).toBe(plain);
  });
});

describe('cli-help — localization actually reaches the rendered output', () => {
  it('translates every known heading and passes unknown titles through', () => {
    const tr = buildCliHelpLabels('tr');
    expect(localizeHelpTitle('Usage:', tr)).toBe(tr.headings.usage);
    expect(localizeHelpTitle('Options:', tr)).toBe(tr.headings.options);
    expect(localizeHelpTitle('Commands:', tr)).toBe(tr.headings.commands);
    expect(localizeHelpTitle('Arguments:', tr)).toBe(tr.headings.arguments);
    expect(localizeHelpTitle('Global Options:', tr)).toBe(tr.headings.globalOptions);
    // A heading a future Commander adds must NOT be silently swallowed.
    expect(localizeHelpTitle('Some Future Heading:', tr)).toBe('Some Future Heading:');
  });

  it('renders Turkish headings in a fixture program\'s help output', () => {
    const tr = buildCliHelpLabels('tr');
    const output = applyLocalizedHelp(fixtureProgram(), tr).helpInformation();
    expect(output).toContain(tr.headings.usage);
    expect(output).toContain(tr.headings.options);
    expect(output).toContain(tr.headings.commands);
    expect(output).not.toContain('Usage:');
    expect(output).not.toContain('Options:');
  });

  it('renders the Turkish built-in --help description', () => {
    const tr = buildCliHelpLabels('tr');
    const output = applyLocalizedHelp(fixtureProgram(), tr).helpInformation();
    expect(output).toContain(tr.helpOptionDescription);
    expect(output).not.toContain(COMMANDER_DEFAULT_HELP_DESCRIPTION);
  });

  it('localizes SUBCOMMAND help too, including the Arguments heading', () => {
    const tr = buildCliHelpLabels('tr');
    const child = applyLocalizedHelp(fixtureProgram(), tr).commands[0]!;
    const output = child.helpInformation();
    expect(output).toContain(tr.headings.arguments);
    expect(output).toContain(tr.headings.usage);
    expect(output).not.toContain('Arguments:');
  });

  it('never rewrites a non-help option description', () => {
    const tr = buildCliHelpLabels('tr');
    const output = applyLocalizedHelp(fixtureProgram(), tr).helpInformation();
    expect(output).toContain('a flag');
  });

  it('is idempotent — re-applying with a different language replaces cleanly', () => {
    const program = fixtureProgram();
    applyLocalizedHelp(program, buildCliHelpLabels('tr'));
    applyLocalizedHelp(program, buildCliHelpLabels('en'));
    expect(program.helpInformation()).toBe(fixtureProgram().helpInformation());
  });

  it('collectCommandTree returns root first, then every descendant', () => {
    const program = fixtureProgram();
    const tree = collectCommandTree(program);
    expect(tree[0]).toBe(program);
    expect(tree).toHaveLength(2);
    expect(tree[1]!.name()).toBe('child');
  });

  it('attachRootHelpFooter appends the footer to the ROOT only', () => {
    const tr = buildCliHelpLabels('tr');
    const program = attachRootHelpFooter(fixtureProgram(), tr);
    expect(program.helpInformation()).toContain(tr.rootFooter.trim());
    expect(program.commands[0]!.helpInformation()).not.toContain(tr.rootFooter.trim());
  });
});

describe('cli-help — wiring into the real buildProgram() tree', () => {
  it('the real root program renders the localized footer', () => {
    const output = buildProgram().helpInformation();
    expect(output).toContain(buildCliHelpLabels('en').rootFooter.trim());
  });

  it('the real root program describes its version flags from the catalog', () => {
    const labels = buildCliHelpLabels('en');
    const flags = buildProgram().options.map((o) => ({ flags: o.flags, description: o.description }));
    const version = flags.find((o) => o.flags === '-V, --version');
    const versionJson = flags.find((o) => o.flags === '--version-json');
    expect(version?.description).toBe(labels.versionOptionDescription);
    expect(versionJson?.description).toBe(labels.versionJsonOptionDescription);
  });

  it('EVERY command in the real tree carries the localized help configuration', () => {
    const program = buildProgram();
    const tr = buildCliHelpLabels('tr');
    // Re-apply Turkish to the already-built tree — this is exactly the
    // per-invocation language switch, and it must reach every node.
    applyLocalizedHelp(program, tr);
    const unlocalized = collectCommandTree(program).filter((command) => {
      const helper = command.createHelp() as Help;
      return helper.styleTitle?.('Usage:') !== tr.headings.usage;
    });
    expect(unlocalized.map((c) => c.name())).toEqual([]);
    expect(collectCommandTree(program).length).toBeGreaterThan(100);
  });

  it('the real English help output still contains Commander\'s own headings', () => {
    const output = buildProgram().helpInformation();
    expect(output).toContain('Usage:');
    expect(output).toContain('Commands:');
    expect(output).toContain('Options:');
  });
});

describe('message-catalog family merge — collisions are mechanical, not review-based', () => {
  it('the cli-common family is registered and non-empty', () => {
    expect(MESSAGE_CATALOG_FAMILIES['cli-common']).toBe(CLI_COMMON_MESSAGES);
    expect(MESSAGE_CATALOG_FAMILIES['cli-run']).toBe(CLI_RUN_MESSAGES);
    expect(MESSAGE_CATALOG_FAMILIES['cli-memory-catalog']).toBe(CLI_MEMORY_CATALOG_MESSAGES);
    expect(MESSAGE_CATALOG_FAMILIES['cli-governance']).toBe(CLI_GOVERNANCE_MESSAGES);
    expect(MESSAGE_CATALOG_FAMILIES['cli-runtime-help']).toBe(CLI_RUNTIME_HELP_MESSAGES);
    expect(MESSAGE_CATALOG_FAMILIES['cli-reference']).toBe(CLI_REFERENCE_MESSAGES);
    expect(Object.keys(CLI_COMMON_MESSAGES).length).toBeGreaterThan(0);
  });

  it('every cli-common key lives in the reserved `cli.help.` namespace', () => {
    for (const key of Object.keys(CLI_COMMON_MESSAGES)) {
      expect(key.startsWith('cli.help.')).toBe(true);
    }
  });

  it('every key cli-help injects is a real bilingual (en+tr) catalog row', () => {
    for (const key of Object.values(CLI_HELP_MESSAGE_KEYS)) {
      const langs = getMessageLanguages(key);
      expect(langs, `${key} must be bilingual`).toContain('en');
      expect(langs, `${key} must be bilingual`).toContain('tr');
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });

  it('the injected keys are exactly the cli-common family keys', () => {
    expect(Object.values(CLI_HELP_MESSAGE_KEYS).slice().sort()).toEqual(
      Object.keys(CLI_COMMON_MESSAGES).slice().sort(),
    );
  });

  it('merging a family whose key already exists in the base THROWS', () => {
    expect(() =>
      mergeMessageFamilies(
        { 'a.key': { en: 'base', tr: 'taban' } },
        { intruder: { 'a.key': { en: 'other', tr: 'diğer' } } },
      ),
    ).toThrow(/family key collision/);
  });

  it('merging two families that share a key THROWS and names the family', () => {
    expect(() =>
      mergeMessageFamilies(
        {},
        {
          first: { 'shared.key': { en: 'one', tr: 'bir' } },
          second: { 'shared.key': { en: 'two', tr: 'iki' } },
        },
      ),
    ).toThrow(/second:shared\.key/);
  });

  it('a clean merge keeps base rows and adds family rows', () => {
    const merged = mergeMessageFamilies(
      { 'base.key': { en: 'base', tr: 'taban' } },
      { fam: { 'fam.key': { en: 'fam', tr: 'aile' } } },
    );
    expect(merged['base.key']).toEqual({ en: 'base', tr: 'taban' });
    expect(merged['fam.key']).toEqual({ en: 'fam', tr: 'aile' });
  });

  it('a real cli-common key resolves through getMessage() in both languages', () => {
    expect(getMessage('cli.help.heading.options', 'en')).toBe('Options:');
    expect(getMessage('cli.help.heading.options', 'tr')).toBe('Seçenekler:');
  });
});
