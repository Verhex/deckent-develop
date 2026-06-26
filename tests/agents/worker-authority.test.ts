/**
 * ADR-037 Worker Authority — enforce_rbac flag-gated hard-deny tests
 *
 * Sprint 325 Task 005: Verify that checkWorkerAuthority in src/agents/worker.ts
 * honors the enforce_rbac flag:
 *   - flag-on + scope violation → returns false (hard deny)
 *   - flag-off + scope violation → returns true (soft allow, byte-identical)
 *   - flag-on + within-scope write → returns true (no violation)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkWorkerAuthority,
} from '../../src/agents/worker.js';
import type { TaskScope } from '../../src/core/types.js';

const TEST_ROOT = join(process.cwd(), '.test-worker-authority-' + process.pid);
const DECKENT_DIR = join(TEST_ROOT, '.deckent');
const TASKS_DIR = join(TEST_ROOT, '.tasks');

function setupTestEnv(sprintId: string): void {
  mkdirSync(DECKENT_DIR, { recursive: true });
  mkdirSync(TASKS_DIR, { recursive: true });
  mkdirSync(join(TEST_ROOT, 'src', 'agents'), { recursive: true });
  mkdirSync(join(TEST_ROOT, 'src', 'cli'), { recursive: true });
  writeFileSync(
    join(DECKENT_DIR, 'sprint-state.json'),
    JSON.stringify({ sprintId }),
    'utf-8',
  );
}

describe('ADR-037 enforce_rbac flag — checkWorkerAuthority (src/agents/worker.ts)', () => {
  const sprintId = 'sprint-325';

  beforeEach(() => {
    setupTestEnv(sprintId);
  });

  afterEach(() => {
    try {
      rmSync(TEST_ROOT, { recursive: true, force: true });
    } catch {
      // cleanup best-effort
    }
  });

  it('flag-on + scope violation → returns false (hard deny)', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: ['src/agents/worker.ts'],
    };

    const result = checkWorkerAuthority(
      'src/cli/entry.ts',   // outside scope — violation
      scope,
      TEST_ROOT,
      '325-005',
      sprintId,
      false,
      { enforceRbac: true },
    );

    expect(result).toBe(false);
  });

  it('flag-off + scope violation → returns true (soft allow, byte-identical)', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: ['src/agents/worker.ts'],
    };

    const result = checkWorkerAuthority(
      'src/cli/entry.ts',   // outside scope — violation
      scope,
      TEST_ROOT,
      '325-005',
      sprintId,
      false,
      { enforceRbac: false },
    );

    expect(result).toBe(true);
  });

  it('no opts (undefined) + scope violation → returns true (byte-identical default)', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: ['src/agents/worker.ts'],
    };

    const result = checkWorkerAuthority(
      'src/cli/entry.ts',   // outside scope — violation
      scope,
      TEST_ROOT,
      '325-005',
      sprintId,
    );

    expect(result).toBe(true);
  });

  it('flag-on + within-scope write → returns true (no violation)', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: ['src/agents/worker.ts'],
    };

    const result = checkWorkerAuthority(
      'src/agents/worker.ts',  // within scope — no violation
      scope,
      TEST_ROOT,
      '325-005',
      sprintId,
      false,
      { enforceRbac: true },
    );

    expect(result).toBe(true);
  });

  it('flag-on + within directories (new file) → returns true (no violation)', () => {
    const scope: TaskScope = {
      directories: ['src/agents/'],
      filesRead: [],
      filesWrite: [],
    };

    const result = checkWorkerAuthority(
      'src/agents/new-module.ts',  // within scope.directories — no violation
      scope,
      TEST_ROOT,
      '325-005',
      sprintId,
      false,
      { enforceRbac: true },
    );

    expect(result).toBe(true);
  });

  it('flag-on + self-modifying sprint + out-of-scope → returns true (self-mod bypass)', () => {
    const scope: TaskScope = {
      directories: [],
      filesRead: [],
      filesWrite: [],
    };

    const result = checkWorkerAuthority(
      'src/orchestra/brain.ts',  // outside empty scope but self-modifying
      scope,
      TEST_ROOT,
      '325-005',
      sprintId,
      true,  // isSelfModifyingSprint
      { enforceRbac: true },
    );

    // self-modifying sprint allows src/** writes — authority check passes → no denial
    expect(result).toBe(true);
  });
});
