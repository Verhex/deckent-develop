// ═══ BORN-486: Cross-sprint stale-hb sweep ═════════════════════════════════
// Sprint 365's cleanup() ran with cleanupPhase='spawn-fail' and (by design,
// Sprint 156/157) preserved task-365-001.hb for post-mortem forensics. Nothing
// then swept it before sprint 366 started, so scanHeartbeats() (auditor.ts)
// flagged it as a "foreign task" CRITICAL hb.stale alert on every 30s scan for
// the entire lifetime of sprint 366.
//
// Verifies:
//  1. cleanupPreviousSprintOrphans() now also sweeps orphaned task-*.hb /
//     .timeout / .partial-result files attributable to the previous (dead)
//     sprint, while never touching files belonging to any other/live sprint.
//  2. cleanup()'s existing always-on (phase-agnostic) stale-file sweep now
//     also covers '.timeout' / '.partial-result' by age, like it already does
//     for '.hb'/'.json'/etc.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, rmSync, writeFileSync, existsSync, utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { cleanup, cleanupPreviousSprintOrphans } from '../../src/orchestra/sprint-lifecycle.js';
import type { Sprint } from '../../src/core/types.js';
import { SprintPhase, SprintStatus } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(tmpdir(), `cleanup-stale-hb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, '.tasks'), { recursive: true });
  return dir;
}

function makeSprint(id = 'sprint-366'): Sprint {
  return {
    id,
    number: 366,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [],
    workers: [],
  };
}

function writeSidecar(tasksDir: string, taskId: string, sprintId: string): void {
  writeFileSync(
    join(tasksDir, `task-${taskId}.json`),
    JSON.stringify({ id: taskId, sprintId }),
    'utf-8',
  );
}

function backdate(filePath: string, hoursAgo: number): void {
  const t = Date.now() / 1000 - hoursAgo * 3600;
  utimesSync(filePath, t, t);
}

// ═══ cleanupPreviousSprintOrphans — orphan hb/timeout/partial-result sweep ═══

describe('cleanupPreviousSprintOrphans — stale-hb sweep (BORN-486)', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempRoot();
    tasksDir = join(root, '.tasks');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('sweeps a foreign task-*.hb whose sidecar json belongs to the previous (dead) sprint', () => {
    writeSidecar(tasksDir, '365-001', 'sprint-365');
    writeFileSync(join(tasksDir, 'task-365-001.hb'), '{"taskId":"365-001","status":"EXECUTING"}', 'utf-8');

    cleanupPreviousSprintOrphans(root, 'sprint-365');

    expect(existsSync(join(tasksDir, 'task-365-001.hb'))).toBe(false);
  });

  it('preserves a task-*.hb belonging to a different (live) sprint', () => {
    writeSidecar(tasksDir, '366-001', 'sprint-366');
    writeFileSync(join(tasksDir, 'task-366-001.hb'), '{"taskId":"366-001","status":"EXECUTING"}', 'utf-8');

    // Sprint 366 is starting up and sweeping orphans from the PREVIOUS sprint (365) —
    // its own (366) live heartbeat must survive untouched.
    cleanupPreviousSprintOrphans(root, 'sprint-365');

    expect(existsSync(join(tasksDir, 'task-366-001.hb'))).toBe(true);
  });

  it('sweeps an orphan task-*.hb with no sidecar json at all', () => {
    // Sidecar already cleaned up separately, leaving only the heartbeat behind.
    writeFileSync(join(tasksDir, 'task-365-002.hb'), '{"taskId":"365-002","status":"EXECUTING"}', 'utf-8');

    cleanupPreviousSprintOrphans(root, 'sprint-365');

    expect(existsSync(join(tasksDir, 'task-365-002.hb'))).toBe(false);
  });

  it('sweeps .timeout and .partial-result markers attributable to the previous sprint', () => {
    writeSidecar(tasksDir, '365-003', 'sprint-365');
    writeFileSync(join(tasksDir, 'task-365-003.timeout', ), 'exitCode 124', 'utf-8');
    writeFileSync(join(tasksDir, 'task-365-003.partial-result'), '{"taskId":"365-003","selfAssessment":"NO_GO"}', 'utf-8');

    cleanupPreviousSprintOrphans(root, 'sprint-365');

    expect(existsSync(join(tasksDir, 'task-365-003.timeout'))).toBe(false);
    expect(existsSync(join(tasksDir, 'task-365-003.partial-result'))).toBe(false);
  });

  it('preserves .timeout/.partial-result belonging to the live sprint', () => {
    writeSidecar(tasksDir, '366-002', 'sprint-366');
    writeFileSync(join(tasksDir, 'task-366-002.timeout'), 'exitCode 124', 'utf-8');
    writeFileSync(join(tasksDir, 'task-366-002.partial-result'), '{"taskId":"366-002"}', 'utf-8');

    cleanupPreviousSprintOrphans(root, 'sprint-365');

    expect(existsSync(join(tasksDir, 'task-366-002.timeout'))).toBe(true);
    expect(existsSync(join(tasksDir, 'task-366-002.partial-result'))).toBe(true);
  });

  it('does not touch the sidecar task-*.json of a swept orphan (out of this sweep\'s scope)', () => {
    writeSidecar(tasksDir, '365-004', 'sprint-365');
    writeFileSync(join(tasksDir, 'task-365-004.hb'), '{"taskId":"365-004"}', 'utf-8');

    cleanupPreviousSprintOrphans(root, 'sprint-365');

    expect(existsSync(join(tasksDir, 'task-365-004.hb'))).toBe(false);
    expect(existsSync(join(tasksDir, 'task-365-004.json'))).toBe(true);
  });

  it('is idempotent and safe when .tasks/ is empty', () => {
    expect(() => cleanupPreviousSprintOrphans(root, 'sprint-365')).not.toThrow();
  });

  it('is idempotent and safe when .tasks/ does not exist at all', () => {
    rmSync(tasksDir, { recursive: true, force: true });
    expect(() => cleanupPreviousSprintOrphans(root, 'sprint-365')).not.toThrow();
  });
});

// ═══ cleanup() — .timeout/.partial-result now covered by the always-on stale sweep ═══

describe('cleanup() — .timeout/.partial-result stale sweep (BORN-486)', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = makeTempRoot();
    tasksDir = join(root, '.tasks');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('removes a stale (>24h) .timeout marker regardless of cleanupPhase', () => {
    const p = join(tasksDir, 'task-365-005.timeout');
    writeFileSync(p, 'exitCode 124', 'utf-8');
    backdate(p, 25);

    // 'spawn-fail' proves this is the always-on sweep, not the phase-gated one.
    cleanup(root, makeSprint(), undefined, 'spawn-fail');

    expect(existsSync(p)).toBe(false);
  });

  it('removes a stale (>24h) .partial-result marker regardless of cleanupPhase', () => {
    const p = join(tasksDir, 'task-365-006.partial-result');
    writeFileSync(p, '{"taskId":"365-006"}', 'utf-8');
    backdate(p, 25);

    cleanup(root, makeSprint(), undefined, 'spawn-fail');

    expect(existsSync(p)).toBe(false);
  });

  it('preserves a fresh (non-stale) .timeout/.partial-result marker', () => {
    const timeoutPath = join(tasksDir, 'task-366-003.timeout');
    const partialPath = join(tasksDir, 'task-366-003.partial-result');
    writeFileSync(timeoutPath, 'exitCode 124', 'utf-8');
    writeFileSync(partialPath, '{"taskId":"366-003"}', 'utf-8');

    cleanup(root, makeSprint(), undefined, 'spawn-fail');

    expect(existsSync(timeoutPath)).toBe(true);
    expect(existsSync(partialPath)).toBe(true);
  });
});
