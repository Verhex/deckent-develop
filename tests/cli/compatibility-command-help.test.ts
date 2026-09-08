import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Command as CommanderCommand, type Command } from 'commander';

import { buildProgram } from '../../src/cli/index.js';
import {
  DEPRECATED_FORWARDING_SURFACES,
  listDeprecatedForwardingCommands,
  parseReplacementSurface,
  replacementHelpBody,
  getDeprecatedForwardingSurface,
  registerDeprecatedForwarding,
} from '../../src/cli/helpers/compatibility-command-help.js';
import { getContract } from '../../src/core/cli-command-contract.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { getGovernanceMessage } from '../../src/cli/helpers/message-catalog/cli-governance.js';
import * as output from '../../src/cli/helpers/output.js';

const LANGS = ['en', 'tr'] as const;
const savedEnv = new Map<string, string | undefined>();

beforeAll(() => {
  for (const name of ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG']) {
    savedEnv.set(name, process.env[name]);
  }
});

afterAll(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function captureHelp(cmd: Command): string {
  let out = '';
  cmd.configureOutput({
    writeOut: (str) => { out += str; },
    writeErr: () => {},
  });
  cmd.outputHelp();
  return out;
}

/** Capture the actual public Commander outputHelp surface without retaining a test writer. */
function captureFullHelp(cmd: Command): string {
  const previousOutput = { ...cmd.configureOutput() };
  let out = '';
  cmd.configureOutput({
    ...previousOutput,
    writeOut: (chunk) => { out += chunk; },
    writeErr: (chunk) => { out += chunk; },
  });
  try {
    cmd.outputHelp();
  } finally {
    cmd.configureOutput(previousOutput);
  }
  return out;
}

function findCommand(program: Command, path: string): Command | undefined {
  const segments = path.split(' ');
  let cmd: Command | undefined = program;
  for (const segment of segments) {
    cmd = cmd?.commands.find((candidate) => candidate.name() === segment);
  }
  return cmd;
}

async function parseHelp(program: Command, args: readonly string[]): Promise<string> {
  let out = '';
  program.configureOutput({
    writeOut: (chunk) => { out += chunk; },
    writeErr: (chunk) => { out += chunk; },
  });
  const installExitOverride = (command: Command): void => {
    command.exitOverride((error) => { throw error; });
    for (const child of command.commands) installExitOverride(child);
  };
  // Commander stores exit handlers per command. A legacy alias is a child, so
  // intercept its own help exit rather than letting Vitest intercept process.exit.
  installExitOverride(program);
  try {
    await program.parseAsync(['node', 'deckent', ...args], { from: 'node' });
  } catch (error) {
    expect((error as { code?: string }).code).toBe('commander.helpDisplayed');
  }
  return out;
}

describe('compatibility-command-help', () => {
  for (const lang of LANGS) {
    describe(lang, () => {
      let program: Command;

      beforeAll(() => {
        for (const name of ['DECKENT_LANGUAGE', 'DECKENT_LANG']) delete process.env[name];
        process.env['DECKENT_LANGUAGE'] = lang;
        program = buildProgram();
      });

      it('registers deprecated top-level catch-all aliases without rewired legacy options', () => {
        for (const surface of DEPRECATED_FORWARDING_SURFACES) {
          const cmd = findCommand(program, surface.command);
          expect(cmd, surface.command).toBeDefined();
          const contract = getContract(surface.command);
          expect(contract, surface.command).toBeDefined();
          expect(cmd!.description()).toBe(getMessage(contract!.summaryKey, lang));
          expect(cmd!.registeredArguments.some((arg) => arg.name() === 'args')).toBe(true);
          for (const legacyOpt of contract!.options) {
            if (legacyOpt.hidden) continue;
            const primary = legacyOpt.flags.split(',')[0].trim();
            const live = cmd!.options.find((candidate) => candidate.flags.includes(primary));
            expect(live, `${surface.command} must not rewire ${legacyOpt.flags}`).toBeUndefined();
          }
        }
      });

      it('shows deprecation banner and replacement SSOT help body', () => {
        for (const surface of DEPRECATED_FORWARDING_SURFACES) {
          const cmd = findCommand(program, surface.command)!;
          const help = captureHelp(cmd);
          expect(help).toContain(getMessage(surface.warningKey, lang));
          const { targetPath } = parseReplacementSurface(surface.replacement);
          const replacementHelp = replacementHelpBody(program, targetPath);
          expect(replacementHelp.length).toBeGreaterThan(20);
          expect(help).toContain(replacementHelp.trim().slice(0, 40));
        }
      });

      it('routes parsed deprecated child help to the real canonical child without actions', async () => {
        const cases = [
          { aliasArgs: ['autonomous-mission', 'create-goal', '--help'], target: 'autonomous mission create-goal' },
          { aliasArgs: ['confirmations', 'list', '--help'], target: 'approvals list' },
          { aliasArgs: ['autonomous-mission', 'create-goal', 'goal-1', '--help'], target: 'autonomous mission create-goal' },
        ] as const;
        const print = vi.spyOn(output, 'print');
        try {
          for (const testCase of cases) {
            const parsedProgram = buildProgram();
            const help = await parseHelp(parsedProgram, testCase.aliasArgs);
            const targetHelp = captureFullHelp(findCommand(parsedProgram, testCase.target)!).trim();
            expect(help).toContain(targetHelp);
            if (testCase.target === 'approvals list') {
              expect(targetHelp).toContain(
                getGovernanceMessage('cli.governance.approvals.list.note', lang),
              );
            }
          }
          expect(print).not.toHaveBeenCalled();
        } finally {
          print.mockRestore();
        }
      });

      it('does not claim a canonical child for an unknown deprecated child token', async () => {
        const parsedProgram = buildProgram();
        const help = await parseHelp(parsedProgram, ['autonomous-mission', 'unknown-child', '--help']);
        const parentHelp = findCommand(parsedProgram, 'autonomous mission')!.helpInformation().trim();
        expect(help).toContain(getMessage('cli.batch.deprecated.autonomous_mission', lang));
        expect(help).not.toContain(parentHelp);
      });
    });
  }

  it('lists every deprecated forwarding command from surface-contract SSOT', () => {
    expect(listDeprecatedForwardingCommands()).toEqual(
      DEPRECATED_FORWARDING_SURFACES.map((surface) => surface.command),
    );
  });

  it('does not invoke either forwarding action while Commander renders help', async () => {
    const program = new CommanderCommand().name('deckent');
    let targetActions = 0;
    const mission = program.command('autonomous').command('mission');
    mission.command('create-goal <goal>').action(() => { targetActions += 1; });
    registerDeprecatedForwarding(program, getDeprecatedForwardingSurface('autonomous-mission')!);
    const print = vi.spyOn(output, 'print');
    try {
      await parseHelp(program, ['autonomous-mission', 'create-goal', 'goal-1', '--help']);
      expect(targetActions).toBe(0);
      expect(print).not.toHaveBeenCalled();
    } finally {
      print.mockRestore();
    }
  });

  it('restores the canonical output writer after capturing full target help', () => {
    const program = new CommanderCommand().name('deckent');
    let targetActions = 0;
    const target = program
      .command('canonical')
      .addHelpText('after', '\\nCanonical access-policy footer\\n')
      .action(() => { targetActions += 1; });
    const originalWriteOut = vi.fn();
    target.configureOutput({ writeOut: originalWriteOut, writeErr: () => {} });

    const expected = captureFullHelp(target).trimEnd();
    const rendered = replacementHelpBody(program, ['canonical']);

    expect(expected).toContain('Canonical access-policy footer');
    expect(rendered).toBe(expected);
    target.outputHelp();
    expect(originalWriteOut).toHaveBeenCalled();
    expect(targetActions).toBe(0);
  });

  it('restores the canonical output writer when target help throws', () => {
    const program = new CommanderCommand().name('deckent');
    const target = program
      .command('canonical')
      .addHelpText('after', () => { throw new Error('canonical footer failed'); });
    const originalWriteOut = vi.fn();
    target.configureOutput({ writeOut: originalWriteOut, writeErr: () => {} });

    expect(() => replacementHelpBody(program, ['canonical'])).toThrow('canonical footer failed');
    expect(() => target.outputHelp()).toThrow('canonical footer failed');
    expect(originalWriteOut).toHaveBeenCalled();
  });
});
