import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readCiReports,
  detectFailurePatterns,
  generateSuggestions,
  generateConfigSuggestions,
  buildCiLearningLine,
  buildCiLearningsSection,
  analyzeCiLearnings,
  writeCiLearnings,
  type CiReportData,
  type FailurePattern,
} from '../../src/core/ci-learning.js';

import {
  runCiLearningAnalysis,
  appendCiLearningsToMemory,
} from '../../src/orchestra/sprint-reporter.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `ci-learning-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeReport(overrides: Partial<CiReportData> = {}): CiReportData {
  return {
    sprintId: overrides.sprintId ?? 'sprint-001',
    baseline: overrides.baseline ?? { testCount: 100, coverage: 95 },
    result: overrides.result ?? {
      testCount: 110,
      testPassed: 110,
      testFailed: 0,
      coverage: 95.5,
    },
    delta: overrides.delta ?? { newTests: 10, regressions: 0, coverageDelta: 0.5 },
    tscPassed: overrides.tscPassed ?? true,
    buildPassed: overrides.buildPassed ?? true,
    timestamp: overrides.timestamp ?? '2026-03-26T10:00:00.000Z',
  };
}

function writeCiReportFile(brainDir: string, report: CiReportData): void {
  mkdirSync(brainDir, { recursive: true });
  writeFileSync(
    join(brainDir, `ci-report-${report.sprintId}.json`),
    JSON.stringify(report),
    'utf-8',
  );
}

// ─── readCiReports ──────────────────────────────────────────────────────────

describe('readCiReports', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns empty array when .brain does not exist', () => {
    expect(readCiReports(tmpDir)).toEqual([]);
  });

  it('reads valid CI reports', () => {
    const r1 = makeReport({ sprintId: 'sprint-001' });
    const r2 = makeReport({ sprintId: 'sprint-002' });
    writeCiReportFile(brainDir, r1);
    writeCiReportFile(brainDir, r2);

    const reports = readCiReports(tmpDir);
    expect(reports).toHaveLength(2);
    expect(reports[0]!.sprintId).toBe('sprint-001');
    expect(reports[1]!.sprintId).toBe('sprint-002');
  });

  it('limits to maxSprints', () => {
    for (let i = 1; i <= 10; i++) {
      writeCiReportFile(brainDir, makeReport({ sprintId: `sprint-0${i.toString().padStart(2, '0')}` }));
    }
    const reports = readCiReports(tmpDir, 3);
    expect(reports).toHaveLength(3);
  });

  it('skips malformed files gracefully', () => {
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(join(brainDir, 'ci-report-sprint-bad.json'), 'INVALID', 'utf-8');
    writeCiReportFile(brainDir, makeReport({ sprintId: 'sprint-001' }));

    const reports = readCiReports(tmpDir);
    expect(reports).toHaveLength(1);
  });
});

// ─── detectFailurePatterns ──────────────────────────────────────────────────

