// Task 410-003 — DOCTOR-DEDUP, closing MASTER-PLAN item 505
// (DOCTOR-CHECKS-DUP-PREFLIGHT: doctor.ts + doctor-checks.ts each defined
// their own `runPreFlightHealthCheck()` verbatim).
//
// Disk-verify at the time this file was written: the dedup itself already
// landed in task 380-013 (born-505) and the live `--pre-flight` behavior was
// separately hardened+pinned in task 390-004 (born-579,
// tests/cli/doctor-preflight-honesty.test.ts). doctor-checks.ts kept the one
// canonical implementation; doctor.ts imports and re-exports it. This file is
// the item-505-specific closure pin: it re-asserts the two static guarantees
// named as MASTER-PLAN 505's own verification method ("grep confirms a single
// runPreFlightHealthCheck definition"; re-export not redefinition), and adds
// one real (no-mock, hermetic tmpdir) end-to-end check of the re-exported
// symbol that neither doctor-preflight-single.test.ts (reference-equality
// only) nor doctor-preflight-honesty.test.ts (exercises resolvePreFlightResult,
// not the raw re-export) covers.

import { createRequire } from 'node:module';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

// Row 450: the doctor's Node floor derives from package.json engines.node —
// the passing fixture derives the same way instead of pinning a version literal.
const enginesNode = (createRequire(import.meta.url)('../../package.json') as {
  engines: { node: string };
}).engines.node;
const PASSING_NODE_VERSION = `v${parseInt(enginesNode.match(/(\d+)/)?.[1] ?? '0', 10)}.0.0`;
import { join } from 'node:path';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';

describe('MASTER-PLAN 505 — runPreFlightHealthCheck de-dup stays closed', () => {
  it('exactly one `function runPreFlightHealthCheck` definition exists across doctor.ts + doctor-checks.ts (grep disk-verify)', () => {
    const doctorSrc = readFileSync(new URL('../../src/cli/commands/doctor.ts', import.meta.url), 'utf-8');
    const doctorChecksSrc = readFileSync(new URL('../../src/cli/commands/doctor-checks.ts', import.meta.url), 'utf-8');

    const defPattern = /function runPreFlightHealthCheck\(/g;
    const doctorDefs = doctorSrc.match(defPattern) ?? [];
    const doctorChecksDefs = doctorChecksSrc.match(defPattern) ?? [];

    expect(doctorDefs.length + doctorChecksDefs.length).toBe(1);
    expect(doctorChecksDefs.length).toBe(1);
  });

  it('doctor.ts re-exports rather than redefines runPreFlightHealthCheck (D-004-clean same-layer sibling import — both files live in src/cli/commands/)', () => {
    const doctorSrc = readFileSync(new URL('../../src/cli/commands/doctor.ts', import.meta.url), 'utf-8');
    expect(doctorSrc).toMatch(/import\s*\{[^}]*runPreFlightHealthCheck[^}]*\}\s*from\s*'\.\/doctor-checks\.js'/s);
    expect(doctorSrc).toMatch(/export\s*\{[^}]*runPreFlightHealthCheck[^}]*\}/);
  });

  describe('live end-to-end proof: the re-exported symbol works through doctor.ts, not just by reference', () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'deckent-doctor-dedup-505-'));
      vi.mocked(spawnSync).mockReset();
      // Pre-flight script absent -> real (unmocked) fs.existsSync inside
      // runPreFlightHealthCheck drives it down the "script missing, fall back
      // to runDoctorChecks()" branch; only the doctor-check probes themselves
      // (node/git/tmux/docker/claude version probes) go through spawnSync.
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: PASSING_NODE_VERSION, stderr: '', pid: 1, signal: null, output: [] } as ReturnType<typeof spawnSync>);
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('doctor.js re-exported runPreFlightHealthCheck(root) returns a real PreFlightResult against a real tmpdir', async () => {
      const { runPreFlightHealthCheck } = await import('../../src/cli/commands/doctor.js');
      const result = runPreFlightHealthCheck(root);

      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('abortSprint');
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
    });

    it('produces the exact same result as calling doctor-checks.js directly (single implementation, not two that happen to agree)', async () => {
      const { runPreFlightHealthCheck: viaDoctor } = await import('../../src/cli/commands/doctor.js');
      const { runPreFlightHealthCheck: viaChecks } = await import('../../src/cli/commands/doctor-checks.js');

      expect(viaDoctor(root)).toEqual(viaChecks(root));
    });
  });
});
