/**
 * Deterministic CLI reference generator.
 *
 * Source chain:
 *   CliCommandContract -> live Commander registration -> bilingual catalog
 *   -> Markdown reference + internal JSON manifest.
 *
 * Usage:
 *   npx tsx scripts/generate-cli-docs.ts --write
 *   npx tsx scripts/generate-cli-docs.ts --check
 *
 * No source regex and no hand-maintained command list are used.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

import {
  cliContracts,
  contractPathKey,
  type CliCommandContract,
} from '../src/core/cli-command-contract.js';
import { buildProgram } from '../src/cli/index.js';
import {
  verifyCommandContract,
  walkCommanderTree,
} from '../src/cli/helpers/command-contract.js';
import { getMessage } from '../src/cli/helpers/messages.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = resolve(dirname(SCRIPT_PATH), '..');

export type CliReferenceLanguage = 'en' | 'tr';

export interface CliDocOption {
  readonly flags: string;
  readonly description: string;
  readonly descriptionKey: string;
  readonly hidden: boolean;
}

export interface CliDocArgument {
  readonly name: string;
  readonly token: string;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly description: string;
  readonly descriptionKey: string;
}

export interface CliDocCommand {
  readonly path: string;
  readonly description: string;
  readonly summaryKey: string;
  readonly longDescription?: string;
  readonly effect: CliCommandContract['effect'];
  readonly defaultExecution: CliCommandContract['defaultExecution'];
  readonly authority: CliCommandContract['authority'];
  readonly output: CliCommandContract['output'];
  readonly platforms: readonly string[];
  readonly aliases: readonly string[];
  readonly hidden: boolean;
  readonly catalogDependent: boolean;
  readonly options: readonly CliDocOption[];
  readonly arguments: readonly CliDocArgument[];
}

function withLanguage<T>(lang: CliReferenceLanguage, run: () => T): T {
  const previous = process.env['DECKENT_LANGUAGE'];
  process.env['DECKENT_LANGUAGE'] = lang;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env['DECKENT_LANGUAGE'];
    else process.env['DECKENT_LANGUAGE'] = previous;
  }
}

function argumentToken(argument: CliCommandContract['arguments'][number]): string {
  const body = `${argument.name}${argument.variadic ? '...' : ''}`;
  return argument.required ? `<${body}>` : `[${body}]`;
}

function commandRow(
  contract: CliCommandContract,
  command: Command,
  lang: CliReferenceLanguage,
): CliDocCommand {
  return {
    path: contractPathKey(contract.path),
    description: command.description(),
    summaryKey: contract.summaryKey,
    ...(contract.longDescriptionKey === undefined
      ? {}
      : { longDescription: getMessage(contract.longDescriptionKey, lang) }),
    effect: contract.effect,
    defaultExecution: contract.defaultExecution,
    authority: contract.authority,
    output: contract.output,
    platforms: contract.platforms,
    aliases: contract.aliases,
    hidden: contract.hidden,
    catalogDependent: contract.catalogDependent,
    options: contract.options.map((option, index) => ({
      flags: option.flags,
      descriptionKey: option.descriptionKey,
      description: command.options[index]!.description,
      hidden: command.options[index]!.hidden,
    })),
    arguments: contract.arguments.map((argument, index) => ({
      name: argument.name,
      token: argumentToken(argument),
      required: argument.required,
      variadic: argument.variadic,
      descriptionKey: argument.descriptionKey,
      description: command.registeredArguments[index]!.description,
    })),
  };
}

/** Build docs rows from the canonical contract and the real Commander tree. */
export function buildCliCommandRows(
  lang: CliReferenceLanguage,
  options: { readonly includeHidden?: boolean } = {},
): readonly CliDocCommand[] {
  return withLanguage(lang, () => {
    const program = buildProgram();
    const violations = verifyCommandContract(program, { lang });
    if (violations.length > 0) {
      const detail = violations
        .map((violation) => `${violation.path}:${violation.kind}`)
        .join(', ');
      throw new Error(`E_CLI_DOC_CONTRACT_DRIFT:${detail}`);
    }
    const nodes = new Map(walkCommanderTree(program).map((node) => [node.path, node.command]));
    return cliContracts()
      .filter((contract) => options.includeHidden === true || !contract.hidden)
      .map((contract) => {
        const path = contractPathKey(contract.path);
        const command = nodes.get(path);
        if (!command) throw new Error(`E_CLI_DOC_PATH_MISSING:${path}`);
        return commandRow(contract, command, lang);
      });
  });
}

