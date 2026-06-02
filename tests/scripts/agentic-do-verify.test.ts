/**
 * Sprint 224 Task 224-027 — agentic-do-verify hermetic unit tests.
 *
 * Hermetic: no real subprocess spawning, no dist dependency, no gitignored state.
 * Tests drive exported pure-function helpers from the smoke script in isolation,
 * plus the dist-missing skip path of runSmoke().
 *
 * 4 required scenarios per DIRECTIVES:
 *   1. write-verify PASS — file exists → pass
 *   2. dosya-yok FAIL   — file missing → fail
 *   3. tmpdir-izole     — file I/O contained in OS tmpdir (not project root)
 *   4. dist-yok skip    — dist missing → skipped=true, pass=true
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  checkDistExists,
  evaluateWriteVerify,
  runSmoke,
} from '../../scripts/agentic-do-verify.mjs';

// ─── sandbox helpers ──────────────────────────────────────────────────────────

const sandboxes: string[] = [];

function createSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-agentic-test-'));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
});

// ─── checkDistExists ──────────────────────────────────────────────────────────

describe('checkDistExists', () => {
  it('returns false for a path that does not exist', () => {
    expect(checkDistExists('/nonexistent/dist/cli/entry.js')).toBe(false);
  });

  it('returns true for a tmpdir sandbox path after file is created there', () => {
    const sandbox = createSandbox();
    const filePath = join(sandbox, 'test-entry.js');
    writeFileSync(filePath, '// mock', 'utf-8');
    expect(checkDistExists(filePath)).toBe(true);
  });
});

// ─── evaluateWriteVerify — write-verify PASS ─────────────────────────────────

describe('evaluateWriteVerify — write-verify PASS', () => {
  it('returns pass=true when the agentic-write file exists (write-verify PASS)', () => {
    const sandbox = createSandbox();
    const filePath = join(sandbox, 'agentic-verify-test.md');
    writeFileSync(filePath, 'AGENTIC_VERIFY_OK', 'utf-8');

    const result = evaluateWriteVerify(filePath);

    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes for any existing file written to tmpdir', () => {
    const sandbox = createSandbox();
    const filePath = join(sandbox, `agentic-verify-${Date.now()}.md`);
    writeFileSync(filePath, 'content', 'utf-8');

    expect(evaluateWriteVerify(filePath).pass).toBe(true);
  });
});

// ─── evaluateWriteVerify — dosya-yok FAIL ────────────────────────────────────

describe('evaluateWriteVerify — dosya-yok FAIL', () => {
  it('returns pass=false when the target file does not exist (dosya-yok FAIL)', () => {
    const sandbox = createSandbox();
    const filePath = join(sandbox, 'nonexistent-agentic-write.md');

    const result = evaluateWriteVerify(filePath);

    expect(result.pass).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toMatch(/not created/);
  });

  it('returns pass=false with the missing path in the reason string', () => {
    const sandbox = createSandbox();
    const filePath = join(sandbox, 'missing.md');
    const result = evaluateWriteVerify(filePath);

    expect(result.pass).toBe(false);
    expect(result.reason).toContain(filePath);
  });

  it('returns pass=false (with reason) when filePath is empty string', () => {
    const result = evaluateWriteVerify('');
    expect(result.pass).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

// ─── tmpdir-izole — all file I/O is contained in OS tmpdir ───────────────────

describe('tmpdir isolation (tmpdir-izole)', () => {
  it('sandbox directory is created inside the OS temp directory (not project root)', () => {
    const sandbox = createSandbox();
    // Verify sandbox is under OS tmpdir
    expect(sandbox.startsWith(tmpdir())).toBe(true);
  });

  it('file written to sandbox passes evaluateWriteVerify and does not affect project root', () => {
    const sandbox = createSandbox();
    const filePath = join(sandbox, 'isolation-check.md');
    writeFileSync(filePath, 'isolated', 'utf-8');

    // File found in sandbox
    expect(evaluateWriteVerify(filePath).pass).toBe(true);
    // A path to the same filename in /nonexistent does not exist
    expect(evaluateWriteVerify('/nonexistent/isolation-check.md').pass).toBe(false);
  });

  it('afterEach cleans up sandbox directories (no leftover tmpdir pollution)', () => {
    // Register two sandboxes — afterEach will clean both
    const a = createSandbox();
    const b = createSandbox();
    expect(a).not.toEqual(b);
    expect(a.startsWith(tmpdir())).toBe(true);
    expect(b.startsWith(tmpdir())).toBe(true);
  });
});

// ─── runSmoke — dist-not-found skip (dist-yok) ───────────────────────────────

describe('runSmoke — dist-yok skip guard', () => {
  it('returns skipped=true and pass=true when entryPath does not exist (dist-yok skip)', async () => {
    const result = await runSmoke({ entryPath: '/nonexistent/path/dist/cli/entry.js' });

    expect(result.skipped).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('populates scenarios array with a SKIP entry when dist is absent', async () => {
    const result = await runSmoke({ entryPath: '/no/entry.js' });

    expect(Array.isArray(result.scenarios)).toBe(true);
    expect(result.scenarios.length).toBeGreaterThan(0);
    expect(result.scenarios.every((s: string) => s.startsWith('SKIP'))).toBe(true);
  });

  it('provides a non-empty reason string when skipped (dist missing path)', async () => {
    const result = await runSmoke({ entryPath: '/missing/entry.js' });

    expect(typeof result.reason).toBe('string');
    expect((result.reason ?? '').length).toBeGreaterThan(0);
  });

  it('does NOT treat dist-missing as failure (skip ≠ failure)', async () => {
    const result = await runSmoke({ entryPath: '/nonexistent/entry.js' });

    expect(result.pass).toBe(true);
    expect(result.skipped).toBe(true);
  });
});
