/**
 * tests/orchestra/archive-directives-default-preserve.test.ts
 *
 * Sprint 168 C0a-4 (BUG-CC fix) — archiveDirectives default preserve invariant.
 *
 * Alperen Pre-Flight Step 16 Option B decision:
 *   - auto_archive_directives default=false → DIRECTIVES.md KORUNUR
 *   - Archive copy always written to the canonical sprint docs namespace
 *   - Opt-in legacy behavior via { autoArchive: true } overwrites with placeholder
 *
 * Rationale: Sprint 167 BUG-CC live evidence — DIRECTIVES.md placeholder
 * overwrite mid-sprint = catastrophic sprint context loss. Conservative
 * default (preserve) is safer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { archiveDirectives } from '../../src/orchestra/sprint-docs-updater.js';
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_ROOT = join(tmpdir(), 'deckent-test-archive-directives-default-preserve');

describe('archiveDirectives — default preserve (Sprint 168 C0a-4 BUG-CC)', () => {
  beforeEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
    mkdirSync(join(TEST_ROOT, '.deckent', 'archive', 'sprints'), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true });
  });

  it('preserves DIRECTIVES.md by default (auto_archive_directives=false)', () => {
    const originalContent =
      '# DIRECTIVES — Sprint 168\n\n## Task 1: Example task\n\nDescription here.\n';
    writeFileSync(join(TEST_ROOT, 'DIRECTIVES.md'), originalContent);

    // Default behavior — no options passed (Option B: preserve)
    archiveDirectives(TEST_ROOT, 'sprint-168', 'CLEANUP');

    // INVARIANT: DIRECTIVES.md MUST be preserved with original content
    expect(existsSync(join(TEST_ROOT, 'DIRECTIVES.md'))).toBe(true);
    const preservedContent = readFileSync(join(TEST_ROOT, 'DIRECTIVES.md'), 'utf-8');
    expect(preservedContent).toBe(originalContent);

    // Archive copy MUST be written
    const archivePath = join(TEST_ROOT, '.deckent', 'archive', 'sprints', 'sprint-168', 'docs', 'DIRECTIVES.md');
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf-8')).toBe(originalContent);
  });

  it('overwrites DIRECTIVES.md when autoArchive=true (opt-in legacy)', () => {
    const originalContent = '# DIRECTIVES — Sprint 168\n\n## Task 1: Example\n';
    writeFileSync(join(TEST_ROOT, 'DIRECTIVES.md'), originalContent);

    // Opt-in legacy behavior
    archiveDirectives(TEST_ROOT, 'sprint-168', 'CLEANUP', { autoArchive: true });

    // Archive copy still written
    const archivePath = join(TEST_ROOT, '.deckent', 'archive', 'sprints', 'sprint-168', 'docs', 'DIRECTIVES.md');
    expect(existsSync(archivePath)).toBe(true);
    expect(readFileSync(archivePath, 'utf-8')).toBe(originalContent);

    // DIRECTIVES.md OVERWRITTEN with placeholder
    expect(existsSync(join(TEST_ROOT, 'DIRECTIVES.md'))).toBe(true);
    const newContent = readFileSync(join(TEST_ROOT, 'DIRECTIVES.md'), 'utf-8');
    expect(newContent).not.toBe(originalContent);
    expect(newContent).not.toContain('## Task 1: Example');
    // Placeholder should reference next sprint
    expect(newContent).toContain('Sprint 169');
  });

  it('skips silently when DIRECTIVES.md does not exist', () => {
    // No DIRECTIVES.md present
    archiveDirectives(TEST_ROOT, 'sprint-168', 'CLEANUP');

    // No archive written, no error
    expect(existsSync(join(TEST_ROOT, 'DIRECTIVES.md'))).toBe(false);
    expect(
      existsSync(join(TEST_ROOT, '.deckent', 'archive', 'sprints', 'sprint-168', 'docs', 'DIRECTIVES.md')),
    ).toBe(false);
  });

  it('phase guard still rejects non-CLEANUP/COMPLETE phases (default preserve)', () => {
    const originalContent = '# DIRECTIVES — Sprint 168\n';
    writeFileSync(join(TEST_ROOT, 'DIRECTIVES.md'), originalContent);

    // Phase guard: EVALUATE phase should reject
    archiveDirectives(TEST_ROOT, 'sprint-168', 'EVALUATE');

    // DIRECTIVES.md unchanged
    expect(readFileSync(join(TEST_ROOT, 'DIRECTIVES.md'), 'utf-8')).toBe(originalContent);
    // No archive copy created
    expect(
      existsSync(join(TEST_ROOT, '.deckent', 'archive', 'sprints', 'sprint-168', 'docs', 'DIRECTIVES.md')),
    ).toBe(false);
  });
});
