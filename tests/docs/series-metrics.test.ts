import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSprintArchive,
  foldSprintSlots,
  computeSprintMetrics,
  computeSeriesMetrics,
  buildSeriesMarkdown,
  main,
} from '../../scripts/series-metrics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const TMP_ROOT = path.join(PROJECT_ROOT, '.tmp-test', 'series-metrics-test');
const ARCHIVE_DIR = path.join(TMP_ROOT, 'archive');

function writeTask(sprintNum: number, task: Record<string, unknown>) {
  const dir = path.join(ARCHIVE_DIR, `sprint-${sprintNum}-tasks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `task-${task.id}.json`), JSON.stringify(task));
}

function writeResult(sprintNum: number, taskId: string, result: Record<string, unknown>) {
  const dir = path.join(ARCHIVE_DIR, `sprint-${sprintNum}-tasks`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `task-${taskId}.result`), JSON.stringify({ taskId, ...result }));
}

/**
 * Fixture: sprint-901 exercises fold-chain logic —
 * - 901-001: plain DONE root (no fix).
 * - 901-002: plain NO_GO root (no fix — stays NO_GO).
 * - 901-003 -> 901-003-fix: NO_GO healed to DONE by a same-sprint fix.
 * - 901-004 -> 901-004-fix (NO_GO) -> 901-004-fix-fix (PENDING, no .result): the pending
 *   grandchild must NOT override the last concrete ancestor (901-004-fix's NO_GO).
 * - 901-005: isPriorityFix=true but fixForTaskId points at a task from an earlier sprint not
 *   present in this archive — must count as its own root slot (cross-sprint carryover fix).
 * All self/brain assessments in this sprint match, to isolate the fold-logic assertions from
 * the self-vs-brain-agreement assertions (which sprint-902 covers instead).
 */
function seedSprint901() {
  writeTask(901, { id: '901-001', status: 'DONE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  writeResult(901, '901-001', { selfAssessment: 'DONE', brainEvaluation: 'DONE' });

  writeTask(901, { id: '901-002', status: 'NO_GO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  writeResult(901, '901-002', { selfAssessment: 'NO_GO', brainEvaluation: 'NO_GO' });

  writeTask(901, { id: '901-003', status: 'NO_GO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  writeResult(901, '901-003', { selfAssessment: 'NO_GO', brainEvaluation: 'NO_GO' });
  writeTask(901, { id: '901-003-fix', isPriorityFix: true, fixForTaskId: '901-003', status: 'DONE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  writeResult(901, '901-003-fix', { selfAssessment: 'DONE', brainEvaluation: 'DONE' });

  writeTask(901, { id: '901-004', status: 'NO_GO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  writeResult(901, '901-004', { selfAssessment: 'NO_GO', brainEvaluation: 'NO_GO' });
  writeTask(901, { id: '901-004-fix', isPriorityFix: true, fixForTaskId: '901-004', status: 'NO_GO', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  writeResult(901, '901-004-fix', { selfAssessment: 'NO_GO', brainEvaluation: 'NO_GO' });
  writeTask(901, { id: '901-004-fix-fix', isPriorityFix: true, fixForTaskId: '901-004-fix', status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:10:00.000Z' });
  // deliberately no .result file for 901-004-fix-fix — it was never dispatched

  writeTask(901, { id: '901-005', isPriorityFix: true, fixForTaskId: '800-999', status: 'DONE', createdAt: '2026-01-01T00:05:00.000Z', updatedAt: '2026-01-01T00:20:00.000Z' });
  writeResult(901, '901-005', { selfAssessment: 'DONE', brainEvaluation: 'DONE' });
}

/**
 * Fixture: sprint-902 exercises self-vs-brain agreement + zero-fix-attempts —
 * - 902-001: DONE, self/brain match.
 * - 902-002: GO_WITH_TECH_DEBT, self=DONE/brain=GO_WITH_TECH_DEBT (worker over-claim, mismatch).
 * - 902-003: GO_WITH_TECH_DEBT, self/brain match.
 * No isPriorityFix tasks at all — fixHeal.pct must be null (not 0/0 -> 0%).
 */
function seedSprint902() {
  writeTask(902, { id: '902-001', status: 'DONE', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:05:00.000Z' });
  writeResult(902, '902-001', { selfAssessment: 'DONE', brainEvaluation: 'DONE' });

  writeTask(902, { id: '902-002', status: 'GO_WITH_TECH_DEBT', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:05:00.000Z' });
  writeResult(902, '902-002', { selfAssessment: 'DONE', brainEvaluation: 'GO_WITH_TECH_DEBT' });

  writeTask(902, { id: '902-003', status: 'GO_WITH_TECH_DEBT', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:05:00.000Z' });
  writeResult(902, '902-003', { selfAssessment: 'GO_WITH_TECH_DEBT', brainEvaluation: 'GO_WITH_TECH_DEBT' });
}

describe('series-metrics', () => {
  beforeEach(() => {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    seedSprint901();
    seedSprint902();
  });

  afterEach(() => {
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  });

  describe('loadSprintArchive', () => {
    it('returns null for a sprint with no archive directory', () => {
      expect(loadSprintArchive(ARCHIVE_DIR, 999)).toBeNull();
    });

    it('loads task JSON and .result files keyed by id', () => {
      const archive = loadSprintArchive(ARCHIVE_DIR, 901);
      expect(archive).not.toBeNull();
      expect(archive!.tasks.size).toBe(8);
      expect(archive!.results.size).toBe(7); // 901-004-fix-fix has no .result
      expect(archive!.tasks.get('901-001')?.status).toBe('DONE');
    });
  });

  describe('foldSprintSlots', () => {
    it('folds a NO_GO root to DONE via a same-sprint fix', () => {
      const archive = loadSprintArchive(ARCHIVE_DIR, 901)!;
      const slots = foldSprintSlots(archive);
      const slot003 = slots.find(s => s.rootId === '901-003');
      expect(slot003?.resolvedId).toBe('901-003-fix');
      expect(slot003?.outcome).toBe('DONE');
    });

    it('does not descend into a pending fix-of-fix grandchild', () => {
      const archive = loadSprintArchive(ARCHIVE_DIR, 901)!;
      const slots = foldSprintSlots(archive);
      const slot004 = slots.find(s => s.rootId === '901-004');
      expect(slot004?.resolvedId).toBe('901-004-fix');
      expect(slot004?.outcome).toBe('NO_GO');
    });

    it('treats a cross-sprint-carryover fix task as its own root slot', () => {
      const archive = loadSprintArchive(ARCHIVE_DIR, 901)!;
      const slots = foldSprintSlots(archive);
      const slot005 = slots.find(s => s.rootId === '901-005');
      expect(slot005).toBeDefined();
      expect(slot005?.outcome).toBe('DONE');
      // 5 roots: 001, 002, 003, 004, 005 — none of the *-fix children are separate roots
      expect(slots).toHaveLength(5);
    });

    it('leaves a fix-less NO_GO root as NO_GO', () => {
      const archive = loadSprintArchive(ARCHIVE_DIR, 901)!;
      const slots = foldSprintSlots(archive);
      expect(slots.find(s => s.rootId === '901-002')?.outcome).toBe('NO_GO');
    });
  });

  describe('computeSprintMetrics', () => {
    it('computes sprint-901 counts, duration, agreement, and fix-heal rate', () => {
      const m = computeSprintMetrics(ARCHIVE_DIR, 901)!;
      expect(m.tasks).toBe(5);
      expect(m.done).toBe(3); // 001, 003(folded), 005
      expect(m.techDebt).toBe(0);
      expect(m.noGo).toBe(2); // 002, 004(folded)
      expect(m.pending).toBe(0);
      expect(m.durationMs).toBe(20 * 60 * 1000); // min 00:00:00 .. max 00:20:00 (from 901-005)
      // 7 raw results (all tasks except the pending 901-004-fix-fix), all self===brain
      expect(m.selfBrainAgreement).toEqual({ matched: 7, total: 7, pct: 100 });
      // isPriorityFix attempts: 003-fix(healed), 004-fix(not), 004-fix-fix(not), 005(healed)
      expect(m.fixHeal).toEqual({ healed: 2, attempted: 4, pct: 50 });
    });

    it('computes sprint-902 counts, mismatch agreement, and null fix-heal (no fix attempts)', () => {
      const m = computeSprintMetrics(ARCHIVE_DIR, 902)!;
      expect(m.tasks).toBe(3);
      expect(m.done).toBe(1);
      expect(m.techDebt).toBe(2);
      expect(m.noGo).toBe(0);
      expect(m.durationMs).toBe(5 * 60 * 1000);
      expect(m.selfBrainAgreement).toEqual({ matched: 2, total: 3, pct: 67 });
      expect(m.fixHeal).toEqual({ healed: 0, attempted: 0, pct: null });
    });

    it('returns null for a sprint with no archive', () => {
      expect(computeSprintMetrics(ARCHIVE_DIR, 999)).toBeNull();
    });
  });

  describe('computeSeriesMetrics', () => {
    it('aggregates the 901-902 range into a cumulative rollup', () => {
      const series = computeSeriesMetrics(ARCHIVE_DIR, 901, 902);
      expect(series.sprints).toHaveLength(2);
      expect(series.missing).toEqual([]);
      expect(series.cumulative).toEqual({
        tasks: 8,
        done: 4,
        techDebt: 2,
        noGo: 2,
        pending: 0,
        durationMs: 20 * 60 * 1000 + 5 * 60 * 1000,
        selfBrainAgreementPct: 90, // (7+2)/(7+3) = 9/10
        fixHealPct: 50, // (2+0)/(4+0)
      });
    });

    it('lists an unarchived sprint in `missing` and excludes it from the cumulative', () => {
      const series = computeSeriesMetrics(ARCHIVE_DIR, 901, 903);
      expect(series.sprints).toHaveLength(2);
      expect(series.missing).toEqual([903]);
      expect(series.cumulative.tasks).toBe(8);
    });
  });

  describe('buildSeriesMarkdown', () => {
    it('renders a table row per sprint plus a bold cumulative row', () => {
      const series = computeSeriesMetrics(ARCHIVE_DIR, 901, 902);
      const md = buildSeriesMarkdown(series, '2026-07-03T00:00:00.000Z');
      expect(md).toContain('# Sprint Series Metrics — 901–902');
      expect(md).toContain('| sprint-901 | 5 | 3 | 0 | 2 | 0 |');
      expect(md).toContain('| sprint-902 | 3 | 1 | 2 | 0 | 0 |');
      expect(md).toContain('| **Cumulative** | **8** | **4** | **2** | **2** |');
    });

    it('surfaces a missing-sprint warning line', () => {
      const series = computeSeriesMetrics(ARCHIVE_DIR, 901, 903);
      const md = buildSeriesMarkdown(series, '2026-07-03T00:00:00.000Z');
      expect(md).toContain('Missing archive for sprint(s): sprint-903');
    });
  });

  describe('main (CLI)', () => {
    const OUT_DIR = path.join(TMP_ROOT, 'out');

    it('writes MD and JSON reports to the given --out paths and returns 0', () => {
      const outMd = path.join(OUT_DIR, 'series-901-902.md');
      const outJson = path.join(OUT_DIR, 'series-901-902.json');
      const code = main(
        ['901', '902', `--archive-dir=${ARCHIVE_DIR}`, `--out-md=${outMd}`, `--out-json=${outJson}`],
        { now: '2026-07-03T00:00:00.000Z' },
      );
      expect(code).toBe(0);
      expect(fs.existsSync(outMd)).toBe(true);
      expect(fs.existsSync(outJson)).toBe(true);

      const mdContent = fs.readFileSync(outMd, 'utf-8');
      expect(mdContent).toContain('# Sprint Series Metrics — 901–902');

      const jsonContent = JSON.parse(fs.readFileSync(outJson, 'utf-8'));
      expect(jsonContent.cumulative.tasks).toBe(8);
      expect(jsonContent.generatedAt).toBe('2026-07-03T00:00:00.000Z');
    });

    it('returns exit code 2 when the sprint range is missing', () => {
      expect(main([], {})).toBe(2);
    });

    it('returns exit code 2 for an invalid (reversed) sprint range', () => {
      expect(main(['902', '901'], {})).toBe(2);
    });
  });
});