describe('detectFailurePatterns', () => {
  it('returns empty patterns for empty reports', () => {
    expect(detectFailurePatterns([])).toEqual([]);
  });

  it('detects tsc failure pattern', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', tscPassed: false }),
      makeReport({ sprintId: 'sprint-002', tscPassed: false }),
      makeReport({ sprintId: 'sprint-003', tscPassed: true }),
    ];
    const patterns = detectFailurePatterns(reports);
    const tscPattern = patterns.find(p => p.category === 'tsc');
    expect(tscPattern).toBeDefined();
    expect(tscPattern!.occurrences).toBe(2);
    expect(tscPattern!.severity).toBe('medium');
  });

  it('detects high severity tsc pattern with 3+ failures', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', tscPassed: false }),
      makeReport({ sprintId: 'sprint-002', tscPassed: false }),
      makeReport({ sprintId: 'sprint-003', tscPassed: false }),
    ];
    const patterns = detectFailurePatterns(reports);
    const tscPattern = patterns.find(p => p.category === 'tsc');
    expect(tscPattern!.severity).toBe('high');
  });

  it('detects regression pattern', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', delta: { newTests: 5, regressions: 3, coverageDelta: 0 } }),
      makeReport({ sprintId: 'sprint-002', delta: { newTests: 5, regressions: 2, coverageDelta: 0 } }),
    ];
    const patterns = detectFailurePatterns(reports);
    const regPattern = patterns.find(p => p.category === 'regression');
    expect(regPattern).toBeDefined();
    expect(regPattern!.occurrences).toBe(5); // total regressions
    expect(regPattern!.severity).toBe('high');
  });

  it('detects coverage drop pattern', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', delta: { newTests: 0, regressions: 0, coverageDelta: -1.5 } }),
      makeReport({ sprintId: 'sprint-002', delta: { newTests: 0, regressions: 0, coverageDelta: -2.0 } }),
    ];
    const patterns = detectFailurePatterns(reports);
    const covPattern = patterns.find(p => p.category === 'coverage');
    expect(covPattern).toBeDefined();
    expect(covPattern!.occurrences).toBe(2);
    expect(covPattern!.severity).toBe('high'); // total drop > 3%
  });

  it('detects build failure pattern', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', buildPassed: false }),
      makeReport({ sprintId: 'sprint-002', buildPassed: false }),
    ];
    const patterns = detectFailurePatterns(reports);
    const buildPattern = patterns.find(p => p.category === 'build');
    expect(buildPattern).toBeDefined();
    expect(buildPattern!.severity).toBe('high');
  });

  it('returns no patterns when all green', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001' }),
      makeReport({ sprintId: 'sprint-002' }),
    ];
    const patterns = detectFailurePatterns(reports);
    expect(patterns).toEqual([]);
  });
});

// ─── generateSuggestions ────────────────────────────────────────────────────

describe('generateSuggestions', () => {
  it('returns empty for no reports', () => {
    expect(generateSuggestions([], [])).toEqual([]);
  });

  it('generates tsc warning for repeated failures', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', tscPassed: false }),
      makeReport({ sprintId: 'sprint-002', tscPassed: false }),
    ];
    const patterns: FailurePattern[] = [{
      category: 'tsc',
      description: 'tsc failed 2x',
      occurrences: 2,
      sprintIds: ['sprint-001', 'sprint-002'],
      severity: 'medium',
    }];
    const suggestions = generateSuggestions(reports, patterns);
    const tscSuggestion = suggestions.find(s => s.message.includes('tsc'));
    expect(tscSuggestion).toBeDefined();
    expect(tscSuggestion!.priority).toBe('high');
  });

  it('generates regression warning', () => {
    const reports = [makeReport()];
    const patterns: FailurePattern[] = [{
      category: 'regression',
      description: '5 regressions',
      occurrences: 5,
      sprintIds: ['sprint-001'],
      severity: 'high',
    }];
    const suggestions = generateSuggestions(reports, patterns);
    const regSuggestion = suggestions.find(s => s.message.includes('regression'));
    expect(regSuggestion).toBeDefined();
  });

  it('generates coverage decline warning from report trend', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 96.0 } }),
      makeReport({ sprintId: 'sprint-002', result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 93.0 } }),
    ];
    const suggestions = generateSuggestions(reports, []);
    const covSuggestion = suggestions.find(s => s.message.includes('Coverage dropped'));
    expect(covSuggestion).toBeDefined();
    expect(covSuggestion!.priority).toBe('high');
  });

  it('generates coverage improvement recommendation', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 90.0 } }),
      makeReport({ sprintId: 'sprint-002', result: { testCount: 120, testPassed: 120, testFailed: 0, coverage: 96.0 } }),
    ];
    const suggestions = generateSuggestions(reports, []);
    const goodSuggestion = suggestions.find(s => s.message.includes('keep up'));
    expect(goodSuggestion).toBeDefined();
    expect(goodSuggestion!.priority).toBe('low');
  });
});

// ─── generateConfigSuggestions ──────────────────────────────────────────────

