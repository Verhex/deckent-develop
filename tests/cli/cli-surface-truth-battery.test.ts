/**
 * cli-surface-truth-battery.test.ts — CLI-CONTRACT-001
 *
 * The path-level CLI contract (`src/core/cli-command-contract.ts`) claims to
 * be the SSOT for what the `deckent` binary actually exposes. This battery is
 * the proof: it verifies that claim against the LIVE Commander tree built by
 * `buildProgram()` — not a snapshot, not a fixture — on every declared axis
 * (path, options, arguments, aliases, hidden, defaultExecution, output,
 * summary binding), in BOTH directions, and it proves the verification is not
 * vacuous by asserting coverage counters.
 *
 * Ground truth sources (all live):
 *   - tree:     buildProgram() from src/cli/index.js
 *   - contract: CLI_COMMAND_CONTRACTS from src/core/cli-command-contract.js
 *   - catalog:  getMessage() from src/cli/helpers/messages.js
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { Command } from 'commander';

import {
  CLI_COMMAND_CONTRACTS,
  CONTRACT_SUMMARY_BINDING_DEBT,
  cliContracts,
  contractArgumentCoverage,
  contractOptionCoverage,
  contractPathKey,
  deriveDefaultExecution,
  deriveOutputMode,
  getContract,
  outputCarriesJson,
  registryContracts,
  ALL_PLATFORMS,
  EFFECT_TO_RISK,
} from '../../src/core/cli-command-contract.js';
import {
  assertCommandContract,
  contractCoverage,
  describeCommanderArguments,
  describeCommanderOptions,
  isActionlessCommandGroup,
  verifyCommandContract,
  walkCommanderTree,
  type ContractViolation,
} from '../../src/cli/helpers/command-contract.js';
import { getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';

let buildProgram: () => Command;
let program: Command;

beforeAll(async () => {
  const mod = await import('../../src/cli/index.js');
  buildProgram = mod.buildProgram;
  program = buildProgram();
});

/** Render violations so a failure message names the exact drifting paths. */
function format(violations: readonly ContractViolation[]): string[] {
  return violations.map((v) => `${v.path} [${v.kind}] expected=${v.expected} actual=${v.actual}`);
}

describe('CLI contract ⇄ live Commander tree — full-tree verification', () => {
  it('reports ZERO violations across every path and every declared axis', () => {
    expect(format(verifyCommandContract(program))).toEqual([]);
  });

  it('assertCommandContract() does not throw on the real program', () => {
    expect(() => assertCommandContract(program)).not.toThrow();
  });

  it('verification is not vacuous — coverage counters match the real tree', () => {
    const coverage = contractCoverage(program);
    // Every walked path is a real command path (root excluded, generated
    // `help` subcommands excluded by the walker).
    expect(coverage.treePaths).toBeGreaterThan(100);
    expect(coverage.contractRows).toBe(CLI_COMMAND_CONTRACTS.length);
    expect(coverage.cliContractRows).toBe(cliContracts().length);
    // Nothing declared `cli` may be missing from the tree.
    expect(coverage.verifiedPaths).toBe(coverage.cliContractRows);
    // And the tree carries no path the contract does not cover.
    expect(coverage.cliContractRows).toBe(coverage.treePaths);
  });

  it('walks nested sub-paths, not just top-level commands', () => {
    const paths = walkCommanderTree(program).map((node) => node.path);
    expect(paths.some((p) => p.split(' ').length >= 2)).toBe(true);
    expect(paths).not.toContain('deckent');
    expect(paths.filter((p) => p.split(' ').pop() === 'help')).toEqual([]);
  });
});

