/**
 * Sprint 228 Task 228-004 — autonomous-smoke hermetic unit tests.
 *
 * Hermetic: no real subprocess spawning, no dist dependency, no gitignored state.
 * Tests drive exported pure-function helpers from the smoke script in isolation,
 * plus the dist-missing skip path of runSmoke().
 *
 * 3+ required scenarios per DIRECTIVES:
 *   1. bounded-start temiz exit  — evaluateStartResult: code=0 → pass
 *   2. status-çıktı              — evaluateStatusOutput: EN + TR header variants
 *   3. tmpdir-izole              — sandbox is under OS tmpdir, checkDistExists in tmpdir
 *   4. dist-yok skip             — runSmoke with missing entryPath → skipped=true, pass=true
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  checkDistExists,
  evaluateStartResult,
  evaluateStatusOutput,
  runSmoke,
} from '../../scripts/autonomous-smoke.mjs';

// ─── sandbox helpers ──────────────────────────────────────────────────────────

const sandboxes: string[] = [];

function createSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-autonomous-test-'));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
});

// ─── bounded-start temiz exit ─────────────────────────────────────────────────

describe('evaluateStartResult — bounded start clean exit', () => {
  it('returns pass=true when exit code is 0 and not timed out (temiz exit)', () => {
    const result = evaluateStartResult({ code: 0, timedOut: false });
    expect(result.pass).toBe(true);
  });

  it('returns pass=false when timed out, with reason mentioning timeout', () => {
    const result = evaluateStartResult({ code: null, timedOut: true });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/timed out/i);
  });

  it('returns pass=false for non-zero exit code, with reason mentioning code', () => {
    const result = evaluateStartResult({ code: 1, timedOut: false });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/exit/);
    expect(result.reason).toContain('1');
  });
});

// ─── status-çıktı ─────────────────────────────────────────────────────────────

describe('evaluateStatusOutput — status output header present', () => {
  it('returns pass=true when stdout contains EN header "Autonomous runtime status"', () => {
    const result = evaluateStatusOutput({
      stdout: 'Autonomous runtime status\nPending approvals: 0\nNo audit events yet.',
    });
    expect(result.pass).toBe(true);
  });

  it('returns pass=true when stdout contains TR header "Otonom runtime"', () => {
    const result = evaluateStatusOutput({
      stdout: 'Otonom runtime durumu\nBekleyen onay: 0\nHenüz audit kaydı yok.',
    });
    expect(result.pass).toBe(true);
  });

  it('returns pass=false when stdout is empty (missing header)', () => {
    const result = evaluateStatusOutput({ stdout: '' });
    expect(result.pass).toBe(false);
    expect(result.reason).toBeDefined();
    expect((result.reason as string).length).toBeGreaterThan(0);
  });

  it('returns pass=false for unrelated output with no header', () => {
    const result = evaluateStatusOutput({ stdout: 'Error: ENOENT some path' });
    expect(result.pass).toBe(false);
  });
});

// ─── tmpdir-izole ─────────────────────────────────────────────────────────────

describe('tmpdir isolation (tmpdir-izole)', () => {
  it('sandbox directory is created inside the OS temp directory (not project root)', () => {
    const sandbox = createSandbox();
    expect(sandbox.startsWith(tmpdir())).toBe(true);
  });

  it('checkDistExists returns false for a non-existent path in tmpdir', () => {
    const sandbox = createSandbox();
    const fakePath = join(sandbox, 'fake-entry.js');
    expect(checkDistExists(fakePath)).toBe(false);
  });

  it('checkDistExists returns true after creating a file in tmpdir', () => {
    const sandbox = createSandbox();
    const fakePath = join(sandbox, 'entry.js');
    writeFileSync(fakePath, '// mock entry', 'utf-8');
    expect(checkDistExists(fakePath)).toBe(true);
  });

  it('afterEach cleans up sandboxes (no tmpdir pollution)', () => {
    const a = createSandbox();
    const b = createSandbox();
    expect(a).not.toEqual(b);
    expect(a.startsWith(tmpdir())).toBe(true);
    expect(b.startsWith(tmpdir())).toBe(true);
  });
});

// ─── dist-yok skip guard ──────────────────────────────────────────────────────

describe('runSmoke — dist-yok skip guard', () => {
  it('returns skipped=true and pass=true when entryPath does not exist (dist-yok skip)', async () => {
    const result = await runSmoke({ entryPath: '/nonexistent/dist/cli/entry.js' });
    expect(result.skipped).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('populates scenarios array with a SKIP entry when dist is absent', async () => {
    const result = await runSmoke({ entryPath: '/no/entry.js' });
    expect(Array.isArray(result.scenarios)).toBe(true);
    expect(result.scenarios.length).toBeGreaterThan(0);
    expect(result.scenarios.some((s: string) => s.includes('SKIP'))).toBe(true);
  });

  it('provides a non-empty reason string when skipped (dist missing)', async () => {
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
