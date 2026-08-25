// src/cli/helpers/cli-help.ts
// ═══ CLI-CONTRACT-001 — localized Commander help chrome ════════════════════
//
// Commander renders a fixed set of ENGLISH strings itself: the section
// headings ('Usage:', 'Arguments:', 'Options:', 'Global Options:',
// 'Commands:') and the built-in `--help` / `help` labels ('display help for
// command'). Those never passed through the i18n catalog, so `deckent --help`
// under DECKENT_LANGUAGE=tr rendered Turkish command descriptions inside an
// English frame.
//
// This module closes that gap by CALLER INJECTION: the caller resolves a
// `CliHelpLabels` bundle from the message catalog
// (helpers/message-catalog/cli-common.ts) and hands it to
// `applyLocalizedHelp()`, which wires it into Commander's public
// `configureHelp()` extension points (`styleTitle`, `optionDescription`,
// `subcommandDescription`). Nothing here reaches into Commander internals and
// nothing here contains a display literal — every string comes from the
// catalog.
//
// INVARIANT: the `en` catalog rows are byte-identical to Commander's own
// defaults, so English help output is unchanged by this wiring. Only the
// non-English faces differ.

import { Help, type Command, type Option } from 'commander';

import { getMessage } from './messages.js';

/** The exact heading strings Commander passes to `Help.styleTitle()`. */
export const COMMANDER_DEFAULT_HEADINGS = Object.freeze({
  usage: 'Usage:',
  arguments: 'Arguments:',
  options: 'Options:',
  globalOptions: 'Global Options:',
  commands: 'Commands:',
});

/** Commander's built-in description for `-h, --help` and the `help` command. */
export const COMMANDER_DEFAULT_HELP_DESCRIPTION = 'display help for command';

/** Catalog keys this module injects — one place, so tests can assert the set. */
export const CLI_HELP_MESSAGE_KEYS = Object.freeze({
  headingUsage: 'cli.help.heading.usage',
  headingArguments: 'cli.help.heading.arguments',
  headingOptions: 'cli.help.heading.options',
  headingGlobalOptions: 'cli.help.heading.global_options',
  headingCommands: 'cli.help.heading.commands',
  helpOption: 'cli.help.builtin.help_option',
  helpCommand: 'cli.help.builtin.help_command',
  rootFooter: 'cli.help.root_footer',
  versionOption: 'cli.help.option.version',
  versionJsonOption: 'cli.help.option.version_json',
});

/** Localized replacements for every string Commander itself would emit. */
export interface CliHelpLabels {
  readonly headings: Readonly<Record<keyof typeof COMMANDER_DEFAULT_HEADINGS, string>>;
  /** Description shown for the built-in `-h, --help` option. */
  readonly helpOptionDescription: string;
  /** Description shown for the built-in `help [command]` subcommand. */
  readonly helpCommandDescription: string;
  /** Footer appended to the ROOT program's help output only. */
  readonly rootFooter: string;
  /** Description of the root `-V, --version` flag. */
  readonly versionOptionDescription: string;
  /** Description of the root `--version-json` flag. */
  readonly versionJsonOptionDescription: string;
}

/** Resolve the whole help-chrome bundle for one language. */
export function buildCliHelpLabels(lang: string): CliHelpLabels {
  return {
    headings: Object.freeze({
      usage: getMessage(CLI_HELP_MESSAGE_KEYS.headingUsage, lang),
      arguments: getMessage(CLI_HELP_MESSAGE_KEYS.headingArguments, lang),
      options: getMessage(CLI_HELP_MESSAGE_KEYS.headingOptions, lang),
      globalOptions: getMessage(CLI_HELP_MESSAGE_KEYS.headingGlobalOptions, lang),
      commands: getMessage(CLI_HELP_MESSAGE_KEYS.headingCommands, lang),
    }),
    helpOptionDescription: getMessage(CLI_HELP_MESSAGE_KEYS.helpOption, lang),
    helpCommandDescription: getMessage(CLI_HELP_MESSAGE_KEYS.helpCommand, lang),
    rootFooter: getMessage(CLI_HELP_MESSAGE_KEYS.rootFooter, lang),
    versionOptionDescription: getMessage(CLI_HELP_MESSAGE_KEYS.versionOption, lang),
    versionJsonOptionDescription: getMessage(CLI_HELP_MESSAGE_KEYS.versionJsonOption, lang),
  };
}

