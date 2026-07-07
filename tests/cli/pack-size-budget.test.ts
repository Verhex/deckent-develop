/**
 * tests/cli/pack-size-budget.test.ts — Sprint 379 task 379-002 (PACK-SIZE <5MB)
 *
 * Regression guard for the npm publish package-size gate. Deterministic/hermetic
 * fixtures only — no live `npm pack` (avoids depending on a built dist/ in CI and
 * matches the project's test-hermeticity rule).
 */

import { describe, it, expect } from 'vitest';
import {
  parsePackOutput,
  rankLargestFiles,
  checkPackSizeAndCount,
  checkCriticalFilesInTarball,
  BIN_FILES,
} from '../../scripts/validate-publish.mjs';

interface PackFile {
  path: string;
  size: string;
}

function buildPackOutput(
  opts: { files?: PackFile[]; packageSize?: string; fileCount?: number } = {},
): string {
  const files = opts.files ?? [{ path: 'dist/index.js', size: '1.2kB' }];
  const packageSize = opts.packageSize ?? '450 kB';
  const fileCount = opts.fileCount ?? files.length;
  const lines = ['npm notice', 'npm notice === Tarball Contents ==='];
  for (const f of files) {
    lines.push(`npm notice ${f.size} ${f.path}`);
  }
  lines.push('npm notice === Tarball Details ===');
  lines.push('npm notice name:         deckent');
  lines.push(`npm notice package size: ${packageSize}`);
  lines.push(`npm notice total files:  ${fileCount}`);
  return lines.join('\n');
}

describe('pack-size-budget regression guard (sprint 379-002)', () => {
  describe('size budget — <5MB gate', () => {
    it('passes comfortably under budget (projected post-dead-asset-removal size)', () => {
      const out = buildPackOutput({ packageSize: '4.7 MB', fileCount: 900 });
      const result = checkPackSizeAndCount(out);
      expect(result.ok).toBe(true);
      expect(result.severity).toBe('info');
    });

    it('fails at the currently-measured regression size (6.0 MB, Sprint 379 gate baseline)', () => {
      const out = buildPackOutput({ packageSize: '6.0 MB', fileCount: 1816 });
      const result = checkPackSizeAndCount(out);
      expect(result.ok).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.message).toMatch(/exceeds 5 MB limit/i);
    });

    it('reports the largest packed files as topOffenders when the gate fails', () => {
      const out = buildPackOutput({
        packageSize: '6.0 MB',
        files: [
          { path: 'dist/dashboard/logo.png', size: '1.4MB' },
          { path: 'dist/dashboard/decko-mascot.png', size: '761kB' },
          { path: 'dist/index.js', size: '1.2kB' },
        ],
      });
      const result = checkPackSizeAndCount(out);
      expect(result.ok).toBe(false);
      expect(result.topOffenders?.[0]?.path).toBe('dist/dashboard/logo.png');
      expect(result.topOffenders?.[1]?.path).toBe('dist/dashboard/decko-mascot.png');
      expect(result.topOffenders?.[2]?.path).toBe('dist/index.js');
    });
  });

  describe('rankLargestFiles', () => {
    it('sorts descending by bytes and respects the limit', () => {
      const fileSizes = [
        { path: 'a', bytes: 100 },
        { path: 'b', bytes: 500 },
        { path: 'c', bytes: 250 },
      ];
      const ranked = rankLargestFiles(fileSizes, 2);
      expect(ranked).toEqual([
        { path: 'b', bytes: 500 },
        { path: 'c', bytes: 250 },
      ]);
    });

    it('does not mutate the input array', () => {
      const fileSizes = [
        { path: 'a', bytes: 1 },
        { path: 'b', bytes: 2 },
      ];
      const copy = [...fileSizes];
      rankLargestFiles(fileSizes);
      expect(fileSizes).toEqual(copy);
    });
  });

  describe('parsePackOutput — per-file byte sizes', () => {
    it('captures fileSizes alongside the existing files list', () => {
      const out = buildPackOutput({
        files: [
          { path: 'dist/a.js', size: '2.0kB' },
          { path: 'dist/b.js', size: '512B' },
        ],
      });
      const parsed = parsePackOutput(out);
      expect(parsed.files).toEqual(['dist/a.js', 'dist/b.js']);
      expect(parsed.fileSizes).toEqual([
        { path: 'dist/a.js', bytes: Math.round(2.0 * 1024) },
        { path: 'dist/b.js', bytes: 512 },
      ]);
    });
  });

  describe('checkCriticalFilesInTarball — entry/bin/assets regression guard', () => {
    const pkg = { main: './dist/index.js', types: './dist/index.d.ts' };

    function healthyFiles(): PackFile[] {
      return [
        { path: 'dist/index.js', size: '4.0kB' },
        { path: 'dist/index.d.ts', size: '1.0kB' },
        ...BIN_FILES.map((p: string) => ({ path: p, size: '2.0kB' })),
        { path: 'dist/dashboard/index.html', size: '1.0kB' },
        { path: 'dist/dashboard/assets/index-abc123.js', size: '400kB' },
      ];
    }

    it('passes when entry/types/bin/dashboard files are all present in the tarball', () => {
      const out = buildPackOutput({ files: healthyFiles() });
      const result = checkCriticalFilesInTarball(out, pkg);
      expect(result.gate).toBe('critical_files_in_tarball');
      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('fails and names the missing bin file when an over-aggressive .npmignore strips it', () => {
      const strippedBin = BIN_FILES[1]!;
      const files = healthyFiles().filter((f) => f.path !== strippedBin);
      const out = buildPackOutput({ files });
      const result = checkCriticalFilesInTarball(out, pkg);
      expect(result.ok).toBe(false);
      expect(result.missing).toContain(strippedBin);
    });

    it('fails when the main entry point is declared but not packed', () => {
      const files = healthyFiles().filter((f) => f.path !== 'dist/index.js');
      const out = buildPackOutput({ files });
      const result = checkCriticalFilesInTarball(out, pkg);
      expect(result.ok).toBe(false);
      expect(result.missing).toContain('dist/index.js');
    });

    it('fails when the dashboard JS bundle is missing from the tarball (assets/ narrowed away)', () => {
      const files = healthyFiles().filter((f) => !f.path.startsWith('dist/dashboard/assets/'));
      const out = buildPackOutput({ files });
      const result = checkCriticalFilesInTarball(out, pkg);
      expect(result.ok).toBe(false);
      expect(result.missing).toContain('dist/dashboard/assets/index-*.js');
    });
  });
});
