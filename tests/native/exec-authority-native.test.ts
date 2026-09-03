import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { release as osRelease, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// W3-PR-A: the addon is built on demand (CI job / `npm run build` inside
// native/exec-authority). Absence is the fail-closed contract, so this suite
// asserts the typed-absence shape always, and the primitive behavior only
// when a compiled binding is actually present.
import { loadExecAuthorityNative } from '../../native/exec-authority/index.mjs';
import {
  executionEffectNativeCaptureManifestDigestV1,
  type ExecutionEffectNativeCaptureTreeV1,
} from '../../src/core/execution-effect-containment.js';

const loaded = loadExecAuthorityNative();
const ACTIVE_LINUX_NATIVE_RUNTIME = process.platform === 'linux';
const PROJECT_ROOT = realpathSync(fileURLToPath(new URL('../..', import.meta.url)));
const INSTALLED_NATIVE_VERIFIER = join(
  PROJECT_ROOT,
  'scripts',
  'verify-exec-authority-native-package.mjs',
);

interface VerifierResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

function expectedEnvironmentKind(): 'linux' | 'wsl2' {
  const kernel = osRelease().toLowerCase();
  return kernel.includes('microsoft') && kernel.includes('wsl2') ? 'wsl2' : 'linux';
}

function createInstalledVerifierFixture(runtimeSource?: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'deckent-native-verifier-')));
  mkdirSync(join(root, 'dist', 'core'), { recursive: true });
  mkdirSync(join(root, 'native', 'exec-authority'), { recursive: true });
  cpSync(join(PROJECT_ROOT, 'package.json'), join(root, 'package.json'));
  cpSync(join(PROJECT_ROOT, 'npm-shrinkwrap.json'), join(root, 'npm-shrinkwrap.json'));
  for (const filename of ['binding.gyp', 'index.mjs', 'package.json']) {
    cpSync(
      join(PROJECT_ROOT, 'native', 'exec-authority', filename),
      join(root, 'native', 'exec-authority', filename),
    );
  }
  cpSync(
    join(PROJECT_ROOT, 'native', 'exec-authority', 'src'),
    join(root, 'native', 'exec-authority', 'src'),
    { recursive: true },
  );
  cpSync(
    join(PROJECT_ROOT, 'native', 'exec-authority', 'prebuilds'),
    join(root, 'native', 'exec-authority', 'prebuilds'),
    { recursive: true },
  );
  const installedRuntimePath = join(root, 'dist', 'core', 'exec-authority-native.js');
  if (runtimeSource === undefined) {
    cpSync(
      join(PROJECT_ROOT, 'dist', 'core', 'exec-authority-native.js'),
      installedRuntimePath,
    );
  } else {
    writeFileSync(installedRuntimePath, runtimeSource, { mode: 0o600 });
  }
  return root;
}

function shrinkwrapSha256(packageRoot: string): string {
  return `sha256:${createHash('sha256')
    .update(readFileSync(join(packageRoot, 'npm-shrinkwrap.json')))
    .digest('hex')}`;
}

function runInstalledNativeVerifier(
  packageRoot: string,
  childTimeoutMs = 5_000,
): Promise<VerifierResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const childEnv = {
      ...process.env,
      DECKENT_NATIVE_VERIFY_CHILD_TIMEOUT_MS: String(childTimeoutMs),
    };
    for (const name of [
      'VITEST',
      'VITEST_POOL_ID',
      'VITEST_WORKER_ID',
      'NODE_ENV',
      'DECKENT_TEST_HERMETICITY',
      'NODE_CHANNEL_FD',
      'NODE_CHANNEL_SERIALIZATION_MODE',
    ]) delete childEnv[name];
    const child = spawn(process.execPath, [
      INSTALLED_NATIVE_VERIFIER,
      '--package-root',
      packageRoot,
      '--expected-environment',
      expectedEnvironmentKind(),
      '--expected-shrinkwrap-sha256',
      shrinkwrapSha256(packageRoot),
    ], {
      cwd: packageRoot,
      env: childEnv,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', rejectPromise);
    child.once('close', (exitCode, signal) => {
      resolvePromise({ exitCode, signal, stdout, stderr });
    });
  });
}

function rejectedVerifierCode(result: VerifierResult): string | undefined {
  if (result.stderr.length === 0) return undefined;
  return (JSON.parse(result.stderr) as { readonly code?: string }).code;
}

