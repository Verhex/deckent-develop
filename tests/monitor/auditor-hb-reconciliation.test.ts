/**
 * auditor-hb-reconciliation.test.ts — Tests for shouldReportStale() and DONE_SET
 *
 * Sprint 135 Task T-002: Auditor HB+Result Reconciliation (Docker Bug Defensive Fix)
 *
 * Tests the defensive fix for Sprint 134 Docker bug where containers were SIGKILL'd
 * after task completion, writing "FAILED exitCode 137" to heartbeat files. The auditor
 * then reported these as CRITICAL stale alerts 47 times.
 *
 * shouldReportStale() checks if a .result file exists with a successful selfAssessment
 * (DONE or GO_WITH_TECH_DEBT) before allowing a stale alert to be emitted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldReportStale, DONE_SET } from '../../src/monitor/auditor.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
});

// ─── DONE_SET constant ──────────────────────────────────────────────

describe('DONE_SET', () => {
  it('contains DONE and GO_WITH_TECH_DEBT', () => {
    expect(DONE_SET.has('DONE')).toBe(true);
    expect(DONE_SET.has('GO_WITH_TECH_DEBT')).toBe(true);
  });

  it('does not contain NO_GO', () => {
    expect(DONE_SET.has('NO_GO')).toBe(false);
  });
});

// ─── shouldReportStale ──────────────────────────────────────────────

describe('shouldReportStale', () => {
  const projectRoot = '/project';
  const taskId = '135-042';

  it('(Sprint 134 exact case) HB FAILED exitCode 137 + result DONE → returns false (suppress alert)', () => {
    // This is the exact scenario from Sprint 134: Docker container SIGKILL'd,
    // HB written with "FAILED exitCode 137", but task actually completed successfully.
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '135-042',
      selfAssessment: 'DONE',
      notes: 'Task completed before container shutdown',
    }) as never);

    const hbContent = {
      workerId: 'docker-042',
      taskId: '135-042',
      status: 'FAILED',
      exitCode: 137,
    };

    const result = shouldReportStale(projectRoot, taskId, hbContent);

    expect(result).toBe(false); // Suppress the false CRITICAL alert
  });

  it('HB stale + no .result file → returns true (normal stale, alert should fire)', () => {
    mockedExistsSync.mockReturnValue(false); // No .result file

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(true);
    // readFileSync should never be called when file doesn't exist
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });

  it('HB stale + result NO_GO → returns true (honest failure, alert should fire)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '135-042',
      selfAssessment: 'NO_GO',
      notes: 'tsc failed after 3 attempts',
    }) as never);

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(true); // NO_GO is a real failure — report the alert
  });

  it('HB stale + malformed JSON in .result → returns true (fail-safe)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('{ corrupt json {{' as never);

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(true); // Can't determine task status — honest alert
  });

  it('HB stale + result GO_WITH_TECH_DEBT → returns false (suppress alert)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '135-042',
      selfAssessment: 'GO_WITH_TECH_DEBT',
      notes: 'Minor tech debt remaining but task functionally complete',
    }) as never);

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(false); // GO_WITH_TECH_DEBT means task completed — suppress
  });

  it('result file exists but selfAssessment field is missing → returns true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '135-042',
      notes: 'No selfAssessment field at all',
    }) as never);

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(true); // No selfAssessment → can't confirm completion → alert
  });

  it('result file with unknown selfAssessment value → returns true', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      taskId: '135-042',
      selfAssessment: 'PARTIAL',
    }) as never);

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(true); // Unknown status → honest alert
  });

  it('readFileSync throws (I/O error) → returns true (fail-safe)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockImplementation(() => { throw new Error('EACCES: permission denied'); });

    const result = shouldReportStale(projectRoot, taskId);

    expect(result).toBe(true); // I/O error → fail-safe, report alert
  });
});
