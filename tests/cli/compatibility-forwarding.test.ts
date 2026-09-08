import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

import {
  buildBaselineForwardArgv,
  parseReplacementSurface,
  registerDeprecatedForwarding,
  getDeprecatedForwardingSurface,
} from '../../src/cli/helpers/compatibility-command-help.js';

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
  output: vi.fn(),
}));

describe('compatibility forwarding baseline argv', () => {
  it('parseReplacementSurface splits inject flags and target segments', () => {
    expect(parseReplacementSurface('status --watch')).toEqual({
      prefixFlags: ['--watch'],
      targetPath: ['status'],
    });
    expect(parseReplacementSurface('retro --explain')).toEqual({
      prefixFlags: ['--explain'],
      targetPath: ['retro'],
    });
    expect(parseReplacementSurface('audit verify')).toEqual({
      prefixFlags: [],
      targetPath: ['audit', 'verify'],
    });
  });

  it('buildBaselineForwardArgv preserves prefix flags and passthrough tokens', () => {
    expect(buildBaselineForwardArgv(['--watch'], ['--interval', '15', '--no-color'])).toEqual([
      'node',
      'deckent',
      '--watch',
      '--interval',
      '15',
      '--no-color',
    ]);
    expect(buildBaselineForwardArgv([], ['--list'])).toEqual(['node', 'deckent', '--list']);
    expect(buildBaselineForwardArgv(['--logs'], ['extra', '--unknown-flag'])).toEqual([
      'node',
      'deckent',
      '--logs',
      'extra',
      '--unknown-flag',
    ]);
  });
});

describe('registerDeprecatedForwarding Commander capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function captureForward(
    surfaceName: string,
    input: string[],
  ): Promise<{ forwarded?: string[]; opts?: Record<string, unknown> }> {
    const program = new Command();
    program.name('deckent').exitOverride();

    let forwarded: string[] | undefined;
    let capturedOpts: Record<string, unknown> | undefined;

    const watch = program
      .command('watch [args...]')
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .option('--list', 'list windows')
      .option('--no-color', 'disable color')
      .action((opts) => {
        capturedOpts = opts as Record<string, unknown>;
      });
    const watchParse = watch.parseAsync.bind(watch);
    watch.parseAsync = async (argv, opts) => {
      forwarded = argv;
      return watchParse(argv, opts);
    };

    const status = program
      .command('status [args...]')
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .option('--watch', 'watch mode')
      .option('--no-color', 'disable color')
      .action((opts) => {
        capturedOpts = opts as Record<string, unknown>;
      });
    const statusParse = status.parseAsync.bind(status);
    status.parseAsync = async (argv, opts) => {
      forwarded = argv;
      return statusParse(argv, opts);
    };

    const surface = getDeprecatedForwardingSurface(surfaceName);
    expect(surface).toBeDefined();
    registerDeprecatedForwarding(program, surface!);

    await program.parseAsync(['node', 'deckent', surfaceName, ...input], { from: 'node' });
    return { forwarded, opts: capturedOpts };
  }

  it('forwards attach leaf flags to watch with from:node argv', async () => {
    const { forwarded } = await captureForward('attach', ['--list']);
    expect(forwarded).toEqual(['node', 'deckent', '--list']);
  });

  it('forwards dashboard group flags with inject prefix and negated boolean', async () => {
    const { forwarded } = await captureForward('dashboard', ['--interval', '15', '--no-color']);
    expect(forwarded).toEqual(['node', 'deckent', '--watch', '--interval', '15', '--no-color']);
  });

  it('passes unknown tokens through without opts serializer', async () => {
    const { forwarded } = await captureForward('attach', ['--weird', 'value', 'positional']);
    expect(forwarded).toEqual(['node', 'deckent', '--weird', 'value', 'positional']);
  });
});