describe('exec-authority native loader (fail-closed contract)', () => {
  it('requires a real canonical binding for the active Linux proof cell', () => {
    if (ACTIVE_LINUX_NATIVE_RUNTIME) {
      if (!loaded.available) {
        // Source fan-in intentionally does not rebuild in this lane. An older
        // packaged binary without effect-v2 exports must become typed
        // unavailable; it must never be admitted through a legacy fallback.
        expect([
          'binding-contract-mismatch',
          'binding-not-built',
          'binding-package-metadata-invalid',
        ]).toContain(loaded.reason);
      } else {
        expect(loaded.manifest.effectContract).toMatchObject({
          available: true,
          abiName: 'deckent.execution-effect',
          abiVersion: '2.1.0',
          handleAbi: 'deckent.execution-effect.opaque-generation.v2',
          trustDomain: 'execution-effect-linux-v1',
        });
      }
      return;
    }

    // macOS and Windows-native are explicit residuals. Their loader state is
    // still typed, but this T20 suite does not promote either platform to GO.
    if (loaded.available) {
      expect(typeof loaded.binding).toBe('object');
    } else {
      expect([
        'binding-artifact-digest-mismatch',
        'binding-artifact-invalid',
        'binding-contract-mismatch',
        'binding-debug-not-authorized',
        'binding-layout-ambiguous',
        'binding-load-failed',
        'binding-load-snapshot-unverified',
        'binding-not-built',
        'binding-package-metadata-invalid',
        'binding-runtime-napi-unsupported',
      ]).toContain(loaded.reason);
    }
  });

  it('does not downgrade a built Linux prebuild to metadata-unavailable on read-only foreign-owned mount ancestors', () => {
    const prebuildRoot = join(
      PROJECT_ROOT,
      'native',
      'exec-authority',
      'prebuilds',
      'linux-x64',
      'napi-v8',
    );
    if (ACTIVE_LINUX_NATIVE_RUNTIME
      && existsSync(join(prebuildRoot, 'artifact.json'))
      && existsSync(join(prebuildRoot, 'exec_authority.node'))) {
      expect(loaded).toMatchObject({
        available: true,
        manifest: {
          platform: 'linux',
          arch: 'x64',
        },
      });
    }
  });

  it('keeps malformed root-separation results and alias ambiguity fail-closed', () => {
    const loaderSource = readFileSync(
      new URL('../../native/exec-authority/index.mjs', import.meta.url),
      'utf8',
    );
    const typedSource = readFileSync(
      new URL('../../src/core/exec-authority-native.ts', import.meta.url),
      'utf8',
    );
    const posixSource = readFileSync(
      new URL('../../native/exec-authority/src/custody_posix.c', import.meta.url),
      'utf8',
    );
    expect(loaderSource).toContain(
      "hasExactFrozenDataShape(value, CUSTODY_ROOT_SEPARATION_RESULT_KEYS)",
    );
    expect(typedSource).toContain(
      'hasExactFrozenDataShape(value, ROOT_SEPARATION_RESULT_KEYS)',
    );
    expect(typedSource).toContain(
      "return 'E_EXEC_AUTH_NATIVE_ROOT_SEPARATION_UNCONFIRMED';",
    );
    expect(posixSource).toContain('mount_alias_is_ambiguous');
    expect(posixSource).toContain('DECKENT_NATIVE_ERROR_ROOT_SEPARATION_UNCONFIRMED');
    const proofStart = posixSource.indexOf('static napi_value invoke_prove_root_separation');
    const proofEnd = posixSource.indexOf('static bool open_directory_component', proofStart);
    expect(proofStart).toBeGreaterThan(0);
    expect(proofEnd).toBeGreaterThan(proofStart);
    expect(posixSource.slice(proofStart, proofEnd)).not.toMatch(
      /(?:realpath|mountinfo|\/proc\/)/u,
    );
  });

  it('transfers POSIX created-directory rollback authority to the common result gate', () => {
    const posixSource = readFileSync(
      new URL('../../native/exec-authority/src/custody_posix.c', import.meta.url),
      'utf8',
    );
    expect(posixSource).toContain('resolve_named_create_guard');
    expect(posixSource).toContain('deckent_native_bind_created_result_guard(');
    expect(posixSource).not.toContain('DECKENT_NATIVE_CREATE_DIAG');
  });

  it('sizes the common effect dispatch argv for the full source-read contract', () => {
    const commonSource = readFileSync(
      new URL('../../native/exec-authority/src/exec_authority.c', import.meta.url),
      'utf8',
    );
    const effectInvoke = commonSource.slice(
      commonSource.indexOf('static napi_value EffectInvoke'),
      commonSource.indexOf('static napi_value EffectCloseHandle'),
    );
    expect(effectInvoke).toContain('size_t argc = 8u;');
    expect(effectInvoke).toContain('napi_value argv[8];');
  });

  it('derives the binary build type from the exact node-gyp configuration', () => {
    const bindingGyp = readFileSync(
      new URL('../../native/exec-authority/binding.gyp', import.meta.url),
      'utf8',
    );
    const entrySource = readFileSync(
      new URL('../../native/exec-authority/src/exec_authority.c', import.meta.url),
      'utf8',
    );
    expect(bindingGyp).toContain(
      '"DECKENT_EXEC_AUTHORITY_BUILD_TYPE=\\"Debug\\""',
    );
    expect(bindingGyp).toContain(
      '"DECKENT_EXEC_AUTHORITY_BUILD_TYPE=\\"Release\\""',
    );
    expect(entrySource).toContain(
      '#define DECKENT_COMPILED_BUILD_TYPE DECKENT_EXEC_AUTHORITY_BUILD_TYPE',
    );
    expect(entrySource).not.toContain('!defined(NDEBUG)');
  });
});

