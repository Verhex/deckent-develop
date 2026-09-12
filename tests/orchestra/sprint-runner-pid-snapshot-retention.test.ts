// Generation-snapshot retention on detached runner exit.
//
// `clearPid` removes the `.pid` (liveness authority) and, by default, the paired
// generation snapshot. The detached runner released BOTH from its own exit
// handler — so after any detached run ended, nothing on disk could bind that
// process generation to the terminal RunFlow event. That closed
// `readOwningRunTerminalDisposition`'s closure path for every detached run: an
// accepted result owned by such a run could never be proven terminal, could
// never be retired, and blocked every later start with
// EXACT_RECOVERY_TERMINAL_SETTLEMENT_HOLD. The `.pid` must still go — a snapshot
// alone can never authorise signalling or project a live coordinator.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { releaseOwnedSprintPidFiles } from '../../src/orchestra/sprint-runner-entry.js';

const pidsDir = (root: string) => join(root, '.deckent', 'pids');
const pidPath = (root: string, id: string) => join(pidsDir(root), `${id}.pid`);
const snapPath = (root: string, id: string) => join(pidsDir(root), `${id}.snapshot.json`);

/** A pid record owned by THIS process, so the release guard accepts it. */
function seedOwnedSprint(root: string, sprintId: string): void {
  mkdirSync(pidsDir(root), { recursive: true });
  writeFileSync(pidPath(root, sprintId), JSON.stringify({ pid: process.pid }), 'utf-8');
  writeFileSync(snapPath(root, sprintId), JSON.stringify({ sprintId, pid: process.pid }), 'utf-8');
}

describe('releaseOwnedSprintPidFiles — detached exit retains the generation snapshot', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'deckent-pid-retention-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('removes the .pid but KEEPS the snapshot as correlation evidence', () => {
    seedOwnedSprint(root, 'sprint-901');
    releaseOwnedSprintPidFiles(root);
    expect(existsSync(pidPath(root, 'sprint-901'))).toBe(false);
    expect(existsSync(snapPath(root, 'sprint-901'))).toBe(true);
  });

  it('reports the sprint it released', () => {
    seedOwnedSprint(root, 'sprint-902');
    expect(releaseOwnedSprintPidFiles(root)).toContain('sprint-902');
  });

  it('never touches a pid file owned by another process', () => {
    mkdirSync(pidsDir(root), { recursive: true });
    // A pid that is not ours: the guard must leave both files completely alone.
    writeFileSync(pidPath(root, 'sprint-903'), JSON.stringify({ pid: process.pid + 1 }), 'utf-8');
    writeFileSync(snapPath(root, 'sprint-903'), JSON.stringify({ sprintId: 'sprint-903' }), 'utf-8');
    releaseOwnedSprintPidFiles(root);
    expect(existsSync(pidPath(root, 'sprint-903'))).toBe(true);
    expect(existsSync(snapPath(root, 'sprint-903'))).toBe(true);
  });

  it('is a no-op when there are no pid files at all', () => {
    expect(() => releaseOwnedSprintPidFiles(root)).not.toThrow();
    expect(releaseOwnedSprintPidFiles(root)).toEqual([]);
  });
});
