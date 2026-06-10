// ═══ RESUME-RACE regression tests (Sprint 268 — Task 268-001) ═══════════
// Live bug (sprint-267, 2026-06-10): `deckent resume` entered runSprint
// without resetting the crashed run's stale `.tasks/task-XXX.hb` and
// `.tasks/task-XXX.partial-result` files. The collector then read the stale
// heartbeat, classified the fresh respawn as crashed (honest-gate
// `worker-crashed-no-result`), and the sprint raced to RETRO/CLEANUP with
// synthetic NO_GOs before the respawned workers had a chance.
//
// These tests exercise the real `registerResume` action against a hermetic
// tmpdir fixture (real fs) with only the spawn/config/output seams mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
  utimesSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Mocks (spawn/config/output seams only — fs stays real) ──────────

vi.mock('../../src/orchestra/brain.js', () => ({
  runSprint: vi.fn().mockResolvedValue(undefined),
}));

// resume.ts dynamically imports tmux.js to kill stale workers — never
// touch real tmux sessions from a test.
vi.mock('../../src/orchestra/tmux.js', () => ({
  killWorker: vi.fn(),
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({ language: 'en' }),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

// ─── Static Imports (after mocks) ─────────────────────────────────────

import { registerResume } from '../../src/cli/commands/resume.js';
import { runSprint } from '../../src/orchestra/brain.js';
import {
  readHeartbeat,
  isStaleHeartbeat,
  STALE_HEARTBEAT_THRESHOLD_MS,
} from '../../src/orchestra/sprint-checkpoint.js';
import type { Heartbeat } from '../../src/core/types.js';

// ─── Fixture Helpers ──────────────────────────────────────────────────

const SPRINT_ID = 'sprint-267';
/** Stale age: 10 min — comfortably past the 5 min collector threshold. */
const STALE_AGE_MS = 10 * 60_000;

let root: string;

interface FixtureOpts {
  completedTasks?: string[];
  pendingTasks?: string[];
  activeWorkerTaskIds?: string[];
}

function writeCheckpointFixture(opts: FixtureOpts): void {
  const oldIso = new Date(Date.now() - 60 * 60_000).toISOString();
  const checkpoint = {
    sprintId: SPRINT_ID,
    checkpointNumber: 3,
    timestamp: oldIso,
    completedTasks: opts.completedTasks ?? [],
    pendingTasks: opts.pendingTasks ?? [],
    activeWorkers: (opts.activeWorkerTaskIds ?? []).map(taskId => ({
      workerId: `w-${taskId}`,
      taskId,
      status: 'EXECUTING',
      spawnedAt: oldIso,
    })),
    brainPhase: 'EXECUTE',
    eventStreamOffset: 0,
  };
  writeFileSync(
    join(root, '.deckent', `${SPRINT_ID}-checkpoint.json`),
    JSON.stringify(checkpoint, null, 2),
    'utf-8',
  );
}

/** Write a stale heartbeat: both the JSON timestamp AND the file mtime are
 *  backdated, matching what a crashed run actually leaves on disk
 *  (sprint-checkpoint reads the timestamp field; worker-liveness reads mtime). */
function writeStaleHb(taskId: string): string {
  const hbPath = join(root, '.tasks', `task-${taskId}.hb`);
  const staleDate = new Date(Date.now() - STALE_AGE_MS);
  writeFileSync(
    hbPath,
    JSON.stringify({
      workerId: `w-${taskId}`,
      taskId,
      status: 'EXECUTING',
      sequence: 7,
      timestamp: staleDate.toISOString(),
    }),
    'utf-8',
  );
  utimesSync(hbPath, staleDate, staleDate);
  return hbPath;
}

/** Write a stale partial-result crash marker (docker backend startup shape). */
function writeStalePartial(taskId: string): string {
  const partialPath = join(root, '.tasks', `task-${taskId}.partial-result`);
  const staleDate = new Date(Date.now() - STALE_AGE_MS);
  writeFileSync(
    partialPath,
    JSON.stringify({
      taskId,
      selfAssessment: 'NO_GO',
      notes: 'Worker started but did not complete — partial-result written at startup.',
      partialMarker: true,
    }),
    'utf-8',
  );
  utimesSync(partialPath, staleDate, staleDate);
  return partialPath;
}

function writeResult(taskId: string): string {
  const resultPath = join(root, '.tasks', `task-${taskId}.result`);
  writeFileSync(
    resultPath,
    JSON.stringify({
      taskId,
      filesChanged: ['src/x.ts'],
      testsPassed: true,
      selfAssessment: 'DONE',
      notes: 'completed before crash',
    }),
    'utf-8',
  );
  return resultPath;
}

async function runResume(extraArgs: string[] = []): Promise<void> {
  const program = new Command();
  registerResume(program);
  await program.parseAsync(['node', 'deckent', 'resume', SPRINT_ID, '--root', root, ...extraArgs]);
}

// ─── Lifecycle ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'deckent-resume-race-'));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('resume — RESUME-RACE stale worker-artifact reset', () => {
  it('deletes stale .hb and .partial-result for respawn-eligible tasks before spawning', async () => {
    writeCheckpointFixture({ pendingTasks: ['267-003'], activeWorkerTaskIds: ['267-002'] });
    const hbPath = writeStaleHb('267-002');
    const partialPath = writeStalePartial('267-002');

    await runResume();

    expect(existsSync(hbPath)).toBe(false);
    expect(existsSync(partialPath)).toBe(false);
    expect(runSprint).toHaveBeenCalledOnce();
  });

  it('leaves artifacts of tasks that completed during the crash (.result on disk) untouched', async () => {
    // 267-004 finished right before the crash (has .result); 267-002 did not.
    writeCheckpointFixture({ activeWorkerTaskIds: ['267-002', '267-004'] });
    const staleHb = writeStaleHb('267-002');
    const completedHb = writeStaleHb('267-004');
    const completedPartial = writeStalePartial('267-004');
    const completedResult = writeResult('267-004');
    const completedHbContent = readFileSync(completedHb, 'utf-8');

    await runResume();

    // Respawn-eligible task: artifacts reset.
    expect(existsSync(staleHb)).toBe(false);
    // Completed task: every artifact byte-identical and still present.
    expect(existsSync(completedHb)).toBe(true);
    expect(existsSync(completedPartial)).toBe(true);
    expect(existsSync(completedResult)).toBe(true);
    expect(readFileSync(completedHb, 'utf-8')).toBe(completedHbContent);
  });

  it('dry-run performs zero writes and never spawns', async () => {
    writeCheckpointFixture({ pendingTasks: ['267-003'], activeWorkerTaskIds: ['267-002'] });
    const hbPath = writeStaleHb('267-002');
    const partialPath = writeStalePartial('267-002');
    const hbBefore = readFileSync(hbPath, 'utf-8');
    const partialBefore = readFileSync(partialPath, 'utf-8');

    await runResume(['--dry-run']);

    expect(existsSync(hbPath)).toBe(true);
    expect(existsSync(partialPath)).toBe(true);
    expect(readFileSync(hbPath, 'utf-8')).toBe(hbBefore);
    expect(readFileSync(partialPath, 'utf-8')).toBe(partialBefore);
    expect(runSprint).not.toHaveBeenCalled();
  });

  it('resets artifacts BEFORE runSprint is invoked (ordering)', async () => {
    writeCheckpointFixture({ activeWorkerTaskIds: ['267-002'] });
    const hbPath = writeStaleHb('267-002');
    const partialPath = writeStalePartial('267-002');

    let hbExistsAtSpawn: boolean | null = null;
    let partialExistsAtSpawn: boolean | null = null;
    vi.mocked(runSprint).mockImplementationOnce((async () => {
      hbExistsAtSpawn = existsSync(hbPath);
      partialExistsAtSpawn = existsSync(partialPath);
      return undefined;
    }) as unknown as typeof runSprint);

    await runResume();

    expect(runSprint).toHaveBeenCalledOnce();
    expect(hbExistsAtSpawn).toBe(false);
    expect(partialExistsAtSpawn).toBe(false);
  });

  it('delete strategy is consistent with the collector stale threshold', async () => {
    writeCheckpointFixture({ activeWorkerTaskIds: ['267-002'] });
    writeStaleHb('267-002');
    writeStalePartial('267-002');

    // Bug premise: the leftover heartbeat IS stale per the collector's own
    // threshold — left in place, the new run would classify the respawn as
    // crashed before the fresh worker writes its first heartbeat.
    const staleHbBefore = readHeartbeat(root, '267-002');
    expect(staleHbBefore).not.toBeNull();
    expect(isStaleHeartbeat(staleHbBefore, STALE_HEARTBEAT_THRESHOLD_MS)).toBe(true);

    await runResume();

    // After the fix: no heartbeat remains to be misread (deleted, not
    // timestamp-reset — a reset file would fake liveness for a worker that
    // does not exist yet).
    expect(readHeartbeat(root, '267-002')).toBeNull();
    expect(existsSync(join(root, '.tasks', 'task-267-002.partial-result'))).toBe(false);

    // And the heartbeat the respawned worker writes at startup passes the
    // same collector threshold — delete-then-rewrite yields a fresh signal.
    const freshHb: Heartbeat = {
      workerId: 'w-267-002',
      taskId: '267-002',
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
    } as unknown as Heartbeat;
    expect(isStaleHeartbeat(freshHb, STALE_HEARTBEAT_THRESHOLD_MS)).toBe(false);
  });

  it('pending task without artifacts does not crash resume and still spawns', async () => {
    writeCheckpointFixture({ pendingTasks: ['267-010'] });

    await expect(runResume()).resolves.toBeUndefined();

    expect(runSprint).toHaveBeenCalledOnce();
    // Nothing was created for the pending task either.
    expect(existsSync(join(root, '.tasks', 'task-267-010.hb'))).toBe(false);
    expect(existsSync(join(root, '.tasks', 'task-267-010.partial-result'))).toBe(false);
  });
});
