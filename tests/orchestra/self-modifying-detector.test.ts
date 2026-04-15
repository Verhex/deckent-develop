// ═══ Self-Modifying Detector Tests ════════════════════════════════
// Sprint 139 — ADR-039: Deckent Dogfood vs User Project Discrimination

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectDeckentRepo,
  isSelfModifying,
  isSelfModifyingSprint,
  clearDetectionCache,
  DECKENT_SOURCE_PATTERNS,
} from '../../src/orchestra/self-modifying-detector.js';

describe('self-modifying-detector', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `deckent-self-mod-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testRoot, { recursive: true });
    clearDetectionCache();
  });

  afterEach(() => {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  // ─── Helper: create a minimal project structure ───────────────────

  function setupDeckentRepo(): void {
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(testRoot, 'package.json'),
      JSON.stringify({ name: 'deckent', version: '0.4.0' }),
      'utf-8',
    );
  }

  function setupUserProject(name: string = 'my-awesome-app'): void {
    mkdirSync(join(testRoot, '.deckent'), { recursive: true });
    writeFileSync(
      join(testRoot, 'package.json'),
      JSON.stringify({ name, version: '1.0.0' }),
      'utf-8',
    );
  }

  function makeTask(directories: string[], filesWrite: string[] = []) {
    return {
      scope: {
        directories,
        filesRead: [],
        filesWrite,
      },
    };
  }

  // ═══ detectDeckentRepo ═══════════════════════════════════════════

  describe('detectDeckentRepo', () => {
    it('should return true for the Deckent repo (.deckent/ + package.json name === "deckent")', () => {
      setupDeckentRepo();
      expect(detectDeckentRepo(testRoot)).toBe(true);
    });

    it('should return false for a user project with .deckent/ but different name', () => {
      setupUserProject('my-rails-app');
      expect(detectDeckentRepo(testRoot)).toBe(false);
    });

    it('should return false when .deckent/ does not exist', () => {
      writeFileSync(
        join(testRoot, 'package.json'),
        JSON.stringify({ name: 'deckent' }),
        'utf-8',
      );
      expect(detectDeckentRepo(testRoot)).toBe(false);
    });

    it('should return false when package.json does not exist', () => {
      mkdirSync(join(testRoot, '.deckent'), { recursive: true });
      expect(detectDeckentRepo(testRoot)).toBe(false);
    });

    it('should return false for a non-existent directory', () => {
      expect(detectDeckentRepo(join(testRoot, 'does-not-exist'))).toBe(false);
    });

    it('should cache results for the same projectRoot', () => {
      setupDeckentRepo();
      const first = detectDeckentRepo(testRoot);
      // Remove .deckent to prove caching
      rmSync(join(testRoot, '.deckent'), { recursive: true, force: true });
      const second = detectDeckentRepo(testRoot);
      expect(first).toBe(true);
      expect(second).toBe(true); // cached — still true even after removal
    });

    it('should return fresh result after clearDetectionCache()', () => {
      setupDeckentRepo();
      expect(detectDeckentRepo(testRoot)).toBe(true);

      // Remove .deckent and clear cache
      rmSync(join(testRoot, '.deckent'), { recursive: true, force: true });
      clearDetectionCache();

      expect(detectDeckentRepo(testRoot)).toBe(false);
    });
  });

  // ═══ isSelfModifying ═══════════════════════════════════════════

  describe('isSelfModifying', () => {
    it('should return true when Deckent repo task writes to src/orchestra/', () => {
      setupDeckentRepo();
      const task = makeTask(['src/orchestra/']);
      expect(isSelfModifying(task, testRoot)).toBe(true);
    });

    it('should return true when Deckent repo task writes specific file in src/core/', () => {
      setupDeckentRepo();
      const task = makeTask([], ['src/core/types.ts']);
      expect(isSelfModifying(task, testRoot)).toBe(true);
    });

    it('should return false for user project even with Deckent-like scope', () => {
      setupUserProject();
      const task = makeTask(['src/orchestra/', 'src/core/']);
      expect(isSelfModifying(task, testRoot)).toBe(false);
    });

    it('should return false when scope only touches non-Deckent directories', () => {
      setupDeckentRepo();
      const task = makeTask(['docs/', '.brain/'], ['DIRECTIVES.md']);
      expect(isSelfModifying(task, testRoot)).toBe(false);
    });

    it('should return true for .deckent/agents/ scope', () => {
      setupDeckentRepo();
      const task = makeTask(['.deckent/agents/']);
      expect(isSelfModifying(task, testRoot)).toBe(true);
    });

    it('should return true for .deckent/skills/ scope', () => {
      setupDeckentRepo();
      const task = makeTask(['.deckent/skills/']);
      expect(isSelfModifying(task, testRoot)).toBe(true);
    });

    it('should return false for .deckent/ root (not agents/skills)', () => {
      setupDeckentRepo();
      const task = makeTask([], ['.deckent/config.json']);
      expect(isSelfModifying(task, testRoot)).toBe(false);
    });

    it('should match files within pattern directories (prefix match)', () => {
      setupDeckentRepo();
      const task = makeTask([], ['src/mcp/tools/status.ts']);
      expect(isSelfModifying(task, testRoot)).toBe(true);
    });

    it('should match all DECKENT_SOURCE_PATTERNS', () => {
      setupDeckentRepo();
      for (const pattern of DECKENT_SOURCE_PATTERNS) {
        const task = makeTask([pattern]);
        expect(isSelfModifying(task, testRoot)).toBe(true);
      }
    });
  });

  // ═══ isSelfModifyingSprint ═══════════════════════════════════════

  describe('isSelfModifyingSprint', () => {
    it('should return true when at least one task is self-modifying', () => {
      setupDeckentRepo();
      const tasks = [
        makeTask(['docs/']),
        makeTask(['src/core/']),
        makeTask(['.brain/']),
      ];
      expect(isSelfModifyingSprint(tasks, testRoot)).toBe(true);
    });

    it('should return false when no tasks are self-modifying', () => {
      setupDeckentRepo();
      const tasks = [
        makeTask(['docs/']),
        makeTask(['.brain/'], ['DIRECTIVES.md']),
        makeTask(['.tasks/']),
      ];
      expect(isSelfModifyingSprint(tasks, testRoot)).toBe(false);
    });

    it('should return false for user project regardless of scope', () => {
      setupUserProject();
      const tasks = [
        makeTask(['src/core/', 'src/orchestra/', 'src/mcp/']),
      ];
      expect(isSelfModifyingSprint(tasks, testRoot)).toBe(false);
    });

    it('should return false for empty task array', () => {
      setupDeckentRepo();
      expect(isSelfModifyingSprint([], testRoot)).toBe(false);
    });

    it('should handle readonly array', () => {
      setupDeckentRepo();
      const tasks = Object.freeze([
        Object.freeze(makeTask(['src/agents/'])),
      ]);
      expect(isSelfModifyingSprint(tasks, testRoot)).toBe(true);
    });
  });

  // ═══ DECKENT_SOURCE_PATTERNS constant ═══════════════════════════

  describe('DECKENT_SOURCE_PATTERNS', () => {
    it('should contain all expected Deckent source directories', () => {
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/core/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/orchestra/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/monitor/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/agents/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/cli/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/mcp/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/providers/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/api/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('src/dashboard/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('.deckent/agents/');
      expect(DECKENT_SOURCE_PATTERNS).toContain('.deckent/skills/');
    });

    it('should be a readonly array (TypeScript as const)', () => {
      // `as const` provides compile-time readonly guarantee, not runtime freeze
      expect(Array.isArray(DECKENT_SOURCE_PATTERNS)).toBe(true);
      expect(DECKENT_SOURCE_PATTERNS.length).toBeGreaterThan(0);
    });
  });
});
