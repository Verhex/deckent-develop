// Task 390-004 (born-579) — DOCTOR-PREFLIGHT-HONESTY.
//
// `doctor --pre-flight` delegates to `runPreFlightHealthCheck()`, which spawns
// scripts/pre-flight-health-check.mjs. That script is a deckent-repo-internal
// dev diagnostic (checks tsc/vitest/brain-budget/locks/docker/mcp for the
// deckent checkout itself) and is NOT listed in package.json `files`, so an
// npm-installed consumer never has it on disk. Before this fix, a missing
// script made `spawnSync` fail with empty stdout, and
// `runPreFlightHealthCheck()` silently fell back to generic `runDoctorChecks()`
// results — mislabeled as the extended pre-flight check, with no signal to the
// user that the real check never ran.
//
// `resolvePreFlightResult()` (src/cli/commands/doctor.ts) is the new call-site
// guard: it checks script existence BEFORE delegating, and reports an honest
// "unavailable in this install mode" result instead of substituting an
// unrelated check set. When the script IS present (dev checkout), it delegates
// to `runPreFlightHealthCheck()` exactly as before — behavior-preserving.
//
// Hermetic per the CUSTOM Test Hermeticity rule: fixtures live under a fresh
// os.tmpdir() directory (mirrors tests/cli/doctor-fix.test.ts), real node:fs
// (no mock — these are real, scoped fs.existsSync checks against the tmpdir
// root). Only node:child_process is mocked, and only to prove genuine
// delegation on the script-present path without spawning a real OS process.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { resolvePreFlightResult } from '../../src/cli/commands/doctor.js';

function makeSpawnResult(status: number, stdout: string) {
  return { status, stdout, stderr: '', pid: 1, signal: null, output: [] };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-doctor-preflight-honesty-'));
  vi.mocked(spawnSync).mockReset();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolvePreFlightResult — npm-install mode (script absent)', () => {
  it('reports honestly instead of silently falling back to generic doctor checks', () => {
    // No scripts/ directory at all — the exact shape of an npm-installed
    // consumer's project (package.json `files` never publishes scripts/).
    const result = resolvePreFlightResult(root);

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({
      name: 'pre-flight-script',
      passed: false,
      required: false,
    });
    expect(result.checks[0]?.message).toContain('Unavailable in this install mode');
    expect(result.checks[0]?.message).toContain('npm package');
  });

  it('does NOT silently substitute runDoctorChecks output (would be 15 unrelated checks)', () => {
    const result = resolvePreFlightResult(root);
    // runDoctorChecks() returns 15 checks (see doctor-checks.test.ts); the
    // honest-fallback path must never be mistaken for it.
    expect(result.checks.length).not.toBe(15);
    expect(result.checks.map(c => c.name)).not.toContain('typescript');
  });

  it('does not block the sprint on a dev-only diagnostic being unavailable', () => {
    const result = resolvePreFlightResult(root);
    expect(result.passed).toBe(true);
    expect(result.abortSprint).toBe(false);
  });

  it('never spawns a subprocess when the script is absent (no blind spawnSync attempt)', () => {
    resolvePreFlightResult(root);
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('also reports honestly when scripts/ exists but the specific file does not', () => {
    // scripts/ present (e.g. other unrelated scripts published) but this one
    // file missing — same npm-install blind spot, must not spawnSync a
    // nonexistent path either.
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts', 'unrelated-script.mjs'), '// not pre-flight');

    const result = resolvePreFlightResult(root);

    expect(result.checks[0]?.name).toBe('pre-flight-script');
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

describe('resolvePreFlightResult — dev checkout (script present, existing behavior preserved)', () => {
  it('delegates to the real pre-flight script instead of the honest-fallback', () => {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts', 'pre-flight-health-check.mjs'), '// dev-checkout fixture, never actually executed (spawnSync mocked)');

    const fakeScriptResult = {
      passed: true,
      abortSprint: false,
      checks: [
        { name: 'typescript', passed: true, required: true, message: 'tsc clean', durationMs: 500 },
      ],
    };
    vi.mocked(spawnSync).mockReturnValue(makeSpawnResult(0, JSON.stringify(fakeScriptResult)) as ReturnType<typeof spawnSync>);

    const result = resolvePreFlightResult(root);

    // Real delegation happened: the script's own JSON came back verbatim,
    // not the honest-fallback single-check shape.
    expect(result).toEqual(fakeScriptResult);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining([expect.stringContaining('pre-flight-health-check.mjs')]),
      expect.any(Object),
    );
  });
});
