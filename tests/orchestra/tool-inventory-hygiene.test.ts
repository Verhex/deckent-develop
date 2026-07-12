/**
 * 429-011 HYG — .deckent hygiene verification for the 427-011 tool-inventory
 * persist.
 *
 * Before this task: `toolInventoryPath()` wrote to a flat
 * `.deckent/<sprintId>-tool-inventory.txt` root path that (a) accumulated
 * forever — nothing ever removed it — and (b) was not covered by any
 * .gitignore pattern (confirmed live: `.deckent/sprint-428-tool-inventory.txt`
 * / `sprint-429-tool-inventory.txt` show as untracked `??` in `git status`,
 * and `git check-ignore` reports no match for either).
 *
 * Proves (hermetic — real tmpdir, no real PATH probing, no real tmux/worker
 * kill — `cleanup()` from sprint-controller.js is mocked exactly like
 * env-probe-wire.test.ts does):
 *   1. toolInventoryPath() now resolves under the runtime-artifact home
 *      (.deckent/runtime/tool-inventory/), not the flat .deckent root.
 *   2. Dual-read: a file left at the pre-429-011 legacy flat path is still
 *      found by readToolInventory() when the new path is absent.
 *   3. The new path takes precedence when both exist.
 *   4. cleanupToolInventory() removes both the new- and legacy-path files
 *      for exactly one sprintId.
 *   5. NO_GO guard: cleaning up sprint A's inventory never touches sprint
 *      B's still-present inventory file.
 *   6. runCleanupPhase (Phase 8) wiring: after a real (non-delayed) cleanup
 *      pass for a sprint, that sprint's tool-inventory artifact is gone.
 *   7. .gitignore follow-up — documented as a skipped TODO test (see notes
 *      inline): .gitignore is not in this task's write-authority scope.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks (mirrors the existing precedent in env-probe-wire.test.ts) ────
// Only `cleanup` matters here — runCleanupPhase calls it directly, and the
// real implementation kills tmux workers / releases locks, which has no
// place in a hermetic unit test. cleanupToolInventory (this task's own
// addition) lives in sprint-phases.ts itself and is NOT mocked, so it runs
// for real against the tmpdir root.
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {
    constructor(msg: string, public phase: string) { super(msg); }
  },
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(),
  buildSpawnRetryHint: vi.fn(),
  waitForResults: vi.fn(),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

import {
  toolInventoryPath,
  writeToolInventory,
  readToolInventory,
  cleanupToolInventory,
  runCleanupPhase,
} from '../../src/orchestra/sprint-phases.js';
import { RUNTIME_DIR, DECKENT_DIR } from '../../src/core/constants.js';
import type { Sprint, ResolvedConfig } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';

function makeSprint(id: string): Sprint {
  return {
    id,
    number: 1,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
  };
}

const noDelayConfig = {} as unknown as ResolvedConfig;

/** Pre-429-011 flat-root path — mirrors the (now-legacy) original layout. */
function legacyPath(root: string, sprintId: string): string {
  return join(root, DECKENT_DIR, `${sprintId}-tool-inventory.txt`);
}

