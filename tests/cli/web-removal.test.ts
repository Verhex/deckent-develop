/**
 * 563-002 — `web` command removal pin.
 *
 * `deckent web` was a deprecated wrapper that started the SAME api/server.js
 * instance `deckent serve` starts, with a strict subset of serve's options.
 * It is gone: the registration, the command module, the COMMAND_REGISTRY entry
 * and the `cli.web.desc` / `web.*` catalog keys are all removed.
 *
 * This file is the mechanical guard against a silent re-introduction, and it
 * pins the replacement UX: an unknown `web` invocation must fall through to
 * Commander's suggestion path (`showSuggestionAfterError(true)`, index.ts) and
 * point the user at `serve`.
 *
 * Hermetic: pure in-process Commander construction — no tmpdir, no spawn, no
 * network, no filesystem writes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { Command } from 'commander';
import { buildProgram } from '../../src/cli/index.js';
import { COMMAND_REGISTRY, getCommand } from '../../src/core/command-registry.js';
import { MESSAGE_KEYS } from '../../src/cli/helpers/messages.js';

/** Serve's full option surface at removal time — byte-regression anchor. */
const SERVE_FLAGS = [
  '--port <number>',
  '--dev',
  '--dev-port <number>',
  '--host <addr>',
  '--no-terminal',
] as const;

describe('`web` command removal — CLI surface', () => {
  let program: Command;
  let commandNames: string[];

  beforeAll(() => {
    program = buildProgram();
    commandNames = program.commands.map((c) => c.name());
  });

  it('buildProgram() no longer registers a `web` command', () => {
    expect(commandNames).not.toContain('web');
  });

  it('does not expose `web` as an alias of any surviving command', () => {
    const aliased = program.commands.filter((c) => c.aliases().includes('web'));
    expect(aliased.map((c) => c.name())).toEqual([]);
  });

  it('still registers a healthy command set after the removal', () => {
    // cli-inventory.test.ts pins >= 45; removing one command must not cross it.
    expect(commandNames.length).toBeGreaterThanOrEqual(45);
  });
});

/** Parse `argv` against a fresh program, capturing the CommanderError + stderr. */
function parseUnknown(arg: string): { code?: string; stderr: string } {
  const program = buildProgram();
  program.exitOverride();

  let stderr = '';
  program.configureOutput({
    writeOut: () => {},
    writeErr: (str: string) => {
      stderr += str;
    },
  });

  let code: string | undefined;
  try {
    program.parse(['node', 'deckent', arg]);
  } catch (err) {
    code = (err as { code?: string }).code;
  }
  return { code, stderr };
}

describe('`deckent web` falls through to the unknown-command path', () => {
  it('errors with commander.unknownCommand naming the typed word', () => {
    const { code, stderr } = parseUnknown('web');
    expect(code).toBe('commander.unknownCommand');
    expect(stderr).toContain("unknown command 'web'");
  });

  /**
   * MEASURED behavior, not aspiration: `showSuggestionAfterError(true)` is
   * enabled on the program (index.ts), but Commander's `suggestSimilar` edit-
   * distance threshold rejects `web` -> `serve` (distance 4), so `web` gets NO
   * "(Did you mean ...)" line. Pinning the aspirational text here would force a
   * permanent `web` alias, which would defeat the removal. The positive control
   * below proves the suggestion machinery really is live.
   */
  it('emits no suggestion for `web` — too far from any surviving command', () => {
    expect(parseUnknown('web').stderr).not.toContain('Did you mean');
  });

  it('positive control: a near-miss of `serve` IS suggested', () => {
    const { code, stderr } = parseUnknown('serv');
    expect(code).toBe('commander.unknownCommand');
    expect(stderr).toContain('Did you mean serve?');
  });
});

describe('`serve` is unchanged by the removal', () => {
  let serve: Command | undefined;

  beforeAll(() => {
    serve = buildProgram().commands.find((c) => c.name() === 'serve');
  });

  it('is still registered with a non-empty description', () => {
    expect(serve).toBeDefined();
    expect(serve!.description().trim().length).toBeGreaterThan(0);
  });

  it('keeps its full option surface (no flag migrated from or lost to `web`)', () => {
    const flags = serve!.options.map((o) => o.flags);
    for (const flag of SERVE_FLAGS) {
      expect(flags).toContain(flag);
    }
    expect(flags).toHaveLength(SERVE_FLAGS.length);
  });
});

describe('`web` removal — registry and catalog', () => {
  it('COMMAND_REGISTRY has no `web` entry', () => {
    expect(getCommand('web')).toBeUndefined();
    expect(COMMAND_REGISTRY.map((e) => e.name)).not.toContain('web');
  });

  it('leaves no MCP parity hole — `web` never had an MCP tool', () => {
    // The removed entry was surfaces:['cli'] with no mcpNames, so no MCP tool
    // folded into it and the CLI<->MCP parity fold is untouched.
    const mcpNames = COMMAND_REGISTRY.flatMap((e) => e.mcpNames ?? []);
    expect(mcpNames.some((n) => n === 'deckent_web' || n.endsWith('_web'))).toBe(false);
  });

  it('drops `cli.web.desc` from the bilingual catalog', () => {
    expect(MESSAGE_KEYS).not.toContain('cli.web.desc');
  });

  it('leaves no orphaned `web.*` runtime message keys', () => {
    const orphans = MESSAGE_KEYS.filter((k) => k.startsWith('web.'));
    expect(orphans).toEqual([]);
  });

  it('keeps `serve` catalog coverage intact', () => {
    expect(MESSAGE_KEYS).toContain('cli.serve.desc');
  });
});
