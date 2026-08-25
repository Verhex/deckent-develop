// src/cli/helpers/command-contract.ts
// ═══ CLI-CONTRACT-001 — Commander ⇄ contract verification adapter ══════════
//
// The DELIVERY-side half of the path-level CLI contract. `CLI_COMMAND_CONTRACTS`
// (src/core/cli-command-contract.ts) is pure core data with no Commander
// import; this adapter is the only place the two meet.
//
// It verifies the contract against the LIVE Commander tree in BOTH directions
// and on every declared axis:
//
//   • path        — every registered command path has a contract row, and
//                   every `cli`-surfaced contract row exists in the tree
//   • options     — exact ordered flag-string equality
//   • arguments   — name / required / variadic, in order
//   • aliases     — exact ordered equality
//   • hidden      — read through Commander's PUBLIC visibility API
//                   (`Help.visibleCommands`), never an `_`-prefixed internal
//   • group       — an actionless namespace parent must declare `effect=group`
//                   and an executable command may not do so
//   • defaultExecution / output — RE-DERIVED from the live option set via the
//                   core derivation functions, so a declared axis can never
//                   drift from the flags that justify it
//   • summary     — a row declaring `summaryBinding: 'exact'` must have
//                   `getMessage(summaryKey, lang) === command.description()`
//   • help text   — every option and argument descriptionKey must resolve to
//                   the live bilingual Commander help text
//
// `verifyCommandContract()` returns violations as data (tests assert on the
// whole list); `assertCommandContract()` is the throwing wrapper for runtime
// callers. Nothing here mutates the program.

import { Help, type Command } from 'commander';

import {
  CLI_COMMAND_CONTRACTS,
  contractPathKey,
  deriveDefaultExecution,
  deriveOutputMode,
  type CliCommandContract,
} from '../../core/cli-command-contract.js';
import { getMessage } from './messages.js';

export type ContractViolationKind =
  | 'command-missing-from-contract'
  | 'contract-path-missing-from-tree'
  | 'option-drift'
  | 'argument-drift'
  | 'alias-drift'
  | 'hidden-drift'
  | 'group-effect-drift'
  | 'default-execution-drift'
  | 'output-drift'
  | 'summary-binding-drift'
  | 'option-description-binding-drift'
  | 'argument-description-binding-drift';

export interface ContractViolation {
  /** Space-separated command path without the `deckent` root. */
  readonly path: string;
  readonly kind: ContractViolationKind;
  /** What the contract declares. */
  readonly expected: string;
  /** What the live Commander tree actually has. */
  readonly actual: string;
}

export interface CommanderNode {
  readonly path: string;
  readonly command: Command;
  /** False when the parent's help does not list this command. */
  readonly visible: boolean;
}

export interface CommanderArgumentShape {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
}

export interface VerifyContractOptions {
  /** Language used to resolve `summaryKey` for binding checks. Default `en`. */
  readonly lang?: string;
  /** Contract rows to verify against. Default: the canonical catalog. */
  readonly contracts?: readonly CliCommandContract[];
}

/**
 * Every command path in the tree, EXCLUDING the root program itself (the root
 * is the `deckent` binary, not a command) and excluding Commander's
 * auto-generated `help` subcommands (generated chrome, not a contracted
 * surface).
 */
export function walkCommanderTree(program: Command): readonly CommanderNode[] {
  const visit = (command: Command, prefix: readonly string[], parent?: Command): CommanderNode[] => {
    const path = [...prefix, command.name()];
    const visible = parent === undefined || isVisibleChild(parent, command);
    const self: CommanderNode[] =
      prefix.length === 0 && parent === undefined ? [] : [{ path: path.join(' '), command, visible }];
    return command.commands.reduce<CommanderNode[]>(
      (acc, child) => acc.concat(visit(child, parent === undefined ? [] : path, command)),
      self,
    );
  };
  return visit(program, [], undefined);
}

