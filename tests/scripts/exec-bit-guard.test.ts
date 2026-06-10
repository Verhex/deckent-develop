/**
 * tests/scripts/exec-bit-guard.test.ts
 *
 * Sprint 270 Task 4: Verify that ensureBinExecutable() from copy-assets.mjs
 * correctly applies 0o755 to bin files, so `tsc --watch` / bare `tsc` runs
 * (which strip mode bits) can be repaired via `npm run fix:bin`.
 *
 * Hermetic: all file I/O in tmpdir, no real dist/ paths touched.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureBinExecutable, BIN_FILES } from '../../scripts/copy-assets.mjs';

describe('ensureBinExecutable', () => {
  let tmpRoot: string | undefined;

  afterEach(() => {
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
      tmpRoot = undefined;
    }
  });

  it('restores 0o755 on non-executable bin files (the tsc --watch bug scenario)', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'exec-bit-test-'));
    // mirror the BIN_FILES paths under tmpRoot
    for (const rel of BIN_FILES) {
      const full = join(tmpRoot, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      // tsc writes 0o644 — simulate the bug
      writeFileSync(full, '#!/usr/bin/env node\n', { mode: 0o644 });
      expect(statSync(full).mode & 0o777).toBe(0o644); // confirm the bug precondition
    }

    ensureBinExecutable(tmpRoot);

    for (const rel of BIN_FILES) {
      const full = join(tmpRoot, rel);
      expect(statSync(full).mode & 0o777).toBe(0o755);
    }
  });

  it('returns count equal to number of files that exist', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'exec-bit-test-'));
    // only create the first bin file
    const firstRel = BIN_FILES[0];
    const full = join(tmpRoot, firstRel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, '#!/usr/bin/env node\n', { mode: 0o644 });

    const count = ensureBinExecutable(tmpRoot);
    expect(count).toBe(1);
  });

  it('does not throw when dist/ is absent (missing files skipped gracefully)', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'exec-bit-test-'));
    // no dist/ at all — fresh checkout before first build
    expect(() => ensureBinExecutable(tmpRoot)).not.toThrow();
    const count = ensureBinExecutable(tmpRoot);
    expect(count).toBe(0);
  });

  it('is idempotent: files already 0o755 remain 0o755 without error', () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'exec-bit-test-'));
    for (const rel of BIN_FILES) {
      const full = join(tmpRoot, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, '#!/usr/bin/env node\n', { mode: 0o755 });
    }

    expect(() => ensureBinExecutable(tmpRoot)).not.toThrow();

    for (const rel of BIN_FILES) {
      expect(statSync(join(tmpRoot, rel)).mode & 0o777).toBe(0o755);
    }
  });

  it('BIN_FILES export contains expected dist/ entry points', () => {
    expect(BIN_FILES).toContain('dist/cli/entry.js');
    expect(BIN_FILES).toContain('dist/mcp/server.js');
    expect(BIN_FILES.length).toBeGreaterThanOrEqual(2);
  });
});
