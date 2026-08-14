/**
 * tests/docs/validate-publish.test.ts
 *
 * born-461 (Sprint 397 fix): this file was ORPHANED — it imported
 * `../../scripts/validate-publish.js` and functions (validatePackContents,
 * validatePackageJson, validateCliVersion, validateCliHelp, validateDoctorOutput,
 * SENSITIVE_PATTERNS, REQUIRED_PATTERNS) that the current
 * `scripts/validate-publish.mjs` (the Sprint 180 GATES-API) never exported, so the
 * whole file failed to load. Rewritten against the real GATES-API.
 *
 * Angle (kept distinct from tests/scripts/validate-publish.test.ts, which drills the
 * parseSizeToBytes / extractMinNodeMajor / threshold-boundary / bin+dashboard-happy
 * paths): this file covers the publish-readiness gates from the pack-contents +
 * package.json + internal-state-leak perspective the orphaned file used to own.
 *
 * Hermetic (ADR-D-002 C2): pure gates run on SYNTHETIC npm-pack strings and synthetic
 * pkg objects — never the real tarball. Filesystem gates (checkBinExecBits /
 * checkDashboardBundle) are exercised only through their missing-input branch against a
 * throwaway nonexistent path, so nothing here depends on a built dist/ tree.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  GATES,
  parsePackOutput,
  checkNoInternalStateLeak,
  checkEntryPoints,
  checkEnginesNode,
  checkPackSizeAndCount,
  checkBinExecBits,
  checkDashboardBundle,
  runReadinessGates,
  // @ts-expect-error — .mjs script lacks a .d.ts; import works at runtime via vitest's esm loader
} from '../../scripts/validate-publish.mjs';

// A well-formed `npm pack --dry-run` sample (npm 11.x bare-title form) with no leaks.
const CLEAN_PACK = [
  'npm notice',
  'npm notice 📦  deckent@1.0.0-beta.1',
  'npm notice Tarball Contents',
  'npm notice 1.1kB LICENSE',
  'npm notice 14.4kB README.md',
  'npm notice 1.7kB package.json',
  'npm notice 24.5kB dist/api/server.js',
  'npm notice 3.2kB dist/cli/entry.js',
  'npm notice Tarball Details',
  'npm notice package size: 2.7 MB',
  'npm notice total files: 900',
].join('\n');

// ─── parsePackOutput ──────────────────────────────────────────────────────

describe('parsePackOutput', () => {
  it('extracts files, package size, and file count from tarball output', () => {
    const parsed = parsePackOutput(CLEAN_PACK);
    expect(parsed.files).toContain('dist/api/server.js');
    expect(parsed.files).toContain('README.md');
    expect(parsed.fileCount).toBe(900);
    expect(parsed.packageSizeBytes).toBe(Math.round(2.7 * 1024 * 1024));
  });

  it('does not capture the Tarball Details metadata lines as files', () => {
    const parsed = parsePackOutput(CLEAN_PACK);
    // "package size: 2.7 MB" contains a colon and lives past the Details header —
    // it must never be mistaken for a packed file path.
    expect(parsed.files.some((f: string) => f.includes('package size'))).toBe(false);
  });
});

// ─── checkNoInternalStateLeak (was: validatePackContents sensitive-file guard) ─────

describe('checkNoInternalStateLeak', () => {
  it('passes when no internal-state directories are in the tarball', () => {
    const result = checkNoInternalStateLeak(CLEAN_PACK);
    expect(result.gate).toBe('no_internal_state_leak');
    expect(result.ok).toBe(true);
  });

  // parsePackOutput only records files listed BETWEEN the "Tarball Contents" and
  // "Tarball Details" headers, so a leak must be injected into the Contents section
  // (before Details) — appending past the Details header would be silently ignored.
  const injectContents = (line: string) =>
    CLEAN_PACK.replace('npm notice Tarball Details', `${line}\nnpm notice Tarball Details`);

  it('flags a leaked .brain/ path', () => {
    const dirty = injectContents('npm notice 1.0kB .brain/MEMORY.md');
    const result = checkNoInternalStateLeak(dirty);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toContain('.brain/');
  });

  it('flags leaked .deckent/, .tasks/, and .locks/ internal state', () => {
    const dirty = injectContents(
      'npm notice 0.5kB .deckent/config.json\n' +
        'npm notice 0.3kB .tasks/task-1.json\n' +
        'npm notice 0.2kB .locks/foo.lock',
    );
    const result = checkNoInternalStateLeak(dirty);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('.deckent/');
    expect(result.message).toContain('.tasks/');
    expect(result.message).toContain('.locks/');
  });
});

// ─── checkEntryPoints (was: validatePackageJson main/types checks) ─────────

describe('checkEntryPoints', () => {
  it('passes when both main and types are declared', () => {
    const result = checkEntryPoints({ main: './dist/index.js', types: './dist/index.d.ts' });
    expect(result.gate).toBe('entry_points');
    expect(result.ok).toBe(true);
  });

  it('fails and names the missing field when types is absent', () => {
    const result = checkEntryPoints({ main: './dist/index.js' });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toContain('types');
  });

  it('fails when both entry-point fields are absent', () => {
    const result = checkEntryPoints({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('main');
    expect(result.message).toContain('types');
  });
});

// ─── checkEnginesNode ──────────────────────────────────────────────────────

describe('checkEnginesNode', () => {
  it('passes for engines.node >=24', () => {
    expect(checkEnginesNode({ engines: { node: '>=24.0.0' } }).ok).toBe(true);
  });

  it('fails for engines.node that allows <24', () => {
    const result = checkEnginesNode({ engines: { node: '>=18.0.0' } });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });

  it('fails when engines.node is missing entirely', () => {
    const result = checkEnginesNode({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('missing');
  });
});

// ─── checkPackSizeAndCount ─────────────────────────────────────────────────

describe('checkPackSizeAndCount', () => {
  it('passes for a sane package size under the 6 MB ceiling', () => {
    const result = checkPackSizeAndCount(CLEAN_PACK);
    expect(result.gate).toBe('pack_size_and_count');
    expect(result.ok).toBe(true);
  });

  it('fails when the package size exceeds the 6 MB ceiling', () => {
    const oversized = CLEAN_PACK.replace('package size: 2.7 MB', 'package size: 9.9 MB');
    const result = checkPackSizeAndCount(oversized);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/6 MB limit/i);
  });

  it('errors when the package size cannot be parsed', () => {
    const noSize = CLEAN_PACK.replace('package size: 2.7 MB', 'package size: n/a');
    const result = checkPackSizeAndCount(noSize);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });
});

// ─── runReadinessGates aggregator + GATES catalog ──────────────────────────

describe('runReadinessGates', () => {
  it('GATES lists exactly the 8 readiness gates', () => {
    expect(Array.isArray(GATES)).toBe(true);
    expect(GATES).toHaveLength(8);
    expect(GATES).toContain('no_internal_state_leak');
    expect(GATES).toContain('engines_node');
  });

  it('aggregates all 8 gate checks and reports a numeric summary', () => {
    const result = runReadinessGates({
      packOutput: CLEAN_PACK,
      pkg: { engines: { node: '>=24.0.0' }, main: './dist/index.js', types: './dist/index.d.ts' },
      adrResult: { exitCode: 0, stdout: '' },
      linkResult: { exitCode: 0, stdout: '' },
      // projectRoot left default → the on-disk bin/dashboard gates may fail in a
      // clean checkout; we only assert on the aggregate shape here, not ok===true.
    });
    expect(result.checks).toHaveLength(8);
    expect(typeof result.summary.passed).toBe('number');
    expect(typeof result.summary.failed).toBe('number');
    expect(typeof result.summary.warnings).toBe('number');
  });

  it('reports not-ok when engines.node is below 24', () => {
    const result = runReadinessGates({
      packOutput: CLEAN_PACK,
      pkg: { engines: { node: '>=16.0.0' }, main: './dist/index.js', types: './dist/index.d.ts' },
      adrResult: { exitCode: 0, stdout: '' },
      linkResult: { exitCode: 0, stdout: '' },
    });
    expect(result.ok).toBe(false);
    const engines = result.checks.find((c: { gate: string }) => c.gate === 'engines_node');
    expect(engines?.ok).toBe(false);
  });
});

// ─── filesystem gates — missing-input branch only (hermetic) ───────────────

describe('filesystem gates against a nonexistent root', () => {
  const ABSENT_ROOT = join(tmpdir(), 'deckent-validate-publish-absent-does-not-exist');

  it('checkBinExecBits reports missing bin files (never throws)', () => {
    const result = checkBinExecBits(ABSENT_ROOT);
    expect(result.gate).toBe('bin_exec_bits');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/npm run build:all/);
  });

  it('checkDashboardBundle reports a missing bundle (never throws)', () => {
    const result = checkDashboardBundle(ABSENT_ROOT);
    expect(result.gate).toBe('dashboard_bundle');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/npm run build:all/);
  });
});
