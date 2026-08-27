import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { registerRetro } from '../../../src/cli/commands/retro.js';

describe('retro command surface', () => {
  it('registers --explain with --task passthrough on retro', () => {
    const program = new Command();
    registerRetro(program);
    const retro = program.commands.find((command) => command.name() === 'retro');

    expect(retro?.options.some((option) => option.long === '--explain')).toBe(true);
    expect(retro?.options.some((option) => option.long === '--task')).toBe(true);
  });
});