/** Compatibility export: now a derived projection, never a hand-maintained array. */
export const CLI_COMMANDS: readonly CliDocCommand[] = buildCliCommandRows('en');

function message(key: string, lang: CliReferenceLanguage): string {
  const result = getMessage(key, lang);
  if (result === key) throw new Error(`E_CLI_DOC_MESSAGE_MISSING:${key}:${lang}`);
  return result;
}

function tableCell(input: string): string {
  return input.replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ').trim();
}

function code(input: string): string {
  return `\`${input.replace(/`/gu, '\\`')}\``;
}

function anchor(path: string): string {
  return `deckent-${path.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`;
}

function localizedValue(kind: string, enumValue: string, lang: CliReferenceLanguage): string {
  return message(`cli.reference.${kind}.${enumValue}`, lang);
}

function renderIndex(rows: readonly CliDocCommand[], lang: CliReferenceLanguage): string[] {
  const lines = [
    `## ${message('cli.reference.index', lang)}`,
    '',
    `| ${message('cli.reference.col.command', lang)} | ${message('cli.reference.col.description', lang)} | ${message('cli.reference.col.effect', lang)} | ${message('cli.reference.col.default_execution', lang)} | ${message('cli.reference.col.authority', lang)} | ${message('cli.reference.col.output', lang)} |`,
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    lines.push(
      `| [${code(`deckent ${row.path}`)}](#${anchor(row.path)}) | ${tableCell(row.description)} | ${localizedValue('effect', row.effect, lang)} | ${localizedValue('execution', row.defaultExecution, lang)} | ${localizedValue('authority', row.authority, lang)} | ${localizedValue('output', row.output, lang)} |`,
    );
  }
  return lines;
}

function renderCommand(row: CliDocCommand, lang: CliReferenceLanguage): string[] {
  const publicOptions = row.options.filter((option) => !option.hidden);
  const usage = `deckent ${row.path}${row.arguments.length > 0 ? ` ${row.arguments.map((argument) => argument.token).join(' ')}` : ''}`;
  const lines = [
    `<a id="${anchor(row.path)}"></a>`,
    `## ${code(`deckent ${row.path}`)}`,
    '',
    row.description,
    '',
    `**Usage:** ${code(usage)}`,
  ];
  if (row.longDescription && row.longDescription !== row.description) {
    lines.push('', `### ${message('cli.reference.long_description', lang)}`, '', row.longDescription);
  }
  lines.push(
    '',
    `### ${message('cli.reference.contract', lang)}`,
    '',
    `| ${message('cli.reference.col.effect', lang)} | ${message('cli.reference.col.default_execution', lang)} | ${message('cli.reference.col.authority', lang)} | ${message('cli.reference.col.output', lang)} | ${message('cli.reference.col.platforms', lang)} | ${message('cli.reference.col.aliases', lang)} |`,
    '|---|---|---|---|---|---|',
    `| ${localizedValue('effect', row.effect, lang)} | ${localizedValue('execution', row.defaultExecution, lang)} | ${localizedValue('authority', row.authority, lang)} | ${localizedValue('output', row.output, lang)} | ${row.platforms.map(code).join(', ')} | ${row.aliases.length > 0 ? row.aliases.map(code).join(', ') : message('cli.reference.none', lang)} |`,
  );
  if (publicOptions.length > 0) {
    lines.push(
      '',
      `### ${message('cli.reference.options', lang)}`,
      '',
      `| ${message('cli.reference.col.flags', lang)} | ${message('cli.reference.col.description', lang)} |`,
      '|---|---|',
      ...publicOptions.map((option) => `| ${code(option.flags)} | ${tableCell(option.description)} |`),
    );
  }
  if (row.arguments.length > 0) {
    lines.push(
      '',
      `### ${message('cli.reference.arguments', lang)}`,
      '',
      `| ${message('cli.reference.col.argument', lang)} | ${message('cli.reference.col.description', lang)} | ${message('cli.reference.col.required', lang)} | ${message('cli.reference.col.variadic', lang)} |`,
      '|---|---|---|---|',
      ...row.arguments.map((argument) =>
        `| ${code(argument.token)} | ${tableCell(argument.description)} | ${message(argument.required ? 'cli.reference.yes' : 'cli.reference.no', lang)} | ${message(argument.variadic ? 'cli.reference.yes' : 'cli.reference.no', lang)} |`,
      ),
    );
  }
  return lines;
}

