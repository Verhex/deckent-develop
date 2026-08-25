import { describe, it, expect, beforeEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { cleanupPreviousSprintOrphans } from '../../src/orchestra/sprint-lifecycle.js';

const TEST_ROOT = '/tmp/test-sprint-startup-orphan';

function archivedContents(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? archivedContents(path)
      : [readFileSync(path, 'utf-8')];
  });
}

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(join(TEST_ROOT, '.tasks'), { recursive: true });
});

describe('cleanupPreviousSprintOrphans (Sprint 168 C0e cross-sprint cleanup)', () => {
  it('archives orphan prompt from previous sprint at startup', () => {
    // Previous sprint left orphan prompt (no .hb file = not active)
    writeFileSync(
      join(TEST_ROOT, '.tasks', '.prompt-167-005-hash.txt'),
      'old prompt',
    );

    cleanupPreviousSprintOrphans(TEST_ROOT, 'sprint-167');

    // Prompt archived (not deleted, moved to archive)
    expect(existsSync(join(TEST_ROOT, '.tasks', '.prompt-167-005-hash.txt'))).toBe(false);
    expect(archivedContents(TEST_ROOT)).toContain('old prompt');
  });

  it('is idempotent (safe to call when .tasks/ is empty)', () => {
    // No prompt files — should not throw
    expect(() =>
      cleanupPreviousSprintOrphans(TEST_ROOT, 'sprint-167'),
    ).not.toThrow();
  });

  it('archives multiple orphan prompts together', () => {
    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-167-001-a.txt'), 'p1');
    writeFileSync(join(TEST_ROOT, '.tasks', '.prompt-167-002-b.txt'), 'p2');

    cleanupPreviousSprintOrphans(TEST_ROOT, 'sprint-167');

    expect(archivedContents(TEST_ROOT)).toEqual(expect.arrayContaining(['p1', 'p2']));
  });
});