describe.runIf(ACTIVE_LINUX_NATIVE_RUNTIME && loaded.available)(
  'execution-effect v2 real Linux handle and capture boundary',
  () => {
    const state = loaded as {
      readonly available: true;
      readonly effect: {
        readonly beginSourceRead: (root: object, authority: object) => {
          readonly handle: object; readonly sourceObjectIdentityDigest: string;
        };
        readonly captureTree: (root: object, limits: object, cancel?: string) => unknown;
        readonly closeHandle: (handle: object) => void;
        readonly finishSourceRead: (source: object) => {
          readonly chunkCount: number; readonly contentDigest: string;
          readonly observedBytes: number; readonly sourceObjectIdentityDigest: string;
        };
        readonly nextSourceChunk: (source: object, cancel?: string) => {
          readonly byteLength: number; readonly byteOffset: number; readonly bytes: Uint8Array;
          readonly index: number; readonly observedBytes: number;
        };
        readonly openRoot: (kind: string, path: string) => { readonly handle: object };
      };
      readonly custody: {
        readonly closeHandle: (handle: object) => void;
        readonly openRoot: (
          path: string,
          disposition: string,
          privacy: string,
        ) => { readonly accepted: boolean; readonly value: { readonly handle: object } };
      };
    };
    const limits = () => ({
      deadlineUnixMs: Date.now() + 5_000,
      maxDepth: 64,
      maxEntries: 1024,
      maxFileBytes: 1_048_576,
      maxManifestBytes: 1_048_576,
      maxNameBytes: 255,
      maxPathBytes: 4096,
      maxTotalBytes: 8_388_608,
    });
    const nativeCode = (action: () => unknown, expected: RegExp): void => {
      let observed: unknown = null;
      try { action(); } catch (error) { observed = error; }
      expect(observed).toMatchObject({ code: expect.stringMatching(expected) });
    };

    it('rejects forged, stale and cross-domain handles', () => {
      const root = mkdtempSync(join(tmpdir(), 'effect-handle-boundary-'));
      try {
        const opened = state.effect.openRoot('WORKSPACE', root);
        nativeCode(
          () => state.effect.captureTree(Object.freeze({}), limits()),
          /^E_EXEC_AUTH_NATIVE_HANDLE_(?:FORGED|FOREIGN)$/u,
        );
        state.effect.closeHandle(opened.handle);
        nativeCode(
          () => state.effect.captureTree(opened.handle, limits()),
          /^(?:E_EXEC_AUTH_NATIVE_HANDLE_CLOSED|E_EXEC_AUTH_NATIVE_HANDLE_STALE)$/u,
        );
        const custody = state.custody.openRoot(root, 'OPEN_EXISTING', 'OWNER_PRIVATE');
        expect(custody.accepted).toBe(true);
        try {
          nativeCode(
            () => state.effect.captureTree(custody.value.handle, limits()),
            /^(?:E_EXEC_AUTH_NATIVE_HANDLE_FORGED|E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN)$/u,
          );
        } finally {
          state.custody.closeHandle(custody.value.handle);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('rejects cancellation, bounds, symbolic links and hard links', () => {
      const root = mkdtempSync(join(tmpdir(), 'effect-capture-boundary-'));
      const target = join(root, 'target.txt');
      writeFileSync(target, 'native-effect\n');
      const opened = state.effect.openRoot('WORKSPACE', root);
      try {
        nativeCode(
          () => state.effect.captureTree(opened.handle, limits(), 'CANCELLED'),
          /^E_EXEC_AUTH_EFFECT_CANCELLED$/u,
        );
        nativeCode(
          () => state.effect.captureTree(opened.handle, { ...limits(), maxEntries: 1 }),
          /^E_EXEC_AUTH_EFFECT_BOUNDS$/u,
        );
        symlinkSync(target, join(root, 'alias.txt'));
        nativeCode(
          () => state.effect.captureTree(opened.handle, limits()),
          /^(?:E_EXEC_AUTH_NATIVE_REPARSE_REJECTED|E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH)$/u,
        );
        rmSync(join(root, 'alias.txt'));
        linkSync(target, join(root, 'hardlink.txt'));
        nativeCode(
          () => state.effect.captureTree(opened.handle, limits()),
          /^E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE$/u,
        );
      } finally {
        state.effect.closeHandle(opened.handle);
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('binds the real native capture digest to the full canonical entry body', () => {
      const root = mkdtempSync(join(tmpdir(), 'effect-capture-digest-'));
      mkdirSync(join(root, 'empty'), { mode: 0o700 });
      writeFileSync(join(root, 'payload.json'), '{"value":1}\n', { mode: 0o600 });
      writeFileSync(join(root, '\uE000.txt'), 'bmp\n', { mode: 0o600 });
      writeFileSync(join(root, '\u{10000}.txt'), 'astral\n', { mode: 0o600 });
      const opened = state.effect.openRoot('WORKSPACE', root);
      try {
        const capture = state.effect.captureTree(
          opened.handle,
          limits(),
        ) as ExecutionEffectNativeCaptureTreeV1;
        expect(capture.manifestDigest).toBe(executionEffectNativeCaptureManifestDigestV1({
          entries: capture.entries,
          entryCount: capture.entryCount,
          totalBytes: capture.totalBytes,
        }));
        expect(capture.entries.map(entry => entry.path)).toEqual([
          'empty', 'payload.json', '\uE000.txt', '\u{10000}.txt',
        ]);
      } finally {
        state.effect.closeHandle(opened.handle);
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('streams a no-follow workspace source through a bounded opaque cursor', () => {
      const root = mkdtempSync(join(tmpdir(), 'effect-source-cursor-'));
      const payload = Buffer.from('bounded-native-source-read\n', 'utf8');
      const sourcePath = join(root, 'source.bin');
      writeFileSync(sourcePath, payload, { mode: 0o600 });
      const opened = state.effect.openRoot('WORKSPACE', root);
      let source: { readonly handle: object; readonly sourceObjectIdentityDigest: string } | null = null;
      try {
        const digest = `sha256:${createHash('sha256').update(payload).digest('hex')}`;
        source = state.effect.beginSourceRead(opened.handle, {
          deadlineUnixMs: Date.now() + 5_000,
          expectedContentDigest: digest,
          expectedMode: 0o600,
          expectedSize: payload.byteLength,
          maxChunkBytes: 5,
          path: 'source.bin',
        });
        const chunks: Uint8Array[] = [];
        let observed = 0;
        let index = 0;
        while (observed < payload.byteLength) {
          const chunk = state.effect.nextSourceChunk(source.handle, 'ACTIVE');
          expect(chunk.index).toBe(index);
          expect(chunk.byteOffset).toBe(observed);
          expect(chunk.byteLength).toBeLessThanOrEqual(5);
          chunks.push(chunk.bytes);
          observed = chunk.observedBytes;
          index += 1;
        }
        const verified = state.effect.finishSourceRead(source.handle);
        expect(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))).toEqual(payload);
        expect(verified).toMatchObject({
          chunkCount: index,
          contentDigest: digest,
          observedBytes: payload.byteLength,
          sourceObjectIdentityDigest: source.sourceObjectIdentityDigest,
        });
      } finally {
        if (source !== null) state.effect.closeHandle(source.handle);
        state.effect.closeHandle(opened.handle);
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('keeps source authority proxy, accessor, cancellation and hardlink paths fail-closed', () => {
      const root = mkdtempSync(join(tmpdir(), 'effect-source-adversarial-'));
      const sourcePath = join(root, 'source.bin');
      const payload = Buffer.from('source-authority\n', 'utf8');
      writeFileSync(sourcePath, payload, { mode: 0o600 });
      const opened = state.effect.openRoot('WORKSPACE', root);
      const digest = `sha256:${createHash('sha256').update(payload).digest('hex')}`;
      const authority = {
        deadlineUnixMs: Date.now() + 5_000,
        expectedContentDigest: digest,
        expectedMode: 0o600,
        expectedSize: payload.byteLength,
        maxChunkBytes: 8,
        path: 'source.bin',
      };
      let getterCalls = 0;
      try {
        nativeCode(
          () => state.effect.beginSourceRead(opened.handle, new Proxy(authority, {})),
          /^E_EXEC_AUTH_NATIVE_ARGUMENT$/u,
        );
        const accessor = { ...authority } as Record<string, unknown>;
        Object.defineProperty(accessor, 'path', {
          enumerable: true,
          get: () => { getterCalls += 1; return 'source.bin'; },
        });
        nativeCode(
          () => state.effect.beginSourceRead(opened.handle, accessor),
          /^E_EXEC_AUTH_NATIVE_ARGUMENT$/u,
        );
        expect(getterCalls).toBe(0);
        linkSync(sourcePath, join(root, 'source-hardlink.bin'));
        nativeCode(
          () => state.effect.beginSourceRead(opened.handle, authority),
          /^E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE$/u,
        );
        rmSync(join(root, 'source-hardlink.bin'));
        const source = state.effect.beginSourceRead(opened.handle, authority);
        try {
          nativeCode(
            () => state.effect.nextSourceChunk(Object.freeze({}), 'ACTIVE'),
            /^E_EXEC_AUTH_NATIVE_HANDLE_(?:FORGED|FOREIGN)$/u,
          );
          nativeCode(
            () => state.effect.nextSourceChunk(source.handle, 'CANCELLED'),
            /^E_EXEC_AUTH_EFFECT_CANCELLED$/u,
          );
          expect(state.effect.nextSourceChunk(source.handle, 'ACTIVE').byteLength)
            .toBeGreaterThan(0);
        } finally {
          state.effect.closeHandle(source.handle);
        }
      } finally {
        state.effect.closeHandle(opened.handle);
        rmSync(root, { recursive: true, force: true });
      }
    });
  },
);

describe('execution-effect native v2 source contract', () => {
  const commonSource = readFileSync(
    new URL('../../native/exec-authority/src/custody_common.h', import.meta.url),
    'utf8',
  );
  const entrySource = readFileSync(
    new URL('../../native/exec-authority/src/exec_authority.c', import.meta.url),
    'utf8',
  );
  const posixSource = readFileSync(
    new URL('../../native/exec-authority/src/custody_posix.c', import.meta.url),
    'utf8',
  );
  const win32Source = readFileSync(
    new URL('../../native/exec-authority/src/custody_win32.c', import.meta.url),
    'utf8',
  );
  const loaderSource = readFileSync(
    new URL('../../native/exec-authority/index.mjs', import.meta.url),
    'utf8',
  );
  const typedSource = readFileSync(
    new URL('../../src/core/exec-authority-native.ts', import.meta.url),
    'utf8',
  );

  it('keeps effect-v2 in a distinct trust domain, ABI and handle generation', () => {
    expect(commonSource).toContain('#define DECKENT_EXECUTION_EFFECT_ABI_VERSION "2.1.0"');
    expect(commonSource).toContain('#define DECKENT_EXECUTION_EFFECT_HANDLE_ABI');
    expect(commonSource).toContain('"deckent.execution-effect.opaque-generation.v2"');
    expect(commonSource).toContain(
      '#define DECKENT_EXECUTION_EFFECT_FEATURE_LINUX "execution-effect-linux-v1"',
    );
    expect(entrySource).toContain('deckent_effect_state effect;');
    expect(entrySource).toContain('static napi_value EffectInvoke');
    expect(entrySource).toContain('static napi_value EffectCloseHandle');
    expect(entrySource).toContain('DECKENT_EFFECT_HANDLE_TAG');
    expect(entrySource).toContain('DECKENT_CUSTODY_HANDLE_TAG');
    expect(loaderSource).toContain("'effectInvoke'");
    expect(loaderSource).toContain("'effectCloseHandle'");
  });

  it('enables effects only on Linux and makes Darwin/Win32 an explicit unsupported boundary', () => {
    expect(entrySource).toContain(
      '#if defined(DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND) && defined(__linux__)',
    );
    expect(entrySource).toContain('execution-effect backend is forbidden on this platform');
    expect(loaderSource).toContain("objectFreeze({ available: false, reason: 'platform-unsupported' })");
    expect(typedSource).toContain("readonly reason: 'platform-unsupported';");
    expect(win32Source).not.toContain('deckent_effect_linux_backend_v2');
    expect(win32Source).not.toContain('DECKENT_EXECUTION_EFFECT_FEATURE_LINUX');
  });

  it('pins bounded no-follow capture before any content read', () => {
    const hardlinkGuard = posixSource.indexOf('identity->status.st_nlink != 1');
    const contentRead = posixSource.indexOf('effect_hash_regular_file', hardlinkGuard);
    expect(posixSource).toContain('O_PATH | O_NOFOLLOW | O_CLOEXEC');
    expect(posixSource).toContain('effect_same_root_mount');
    expect(posixSource).toContain('DECKENT_EFFECT_MAX_ENTRIES 1000000u');
    expect(typedSource).toContain('count > 1_000_000');
    expect(typedSource).toContain('record.maxEntries > 1_000_000');
    expect(loaderSource).toContain('entries > 1_000_000');
    expect(loaderSource).toContain('expectedCount > 1_000_000');
    expect(posixSource).toContain('DECKENT_EFFECT_MAX_TOTAL_BYTES UINT64_C(274877906944)');
    expect(posixSource).toContain('DECKENT_EFFECT_MAX_DEPTH 256u');
    expect(posixSource).toContain('DECKENT_EFFECT_MAX_PATH_BYTES 16384u');
    expect(posixSource).toContain('DECKENT_EFFECT_MAX_NAME_BYTES 255u');
    expect(posixSource).toContain('? max_count : capacity * 2u');
    expect(posixSource).toContain('limits->max_file_bytes > limits->max_total_bytes');
    expect(posixSource).toContain('limits->max_name_bytes > limits->max_path_bytes');
    expect(posixSource).toContain('O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC');
    expect(posixSource).toContain('close_owned_fd(&current)');
    expect(posixSource).toContain('static bool effect_valid_utf8');
    expect(posixSource).toContain('node->depth >= limits.max_depth');
    expect(posixSource).toContain('int directory_fd;');
    expect(posixSource).toContain('same_snapshot(&node->identity, &directory_after)');
    expect(posixSource).toContain('node->next_name_index >= node->name_count');
    expect(posixSource).toContain('size_t stack_limit = (size_t)limits.max_depth + 1u');
    expect(posixSource).toContain('execution-effect resource allocation failed');
    expect(posixSource).toContain('execution-effect staged name allocation failed');
    expect(posixSource).toContain('DECKENT_EFFECT_MAX_AGGREGATE_PATH_BYTES UINT64_C(16777216)');
    expect(posixSource).toContain('DECKENT_EFFECT_ERROR_CANCELLED');
    expect(posixSource).toContain('effect_deadline_ok');
    expect(hardlinkGuard).toBeGreaterThan(0);
    expect(contentRead).toBeGreaterThan(hardlinkGuard);
    expect(posixSource).toContain(
      'qsort(captured, entry_count, sizeof(*captured), effect_compare_capture_records)',
    );
    const handleFactory = entrySource.slice(
      entrySource.indexOf('napi_value deckent_effect_create_handle'),
      entrySource.indexOf('static bool resolve_effect_handle'),
    );
    expect(handleFactory.indexOf('napi_object_freeze')).toBeGreaterThan(0);
    expect(handleFactory.indexOf('napi_wrap')).toBeGreaterThan(
      handleFactory.indexOf('napi_object_freeze'),
    );
  });

  it('reopens the pinned capture root without sharing directory offsets', () => {
    const capture = posixSource.slice(
      posixSource.indexOf('static napi_value effect_capture_tree'),
      posixSource.indexOf('#define DECKENT_EFFECT_OPERATION_HEADER_BYTES'),
    );
    expect(capture).toContain('stack[0].directory_fd = openat(');
    expect(capture).toContain('O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC');
    expect(capture).not.toContain('stack[0].directory_fd = dup(root->fd)');
  });

  it('pins the bounded source-read cursor to workspace custody and before/after identity', () => {
    const begin = posixSource.indexOf('static napi_value effect_begin_source_read');
    const next = posixSource.indexOf('static napi_value effect_next_source_chunk');
    const finish = posixSource.indexOf('static napi_value effect_finish_source_read');
    expect(commonSource).toContain('DECKENT_EFFECT_OPERATION_NAME_BEGIN_SOURCE_READ');
    expect(commonSource).toContain('DECKENT_EFFECT_HANDLE_SOURCE_READ');
    expect(commonSource).toContain('DECKENT_EFFECT_RIGHT_SOURCE_FINISH');
    expect(begin).toBeGreaterThan(0);
    expect(next).toBeGreaterThan(begin);
    expect(finish).toBeGreaterThan(next);
    expect(posixSource.slice(begin, next)).toContain('O_RDONLY | O_CLOEXEC');
    expect(posixSource.slice(begin, next)).toContain('status.st_nlink != 1');
    expect(posixSource.slice(begin, next)).toContain('effect_same_root_mount');
    expect(posixSource.slice(next, finish)).toContain('effect_deadline_ok');
    expect(posixSource.slice(next, finish)).toContain('DECKENT_EFFECT_ERROR_CANCELLED');
    expect(posixSource.slice(next, finish)).toContain('effect_source_identity_unchanged(env, source)');
    expect(posixSource.slice(finish)).toContain('same_snapshot(&source->source_identity, &after)');
    expect(loaderSource).toContain('snapshotEffectSourceReadAuthority(authority)');
    expect(loaderSource).toContain("invoke('begin-source-read'");
    expect(typedSource).toContain('effectSourceReadAuthoritySnapshot(authority)');
    expect(typedSource).toContain("requireHandle(workspaceRoot, ['WORKSPACE'], ['OPEN'])");
    expect(typedSource).toContain("requireHandle(sourceRead, ['SOURCE_READ'], ['OPEN'])");
    expect(typedSource).toContain("replaceRecord(sourceRead, record, 'FAILED')");
    expect(posixSource).toContain('if (source != NULL && cursor_advanced) source->failed = true;');
  });

  it('pins staged identity, CAS, durable landing, crash reconciliation and final fan-in', () => {
    const reconcileStart = posixSource.indexOf('static napi_value effect_reconcile_operation');
    const reconcileEnd = posixSource.indexOf('static napi_value effect_verify_postimages');
    const reconcile = posixSource.slice(reconcileStart, reconcileEnd);
    expect(posixSource).toContain('RENAME_NOREPLACE');
    expect(posixSource).toContain('RENAME_EXCHANGE');
    expect(posixSource).toContain('effect_revalidate_parent');
    expect(posixSource).toContain('DECKENT_EFFECT_ERROR_CAS_MISMATCH');
    expect(posixSource).toContain('fsync(parent_fd)');
    expect(reconcile).toContain('DECKENT_EFFECT_HANDLE_STAGED_CONTENT');
    expect(reconcile).toContain('stage->sealed');
    expect(reconcile).toContain('DECKENT_EFFECT_ERROR_RECONCILE_AMBIGUOUS');
    expect(posixSource).toContain('static napi_value effect_verify_postimages');
    expect(posixSource).toContain('execution-effect final postimage set does not match the plan');
  });

  it('pins proxy/accessor rejection, immutable byte snapshots and typed handle replay checks', () => {
    expect(loaderSource).toContain('isProxyObject(value)');
    expect(loaderSource).toContain('snapshotCustodyBytes(envelope)');
    expect(typedSource).toContain('snapshotExactBytes(operationEnvelope)');
    expect(typedSource).toContain("E_EXEC_AUTH_NATIVE_HANDLE_FOREIGN");
    expect(typedSource).toContain("record.state === 'CLOSED'");
    expect(typedSource).toContain("requireHandle(stagedContent, ['STAGED_CONTENT'], ['SEALED'])");
    expect(typedSource).toContain('result.operationDigest !== expectedDigest');
    expect(typedSource).toContain('result.planDigest !== expectedPlanDigest');
    expect(loaderSource).toContain('snapshotEffectSourceReadAuthority(authority)');
    expect(loaderSource).toContain("snapshotCustodyBytes(ownData(value, 'bytes'))");
    expect(typedSource).toContain('effectSourceReadAuthoritySnapshot(authority)');
    expect(typedSource).toContain("snapshotExactBytes(ownData(value, 'bytes'))");
  });

  it('binds probe and installed-package receipts to real effect ABI and landing evidence', () => {
    const probeSource = readFileSync(
      new URL(
        '../../scripts/platform-probe/exec-authority-capability-probe.mjs',
        import.meta.url,
      ),
      'utf8',
    );
    const verifierSource = readFileSync(
      new URL('../../scripts/verify-exec-authority-native-package.mjs', import.meta.url),
      'utf8',
    );
    expect(probeSource).toContain('loadExecAuthorityNative()');
    expect(probeSource).toContain('nativeState.manifest.effectContract.abiVersion');
    expect(probeSource).toContain("? 'PRESENT' : 'UNSUPPORTED'");
    expect(verifierSource).toContain('function runEffectLifecycle(effect, manifest, platform)');
    expect(verifierSource).toContain("state: 'LANDING_VERIFIED'");
    expect(verifierSource).toContain('effect.beginSourceRead(workspace.handle');
    expect(verifierSource).toContain("effect.nextSourceChunk(source.handle, 'ACTIVE')");
    expect(verifierSource).toContain('effect.finishSourceRead(source.handle)');
    expect(verifierSource).toContain('sourceObjectIdentityDigest');
    expect(verifierSource).toContain('sourceReadChunkCount');
    expect(verifierSource).toContain('effect.applyOperation(');
    expect(verifierSource).toContain('effect.verifyPostimages(');
    expect(verifierSource).toContain('effectLifecycleEvidenceSha256');
  });
});

describe('custody bounded dispatch discovery source contract', () => {
  const commonSource = readFileSync(
    new URL('../../native/exec-authority/src/custody_common.h', import.meta.url),
    'utf8',
  );
  const entrySource = readFileSync(
    new URL('../../native/exec-authority/src/exec_authority.c', import.meta.url),
    'utf8',
  );
  const posixSource = readFileSync(
    new URL('../../native/exec-authority/src/custody_posix.c', import.meta.url),
    'utf8',
  );
  const win32Source = readFileSync(
    new URL('../../native/exec-authority/src/custody_win32.c', import.meta.url),
    'utf8',
  );
  const loaderSource = readFileSync(
    new URL('../../native/exec-authority/index.mjs', import.meta.url),
    'utf8',
  );
  const typedSource = readFileSync(
    new URL('../../src/core/exec-authority-native.ts', import.meta.url),
    'utf8',
  );

  it('admits one exact bounded scan operation and rejects legacy readdir as authority', () => {
    expect(commonSource).toContain(
      '#define DECKENT_CUSTODY_OPERATION_NAME_SCAN_DIRECTORY_BOUNDED',
    );
    expect(commonSource).toContain('DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_BOUNDS');
    expect(commonSource).toContain('DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_DEADLINE');
    expect(commonSource).toContain('DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED');
    expect(commonSource).toContain('DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_ENTRY_INVALID');
    expect(entrySource).toContain('DECKENT_CUSTODY_OPERATION_SCAN_DIRECTORY_BOUNDED');
    expect(entrySource).toContain('"directory", "maxEntries", "maxNameBytes", "deadlineUnixMs"');
    expect(loaderSource).toContain("case 'scan-directory-bounded'");
    expect(loaderSource).toContain('CUSTODY_DIRECTORY_SCAN_RESULT_KEYS');
    expect(loaderSource).toContain('args[2] <= 128');
    const facadeKeys = loaderSource.slice(
      loaderSource.indexOf('const CUSTODY_FACADE_KEYS'),
      loaderSource.indexOf('const EFFECT_FACADE_KEYS'),
    );
    expect(facadeKeys).toContain("'scanDirectoryBounded'");
    expect(typedSource).toContain("readonly 'scan-directory-bounded': ExecAuthorityNativeScanDirectoryInput");
    expect(typedSource).toContain('validateDirectoryScanResult');
    expect(typedSource).toContain('scanDirectoryBounded');
    expect(typedSource).not.toContain('readdirFd(directory)');
  });

  it('pins POSIX enumeration to a duplicated descriptor with strict bounds and mutation proof', () => {
    const scan = posixSource.slice(
      posixSource.indexOf('static napi_value invoke_scan_directory_bounded'),
      posixSource.indexOf('static napi_value custody_posix_invoke'),
    );
    expect(scan).toContain('F_DUPFD_CLOEXEC');
    expect(scan).toContain('fdopendir(duplicate)');
    expect(scan).toContain('readdir(directory)');
    expect(scan).toContain('custody_scan_deadline_ok');
    expect(scan).toContain('count >= (size_t)max_entries');
    expect(scan).toContain('env, input, "maxNameBytes", 128u');
    expect(scan).toContain('custody_safe_scan_name');
    expect(scan).toContain('qsort(names, count');
    expect(scan).toContain('same_snapshot(&before, &after)');
    expect(scan).toContain('DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED');
    expect(scan).toContain('DIRECTORY_IDENTITY_STABLE');
  });

  it('implements the Win32 HANDLE-bound source contract without claiming runtime support', () => {
    const scan = win32Source.slice(
      win32Source.indexOf('static napi_value scan_directory_bounded_operation'),
      win32Source.indexOf('static bool create_cleanup_record'),
    );
    expect(scan).toContain('GetFileInformationByHandleEx');
    expect(scan).toContain('FileIdBothDirectoryRestartInfo');
    expect(scan).toContain('FileIdBothDirectoryInfo');
    expect(scan).toContain('FileBasicInfo');
    expect(scan).toContain('same_win32_directory_mutation_snapshot');
    expect(scan).toContain('max_name_bytes > 128u');
    expect(scan).toContain('win32_scan_deadline_ok');
    expect(scan).toContain('DECKENT_NATIVE_ERROR_DIRECTORY_SCAN_MUTATED');
    expect(scan).toContain('DIRECTORY_IDENTITY_STABLE');
  });
});

describe.runIf(ACTIVE_LINUX_NATIVE_RUNTIME && loaded.available)(
  'exec-authority active Linux native primitives (supporting runtime evidence)',
  () => {
  const native = (loaded as { available: true; binding: Record<string, CallableFunction> }).binding;
  const custody = (loaded as Extract<typeof loaded, { available: true }>).custody;

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

  it('creates a directory only after the common guard accepts its rollback authority', () => {
    withTempTree(root => {
      const parentTransport = custody.openRoot(
        root,
        'OPEN_EXISTING',
        'OWNER_PRIVATE',
      );
      expect(parentTransport.accepted).toBe(true);
      const parent = parentTransport.value as {
        readonly handle: object;
      };
      try {
        const createdTransport = custody.openDirectoryAt(
          parent.handle,
          'created',
          'OPEN_OR_CREATE',
          'OWNER_PRIVATE',
        );
        expect(createdTransport.accepted).toBe(true);
        const created = createdTransport.value as {
          readonly state: string;
          readonly identity: { readonly objectType: string };
          readonly handle: object;
        };
        expect(created.state).toBe('CREATED');
        expect(created.identity.objectType).toBe('DIRECTORY');
        expect(existsSync(join(root, 'created'))).toBe(true);
        custody.closeHandle(created.handle);
      } finally {
        custody.closeHandle(parent.handle);
      }

      const reopenedTransport = custody.openRoot(
        join(root, 'created'),
        'OPEN_EXISTING',
        'OWNER_PRIVATE',
      );
      expect(reopenedTransport.accepted).toBe(true);
      const reopened = reopenedTransport.value as {
        readonly state: string;
        readonly handle: object;
      };
      expect(reopened.state).toBe('OPENED');
      custody.closeHandle(reopened.handle);
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
        expect([...(native.readdirFd(dirFd) as readonly string[])].sort())
          .toEqual(['a.txt', 'b.txt']);
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
  },
);

interface RootSeparationTransport {
  readonly accepted: boolean;
  readonly value: unknown;
}

interface RootSeparationCustodyFacade {
  readonly openRoot: (
    path: string,
    disposition: 'OPEN_EXISTING',
    privacyPolicy: 'OWNER_PRIVATE',
  ) => RootSeparationTransport;
  readonly proveRootSeparation: (
    custodyRoot: object,
    canonicalProjectRoot: string,
  ) => RootSeparationTransport;
  readonly closeHandle: (handle: object) => void;
}

describe.runIf(ACTIVE_LINUX_NATIVE_RUNTIME && loaded.available)(
  'exec-authority active Linux native root-separation contract (supporting runtime evidence)',
  () => {
    const custody = (loaded as {
      available: true;
      custody: RootSeparationCustodyFacade;
    }).custody;

    function withRootSeparationTree<T>(fn: (root: string) => T): T {
      const root = mkdtempSync(join(tmpdir(), 'exec-auth-root-separation-'));
      try {
        return fn(root);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }

    function openCustodyRoot(path: string): object {
      const transport = custody.openRoot(path, 'OPEN_EXISTING', 'OWNER_PRIVATE');
      expect(transport.accepted).toBe(true);
      const value = transport.value as { readonly handle?: unknown };
      expect(typeof value.handle).toBe('object');
      return value.handle as object;
    }

    function expectNativeCode(action: () => unknown, expected: RegExp): void {
      let observed: unknown = null;
      try {
        action();
      } catch (error) {
        observed = error;
      }
      expect(observed).toMatchObject({ code: expect.stringMatching(expected) });
    }

    it('confirms only a frozen, identity-bound disjoint result', () => {
      withRootSeparationTree(root => {
        const custodyPath = join(root, 'custody');
        const projectPath = join(root, 'project');
        mkdirSync(custodyPath, { mode: 0o700 });
        mkdirSync(projectPath, { mode: 0o700 });
        const handle = openCustodyRoot(custodyPath);
        try {
          const transport = custody.proveRootSeparation(handle, projectPath);
          expect(transport.accepted).toBe(true);
          expect(transport.value).toEqual(expect.objectContaining({
            schemaVersion: 1,
            kind: 'custody-root-separation',
            state: 'CONFIRMED',
          }));
          expect(Object.isFrozen(transport.value)).toBe(true);
          expect(Object.keys(transport.value as object).sort()).toEqual([
            'custodyIdentity',
            'featureEvidenceBits',
            'kind',
            'projectIdentity',
            'schemaVersion',
            'state',
          ]);
        } finally {
          custody.closeHandle(handle);
        }
      });
    });

    it('rejects same-target and ancestor overlap in both directions', () => {
      withRootSeparationTree(root => {
        const child = join(root, 'child');
        mkdirSync(child, { mode: 0o700 });
        const rootHandle = openCustodyRoot(root);
        const childHandle = openCustodyRoot(child);
        try {
          expectNativeCode(
            () => custody.proveRootSeparation(rootHandle, root),
            /^E_EXEC_AUTH_NATIVE_ROOT_OVERLAP$/u,
          );
          expectNativeCode(
            () => custody.proveRootSeparation(rootHandle, child),
            /^E_EXEC_AUTH_NATIVE_ROOT_OVERLAP$/u,
          );
          expectNativeCode(
            () => custody.proveRootSeparation(childHandle, root),
            /^E_EXEC_AUTH_NATIVE_ROOT_OVERLAP$/u,
          );
        } finally {
          custody.closeHandle(childHandle);
          custody.closeHandle(rootHandle);
        }
      });
    });

    it('rejects a symlink component instead of following it', () => {
      withRootSeparationTree(root => {
        const custodyPath = join(root, 'custody');
        const projectPath = join(root, 'project');
        const aliasPath = join(root, 'project-alias');
        mkdirSync(custodyPath, { mode: 0o700 });
        mkdirSync(projectPath, { mode: 0o700 });
        symlinkSync(projectPath, aliasPath);
        const handle = openCustodyRoot(custodyPath);
        try {
          expectNativeCode(
            () => custody.proveRootSeparation(handle, aliasPath),
            /^(?:E_EXEC_AUTH_NATIVE_REPARSE_REJECTED|E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH|ELOOP|ENOTDIR)$/u,
          );
        } finally {
          custody.closeHandle(handle);
        }
      });
    });

    it('rejects replay of a closed custody-root handle', () => {
      withRootSeparationTree(root => {
        const custodyPath = join(root, 'custody');
        const projectPath = join(root, 'project');
        mkdirSync(custodyPath, { mode: 0o700 });
        mkdirSync(projectPath, { mode: 0o700 });
        const handle = openCustodyRoot(custodyPath);
        custody.closeHandle(handle);
        expectNativeCode(
          () => custody.proveRootSeparation(handle, projectPath),
          /^(?:E_EXEC_AUTH_NATIVE_HANDLE_CLOSED|E_EXEC_AUTH_NATIVE_HANDLE_CONTRACT)$/u,
        );
      });
    });
  },
);

describe.runIf(ACTIVE_LINUX_NATIVE_RUNTIME && loaded.available)(
  'installed native verifier isolates the untrusted runtime process',
  () => {
    it('accepts only the nonce-bound child lifecycle receipt', async () => {
      const packageRoot = createInstalledVerifierFixture();
      try {
        const result = await runInstalledNativeVerifier(packageRoot);
        expect(result, JSON.stringify(result)).toMatchObject({
          exitCode: 0,
          signal: null,
          stderr: '',
        });
        const receipt = JSON.parse(result.stdout) as {
          readonly event: string;
          readonly nativeArtifactOrigin: string;
          readonly lifecycle: { readonly state: string };
        };
        expect(receipt.event).toBe('EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED');
        expect(receipt.nativeArtifactOrigin).toBe('PACKAGED_PREBUILD');
        expect(receipt.lifecycle.state).toBe('PUBLISHED_READ_VERIFIED');
      } finally {
        rmSync(packageRoot, { recursive: true, force: true });
      }
    });

    it('rejects a fake outer receipt followed by target process.exit(0)', async () => {
      const packageRoot = createInstalledVerifierFixture([
        "const loaderContract = '../../native/exec-authority/index.mjs';",
        "const exposedChallenge = [...process.argv, ...Object.values(process.env)].some(value => typeof value === 'string' && /[0-9a-f]{64}/u.test(value));",
        'if (exposedChallenge) process.exit(42);',
        "process.stdout.write(JSON.stringify({ schemaVersion: 1, event: 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED', loaderContract }) + '\\n');",
        'process.exit(0);',
        'export function loadExecAuthorityNative() { return null; }',
        '',
      ].join('\n'));
      try {
        const result = await runInstalledNativeVerifier(packageRoot);
        expect(result.exitCode).not.toBe(0);
        expect(rejectedVerifierCode(result), JSON.stringify(result))
          .toBe('E_NATIVE_VERIFY_INTERNAL_OUTPUT_CONTRACT');
      } finally {
        rmSync(packageRoot, { recursive: true, force: true });
      }
    });

    it('rejects target stdout pollution even when the real runtime lifecycle succeeds', async () => {
      const realRuntimeSource = readFileSync(
        join(PROJECT_ROOT, 'dist', 'core', 'exec-authority-native.js'),
        'utf8',
      );
      const packageRoot = createInstalledVerifierFixture(
        `${realRuntimeSource}\nprocess.stdout.write('target-pollution\\n');\n`,
      );
      try {
        const result = await runInstalledNativeVerifier(packageRoot);
        expect(result.exitCode).not.toBe(0);
        expect(rejectedVerifierCode(result), JSON.stringify(result))
          .toBe('E_NATIVE_VERIFY_INTERNAL_OUTPUT_FRAMING');
      } finally {
        rmSync(packageRoot, { recursive: true, force: true });
      }
    });

    it('rejects malformed or multiple target output records', async () => {
      const packageRoot = createInstalledVerifierFixture([
        "const loaderContract = '../../native/exec-authority/index.mjs';",
        "process.stdout.write('{}\\n{}\\n');",
        'process.exit(0);',
        'export function loadExecAuthorityNative() { return loaderContract; }',
        '',
      ].join('\n'));
      try {
        const result = await runInstalledNativeVerifier(packageRoot);
        expect(result.exitCode).not.toBe(0);
        expect(rejectedVerifierCode(result), JSON.stringify(result))
          .toBe('E_NATIVE_VERIFY_INTERNAL_OUTPUT_FRAMING');
      } finally {
        rmSync(packageRoot, { recursive: true, force: true });
      }
    });

    it('kills and rejects a target that keeps the isolated import pending', async () => {
      const packageRoot = createInstalledVerifierFixture([
        "const loaderContract = '../../native/exec-authority/index.mjs';",
        'await new Promise(resolvePromise => setTimeout(resolvePromise, 60_000));',
        'export function loadExecAuthorityNative() { return loaderContract; }',
        '',
      ].join('\n'));
      try {
        const result = await runInstalledNativeVerifier(packageRoot, 250);
        expect(result.exitCode).not.toBe(0);
        expect(rejectedVerifierCode(result), JSON.stringify(result))
          .toBe('E_NATIVE_VERIFY_INTERNAL_TIMEOUT');
      } finally {
        rmSync(packageRoot, { recursive: true, force: true });
      }
    });
  },
);
