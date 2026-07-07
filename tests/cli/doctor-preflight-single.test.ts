/**
 * DOCTOR-DUP-PREFLIGHT (born-505, task 380-013).
 *
 * `runPreFlightHealthCheck()` used to be defined TWICE — verbatim, byte-for-
 * byte identical logic — once in doctor.ts and once in doctor-checks.ts.
 * This suite proves the consolidation: doctor-checks.ts stays the single
 * canonical definition, and doctor.ts imports/re-exports it rather than
 * redefining it.
 *
 * Part 1 is a static source-grep (the goCriteria's own verification method:
 * "tek runPreFlightHealthCheck tanımı kalır (grep disk-verify)"). Part 2 is
 * a runtime check that both modules' exported symbol is the SAME function
 * reference — proof of genuine delegation, not just a same-named duplicate
 * that happens to grep to one hit.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('runPreFlightHealthCheck — single canonical definition', () => {
  it('only ONE `export function runPreFlightHealthCheck` exists across doctor.ts + doctor-checks.ts', () => {
    const doctorSrc = readFileSync(new URL('../../src/cli/commands/doctor.ts', import.meta.url), 'utf-8');
    const doctorChecksSrc = readFileSync(new URL('../../src/cli/commands/doctor-checks.ts', import.meta.url), 'utf-8');

    const defPattern = /export function runPreFlightHealthCheck\(/g;
    const doctorDefs = doctorSrc.match(defPattern) ?? [];
    const doctorChecksDefs = doctorChecksSrc.match(defPattern) ?? [];

    expect(doctorDefs.length + doctorChecksDefs.length).toBe(1);
    // The single canonical definition lives in doctor-checks.ts.
    expect(doctorChecksDefs.length).toBe(1);
    expect(doctorDefs.length).toBe(0);
  });

  it('doctor.ts imports (delegates to) runPreFlightHealthCheck from doctor-checks.js instead of redefining it', () => {
    const doctorSrc = readFileSync(new URL('../../src/cli/commands/doctor.ts', import.meta.url), 'utf-8');
    expect(doctorSrc).toMatch(/import\s*\{[^}]*runPreFlightHealthCheck[^}]*\}\s*from\s*'\.\/doctor-checks\.js'/s);
  });

  it('doctor-checks.ts source also has a single PreFlightResult/PreFlightCheckResult interface pair (no duplicate types either)', () => {
    const doctorSrc = readFileSync(new URL('../../src/cli/commands/doctor.ts', import.meta.url), 'utf-8');
    const doctorChecksSrc = readFileSync(new URL('../../src/cli/commands/doctor-checks.ts', import.meta.url), 'utf-8');

    const interfaceDefPattern = /export interface PreFlightResult \{/g;
    const doctorDefs = doctorSrc.match(interfaceDefPattern) ?? [];
    const doctorChecksDefs = doctorChecksSrc.match(interfaceDefPattern) ?? [];
    expect(doctorDefs.length).toBe(0);
    expect(doctorChecksDefs.length).toBe(1);
  });
});

describe('runPreFlightHealthCheck — runtime delegation proof', () => {
  it('doctor.ts and doctor-checks.ts export the exact same function reference', async () => {
    const doctorModule = await import('../../src/cli/commands/doctor.js');
    const doctorChecksModule = await import('../../src/cli/commands/doctor-checks.js');

    expect(typeof doctorModule.runPreFlightHealthCheck).toBe('function');
    expect(typeof doctorChecksModule.runPreFlightHealthCheck).toBe('function');
    expect(doctorModule.runPreFlightHealthCheck).toBe(doctorChecksModule.runPreFlightHealthCheck);
  });
});
