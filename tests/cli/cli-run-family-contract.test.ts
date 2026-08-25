/**
 * cli-run-family-contract.test.ts — CLI-CONTRACT-003
 *
 * Proof for the CORE + RUN-LIFECYCLE command family contract declared in
 * `src/cli/helpers/message-catalog/cli-run.ts`.
 *
 * Ground truth is always live, never a fixture or a snapshot:
 *   - tree:        buildProgram() from src/cli/index.js, rebuilt PER LANGUAGE
 *   - path SSOT:   CLI_COMMAND_CONTRACTS from src/core/cli-command-contract.js
 *   - base catalog:getMessage()/getMessageLanguages() from src/cli/helpers/messages.js
 *   - family:      CLI_RUN_FAMILY_CONTRACTS + CLI_RUN_MESSAGES
 *
 * What it proves, in both `en` and `tr`:
 *   1. every declared path exists, and its option/argument SHAPE matches the
 *      live Commander command exactly (no ghost flags, no missed flags);
 *   2. every visible option and every declared argument resolves to real
 *      bilingual help text, and the LIVE help string is exactly that text —
 *      i.e. the catalog is actually wired, not merely present;
 *   3. the family's effect / default-execution / output axes agree with the
 *      path-level SSOT, so this file can never become a second, disagreeing
 *      truth;
 *   4. no internal engineering code (TERM-*, B1b, NNN-NNN task ids, NNN/XN
 *      slice labels, ADR refs) survives anywhere on the family's user-facing
 *      surface;
 *   5. the honesty statements the family owes are actually rendered: the
 *      `run` one-shot vs `run start|status|retro|history` namespace overlap,
 *      `test` being a Deckent test sprint, `output` reading persisted worker
 *      evidence, `finalize` publishing a DB-first terminal projection.
 *
 * Non-vacuity: the shape/text checks run through one `verifyFamily()` helper,
 * and dedicated cases mutate a real row on each axis and assert the matching
 * violation is raised. A verification that cannot fail proves nothing.
 *
 * Deliberately NOT covered here (needs a real PTY / a real sprint, not a unit
 * test): interactive confirmation prompts, tmux/docker prerequisite probing,
 * and the runtime behaviour of the commands themselves. This battery is a
 * contract-and-help-surface proof only; it asserts nothing about handlers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Command } from 'commander';

import { buildProgram } from '../../src/cli/index.js';
import {
  CLI_COMMAND_CONTRACTS,
  contractPathKey,
} from '../../src/core/cli-command-contract.js';
import {
  describeCommanderArguments,
  describeCommanderOptions,
  walkCommanderTree,
} from '../../src/cli/helpers/command-contract.js';
import {
  MESSAGE_CATALOG_FAMILIES,
  getMessage,
  getMessageLanguages,
} from '../../src/cli/helpers/messages.js';
import {
  CLI_CONTRACT_PLATFORMS,
  CLI_RUN_FAMILY_CONTRACTS,
  CLI_RUN_FAMILY_PATHS,
  CLI_RUN_MESSAGES,
  bindArgumentDescriptions,
  cliContractMessage,
  cliContractMessageLanguages,
  cliContractPathKey,
  getCliContractRow,
  renderContractHelp,
  type CliContractRow,
} from '../../src/cli/helpers/message-catalog/cli-run.js';

// ─── language harness ───────────────────────────────────────────────────────

const LANGS = ['en', 'tr'] as const;
type Lang = (typeof LANGS)[number];

const LANG_ENV_VARS = ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG'] as const;

const savedEnv = new Map<string, string | undefined>();
const programs = new Map<Lang, Command>();

beforeAll(() => {
  for (const name of LANG_ENV_VARS) savedEnv.set(name, process.env[name]);
  for (const lang of LANGS) {
    for (const name of LANG_ENV_VARS) delete process.env[name];
    process.env['DECKENT_LANGUAGE'] = lang;
    programs.set(lang, buildProgram());
  }
});

afterAll(() => {
  for (const name of LANG_ENV_VARS) {
    const value = savedEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

// ─── live-tree helpers ──────────────────────────────────────────────────────

interface LiveArgument {
  readonly name: string;
  readonly description: string;
}

/** Read live argument help through Commander's public Argument API. */
function liveArguments(command: Command): LiveArgument[] {
  return command.registeredArguments.map((argument) => ({
    name: argument.name(),
    description: argument.description,
  }));
}

