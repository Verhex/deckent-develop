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

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  GATES,
  BIN_FILES,
  parseSizeToBytes,
  extractMinNodeMajor,
  parsePackOutput,
  checkPackSizeAndCount,
  checkEnginesNode,
  checkEntryPoints,
  checkNoInternalStateLeak,
  checkAdrLint,
  checkLinkLint,
  checkBinExecBits,
  checkDashboardBundle,
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
  it('GATES is a non-empty array of strings with 8 entries', () => {
    expect(Array.isArray(GATES)).toBe(true);
    expect(GATES.length).toBe(8);
    expect(GATES.every((g: unknown) => typeof g === 'string')).toBe(true);
  });

  it('BIN_FILES is a non-empty array of strings', () => {
    expect(Array.isArray(BIN_FILES)).toBe(true);
    expect(BIN_FILES.length).toBeGreaterThan(0);
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

  it('checkBinExecBits is a function', () => {
    expect(typeof checkBinExecBits).toBe('function');
  });

  it('checkDashboardBundle is a function', () => {
    expect(typeof checkDashboardBundle).toBe('function');
  });

  it('runReadinessGates is a function', () => {
    expect(typeof runReadinessGates).toBe('function');
  });
});

// ─── checkPackSizeAndCount: threshold boundary ────────────────────────────

describe('checkPackSizeAndCount — 5 MB threshold (Sprint 271 re-calibration)', () => {
  // Sprint 271 raised the threshold from 3 MB → 5 MB because the full build
  // includes the Vite dashboard bundle (~3 MB, incl. public image assets).
  // These tests document the intentional boundary and protect against regression.

  const makeOutput = (size: string, files = 920) =>
    [
      'npm notice === Tarball Contents ===',
      'npm notice 1kB dist/index.js',
      'npm notice === Tarball Details ===',
      `npm notice package size: ${size}`,
      `npm notice total files: ${files}`,
    ].join('\n');

  it('passes at 4.8 MB (full build with dashboard — Sprint 270 measured)', () => {
    const result = checkPackSizeAndCount(makeOutput('4.8 MB'));
    expect(result.gate).toBe('pack_size_and_count');
    expect(result.ok).toBe(true);
  });

  it('passes at 5.0 MB (exact ceiling)', () => {
    const result = checkPackSizeAndCount(makeOutput('5 MB'));
    // parseSizeToBytes('5 MB') = 5 * 1024 * 1024 = 5242880, MAX = 5242880
    expect(result.ok).toBe(true);
  });

  it('fails at 5.1 MB (just over ceiling)', () => {
    const result = checkPackSizeAndCount(makeOutput('5.1 MB'));
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/5 MB limit/i);
  });

  it('passes at 1.8 MB (base dist without dashboard build)', () => {
    const result = checkPackSizeAndCount(makeOutput('1.8 MB'));
    expect(result.ok).toBe(true);
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

  it('returns exactly 8 checks (including bin_exec_bits and dashboard_bundle)', () => {
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

    expect(result.checks).toHaveLength(8);
  });
});

// ─── checkBinExecBits ─────────────────────────────────────────────────────

describe('checkBinExecBits', () => {
  let tmpRoot = '';

  afterEach(() => {
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = '';
    }
  });

  function makeTmpRoot(): string {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-test-bin-'));
    return tmpRoot;
  }

  it('passes when all bin files exist and are executable', () => {
    const root = makeTmpRoot();
    for (const rel of BIN_FILES) {
      const p = join(root, rel);
      mkdirSync(join(root, rel.replace(/\/[^/]+$/, '')), { recursive: true });
      writeFileSync(p, '#!/usr/bin/env node\n');
      chmodSync(p, 0o755);
    }
    const result = checkBinExecBits(root);
    expect(result.gate).toBe('bin_exec_bits');
    expect(result.ok).toBe(true);
  });

  it('fails when bin files are missing', () => {
    const root = makeTmpRoot();
    const result = checkBinExecBits(root);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/npm run build:all/);
    expect(result.message).toMatch(/missing/i);
  });

  it('fails when bin files exist but have no execute bit (mode 644)', () => {
    const root = makeTmpRoot();
    for (const rel of BIN_FILES) {
      const p = join(root, rel);
      mkdirSync(join(root, rel.replace(/\/[^/]+$/, '')), { recursive: true });
      writeFileSync(p, '#!/usr/bin/env node\n');
      chmodSync(p, 0o644); // rw-r--r-- — no exec bit
    }
    const result = checkBinExecBits(root);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/execute bit/i);
    expect(result.message).toMatch(/npm run build:all/);
  });

  it('fails with actionable message listing missing file path', () => {
    const root = makeTmpRoot();
    // create only the first bin file
    const rel = BIN_FILES[0]!;
    mkdirSync(join(root, rel.replace(/\/[^/]+$/, '')), { recursive: true });
    writeFileSync(join(root, rel), '');
    chmodSync(join(root, rel), 0o755);
    const result = checkBinExecBits(root);
    expect(result.ok).toBe(false);
    // the second bin file should be mentioned
    expect(result.message).toContain(BIN_FILES[1]);
  });
});

// ─── checkDashboardBundle ─────────────────────────────────────────────────

describe('checkDashboardBundle', () => {
  let tmpRoot = '';

  afterEach(() => {
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = '';
    }
  });

  function makeTmpRoot(): string {
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-test-dash-'));
    return tmpRoot;
  }

  function makeFullDashboard(root: string): void {
    const assetsDir = join(root, 'dist', 'dashboard', 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(root, 'dist', 'dashboard', 'index.html'), '<html></html>');
    writeFileSync(join(assetsDir, 'index-abc123.js'), 'console.log(1)');
  }

  it('passes when index.html and assets bundle are present', () => {
    const root = makeTmpRoot();
    makeFullDashboard(root);
    const result = checkDashboardBundle(root);
    expect(result.gate).toBe('dashboard_bundle');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('index-abc123.js');
  });

  it('fails when index.html is missing', () => {
    const root = makeTmpRoot();
    const result = checkDashboardBundle(root);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toContain('index.html');
    expect(result.message).toMatch(/npm run build:all/);
  });

  it('fails when index.html exists but no js bundle in assets/', () => {
    const root = makeTmpRoot();
    const dashDir = join(root, 'dist', 'dashboard');
    mkdirSync(join(dashDir, 'assets'), { recursive: true });
    writeFileSync(join(dashDir, 'index.html'), '<html></html>');
    // no js file in assets
    const result = checkDashboardBundle(root);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/index-\*\.js/);
    expect(result.message).toMatch(/npm run build:all/);
  });

  it('fails when assets/ directory is missing entirely', () => {
    const root = makeTmpRoot();
    const dashDir = join(root, 'dist', 'dashboard');
    mkdirSync(dashDir, { recursive: true });
    writeFileSync(join(dashDir, 'index.html'), '<html></html>');
    // no assets dir
    const result = checkDashboardBundle(root);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/npm run build:all/);
  });

  it('ignores non-index js files (css, other bundles)', () => {
    const root = makeTmpRoot();
    const assetsDir = join(root, 'dist', 'dashboard', 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(root, 'dist', 'dashboard', 'index.html'), '<html></html>');
    // only a CSS file present — no matching index-*.js
    writeFileSync(join(assetsDir, 'index-abc123.css'), '.app{}');
    const result = checkDashboardBundle(root);
    expect(result.ok).toBe(false);
  });
});
