/**
 * DOCTOR-TWIN dedup (born-651, task 412-003).
 *
 * `runDoctorChecks` used to be defined TWICE with DIVERGED bodies — once in
 * doctor.ts (the live twin, actually wired into `deckent doctor`) and once in
 * doctor-checks.ts (a stale sibling). Unlike the earlier runPreFlightHealthCheck
 * dedup (born-505), this was not a byte-for-byte duplicate: the two check-lists
 * had genuinely drifted —
 *   - checkDebt: doctor.ts's copy was DB-first (core/debt-store.ts); doctor-
 *     checks.ts's copy still parsed the long-removed root .brain/DEBT.md file.
 *   - checkPlatform: doctor.ts's copy was backend-aware on win32 (docker/
 *     subprocess backends pass); doctor-checks.ts's copy hardcoded UNSUPPORTED
 *     regardless of spawn_backend.
 *   - checkTmux: doctor.ts's copy i18n'd the "not required" reasons via
 *     getMessage; doctor-checks.ts's copy hardcoded English-only text.
 * A check added only to doctor-checks.ts's runDoctorChecks (411-002's
 * '.deck Subprocess Visibility' honesty-slice landed there first) never
 * appeared in the REAL `deckent doctor` binary output, because the live code
 * path called doctor.ts's own local runDoctorChecks, not this one.
 *
 * This suite locks in the fix: doctor-checks.ts is now the single canonical
 * home for the check-list (merging in doctor.ts's richer/live bodies, not
 * doctor-checks.ts's stale ones — see tests/cli/doctor-checks.test.ts for the
 * per-check behavioral pins), and doctor.ts re-exports rather than
 * redefining. Part 1 is static source-evidence (no second check-list build
 * site). Part 2 is the runtime regression lock: doctor.ts's exported
 * runDoctorChecks (and the shared check functions) are the SAME function
 * reference as doctor-checks.ts's — proof of genuine delegation, so a check
 * added only to doctor-checks.ts's array can never again silently fail to
 * appear in the real `deckent doctor` output.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const doctorSrc = readFileSync(new URL('../../src/cli/commands/doctor.ts', import.meta.url), 'utf-8');
const doctorChecksSrc = readFileSync(new URL('../../src/cli/commands/doctor-checks.ts', import.meta.url), 'utf-8');

describe('runDoctorChecks — single canonical check-list (static evidence)', () => {
  it('doctor.ts has no local `runDoctorChecks` check-list construction', () => {
    const localRunDoctorBody = doctorSrc.match(
      /(?:export )?function runDoctorChecks\([^)]*\)[\s\S]*?\n}\n/,
    );
    expect(localRunDoctorBody).toBeNull();
    expect(doctorChecksSrc).toMatch(
      /export function runDoctorChecks\([^)]*\)[\s\S]*?const checks:\s*DoctorCheck\[\]\s*=\s*\[/,
    );
  });

  it('only ONE `function runDoctorChecks(` definition exists across doctor.ts + doctor-checks.ts', () => {
    const defPattern = /(?:export )?function runDoctorChecks\(/g;
    const doctorDefs = doctorSrc.match(defPattern) ?? [];
    const doctorChecksDefs = doctorChecksSrc.match(defPattern) ?? [];
    expect(doctorDefs.length).toBe(0);
    expect(doctorChecksDefs.length).toBe(1);
  });

  it('doctor.ts imports+re-exports runDoctorChecks from doctor-checks.js instead of redefining it', () => {
    expect(doctorSrc).toMatch(/import\s*\{[^}]*runDoctorChecks[^}]*\}\s*from\s*'\.\/doctor-checks\.js'/s);
    expect(doctorSrc).toMatch(/export\s*\{[^}]*runDoctorChecks[^}]*\}/s);
  });

  // The other check-list twins that were reconciled alongside runDoctorChecks
  // itself (checkPlatform/checkTmux/checkClaude/checkGitignore/
  // checkWritePermissions/checkDeckSecurity/checkDocker) must also have no
  // surviving local body in doctor.ts.
  it.each([
    'checkPlatform', 'checkTmux', 'checkClaude',
    'checkGitignore', 'checkWritePermissions', 'checkDeckSecurity', 'checkDocker',
  ])('doctor.ts has no local `function %s(` body (imported + re-exported from doctor-checks.ts instead)', (name) => {
    const localDefPattern = new RegExp(`^(?:export )?function ${name}\\(`, 'm');
    expect(doctorSrc).not.toMatch(localDefPattern);
    expect(doctorChecksSrc).toMatch(new RegExp(`^export function ${name}\\(`, 'm'));
  });

  // checkNode / checkGit were never exported by doctor.ts before this dedup
  // either — confirm they, too, collapsed to a single (non-exported) body.
  it.each(['checkNode', 'checkGit'])('only ONE `function %s(` definition exists across doctor.ts + doctor-checks.ts', (name) => {
    const defPattern = new RegExp(`function ${name}\\(`, 'g');
    const doctorDefs = doctorSrc.match(defPattern) ?? [];
    const doctorChecksDefs = doctorChecksSrc.match(defPattern) ?? [];
    expect(doctorDefs.length).toBe(0);
    expect(doctorChecksDefs.length).toBe(1);
  });
});

describe('runDoctorChecks — runtime delegation proof (regression lock)', () => {
  it('doctor.ts and doctor-checks.ts export the exact same runDoctorChecks function reference', async () => {
    const doctorModule = await import('../../src/cli/commands/doctor.js');
    const doctorChecksModule = await import('../../src/cli/commands/doctor-checks.js');
    expect(typeof doctorModule.runDoctorChecks).toBe('function');
    expect(doctorModule.runDoctorChecks).toBe(doctorChecksModule.runDoctorChecks);
  });

  it.each([
    'checkPlatform', 'checkTmux', 'checkClaude',
    'checkGitignore', 'checkWritePermissions', 'checkDeckSecurity', 'checkDocker',
  ])('%s is re-exported from doctor.ts as the SAME reference as doctor-checks.ts (not a re-implemented twin)', async (name) => {
    const doctorModule = await import('../../src/cli/commands/doctor.js') as Record<string, unknown>;
    const doctorChecksModule = await import('../../src/cli/commands/doctor-checks.js') as Record<string, unknown>;
    expect(typeof doctorModule[name]).toBe('function');
    expect(doctorModule[name]).toBe(doctorChecksModule[name]);
  });

  it('411-002 regression lock: a check that lives only in doctor-checks.ts\'s array (.deck Subprocess Visibility) is visible through doctor.ts\'s exported runDoctorChecks — the two check-lists can no longer silently diverge', async () => {
    const doctorModule = await import('../../src/cli/commands/doctor.js');
    const root = mkdtempSync(join(tmpdir(), 'deckent-doctor-twin-dedup-'));
    try {
      const result = doctorModule.runDoctorChecks(root, undefined, 'subprocess', 'en');
      expect(result.checks.some((c) => c.name === '.deck Subprocess Visibility')).toBe(true);
      // Before/after inventory (born-651 goCriteria): the live check-set doctor.ts
      // prints today is unchanged in size or membership by this dedup — same 16
      // named checks, same order, just a single source of truth now.
      expect(result.checks.map((c) => c.name)).toEqual([
        'Platform', 'Node.js', 'git', 'tmux', 'Docker', 'Claude CLI',
        'Workspace', 'Brain Dir', 'Directives',
        'Brain Budget', 'Debt', 'Locks',
        '.deck Security', 'Write Permissions', 'Gitignore',
        '.deck Subprocess Visibility',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