describe('generateConfigSuggestions', () => {
  it('returns empty for no reports', () => {
    expect(generateConfigSuggestions([], [])).toEqual([]);
  });

  it('suggests block_on_test_fail for high regression rate', () => {
    const reports = [makeReport()];
    const patterns: FailurePattern[] = [{
      category: 'regression',
      description: '10 regressions',
      occurrences: 10,
      sprintIds: ['sprint-001'],
      severity: 'high',
    }];
    const suggestions = generateConfigSuggestions(reports, patterns);
    const blockSuggestion = suggestions.find(s => s.key === 'ci_guardian.block_on_test_fail');
    expect(blockSuggestion).toBeDefined();
    expect(blockSuggestion!.suggestedValue).toBe(true);
  });

  it('suggests min_coverage for coverage decline', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001', result: { testCount: 100, testPassed: 100, testFailed: 0, coverage: 92.0 } }),
    ];
    const patterns: FailurePattern[] = [{
      category: 'coverage',
      description: 'coverage dropped',
      occurrences: 2,
      sprintIds: ['sprint-001'],
      severity: 'medium',
    }];
    const suggestions = generateConfigSuggestions(reports, patterns);
    const covSuggestion = suggestions.find(s => s.key === 'ci_guardian.min_coverage');
    expect(covSuggestion).toBeDefined();
    expect(typeof covSuggestion!.suggestedValue).toBe('number');
    expect(covSuggestion!.suggestedValue as number).toBeLessThanOrEqual(92);
    expect(covSuggestion!.suggestedValue as number).toBeGreaterThanOrEqual(80);
  });

  it('suggests block_on_tsc_fail for repeated tsc failures', () => {
    const reports = [makeReport()];
    const patterns: FailurePattern[] = [{
      category: 'tsc',
      description: 'tsc failed 3x',
      occurrences: 3,
      sprintIds: ['sprint-001', 'sprint-002', 'sprint-003'],
      severity: 'high',
    }];
    const suggestions = generateConfigSuggestions(reports, patterns);
    const tscSuggestion = suggestions.find(s => s.key === 'ci_guardian.block_on_tsc_fail');
    expect(tscSuggestion).toBeDefined();
    expect(tscSuggestion!.suggestedValue).toBe(true);
  });

  it('keeps pre_sprint_check when all sprints green', () => {
    const reports = [
      makeReport({ sprintId: 'sprint-001' }),
      makeReport({ sprintId: 'sprint-002' }),
      makeReport({ sprintId: 'sprint-003' }),
    ];
    const suggestions = generateConfigSuggestions(reports, []);
    const preSuggestion = suggestions.find(s => s.key === 'ci_guardian.pre_sprint_check');
    expect(preSuggestion).toBeDefined();
    expect(preSuggestion!.suggestedValue).toBe(true);
  });
});

// ─── buildCiLearningLine / buildCiLearningsSection ──────────────────────────

describe('buildCiLearningLine', () => {
  it('builds a summary line for a clean sprint', () => {
    const report = makeReport({ sprintId: 'sprint-062', delta: { newTests: 85, regressions: 0, coverageDelta: 0.2 } });
    const line = buildCiLearningLine(report, []);
    expect(line).toContain('sprint-062');
    expect(line).toContain('85 new tests');
    expect(line).toContain('0 regressions');
    expect(line).toContain('+0.2%');
  });

  it('includes tsc failed indicator', () => {
    const report = makeReport({ sprintId: 'sprint-063', tscPassed: false, delta: { newTests: 0, regressions: 2, coverageDelta: -0.5 } });
    const line = buildCiLearningLine(report, []);
    expect(line).toContain('tsc failed');
    expect(line).toContain('2 regressions');
  });

  it('includes regression pattern when detected', () => {
    const report = makeReport({ sprintId: 'sprint-064' });
    const patterns: FailurePattern[] = [{
      category: 'regression',
      description: 'regressions found',
      occurrences: 3,
      sprintIds: ['sprint-064'],
      severity: 'medium',
    }];
    const line = buildCiLearningLine(report, patterns);
    expect(line).toContain('regression pattern detected');
  });
});

describe('buildCiLearningsSection', () => {
  it('returns empty string for no reports', () => {
    expect(buildCiLearningsSection([], [])).toBe('');
  });

  it('builds section with CI Learnings header', () => {
    const reports = [makeReport({ sprintId: 'sprint-062' })];
    const section = buildCiLearningsSection(reports, []);
    expect(section).toContain('## CI Learnings');
    expect(section).toContain('sprint-062');
  });
});

// ─── analyzeCiLearnings (full integration) ──────────────────────────────────

