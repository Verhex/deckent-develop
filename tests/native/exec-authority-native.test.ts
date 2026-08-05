import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, realpathSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// W3-PR-A: the addon is built on demand (CI job / `npm run build` inside
// native/exec-authority). Absence is the fail-closed contract, so this suite
// asserts the typed-absence shape always, and the primitive behavior only
// when a compiled binding is actually present.
import { loadExecAuthorityNative } from '../../native/exec-authority/index.mjs';

const loaded = loadExecAuthorityNative();

describe('exec-authority native loader (fail-closed contract)', () => {
  it('returns a typed availability result, never throws on absence', () => {
    if (loaded.available) {
      expect(typeof loaded.binding).toBe('object');
    } else {
      expect(loaded.reason).toMatch(/^binding-(not-built|load-failed:)/u);
    }
  });
});

describe.runIf(loaded.available)('exec-authority native primitives', () => {
  const native = (loaded as { available: true; binding: Record<string, CallableFunction> }).binding;

  function withTempTree<T>(fn: (root: string) => T): T {
    const root = mkdtempSync(join(tmpdir(), 'exec-auth-native-'));
    try {
      return fn(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('opens directories relative to a pinned parent and reports identity', () => {
    withTempTree(root => {
      mkdirSync(join(root, 'child'));
      const rootFd = native.openDirAt(null, root) as number;
      try {
        const childFd = native.openDirAt(rootFd, 'child') as number;
        try {
          const identity = native.fstatIdentity(childFd) as {
            dev: string; ino: string; isDirectory: boolean;
          };
          expect(identity.isDirectory).toBe(true);
          expect(BigInt(identity.ino)).toBeGreaterThan(0n);
          expect(BigInt(identity.dev)).toBeGreaterThan(0n);
        } finally {
          native.closeFd(childFd);
        }
      } finally {
        native.closeFd(rootFd);
      }
    });
  });

  it('refuses to traverse a symlink component (O_NOFOLLOW fail-closed)', () => {
    withTempTree(root => {
      mkdirSync(join(root, 'real'));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { symlinkSync } = require('node:fs') as typeof import('node:fs');
      symlinkSync(join(root, 'real'), join(root, 'link'));
      const rootFd = native.openDirAt(null, root) as number;
      try {
        expect(() => native.openDirAt(rootFd, 'link'))
          .toThrowError(/ELOOP|ENOTDIR|EMLINK/u);
      } finally {
        native.closeFd(rootFd);
      }
    });
  });

  it('lists, unlinks and removes entries strictly through the pinned handle', () => {
    withTempTree(root => {
      mkdirSync(join(root, 'dir'));
      writeFileSync(join(root, 'dir', 'a.txt'), 'a\n');
      writeFileSync(join(root, 'dir', 'b.txt'), 'b\n');
      const dirFd = native.openDirAt(null, join(root, 'dir')) as number;
      const rootFd = native.openDirAt(null, root) as number;
      try {
        expect((native.readdirFd(dirFd) as string[]).sort()).toEqual(['a.txt', 'b.txt']);
        native.unlinkAt(dirFd, 'a.txt', false);
        native.unlinkAt(dirFd, 'b.txt', false);
        expect(native.readdirFd(dirFd) as string[]).toEqual([]);
        native.unlinkAt(rootFd, 'dir', true);
        expect(existsSync(join(root, 'dir'))).toBe(false);
      } finally {
        native.closeFd(dirFd);
        native.closeFd(rootFd);
      }
    });
  });

  it('renames within pinned handles and keeps inode identity', () => {
    withTempTree(root => {
      writeFileSync(join(root, 'from.txt'), 'x\n');
      const rootFd = native.openDirAt(null, root) as number;
      try {
        native.renameAt(rootFd, 'from.txt', rootFd, 'to.txt');
        expect(existsSync(join(root, 'to.txt'))).toBe(true);
        expect(existsSync(join(root, 'from.txt'))).toBe(false);
      } finally {
        native.closeFd(rootFd);
      }
    });
  });

  it('resolves the kernel-verified CURRENT path of a handle (fdPath, W3-PR-B slice-2)', () => {
    withTempTree(root => {
      mkdirSync(join(root, 'inner'));
      const fd = native.openDirAt(null, join(root, 'inner')) as number;
      try {
        // Darwin: F_GETPATH; other POSIX: /proc readlink — both must agree
        // with the canonical filesystem view.
        expect(native.fdPath(fd)).toBe(realpathSync(join(root, 'inner')));
        // The path is CURRENT, not cached at open: a rename of the directory
        // is reflected by the very next fdPath call on the same handle.
        renameSync(join(root, 'inner'), join(root, 'renamed'));
        expect(native.fdPath(fd)).toBe(realpathSync(join(root, 'renamed')));
      } finally {
        native.closeFd(fd);
      }
    });
  });

  it('reports platform-typed mount and host/boot identity availability', () => {
    withTempTree(root => {
      const rootFd = native.openDirAt(null, root) as number;
      try {
        const mount = native.mountIdentity(rootFd) as { available: boolean; fsid?: string };
        const host = native.hostBootIdentity() as {
          available: boolean; hostUuid?: string; bootTime?: string;
        };
        if (process.platform === 'darwin') {
          expect(mount.available).toBe(true);
          expect(mount.fsid).toMatch(/^-?\d+:-?\d+$/u);
          expect(host.available).toBe(true);
          expect(host.hostUuid).toMatch(/^[0-9a-f-]{36}$/u);
          expect(BigInt(host.bootTime!)).toBeGreaterThan(0n);
        } else {
          expect(mount.available).toBe(false);
          expect(host.available).toBe(false);
        }
      } finally {
        native.closeFd(rootFd);
      }
    });
  });
});
