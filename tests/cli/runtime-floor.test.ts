import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNode, runDoctorChecks } from '../../src/cli/commands/doctor-checks.js';

// Row 450 (508-001): doctor previously hardcoded ">=18 required" while
// package.json engines.node said ">=24" — two floors, one lie. This test
// reads the manifest's engines.node value LIVE (no local literal) and pins
// doctor's Node.js check message against it, so the two can never drift
// apart again without this test failing.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as {
  engines?: { node?: string };
};
const requiredRange = manifest.engines?.node;

describe('runtime floor derives from package.json engines (row 450)', () => {
  it('the manifest declares an engines.node floor', () => {
    expect(requiredRange).toBeTruthy();
  });

  it('checkNode() derives its message from the manifest engines.node range, not a source literal', () => {
    const check = checkNode();
    expect(check.name).toBe('Node.js');
    expect(check.message).toContain(requiredRange);
  });

  it('checkNode() passes on the real, currently-running Node binary (which meets the manifest floor)', () => {
    const check = checkNode();
    expect(check.passed).toBe(true);
    expect(check.required).toBe(true);
  });

  it('runDoctorChecks() surfaces the same manifest-derived floor for the Node.js check', () => {
    const result = runDoctorChecks(repoRoot);
    const nodeCheck = result.checks.find((c) => c.name === 'Node.js');
    expect(nodeCheck).toBeDefined();
    expect(nodeCheck?.message).toContain(requiredRange);
  });
});
