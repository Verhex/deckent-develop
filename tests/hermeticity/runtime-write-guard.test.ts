import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import * as nodeFs from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createRuntimeWritePolicy,
  isPathWithin,
  normalizeComparablePath,
  physicalAncestorFromModuleUrl,
  RUNTIME_FS_API_CLASSIFICATION,
} from './runtime-write-guard.js';

const GUARD_MODULE_URL = new URL('./runtime-write-guard.ts', import.meta.url).href;
const temporaryRoots: string[] = [];

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

async function runGuardProbe(root: string): Promise<Record<string, string | boolean>> {
  const source = `
    import fs from 'node:fs';
    import fsp from 'node:fs/promises';
    import { join } from 'node:path';
    import { installRuntimeWriteGuard } from ${JSON.stringify(GUARD_MODULE_URL)};

    const root = ${JSON.stringify(root)};
    const tasks = join(root, '.tasks');
    const dist = join(root, 'dist');
    fs.mkdirSync(tasks, { recursive: true });
    fs.mkdirSync(dist, { recursive: true });
    const sentinel = join(tasks, 'sentinel.txt');
    const sourceFile = join(root, 'source.txt');
    const safeDirectory = join(root, 'sandbox');
    fs.writeFileSync(sentinel, 'preserve', { mode: 0o600 });
    fs.writeFileSync(sourceFile, 'source');
    fs.mkdirSync(safeDirectory, { recursive: true });
    const cachedFs = {
      write: fs.write,
      writeSync: fs.writeSync,
      fsync: fs.fsync,
      fsyncSync: fs.fsyncSync,
      close: fs.close,
      closeSync: fs.closeSync,
      open: fs.open,
      openSync: fs.openSync,
      mkdir: fs.mkdir,
      mkdirSync: fs.mkdirSync,
    };
    const protectedFd = fs.openSync(sentinel, 'a');
    const fsContractBefore = Object.fromEntries(
      ['writeFileSync', 'writeFile', 'openSync', 'createWriteStream'].map(key => [
        key,
        { name: fs[key].name, length: fs[key].length },
      ]),
    );
    installRuntimeWriteGuard(root);

    const observe = async (operation) => {
      try {
        await operation();
        return 'ALLOWED';
      } catch (error) {
        return error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'UNTYPED';
      }
    };

    const result = {};
    result.readConstructorAliasIdentity = fs.FileReadStream === fs.ReadStream;
    result.writeConstructorAliasIdentity = fs.FileWriteStream === fs.WriteStream;
    result.functionShapePreserved = Object.entries(fsContractBefore).every(
      ([key, expected]) => fs[key].name === expected.name && fs[key].length === expected.length,
    );
    result.syncWrite = await observe(() => fs.writeFileSync(join(tasks, 'sync.txt'), 'x'));
    result.constructedSyncWrite = await observe(
      () => new fs.writeFileSync(join(tasks, 'constructed-sync.txt'), 'x'),
    );
    result.asyncWrite = await observe(() => fsp.writeFile(join(tasks, 'async.txt'), 'x'));
    result.distOpen = await observe(() => {
      const fd = fs.openSync(join(dist, 'open.txt'), 'w');
      fs.closeSync(fd);
    });
    result.distCopy = await observe(() => fs.copyFileSync(sourceFile, join(dist, 'copy.txt')));
    result.readFdMutation = await observe(() => {
      const fd = fs.openSync(sentinel, 'r');
      fs.fchmodSync(fd, 0o644);
      fs.closeSync(fd);
    });
    result.readHandleMutation = await observe(async () => {
      const handle = await fsp.open(sentinel, 'r');
      try {
        await handle.chmod(0o644);
      } finally {
        await handle.close();
      }
    });
    result.readStream = await observe(() => {
      const stream = fs.createReadStream(sentinel);
      stream.on('error', () => {});
      stream.destroy();
    });
    result.readStreamConstructor = await observe(() => {
      const stream = new fs.ReadStream(sentinel);
      stream.on('error', () => {});
      stream.destroy();
    });
    result.writeStreamConstructor = await observe(() => {
      const stream = new fs.WriteStream(join(dist, 'constructor.txt'));
      stream.on('error', () => {});
      stream.destroy();
    });
    result.utf8CachedFs = await observe(() => {
      const stream = new fs.Utf8Stream({
        dest: join(tasks, 'utf8-cached-fs.txt'),
        fs: cachedFs,
        sync: true,
      });
      stream.write('bypass');
      stream.end();
    });
    result.utf8NumericFd = await observe(() => {
      const stream = new fs.Utf8Stream({
        fd: protectedFd,
        fs: cachedFs,
        sync: true,
      });
      stream.write('bypass');
      stream.end();
    });
    result.utf8Reopen = await observe(() => {
      const stream = new fs.Utf8Stream({
        dest: join(safeDirectory, 'utf8-safe.txt'),
        fs: cachedFs,
        sync: true,
      });
      stream.on('error', () => {});
      try {
        stream.reopen(join(tasks, 'utf8-reopen.txt'));
      } finally {
        stream.destroy();
      }
    });
    result.disposableSync = await observe(() => {
      const disposable = fs.mkdtempDisposableSync(join(tasks, 'sync-disposable-'));
      disposable.remove();
    });
    result.disposableAsync = await observe(async () => {
      const disposable = await fsp.mkdtempDisposable(join(tasks, 'async-disposable-'));
      await disposable.remove();
    });
    result.dotdotName = await observe(
      () => fs.writeFileSync(join(tasks, '..escape', 'file.txt'), 'x'),
    );
    result.tempAllowed = await observe(
      () => fs.writeFileSync(join(safeDirectory, 'allowed.txt'), 'x'),
    );
    result.ancestorRemove = await observe(() => fs.rmSync(root, { recursive: true, force: true }));
    result.rootStillExists = fs.existsSync(root);
    result.sentinelMode = fs.existsSync(sentinel)
      ? (fs.statSync(sentinel).mode & 0o777).toString(8)
      : 'missing';
    cachedFs.closeSync(protectedFd);
    process.stdout.write(JSON.stringify(result));
  `;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ['--input-type=module', '--eval', source],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectPromise(new Error(`guard probe exited ${String(code)}: ${stderr}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout) as Record<string, string | boolean>);
      } catch (error) {
        rejectPromise(new Error(`guard probe returned invalid JSON: ${stdout}`, { cause: error }));
      }
    });
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('runtime hermetic write guard', () => {
  it('intercepts guarded path capabilities inside a nonce fake repository', async () => {
    const root = temporaryRoot('deckent-hermetic-runtime-probe-');
    const result = await runGuardProbe(root);

    expect(result).toEqual({
      readConstructorAliasIdentity: true,
      writeConstructorAliasIdentity: true,
      functionShapePreserved: true,
      syncWrite: 'E_HERMETIC_TASKS_WRITE',
      constructedSyncWrite: 'E_HERMETIC_TASKS_WRITE',
      asyncWrite: 'E_HERMETIC_TASKS_WRITE',
      distOpen: 'E_HERMETIC_DIST_CLEAN',
      distCopy: 'E_HERMETIC_DIST_CLEAN',
      readFdMutation: 'E_HERMETIC_TASKS_WRITE',
      readHandleMutation: 'E_HERMETIC_TASKS_WRITE',
      readStream: 'E_HERMETIC_TASKS_WRITE',
      readStreamConstructor: 'E_HERMETIC_TASKS_WRITE',
      writeStreamConstructor: 'E_HERMETIC_DIST_CLEAN',
      utf8CachedFs: 'E_HERMETIC_TASKS_WRITE',
      utf8NumericFd: 'E_HERMETIC_UNTRACKED_FD',
      utf8Reopen: 'E_HERMETIC_TASKS_WRITE',
      disposableSync: 'E_HERMETIC_TASKS_WRITE',
      disposableAsync: 'E_HERMETIC_TASKS_WRITE',
      dotdotName: 'E_HERMETIC_TASKS_WRITE',
      tempAllowed: 'ALLOWED',
      ancestorRemove: 'E_HERMETIC_TASKS_WRITE',
      rootStillExists: true,
      sentinelMode: '600',
    });
  });

  it('allows writes owned by a nonce temp root', () => {
    const root = temporaryRoot('deckent-hermetic-allowed-');
    const target = join(root, 'nested', 'file.txt');
    mkdirSync(join(root, 'nested'), { recursive: true });
    expect(() => writeFileSync(target, 'allowed')).not.toThrow();
  });

  it('resolves symlink ancestors before policy decisions', () => {
    const protectedRoot = temporaryRoot('deckent-hermetic-protected-');
    const outsideRoot = temporaryRoot('deckent-hermetic-link-');
    const policy = createRuntimeWritePolicy(protectedRoot);
    const protectedTasks = join(protectedRoot, '.tasks');
    mkdirSync(protectedTasks, { recursive: true });
    const tasksAlias = join(outsideRoot, 'tasks-alias');
    symlinkSync(protectedTasks, tasksAlias, process.platform === 'win32' ? 'junction' : 'dir');

    expect(() => policy.assertWritable('fixture', join(tasksAlias, 'escape.txt')))
      .toThrow(/E_HERMETIC_TASKS_WRITE/);
  });

  it('treats a descendant named ..escape as inside the protected root', () => {
    const protectedRoot = temporaryRoot('deckent-hermetic-dotdot-name-');
    const policy = createRuntimeWritePolicy(protectedRoot);

    expect(() => policy.assertWritable(
      'fixture',
      join(protectedRoot, '.tasks', '..escape', 'file.txt'),
    )).toThrow(/E_HERMETIC_TASKS_WRITE/);
  });

  it('blocks an ancestor mutation that would recursively remove protected roots', () => {
    const protectedRoot = temporaryRoot('deckent-hermetic-overlap-');
    const policy = createRuntimeWritePolicy(protectedRoot);
    const sentinel = join(protectedRoot, '.tasks', 'sentinel.txt');
    mkdirSync(join(protectedRoot, '.tasks'), { recursive: true });
    writeFileSync(sentinel, 'preserve');

    expect(() => policy.assertWritable('fs.rmSync', protectedRoot))
      .toThrow(/E_HERMETIC_TASKS_WRITE/);
    expect(() => policy.assertWritable('fs.rmSync', join(protectedRoot, '..')))
      .toThrow(/E_HERMETIC_TASKS_WRITE/);
  });

  it.skipIf(process.platform === 'win32')(
    'derives module authority from the physical file behind a symlink',
    () => {
      const root = temporaryRoot('deckent-hermetic-module-link-');
      const moduleLink = join(root, 'runtime-write-guard.ts');
      symlinkSync(new URL('./runtime-write-guard.ts', import.meta.url), moduleLink);

      expect(physicalAncestorFromModuleUrl(pathToFileURL(moduleLink).href, 2))
        .toBe(physicalAncestorFromModuleUrl(import.meta.url, 2));
    },
  );

  it('fails loudly when Node adds an unclassified fs function', () => {
    const callbackClassified = new Set<string>([
      ...RUNTIME_FS_API_CLASSIFICATION.pathMutations,
      ...RUNTIME_FS_API_CLASSIFICATION.pathOpeners,
      ...RUNTIME_FS_API_CLASSIFICATION.fdCapabilities,
      ...RUNTIME_FS_API_CLASSIFICATION.statefulPathWriters,
      ...RUNTIME_FS_API_CLASSIFICATION.nonMutatingOrControl,
    ]);
    const promiseClassified = new Set<string>([
      ...RUNTIME_FS_API_CLASSIFICATION.promisePathMutations,
      ...RUNTIME_FS_API_CLASSIFICATION.promiseNonMutatingOrControl,
    ]);
    const callbackFunctions = Object.keys(nodeFs)
      .filter(key => typeof (nodeFs as Record<string, unknown>)[key] === 'function');
    const promiseFunctions = Object.keys(nodeFs.promises)
      .filter(key => typeof (nodeFs.promises as unknown as Record<string, unknown>)[key] === 'function');

    expect(callbackFunctions.filter(key => !callbackClassified.has(key))).toEqual([]);
    expect(promiseFunctions.filter(key => !promiseClassified.has(key))).toEqual([]);
  });
});

describe('cross-platform path comparison', () => {
  it('case-folds Windows drive paths and accepts descendants', () => {
    expect(isPathWithin(
      'C:\\Work\\Deckent\\.tasks\\task-1.hb',
      'c:\\work\\deckent\\.tasks',
      'win32',
    )).toBe(true);
  });

  it('normalizes Windows namespaced UNC paths without widening siblings', () => {
    expect(normalizeComparablePath('\\\\?\\UNC\\Server\\Share\\Deckent\\', 'win32'))
      .toBe('\\\\server\\share\\deckent');
    expect(isPathWithin(
      '\\\\server\\share\\deckent-other',
      '\\\\server\\share\\deckent',
      'win32',
    )).toBe(false);
  });

  it('normalizes lowercase Windows UNC namespaces and alternate data streams', () => {
    expect(isPathWithin(
      '\\\\?\\unc\\Server\\Share\\Deckent\\.tasks\\x',
      '\\\\server\\share\\deckent\\.tasks',
      'win32',
    )).toBe(true);
    expect(isPathWithin(
      'C:\\work\\deckent\\.tasks:stream',
      'C:\\work\\deckent\\.tasks',
      'win32',
    )).toBe(true);
  });

  it('normalizes Win32 trailing-dot and trailing-space aliases by segment', () => {
    for (const alias of [
      'C:\\repo\\.tasks.\\x',
      'C:\\repo\\.tasks \\x',
      'C:\\repo\\.tasks...   \\x',
    ]) {
      expect(isPathWithin(alias, 'C:\\repo\\.tasks', 'win32')).toBe(true);
    }
    expect(isPathWithin(
      'C:\\repo\\.tasks-other. \\x',
      'C:\\repo\\.tasks',
      'win32',
    )).toBe(false);
  });

  it('preserves literal trailing-dot semantics for Windows extended namespaces', () => {
    expect(isPathWithin(
      '\\\\?\\C:\\repo\\.tasks\\x',
      'C:\\repo\\.tasks',
      'win32',
    )).toBe(true);
    expect(isPathWithin(
      '\\\\?\\C:\\repo\\.tasks.\\x',
      'C:\\repo\\.tasks',
      'win32',
    )).toBe(false);
  });

  it('conservatively case-folds Darwin paths across volume semantics', () => {
    expect(isPathWithin(
      '/work/deckent/.TASKS/task-1.hb',
      '/work/deckent/.tasks',
      'darwin',
    )).toBe(true);
  });

  it('conservatively case-folds POSIX paths for WSL and remote-volume semantics', () => {
    expect(isPathWithin('/work/deckent/.tasks/a', '/work/deckent/.tasks', 'posix')).toBe(true);
    expect(isPathWithin('/work/Deckent/.TASKS/a', '/work/deckent/.tasks', 'posix')).toBe(true);
  });

  it('does not confuse a leading-dot descendant name with parent traversal', () => {
    expect(isPathWithin(
      '/work/deckent/.tasks/..escape/file',
      '/work/deckent/.tasks',
      'posix',
    )).toBe(true);
    expect(isPathWithin(
      '/work/deckent/escape',
      '/work/deckent/.tasks',
      'posix',
    )).toBe(false);
  });
});