function liveNodes(lang: Lang): Map<string, Command> {
  const program = programs.get(lang);
  if (program === undefined) throw new Error(`no program built for ${lang}`);
  return new Map(walkCommanderTree(program).map((node) => [node.path, node.command]));
}

/** Resolve the expected help text for a description key in either catalog. */
function expectedText(key: string, lang: Lang): string {
  return cliContractMessageLanguages(key).length > 0
    ? cliContractMessage(key, lang)
    : getMessage(key, lang);
}

/** Languages a key declares, whichever catalog serves it. */
function keyLanguages(key: string): readonly string[] {
  const family = cliContractMessageLanguages(key);
  return family.length > 0 ? family : getMessageLanguages(key);
}

// ─── the one verification used by both the real run and the mutation proofs ──

interface Violation {
  readonly path: string;
  readonly kind: string;
  readonly detail: string;
}

function verifyFamily(
  lang: Lang,
  rows: readonly CliContractRow[] = CLI_RUN_FAMILY_CONTRACTS,
): Violation[] {
  const nodes = liveNodes(lang);
  const violations: Violation[] = [];
  const add = (path: string, kind: string, detail: string): void => {
    violations.push({ path, kind, detail });
  };

  for (const row of rows) {
    const path = cliContractPathKey(row.path);
    const command = nodes.get(path);
    if (command === undefined) {
      add(path, 'path-missing-from-tree', 'no live command for this contract path');
      continue;
    }

    // ── option shape ──
    const liveFlags = describeCommanderOptions(command);
    const declaredFlags = row.options.map((option) => option.flags);
    if (JSON.stringify(liveFlags) !== JSON.stringify(declaredFlags)) {
      add(path, 'option-shape-drift', `live=${JSON.stringify(liveFlags)} declared=${JSON.stringify(declaredFlags)}`);
    }

    // ── argument shape ──
    const liveShapes = describeCommanderArguments(command).map((shape) => ({
      name: shape.name,
      required: shape.required,
      variadic: shape.variadic,
    }));
    const declaredShapes = row.arguments.map((argument) => ({
      name: argument.name,
      required: argument.required,
      variadic: argument.variadic,
    }));
    if (JSON.stringify(liveShapes) !== JSON.stringify(declaredShapes)) {
      add(path, 'argument-shape-drift', `live=${JSON.stringify(liveShapes)} declared=${JSON.stringify(declaredShapes)}`);
    }

    // ── option help: bilingual + actually wired ──
    const liveOptions = new Map(command.options.map((option) => [option.flags, option]));
    const liveOptionText = new Map(command.options.map((option) => [option.flags, option.description]));
    for (const option of row.options) {
      const liveOption = liveOptions.get(option.flags);
      if (option.hidden === true && liveOption?.hidden !== true) {
        add(path, 'hidden-option-visible', option.flags);
      }
      if (option.hidden !== true && liveOption?.hidden === true) {
        add(path, 'visible-option-hidden', option.flags);
      }
      const key = option.descriptionKey;
      if (key.trim() === '') {
        add(path, 'option-without-key', option.flags);
        continue;
      }
      const languages = keyLanguages(key);
      if (!languages.includes('en') || !languages.includes('tr')) {
        add(path, 'option-help-not-bilingual', `${option.flags} :: ${key} :: ${JSON.stringify(languages)}`);
        continue;
      }
      const expected = expectedText(key, lang);
      if (expected.trim() === '' || expected === key) {
        add(path, 'option-help-unresolved', `${option.flags} :: ${key}`);
        continue;
      }
      if (option.templated === true) continue;
      const live = liveOptionText.get(option.flags);
      if (live !== expected) {
        add(path, 'option-help-not-wired', `${option.flags} live=${JSON.stringify(live)} expected=${JSON.stringify(expected)}`);
      }
    }

    // ── argument help: bilingual + actually wired ──
    const liveArgText = new Map(liveArguments(command).map((argument) => [argument.name, argument.description]));
    for (const argument of row.arguments) {
      const languages = keyLanguages(argument.descriptionKey);
      if (!languages.includes('en') || !languages.includes('tr')) {
        add(path, 'argument-help-not-bilingual', `${argument.name} :: ${argument.descriptionKey}`);
        continue;
      }
      const expected = expectedText(argument.descriptionKey, lang);
      if (expected.trim() === '' || expected === argument.descriptionKey) {
        add(path, 'argument-help-unresolved', `${argument.name} :: ${argument.descriptionKey}`);
        continue;
      }
      if (!argument.bound) continue;
      const live = liveArgText.get(argument.name);
      if (live !== expected) {
        add(path, 'argument-help-not-wired', `${argument.name} live=${JSON.stringify(live)} expected=${JSON.stringify(expected)}`);
      }
    }

    // ── path-level SSOT agreement ──
    const ssot = CLI_COMMAND_CONTRACTS.find((c) => contractPathKey(c.path) === path);
    if (ssot === undefined) {
      add(path, 'path-missing-from-ssot', 'the path-level contract has no row for this path');
      continue;
    }
    if (ssot.effect !== row.effect) add(path, 'effect-drift', `ssot=${ssot.effect} family=${row.effect}`);
    if (ssot.output !== row.output) add(path, 'output-drift', `ssot=${ssot.output} family=${row.output}`);
    if (ssot.defaultExecution !== row.defaultExecution) {
      add(path, 'default-execution-drift', `ssot=${ssot.defaultExecution} family=${row.defaultExecution}`);
    }
    if (ssot.summaryKey !== row.summaryKey) {
      add(path, 'summary-key-drift', `ssot=${ssot.summaryKey} family=${row.summaryKey}`);
    }
  }
  return violations;
}

