import { describe, it, expect } from 'vitest';
import {
  parseWorkerMemoryGB,
  computeRamExperiment,
  formatRamExperiment,
} from '../../src/cli/commands/doctor.js';

describe('parseWorkerMemoryGB', () => {
  it('parses "2g" as 2 GB', () => {
    expect(parseWorkerMemoryGB('2g')).toBe(2);
  });

  it('parses "3g" as 3 GB', () => {
    expect(parseWorkerMemoryGB('3g')).toBe(3);
  });

  it('parses "512m" as ~0.5 GB', () => {
    expect(parseWorkerMemoryGB('512m')).toBeCloseTo(0.5, 2);
  });

  it('returns 2 for undefined (default)', () => {
    expect(parseWorkerMemoryGB(undefined)).toBe(2);
  });

  it('returns 2 for invalid string', () => {
    expect(parseWorkerMemoryGB('invalid')).toBe(2);
  });

  it('parses "1gb" case-insensitively', () => {
    expect(parseWorkerMemoryGB('1GB')).toBe(1);
  });
});

describe('computeRamExperiment — Safe verdict', () => {
  it('host 24GB + 6 workers × 2g → Safe (requires 14 GB)', () => {
    const report = computeRamExperiment(24, 'meminfo', 6, 2);
    expect(report.verdict).toBe('Safe');
    expect(report.peakWorkerGB).toBe(12);
    expect(report.totalRequiredGB).toBe(14);
    expect(report.recommendation).toContain('safe');
  });

  it('host exactly meets requirement → Safe', () => {
    // 6 workers × 2g = 12 + 2 overhead = 14 GB
    const report = computeRamExperiment(14, 'os.totalmem', 6, 2);
    expect(report.verdict).toBe('Safe');
  });
});

describe('computeRamExperiment — Risky verdict', () => {
  it('host 12GB + 6 workers × 2g → Risky (requires 14 GB)', () => {
    const report = computeRamExperiment(12, 'meminfo', 6, 2);
    expect(report.verdict).toBe('Risky');
    expect(report.recommendation).toContain('OOM risk');
    expect(report.recommendation).toContain('wslconfig');
  });

  it('host 8GB + 6 workers × 2g → Risky', () => {
    const report = computeRamExperiment(8, 'meminfo', 6, 2);
    expect(report.verdict).toBe('Risky');
    expect(report.totalRequiredGB).toBe(14);
  });
});

describe('computeRamExperiment — Cannot determine', () => {
  it('host 0 GB (detect failure) → Cannot determine', () => {
    const report = computeRamExperiment(0, 'os.totalmem', 6, 2);
    expect(report.verdict).toBe('Cannot determine');
    expect(report.recommendation).toContain('Cannot determine');
  });
});

describe('computeRamExperiment — report fields', () => {
  it('returns all required fields', () => {
    const report = computeRamExperiment(24, 'meminfo', 6, 2);
    expect(report.hostGB).toBe(24);
    expect(report.source).toBe('meminfo');
    expect(report.maxWorkers).toBe(6);
    expect(report.workerMemGB).toBe(2);
    expect(report.hostOverheadGB).toBe(2);
    expect(typeof report.recommendation).toBe('string');
  });

  it('2-worker × 3g scenario peak = 6 + 2 = 8 GB', () => {
    const report = computeRamExperiment(16, 'meminfo', 2, 3);
    expect(report.peakWorkerGB).toBe(6);
    expect(report.totalRequiredGB).toBe(8);
    expect(report.verdict).toBe('Safe');
  });
});

describe('formatRamExperiment', () => {
  it('Safe report contains ✓ and Safe', () => {
    const report = computeRamExperiment(24, 'meminfo', 6, 2);
    const output = formatRamExperiment(report);
    expect(output).toContain('✓');
    expect(output).toContain('Safe');
    expect(output).toContain('Host RAM: 24 GB');
    expect(output).toContain('max_workers=6');
  });

  it('Risky report contains ⚠ and Risky', () => {
    const report = computeRamExperiment(12, 'meminfo', 6, 2);
    const output = formatRamExperiment(report);
    expect(output).toContain('⚠');
    expect(output).toContain('Risky');
    expect(output).toContain('OOM risk');
  });

  it('Cannot determine report contains ? symbol', () => {
    const report = computeRamExperiment(0, 'os.totalmem', 6, 2);
    const output = formatRamExperiment(report);
    expect(output).toContain('?');
    expect(output).toContain('Cannot determine');
  });
});
