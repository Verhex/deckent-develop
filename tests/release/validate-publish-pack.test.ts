/**
 * tests/release/validate-publish-pack.test.ts — Sprint 413 task 413-002 (RC3A).
 *
 * PUB-01: `npm pack --dry-run` TEXT parsing is fragile across npm versions /
 * non-TTY environments — the live CLI path now uses `--json` + async spawn instead
 * (parsePackJson). PUB-02: the absolute file-count pin (920±800) is retired in favor
 * of a categorical baseline-delta ratchet (checkPackCategoryBaseline). PKG-05:
 * `lint:builtins-drift` is wired into the readiness report (checkBuiltinsDrift).
 *
 * Hermetic — every fixture here is a synthetic string/object. No real `npm pack`
 * invocation (slow; the real run is exercised by the `validate:publish` Smoke step,
 * not by this suite), matching the project's test-hermeticity rule.
 */

import { describe, it, expect } from 'vitest';
import {
  parsePackJson,
  formatBytes,
  normalizeParsed,
  checkPackSizeAndCount,
  classifyPackEntry,
  categoryKeyForPath,
  buildCategoryInventory,
  checkPackCategoryBaseline,
  checkBuiltinsDrift,
} from '../../scripts/validate-publish.mjs';

// ─── Fixture builders ───────────────────────────────────────────────────────

interface JsonPackFile {
  path: string;
  size: number;
}

function buildPackJson(opts: { files?: JsonPackFile[]; size?: number; entryCount?: number; name?: string } = {}): string {
  const files = opts.files ?? [
    { path: 'dist/index.js', size: 1200 },
    { path: 'dist/index.d.ts', size: 300 },
  ];
  const size = opts.size ?? 450 * 1024;
  const entryCount = opts.entryCount ?? files.length;
  return JSON.stringify([
    {
      id: 'sha512-fake',
      name: opts.name ?? 'deckent',
      version: '1.0.0-beta.1',
      size,
      unpackedSize: size * 3,
      files,
      entryCount,
      bundled: [],
    },
  ]);
}

// ─── parsePackJson ──────────────────────────────────────────────────────────

describe('parsePackJson', () => {
  it('extracts files, fileSizes, packageSizeBytes, and fileCount from a real-shaped npm pack --json fixture', () => {
    const out = buildPackJson({
      files: [
        { path: 'dist/index.js', size: 4000 },
        { path: 'dist/index.d.ts', size: 1000 },
        { path: 'assets/Dockerfile.worker', size: 2466 },
      ],
      size: 2_700_000,
      entryCount: 3,
    });
    const parsed = parsePackJson(out);
    expect(parsed.files).toEqual(['dist/index.js', 'dist/index.d.ts', 'assets/Dockerfile.worker']);
    expect(parsed.fileSizes).toEqual([
      { path: 'dist/index.js', bytes: 4000 },
      { path: 'dist/index.d.ts', bytes: 1000 },
      { path: 'assets/Dockerfile.worker', bytes: 2466 },
    ]);
    expect(parsed.packageSizeBytes).toBe(2_700_000);
    expect(parsed.fileCount).toBe(3);
    expect(parsed.packageName).toBe('deckent');
  });

  // PUB-01 regression lock: npm 11.x / non-TTY environments can produce empty or
  // malformed stdout. The parser must FAIL honestly downstream, never silently pass.
  describe('empty/malformed output — honest-FAIL (PUB-01 regression lock)', () => {
    it('returns a zeroed shape for an empty string', () => {
      const parsed = parsePackJson('');
      expect(parsed.files).toEqual([]);
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
      expect(parsed.fileCount).toBe(0);
    });

    it('returns a zeroed shape for non-JSON garbage stdout', () => {
      const parsed = parsePackJson('npm WARN using --force\nSomething went wrong\n');
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
    });

    it('returns a zeroed shape when the JSON has no files[] array', () => {
      const parsed = parsePackJson(JSON.stringify([{ name: 'deckent', size: 1000 }]));
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
    });

    it('returns a zeroed shape for an empty JSON array', () => {
      const parsed = parsePackJson('[]');
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
    });

    it('checkPackSizeAndCount FAILs (not a silent pass) on the resulting zeroed shape', () => {
      const parsed = parsePackJson('');
      const result = checkPackSizeAndCount(parsed);
      expect(result.ok).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.message).toMatch(/could not determine package size/i);
    });
  });
});

// ─── formatBytes ────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats MB, kB, and B ranges', () => {
    expect(formatBytes(2_621_440)).toBe('2.5 MB');
    expect(formatBytes(1536)).toBe('1.5 kB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(0)).toBe('0 B');
  });
});

// ─── normalizeParsed — dual-input (legacy string vs pre-parsed JSON object) ────

describe('normalizeParsed', () => {
  it('parses a legacy npm-notice TEXT string via parsePackOutput', () => {
    const text = [
      'npm notice === Tarball Contents ===',
      'npm notice 1.2kB dist/index.js',
      'npm notice === Tarball Details ===',
      'npm notice package size: 450 kB',
      'npm notice total files: 1',
    ].join('\n');
    const result = normalizeParsed(text);
    expect(result.packageSize).toBe('450 kB');
    expect(result.files).toEqual(['dist/index.js']);
  });

  it('passes a pre-parsed JSON-path object through untouched', () => {
    const parsed = parsePackJson(buildPackJson());
    const result = normalizeParsed(parsed);
    expect(result).toBe(parsed);
  });

  it('checkPackSizeAndCount accepts the JSON-path object directly (no re-parsing as text)', () => {
    const parsed = parsePackJson(buildPackJson({ size: 1_000_000 }));
    const result = checkPackSizeAndCount(parsed);
    expect(result.gate).toBe('pack_size_and_count');
    expect(result.ok).toBe(true);
  });
});

