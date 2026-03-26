import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readCiReportTrend,
  formatCiHealthSection,
  appendCiHealthToRetro,
  type CiTrend,
  type CiTrendEntry,
} from '../../src/orchestra/sprint-reporter.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `sprint-reporter-ci-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCiReportFile(brainDir: string, sprintId: string, data: object): void {
  mkdirSync(brainDir, { recursive: true });
  writeFileSync(join(brainDir, `ci-report-${sprintId}.json`), JSON.stringify(data), 'utf-8');
}

function makeCiReportData(overrides: {
  sprintId?: string;
  testCount?: number;
  testFailed?: number;
  coverage?: number;
  tscPassed?: boolean;
} = {}) {
  return {
    sprintId: overrides.sprintId ?? 'sprint-001',
    result: {
      testCount: overrides.testCount ?? 100,
      testPassed: (overrides.testCount ?? 100) - (overrides.testFailed ?? 0),
      testFailed: overrides.testFailed ?? 0,
      coverage: overrides.coverage ?? 95.0,
    },
    tscPassed: overrides.tscPassed ?? true,
    timestamp: '2026-03-26T10:00:00.000Z',
  };
}

// ─── readCiReportTrend ────────────────────────────────────────────────────────

describe('readCiReportTrend', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns empty trend when .brain dir does not exist', () => {
    const trend = readCiReportTrend(tmpDir);
    expect(trend.entries).toHaveLength(0);
    expect(trend.testCountTrend).toBe('stable');
    expect(trend.coverageTrend).toBe('stable');
    expect(trend.totalRegressions).toBe(0);
  });

  it('returns stable trend with single report', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001' }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.entries).toHaveLength(1);
    expect(trend.testCountTrend).toBe('stable');
  });

  it('detects increasing test count trend', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001', testCount: 100 }));
    writeCiReportFile(brainDir, 'sprint-002', makeCiReportData({ sprintId: 'sprint-002', testCount: 150 }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.testCountTrend).toBe('increasing');
  });

  it('detects decreasing test count trend', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001', testCount: 200 }));
    writeCiReportFile(brainDir, 'sprint-002', makeCiReportData({ sprintId: 'sprint-002', testCount: 150 }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.testCountTrend).toBe('decreasing');
  });

  it('detects increasing coverage trend', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001', coverage: 90.0 }));
    writeCiReportFile(brainDir, 'sprint-002', makeCiReportData({ sprintId: 'sprint-002', coverage: 96.0 }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.coverageTrend).toBe('increasing');
  });

  it('detects decreasing coverage trend', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001', coverage: 96.0 }));
    writeCiReportFile(brainDir, 'sprint-002', makeCiReportData({ sprintId: 'sprint-002', coverage: 89.0 }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.coverageTrend).toBe('decreasing');
  });

  it('totals regressions across all sprints', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001', testFailed: 2 }));
    writeCiReportFile(brainDir, 'sprint-002', makeCiReportData({ sprintId: 'sprint-002', testFailed: 1 }));
    writeCiReportFile(brainDir, 'sprint-003', makeCiReportData({ sprintId: 'sprint-003', testFailed: 0 }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.totalRegressions).toBe(3);
  });

  it('limits entries to maxSprints', () => {
    for (let i = 1; i <= 10; i++) {
      const id = `sprint-0${i.toString().padStart(2, '0')}`;
      writeCiReportFile(brainDir, id, makeCiReportData({ sprintId: id }));
    }
    const trend = readCiReportTrend(tmpDir, 3);
    expect(trend.entries.length).toBeLessThanOrEqual(3);
  });

  it('skips malformed report files gracefully', () => {
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(join(brainDir, 'ci-report-sprint-bad.json'), 'INVALID JSON', 'utf-8');
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001' }));
    const trend = readCiReportTrend(tmpDir);
    expect(trend.entries).toHaveLength(1); // only the valid one
  });
});

// ─── formatCiHealthSection ────────────────────────────────────────────────────