describe('tool-inventory-hygiene (429-011)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tool-inventory-hygiene-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('toolInventoryPath — runtime-artifact home', () => {
    it('resolves under .deckent/runtime/tool-inventory/, not the flat .deckent root', () => {
      const p = toolInventoryPath(root, 'sprint-429');
      expect(p).toBe(join(root, RUNTIME_DIR, 'tool-inventory', 'sprint-429.txt'));
      expect(p).not.toBe(join(root, DECKENT_DIR, 'sprint-429-tool-inventory.txt'));
    });

    it('writeToolInventory persists under the new path (verified on disk)', () => {
      writeToolInventory(root, 'sprint-429', 'python3=yes docker=yes rg=yes');
      const newPath = toolInventoryPath(root, 'sprint-429');
      expect(existsSync(newPath)).toBe(true);
      expect(readFileSync(newPath, 'utf-8')).toBe('python3=yes docker=yes rg=yes');
      // Never falls back to writing the old flat path.
      expect(existsSync(legacyPath(root, 'sprint-429'))).toBe(false);
    });
  });

  describe('dual-read (one-version bridge for in-flight sprints)', () => {
    it('falls back to the legacy flat path when the new path is absent', () => {
      mkdirSync(join(root, DECKENT_DIR), { recursive: true });
      writeFileSync(legacyPath(root, 'sprint-428'), 'python3=yes docker=no rg=yes', 'utf-8');

      expect(existsSync(toolInventoryPath(root, 'sprint-428'))).toBe(false);
      expect(readToolInventory(root, 'sprint-428')).toBe('python3=yes docker=no rg=yes');
    });

    it('prefers the new path when both the new and legacy files exist', () => {
      mkdirSync(join(root, DECKENT_DIR), { recursive: true });
      writeFileSync(legacyPath(root, 'sprint-427'), 'python3=no docker=no rg=no', 'utf-8');
      writeToolInventory(root, 'sprint-427', 'python3=yes docker=yes rg=yes');

      expect(readToolInventory(root, 'sprint-427')).toBe('python3=yes docker=yes rg=yes');
    });

    it('returns undefined when neither path exists', () => {
      expect(readToolInventory(root, 'sprint-never-probed')).toBeUndefined();
    });
  });

  describe('cleanupToolInventory — accumulation dies', () => {
    it('removes both the new-path and legacy-path files for the given sprintId', () => {
      writeToolInventory(root, 'sprint-429', 'python3=yes docker=yes rg=yes');
      mkdirSync(join(root, DECKENT_DIR), { recursive: true });
      writeFileSync(legacyPath(root, 'sprint-429'), 'stale-legacy-copy', 'utf-8');

      cleanupToolInventory(root, 'sprint-429');

      expect(existsSync(toolInventoryPath(root, 'sprint-429'))).toBe(false);
      expect(existsSync(legacyPath(root, 'sprint-429'))).toBe(false);
    });

    it('is idempotent / fail-soft when no file exists for the sprintId', () => {
      expect(() => cleanupToolInventory(root, 'sprint-nonexistent')).not.toThrow();
    });

    it('NO_GO guard: cleaning up one sprint never deletes another still-active sprint\'s inventory', () => {
      writeToolInventory(root, 'sprint-active', 'python3=yes docker=yes rg=yes');
      writeToolInventory(root, 'sprint-completing', 'python3=no docker=no rg=no');

      cleanupToolInventory(root, 'sprint-completing');

      expect(existsSync(toolInventoryPath(root, 'sprint-completing'))).toBe(false);
      expect(existsSync(toolInventoryPath(root, 'sprint-active'))).toBe(true);
      expect(readToolInventory(root, 'sprint-active')).toBe('python3=yes docker=yes rg=yes');
    });
  });

  describe('runCleanupPhase — wired into the sprint-end finalize/cleanup flow', () => {
    it('removes the completing sprint\'s tool-inventory artifact on a real (non-delayed) cleanup pass', () => {
      writeToolInventory(root, 'sprint-429', 'python3=yes docker=yes rg=yes');
      const sprint = makeSprint('sprint-429');

      const result = runCleanupPhase(root, sprint, noDelayConfig, undefined, null, undefined);

      expect(result).toBeNull();
      expect(existsSync(toolInventoryPath(root, 'sprint-429'))).toBe(false);
    });

    it('does not touch tool-inventory artifacts when opts.skipCleanup is set', () => {
      writeToolInventory(root, 'sprint-429', 'python3=yes docker=yes rg=yes');
      const sprint = makeSprint('sprint-429');

      runCleanupPhase(root, sprint, noDelayConfig, { skipCleanup: true }, null, undefined);

      expect(existsSync(toolInventoryPath(root, 'sprint-429'))).toBe(true);
    });
  });

  // ─── .gitignore follow-up (out of write-scope for this task) ──────────
  // goCriteria asks for gitignore coverage of the new runtime path, but
  // .gitignore is NOT in this task's write-authority list (only
  // src/orchestra/sprint-phases.ts + this test file — see worker-default.md
  // scope rules / ADR-D-004 boundary-violation self-flag). Documented as a
  // skipped TODO test (existing project convention — see
  // dependency-pipeline.test.ts / event-bus.test.ts `it.skip` usage) rather
  // than silently dropped. Flagged in the task .result notes for Brain to
  // dispatch as a follow-up: add `.deckent/runtime/tool-inventory/` to
  // .gitignore (the sibling purpose-folders JOBS_DIR/EVALUATIONS_DIR already
  // have their own explicit entries — this one currently does not).
  it.skip('(.gitignore follow-up, out of write-scope) .deckent/runtime/tool-inventory/ is covered by .gitignore', () => {
    const gitignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf-8');
    expect(gitignore).toMatch(/\.deckent\/runtime\/tool-inventory\//);
  });
});
