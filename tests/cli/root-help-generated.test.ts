import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildProgram } from '../../src/cli/index.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { SURFACE_REGISTRY } from '../../src/cli/surface-registry.js';

describe('registry-generated root help', () => {
  const originalLanguage = process.env['DECKENT_LANGUAGE'];

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalLanguage === undefined) delete process.env['DECKENT_LANGUAGE'];
    else process.env['DECKENT_LANGUAGE'] = originalLanguage;
  });

  it('renders the compact English-default surface instead of the flat command list', () => {
    delete process.env['DECKENT_LANGUAGE'];
    delete process.env['DECKENT_LANG'];
    process.env['LC_ALL'] = 'C';
    process.env['LANG'] = 'C';

    const help = buildProgram().helpInformation();

    for (const heading of ['Run', 'Observe', 'Control', 'System', 'Advanced']) {
      expect(help).toMatch(new RegExp(`^${heading}\\s`, 'm'));
    }
    expect(help).toContain('Usage: deckent [options] [prompt]');
    expect(help).toContain('deckent "<prompt>"');
    expect(help).toContain('deckent help advanced');
    expect(help).not.toContain('Commands:');
    expect(help).not.toContain('help-info');
  });

  it('keeps the deprecated block OUT of root help and lists every visible command with its summary', () => {
    // Owner-yönergesi (2026-08-27 akşam): kök-help'te deprecated-bloğu YOK;
    // her görünür komut kendi satırında açıklamasıyla listelenir.
    const help = buildProgram().helpInformation();
    expect(help).not.toContain('→');
    for (const command of SURFACE_REGISTRY.filter(({ status }) => status === 'visible')) {
      expect(help).toContain(`  ${command.name}`);
      expect(help).toContain(getMessage(command.summaryKey, 'en'));
    }
  });

  it('prints the advanced and deprecated registry exactly once via a real command', async () => {
    const writes: string[] = [];
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const program = buildProgram();

    await program.parseAsync(['node', 'deckent', 'help', 'advanced']);
    expect(writeSpy).toHaveBeenCalledOnce();

    const help = writes.join('');
    const expected = SURFACE_REGISTRY.filter(({ status }) => status !== 'visible');
    const renderedNames = help
      .split('\n')
      .slice(4)
      .filter((line) => line.startsWith('  '))
      .map((line) => line.trim().split(/\s{2,}/u)[0]);

    expect(renderedNames).toEqual(expected.map(({ name }) => name));
    for (const command of expected) {
      expect(help.match(new RegExp(`^  ${command.name}(?:\\s{2,})`, 'gm'))).toHaveLength(1);
    }
  });

  it('uses the registered Turkish catalog through the existing resolver', () => {
    process.env['DECKENT_LANGUAGE'] = 'tr';
    const help = buildProgram().helpInformation();

    expect(help).toContain('Kullanım: deckent [seçenekler] [prompt]');
    expect(help).not.toContain('cli.root_help.');
  });
});