describe('formatCiHealthSection', () => {
  it('returns empty array for null report', () => {
    expect(formatCiHealthSection(null)).toEqual([]);
  });

  it('includes CI Health header', () => {
    const lines = formatCiHealthSection({
      tscPassed: true,
      result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 96.0 },
      delta: { newTests: 5, regressions: 0, coverageDelta: 0.2 },
      buildPassed: true,
    });
    expect(lines.join('\n')).toContain('## CI Health');
  });

  it('shows PASS for tsc and build when both pass', () => {
    const lines = formatCiHealthSection({
      tscPassed: true,
      result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 96.0 },
      delta: { newTests: 0, regressions: 0, coverageDelta: 0 },
      buildPassed: true,
    });
    const content = lines.join('\n');
    expect(content).toContain('| tsc --noEmit | PASS |');
    expect(content).toContain('| Build | PASS |');
  });

  it('shows FAIL for tsc and build when they fail', () => {
    const lines = formatCiHealthSection({
      tscPassed: false,
      result: { testCount: 100, testPassed: 97, testFailed: 3, coverage: 94.0 },
      delta: { newTests: 0, regressions: 3, coverageDelta: -0.5 },
      buildPassed: false,
    });
    const content = lines.join('\n');
    expect(content).toContain('| tsc --noEmit | FAIL |');
    expect(content).toContain('| Build | FAIL |');
  });

  it('shows regression count correctly', () => {
    const lines = formatCiHealthSection({
      tscPassed: true,
      result: { testCount: 100, testPassed: 97, testFailed: 3, coverage: 95.0 },
      delta: { newTests: 0, regressions: 3, coverageDelta: 0 },
      buildPassed: true,
    });
    expect(lines.join('\n')).toContain('3 regressions');
  });

  it('shows 0 regressions label correctly', () => {
    const lines = formatCiHealthSection({
      tscPassed: true,
      result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 95.0 },
      delta: { newTests: 0, regressions: 0, coverageDelta: 0 },
      buildPassed: true,
    });
    expect(lines.join('\n')).toContain('0 regressions');
  });

  it('shows coverage with delta sign', () => {
    const lines = formatCiHealthSection({
      tscPassed: true,
      result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 96.2 },
      delta: { newTests: 0, regressions: 0, coverageDelta: 0.2 },
      buildPassed: true,
    });
    const content = lines.join('\n');
    expect(content).toContain('96.2%');
    expect(content).toContain('+0.2%');
  });
});

// ─── appendCiHealthToRetro ────────────────────────────────────────────────────

describe('appendCiHealthToRetro', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('does nothing when RETRO.md does not exist', () => {
    writeCiReportFile(brainDir, 'sprint-062', makeCiReportData({ sprintId: 'sprint-062' }));
    // No RETRO.md — should not throw
    expect(() => appendCiHealthToRetro(tmpDir, 'sprint-062')).not.toThrow();
  });

  it('does nothing when CI report does not exist', () => {
    writeFileSync(join(brainDir, 'RETRO.md'), '# Sprint Retro\n', 'utf-8');
    expect(() => appendCiHealthToRetro(tmpDir, 'sprint-missing')).not.toThrow();
  });

  it('appends CI Health section to RETRO.md', () => {
    writeFileSync(join(brainDir, 'RETRO.md'), '# Sprint 062 Retro\n\n## Summary\nDone.', 'utf-8');
    const reportData = {
      sprintId: 'sprint-062',
      baseline: { testCount: 100, coverage: 95 },
      result: { testCount: 110, testPassed: 110, testFailed: 0, coverage: 95.0 },
      delta: { newTests: 10, regressions: 0, coverageDelta: 0.0 },
      tscPassed: true,
      buildPassed: true,
      timestamp: '2026-03-26T10:00:00.000Z',
    };
    writeCiReportFile(brainDir, 'sprint-062', reportData);
    appendCiHealthToRetro(tmpDir, 'sprint-062');

    const content = readFileSync(join(brainDir, 'RETRO.md'), 'utf-8');
    expect(content).toContain('## CI Health');
    expect(content).toContain('| tsc --noEmit | PASS |');
    expect(content).toContain('+10');
  });

  it('is idempotent — does not append CI Health twice', () => {
    writeFileSync(join(brainDir, 'RETRO.md'), '# Sprint Retro\n\n## CI Health\n| What | Value |\n', 'utf-8');
    const reportData = {
      sprintId: 'sprint-062',
      result: { testCount: 110, testPassed: 110, testFailed: 0, coverage: 95.0 },
      delta: { newTests: 10, regressions: 0, coverageDelta: 0 },
      tscPassed: true,
      buildPassed: true,
      timestamp: '2026-03-26T10:00:00.000Z',
    };
    writeCiReportFile(brainDir, 'sprint-062', reportData);
    appendCiHealthToRetro(tmpDir, 'sprint-062');
    appendCiHealthToRetro(tmpDir, 'sprint-062');

    const content = readFileSync(join(brainDir, 'RETRO.md'), 'utf-8');
    const occurrences = (content.match(/## CI Health/g) ?? []).length;
    expect(occurrences).toBe(1);
  });
});
