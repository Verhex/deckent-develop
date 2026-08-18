/**
 * CLI Inventory Smoke Tests — Sprint 151 Task 011
 *
 * Validates that all CLI commands are registered correctly,
 * have no duplicates, and expose expected metadata.
 *
 * 3 test scenarios per top-level command:
 *   1. Command exists and has a description
 *   2. No duplicate command names
 *   3. Subcommands (if any) are correctly attached
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Command } from 'commander';

// Dynamic import to handle ESM
let buildProgram: () => Command;

beforeAll(async () => {
  const mod = await import('../../src/cli/index.js');
  buildProgram = mod.buildProgram;
});

describe('buildProgram smoke', () => {
  it('does not throw on commander register', () => {
    expect(() => buildProgram()).not.toThrow();
  });

  it('returns a Command instance', () => {
    const program = buildProgram();
    expect(program).toBeInstanceOf(Command);
    expect(program.name()).toBe('deckent');
  });
});

describe('CLI command inventory', () => {
  let program: Command;
  let commands: Command[];
  let commandNames: string[];

  beforeAll(() => {
    program = buildProgram();
    commands = program.commands;
    commandNames = commands.map(c => c.name());
  });

  it('registers at least 45 top-level commands', () => {
    expect(commands.length).toBeGreaterThanOrEqual(45);
  });

  it('has no duplicate top-level command names', () => {
    const duplicates = commandNames.filter((name, i) => commandNames.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });

  it('every command has a non-empty description', () => {
    const missing = commands.filter(c => !c.description() || c.description().trim() === '');
    expect(missing.map(c => c.name())).toEqual([]);
  });

  // --- Expected top-level commands ---
  const expectedCommands = [
    'init', 'start', 'plan', 'status', 'attach', 'spawn', 'kill',
    'retro', 'cleanup', 'doctor', 'config', 'history', 'plugin',
    'upgrade', 'onboard', 'analyze', 'archive-debt', 'dashboard',
    'serve', 'sync', 'watch', 'run', 'test', 'agent',
    'skill', 'review', 'finalize', 'explain', 'set-directives',
    'heartbeat', 'checkpoint', 'docs', 'output', 'cost', 'recall',
    'remember', 'memory', 'resume', 'nervous',
    'mode', 'features', 'audit', 'recover',
  ];

  describe('expected commands exist', () => {
    for (const name of expectedCommands) {
      it(`"${name}" is registered`, () => {
        expect(commandNames).toContain(name);
      });
    }
  });

  // --- Command description checks ---
  describe('command descriptions are meaningful', () => {
    for (const name of expectedCommands) {
      it(`"${name}" description is at least 10 chars`, () => {
        const cmd = commands.find(c => c.name() === name);
        if (cmd) {
          expect(cmd.description().length).toBeGreaterThanOrEqual(10);
        }
      });
    }
  });

  // --- Commands with subcommands ---
  const commandsWithSubs: Record<string, string[]> = {
    config: ['set', 'get', 'export', 'import', 'list', 'keys', 'migrate', 'nervous'],
    plugin: ['install', 'remove', 'update', 'list', 'info', 'test', 'create'],
    agent: ['list', 'create', 'stats', 'enable', 'disable', 'delete', 'edit', 'info'],
    skill: ['list', 'create', 'install', 'update', 'enable', 'disable', 'delete', 'info', 'search', 'publish'],
    checkpoint: ['list', 'approve', 'reject'],
    docs: ['add', 'remove', 'list', 'update', 'run'],
    cost: ['show', 'update', 'budget'],
    nervous: ['accept', 'reject', 'edit', 'undo', 'history', 'log'],
    mode: ['show', 'sprint', 'task', 'auto', 'global'],
    memory: ['rebuild', 'export', 'stats', 'relations'],
  };

  describe('subcommand registration', () => {
    for (const [parent, subs] of Object.entries(commandsWithSubs)) {
      describe(`"${parent}" subcommands`, () => {
        it(`has at least ${subs.length} subcommands`, () => {
          const cmd = commands.find(c => c.name() === parent);
          expect(cmd).toBeDefined();
          const subNames = cmd!.commands.map(s => s.name());
          expect(subNames.length).toBeGreaterThanOrEqual(subs.length);
        });

        for (const sub of subs) {
          it(`has "${sub}" subcommand`, () => {
            const cmd = commands.find(c => c.name() === parent);
            expect(cmd).toBeDefined();
            const subNames = cmd!.commands.map(s => s.name());
            expect(subNames).toContain(sub);
          });
        }
      });
    }
  });

  // --- Options presence check ---
  const commandsWithOptions: Record<string, string[]> = {
    init: ['--auto', '--force', '--upgrade'],
    start: ['--dry-run', '--auto-approve', '--timeout'],
    plan: ['--structured', '--dry-run'],
    status: ['--watch', '--json', '--verbose'],
    kill: ['--all', '--force'],
    retro: ['--raw', '--json', '--perf'],
    cleanup: ['--dry-run'],
    doctor: ['--json', '--profile'],
    run: ['--model', '--scope', '--timeout'],
    test: ['--keep', '--sandbox', '--model'],
    review: ['--auto', '--json'],
    explain: ['--sprint', '--json'],
    history: ['--json', '--last'],
    sync: ['--dry-run', '--json'],
    recall: ['--limit'],
    resume: ['--dry-run'],
    recover: ['--dry-run', '--force'],
    features: ['--json'],
    audit: ['--json'],
  };

  describe('command options', () => {
    for (const [cmdName, expectedFlags] of Object.entries(commandsWithOptions)) {
      describe(`"${cmdName}" options`, () => {
        for (const flag of expectedFlags) {
          it(`has "${flag}" option`, () => {
            const cmd = commands.find(c => c.name() === cmdName);
            expect(cmd).toBeDefined();
            const allFlags = cmd!.options.map(o => o.flags);
            const hasFlag = allFlags.some(f => f.includes(flag.replace('--', '')));
            expect(hasFlag).toBe(true);
          });
        }
      });
    }
  });

  // --- help-info alias check ---
  it('"help-info" has "info" alias', () => {
    const cmd = commands.find(c => c.name() === 'help-info');
    if (cmd) {
      expect(cmd.aliases()).toContain('info');
    }
  });
});
