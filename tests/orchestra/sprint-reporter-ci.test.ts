import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readCiReportTrend,
  formatCiHealthSection,
  appendCiHealthToRetro,
  appendCiLearningsToMemory,
  type CiTrend,
  type CiTrendEntry,
} from '../../src/orchestra/sprint-reporter.js';
import { MemoryStore } from '../../src/core/memory-store.js';

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
    delta: { newTests: 0, regressions: overrides.testFailed ?? 0, coverageDelta: 0 },
    tscPassed: overrides.tscPassed ?? true,
    buildPassed: true,
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

  it('does nothing when CI report does not exist', () => {
    writeFileSync(join(brainDir, 'RETRO.md'), '# Sprint Retro\n', 'utf-8');
    expect(() => appendCiHealthToRetro(tmpDir, 'sprint-missing')).not.toThrow();
  });

  // NOTE: 3 tests removed (2026-04-17, Sprint 143 cleanup). In Memory V2 the
  // function no longer writes to RETRO.md — it upserts a retro entry into the
  // MemoryStore when a store is provided, otherwise it is a no-op.

  it('does nothing when CI report does not exist (no store)', () => {
    expect(() => appendCiHealthToRetro(tmpDir, 'sprint-missing')).not.toThrow();
  });
});

// ─── appendCiHealthToRetro — DB-write coverage ───────────────────────────────

describe('appendCiHealthToRetro — DB-write coverage', () => {
  let tmpDir: string;
  let brainDir: string;
  let store: MemoryStore;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
    store = new MemoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('upserts retro entry into DB when CI report exists and store is provided', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001' }));

    appendCiHealthToRetro(tmpDir, 'sprint-001', store);

    const entry = store.getById('retro-ci-health-sprint-001');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('retro');
    expect(entry!.title).toContain('sprint-001');
  });

  it('validates DB entry content contains CI Health section', () => {
    writeCiReportFile(brainDir, 'sprint-042', makeCiReportData({
      sprintId: 'sprint-042',
      testCount: 200,
      testFailed: 0,
      coverage: 93.5,
      tscPassed: true,
    }));

    appendCiHealthToRetro(tmpDir, 'sprint-042', store);

    const entry = store.getById('retro-ci-health-sprint-042');
    expect(entry).not.toBeNull();
    expect(entry!.content).toContain('## CI Health');
    expect(entry!.content).toContain('PASS');
    expect(entry!.content).toContain('93.5%');
    expect(entry!.sprint_id).toBe('sprint-042');
  });

  it('is idempotent — calling twice results in only 1 DB entry (no duplicate)', () => {
    writeCiReportFile(brainDir, 'sprint-010', makeCiReportData({ sprintId: 'sprint-010' }));

    appendCiHealthToRetro(tmpDir, 'sprint-010', store);
    appendCiHealthToRetro(tmpDir, 'sprint-010', store); // second call — should skip

    const entry = store.getById('retro-ci-health-sprint-010');
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('retro-ci-health-sprint-010');
  });

  it('is a no-op when store is undefined — does not throw', () => {
    writeCiReportFile(brainDir, 'sprint-001', makeCiReportData({ sprintId: 'sprint-001' }));
    expect(() => appendCiHealthToRetro(tmpDir, 'sprint-001', undefined)).not.toThrow();
  });

  it('is a no-op when CI report does not exist — does not write to DB', () => {
    appendCiHealthToRetro(tmpDir, 'sprint-999', store);
    const entry = store.getById('retro-ci-health-sprint-999');
    expect(entry).toBeNull();
  });

  it('DB entry tags include ci-health and retro', () => {
    writeCiReportFile(brainDir, 'sprint-005', makeCiReportData({ sprintId: 'sprint-005' }));

    appendCiHealthToRetro(tmpDir, 'sprint-005', store);

    const entry = store.getById('retro-ci-health-sprint-005');
    expect(entry).not.toBeNull();
    // tags are stored in a separate table — use getTagsForEntry
    const tags = store.getTagsForEntry('retro-ci-health-sprint-005');
    expect(tags).toContain('ci-health');
    expect(tags).toContain('retro');
  });
});

// ─── appendCiLearningsToMemory — DB-write coverage ───────────────────────────

describe('appendCiLearningsToMemory — DB-write coverage', () => {
  let store: MemoryStore;

  function makeFakeLearningResult() {
    return {
      reports: [
        {
          sprintId: 'sprint-001',
          baseline: { testCount: 98, coverage: 91.0 },
          result: { testCount: 100, testPassed: 98, testFailed: 2, coverage: 92.0 },
          delta: { newTests: 2, regressions: 2, coverageDelta: 1.0 },
          tscPassed: true,
          buildPassed: true,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ],
      patterns: [],
      suggestions: [],
      configSuggestions: [],
      summary: 'Sprint 001 CI summary',
    };
  }

  beforeEach(() => {
    store = new MemoryStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('upserts ci-learnings-latest memory entry when reports exist', () => {
    appendCiLearningsToMemory('', makeFakeLearningResult(), store);

    const entry = store.getById('ci-learnings-latest');
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('memory');
    expect(entry!.title).toBe('CI Learnings');
  });

  it('is a no-op when store is undefined — does not throw', () => {
    expect(() => appendCiLearningsToMemory('', makeFakeLearningResult(), undefined)).not.toThrow();
  });

  it('is idempotent — calling twice upserts, not duplicates', () => {
    const fakeResult = makeFakeLearningResult();

    appendCiLearningsToMemory('', fakeResult, store);
    appendCiLearningsToMemory('', fakeResult, store); // second call — upsert

    const entry = store.getById('ci-learnings-latest');
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe('ci-learnings-latest');
  });
});