describe('CLI contract ⇄ live Commander tree — per-axis drift is actually caught', () => {
  // A verification that cannot fail proves nothing. Each case mutates ONE
  // axis of a real contract row and asserts the exact violation kind surfaces.
  const realPath = 'agent';

  function rowFor(path: string) {
    const contract = getContract(path);
    expect(contract, `contract row for "${path}" must exist`).toBeDefined();
    return contract!;
  }

  it('detects option drift', () => {
    const row = rowFor(realPath);
    const mutated = { ...row, options: [...row.options, { flags: '--not-real <x>' }] };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('option-drift');
  });

  it('detects argument drift', () => {
    const row = rowFor(realPath);
    const mutated = {
      ...row,
      arguments: [...row.arguments, { name: 'ghost', required: true, variadic: false }],
    };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('argument-drift');
  });

  it('detects alias drift', () => {
    const row = rowFor(realPath);
    const mutated = { ...row, aliases: [...row.aliases, 'definitely-not-an-alias'] };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('alias-drift');
  });

  it('detects hidden drift', () => {
    const row = rowFor(realPath);
    const mutated = { ...row, hidden: !row.hidden };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('hidden-drift');
  });

  it('detects actionless-group effect drift in both directions', () => {
    const group = rowFor('plugin');
    const executable = rowFor('status');
    const groupKinds = verifyCommandContract(program, {
      contracts: [{ ...group, effect: 'local-write', defaultExecution: 'apply' }],
    }).map((v) => v.kind);
    const executableKinds = verifyCommandContract(program, {
      contracts: [{ ...executable, effect: 'group' }],
    }).map((v) => v.kind);
    expect(groupKinds).toContain('group-effect-drift');
    expect(executableKinds).toContain('group-effect-drift');
  });

  it('detects defaultExecution drift', () => {
    const row = rowFor(realPath);
    const other = row.defaultExecution === 'apply' ? 'dry-run' : 'apply';
    const mutated = { ...row, defaultExecution: other as typeof row.defaultExecution };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('default-execution-drift');
  });

  it('detects output drift', () => {
    const row = rowFor(realPath);
    const other = row.output === 'stream' ? 'text' : 'stream';
    const mutated = { ...row, output: other as typeof row.output };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('output-drift');
  });

  it('detects a contract path that no longer exists in the tree', () => {
    const row = rowFor(realPath);
    const mutated = { ...row, path: ['no-such-command'] };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('contract-path-missing-from-tree');
  });

  it('detects a live command with no contract row at all', () => {
    const violations = verifyCommandContract(program, { contracts: [] });
    expect(violations.every((v) => v.kind === 'command-missing-from-contract')).toBe(true);
    expect(violations.length).toBe(walkCommanderTree(program).length);
  });

  it('detects summary-binding drift when summaryKey stops matching the description', () => {
    const bound = cliContracts().find((c) => c.summaryBinding === 'exact');
    expect(bound, 'at least one row must declare summaryBinding: exact').toBeDefined();
    const mutated = { ...bound!, summaryKey: 'cmdCatalog.__definitely_missing__.summary' };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('summary-binding-drift');
  });

  it('detects option-description binding drift', () => {
    const row = cliContracts().find((contract) => contract.options.length > 0)!;
    const mutated = {
      ...row,
      options: row.options.map((option, index) => index === 0
        ? { ...option, descriptionKey: 'cmdCatalog.__definitely_missing__.option' }
        : option),
    };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('option-description-binding-drift');
  });

  it('detects argument-description binding drift', () => {
    const row = cliContracts().find((contract) => contract.arguments.length > 0)!;
    const mutated = {
      ...row,
      arguments: row.arguments.map((argument, index) => index === 0
        ? { ...argument, descriptionKey: 'cmdCatalog.__definitely_missing__.argument' }
        : argument),
    };
    const kinds = verifyCommandContract(program, { contracts: [mutated] }).map((v) => v.kind);
    expect(kinds).toContain('argument-description-binding-drift');
  });

  it('assertCommandContract() throws with every violation named', () => {
    expect(() => assertCommandContract(program, { contracts: [] })).toThrow(
      /CLI command contract violated \(\d+\)/,
    );
  });
});

describe('CLI contract — structural execution/output derivations stay closed', () => {
  it('defaultExecution equals the derivation from effect + live flags for every cli row', () => {
    const nodes = new Map(walkCommanderTree(program).map((n) => [n.path, n.command]));
    const drift: string[] = [];
    for (const contract of cliContracts()) {
      const command = nodes.get(contractPathKey(contract.path));
      if (!command) continue;
      const flags = describeCommanderOptions(command);
      if (deriveDefaultExecution(contract.effect, flags) !== contract.defaultExecution) {
        drift.push(contractPathKey(contract.path));
      }
    }
    expect(drift).toEqual([]);
  });

  it('output equals the derivation from the live flags for every cli row', () => {
    const nodes = new Map(walkCommanderTree(program).map((n) => [n.path, n.command]));
    const drift: string[] = [];
    for (const contract of cliContracts()) {
      const command = nodes.get(contractPathKey(contract.path));
      if (!command) continue;
      if (deriveOutputMode(describeCommanderOptions(command)) !== contract.output) {
        drift.push(contractPathKey(contract.path));
      }
    }
    expect(drift).toEqual([]);
  });

  it('a --json flag always derives a json-carrying output mode', () => {
    expect(outputCarriesJson(deriveOutputMode(['--json']))).toBe(true);
    expect(deriveOutputMode(['--json'])).toBe('text-and-json');
    expect(deriveOutputMode(['--follow'])).toBe('stream');
    expect(deriveOutputMode([])).toBe('text');
    expect(outputCarriesJson(deriveOutputMode([]))).toBe(false);
  });

  it('an execute opt-in flag turns a mutating command into a dry-run default', () => {
    expect(deriveDefaultExecution('group', [])).toBe('read');
    expect(deriveDefaultExecution('read', ['--json'])).toBe('read');
    expect(deriveDefaultExecution('mixed', ['--apply'])).toBe('read');
    expect(deriveDefaultExecution('local-write', ['--apply'])).toBe('dry-run');
    expect(deriveDefaultExecution('local-write', [])).toBe('apply');
  });
});