/** Commander's `Help.formatHelp` signature — the whole rendered help string. */
type FormatHelp = (this: Help, cmd: Command, helper: Help) => string;

/**
 * MERGE a help-configuration patch into whatever the command already carries.
 *
 * Commander's `configureHelp()` REPLACES `_helpConfiguration` wholesale, so a
 * naive second call silently drops the first call's hooks (the root footer, in
 * practice). Every writer in this module goes through here instead.
 */
function mergeHelpConfiguration(command: Command, patch: Partial<Help>): void {
  const existing = (command.configureHelp() ?? {}) as Partial<Help>;
  command.configureHelp({ ...existing, ...patch });
}

/**
 * Translate one Commander heading. Unknown titles pass through untouched — a
 * future Commander heading must not be silently swallowed.
 */
export function localizeHelpTitle(title: string, labels: CliHelpLabels): string {
  for (const key of Object.keys(COMMANDER_DEFAULT_HEADINGS) as (keyof typeof COMMANDER_DEFAULT_HEADINGS)[]) {
    if (COMMANDER_DEFAULT_HEADINGS[key] === title) return labels.headings[key];
  }
  return title;
}

/** Every command in the tree, root first (depth-first, registration order). */
export function collectCommandTree(root: Command): readonly Command[] {
  return root.commands.reduce<Command[]>(
    (acc, child) => acc.concat(collectCommandTree(child)),
    [root],
  );
}

/**
 * Wire `labels` into `command` and every descendant via Commander's public
 * help-configuration hooks. Idempotent — re-applying with different labels
 * simply replaces the previous configuration, which is how a per-invocation
 * language switch works.
 *
 * The root footer is attached separately (`attachRootHelpFooter`) because it
 * belongs to the root program only, not to every subcommand.
 */
export function applyLocalizedHelp(command: Command, labels: CliHelpLabels): Command {
  for (const node of collectCommandTree(command)) {
    mergeHelpConfiguration(node, {
      styleTitle(title: string): string {
        return localizeHelpTitle(title, labels);
      },
      optionDescription(this: Help, option: Option): string {
        const base = Help.prototype.optionDescription.call(this, option);
        return base === COMMANDER_DEFAULT_HELP_DESCRIPTION ? labels.helpOptionDescription : base;
      },
      subcommandDescription(this: Help, subcommand: Command): string {
        const base = Help.prototype.subcommandDescription.call(this, subcommand);
        return base === COMMANDER_DEFAULT_HELP_DESCRIPTION ? labels.helpCommandDescription : base;
      },
    });
  }
  return command;
}

/**
 * Remember the ORIGINAL `formatHelp` of a root program the footer was attached
 * to, so a second `attachRootHelpFooter()` (a per-invocation language switch)
 * re-wraps the pristine formatter instead of stacking a second footer.
 */
const ROOT_FOOTER_BASE_FORMATTER = new WeakMap<Command, FormatHelp>();

/**
 * Append the localized root footer to the ROOT program's help output.
 *
 * Commander's own `.addHelpText('after', …)` writes through the `afterHelp`
 * EVENT, which only fires inside `outputHelp()` — it never reaches
 * `helpInformation()`, the string every programmatic consumer (and the help
 * surface tests) reads. The footer is therefore wired through the public
 * `configureHelp({ formatHelp })` extension point instead: it lands in BOTH
 * paths, and it lands on the ROOT only — subcommands copy help configuration at
 * creation time, and this runs after the tree is fully built.
 *
 * Idempotent: re-attaching with different labels REPLACES the footer rather
 * than stacking a second one.
 */
export function attachRootHelpFooter(program: Command, labels: CliHelpLabels): Command {
  const footer = labels.rootFooter.trim();
  const existing = (program.configureHelp() ?? {}) as Partial<Help>;
  const base: FormatHelp =
    ROOT_FOOTER_BASE_FORMATTER.get(program) ?? existing.formatHelp ?? Help.prototype.formatHelp;
  ROOT_FOOTER_BASE_FORMATTER.set(program, base);

  mergeHelpConfiguration(program, {
    formatHelp(this: Help, cmd: Command, helper: Help): string {
      const rendered = base.call(this, cmd, helper);
      return footer.length === 0 ? rendered : `${rendered}\n${footer}\n`;
    },
  });
  return program;
}
