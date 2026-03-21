// ─── Zero-Config Mode ─────────────────────────────────────────────
// Allows `deckent start "Add login page with Google OAuth"` without
// writing DIRECTIVES.md manually.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DIRECTIVES_FILE } from '../../core/constants.js';

export interface ZeroConfigResult {
  /** true if a temporary DIRECTIVES.md was created */
  createdTemp: boolean;
  /** true if DIRECTIVES.md already existed before this call */
  alreadyExisted: boolean;
  /** Path to DIRECTIVES.md */
  directivesPath: string;
}

/**
 * Build a minimal DIRECTIVES.md content from a natural-language description.
 * Produces a single-task directive that the planner can parse.
 */
export function buildZeroConfigDirectives(description: string): string {
  return [
    `# DIRECTIVES — Zero-Config Sprint`,
    ``,
    `## Task 1: ${description}`,
    ``,
    `### Description`,
    description,
    ``,
    `### Tests`,
    `- Implement the feature as described`,
    `- Add tests for the new functionality`,
    ``,
  ].join('\n');
}

/**
 * Prepare zero-config mode: write a temporary DIRECTIVES.md if none exists.
 *
 * @param projectRoot - absolute path to the project root
 * @param description - natural language description from the user
 * @returns ZeroConfigResult indicating what was done
 */
export function prepareZeroConfig(
  projectRoot: string,
  description: string,
): ZeroConfigResult {
  const directivesPath = join(projectRoot, DIRECTIVES_FILE);
  const alreadyExisted = existsSync(directivesPath);

  if (alreadyExisted) {
    return { createdTemp: false, alreadyExisted: true, directivesPath };
  }

  const content = buildZeroConfigDirectives(description);
  writeFileSync(directivesPath, content, 'utf-8');

  return { createdTemp: true, alreadyExisted: false, directivesPath };
}

/**
 * Clean up a temporary DIRECTIVES.md that was created by zero-config mode.
 * Only removes the file if `result.createdTemp` is true.
 *
 * @param result - the ZeroConfigResult from prepareZeroConfig
 */
export function cleanupZeroConfig(result: ZeroConfigResult): void {
  if (!result.createdTemp) return;

  if (existsSync(result.directivesPath)) {
    unlinkSync(result.directivesPath);
  }
}

/**
 * Read the existing DIRECTIVES.md content (for restoration after sprint).
 * Returns null if the file does not exist.
 */
export function readDirectivesContent(projectRoot: string): string | null {
  const directivesPath = join(projectRoot, DIRECTIVES_FILE);
  if (!existsSync(directivesPath)) return null;
  return readFileSync(directivesPath, 'utf-8');
}