describe('CLI contract — row shape invariants', () => {
  it('has no duplicate path keys', () => {
    const keys = CLI_COMMAND_CONTRACTS.map((c) => contractPathKey(c.path));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('every row declares at least one surface and a non-empty path', () => {
    const bad = CLI_COMMAND_CONTRACTS.filter((c) => c.surfaces.length === 0 || c.path.length === 0);
    expect(bad.map((c) => c.path.join(' '))).toEqual([]);
  });

  it('mixed paths explicitly separate a read default from opt-in mutation capability', () => {
    const mixed = cliContracts().filter((contract) => contract.effect === 'mixed');
    expect(mixed.length).toBeGreaterThanOrEqual(10);
    expect(mixed.every((contract) => contract.defaultExecution === 'read')).toBe(true);
    expect(mixed.every((contract) => contract.authority !== 'open')).toBe(true);
  });

  it('every row declares a real platform set drawn from ALL_PLATFORMS', () => {
    const bad = CLI_COMMAND_CONTRACTS.filter(
      (c) => c.platforms.length === 0 || c.platforms.some((p) => !ALL_PLATFORMS.includes(p)),
    );
    expect(bad.map((c) => c.path.join(' '))).toEqual([]);
    // EVERY ENVIRONMENT: the matrix is declared per row, never assumed.
    expect(ALL_PLATFORMS).toEqual(['darwin', 'linux', 'win32']);
  });

  it('every effect maps to a plain-risk-language value', () => {
    for (const contract of CLI_COMMAND_CONTRACTS) {
      expect(EFFECT_TO_RISK[contract.effect]).toBeTruthy();
    }
  });

  it('summaryKey is an i18n key, never display text', () => {
    for (const contract of CLI_COMMAND_CONTRACTS) {
      expect(contract.summaryKey).toMatch(/^[a-zA-Z0-9_.-]+$/);
      expect(contract.summaryKey).toContain('.');
    }
  });

  it('every registry-projected row is a single-segment top-level path', () => {
    const bad = registryContracts().filter((c) => c.path.length !== 1);
    expect(bad.map((c) => c.path.join(' '))).toEqual([]);
    expect(registryContracts().length).toBeGreaterThan(0);
  });

  it('contractPathKey normalizes both accepted input shapes', () => {
    expect(contractPathKey(['agent', 'list'])).toBe('agent list');
    expect(contractPathKey('agent list')).toBe('agent list');
  });
});

describe('CLI contract — summary and help bindings are complete', () => {
  it('every summaryBinding: exact row really resolves through the catalog (en)', () => {
    expect(format(verifyCommandContract(program, { lang: 'en' }).filter((v) => v.kind === 'summary-binding-drift'))).toEqual([]);
  });

  it('has no command-summary binding debt', () => {
    const recomputed = cliContracts()
      .filter((c) => c.summaryBinding !== 'exact')
      .map((c) => contractPathKey(c.path));
    expect([...CONTRACT_SUMMARY_BINDING_DEBT].sort()).toEqual([...recomputed].sort());
    expect(CONTRACT_SUMMARY_BINDING_DEBT).toEqual([]);
  });

  it('every option and argument descriptionKey is a real bilingual catalog row', () => {
    const missing: string[] = [];
    for (const contract of CLI_COMMAND_CONTRACTS) {
      for (const option of contract.options) {
        const languages = getMessageLanguages(option.descriptionKey);
        if (!languages.includes('en') || !languages.includes('tr')) {
          missing.push(`${contractPathKey(contract.path)} :: ${option.descriptionKey}`);
        }
      }
      for (const argument of contract.arguments) {
        const languages = getMessageLanguages(argument.descriptionKey);
        if (!languages.includes('en') || !languages.includes('tr')) {
          missing.push(`${contractPathKey(contract.path)} :: ${argument.descriptionKey}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('option and argument contract coverage is complete', () => {
    const options = contractOptionCoverage();
    const arguments_ = contractArgumentCoverage();
    expect(options.total).toBeGreaterThan(0);
    expect(options.catalogBound).toBe(options.total);
    expect(arguments_.total).toBeGreaterThan(0);
    expect(arguments_.catalogBound).toBe(arguments_.total);
  });

  it('every option and argument description binding matches the live Turkish tree', () => {
    const previous = process.env['DECKENT_LANGUAGE'];
    process.env['DECKENT_LANGUAGE'] = 'tr';
    try {
      const turkishProgram = buildProgram();
      const helpDrift = verifyCommandContract(turkishProgram, { lang: 'tr' }).filter(
        (violation) => violation.kind === 'option-description-binding-drift'
          || violation.kind === 'argument-description-binding-drift',
      );
      expect(format(helpDrift)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env['DECKENT_LANGUAGE'];
      else process.env['DECKENT_LANGUAGE'] = previous;
    }
  });

  it('every summaryKey used by an exact-bound row is a real bilingual catalog row', () => {
    const monolingual: string[] = [];
    for (const contract of cliContracts()) {
      if (contract.summaryBinding !== 'exact') continue;
      const langs = getMessageLanguages(contract.summaryKey);
      if (!langs.includes('en') || !langs.includes('tr')) {
        monolingual.push(`${contractPathKey(contract.path)} :: ${contract.summaryKey}`);
      }
    }
    expect(monolingual).toEqual([]);
  });

  it('resolving an exact-bound summaryKey never returns the raw key back', () => {
    for (const contract of cliContracts()) {
      if (contract.summaryBinding !== 'exact') continue;
      expect(getMessage(contract.summaryKey, 'en')).not.toBe(contract.summaryKey);
      expect(getMessage(contract.summaryKey, 'tr')).not.toBe(contract.summaryKey);
    }
  });

  it('no live help text exposes internal project tracking labels', () => {
    const patterns: readonly RegExp[] = [
      /\bTOOL-[A-Z0-9-]+\b/,
      /\bTERM-[A-Z0-9-]+\b/,
      /\bT-\d{3}-\d{3}\b/,
      /\bADR-[A-Z0-9-]+\b/,
      /\b(?:Phase|Faz)\s+\d+\b/i,
      /\b(?:G|I)\d+\b/,
    ];
    const offenders: string[] = [];

    for (const lang of ['en', 'tr'] as const) {
      const previous = process.env['DECKENT_LANGUAGE'];
      process.env['DECKENT_LANGUAGE'] = lang;
      try {
        const localized = buildProgram();
        for (const { path, command } of walkCommanderTree(localized)) {
          const texts = [
            ['summary', command.description()],
            ...command.options.map((option) => [`option ${option.flags}`, option.description]),
            ...command.registeredArguments.map((argument) => [`argument ${argument.name()}`, argument.description]),
          ] as const;
          for (const [where, value] of texts) {
            for (const pattern of patterns) {
              const match = pattern.exec(value);
              if (match !== null) offenders.push(`${lang} ${path} ${where}: ${match[0]}`);
            }
          }
        }
      } finally {
        if (previous === undefined) delete process.env['DECKENT_LANGUAGE'];
        else process.env['DECKENT_LANGUAGE'] = previous;
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('CLI contract — live shape helpers read only public Commander API', () => {
  it('option flags are read verbatim from the live command', () => {
    const node = walkCommanderTree(program).find((n) => n.path === 'agent');
    expect(node).toBeDefined();
    expect(describeCommanderOptions(node!.command)).toEqual(node!.command.options.map((o) => o.flags));
  });

  it('argument shapes carry name / required / variadic', () => {
    const withArgs = walkCommanderTree(program).find((n) => n.command.registeredArguments.length > 0);
    expect(withArgs, 'at least one command must take a positional argument').toBeDefined();
    for (const shape of describeCommanderArguments(withArgs!.command)) {
      expect(typeof shape.name).toBe('string');
      expect(typeof shape.required).toBe('boolean');
      expect(typeof shape.variadic).toBe('boolean');
    }
  });

  it('hidden commands are detected through the public visibility API', () => {
    const hiddenRows = cliContracts().filter((c) => c.hidden);
    const nodes = new Map(walkCommanderTree(program).map((n) => [n.path, n]));
    for (const row of hiddenRows) {
      const node = nodes.get(contractPathKey(row.path));
      expect(node, `hidden row ${contractPathKey(row.path)} must exist in the tree`).toBeDefined();
      expect(node!.visible).toBe(false);
    }
  });

  it('every actionless namespace parent is explicitly contracted as a group', () => {
    const nodes = new Map(walkCommanderTree(program).map((node) => [node.path, node.command]));
    const groups = cliContracts().filter((contract) => contract.effect === 'group');
    expect(groups.length).toBeGreaterThan(25);
    for (const contract of groups) {
      expect(isActionlessCommandGroup(nodes.get(contractPathKey(contract.path))!)).toBe(true);
      expect(contract.defaultExecution).toBe('read');
      expect(contract.authority).toBe('open');
    }
  });
});
