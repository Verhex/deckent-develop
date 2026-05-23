/**
 * tests/scripts/validate-publish.test.ts
 *
 * Sprint 189 Task 14: Updated to import from validate-publish.mjs (Sprint 180
 * active version). The obsolete validate-publish.ts (Sprint 149) is archived to
 * scripts/archive/validate-publish.ts.bak.
 *
 * Coverage focus: helper utilities NOT covered by validate-publish-readiness.test.ts
 *   - parseSizeToBytes
 *   - extractMinNodeMajor
 * Plus a smoke-pass for the main exports to confirm the wiring is correct.
 */

import { describe, it, expect } from 'vitest';
import {
  GATES,
  parseSizeToBytes,
  extractMinNodeMajor,
  parsePackOutput,
  checkPackSizeAndCount,
  checkEnginesNode,
  checkEntryPoints,
  checkNoInternalStateLeak,
  checkAdrLint,
  checkLinkLint,
  runReadinessGates,
} from '../../scripts/validate-publish.mjs';

// ─── parseSizeToBytes ─────────────────────────────────────────────────────

describe('parseSizeToBytes', () => {
  it('converts kB correctly', () => {
    expect(parseSizeToBytes('450 kB')).toBe(Math.round(450 * 1024));
  });

  it('converts MB correctly', () => {
    expect(parseSizeToBytes('1.5 MB')).toBe(Math.round(1.5 * 1024 * 1024));
  });

  it('converts bytes', () => {
    expect(parseSizeToBytes('512 B')).toBe(512);
  });

  it('converts GB correctly', () => {
    expect(parseSizeToBytes('1 GB')).toBe(1024 * 1024 * 1024);
  });

  it('returns 0 for empty string', () => {
    expect(parseSizeToBytes('')).toBe(0);
  });

  it('returns 0 for unrecognised format', () => {
    expect(parseSizeToBytes('unknown')).toBe(0);
  });

  it('handles uppercase KB alias', () => {
    expect(parseSizeToBytes('100 KB')).toBe(Math.round(100 * 1024));
  });

  it('parses fractional MB', () => {
    const result = parseSizeToBytes('2.7 MB');
    expect(result).toBe(Math.round(2.7 * 1024 * 1024));
  });
});

// ─── extractMinNodeMajor ──────────────────────────────────────────────────