// ─── classifyPackEntry / categoryKeyForPath ────────────────────────────────

describe('classifyPackEntry', () => {
  it('classifies .d.ts before the generic .js bucket', () => {
    expect(classifyPackEntry('dist/core/config.d.ts')).toBe('.d.ts');
    expect(classifyPackEntry('dist/core/config.js')).toBe('.js');
    expect(classifyPackEntry('README.md')).toBe('.md');
    expect(classifyPackEntry('package.json')).toBe('.json');
    expect(classifyPackEntry('assets/Dockerfile.worker')).toBe('asset');
  });
});

describe('categoryKeyForPath', () => {
  it('buckets by first two path segments + extension class', () => {
    expect(categoryKeyForPath('dist/cli/entry.js')).toBe('dist/cli::.js');
    expect(categoryKeyForPath('dist/index.js')).toBe('dist::.js');
    expect(categoryKeyForPath('README.md')).toBe('.::.md');
    expect(categoryKeyForPath('assets/Dockerfile.worker')).toBe('assets::asset');
  });
});

// ─── buildCategoryInventory ─────────────────────────────────────────────────

describe('buildCategoryInventory', () => {
  it('sums count and bytes per category', () => {
    const inventory = buildCategoryInventory([
      { path: 'dist/cli/a.js', bytes: 100 },
      { path: 'dist/cli/b.js', bytes: 200 },
      { path: 'dist/cli/a.d.ts', bytes: 50 },
    ]);
    expect(inventory.categories['dist/cli::.js']).toEqual({ count: 2, bytes: 300 });
    expect(inventory.categories['dist/cli::.d.ts']).toEqual({ count: 1, bytes: 50 });
    expect(inventory.totalBytes).toBe(350);
    expect(inventory.totalFiles).toBe(3);
  });
});

// ─── checkPackCategoryBaseline — three-way delta gate + honest-FAIL paths ──────

describe('checkPackCategoryBaseline', () => {
  const baseline = {
    totalBytes: 1000,
    totalFiles: 20,
    categories: {
      'dist/cli::.js': { count: 10, bytes: 500 },
      'dist/core::.js': { count: 10, bytes: 500 },
    },
  };

  it('PASSES when the pack matches the baseline (clean path)', () => {
    const fileSizes = [
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
    ];
    const result = checkPackCategoryBaseline(fileSizes, baseline);
    expect(result.gate).toBe('pack_category_baseline');
    expect(result.ok).toBe(true);
    expect(result.newCategories).toEqual([]);
    expect(result.grown).toEqual([]);
  });

  it('FAILS when a new category appears that is absent from the baseline', () => {
    const fileSizes = [
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
      { path: 'dist/newmodule/x.js', bytes: 10 },
    ];
    const result = checkPackCategoryBaseline(fileSizes, baseline);
    expect(result.ok).toBe(false);
    expect(result.newCategories).toContain('dist/newmodule::.js');
    expect(result.message).toMatch(/new categories/i);
  });

  it('FAILS when a category count grows more than 10% over baseline', () => {
    // dist/cli baseline count=10; 12 files = +20% growth, over the 10% tolerance.
    const fileSizes = [
      ...Array.from({ length: 12 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
    ];
    const result = checkPackCategoryBaseline(fileSizes, baseline);
    expect(result.ok).toBe(false);
    expect(result.grown.some((g) => g.startsWith('dist/cli::.js'))).toBe(true);
    expect(result.message).toMatch(/grew >10%/i);
  });

  it('FAILS when total packed size grows more than 5 MB over baseline', () => {
    const bigBaseline = { totalBytes: 1000, totalFiles: 2, categories: { 'dist/cli::.js': { count: 1, bytes: 500 } } };
    const fileSizes = [{ path: 'dist/cli/big.js', bytes: 6 * 1024 * 1024 }];
    const result = checkPackCategoryBaseline(fileSizes, bigBaseline);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/total packed size grew/i);
  });

  // PUB-01-adjacent regression lock: an empty pack result must never silently pass
  // the category gate either.
  it('FAILS honestly on an empty fileSizes list (never a silent pass)', () => {
    const result = checkPackCategoryBaseline([], baseline);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/empty pack file list/i);
  });

  it('FAILS honestly when no baseline is loaded (missing/malformed scripts/pack-baseline.json)', () => {
    const fileSizes = [{ path: 'dist/cli/a.js', bytes: 100 }];
    const resultNull = checkPackCategoryBaseline(fileSizes, null);
    expect(resultNull.ok).toBe(false);
    expect(resultNull.message).toMatch(/no baseline loaded/i);

    const resultMalformed = checkPackCategoryBaseline(fileSizes, {} as never);
    expect(resultMalformed.ok).toBe(false);
  });
});

// ─── checkBuiltinsDrift (PKG-05) ────────────────────────────────────────────

describe('checkBuiltinsDrift', () => {
  it('passes when lint:builtins-drift exits 0', () => {
    const result = checkBuiltinsDrift({ exitCode: 0, stdout: 'clean' });
    expect(result.gate).toBe('builtins_drift');
    expect(result.ok).toBe(true);
  });

  it('fails when lint:builtins-drift exits non-zero', () => {
    const result = checkBuiltinsDrift({ exitCode: 1, stdout: 'new drift detected' });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toContain('new drift detected');
  });
});
