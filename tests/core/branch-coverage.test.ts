import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// ─── Tests ──────────────────────────────────────────────────────────

describe('Core Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── constants.ts: DECKENT_VERSION catch fallback ─────────────────
  // These tests MUST be last — they use vi.resetModules() which clears
  // the module cache and can interfere with tests above.
  describe('DECKENT_VERSION fallback', () => {
    it('falls back to 0.0.0 when package.json cannot be read', async () => {
      vi.resetModules();

      vi.doMock('node:fs', () => ({
        readFileSync: () => { throw new Error('ENOENT'); },
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      }));

      const { DECKENT_VERSION } = await import('../../src/core/constants.js');
      expect(DECKENT_VERSION).toBe('0.0.0');
    });

    it('falls back to 0.0.0 when package.json has no version field', async () => {
      vi.resetModules();

      vi.doMock('node:fs', () => ({
        readFileSync: () => JSON.stringify({ name: 'test' }),
        existsSync: vi.fn(),
        readdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
      }));

      const { DECKENT_VERSION } = await import('../../src/core/constants.js');
      expect(DECKENT_VERSION).toBe('0.0.0');
    });
  });
});
