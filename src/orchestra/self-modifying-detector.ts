// ═══ Self-Modifying Task Detector ═══════════════════════════════════
// ADR-039: Deckent Dogfood vs User Project Discrimination
//
// Detects when a sprint modifies Deckent's own source code (dogfood mode)
// vs when it orchestrates an external user project. This distinction is
// critical because self-modifying sprints require sequential execution,
// cache invalidation, and MCP restart considerations.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────
import type { TaskScope } from '../core/task-types.js';

/**
 * Minimal task shape needed for self-modification detection.
 * Uses Pick-style interface to avoid coupling to full Task type.
 */
export interface SelfModifyCheckable {
  scope: TaskScope;
}

// ─── Constants ──────────────────────────────────────────────────────

/**
 * Directory prefixes that, when written to, indicate modification of
 * Deckent's own runtime source code. Only relevant when the project
 * IS the Deckent repository (detected by `detectDeckentRepo`).
 */
export const DECKENT_SOURCE_PATTERNS: readonly string[] = [
  'src/core/',
  'src/orchestra/',
  'src/monitor/',
  'src/agents/',
  'src/cli/',
  'src/mcp/',
  'src/providers/',
  'src/api/',
  'src/dashboard/',
  '.deckent/agents/',
  '.deckent/skills/',
] as const;

// ─── Detection Cache ────────────────────────────────────────────────

/**
 * Per-projectRoot cache for `detectDeckentRepo` results.
 * Avoids repeated `readFileSync` + `JSON.parse` for the same project root.
 */
const repoDetectionCache = new Map<string, boolean>();

/**
 * Clear the detection cache. Useful for testing.
 */
export function clearDetectionCache(): void {
  repoDetectionCache.clear();
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Detect whether the given project root is the Deckent repository itself.
 *
 * Two conditions must BOTH be true:
 * 1. `.deckent/` directory exists (necessary but not sufficient — user projects also have this)
 * 2. `package.json` has `"name": "deckent"` (the definitive discriminator)
 *
 * Results are cached per projectRoot for the lifetime of the process.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns true if this IS the Deckent repo (dogfood mode)
 */
export function detectDeckentRepo(projectRoot: string): boolean {
  const cached = repoDetectionCache.get(projectRoot);
  if (cached !== undefined) return cached;

  let result = false;
  try {
    const deckentDir = join(projectRoot, '.deckent');
    if (existsSync(deckentDir)) {
      const pkgPath = join(projectRoot, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string };
        result = pkg.name === 'deckent';
      }
    }
  } catch {
    // Any I/O or parse error → not Deckent repo (fail-safe: no false positives)
    result = false;
  }

  repoDetectionCache.set(projectRoot, result);
  return result;
}

/**
 * Check if a single path (directory or file) matches any Deckent source pattern.
 *
 * A path matches if it starts with any of the DECKENT_SOURCE_PATTERNS prefixes,
 * OR if any pattern is a prefix of the path. This handles both:
 * - `scope.directories: ['src/core/']` → exact pattern match
 * - `scope.filesWrite: ['src/core/types.ts']` → file within pattern directory
 *
 * @param path - The scope path to check (relative to project root)
 * @returns true if the path touches Deckent source code
 */
function matchesDeckentSource(path: string): boolean {
  const normalized = path.trim();
  if (!normalized) return false;
  return DECKENT_SOURCE_PATTERNS.some(
    pattern => normalized.startsWith(pattern) || pattern.startsWith(normalized),
  );
}

/**
 * Determine if a single task modifies Deckent's own source code.
 *
 * Returns true only when BOTH conditions hold:
 * 1. The project IS the Deckent repo (`detectDeckentRepo`)
 * 2. The task's write scope touches at least one Deckent source pattern
 *
 * For user projects, this always returns false (zero overhead beyond
 * the cached `detectDeckentRepo` check).
 *
 * @param task - Task (or any object with a `scope` field)
 * @param projectRoot - Absolute path to the project root
 * @returns true if the task is self-modifying
 */
export function isSelfModifying(
  task: SelfModifyCheckable,
  projectRoot: string,
): boolean {
  if (!detectDeckentRepo(projectRoot)) return false;

  const writePaths = [
    ...(task.scope.directories ?? []),
    ...(task.scope.filesWrite ?? []),
  ];

  return writePaths.some(matchesDeckentSource);
}

/**
 * Determine if ANY task in the sprint modifies Deckent's own source code.
 *
 * A sprint is self-modifying if at least one task is self-modifying.
 * This is the sprint-level check used by `sprint-spawner.ts` to decide
 * whether to enforce sequential execution and Wave 0 gate.
 *
 * @param tasks - Array of tasks (or objects with scope fields)
 * @param projectRoot - Absolute path to the project root
 * @returns true if the sprint is self-modifying
 */
export function isSelfModifyingSprint(
  tasks: ReadonlyArray<SelfModifyCheckable>,
  projectRoot: string,
): boolean {
  // Early exit: if not the Deckent repo, no tasks can be self-modifying
  if (!detectDeckentRepo(projectRoot)) return false;

  return tasks.some(task => isSelfModifying(task, projectRoot));
}
