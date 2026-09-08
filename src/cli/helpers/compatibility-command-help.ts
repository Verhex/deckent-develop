import type { Command } from 'commander';

import { getContract } from '../../core/cli-command-contract.js';
import {
  DEPRECATED_FORWARDING,
  type DeprecatedForwardingSurface,
} from '../surface-contract.js';
import { getLanguage, getMessage } from './messages.js';
import { print } from './output.js';

/** Split surface-contract replacement into inject flags + target segments. */
export function parseReplacementSurface(replacement: string): {
  readonly prefixFlags: readonly string[];
  readonly targetPath: readonly string[];
} {
  const parts = replacement.trim().split(/\s+/u).filter(Boolean);
  const prefixFlags: string[] = [];
  const targetPath: string[] = [];
  for (const part of parts) {
    if (part.startsWith('--')) prefixFlags.push(part);
    else targetPath.push(part);
  }
  return Object.freeze({ prefixFlags: Object.freeze(prefixFlags), targetPath: Object.freeze(targetPath) });
}

export function deprecationHelpText(warningKey: string, lang?: string): string {
  return `${getMessage(warningKey, lang ?? 'en')}\n`;
}

/** Output aliases may keep machine stdout pristine by supplying a stderr sink. */
export function emitDeprecatedForwardingWarning(
  surface: DeprecatedForwardingSurface,
  lang: string,
  sink: (message: string) => void = print,
): void {
  sink(getMessage(surface.warningKey, lang));
}

function findNestedCommand(program: Command, ...segments: string[]): Command | undefined {
  let current: Command | undefined = program;
  for (const segment of segments) {
    if (!current) return undefined;
    current = current.commands.find((candidate) => candidate.name() === segment);
  }
  return current;
}

/**
 * Resolve a help target from the parsed legacy arguments using only public
 * Commander shape: child command names and registered positional arguments.
 * An unknown child deliberately yields no canonical child help.
 */
export function resolveReplacementHelpCommand(
  program: Command,
  targetPath: readonly string[],
  legacyArgs: readonly string[] = [],
): Command | undefined {
  const initialReplacement = findNestedCommand(program, ...targetPath);
  if (!initialReplacement) return undefined;
  let replacement: Command = initialReplacement;
  for (const token of legacyArgs) {
    if (token.startsWith('-')) break;
    const child: Command | undefined = replacement.commands.find((candidate) => candidate.name() === token);
    if (child) {
      replacement = child;
      continue;
    }
    // Positional input belongs to the resolved leaf, not a nested command.
    if (replacement.registeredArguments.length > 0) break;
    return undefined;
  }
  return replacement;
}

/** Replacement help body from live Commander registration (SSOT), not rewired legacy options. */
export function replacementHelpBody(
  program: Command,
  targetPath: readonly string[],
  legacyCommand?: Command,
): string {
  const replacement = resolveReplacementHelpCommand(program, targetPath, legacyCommand?.args ?? []);
  if (!replacement) return '';
  // `helpInformation()` omits Commander `before`/`after` help text. Capture
  // the public `outputHelp()` surface so compatibility help includes the
  // canonical command's policy notices as well as its generated usage.
  // Commander mutates its configuration object in place, so retain a value
  // snapshot rather than the mutable object returned by configureOutput().
  const previousOutput = { ...replacement.configureOutput() };
  let rendered = '';
  replacement.configureOutput({
    ...previousOutput,
    writeOut: (chunk) => { rendered += chunk; },
    writeErr: (chunk) => { rendered += chunk; },
  });
  try {
    replacement.outputHelp();
  } finally {
    replacement.configureOutput(previousOutput);
  }
  // The enclosing addHelpText('after') supplies its own terminal newline.
  return rendered.trimEnd();
}

/** Baseline argv forwarding: prefix flags + user args, parsed with from:node semantics. */
export function buildBaselineForwardArgv(
  prefixFlags: readonly string[],
  args: readonly string[],
): string[] {
  return ['node', 'deckent', ...prefixFlags, ...args];
}

async function forwardDeprecatedAction(
  program: Command,
  surface: DeprecatedForwardingSurface,
  args: string[],
): Promise<void> {
  emitDeprecatedForwardingWarning(surface, getLanguage(undefined));
  const { prefixFlags, targetPath } = parseReplacementSurface(surface.replacement);
  const target = findNestedCommand(program, ...targetPath);
  if (!target) {
    throw new Error(`Replacement command is not registered: ${targetPath.join(' ')}`);
  }
  await target.parseAsync(buildBaselineForwardArgv(prefixFlags, args), { from: 'node' });
}

/** Register one deprecated forwarding alias (catch-all args, replacement help SSOT). */
export function registerDeprecatedForwarding(
  program: Command,
  surface: DeprecatedForwardingSurface,
): Command {
  const { targetPath } = parseReplacementSurface(surface.replacement);
  const contract = getContract(surface.command);
  const summaryKey = contract?.summaryKey ?? `cli.${surface.command.replace(/-/g, '_')}.desc`;
  const cmd = program
    .command(`${surface.command} [args...]`)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .description(getMessage(summaryKey, getLanguage(undefined)))
    .addHelpText('before', () => deprecationHelpText(surface.warningKey, getLanguage(undefined)))
    .addHelpText('after', ({ command }) => replacementHelpBody(program, targetPath, command))
    .action(async (args: string[]) => forwardDeprecatedAction(program, surface, args));
  return cmd;
}

/** Register every deprecated forwarding surface from surface-contract SSOT. */
export function registerAllDeprecatedForwardingSurfaces(program: Command): void {
  for (const surface of DEPRECATED_FORWARDING) {
    registerDeprecatedForwarding(program, surface);
  }
}

export function listDeprecatedForwardingCommands(): readonly string[] {
  return DEPRECATED_FORWARDING.map((surface) => surface.command);
}

export function getDeprecatedForwardingSurface(command: string): DeprecatedForwardingSurface | undefined {
  return DEPRECATED_FORWARDING.find((surface) => surface.command === command);
}

export const DEPRECATED_FORWARDING_SURFACES = DEPRECATED_FORWARDING;
