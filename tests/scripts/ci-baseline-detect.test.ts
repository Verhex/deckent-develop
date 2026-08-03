import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset (commit 97b91e69f) archived the document this assertion
// guards; the rewritten corpus has no successor carrying the same claim.
// Skipped, not deleted, so the coverage loss stays visible. Owner ledger: docs/MASTER-PLAN.md (TRUTH-BASELINE-001).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const README_PATH = path.join(PROJECT_ROOT, 'README.md');
const BASELINE_PATH = path.join(PROJECT_ROOT, '.deckent', 'ci-baseline.json');

async function importDetect() {
  return import(path.join(PROJECT_ROOT, 'scripts', 'ci-baseline-detect.mjs'));
}

describe('ci-baseline-detect', () => {
  it('README sprint badge is current (>= 214, never the stale 190)', () => {
    expect(fs.existsSync(README_PATH)).toBe(true);
    const readme = fs.readFileSync(README_PATH, 'utf-8');
    // Code-derived guard (Sprint 270): the literal "21X" expectation went stale
    // the moment the badge advanced past 219 — parse the actual badge count.
    const badge = readme.match(/sprints-(\d+)%2B/);
    expect(badge).not.toBeNull();
    expect(Number(badge![1])).toBeGreaterThanOrEqual(214);
    // Must NOT have old 190+ badge as the sprint count
    expect(readme).not.toMatch(/sprints-190%2B/);
  });

  it('isGarbage detects testCount:17/passed:0/failed:17 as garbage', async () => {
    const { isGarbage } = await importDetect();
    const garbageBaseline = {
      sprintId: 'sprint-214',
      baseline: { tscPassed: true, testCount: 17, testPassed: 0, testFailed: 17, coverage: 0 },
    };
    expect(isGarbage(garbageBaseline)).toBe(true);
  });

  it('isGarbage returns false for real baseline counts', async () => {
    const { isGarbage } = await importDetect();
    const realBaseline = {
      sprintId: 'sprint-214',
      baseline: { tscPassed: true, testCount: 18000, testPassed: 18000, testFailed: 0, coverage: 0 },
    };
    expect(isGarbage(realBaseline)).toBe(false);
  });

  it('countDescriptors returns a count >= 18000 for this project', async () => {
    const { countDescriptors } = await importDetect();
    const testsDir = path.join(PROJECT_ROOT, 'tests');
    const { count, files } = countDescriptors(testsDir);
    expect(count).toBeGreaterThanOrEqual(18000);
    expect(files).toBeGreaterThan(0);
  });

  it('buildFixedBaseline produces non-garbage testCount', async () => {
    const { buildFixedBaseline } = await importDetect();
    const fixed = buildFixedBaseline(PROJECT_ROOT, 'sprint-test');
    expect(fixed.baseline.testCount).toBeGreaterThanOrEqual(18000);
    expect(fixed.baseline.testFailed).toBe(0);
    expect(fixed.sprintId).toBe('sprint-test');
  });

  describe('main --check mode', () => {
    let tmpBaseline: string | null = null;
    const TMP_ROOT = path.join(PROJECT_ROOT, '.tmp-test', 'ci-baseline-detect-test');

    beforeEach(() => {
      fs.mkdirSync(path.join(TMP_ROOT, '.deckent'), { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    });

    it('main --check exits 1 for garbage baseline', async () => {
      const { main } = await importDetect();
      const garbage = {
        sprintId: 'sprint-214',
        baseline: { tscPassed: true, testCount: 17, testPassed: 0, testFailed: 17, coverage: 0 },
      };
      fs.writeFileSync(
        path.join(TMP_ROOT, '.deckent', 'ci-baseline.json'),
        JSON.stringify(garbage),
      );
      const code = main(['--check'], { root: TMP_ROOT });
      expect(code).toBe(1);
    });

    it('main --fix rewrites garbage baseline with real count', async () => {
      const { main } = await importDetect();
      const garbage = {
        sprintId: 'sprint-214',
        baseline: { tscPassed: true, testCount: 17, testPassed: 0, testFailed: 17, coverage: 0 },
      };
      fs.writeFileSync(
        path.join(TMP_ROOT, '.deckent', 'ci-baseline.json'),
        JSON.stringify(garbage),
      );
      const code = main(['--fix'], { root: TMP_ROOT });
      expect(code).toBe(0);
      const written = JSON.parse(
        fs.readFileSync(path.join(TMP_ROOT, '.deckent', 'ci-baseline.json'), 'utf-8'),
      );
      // After fix with TMP_ROOT that has no tests/, count will be 0 but NOT the garbage 17
      expect(written.baseline.testCount).not.toBe(17);
      expect(written.baseline.testFailed).toBe(0);
    });

    it('main without args returns exit code 2', async () => {
      const { main } = await importDetect();
      const code = main([], { root: TMP_ROOT });
      expect(code).toBe(2);
    });
  });
});
