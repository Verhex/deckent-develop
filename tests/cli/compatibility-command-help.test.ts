import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Command } from 'commander';

import { buildProgram } from '../../src/cli/index.js';
import {
  DEPRECATED_FORWARDING_SURFACES,
  listDeprecatedForwardingCommands,
  parseReplacementSurface,
  replacementHelpBody,
} from '../../src/cli/helpers/compatibility-command-help.js';
import { getContract } from '../../src/core/cli-command-contract.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

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

function findCommand(program: Command, path: string): Command | undefined {
  const segments = path.split(' ');
  let cmd: Command | undefined = program;
  for (const segment of segments) {
    cmd = cmd?.commands.find((candidate) => candidate.name() === segment);
  }
  return cmd;
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
    });
  }

  it('lists every deprecated forwarding command from surface-contract SSOT', () => {
    expect(listDeprecatedForwardingCommands()).toEqual(
      DEPRECATED_FORWARDING_SURFACES.map((surface) => surface.command),
    );
  });
});
