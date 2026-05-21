import { describe, it, expect } from 'vitest';
import {
  GATES,
  checkPackSizeAndCount,
  checkEnginesNode,
  checkEntryPoints,
  checkNoInternalStateLeak,
  checkAdrLint,
  checkLinkLint,
  parsePackOutput,
  runReadinessGates,
} from '../../scripts/validate-publish.mjs';

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildPackOutput(opts: {
  files?: string[];
  packageSize?: string;
  fileCount?: number;
} = {}): string {
  const defaultCount = opts.fileCount ?? 5;
  const files =
    opts.files ?? Array.from({ length: defaultCount }, (_, i) => `dist/file-${i}.js`);
  const packageSize = opts.packageSize ?? '450 kB';
  const fileCount = opts.fileCount ?? files.length;
  const lines = ['npm notice', 'npm notice === Tarball Contents ==='];
  for (const f of files) {
    lines.push(`npm notice 1.2kB ${f}`);
  }
  lines.push('npm notice === Tarball Details ===');
  lines.push('npm notice name:         deckent');
  lines.push('npm notice version:      1.0.0-beta.1');
  lines.push(`npm notice package size: ${packageSize}`);
  lines.push('npm notice unpacked size: 8.4 MB');
  lines.push(`npm notice total files:  ${fileCount}`);
  return lines.join('\n');
}

// ─── GATES catalog ────────────────────────────────────────────────────────

describe('GATES catalog', () => {
  it('declares exactly 6 readiness gate ids', () => {
    expect(GATES).toEqual([
      'pack_size_and_count',
      'engines_node',
      'entry_points',
      'no_internal_state_leak',
      'adr_lint',
      'link_lint',
    ]);
  });
});

// ─── parsePackOutput ──────────────────────────────────────────────────────

describe('parsePackOutput', () => {
  it('extracts package size and file count from npm pack output', () => {
    const out = buildPackOutput({ packageSize: '512 kB', fileCount: 7 });
    const parsed = parsePackOutput(out);
    expect(parsed.packageSize).toBe('512 kB');
    expect(parsed.packageSizeBytes).toBe(Math.round(512 * 1024));
    expect(parsed.fileCount).toBeGreaterThanOrEqual(7);
    expect(parsed.files.length).toBeGreaterThanOrEqual(7);
  });
});

// ─── Gate 1: pack size + count ────────────────────────────────────────────

