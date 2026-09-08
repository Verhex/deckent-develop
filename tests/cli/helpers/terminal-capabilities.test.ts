import { describe, it, expect, afterEach, vi } from 'vitest';
import { hasUtf8Locale, resolveTerminalAscii } from '../../../src/cli/helpers/terminal-capabilities.js';

describe('terminal-capabilities', () => {
  afterEach(() => { vi.unstubAllEnvs(); });
  describe('hasUtf8Locale', () => {
    it('treats unset locale as UTF-8 capable', () => {
      expect(hasUtf8Locale({})).toBe(true);
    });

    it('accepts explicit UTF-8 locales', () => {
      expect(hasUtf8Locale({ LANG: 'en_US.UTF-8' })).toBe(true);
      expect(hasUtf8Locale({ LC_CTYPE: 'C.UTF-8' })).toBe(true);
      expect(hasUtf8Locale({ LANG: 'en_US.utf8' })).toBe(true);
      expect(hasUtf8Locale({ LANG: 'C.utf8' })).toBe(true);
      expect(hasUtf8Locale({ LANG: 'en_US.UTF8' })).toBe(true);
    });

    it('treats empty locale strings like unset (UTF-8 capable fallback)', () => {
      expect(hasUtf8Locale({ LANG: '' })).toBe(true);
      expect(hasUtf8Locale({ LC_ALL: '', LC_CTYPE: 'C.UTF-8' })).toBe(true);
    });

    it('rejects non-UTF-8 locales', () => {
      expect(hasUtf8Locale({ LANG: 'C' })).toBe(false);
      expect(hasUtf8Locale({ LC_ALL: 'POSIX' })).toBe(false);
    });

    it('applies LC_ALL > LC_CTYPE > LANG precedence', () => {
      expect(hasUtf8Locale({
        LC_ALL: 'C',
        LC_CTYPE: 'C.UTF-8',
        LANG: 'en_US.UTF-8',
      })).toBe(false);
      expect(hasUtf8Locale({
        LC_ALL: 'C.UTF-8',
        LC_CTYPE: 'C',
        LANG: 'C',
      })).toBe(true);
      expect(hasUtf8Locale({
        LC_CTYPE: 'C',
        LANG: 'en_US.UTF-8',
      })).toBe(false);
      expect(hasUtf8Locale({
        LC_CTYPE: 'en_US.UTF-8',
        LANG: 'C',
      })).toBe(true);
    });

    it('treats unset locale keys as absent in the chain', () => {
      expect(hasUtf8Locale({ LC_ALL: undefined, LC_CTYPE: undefined, LANG: undefined })).toBe(true);
    });
  });

  describe('resolveTerminalAscii', () => {
    it('defaults to Unicode on capable terminals', () => {
      expect(resolveTerminalAscii({ TERM: 'xterm-256color' })).toBe(false);
    });

    it('does not read ambient TERM when the injected environment omits it', () => {
      vi.stubEnv('TERM', 'dumb');
      expect(resolveTerminalAscii({ LANG: 'en_US.UTF-8' })).toBe(false);
      vi.stubEnv('TERM', 'xterm-256color');
      expect(resolveTerminalAscii({ TERM: 'dumb', LANG: 'en_US.UTF-8' })).toBe(true);
    });

    it('respects locale precedence without reading the host locale', () => {
      expect(hasUtf8Locale({ LC_ALL: 'C', LC_CTYPE: 'C.UTF-8', LANG: 'en_US.UTF-8' })).toBe(false);
      expect(hasUtf8Locale({ LC_ALL: 'C.UTF-8', LANG: 'C' })).toBe(true);
    });

    it('selects ASCII for dumb terminals', () => {
      expect(resolveTerminalAscii({ TERM: 'dumb' })).toBe(true);
    });

    it('selects ASCII when DECKENT_ASCII=1', () => {
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', DECKENT_ASCII: '1' })).toBe(true);
    });

    it('ignores DECKENT_ASCII values other than exact "1"', () => {
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', DECKENT_ASCII: '0' })).toBe(false);
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', DECKENT_ASCII: 'true' })).toBe(false);
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', DECKENT_ASCII: 'yes' })).toBe(false);
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', DECKENT_ASCII: '' })).toBe(false);
    });

    it('selects ASCII for non-UTF-8 locales', () => {
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', LANG: 'C' })).toBe(true);
    });

    it('does not conflate NO_COLOR with glyph tier', () => {
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', NO_COLOR: '' })).toBe(false);
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', NO_COLOR: '1' })).toBe(false);
    });

    it('normalizes TERM trim and case for dumb detection', () => {
      expect(resolveTerminalAscii({ TERM: '  DUMB  ' })).toBe(true);
      expect(resolveTerminalAscii({ TERM: 'Dumb' })).toBe(true);
      expect(resolveTerminalAscii({ TERM: 'xterm-256color' })).toBe(false);
    });

    it('honors explicit term override independent of env TERM', () => {
      vi.stubEnv('TERM', 'dumb');
      expect(resolveTerminalAscii({ LANG: 'en_US.UTF-8' }, 'xterm-256color')).toBe(false);
      expect(resolveTerminalAscii({ LANG: 'en_US.UTF-8', TERM: 'xterm-256color' }, 'dumb')).toBe(true);
    });

    it('selects ASCII for POSIX locale spellings', () => {
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', LANG: 'POSIX' })).toBe(true);
      expect(resolveTerminalAscii({ TERM: 'xterm-256color', LC_ALL: 'C' })).toBe(true);
    });
  });
});
