/**
 * ADR-037 B1 — checkWorkerAuthority enforce_rbac hard-deny (src/agents/worker.ts)
 *
 * Sprint 343 Task 002 (DECKENT-TRIAGE B1 / DESIGN-ENFORCEMENT-VEIN): the worker-side
 * self-check `checkWorkerAuthority` must honor an `enforceRbac` option WITHOUT changing
 * the ADR-037 V1.0 soft default (flag-off = unconditional allow):
 *   - { enforceRbac: true }  + write OUTSIDE scope.filesWrite → false (hard deny)
 *   - { enforceRbac: true }  + in-scope write (filesWrite or directories) → true (allow)
 *   - { enforceRbac: false } / omitted + out-of-scope write → true (byte-for-byte the
 *     ADR-037 V1.0 soft default — product default stays advisory/allow)
 *
 * Hermetic by construction: no `sprintId` is passed, so `checkWorkerAuthority` performs
 * ZERO file I/O (the `emitAuthorityViolation` event write is guarded by `if (sprintId)`),
 * and the underlying `checkAuthority` is pure string matching. No tmpdir / config / DB.
 * `console.warn` (the `[ADR-037 soft]` violation log) is silenced to keep output clean.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkWorkerAuthority } from '../../src/agents/worker.js';
import type { TaskScope } from '../../src/core/types.js';

const SCOPE: TaskScope = {
  directories: ['src/agents/'],
  filesRead: [],
  filesWrite: ['src/agents/worker.ts'],
};

// projectRoot is only consulted when a sprintId triggers event emission; we never
// pass a sprintId, so this is never touched — a non-existent path proves hermeticity.
const PROJECT_ROOT = '/nonexistent/deckent-rbac-test-root';
const TASK_ID = '343-002';
const OUT_OF_SCOPE = 'src/cli/entry.ts';      // outside both directories AND filesWrite
const IN_FILES_WRITE = 'src/agents/worker.ts'; // exact filesWrite entry
const IN_DIRECTORY = 'src/agents/new-helper.ts'; // within scope.directories 'src/agents/'

describe('ADR-037 B1 — checkWorkerAuthority enforce_rbac hard-deny', () => {
  beforeEach(() => {
    // Silence the `[deckent] [ADR-037 soft]` warning emitted on every violation branch.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforceRbac:true + write OUTSIDE filesWrite → false (hard deny)', () => {
    const allowed = checkWorkerAuthority(
      OUT_OF_SCOPE,
      SCOPE,
      PROJECT_ROOT,
      TASK_ID,
      undefined, // no sprintId → hermetic (no event I/O)
      false,
      { enforceRbac: true },
    );
    expect(allowed).toBe(false);
  });

  it('enforceRbac:true + in-scope write (filesWrite) → true (allow)', () => {
    const allowed = checkWorkerAuthority(
      IN_FILES_WRITE,
      SCOPE,
      PROJECT_ROOT,
      TASK_ID,
      undefined,
      false,
      { enforceRbac: true },
    );
    expect(allowed).toBe(true);
  });

  it('enforceRbac:true + in-scope write (within scope.directories) → true (allow)', () => {
    const allowed = checkWorkerAuthority(
      IN_DIRECTORY,
      SCOPE,
      PROJECT_ROOT,
      TASK_ID,
      undefined,
      false,
      { enforceRbac: true },
    );
    expect(allowed).toBe(true);
  });

  it('enforceRbac:false + out-of-scope write → true (V1.0 soft default preserved)', () => {
    const allowed = checkWorkerAuthority(
      OUT_OF_SCOPE,
      SCOPE,
      PROJECT_ROOT,
      TASK_ID,
      undefined,
      false,
      { enforceRbac: false },
    );
    expect(allowed).toBe(true);
  });

  it('opts omitted + out-of-scope write → true (byte-for-byte today’s soft default)', () => {
    const allowed = checkWorkerAuthority(
      OUT_OF_SCOPE,
      SCOPE,
      PROJECT_ROOT,
      TASK_ID,
      // no sprintId, no isSelfModifyingSprint, no opts
    );
    expect(allowed).toBe(true);
  });
});
