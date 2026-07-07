/**
 * tests/orchestra/directives-restore-quirk.test.ts
 *
 * Root-cause repro for the sprint-378 live incident: DIRECTIVES.md was observed reverted
 * to a PREVIOUS sprint's content at sprint-closing time (mtime = closing moment).
 *
 * Disk evidence (see task-379-003.plan for the full trace):
 * - `.brain/archive/DIRECTIVES-sprint-378.md` contains sprint-377's text, not sprint-378's own.
 * - `.brain/archive/sprint-378-tasks/task-378-002.result` shows worker-378-002 ran a raw
 *   `git stash` on the shared tree mid-task (the "born-499" incident) — now forbidden by
 *   worker-default.md.
 *
 * These tests reproduce the mechanism end-to-end with REAL git + REAL fs in a tmpdir (no
 * mocks), exercising the actual shipped `DirectivesMidSprintProtection` detector and the
 * actual shipped `archiveDirectives()` — proving:
 *   1. A raw `git stash` on a dirty tree reverts an uncommitted DIRECTIVES.md to HEAD's
 *      last-committed (previous sprint's) content — the exact observed symptom.
 *   2. The detector's template/small-size heuristic does NOT catch this class of corruption,
 *      because the reverted file is a full, realistic, well-formed DIRECTIVES.md — just the
 *      WRONG one (red — this is the actual fixable gap; see docImpact in the .result notes).
 *   3. `archiveDirectives()` has no cross-check against the sprint's true issued content, so it
 *      faithfully (and silently) archives whatever is on disk — propagating the corruption into
 *      the permanent archive record.
 *   4. `archiveDirectives()` is NOT independently buggy: given the correctly-restored content
 *      (stash popped), it archives the correct content — isolating the raw `git stash` as the
 *      sole injection point.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { DirectivesMidSprintProtection } from '../../src/nervous/detectors/directives-protection.js';
import type { DetectorContext, ObserverEvent, SprintStateSnapshot } from '../../src/core/nervous-types.js';
import { archiveDirectives } from '../../src/orchestra/sprint-docs-updater.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'directives-restore-quirk-'));
  execSync(
    'git init -q && git config user.email "test@test.com" && git config user.name "Test"',
    { cwd: dir, stdio: 'pipe' },
  );
  return dir;
}

function commitDirectives(root: string, content: string, message: string): void {
  writeFileSync(join(root, 'DIRECTIVES.md'), content, 'utf-8');
  execSync('git add DIRECTIVES.md && git commit -q -m "' + message + '"', { cwd: root, stdio: 'pipe' });
}

function readDirectives(root: string): string {
  return readFileSync(join(root, 'DIRECTIVES.md'), 'utf-8');
}

function buildCtx(root: string, phase: SprintStateSnapshot['currentPhase']): DetectorContext {
  const event: ObserverEvent = {
    id: 'evt-repro-001',
    source: 'filesystem',
    type: 'FILE_CHANGE',
    timestamp: '2026-07-06T17:51:00.000Z',
    payload: { path: 'DIRECTIVES.md', eventType: 'change' },
  };
  const sprintState: SprintStateSnapshot = {
    sprintId: 'sprint-378',
    currentPhase: phase,
    activeWorkers: [],
    openDebtCount: 0,
    totalTasks: 3,
    completedTasks: 1,
  };
  return { event, sprintState, projectRoot: root, now: new Date('2026-07-06T17:51:30.000Z') };
}

// Realistic, well-formed DIRECTIVES content — both well above the detector's 2000-byte
// TEMPLATE_SIZE_THRESHOLD and free of its SUSPICIOUS_PATTERNS, so neither guard fires on
// shape/size alone. This is deliberate: the corruption under test is "reverted to a
// DIFFERENT real sprint's directives", not "reverted to a placeholder/template".
const SPRINT_377_CONTENT = `# DIRECTIVES — PUBLISH-P1P2: MISSION-VERDICT DURUSTLUGU + DASHBOARD HIZLI-KAZANC (3 task)

## Goal
Publish-convergence ilk-dalga: mission-verdict eslemesi durustlesir (DEBT!=fail), dashboard
etkilesim-hissini bozan iki yapisal sorun (eager-bundle + polling-firtinasi) kapanir.
${'x'.repeat(2200)}

## Task 1: MISSION-VERDICT-FIX
- Model: sonnet
- Effort: high
### Description
Canli-bug (mission-w1): madde-2 worker'i durust GO_WITH_TECH_DEBT dondurdu ama mission "failed"
gorundu.
### goNogo
- goCriteria: DONE/DEBT/NO_GO uc-yol esleme-testli.
- nogo: mission-store sema-kirilmasi.
`;

const SPRINT_378_CONTENT = `# DIRECTIVES — RUN-RENAME: dilim-1 CANLI + born-499 kurtarma (3 task)

## Goal
"deckent run" ust-komut ailesine birebir delegasyon + gorunur-metinlerde koprui-dili +
worker git-stash faciasindan kurtarma-onlemleri.
${'y'.repeat(2200)}

## Task 1: RUN-DELEGATE
- Model: sonnet
- Effort: high
### Description
deckent run start|status|retro|history -> ust-komutlara birebir-delegasyon.
### goNogo
- goCriteria: run --help alias'lari + mode show Bridge-satiri canli-smoke.
- nogo: passThroughOptions global-parse regresyonu.
`;

describe('DIRECTIVES-RESTORE-QUIRK — sprint-378 root-cause repro', () => {
  it('root cause: a raw `git stash` on a dirty tree reverts an uncommitted DIRECTIVES.md to the PREVIOUS committed sprint content', () => {
    const root = makeTempRepo();
    try {
      // HEAD = sprint-377's committed directives (matches git history: c8e839aa)
      commitDirectives(root, SPRINT_377_CONTENT, 'sprint-377 close');

      // sprint-378 starts: deckent_set_directives writes NEW directives, uncommitted
      writeFileSync(join(root, 'DIRECTIVES.md'), SPRINT_378_CONTENT, 'utf-8');
      expect(readDirectives(root)).toBe(SPRINT_378_CONTENT);

      // worker-378-002's raw `git stash` (born-499) — FORBIDDEN by worker-default.md today,
      // but nothing in the shipped detector prevented or caught it at the time.
      execSync('git stash push -q -m "worker-378-002 pre-check"', { cwd: root, stdio: 'pipe' });

      // Exactly the observed symptom: DIRECTIVES.md silently reverted to the PREVIOUS sprint.
      expect(readDirectives(root)).toBe(SPRINT_377_CONTENT);
      expect(readDirectives(root)).not.toBe(SPRINT_378_CONTENT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('gap: DirectivesMidSprintProtection does not flag revert-to-a-different-real-sprint (only template/small-size corruption)', () => {
    const root = makeTempRepo();
    try {
      commitDirectives(root, SPRINT_377_CONTENT, 'sprint-377 close');
      writeFileSync(join(root, 'DIRECTIVES.md'), SPRINT_378_CONTENT, 'utf-8');
      execSync('git stash push -q -m "worker-378-002 pre-check"', { cwd: root, stdio: 'pipe' });
      expect(readDirectives(root)).toBe(SPRINT_377_CONTENT); // reverted, as above

      const detector = new DirectivesMidSprintProtection();
      const result = detector.detect(buildCtx(root, 'EXECUTE'));

      // Red: the detector is blind to this corruption class. SPRINT_377_CONTENT is a full,
      // well-formed, >2KB, non-template DIRECTIVES.md — it passes the detector's
      // TEMPLATE_SIZE_THRESHOLD / SUSPICIOUS_PATTERNS checks even though it is NOT what
      // sprint-378 actually issued. This is the fixable gap (see docImpact in .result notes):
      // the detector has no way to compare against the content the CURRENT sprint issued.
      expect(result).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('silent propagation: archiveDirectives faithfully (and silently) archives the reverted stale content under the sprint-378 label', () => {
    const root = makeTempRepo();
    try {
      commitDirectives(root, SPRINT_377_CONTENT, 'sprint-377 close');
      writeFileSync(join(root, 'DIRECTIVES.md'), SPRINT_378_CONTENT, 'utf-8');
      execSync('git stash push -q -m "worker-378-002 pre-check"', { cwd: root, stdio: 'pipe' });
      // Stash is never popped — matches the sprint-378 incident (no restore evidence in the log).
      expect(readDirectives(root)).toBe(SPRINT_377_CONTENT);

      archiveDirectives(root, 'sprint-378', 'CLEANUP');

      const archivePath = join(root, '.brain', 'archive', 'DIRECTIVES-sprint-378.md');
      expect(existsSync(archivePath)).toBe(true);
      const archived = readFileSync(archivePath, 'utf-8');

      // Reproduces the exact observed incident: an archive record LABELED sprint-378
      // containing sprint-377's content, with no error/alert raised anywhere.
      expect(archived).toBe(SPRINT_377_CONTENT);
      expect(archived).not.toBe(SPRINT_378_CONTENT);
      // The working copy is left at the (wrong) preserved content too — no auto-recovery.
      expect(readDirectives(root)).toBe(SPRINT_377_CONTENT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('control: archiveDirectives is NOT independently buggy — given the correctly-restored content it archives the correct content', () => {
    const root = makeTempRepo();
    try {
      commitDirectives(root, SPRINT_377_CONTENT, 'sprint-377 close');
      writeFileSync(join(root, 'DIRECTIVES.md'), SPRINT_378_CONTENT, 'utf-8');
      execSync('git stash push -q -m "worker-378-002 pre-check"', { cwd: root, stdio: 'pipe' });
      expect(readDirectives(root)).toBe(SPRINT_377_CONTENT);

      // Correct worker behavior would have popped the stash back — isolating the raw
      // `git stash` (unpaired push) as the sole injection point, not archiveDirectives itself.
      execSync('git stash pop -q', { cwd: root, stdio: 'pipe' });
      expect(readDirectives(root)).toBe(SPRINT_378_CONTENT);

      archiveDirectives(root, 'sprint-378', 'CLEANUP');

      const archivePath = join(root, '.brain', 'archive', 'DIRECTIVES-sprint-378.md');
      const archived = readFileSync(archivePath, 'utf-8');
      expect(archived).toBe(SPRINT_378_CONTENT);
      // Default preserve (ADR-046/Sprint 168 C0a-4): working copy stays intact too.
      expect(readDirectives(root)).toBe(SPRINT_378_CONTENT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
