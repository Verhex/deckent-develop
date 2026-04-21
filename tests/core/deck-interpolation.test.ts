import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { interpolateConfig } from '../../src/core/deck-interpolation.js';

// Mock loadDeckSecrets
vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(),
}));

import { loadDeckSecrets } from '../../src/core/deck-file.js';
const mockLoadDeckSecrets = vi.mocked(loadDeckSecrets);

describe('interpolateConfig', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('resolves $DECK:KEY when .deck has the key', () => {
    mockLoadDeckSecrets.mockReturnValue({ DISCORD_TOKEN: 'secret-abc-123' });

    const config = { connectors: { discord: { token: '$DECK:DISCORD_TOKEN' } } };
    const result = interpolateConfig(config, '/project');

    expect(result.connectors.discord.token).toBe('secret-abc-123');
  });

  it('keeps placeholder and warns when key is missing', () => {
    mockLoadDeckSecrets.mockReturnValue({});

    const config = { token: '$DECK:MISSING_KEY' };
    const result = interpolateConfig(config, '/project');

    expect(result.token).toBe('$DECK:MISSING_KEY');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing secret: MISSING_KEY'),
    );
  });

  it('interpolates nested objects', () => {
    mockLoadDeckSecrets.mockReturnValue({
      A_KEY: 'val-a',
      B_KEY: 'val-b',
    });

    const config = {
      level1: {
        level2: {
          a: '$DECK:A_KEY',
          b: '$DECK:B_KEY',
          c: 'plain-text',
        },
      },
    };
    const result = interpolateConfig(config, '/project');

    expect(result.level1.level2.a).toBe('val-a');
    expect(result.level1.level2.b).toBe('val-b');
    expect(result.level1.level2.c).toBe('plain-text');
  });

  it('interpolates arrays', () => {
    mockLoadDeckSecrets.mockReturnValue({ TOKEN: 'resolved' });

    const config = { items: ['$DECK:TOKEN', 'normal', '$DECK:TOKEN'] };
    const result = interpolateConfig(config, '/project');

    expect(result.items).toEqual(['resolved', 'normal', 'resolved']);
  });

  it('does not modify non-matching strings', () => {
    mockLoadDeckSecrets.mockReturnValue({ FOO: 'bar' });

    const config = {
      plain: 'hello world',
      partial: 'prefix $DECK:FOO suffix',
      similar: '$DECK_NOT_MATCH',
      number: 42,
      bool: true,
      nil: null,
    };
    const result = interpolateConfig(config, '/project');

    expect(result.plain).toBe('hello world');
    expect(result.partial).toBe('prefix $DECK:FOO suffix'); // partial match = no replace
    expect(result.similar).toBe('$DECK_NOT_MATCH');
    expect(result.number).toBe(42);
    expect(result.bool).toBe(true);
    expect(result.nil).toBe(null);
  });

  it('falls back to DECKENT_ prefixed key', () => {
    mockLoadDeckSecrets.mockReturnValue({
      DECKENT_DISCORD_TOKEN: 'legacy-token-xyz',
    });

    const config = { token: '$DECK:DISCORD_TOKEN' };
    const result = interpolateConfig(config, '/project');

    expect(result.token).toBe('legacy-token-xyz');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
