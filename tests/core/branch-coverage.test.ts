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

  // ─── utils.ts: countBrainLines edge cases ─────────────────────────
  describe('countBrainLines', () => {
    it('returns 0 when .brain dir does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { countBrainLines } = await import('../../src/core/utils.js');
      const result = countBrainLines('/tmp/test');

      expect(result).toBe(0);
    });

    it('skips archive and sprints directories in top-level scan', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.brain')) return true;
        if (path.endsWith('sprints')) return false; // no sprints subdir
        return true;
      });
      vi.mocked(readdirSync).mockReturnValue(
        ['MEMORY.md', 'archive', 'sprints', 'DECISIONS.md'] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockReturnValue('line1\nline2\nline3\n');

      const { countBrainLines } = await import('../../src/core/utils.js');
      const result = countBrainLines('/tmp/test');

      // Only MEMORY.md and DECISIONS.md should be counted (archive and sprints skipped)
      // Each file has 4 lines (3 content lines + 1 trailing empty from split)
      expect(result).toBe(8);
    });

    it('handles readFileSync errors for directory entries (catch block)', async () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('.brain')) return true;
        if (path.endsWith('sprints')) return false;
        return true;
      });
      vi.mocked(readdirSync).mockReturnValue(
        ['somedir', 'MEMORY.md'] as unknown as ReturnType<typeof readdirSync>,
      );
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('somedir')) throw new Error('EISDIR');
        return 'line1\nline2\n';
      });

      const { countBrainLines } = await import('../../src/core/utils.js');
      const result = countBrainLines('/tmp/test');

      // Only MEMORY.md counted: 3 lines (2 content + 1 trailing empty)
      expect(result).toBe(3);
    });

    it('counts sprint files in sprints subdirectory', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('sprints')) return ['sprint-001.md', 'sprint-002.md'] as unknown as ReturnType<typeof readdirSync>;
        return ['MEMORY.md', 'archive', 'sprints'] as unknown as ReturnType<typeof readdirSync>;
      });
      vi.mocked(readFileSync).mockReturnValue('a\nb\n');

      const { countBrainLines } = await import('../../src/core/utils.js');
      const result = countBrainLines('/tmp/test');

      // MEMORY.md: 3 lines, sprint-001.md: 3 lines, sprint-002.md: 3 lines = 9
      expect(result).toBe(9);
    });

    it('handles readFileSync error in sprints loop (catch block)', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockImplementation((p: unknown) => {
        const path = String(p);
        if (path.endsWith('sprints')) return ['corrupt.md'] as unknown as ReturnType<typeof readdirSync>;
        return ['archive', 'sprints'] as unknown as ReturnType<typeof readdirSync>;
      });
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('read error');
      });

      const { countBrainLines } = await import('../../src/core/utils.js');
      const result = countBrainLines('/tmp/test');

      // All reads fail, so total should be 0
      expect(result).toBe(0);
    });
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