function format(violations: readonly Violation[]): string[] {
  return violations.map((v) => `${v.path} [${v.kind}] ${v.detail}`);
}

// ─── internal-code detector ─────────────────────────────────────────────────

const INTERNAL_CODE_PATTERNS: readonly RegExp[] = [
  /\bB1b\b/,
  /\bTERM[-/][A-Z0-9][A-Z0-9-]*/,
  /\b\d{3}-\d{3}\b/,
  /\b\d{3}\/[A-Z]\d+\b/,
  /\bADR-[A-Z0-9]+(?:-\d+)?\b/,
  /\bdilim-\d+\b/,
];

function internalCodesIn(text: string): string[] {
  return INTERNAL_CODE_PATTERNS.flatMap((pattern) => {
    const hit = pattern.exec(text);
    return hit === null ? [] : [hit[0]];
  });
}

/** Every user-facing string the family owns, for one language. */
function familySurface(lang: Lang): { where: string; text: string }[] {
  const nodes = liveNodes(lang);
  const surface: { where: string; text: string }[] = [];
  for (const row of CLI_RUN_FAMILY_CONTRACTS) {
    const path = cliContractPathKey(row.path);
    const command = nodes.get(path);
    if (command === undefined) continue;
    surface.push({ where: `${path} :: summary`, text: command.description() });
    for (const option of command.options) {
      surface.push({ where: `${path} :: ${option.flags}`, text: option.description });
    }
    for (const argument of liveArguments(command)) {
      surface.push({ where: `${path} :: <${argument.name}>`, text: argument.description });
    }
    if (row.rendersHelpBlock === true) {
      surface.push({ where: `${path} :: contract block`, text: renderContractHelp(row.path, lang) });
    }
  }
  return surface;
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('cli-run family ⇄ live Commander tree', () => {
  for (const lang of LANGS) {
    it(`reports ZERO violations across every declared path and axis (${lang})`, () => {
      expect(format(verifyFamily(lang))).toEqual([]);
    });
  }

  it('verification is not vacuous — the family really covers the core surface', () => {
    const nodes = liveNodes('en');
    expect(CLI_RUN_FAMILY_CONTRACTS.length).toBeGreaterThanOrEqual(45);
    expect(CLI_RUN_FAMILY_PATHS.length).toBe(CLI_RUN_FAMILY_CONTRACTS.length);
    // Every declared path is a real, walkable command path.
    expect(CLI_RUN_FAMILY_PATHS.filter((p) => !nodes.has(p))).toEqual([]);
    // The family genuinely describes options and arguments, not just paths.
    const optionCount = CLI_RUN_FAMILY_CONTRACTS.reduce((n, r) => n + r.options.length, 0);
    const argumentCount = CLI_RUN_FAMILY_CONTRACTS.reduce((n, r) => n + r.arguments.length, 0);
    expect(optionCount).toBeGreaterThan(120);
    expect(argumentCount).toBeGreaterThan(20);
  });

  it('declares no duplicate paths', () => {
    const keys = [...CLI_RUN_FAMILY_PATHS];
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('every row declares the full platform matrix drawn from the shared list', () => {
    expect(CLI_CONTRACT_PLATFORMS).toEqual(['darwin', 'linux', 'win32']);
    const bad = CLI_RUN_FAMILY_CONTRACTS.filter(
      (row) => row.platforms.length === 0 || row.platforms.some((p) => !CLI_CONTRACT_PLATFORMS.includes(p)),
    );
    expect(bad.map((row) => cliContractPathKey(row.path))).toEqual([]);
  });
});

describe('cli-run family — per-axis drift is actually caught', () => {
  // Each case mutates ONE axis of a real row and asserts the exact violation
  // kind surfaces. Without these, a green suite would prove nothing.
  function rowFor(path: string): CliContractRow {
    const row = getCliContractRow(path);
    expect(row, `family row for "${path}" must exist`).toBeDefined();
    return row as CliContractRow;
  }

  it('detects option-shape drift', () => {
    const row = rowFor('output');
    const mutated: CliContractRow = {
      ...row,
      options: [...row.options, { flags: '--not-real <x>', descriptionKey: 'cliContract.output.opt.json' }],
    };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('option-shape-drift');
  });

  it('detects argument-shape drift', () => {
    const row = rowFor('output');
    const mutated: CliContractRow = {
      ...row,
      arguments: [
        ...row.arguments,
        { name: 'ghost', required: true, variadic: false, descriptionKey: 'cliContract.output.arg.taskId', bound: false },
      ],
    };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('argument-shape-drift');
  });

  it('detects an option whose help key is not bilingual', () => {
    const row = rowFor('output');
    const mutated: CliContractRow = {
      ...row,
      options: row.options.map((o) =>
        o.flags === '--json' ? { ...o, descriptionKey: 'cliContract.__definitely_missing__' } : o,
      ),
    };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('option-help-not-bilingual');
  });

  it('detects an option whose catalog text is not the live help text', () => {
    const row = rowFor('output');
    const mutated: CliContractRow = {
      ...row,
      options: row.options.map((o) =>
        o.flags === '--json' ? { ...o, descriptionKey: 'cliContract.output.opt.tail' } : o,
      ),
    };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('option-help-not-wired');
  });

  it('detects an argument whose catalog text is not the live help text', () => {
    const row = rowFor('runs');
    const mutated: CliContractRow = {
      ...row,
      arguments: row.arguments.map((a) => ({ ...a, descriptionKey: 'cliContract.runs.opt.limit' })),
    };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('argument-help-not-wired');
  });

  it('detects effect / output / default-execution drift against the path SSOT', () => {
    const row = rowFor('output');
    const effectDrift: CliContractRow = { ...row, effect: 'dangerous' };
    const outputDrift: CliContractRow = { ...row, output: 'stream' };
    const execDrift: CliContractRow = { ...row, defaultExecution: 'dry-run' };
    expect(verifyFamily('en', [effectDrift]).map((v) => v.kind)).toContain('effect-drift');
    expect(verifyFamily('en', [outputDrift]).map((v) => v.kind)).toContain('output-drift');
    expect(verifyFamily('en', [execDrift]).map((v) => v.kind)).toContain('default-execution-drift');
  });

  it('detects a contract path that does not exist in the live tree', () => {
    const row = rowFor('output');
    const mutated: CliContractRow = { ...row, path: ['no-such-command'] };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('path-missing-from-tree');
  });

  it('detects an option that declares no help key at all', () => {
    const row = rowFor('output');
    const mutated: CliContractRow = {
      ...row,
      options: row.options.map((o) => (o.flags === '--json' ? { ...o, descriptionKey: '' } : o)),
    };
    expect(verifyFamily('en', [mutated]).map((v) => v.kind)).toContain('option-without-key');
  });
});

describe('cli-run family — catalog hygiene', () => {
  it('every row is bilingual, non-empty, and really translated', () => {
    const bad: string[] = [];
    for (const [key, row] of Object.entries(CLI_RUN_MESSAGES)) {
      const en = row['en'];
      const tr = row['tr'];
      if (typeof en !== 'string' || en.trim() === '') bad.push(`${key}: missing en`);
      else if (typeof tr !== 'string' || tr.trim() === '') bad.push(`${key}: missing tr`);
      else if (en === tr) bad.push(`${key}: tr is a copy of en`);
    }
    expect(bad).toEqual([]);
    expect(Object.keys(CLI_RUN_MESSAGES).length).toBeGreaterThan(120);
  });

  it('owns exactly the `cliContract.` namespace', () => {
    const stray = Object.keys(CLI_RUN_MESSAGES).filter((key) => !key.startsWith('cliContract.'));
    expect(stray).toEqual([]);
  });

  it('is registered once in the shared message catalog', () => {
    expect(MESSAGE_CATALOG_FAMILIES['cli-run']).toBe(CLI_RUN_MESSAGES);
    const missing = Object.keys(CLI_RUN_MESSAGES).filter(
      (key) => !getMessageLanguages(key).includes('en') || !getMessageLanguages(key).includes('tr'),
    );
    expect(missing).toEqual([]);
  });

  it('resolves an unknown key to the key itself and falls back to English', () => {
    expect(cliContractMessage('cliContract.__nope__')).toBe('cliContract.__nope__');
    expect(cliContractMessage('cliContract.label.effect', 'de')).toBe(
      cliContractMessage('cliContract.label.effect', 'en'),
    );
    expect(cliContractMessageLanguages('cliContract.__nope__')).toEqual([]);
  });

  it('interpolates named parameters instead of leaking the placeholder', () => {
    const rendered = cliContractMessage('cliContract.connect.opt.provider', 'en', { providers: 'a|b' });
    expect(rendered).toContain('a|b');
    expect(rendered).not.toContain('{providers}');
  });

  it('every key referenced by a contract row exists in some catalog', () => {
    const missing: string[] = [];
    for (const row of CLI_RUN_FAMILY_CONTRACTS) {
      const path = cliContractPathKey(row.path);
      const keys = [
        row.summaryKey,
        ...row.options.map((o) => o.descriptionKey).filter((k): k is string => k !== null),
        ...row.arguments.map((a) => a.descriptionKey),
        ...(row.notes ?? []),
      ];
      for (const key of keys) {
        if (keyLanguages(key).length === 0) missing.push(`${path} :: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('cli-run family — declared axes are backed by real flags', () => {
  const CONSENT_FLAGS = ['--yes', '-y, --yes', '--force', '--apply', '--run', '--user-explicit', '--no-confirm', '--non-interactive', '--auto-approve', '--write'];

  it('a flag-opt-in confirmation always has an opt-in flag to point at', () => {
    const bad = CLI_RUN_FAMILY_CONTRACTS.filter(
      (row) =>
        row.confirmation === 'flag-opt-in' &&
        !row.options.some((option) => CONSENT_FLAGS.includes(option.flags)),
    );
    expect(bad.map((row) => cliContractPathKey(row.path))).toEqual([]);
  });

  it('operator-attestation authority is only claimed where the attestation flags exist', () => {
    const rows = CLI_RUN_FAMILY_CONTRACTS.filter((row) => row.authority === 'operator-attestation');
    expect(rows.length).toBeGreaterThan(0);
    const leaves = rows.filter((row) => row.options.length > 0);
    expect(leaves.length).toBeGreaterThan(0);
    for (const row of leaves) {
      const flags = row.options.map((option) => option.flags);
      expect(flags, cliContractPathKey(row.path)).toContain('--operator <id>');
      expect(flags, cliContractPathKey(row.path)).toContain('--attestation-reason <text>');
    }
  });

  it('a dry-run default is never claimed without an apply-style opt-in', () => {
    const bad = CLI_RUN_FAMILY_CONTRACTS.filter(
      (row) =>
        row.defaultExecution === 'dry-run' &&
        !row.options.some((option) => ['--apply', '--run', '--write'].includes(option.flags)),
    );
    expect(bad.map((row) => cliContractPathKey(row.path))).toEqual([]);
  });

  it('every declared axis value renders bilingually in the contract block', () => {
    const missing: string[] = [];
    for (const row of CLI_RUN_FAMILY_CONTRACTS) {
      const keys = [
        `cliContract.effect.${row.effect}`,
        `cliContract.execution.${row.defaultExecution}`,
        `cliContract.confirmation.${row.confirmation}`,
        `cliContract.authority.${row.authority}`,
        `cliContract.output.${row.output}`,
        ...row.prerequisites.map((p) => `cliContract.prerequisite.${p}`),
      ];
      for (const key of keys) {
        const languages = cliContractMessageLanguages(key);
        if (!languages.includes('en') || !languages.includes('tr')) {
          missing.push(`${cliContractPathKey(row.path)} :: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('renderContractHelp emits every axis, in both languages, for a help-block row', () => {
    for (const lang of LANGS) {
      const block = renderContractHelp('run', lang);
      for (const label of ['contract', 'effect', 'execution', 'confirmation', 'authority', 'output', 'prerequisites']) {
        expect(block, `${lang}/${label}`).toContain(cliContractMessage(`cliContract.label.${label}`, lang));
      }
    }
    expect(renderContractHelp('definitely-not-a-command')).toBe('');
  });
});

describe('cli-run family — no internal engineering codes reach the user', () => {
  for (const lang of LANGS) {
    it(`the family's user-facing surface is code-free (${lang})`, () => {
      const offenders = familySurface(lang)
        .flatMap(({ where, text }) => internalCodesIn(text).map((code) => `${where}: ${code}`));
      expect(offenders).toEqual([]);
    });
  }

  it('the detector is not vacuous — it catches the codes this family removed', () => {
    expect(internalCodesIn('B1b: consume a snapshot')).toEqual(['B1b']);
    expect(internalCodesIn('TERM-FLOW-UNIFY (426-001): consume')).toEqual(['TERM-FLOW-UNIFY', '426-001']);
    expect(internalCodesIn("run #n's footprint (583/N1)")).toEqual(['583/N1']);
    expect(internalCodesIn('see ADR-037 for the rule')).toEqual(['ADR-037']);
    expect(internalCodesIn('RUN-RENAME dilim-1 note')).toEqual(['dilim-1']);
    expect(internalCodesIn('Show last N lines of the persisted worker output')).toEqual([]);
  });
});

describe('cli-run family — the honesty statements the family owes', () => {
  it('documents the run one-shot vs run start|status|retro|history namespace overlap', () => {
    const row = getCliContractRow('run');
    expect(row?.notes ?? []).toContain('cliContract.run.note.namespace');
    for (const lang of LANGS) {
      const note = cliContractMessage('cliContract.run.note.namespace', lang);
      expect(note).not.toBe('cliContract.run.note.namespace');
      for (const reserved of ['start', 'status', 'retro', 'history']) {
        expect(note, `${lang}/${reserved}`).toContain(reserved);
      }
      // The overlap is described, not silently "fixed".
      expect(renderContractHelp('run', lang)).toContain(note);
      // And the reserved names are named on the one-shot argument itself.
      expect(cliContractMessage('cliContract.run.arg.description', lang)).toContain('history');
    }
  });

  it('keeps the four compatibility sub-commands declared as delegating aliases', () => {
    const nodes = liveNodes('en');
    for (const reserved of ['start', 'status', 'retro', 'history']) {
      const row = getCliContractRow(['run', reserved]);
      expect(row, `run ${reserved}`).toBeDefined();
      expect(row?.summaryKey).toBe('run.alias_note');
      expect(nodes.has(`run ${reserved}`)).toBe(true);
    }
    // Behaviour is unchanged: `run` still takes its one-shot description.
    const run = nodes.get('run');
    expect(describeCommanderArguments(run as Command)).toEqual([
      { name: 'description', required: true, variadic: false },
    ]);
  });

  it('says `test` is a Deckent test sprint, not the project unit-test runner', () => {
    const row = getCliContractRow('test');
    expect(row?.rendersHelpBlock).toBe(true);
    for (const lang of LANGS) {
      const block = renderContractHelp('test', lang);
      expect(block).toContain(cliContractMessage('cliContract.test.note.scope', lang));
    }
    expect(cliContractMessage('cliContract.test.note.scope', 'en')).toMatch(/TEST SPRINT/);
    expect(cliContractMessage('cliContract.test.note.scope', 'en')).toMatch(/NOT the project's own unit-test runner/);
    expect(cliContractMessage('cliContract.test.note.scope', 'tr')).toMatch(/TEST SPRINT/);
  });

  it('says `output` reads persisted worker stdout/stderr/result evidence', () => {
    const row = getCliContractRow('output');
    expect(row?.effect).toBe('read');
    for (const lang of LANGS) {
      const block = renderContractHelp('output', lang);
      expect(block).toContain(cliContractMessage('cliContract.output.note.evidence', lang));
      expect(block).toContain(cliContractMessage('cliContract.output.note.live', lang));
    }
    expect(cliContractMessage('cliContract.output.note.evidence', 'en')).toMatch(/stdout\/stderr/);
    expect(cliContractMessage('cliContract.output.note.evidence', 'en')).toMatch(/does not attach to a live process/);
    // --follow must not pretend to be a live attach.
    expect(cliContractMessage('cliContract.output.opt.follow', 'en')).toMatch(/not a live process attach/);
  });

  it('says `finalize` publishes a DB-first terminal projection', () => {
    const row = getCliContractRow('finalize');
    expect(row?.rendersHelpBlock).toBe(true);
    for (const lang of LANGS) {
      expect(renderContractHelp('finalize', lang)).toContain(
        cliContractMessage('cliContract.finalize.note.projection', lang),
      );
    }
    expect(cliContractMessage('cliContract.finalize.note.projection', 'en')).toMatch(/DB-first/);
    expect(cliContractMessage('cliContract.finalize.note.projection', 'tr')).toMatch(/DB-first/);
  });

  it('names the platform/backend prerequisites the handlers really depend on', () => {
    expect(getCliContractRow('attach')?.prerequisites).toContain('tmux');
    expect(getCliContractRow('watch')?.prerequisites).toContain('tmux');
    expect(getCliContractRow('spawn')?.prerequisites).toContain('docker');
    expect(getCliContractRow('sync')?.prerequisites).toContain('git');
    expect(getCliContractRow('upgrade')?.prerequisites).toContain('network');
    expect(getCliContractRow('connect')?.prerequisites).toContain('network');
  });
});

describe('cli-run family — argument binding helper', () => {
  it('binds by name, ignores unknown names, and returns the same object', () => {
    const args = [
      { name: () => 'taskId', description: '' },
      { name: () => 'other', description: 'untouched' },
    ];
    const host = { registeredArguments: args };
    const returned = bindArgumentDescriptions(host, 'tr', {
      taskId: 'cliContract.output.arg.taskId',
      ghost: 'cliContract.output.arg.taskId',
    });
    expect(returned).toBe(host);
    expect(args[0]?.description).toBe(cliContractMessage('cliContract.output.arg.taskId', 'tr'));
    expect(args[1]?.description).toBe('untouched');
  });
});