describe('analyzeCiLearnings', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns empty result when no reports exist', () => {
    const result = analyzeCiLearnings(tmpDir);
    expect(result.reports).toHaveLength(0);
    expect(result.patterns).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
    expect(result.summary).toContain('No CI reports found');
  });

  it('runs full analysis with reports', () => {
    writeCiReportFile(brainDir, makeReport({
      sprintId: 'sprint-060',
      tscPassed: false,
      delta: { newTests: 5, regressions: 2, coverageDelta: -1.0 },
    }));
    writeCiReportFile(brainDir, makeReport({
      sprintId: 'sprint-061',
      tscPassed: false,
      delta: { newTests: 10, regressions: 3, coverageDelta: -0.8 },
    }));

    const result = analyzeCiLearnings(tmpDir);
    expect(result.reports).toHaveLength(2);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.summary).toContain('Analyzed 2');
  });
});

// ─── writeCiLearnings ───────────────────────────────────────────────────────

describe('writeCiLearnings', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes ci-learnings.json to .brain/', () => {
    const result = analyzeCiLearnings(tmpDir);
    writeCiLearnings(tmpDir, result);
    const filePath = join(brainDir, 'ci-learnings.json');
    expect(existsSync(filePath)).toBe(true);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(data.analyzedAt).toBeDefined();
    expect(data.summary).toBeDefined();
  });
});

// ─── sprint-reporter integration ────────────────────────────────────────────

describe('runCiLearningAnalysis', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns null when no reports exist (graceful)', () => {
    const result = runCiLearningAnalysis(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.reports).toHaveLength(0);
  });

  it('analyzes and writes results', () => {
    writeCiReportFile(brainDir, makeReport({ sprintId: 'sprint-061' }));
    writeCiReportFile(brainDir, makeReport({ sprintId: 'sprint-062' }));

    const result = runCiLearningAnalysis(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.reports).toHaveLength(2);
    expect(existsSync(join(brainDir, 'ci-learnings.json'))).toBe(true);
  });
});

describe('appendCiLearningsToMemory', () => {
  let tmpDir: string;
  let brainDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    brainDir = join(tmpDir, '.brain');
    mkdirSync(brainDir, { recursive: true });
  });

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('does nothing when MEMORY.md does not exist', () => {
    const result = analyzeCiLearnings(tmpDir);
    expect(() => appendCiLearningsToMemory(tmpDir, result)).not.toThrow();
  });

  it('appends CI Learnings to MEMORY.md', () => {
    writeFileSync(join(brainDir, 'MEMORY.md'), '## Sprint 1 Learnings\n- Some learning\n', 'utf-8');
    writeCiReportFile(brainDir, makeReport({ sprintId: 'sprint-062' }));

    const result = analyzeCiLearnings(tmpDir);
    appendCiLearningsToMemory(tmpDir, result);

    const content = readFileSync(join(brainDir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('## CI Learnings');
    expect(content).toContain('sprint-062');
  });

  it('replaces existing CI Learnings section (idempotent)', () => {
    writeFileSync(
      join(brainDir, 'MEMORY.md'),
      '## Sprint 1 Learnings\n- Some learning\n## CI Learnings\n- Old data\n',
      'utf-8',
    );
    writeCiReportFile(brainDir, makeReport({ sprintId: 'sprint-063' }));

    const result = analyzeCiLearnings(tmpDir);
    appendCiLearningsToMemory(tmpDir, result);

    const content = readFileSync(join(brainDir, 'MEMORY.md'), 'utf-8');
    const occurrences = (content.match(/## CI Learnings/g) ?? []).length;
    expect(occurrences).toBe(1);
    expect(content).toContain('sprint-063');
    expect(content).not.toContain('Old data');
  });

  it('preserves sections after CI Learnings when replacing', () => {
    writeFileSync(
      join(brainDir, 'MEMORY.md'),
      '## Sprint 1 Learnings\n- learning\n## CI Learnings\n- old\n## Other Section\n- keep this\n',
      'utf-8',
    );
    writeCiReportFile(brainDir, makeReport({ sprintId: 'sprint-064' }));

    const result = analyzeCiLearnings(tmpDir);
    appendCiLearningsToMemory(tmpDir, result);

    const content = readFileSync(join(brainDir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('## Other Section');
    expect(content).toContain('keep this');
    expect(content).toContain('sprint-064');
  });
});
