import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupPreviousSprintOrphans } from '../../src/orchestra/sprint-lifecycle.js';

const TEST_ROOT = '/tmp/test-sprint-startup-orphan';

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
    expect(
      existsSync(
        join(TEST_ROOT, '.tasks', 'archive', 'sprint-167', '.prompt-167-005-hash.txt'),
      ),
    ).toBe(true);
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

    expect(
      existsSync(join(TEST_ROOT, '.tasks', 'archive', 'sprint-167', '.prompt-167-001-a.txt')),
    ).toBe(true);
    expect(
      existsSync(join(TEST_ROOT, '.tasks', 'archive', 'sprint-167', '.prompt-167-002-b.txt')),
    ).toBe(true);
  });
});