/**
 * Is `child` listed in `parent`'s help? Commander has no public `hidden`
 * getter, but `Help.visibleCommands()` IS public and is exactly the
 * visibility predicate `--help` itself uses.
 */
function isVisibleChild(parent: Command, child: Command): boolean {
  const helper = new Help();
  return helper.visibleCommands(parent).includes(child);
}

/** Ordered flag strings exactly as Commander holds them. */
export function describeCommanderOptions(command: Command): readonly string[] {
  return command.options.map((option) => option.flags);
}

/** Ordered positional-argument shapes exactly as Commander holds them. */
export function describeCommanderArguments(command: Command): readonly CommanderArgumentShape[] {
  return command.registeredArguments.map((argument) => ({
    name: argument.name(),
    required: argument.required,
    variadic: argument.variadic,
  }));
}

/**
 * Commander exposes command/option/argument shape publicly but has no public
 * action-handler predicate. `_actionHandler` is therefore isolated to this
 * one adapter seam. The contract battery pins the seam in both directions so
 * namespace parents cannot be documented as executable mutations again.
 */
export function isActionlessCommandGroup(command: Command): boolean {
  const inspectable = command as Command & { readonly _actionHandler?: unknown };
  return command.commands.length > 0 && typeof inspectable._actionHandler !== 'function';
}

function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Catalog templates may carry runtime placeholders such as `{providers}`. */
function catalogTextMatches(template: string, actual: string): boolean {
  if (template === actual) return true;
  const escaped = template
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{\w+\\\}/g, '[\\s\\S]+?');
  return new RegExp(`^${escaped}$`, 'u').test(actual);
}

/**
 * Verify the live Commander tree against the path-level contract. Returns
 * every violation found (never throws) so a test can assert on the complete,
 * readable list rather than the first failure.
 */
