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
  const parts = replacement.trim().split(/\s+/).filter(Boolean);
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

function findNestedCommand(program: Command, ...segments: string[]): Command | undefined {
  let current: Command | undefined = program;
  for (const segment of segments) {
    if (!current) return undefined;
    current = current.commands.find((candidate) => candidate.name() === segment);
  }
  return current;
}

/** Replacement help body from live Commander registration (SSOT), not rewired legacy options. */
export function replacementHelpBody(program: Command, targetPath: readonly string[]): string {
  const replacement = findNestedCommand(program, ...targetPath);
  if (!replacement) return '';
  return replacement.helpInformation();
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
  print(getMessage(surface.warningKey, getLanguage(undefined)));
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
    .addHelpText('after', () => replacementHelpBody(program, targetPath))
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
