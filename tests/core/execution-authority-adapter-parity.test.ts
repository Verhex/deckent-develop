import { describe, expect, it } from 'vitest';
import { closeSync, mkdtempSync, openSync, rmSync, constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  linuxProcExecutionAuthorityAdapter,
  linuxProcExecutionAuthorityOpsV2,
  darwinNativeExecutionAuthorityOpsV2,
  resolveExecutionAuthorityOpsV2,
} from '../../src/core/file-lock.js';
// The build-time twin cannot be imported by production code (clean.mjs runs
// before dist/ exists); this contract test is the ONLY sanctioned coupling
// point between the two surfaces (PLATFORM-EXEC-AUTH-W1-INTERFACE-001).
import { cleanExecutionAuthorityAdapter, cleanExecutionAuthorityOpsV2 } from '../../scripts/clean.mjs';
// W3-PR-B slice-2: the native binding is built on demand (CI native job);
// its absence keeps every binding-backed block skipped, never guessed.
import { loadExecAuthorityNative } from '../../native/exec-authority/index.mjs';

const ADAPTER_SURFACE = ['classify', 'stableFdPath', 'pinnedMountId', 'directoryIdentity'];

const onLinux = process.platform === 'linux';
const onDarwin = process.platform === 'darwin';
const nativeAvailable = loadExecAuthorityNative().available;

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

describe('W3-PR-B slice-2 — darwin native ops-v2', () => {
  it('exposes the identical frozen op surface as both existing twins', () => {
    expect(Object.keys(darwinNativeExecutionAuthorityOpsV2).sort())
      .toEqual([...OPS_V2_SURFACE].sort());
    expect(Object.isFrozen(darwinNativeExecutionAuthorityOpsV2)).toBe(true);
  });

  it.runIf(onLinux)('resolver returns the /proc twin on linux and darwin classify fails closed', () => {
    expect(resolveExecutionAuthorityOpsV2()).toBe(linuxProcExecutionAuthorityOpsV2);
    // The darwin implementation must never activate off-platform (D3).
    expect(() => darwinNativeExecutionAuthorityOpsV2.classify())
      .toThrowError(/unsupported/iu);
  });

  it.runIf(onDarwin)('resolver returns the native ops on darwin', () => {
    expect(resolveExecutionAuthorityOpsV2()).toBe(darwinNativeExecutionAuthorityOpsV2);
  });

  it.runIf(onLinux && nativeAvailable)(
    'binding-backed ops behave identically to the /proc twin on a real tree',
    () => {
      // The exact code path Darwin ships, exercised on Linux CI: every op the
      // darwin surface fills from the binding must match the /proc facility.
      const root = mkdtempSync(join(tmpdir(), 'ops-v2-native-parity-'));
      try {
        const procOps = linuxProcExecutionAuthorityOpsV2;
        const nativeOps = darwinNativeExecutionAuthorityOpsV2;
        const procFd = procOps.openDirAt(null, root);
        const nativeFd = nativeOps.openDirAt(null, root);
        try {
          expect(nativeOps.realPathOf(nativeFd)).toBe(procOps.realPathOf(procFd));
          const { mkdirSync: mk, writeFileSync: wf } = require('node:fs') as typeof import('node:fs');
          mk(join(root, 'child'));
          wf(join(root, 'child', 'x.txt'), 'x\n');
          const childFd = nativeOps.openDirAt(nativeFd, 'child');
          const procChildFd = procOps.openDirAt(procFd, 'child');
          try {
            expect(nativeOps.readdirOf(childFd)).toEqual(procOps.readdirOf(procChildFd));
            nativeOps.renameAt(childFd, 'x.txt', childFd, 'y.txt');
            expect(procOps.readdirOf(childFd)).toEqual(['y.txt']);
            nativeOps.unlinkAt(childFd, 'y.txt', false);
            expect(nativeOps.readdirOf(childFd)).toEqual([]);
          } finally {
            nativeOps.closeFd(childFd);
            procOps.closeFd(procChildFd);
          }
          nativeOps.unlinkAt(nativeFd, 'child', true);
          // identityOf needs a mount-identity source; on Linux the binding's
          // f_fsid facility is typed-absent, so the darwin surface must fail
          // CLOSED here rather than inventing a mountId (negative pin).
          expect(() => nativeOps.identityOf(nativeFd)).toThrowError(/mount identity/iu);
        } finally {
          procOps.closeFd(procFd);
          nativeOps.closeFd(nativeFd);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.runIf(onDarwin && nativeAvailable)(
    'performs the full pinned-handle lifecycle on real Darwin',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'ops-v2-darwin-'));
      try {
        const ops = darwinNativeExecutionAuthorityOpsV2;
        expect(ops.classify()).toBe('darwin');
        const rootFd = ops.openDirAt(null, root);
        try {
          const identity = ops.identityOf(rootFd);
          expect(identity.dev).toMatch(/^\d+$/u);
          expect(identity.ino).toMatch(/^\d+$/u);
          expect(identity.mountId).toMatch(/^-?\d+:-?\d+$/u); // f_fsid pair
          const { realpathSync: rp, mkdirSync: mk, writeFileSync: wf } =
            require('node:fs') as typeof import('node:fs');
          expect(ops.realPathOf(rootFd)).toBe(rp(root));
          mk(join(root, 'child'));
          wf(join(root, 'child', 'x.txt'), 'x\n');
          const childFd = ops.openDirAt(rootFd, 'child');
          try {
            expect(ops.readdirOf(childFd)).toEqual(['x.txt']);
            ops.renameAt(childFd, 'x.txt', childFd, 'y.txt');
            expect(ops.readdirOf(childFd)).toEqual(['y.txt']);
            ops.unlinkAt(childFd, 'y.txt', false);
            expect(ops.readdirOf(childFd)).toEqual([]);
          } finally {
            ops.closeFd(childFd);
          }
          ops.unlinkAt(rootFd, 'child', true);
        } finally {
          ops.closeFd(rootFd);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
