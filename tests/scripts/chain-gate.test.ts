import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SpawnSyncReturns } from 'node:child_process';

// ─── Module mock setup ───────────────────────────────────────────────────────
// We mock child_process.spawnSync to avoid running real CLI commands in tests
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

// Dynamic import after mock setup so the module picks up mocks
let checkTypeScript: (root?: string) => { name: string; passed: boolean; required: boolean; message: string };
let checkVitestFailCount: (root?: string, maxFail?: number) => { name: string; passed: boolean; required: boolean; message: string };
let checkDoctorScore: (root?: string, minScore?: number) => { name: string; passed: boolean; required: boolean; message: string };
let checkSprintCost: (root?: string, sprint?: string | null, maxCost?: number) => { name: string; passed: boolean; required: boolean; message: string };
let checkNoGoCount: (root?: string, sprint?: string | null, maxNoGo?: number) => { name: string; passed: boolean; required: boolean; message: string };
let checkPromptLinter: (root?: string, sprint?: string | null, minAvg?: number) => { name: string; passed: boolean; required: boolean; message: string };
let THRESHOLDS: { vitestMaxFail: number; doctorMinScore: number; maxCostUsd: number; maxNoGoCount: number; minPromptLinterAvg: number };
let spawnSync: ReturnType<typeof vi.fn>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSpawnResult(status: number, stdout = '', stderr = ''): SpawnSyncReturns<string> {
  return {
    pid: 1234,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status,
    signal: null,
    error: undefined,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('chain-gate-check.mjs', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    vi.resetModules();
    // Re-import after resetModules to get fresh module state with mocks
    const mod = await import('../../scripts/chain-gate-check.mjs');
    checkTypeScript = mod.checkTypeScript;
    checkVitestFailCount = mod.checkVitestFailCount;
    checkDoctorScore = mod.checkDoctorScore;
    checkSprintCost = mod.checkSprintCost;
    checkNoGoCount = mod.checkNoGoCount;
    checkPromptLinter = mod.checkPromptLinter;
    THRESHOLDS = mod.THRESHOLDS;

    const childProcess = await import('node:child_process');
    spawnSync = childProcess.spawnSync as ReturnType<typeof vi.fn>;
    spawnSync.mockReset();

    // Create a temporary directory for file-system based tests
    tmpRoot = join(tmpdir(), `chain-gate-test-${Date.now()}`);
    mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpRoot)) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // ── Check 1: TypeScript build ──────────────────────────────────────────────

  describe('checkTypeScript', () => {
    it('passes when tsc exits with code 0', () => {
      // Arrange
      spawnSync.mockReturnValue(makeSpawnResult(0, '', ''));

      // Act
      const result = checkTypeScript(tmpRoot);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.required).toBe(true);
      expect(result.name).toBe('TypeScript Build');
      expect(result.message).toContain('tsc --noEmit passed');
    });

    it('fails when tsc exits with non-zero code', () => {
      // Arrange
      const stderrOutput = "src/core/config.ts(12,3): error TS2345: Argument of type 'string'";
      spawnSync.mockReturnValue(makeSpawnResult(1, '', stderrOutput));

      // Act
      const result = checkTypeScript(tmpRoot);

      // Assert
      expect(result.passed).toBe(false);
      expect(result.required).toBe(true);
      expect(result.message).toContain('tsc failed');
      expect(result.message).toContain('error TS');
    });
  });

  // ── Check 2: Vitest fail count ─────────────────────────────────────────────

  describe('checkVitestFailCount', () => {
    it('passes when vitest exits 0 (zero failures)', () => {
      // Arrange
      spawnSync.mockReturnValue(makeSpawnResult(0, 'Tests  523 passed (523)', ''));

      // Act
      const result = checkVitestFailCount(tmpRoot, THRESHOLDS.vitestMaxFail);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.required).toBe(true);
      expect(result.message).toMatch(/0 failures/i);
    });

    it('passes when fail count is below threshold (2 < 3)', () => {
      // Arrange: 2 failures but threshold is 3
      spawnSync.mockReturnValue(makeSpawnResult(1, 'Tests  521 passed | 2 failed', ''));

      // Act
      const result = checkVitestFailCount(tmpRoot, 3);

      // Assert — 2 < 3 → passed
      expect(result.passed).toBe(true);
      expect(result.message).toContain('2 failures');
    });

    it('fails when fail count meets or exceeds threshold (3 ≥ 3)', () => {
      // Arrange: exactly 3 failures, threshold = 3 (must be < 3, so 3 fails)
      spawnSync.mockReturnValue(makeSpawnResult(1, 'Tests  520 passed | 3 failed', ''));

      // Act
      const result = checkVitestFailCount(tmpRoot, 3);

      // Assert — 3 is NOT < 3 → failed
      expect(result.passed).toBe(false);
      expect(result.message).toContain('3 failures');
    });

    it('THRESHOLDS.vitestMaxFail is 3', () => {
      expect(THRESHOLDS.vitestMaxFail).toBe(3);
    });
  });

  // ── Check 3: Doctor score ──────────────────────────────────────────────────

  describe('checkDoctorScore', () => {
    it('passes when doctor score is ≥ 90', () => {
      // Arrange
      spawnSync.mockReturnValue(makeSpawnResult(0, JSON.stringify({ score: 95, issues: [] }), ''));

      // Act
      const result = checkDoctorScore(tmpRoot, THRESHOLDS.doctorMinScore);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.required).toBe(true);
      expect(result.message).toContain('95/100');
    });

    it('fails when doctor score is < 90', () => {
      // Arrange
      spawnSync.mockReturnValue(makeSpawnResult(1, JSON.stringify({ score: 85, issues: ['missing tests'] }), ''));

      // Act
      const result = checkDoctorScore(tmpRoot, 90);

      // Assert
      expect(result.passed).toBe(false);
      expect(result.message).toContain('85/100');
      expect(result.message).toContain('FAIL');
    });

    it('fails when doctor command itself fails to run', () => {
      // Arrange: simulate command not found
      spawnSync.mockReturnValue({
        pid: undefined,
        output: [],
        stdout: '',
        stderr: '',
        status: null,
        signal: null,
        error: new Error('spawn deckent ENOENT'),
      });

      // Act
      const result = checkDoctorScore(tmpRoot, 90);

      // Assert
      expect(result.passed).toBe(false);
      expect(result.message).toContain('failed to run');
    });

    it('THRESHOLDS.doctorMinScore is 90', () => {
      expect(THRESHOLDS.doctorMinScore).toBe(90);
    });
  });

  // ── Check 4: Sprint cost ───────────────────────────────────────────────────

  describe('checkSprintCost', () => {
    it('passes when cost is below $95 threshold', () => {
      // Arrange: write a metrics file with cost data
      const deckentDir = join(tmpRoot, '.deckent');
      mkdirSync(deckentDir, { recursive: true });
      const metricsFile = join(deckentDir, 'sprint-146-metrics.jsonl');
      writeFileSync(metricsFile, JSON.stringify({ costUsd: 42.5 }) + '\n');

      // Act
      const result = checkSprintCost(tmpRoot, 'sprint-146', THRESHOLDS.maxCostUsd);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.message).toContain('$42.50');
      expect(result.message).toContain('OK');
    });

    it('fails when cost is at or above $95 threshold', () => {
      // Arrange
      const deckentDir = join(tmpRoot, '.deckent');
      mkdirSync(deckentDir, { recursive: true });
      const metricsFile = join(deckentDir, 'sprint-146-metrics.jsonl');
      writeFileSync(metricsFile, JSON.stringify({ costUsd: 97.3 }) + '\n');

      // Act
      const result = checkSprintCost(tmpRoot, 'sprint-146', 95);

      // Assert
      expect(result.passed).toBe(false);
      expect(result.message).toContain('OVER BUDGET');
    });

    it('skips gracefully when no metrics file exists', () => {
      // Act: no .deckent/ directory at all
      const result = checkSprintCost(tmpRoot, 'sprint-146', 95);

      // Assert — optional check, passes when no data
      expect(result.passed).toBe(true);
      expect(result.required).toBe(false);
      expect(result.message).toContain('skipping');
    });

    it('THRESHOLDS.maxCostUsd is 95', () => {
      expect(THRESHOLDS.maxCostUsd).toBe(95);
    });
  });

  // ── Check 5: NO_GO count ──────────────────────────────────────────────────

  describe('checkNoGoCount', () => {
    it('passes when NO_GO count is ≤ 2', () => {
      // Arrange: write 2 NO_GO results and 10 DONE results
      const tasksDir = join(tmpRoot, '.tasks');
      mkdirSync(tasksDir, { recursive: true });
      for (let i = 0; i < 10; i++) {
        writeFileSync(
          join(tasksDir, `task-146-0${i.toString().padStart(2, '0')}.result`),
          JSON.stringify({ taskId: `146-0${i}`, selfAssessment: 'DONE', sprintId: 'sprint-146' })
        );
      }
      writeFileSync(
        join(tasksDir, 'task-146-010.result'),
        JSON.stringify({ taskId: '146-010', selfAssessment: 'NO_GO', sprintId: 'sprint-146' })
      );
      writeFileSync(
        join(tasksDir, 'task-146-011.result'),
        JSON.stringify({ taskId: '146-011', selfAssessment: 'NO_GO', sprintId: 'sprint-146' })
      );

      // Act
      const result = checkNoGoCount(tmpRoot, 'sprint-146', THRESHOLDS.maxNoGoCount);

      // Assert — 2 ≤ 2 → passes
      expect(result.passed).toBe(true);
      expect(result.message).toContain('2/12');
    });

    it('fails when NO_GO count exceeds threshold (> 2)', () => {
      // Arrange: 3 NO_GO results
      const tasksDir = join(tmpRoot, '.tasks');
      mkdirSync(tasksDir, { recursive: true });
      for (let i = 0; i < 3; i++) {
        writeFileSync(
          join(tasksDir, `task-146-0${i}.result`),
          JSON.stringify({ taskId: `146-0${i}`, selfAssessment: 'NO_GO', sprintId: 'sprint-146' })
        );
      }

      // Act
      const result = checkNoGoCount(tmpRoot, 'sprint-146', 2);

      // Assert — 3 > 2 → fails
      expect(result.passed).toBe(false);
      expect(result.message).toContain('3/3');
      expect(result.message).toContain('FAIL');
    });

    it('skips gracefully when no .tasks/ directory exists', () => {
      // Act: no .tasks/ dir
      const result = checkNoGoCount(tmpRoot, 'sprint-146', 2);

      // Assert — optional, passes when no data
      expect(result.passed).toBe(true);
      expect(result.required).toBe(false);
    });

    it('THRESHOLDS.maxNoGoCount is 2', () => {
      expect(THRESHOLDS.maxNoGoCount).toBe(2);
    });
  });

  // ── Check 6: Prompt linter ─────────────────────────────────────────────────

  describe('checkPromptLinter', () => {
    it('passes when linter avg is ≥ 75', () => {
      // Arrange: create a fake linter script so existsSync returns true
      const scriptsDir = join(tmpRoot, 'scripts');
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(join(scriptsDir, 'prompt-linter.mjs'), '// placeholder');
      spawnSync.mockReturnValue(makeSpawnResult(0, JSON.stringify({ avg: 85, files: 3 }), ''));

      // Act
      const result = checkPromptLinter(tmpRoot, null, THRESHOLDS.minPromptLinterAvg);

      // Assert
      expect(result.passed).toBe(true);
      expect(result.message).toContain('85.0/100');
      expect(result.message).toContain('OK');
    });

    it('fails when linter avg is < 75', () => {
      // Arrange
      const scriptsDir = join(tmpRoot, 'scripts');
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(join(scriptsDir, 'prompt-linter.mjs'), '// placeholder');
      spawnSync.mockReturnValue(makeSpawnResult(1, JSON.stringify({ avg: 60, files: 3 }), ''));

      // Act
      const result = checkPromptLinter(tmpRoot, null, 75);

      // Assert
      expect(result.passed).toBe(false);
      expect(result.message).toContain('60.0/100');
      expect(result.message).toContain('FAIL');
    });

    it('skips gracefully when no prompt files found (exit code 2)', () => {
      // Arrange
      const scriptsDir = join(tmpRoot, 'scripts');
      mkdirSync(scriptsDir, { recursive: true });
      writeFileSync(join(scriptsDir, 'prompt-linter.mjs'), '// placeholder');
      spawnSync.mockReturnValue(makeSpawnResult(2, '', 'no prompt files found'));

      // Act
      const result = checkPromptLinter(tmpRoot, null, 75);

      // Assert — exit 2 means no files, should skip
      expect(result.passed).toBe(true);
      expect(result.required).toBe(false);
      expect(result.message).toContain('skipping');
    });

    it('THRESHOLDS.minPromptLinterAvg is 75', () => {
      expect(THRESHOLDS.minPromptLinterAvg).toBe(75);
    });
  });
});
