/**
 * CLI buildProgram Smoke Test
 *
 * Runtime-level verification that buildProgram() registers all commands
 * without throwing and without duplicates. Prevents regressions like
 * Sprint 149 T-149-019 duplicate command registration.
 *
 * Complements registration-harness.test.ts (static analysis) with
 * actual Commander runtime execution.
 */

import { describe, it, expect } from 'vitest';
import { buildProgram } from '../../src/cli/index.js';

describe('buildProgram smoke', () => {
  it('does not throw on commander register', () => {
    expect(() => buildProgram()).not.toThrow();
  });

  it('registers all commands without duplicates', () => {
    const program = buildProgram();
    const commands = program.commands.map((c) => c.name());
    const duplicates = commands.filter((c, i) => commands.indexOf(c) !== i);
    expect(duplicates).toEqual([]);
    // 45 top-level commands as of Sprint 151 (some register* add subcommands)
    expect(commands.length).toBeGreaterThanOrEqual(45);
  });

  it('every command has a non-empty description', () => {
    const program = buildProgram();
    for (const cmd of program.commands) {
      expect(cmd.description(), `command "${cmd.name()}" missing description`).toBeTruthy();
    }
  });

  it('every command has a unique name', () => {
    const program = buildProgram();
    const names = program.commands.map((c) => c.name());
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('known critical commands are present', () => {
    const program = buildProgram();
    const names = new Set(program.commands.map((c) => c.name()));
    const critical = [
      'init', 'start', 'plan', 'status', 'kill', 'cleanup',
      'retro', 'doctor', 'config', 'review', 'run', 'recall',
      'remember', 'memory', 'nervous', 'mode', 'help-info',
    ];
    for (const cmd of critical) {
      expect(names.has(cmd), `critical command "${cmd}" not registered`).toBe(true);
    }
  });

  it('watch command description advertises docker-worker following', () => {
    const program = buildProgram();
    const watch = program.commands.find((c) => c.name() === 'watch');
    expect(watch, 'watch command registered').toBeTruthy();
    // backend-aware: docker workers are followed via `docker logs -f`, not a tmux pane
    expect(watch!.description().toLowerCase()).toContain('docker');
  });

  it('top-level help points users to the localized quick-reference', () => {
    const program = buildProgram();
    // `deckent help` / `--help` (commander built-in) should surface `deckent info`.
    // addHelpText('after', …) content is emitted by outputHelp(), not helpInformation().
    let out = '';
    program.configureOutput({ writeOut: (s: string) => { out += s; } });
    program.outputHelp();
    expect(out).toContain('deckent info');
  });
});
