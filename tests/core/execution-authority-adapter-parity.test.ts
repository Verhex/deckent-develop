import { describe, expect, it } from 'vitest';
import { closeSync, mkdtempSync, openSync, rmSync, constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { linuxProcExecutionAuthorityAdapter } from '../../src/core/file-lock.js';
// The build-time twin cannot be imported by production code (clean.mjs runs
// before dist/ exists); this contract test is the ONLY sanctioned coupling
// point between the two surfaces (PLATFORM-EXEC-AUTH-W1-INTERFACE-001).
import { cleanExecutionAuthorityAdapter } from '../../scripts/clean.mjs';

const ADAPTER_SURFACE = ['classify', 'stableFdPath', 'pinnedMountId', 'directoryIdentity'];

const onLinux = process.platform === 'linux';

describe('PLATFORM-EXEC-AUTH-W1-INTERFACE-001 — twin adapter parity', () => {
  it('exposes the identical frozen four-capability surface on both twins', () => {
    for (const adapter of [linuxProcExecutionAuthorityAdapter, cleanExecutionAuthorityAdapter]) {
      expect(Object.keys(adapter).sort()).toEqual([...ADAPTER_SURFACE].sort());
      expect(Object.isFrozen(adapter)).toBe(true);
      for (const method of ADAPTER_SURFACE) {
        expect(typeof (adapter as Record<string, unknown>)[method]).toBe('function');
      }
    }
  });

  it.runIf(onLinux)('classifies the same platform value on both twins', () => {
    expect(cleanExecutionAuthorityAdapter.classify())
      .toBe(linuxProcExecutionAuthorityAdapter.classify());
  });

  it('builds byte-identical stable fd paths', () => {
    for (const fd of [0, 7, 4096]) {
      expect(cleanExecutionAuthorityAdapter.stableFdPath(fd))
        .toBe(linuxProcExecutionAuthorityAdapter.stableFdPath(fd));
    }
  });

  it.runIf(onLinux)('derives the identical directory identity for the same real fd', () => {
    const root = mkdtempSync(join(tmpdir(), 'exec-auth-parity-'));
    const fd = openSync(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    try {
      const lockSide = linuxProcExecutionAuthorityAdapter.directoryIdentity(fd);
      const cleanSide = cleanExecutionAuthorityAdapter.directoryIdentity(fd);
      expect(cleanSide).toEqual(lockSide);
      expect(cleanExecutionAuthorityAdapter.pinnedMountId(fd)).toBe(lockSide.mountId);
    } finally {
      closeSync(fd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.runIf(onLinux)('fails closed with each namespace-typed error for an invalid fd', () => {
    // Same fail-closed decision, each side's own error namespace by design.
    expect(() => linuxProcExecutionAuthorityAdapter.pinnedMountId(-1))
      .toThrowError(/mount identity/iu);
    expect(() => cleanExecutionAuthorityAdapter.pinnedMountId(-1))
      .toThrowError(/E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED/u);
  });
});
