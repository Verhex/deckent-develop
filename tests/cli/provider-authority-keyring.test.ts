// ─── tests/cli/provider-authority-keyring.test.ts ───────────────────────────
//
// MASTER-PLAN 662. Before this command existed, an unprovisioned provider
// authority keyring made every `deckent start` hold with `keyring_unavailable`
// and there was no supported way to see or fix it. These cases pin the three
// operator-facing guarantees:
//
//   A) `status` reports absent → provisioned, and NEVER prints key material.
//   B) `init` is first-writer-wins: it refuses to overwrite an existing keyring.
//   C) `rotate` requires the expected revision hash (no silent clobber).
//   D) the doctor check and the hold remedy line follow the same state.
//
// Hermetic: every case writes under its own tmpdir; the real HOME/global data
// directory is never touched.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readKeyringState,
  runKeyringInit,
  runKeyringRotate,
  runKeyringStatus,
  providerAuthorityHoldRemedy,
  type ProviderAuthorityKeyringDeps,
} from '../../src/cli/commands/provider-authority.js';
import { buildProviderAuthorityKeyringCheck } from '../../src/cli/commands/doctor.js';

const roots: string[] = [];
let printed: string[] = [];

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: (line: string) => { printed.push(line); },
  printError: (err: unknown) => { printed.push(String(err)); },
}));

function makeDeps(): ProviderAuthorityKeyringDeps {
  const base = mkdtempSync(join(tmpdir(), 'deckent-pa-keyring-'));
  roots.push(base);
  // The keyring's defence-in-depth guard realpath()s the project root, so the
  // fixture mirrors production where `resolveProjectRoot()` always exists.
  const projectRoot = join(base, 'project');
  mkdirSync(projectRoot, { recursive: true });
  return {
    dataDirOverride: join(base, 'data'),
    resolveProjectRootFn: () => projectRoot,
    platformOverride: 'linux',
  };
}

beforeEach(() => { printed = []; });
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('provider-authority keyring (MASTER-PLAN 662)', () => {
  it('reports an unprovisioned keyring as absent, not as a fault', () => {
    const deps = makeDeps();
    expect(readKeyringState(deps)).toEqual({ state: 'absent' });

    runKeyringStatus(deps);
    const output = printed.join('\n');
    expect(output).toMatch(/SAĞLANMAMIŞ|NOT PROVISIONED/);
    expect(output).toContain('provider-authority');
  });

  it('provisions a genesis revision and never prints key material', () => {
    const deps = makeDeps();
    runKeyringInit(deps);

    const read = readKeyringState(deps);
    expect(read.state).toBe('present');
    if (read.state !== 'present') return;
    expect(read.snapshot.revision).toBe(1);
    expect(read.snapshot.authorityKeys).toHaveLength(1);
    expect(read.snapshot.authorityKeys[0]?.status).toBe('active');

    printed = [];
    runKeyringStatus(deps);
    const output = printed.join('\n');
    // Ids and hashes are fine to show; 32-byte hex key material is not.
    expect(output).toContain(read.snapshot.keyringId);
    expect(output).toContain(read.snapshot.activeAuthorityKeyId);
    expect(output).not.toMatch(/keyMaterial/i);
    expect(output).not.toMatch(/pseudonymRoot/i);
  });

  it('refuses to overwrite an existing keyring', () => {
    const deps = makeDeps();
    runKeyringInit(deps);
    const first = readKeyringState(deps);
    expect(first.state).toBe('present');
    if (first.state !== 'present') return;

    printed = [];
    runKeyringInit(deps);
    expect(printed.join('\n')).toMatch(/Reddedildi|Refused/);

    const second = readKeyringState(deps);
    expect(second.state === 'present' && second.snapshot.keyringId).toBe(first.snapshot.keyringId);
    expect(second.state === 'present' && second.snapshot.revision).toBe(1);
  });

  it('rotates only against the exact expected revision hash', () => {
    const deps = makeDeps();
    runKeyringInit(deps);
    const before = readKeyringState(deps);
    if (before.state !== 'present') throw new Error('keyring bekleniyordu');

    printed = [];
    runKeyringRotate(undefined, deps);
    expect(printed.join('\n')).toMatch(/expect-revision/);
    expect((readKeyringState(deps) as { snapshot: { revision: number } }).snapshot.revision).toBe(1);

    printed = [];
    expect(() => runKeyringRotate('0'.repeat(64), deps)).toThrow();
    expect((readKeyringState(deps) as { snapshot: { revision: number } }).snapshot.revision).toBe(1);

    printed = [];
    runKeyringRotate(before.snapshot.revisionHash, deps);
    const after = readKeyringState(deps);
    if (after.state !== 'present') throw new Error('keyring bekleniyordu');
    expect(after.snapshot.revision).toBe(2);
    expect(after.snapshot.activeAuthorityKeyId).not.toBe(before.snapshot.activeAuthorityKeyId);
    // A rotated-out key stays present so earlier evidence remains verifiable.
    expect(after.snapshot.authorityKeys.some(k => k.status === 'retired')).toBe(true);
  });

  it('refuses to rotate when nothing is provisioned', () => {
    const deps = makeDeps();
    runKeyringRotate('a'.repeat(64), deps);
    expect(printed.join('\n')).toMatch(/Reddedildi|Refused/);
    expect(readKeyringState(deps)).toEqual({ state: 'absent' });
  });

  it('doctor reports the keyring as a required pre-flight check', () => {
    const absent = buildProviderAuthorityKeyringCheck('en', () => ({ state: 'absent' }));
    expect(absent.passed).toBe(false);
    expect(absent.required).toBe(true);
    expect(absent.message).toContain('keyring init');

    const deps = makeDeps();
    runKeyringInit(deps);
    const ok = buildProviderAuthorityKeyringCheck('en', () => readKeyringState(deps));
    expect(ok.passed).toBe(true);
    expect(ok.required).toBe(true);
  });

  it('offers the keyring remedy only for keyring-caused holds', () => {
    expect(providerAuthorityHoldRemedy('keyring_unavailable', 'en')).toContain('keyring init');
    expect(providerAuthorityHoldRemedy('keyring_storage_unsafe', 'en')).toContain('keyring init');
    expect(providerAuthorityHoldRemedy('integrity_failure', 'en')).toBeNull();
    expect(providerAuthorityHoldRemedy('schema_migration_required', 'en')).toBeNull();
  });

  it('never writes into the project tree', () => {
    const deps = makeDeps();
    runKeyringInit(deps);
    const projectRoot = deps.resolveProjectRootFn!();
    expect(existsSync(projectRoot)).toBe(true);
    expect(readdirSync(projectRoot)).toEqual([]);
    expect(existsSync(join(projectRoot, 'keys'))).toBe(false);
  });
});
