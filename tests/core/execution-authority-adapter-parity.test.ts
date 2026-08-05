import { describe, expect, it } from 'vitest';
import { closeSync, mkdtempSync, openSync, rmSync, constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { linuxProcExecutionAuthorityAdapter, linuxProcExecutionAuthorityOpsV2 } from '../../src/core/file-lock.js';
// The build-time twin cannot be imported by production code (clean.mjs runs
// before dist/ exists); this contract test is the ONLY sanctioned coupling
// point between the two surfaces (PLATFORM-EXEC-AUTH-W1-INTERFACE-001).
import { cleanExecutionAuthorityAdapter, cleanExecutionAuthorityOpsV2 } from '../../scripts/clean.mjs';

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

const OPS_V2_SURFACE = ['classify', 'openDirAt', 'closeFd', 'readdirOf', 'unlinkAt', 'renameAt', 'identityOf', 'realPathOf'];

describe('W3-PR-B slice-1 — ops-v2 twin parity', () => {
  it('exposes the identical frozen op surface on both twins', () => {
    for (const ops of [linuxProcExecutionAuthorityOpsV2, cleanExecutionAuthorityOpsV2]) {
      expect(Object.keys(ops).sort()).toEqual([...OPS_V2_SURFACE].sort());
      expect(Object.isFrozen(ops)).toBe(true);
    }
  });

  it.runIf(onLinux)('performs identical pinned-handle ops on a real tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'ops-v2-parity-'));
    try {
      const a = linuxProcExecutionAuthorityOpsV2;
      const b = cleanExecutionAuthorityOpsV2;
      const fdA = a.openDirAt(null, root);
      const fdB = b.openDirAt(null, root);
      try {
        expect(b.identityOf(fdB)).toEqual(a.identityOf(fdA));
        expect(b.realPathOf(fdB)).toBe(a.realPathOf(fdA));
        // child dir through the pinned handle, then readdir/rename/unlink parity
        const { mkdirSync: mk, writeFileSync: wf } = require('node:fs') as typeof import('node:fs');
        mk(join(root, 'child'));
        wf(join(root, 'child', 'x.txt'), 'x\n');
        const childA = a.openDirAt(fdA, 'child');
        try {
          expect(a.readdirOf(childA)).toEqual(['x.txt']);
          a.renameAt(childA, 'x.txt', childA, 'y.txt');
          expect(b.readdirOf(childA)).toEqual(['y.txt']);
          a.unlinkAt(childA, 'y.txt', false);
          expect(a.readdirOf(childA)).toEqual([]);
        } finally {
          a.closeFd(childA);
        }
        a.unlinkAt(fdA, 'child', true);
      } finally {
        a.closeFd(fdA);
        b.closeFd(fdB);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