describe('checkPackSizeAndCount (Gate 1)', () => {
  it('passes when size <= 3 MB and file count within acceptable band', () => {
    const out = buildPackOutput({ packageSize: '450 kB', fileCount: 900 });
    const result = checkPackSizeAndCount(out);
    expect(result.gate).toBe('pack_size_and_count');
    expect(result.ok).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('passes when size is exactly at the 3 MB threshold', () => {
    const out = buildPackOutput({ packageSize: '2.9 MB', fileCount: 920 });
    const result = checkPackSizeAndCount(out);
    expect(result.ok).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('fails when package size exceeds 3 MB', () => {
    const out = buildPackOutput({ packageSize: '4.2 MB', fileCount: 900 });
    const result = checkPackSizeAndCount(out);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/exceeds|3\s*MB/i);
  });
});

// ─── Gate 2: engines.node >= 24 ───────────────────────────────────────────

describe('checkEnginesNode (Gate 2)', () => {
  it('passes when engines.node is >=24', () => {
    const result = checkEnginesNode({ engines: { node: '>=24.0.0' } });
    expect(result.gate).toBe('engines_node');
    expect(result.ok).toBe(true);
  });

  it('passes when engines.node is >=25', () => {
    const result = checkEnginesNode({ engines: { node: '>=25' } });
    expect(result.ok).toBe(true);
  });

  it('fails when engines.node is <24', () => {
    const result = checkEnginesNode({ engines: { node: '>=20.0.0' } });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });

  it('fails when engines field missing', () => {
    const result = checkEnginesNode({});
    expect(result.ok).toBe(false);
  });
});

// ─── Gate 3: main/types entry points exist ────────────────────────────────

describe('checkEntryPoints (Gate 3)', () => {
  it('passes when main and types are declared', () => {
    const result = checkEntryPoints({
      main: './dist/index.js',
      types: './dist/index.d.ts',
    });
    expect(result.gate).toBe('entry_points');
    expect(result.ok).toBe(true);
  });

  it('fails when main is missing', () => {
    const result = checkEntryPoints({ types: './dist/index.d.ts' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/main/i);
  });

  it('fails when types is missing', () => {
    const result = checkEntryPoints({ main: './dist/index.js' });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/types/i);
  });
});

// ─── Gate 4: no internal state leak ───────────────────────────────────────

describe('checkNoInternalStateLeak (Gate 4)', () => {
  it('passes when no internal state directories are present', () => {
    const out = buildPackOutput({
      files: ['dist/index.js', 'dist/cli/entry.js', 'README.md', 'LICENSE', 'package.json'],
    });
    const result = checkNoInternalStateLeak(out);
    expect(result.gate).toBe('no_internal_state_leak');
    expect(result.ok).toBe(true);
  });

  it('fails when .deckent/ leaks', () => {
    const out = buildPackOutput({
      files: ['dist/index.js', '.deckent/config.json', 'README.md', 'LICENSE', 'package.json'],
    });
    const result = checkNoInternalStateLeak(out);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/\.deckent/);
  });

  it('fails when .brain/ leaks', () => {
    const out = buildPackOutput({
      files: ['dist/index.js', '.brain/memory.db', 'README.md', 'LICENSE', 'package.json'],
    });
    const result = checkNoInternalStateLeak(out);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/\.brain/);
  });
});

// ─── Gate 5: ADR validation ───────────────────────────────────────────────

describe('checkAdrLint (Gate 5)', () => {
  it('passes when adr command exits 0', () => {
    const result = checkAdrLint({ exitCode: 0, stdout: 'All ADRs valid' });
    expect(result.gate).toBe('adr_lint');
    expect(result.ok).toBe(true);
  });

  it('fails when adr command exits non-zero', () => {
    const result = checkAdrLint({ exitCode: 1, stdout: 'ADR-XX malformed' });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });
});

// ─── Gate 6: lint:link ────────────────────────────────────────────────────

describe('checkLinkLint (Gate 6)', () => {
  it('passes when lint:link exits 0', () => {
    const result = checkLinkLint({ exitCode: 0, stdout: 'no broken links' });
    expect(result.gate).toBe('link_lint');
    expect(result.ok).toBe(true);
  });

  it('fails when lint:link exits non-zero', () => {
    const result = checkLinkLint({ exitCode: 1, stdout: 'broken: foo.md' });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });
});

// ─── Aggregator: runReadinessGates ────────────────────────────────────────

describe('runReadinessGates aggregator', () => {
  it('runs all 6 gates and reports summary with mocked inputs', () => {
    const packOutput = buildPackOutput({ packageSize: '450 kB', fileCount: 900 });
    const result = runReadinessGates({
      packOutput,
      pkg: {
        engines: { node: '>=24.0.0' },
        main: './dist/index.js',
        types: './dist/index.d.ts',
      },
      adrResult: { exitCode: 0, stdout: '' },
      linkResult: { exitCode: 0, stdout: '' },
    });
    expect(result.checks).toHaveLength(6);
    expect(result.checks.every(c => c.ok)).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.summary.passed).toBe(6);
    expect(result.summary.failed).toBe(0);
  });

  it('reports failed gates when any fail', () => {
    const packOutput = buildPackOutput({
      packageSize: '5 MB',
      fileCount: 900,
      files: ['dist/index.js', '.deckent/leak.json', 'README.md', 'LICENSE', 'package.json'],
    });
    const result = runReadinessGates({
      packOutput,
      pkg: {
        engines: { node: '>=18.0.0' },
        main: './dist/index.js',
      },
      adrResult: { exitCode: 1, stdout: 'fail' },
      linkResult: { exitCode: 1, stdout: 'fail' },
    });
    expect(result.ok).toBe(false);
    expect(result.summary.failed).toBeGreaterThanOrEqual(5);
  });
});