describe('extractMinNodeMajor', () => {
  it('extracts major from >=24.0.0', () => {
    expect(extractMinNodeMajor('>=24.0.0')).toBe(24);
  });

  it('extracts major from >=18', () => {
    expect(extractMinNodeMajor('>=18')).toBe(18);
  });

  it('extracts major from 24.x', () => {
    expect(extractMinNodeMajor('24.x')).toBe(24);
  });

  it('extracts major from ^24.0.0', () => {
    expect(extractMinNodeMajor('^24.0.0')).toBe(24);
  });

  it('returns null for undefined', () => {
    expect(extractMinNodeMajor(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractMinNodeMajor('')).toBeNull();
  });

  it('handles plain integer string', () => {
    expect(extractMinNodeMajor('20')).toBe(20);
  });
});

// ─── Smoke: all exports accessible ───────────────────────────────────────

describe('validate-publish.mjs exports smoke', () => {
  it('GATES is a non-empty array of strings', () => {
    expect(Array.isArray(GATES)).toBe(true);
    expect(GATES.length).toBeGreaterThan(0);
    expect(GATES.every((g: unknown) => typeof g === 'string')).toBe(true);
  });

  it('parsePackOutput is a function', () => {
    expect(typeof parsePackOutput).toBe('function');
  });

  it('parseSizeToBytes is a function', () => {
    expect(typeof parseSizeToBytes).toBe('function');
  });

  it('checkPackSizeAndCount is a function', () => {
    expect(typeof checkPackSizeAndCount).toBe('function');
  });

  it('checkEnginesNode is a function', () => {
    expect(typeof checkEnginesNode).toBe('function');
  });

  it('checkEntryPoints is a function', () => {
    expect(typeof checkEntryPoints).toBe('function');
  });

  it('checkNoInternalStateLeak is a function', () => {
    expect(typeof checkNoInternalStateLeak).toBe('function');
  });

  it('checkAdrLint is a function', () => {
    expect(typeof checkAdrLint).toBe('function');
  });

  it('checkLinkLint is a function', () => {
    expect(typeof checkLinkLint).toBe('function');
  });

  it('runReadinessGates is a function', () => {
    expect(typeof runReadinessGates).toBe('function');
  });
});

// ─── Gate result shape ────────────────────────────────────────────────────

describe('gate result shape', () => {
  it('checkEnginesNode returns correct gate name', () => {
    const result = checkEnginesNode({ engines: { node: '>=24' } });
    expect(result).toHaveProperty('gate', 'engines_node');
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('message');
  });

  it('checkEntryPoints returns correct gate name and passes', () => {
    const result = checkEntryPoints({ main: './dist/index.js', types: './dist/index.d.ts' });
    expect(result).toHaveProperty('gate', 'entry_points');
    expect(result.ok).toBe(true);
  });

  it('checkAdrLint returns correct gate name', () => {
    const result = checkAdrLint({ exitCode: 0, stdout: '' });
    expect(result).toHaveProperty('gate', 'adr_lint');
  });

  it('checkLinkLint returns correct gate name', () => {
    const result = checkLinkLint({ exitCode: 0, stdout: '' });
    expect(result).toHaveProperty('gate', 'link_lint');
  });
});

// ─── runReadinessGates aggregator (edge cases) ────────────────────────────

describe('runReadinessGates — edge cases', () => {
  it('returns ok=false when engines.node < 24', () => {
    const packOutput = [
      'npm notice === Tarball Contents ===',
      'npm notice 1kB dist/index.js',
      'npm notice === Tarball Details ===',
      'npm notice package size: 450 kB',
      'npm notice total files: 900',
    ].join('\n');

    const result = runReadinessGates({
      packOutput,
      pkg: { engines: { node: '>=16.0.0' }, main: './dist/index.js', types: './dist/index.d.ts' },
      adrResult: { exitCode: 0, stdout: '' },
      linkResult: { exitCode: 0, stdout: '' },
    });
    expect(result.ok).toBe(false);
    const engineCheck = result.checks.find((c: { gate: string }) => c.gate === 'engines_node');
    expect(engineCheck?.ok).toBe(false);
  });

  it('summary fields are all numbers', () => {
    const packOutput = [
      'npm notice === Tarball Contents ===',
      'npm notice 1kB dist/index.js',
      'npm notice === Tarball Details ===',
      'npm notice package size: 450 kB',
      'npm notice total files: 900',
    ].join('\n');

    const result = runReadinessGates({
      packOutput,
      pkg: { engines: { node: '>=24.0.0' }, main: './dist/index.js', types: './dist/index.d.ts' },
      adrResult: { exitCode: 0, stdout: '' },
      linkResult: { exitCode: 0, stdout: '' },
    });

    expect(typeof result.summary.passed).toBe('number');
    expect(typeof result.summary.failed).toBe('number');
    expect(typeof result.summary.warnings).toBe('number');
    expect(result.summary.passed).toBeGreaterThan(0);
  });

  it('returns exactly 6 checks', () => {
    const packOutput = [
      'npm notice === Tarball Contents ===',
      'npm notice 1kB dist/index.js',
      'npm notice === Tarball Details ===',
      'npm notice package size: 450 kB',
      'npm notice total files: 900',
    ].join('\n');

    const result = runReadinessGates({
      packOutput,
      pkg: { engines: { node: '>=24.0.0' }, main: './dist/index.js', types: './dist/index.d.ts' },
      adrResult: { exitCode: 0, stdout: '' },
      linkResult: { exitCode: 0, stdout: '' },
    });

    expect(result.checks).toHaveLength(6);
  });
});
