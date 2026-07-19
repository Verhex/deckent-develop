/**
 * tests/scripts/validate-publish-drift-gate.test.ts
 *
 * MASTER-PLAN 502 (sprint-451, task 451-004). Covers the `builtins_drift` gate
 * WIRING in scripts/validate-publish.mjs — i.e. `checkBuiltinsDrift`, the pure
 * formatter that turns a spawned `builtins-drift-check.mjs --check` result into
 * the `[drift-gate] ...` line `npm run validate:publish` prints. 451-001 fixed
 * this wiring (the old execSync path only captured `err.stdout`, silently
 * dropping the actionable FAIL detail that builtins-drift-check.mjs writes to
 * stderr) — these tests lock that fix in with REAL spawned-process output.
 *
 * Hermetic: no spawnSync anywhere (ADR-D-002), and the injected-drift fixture
 * lives entirely under mkdtempSync(tmpdir()) — it never writes to the real
 * `src/core/builtins` or `.deckent/agents|skills` trees, and never re-pins the
 * committed `.deckent/builtins-drift-baseline.json`. The baseline-green test
 * reads the real repo trees (read-only) to prove the wiring against genuine
 * current state, mirroring builtins-drift-check.test.ts's own "RED-önce" style
 * read-only real-repo section.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkBuiltinsDrift } from '../../scripts/validate-publish.mjs';

const REAL_DRIFT_SCRIPT = fileURLToPath(new URL('../../scripts/builtins-drift-check.mjs', import.meta.url));

/** Async spawn wrapper (never spawnSync) — mirrors builtins-drift-check.test.ts's runCli. */
function spawnCheck(scriptPath: string, cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath, '--check'], cwd ? { cwd } : undefined);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolvePromise({ exitCode: code ?? 1, stdout, stderr }));
  });
}

// ─── Test 1: baseline-green against the REAL repo trees (read-only) ────────

describe('validate-publish drift gate — baseline-green (real repo state)', () => {
  it('spawning builtins-drift-check --check against the real repo passes, and checkBuiltinsDrift renders the real drift-gate line', async () => {
    const real = await spawnCheck(REAL_DRIFT_SCRIPT);

    // Raw real child-process output — no mocks.
    expect(real.exitCode).toBe(0);
    expect(real.stdout).toMatch(/no new drift/i);

    // The gate-wiring formatter (validate-publish.mjs's checkBuiltinsDrift), fed the
    // REAL spawned result — this is exactly what runCli() does internally.
    const rendered = checkBuiltinsDrift(real);
    expect(rendered.gate).toBe('builtins_drift');
    expect(rendered.ok).toBe(true);
    expect(rendered.message).toContain('[drift-gate] baseline-green');
    expect(rendered.message).toMatch(/no new drift/i);
  });
});

// ─── Test 2: injected-drift via a self-contained tmpdir fixture ────────────

describe('validate-publish drift gate — injected-drift (hermetic tmpdir fixture)', () => {
  let tmpRoot: string | undefined;

  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
    tmpRoot = undefined;
  });

  /**
   * Builds a self-contained fixture repo under tmpdir: a copy of the ONE script whose
   * REPO_ROOT resolution depends on its own file location (builtins-drift-check.mjs has
   * no local imports — nothing else needs copying), a miniature agents-only two-tree
   * fixture (skills stays absent — existsSync-guarded, contributes zero drift), and a
   * hand-written clean baseline. Never touches any real project tree.
   */
  function buildFixtureRepo(): string {
    const root = mkdtempSync(join(tmpdir(), 'drift-gate-fixture-'));

    mkdirSync(join(root, 'scripts'), { recursive: true });
    copyFileSync(REAL_DRIFT_SCRIPT, join(root, 'scripts', 'builtins-drift-check.mjs'));

    const deckentItemDir = join(root, '.deckent', 'agents', 'fixture-widget');
    const builtinsItemDir = join(root, 'src', 'core', 'builtins', 'agents', 'fixture-widget');
    mkdirSync(deckentItemDir, { recursive: true });
    mkdirSync(builtinsItemDir, { recursive: true });

    writeFileSync(join(deckentItemDir, 'agent.json'), JSON.stringify({ id: 'fixture-widget' }));
    writeFileSync(join(builtinsItemDir, 'agent.json'), JSON.stringify({ id: 'fixture-widget' }));
    writeFileSync(join(deckentItemDir, 'PROMPT.md'), '# Fixture Widget\nOriginal body.\n');
    writeFileSync(join(builtinsItemDir, 'PROMPT.md'), '# Fixture Widget\nOriginal body.\n');

    // Fixture-local baseline — NOT the committed repo baseline. Clean at write time.
    writeFileSync(join(root, '.deckent', 'builtins-drift-baseline.json'), JSON.stringify({ driftKeys: [] }));

    return root;
  }

  it('FAILs with the drifted item + exact re-pin command when a fixture file is mutated post-baseline', async () => {
    tmpRoot = buildFixtureRepo();

    // Mutate ONE fixture file (the .deckent side only) so it diverges from the builtins
    // side — a single deliberate content-diff drift item beyond the clean baseline.
    writeFileSync(
      join(tmpRoot, '.deckent', 'agents', 'fixture-widget', 'PROMPT.md'),
      '# Fixture Widget\nMUTATED drift body.\n',
    );

    const real = await spawnCheck(join(tmpRoot, 'scripts', 'builtins-drift-check.mjs'), tmpRoot);

    // Raw real child-process output — no mocks. Drifted file list + exact re-pin command.
    expect(real.exitCode).toBe(1);
    expect(real.stderr).toContain('fixture-widget');
    expect(real.stderr).toContain('agents::diff::fixture-widget::doc');
    expect(real.stderr).toContain('node scripts/builtins-drift-check.mjs --write');

    // The gate-wiring formatter must relay that same detail end-to-end — this is the
    // exact bug 451-001 fixed (old execSync path dropped stderr and lost this detail).
    const rendered = checkBuiltinsDrift(real);
    expect(rendered.gate).toBe('builtins_drift');
    expect(rendered.ok).toBe(false);
    expect(rendered.message).toContain('[drift-gate]');
    expect(rendered.message).toContain('fixture-widget');
    expect(rendered.message).toContain('node scripts/builtins-drift-check.mjs --write');
  });

  it('baseline-green fixture (no mutation) round-trips clean — sanity check on the fixture itself', async () => {
    tmpRoot = buildFixtureRepo();

    const real = await spawnCheck(join(tmpRoot, 'scripts', 'builtins-drift-check.mjs'), tmpRoot);

    expect(real.exitCode).toBe(0);
    expect(real.stdout).toMatch(/no new drift/i);
    expect(checkBuiltinsDrift(real).ok).toBe(true);
  });
});