/** Render the complete public CLI reference for one language. */
export function generateCliDocs(
  rows: readonly CliDocCommand[] = CLI_COMMANDS,
  lang: CliReferenceLanguage = 'en',
): string {
  if (rows.length === 0) throw new Error('E_CLI_DOC_EMPTY_COMMAND_SET');
  const lines = [
    `# ${message('cli.reference.title', lang)}`,
    '',
    `> **${message('cli.reference.generated', lang)}**`,
    `> ${message('cli.reference.regenerate', lang)}`,
    '',
    message('cli.reference.intro', lang),
    '',
    ...renderIndex(rows, lang),
  ];
  for (const row of rows) lines.push('', '---', '', ...renderCommand(row, lang));
  return `${lines.join('\n')}\n`;
}

export interface CliDocGeneration {
  readonly target: string;
  readonly content: string;
  readonly count: number;
  readonly exists: boolean;
  readonly drift: boolean;
}

function buildInternalManifest(): string {
  const en = buildCliCommandRows('en', { includeHidden: true });
  const tr = new Map(buildCliCommandRows('tr', { includeHidden: true }).map((row) => [row.path, row]));
  const commands = en.map((row) => {
    const translated = tr.get(row.path);
    if (!translated) throw new Error(`E_CLI_DOC_TR_PATH_MISSING:${row.path}`);
    return {
      path: row.path,
      summaryKey: row.summaryKey,
      description: { en: row.description, tr: translated.description },
      effect: row.effect,
      defaultExecution: row.defaultExecution,
      authority: row.authority,
      output: row.output,
      platforms: row.platforms,
      aliases: row.aliases,
      hidden: row.hidden,
      catalogDependent: row.catalogDependent,
      options: row.options.map((option, index) => ({
        flags: option.flags,
        descriptionKey: option.descriptionKey,
        description: { en: option.description, tr: translated.options[index]!.description },
        hidden: option.hidden,
      })),
      arguments: row.arguments.map((argument, index) => ({
        name: argument.name,
        token: argument.token,
        required: argument.required,
        variadic: argument.variadic,
        descriptionKey: argument.descriptionKey,
        description: { en: argument.description, tr: translated.arguments[index]!.description },
      })),
    };
  });
  return `${JSON.stringify({ schemaVersion: 1, commands }, null, 2)}\n`;
}

/** Compute all CLI doc targets and drift without writing. */
export function collectCliDocGenerations(root = DEFAULT_ROOT): readonly CliDocGeneration[] {
  const en = buildCliCommandRows('en');
  const tr = buildCliCommandRows('tr');
  const publicCount = cliContracts().filter((row) => !row.hidden).length;
  if (en.length !== tr.length || en.length !== publicCount) {
    throw new Error('E_CLI_DOC_PUBLIC_COUNT_DRIFT');
  }
  const candidates = [
    { target: 'docs/generated/en/reference/cli.md', content: generateCliDocs(en, 'en'), count: en.length },
    { target: 'docs/generated/tr/reference/cli.md', content: generateCliDocs(tr, 'tr'), count: tr.length },
    { target: 'docs/generated/cli-manifest.json', content: buildInternalManifest(), count: cliContracts().length },
  ];
  return candidates.map((candidate) => {
    const path = join(root, candidate.target);
    const exists = existsSync(path);
    const actual = exists ? readFileSync(path, 'utf8') : '';
    return { ...candidate, exists, drift: actual !== candidate.content };
  });
}

export function main(argv: readonly string[] = process.argv.slice(2), root = DEFAULT_ROOT): number {
  const args = new Set(argv);
  const check = args.has('--check');
  const write = args.has('--write') || (!check && args.size === 0);
  if ((check && write) || [...args].some((arg) => arg !== '--check' && arg !== '--write')) {
    process.stderr.write('usage: generate-cli-docs.ts [--check | --write]\n');
    return 2;
  }
  const generations = collectCliDocGenerations(root);
  if (check) {
    const drifting = generations.filter((generation) => generation.drift);
    for (const generation of generations) {
      process.stdout.write(`${generation.drift ? 'DRIFT' : 'OK'} ${generation.target} (${generation.count})\n`);
    }
    return drifting.length === 0 ? 0 : 1;
  }
  for (const generation of generations) {
    const target = join(root, generation.target);
    mkdirSync(dirname(target), { recursive: true });
    if (generation.drift) writeFileSync(target, generation.content, 'utf8');
    process.stdout.write(`${generation.drift ? 'WRITE' : 'OK'} ${generation.target} (${generation.count})\n`);
  }
  return 0;
}

if (basename(process.argv[1] ?? '') === 'generate-cli-docs.ts') {
  process.exitCode = main();
}