export function verifyCommandContract(
  program: Command,
  options: VerifyContractOptions = {},
): readonly ContractViolation[] {
  const lang = options.lang ?? 'en';
  const contracts = options.contracts ?? CLI_COMMAND_CONTRACTS;
  const violations: ContractViolation[] = [];

  const nodes = walkCommanderTree(program);
  const byPath = new Map(nodes.map((node) => [node.path, node]));
  const contractByPath = new Map(
    contracts.map((contract) => [contractPathKey(contract.path), contract] as const),
  );

  // ── direction 1: tree ⊆ contract ────────────────────────────────────────
  for (const node of nodes) {
    if (!contractByPath.has(node.path)) {
      violations.push({
        path: node.path,
        kind: 'command-missing-from-contract',
        expected: 'a CLI_COMMAND_CONTRACTS row',
        actual: 'none',
      });
    }
  }

  // ── direction 2: contract ⊆ tree, plus every per-row axis ───────────────
  for (const contract of contracts) {
    if (!contract.surfaces.includes('cli')) continue;
    const path = contractPathKey(contract.path);
    const node = byPath.get(path);
    if (!node) {
      violations.push({
        path,
        kind: 'contract-path-missing-from-tree',
        expected: 'a registered Commander command',
        actual: 'none',
      });
      continue;
    }

    const liveFlags = describeCommanderOptions(node.command);
    const contractFlags = contract.options.map((option) => option.flags);
    if (!sameList(liveFlags, contractFlags)) {
      violations.push({
        path,
        kind: 'option-drift',
        expected: contractFlags.join(' | '),
        actual: liveFlags.join(' | '),
      });
    }

    for (let index = 0; index < contract.options.length; index += 1) {
      const option = contract.options[index]!;
      const live = node.command.options[index];
      if (!live) continue;
      const expected = getMessage(option.descriptionKey, lang);
      if (!catalogTextMatches(expected, live.description)) {
        violations.push({
          path,
          kind: 'option-description-binding-drift',
          expected: `${option.flags} :: ${option.descriptionKey} => ${JSON.stringify(expected)}`,
          actual: JSON.stringify(live.description),
        });
      }
    }

    const liveArgs = describeCommanderArguments(node.command);
    const contractArgs = contract.arguments.map((argument) => ({
      name: argument.name,
      required: argument.required,
      variadic: argument.variadic,
    }));
    if (!sameList(liveArgs, contractArgs)) {
      violations.push({
        path,
        kind: 'argument-drift',
        expected: JSON.stringify(contractArgs),
        actual: JSON.stringify(liveArgs),
      });
    }

    for (let index = 0; index < contract.arguments.length; index += 1) {
      const argument = contract.arguments[index]!;
      const live = node.command.registeredArguments[index];
      if (!live) continue;
      const expected = getMessage(argument.descriptionKey, lang);
      if (!catalogTextMatches(expected, live.description)) {
        violations.push({
          path,
          kind: 'argument-description-binding-drift',
          expected: `${argument.name} :: ${argument.descriptionKey} => ${JSON.stringify(expected)}`,
          actual: JSON.stringify(live.description),
        });
      }
    }

    const liveAliases = node.command.aliases();
    if (!sameList(liveAliases, [...contract.aliases])) {
      violations.push({
        path,
        kind: 'alias-drift',
        expected: contract.aliases.join(' | '),
        actual: liveAliases.join(' | '),
      });
    }

    const liveHidden = !node.visible;
    if (liveHidden !== contract.hidden) {
      violations.push({
        path,
        kind: 'hidden-drift',
        expected: String(contract.hidden),
        actual: String(liveHidden),
      });
    }

    const liveGroup = isActionlessCommandGroup(node.command);
    const declaredGroup = contract.effect === 'group';
    if (liveGroup !== declaredGroup) {
      violations.push({
        path,
        kind: 'group-effect-drift',
        expected: declaredGroup ? 'actionless command group' : 'executable command path',
        actual: liveGroup ? 'actionless command group' : 'executable command path',
      });
    }

    const derivedExecution = deriveDefaultExecution(contract.effect, liveFlags);
    if (derivedExecution !== contract.defaultExecution) {
      violations.push({
        path,
        kind: 'default-execution-drift',
        expected: contract.defaultExecution,
        actual: derivedExecution,
      });
    }

    const derivedOutput = deriveOutputMode(liveFlags);
    if (derivedOutput !== contract.output) {
      violations.push({
        path,
        kind: 'output-drift',
        expected: contract.output,
        actual: derivedOutput,
      });
    }

    if (contract.summaryBinding === 'exact') {
      const rendered = getMessage(contract.summaryKey, lang);
      const description = node.command.description();
      if (rendered !== description) {
        violations.push({
          path,
          kind: 'summary-binding-drift',
          expected: `${contract.summaryKey} => ${JSON.stringify(rendered)}`,
          actual: JSON.stringify(description),
        });
      }
    }
  }

  return violations;
}

/** Throwing wrapper — for callers that want the contract enforced at runtime. */
export function assertCommandContract(program: Command, options: VerifyContractOptions = {}): void {
  const violations = verifyCommandContract(program, options);
  if (violations.length === 0) return;
  const detail = violations
    .map((violation) => `  ${violation.path} [${violation.kind}] expected=${violation.expected} actual=${violation.actual}`)
    .join('\n');
  throw new Error(`CLI command contract violated (${violations.length}):\n${detail}`);
}

export interface ContractCoverage {
  readonly treePaths: number;
  readonly contractRows: number;
  readonly cliContractRows: number;
  readonly verifiedPaths: number;
}

/** Coverage counters — lets a test prove the verification was not vacuous. */
export function contractCoverage(
  program: Command,
  contracts: readonly CliCommandContract[] = CLI_COMMAND_CONTRACTS,
): ContractCoverage {
  const nodes = walkCommanderTree(program);
  const paths = new Set(nodes.map((node) => node.path));
  const cliRows = contracts.filter((contract) => contract.surfaces.includes('cli'));
  return {
    treePaths: paths.size,
    contractRows: contracts.length,
    cliContractRows: cliRows.length,
    verifiedPaths: cliRows.filter((contract) => paths.has(contractPathKey(contract.path))).length,
  };
}
