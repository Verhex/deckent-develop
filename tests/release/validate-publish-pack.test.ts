/**
 * tests/release/validate-publish-pack.test.ts — Sprint 413 task 413-002 (RC3A).
 *
 * PUB-01: `npm pack --dry-run` TEXT parsing is fragile across npm versions /
 * non-TTY environments — the live CLI path now uses `--json` + async spawn instead
 * (parsePackJson). PUB-02: the absolute file-count pin (920±800) is retired in favor
 * of a categorical baseline-delta ratchet (checkPackCategoryBaseline). PKG-05:
 * `lint:builtins-drift` is wired into the readiness report (checkBuiltinsDrift).
 *
 * Hermetic — every fixture here is a synthetic string/object. No real `npm pack`
 * invocation (slow; the real run is exercised by the `validate:publish` Smoke step,
 * not by this suite), matching the project's test-hermeticity rule.
 */

import { afterEach, describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { release as osRelease, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  parsePackJson,
  formatBytes,
  normalizeParsed,
  checkPackSizeAndCount,
  classifyPackEntry,
  categoryKeyForPath,
  buildCategoryInventory,
  checkPackCategoryBaseline,
  checkBuiltinsDrift,
  checkNpmShrinkwrapTarball,
  checkNativeExecAuthorityTarball,
} from '../../scripts/validate-publish.mjs';
import {
  EXEC_AUTHORITY_ABI_NAME,
  EXEC_AUTHORITY_ABI_VERSION,
  EXEC_AUTHORITY_HANDLE_ABI,
  EXEC_AUTHORITY_NAPI_VERSION,
  EXEC_AUTHORITY_NATIVE_PACKAGE,
  nativeSourceTreeIdentity,
} from '../../scripts/build-exec-authority-native.mjs';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const NATIVE_BUILDER_SOURCE = readFileSync(
  join(PROJECT_ROOT, 'scripts', 'build-exec-authority-native.mjs'),
  'utf-8',
);
const NATIVE_PUBLISH_SOURCE = readFileSync(
  join(PROJECT_ROOT, 'scripts', 'validate-publish.mjs'),
  'utf-8',
);
const INSTALLED_VERIFIER_SOURCE = readFileSync(
  join(PROJECT_ROOT, 'scripts', 'verify-exec-authority-native-package.mjs'),
  'utf-8',
);

function expectedEnvironmentKind(): 'darwin' | 'linux' | 'win32' | 'wsl2' {
  if (process.platform === 'darwin' || process.platform === 'win32') return process.platform;
  const kernelRelease = osRelease().toLowerCase();
  return kernelRelease.includes('microsoft') && kernelRelease.includes('wsl2') ? 'wsl2' : 'linux';
}

// ─── Fixture builders ───────────────────────────────────────────────────────

interface JsonPackFile {
  path: string;
  size: number;
}

function buildPackJson(opts: { files?: JsonPackFile[]; size?: number; entryCount?: number; name?: string } = {}): string {
  const files = opts.files ?? [
    { path: 'dist/index.js', size: 1200 },
    { path: 'dist/index.d.ts', size: 300 },
  ];
  const size = opts.size ?? 450 * 1024;
  const entryCount = opts.entryCount ?? files.length;
  return JSON.stringify([
    {
      id: 'sha512-fake',
      name: opts.name ?? 'deckent',
      version: '1.0.0-beta.1',
      size,
      unpackedSize: size * 3,
      files,
      entryCount,
      bundled: [],
    },
  ]);
}

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function buildNativePackFixture(
  extraCompletePairs: readonly string[] = [],
  platform = 'linux',
  arch = 'x64',
) {
  const root = mkdtempSync(join(tmpdir(), 'deckent-native-publish-fixture-'));
  fixtureRoots.push(root);
  const nativeRoot = join(root, 'native', 'exec-authority');
  const sourceRoot = join(nativeRoot, 'src');
  mkdirSync(sourceRoot, { recursive: true });
  mkdirSync(join(root, 'dist', 'core'), { recursive: true });
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({
    name: 'deckent',
    version: '9.8.7',
    type: 'module',
    scripts: {},
  })}\n`);
  writeFileSync(join(root, 'npm-shrinkwrap.json'), `${JSON.stringify({
    name: 'deckent',
    version: '9.8.7',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'deckent', version: '9.8.7' },
    },
  }, null, 2)}\n`);
  writeFileSync(join(nativeRoot, 'binding.gyp'), '{}\n');
  writeFileSync(join(nativeRoot, 'index.mjs'), 'export {};\n');
  writeFileSync(
    join(nativeRoot, 'package.json'),
    `${JSON.stringify({
      name: EXEC_AUTHORITY_NATIVE_PACKAGE,
      version: '0.1.0',
      private: true,
      main: 'index.mjs',
      type: 'module',
      scripts: {},
      binary: { napi_versions: [EXEC_AUTHORITY_NAPI_VERSION] },
    })}\n`,
  );
  for (const source of [
    'custody_common.h',
    'custody_posix.c',
    'custody_win32.c',
    'exec_authority.c',
  ]) {
    writeFileSync(join(sourceRoot, source), `/* ${source} */\n`);
  }

  const sourceIdentity = nativeSourceTreeIdentity(root);
  const binary = Buffer.from('exact native fixture binary\n');
  const currentPair = `native/exec-authority/prebuilds/${platform}-${arch}/napi-v${EXEC_AUTHORITY_NAPI_VERSION}`;
  const currentPairRoot = join(root, ...currentPair.split('/'));
  mkdirSync(currentPairRoot, { recursive: true });
  writeFileSync(join(currentPairRoot, 'exec_authority.node'), binary);
  writeFileSync(join(currentPairRoot, 'artifact.json'), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'deckent-exec-authority-native-artifact',
    abiName: EXEC_AUTHORITY_ABI_NAME,
    abiVersion: EXEC_AUTHORITY_ABI_VERSION,
    handleAbi: EXEC_AUTHORITY_HANDLE_ABI,
    napiVersion: EXEC_AUTHORITY_NAPI_VERSION,
    packageName: EXEC_AUTHORITY_NATIVE_PACKAGE,
    packageVersion: '0.1.0',
    rootPackageName: 'deckent',
    rootPackageVersion: '9.8.7',
    platform,
    arch,
    buildType: 'Release',
    binaryFile: 'exec_authority.node',
    binaryByteLength: binary.byteLength,
    binarySha256: `sha256:${createHash('sha256').update(binary).digest('hex')}`,
    nativeSourceTreeSha256: sourceIdentity.sha256,
  }, null, 2)}\n`);

  const paths = [
    'package.json',
    'npm-shrinkwrap.json',
    ...sourceIdentity.paths,
    `${currentPair}/artifact.json`,
    `${currentPair}/exec_authority.node`,
  ];
  for (const pair of extraCompletePairs) {
    const pairRoot = join(root, ...pair.split('/'));
    mkdirSync(pairRoot, { recursive: true });
    writeFileSync(join(pairRoot, 'artifact.json'), '{}\n');
    writeFileSync(join(pairRoot, 'exec_authority.node'), binary);
    paths.push(`${pair}/artifact.json`, `${pair}/exec_authority.node`);
  }

  const files = paths.map((path) => ({
    path,
    size: statSync(join(root, ...path.split('/'))).size,
  }));
  return {
    root,
    paths,
    artifactPath: join(currentPairRoot, 'artifact.json'),
    nativePackagePath: join(nativeRoot, 'package.json'),
    rootPackagePath: join(root, 'package.json'),
    shrinkwrapPath: join(root, 'npm-shrinkwrap.json'),
    pack: parsePackJson(buildPackJson({ files, size: files.reduce((sum, file) => sum + file.size, 0) })),
  };
}

function refreshNativePackFixture(fixture: ReturnType<typeof buildNativePackFixture>) {
  const files = fixture.paths.map((path) => ({
    path,
    size: statSync(join(fixture.root, ...path.split('/'))).size,
  }));
  return parsePackJson(buildPackJson({
    files,
    size: files.reduce((sum, file) => sum + file.size, 0),
  }));
}

function overwriteJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function installedVerifierRejection(
  packageRoot: string,
  expectedEnvironment = expectedEnvironmentKind(),
): Promise<{
  code: string;
  detail: string;
}> {
  const result = await new Promise<{ exitCode: number; stderr: string }>((resolvePromise, rejectPromise) => {
    const outputRoot = mkdtempSync(join(tmpdir(), 'deckent-installed-verifier-output-'));
    const outputPath = join(outputRoot, 'stderr.log');
    const outputFd = openSync(outputPath, 'w');
    const child = spawn(process.execPath, [
      join(PROJECT_ROOT, 'scripts', 'verify-exec-authority-native-package.mjs'),
      '--package-root',
      packageRoot,
      '--expected-environment',
      expectedEnvironment,
      '--expected-shrinkwrap-sha256',
      `sha256:${createHash('sha256')
        .update(readFileSync(join(packageRoot, 'npm-shrinkwrap.json')))
        .digest('hex')}`,
    ], {
      cwd: packageRoot,
      stdio: ['ignore', 'ignore', outputFd],
    });
    closeSync(outputFd);
    child.on('error', (error) => {
      rmSync(outputRoot, { recursive: true, force: true });
      rejectPromise(error);
    });
    child.on('close', (code) => {
      const stderr = readFileSync(outputPath, 'utf-8');
      rmSync(outputRoot, { recursive: true, force: true });
      resolvePromise({
        exitCode: typeof code === 'number' ? code : 1,
        stderr,
      });
    });
  });
  expect(result.exitCode).not.toBe(0);
  const lines = result.stderr.trim().split(/\r?\n/u).filter(Boolean);
  expect(lines).toHaveLength(1);
  const receipt = JSON.parse(lines[0]) as {
    event?: unknown;
    code?: unknown;
    detail?: unknown;
  };
  expect(receipt.event).toBe('EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_REJECTED');
  expect(receipt.code).toMatch(/^E_NATIVE_VERIFY_/u);
  return {
    code: String(receipt.code),
    detail: String(receipt.detail),
  };
}

// ─── parsePackJson ──────────────────────────────────────────────────────────

describe('parsePackJson', () => {
  it('extracts files, fileSizes, packageSizeBytes, and fileCount from a real-shaped npm pack --json fixture', () => {
    const out = buildPackJson({
      files: [
        { path: 'dist/index.js', size: 4000 },
        { path: 'dist/index.d.ts', size: 1000 },
        { path: 'assets/Dockerfile.worker', size: 2466 },
      ],
      size: 2_700_000,
      entryCount: 3,
    });
    const parsed = parsePackJson(out);
    expect(parsed.files).toEqual(['dist/index.js', 'dist/index.d.ts', 'assets/Dockerfile.worker']);
    expect(parsed.fileSizes).toEqual([
      { path: 'dist/index.js', bytes: 4000 },
      { path: 'dist/index.d.ts', bytes: 1000 },
      { path: 'assets/Dockerfile.worker', bytes: 2466 },
    ]);
    expect(parsed.packageSizeBytes).toBe(2_700_000);
    expect(parsed.fileCount).toBe(3);
    expect(parsed.packageName).toBe('deckent');
  });

  // PUB-01 regression lock: npm 11.x / non-TTY environments can produce empty or
  // malformed stdout. The parser must FAIL honestly downstream, never silently pass.
  describe('empty/malformed output — honest-FAIL (PUB-01 regression lock)', () => {
    it('returns a zeroed shape for an empty string', () => {
      const parsed = parsePackJson('');
      expect(parsed.files).toEqual([]);
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
      expect(parsed.fileCount).toBe(0);
    });

    it('returns a zeroed shape for non-JSON garbage stdout', () => {
      const parsed = parsePackJson('npm WARN using --force\nSomething went wrong\n');
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
    });

    it('returns a zeroed shape when the JSON has no files[] array', () => {
      const parsed = parsePackJson(JSON.stringify([{ name: 'deckent', size: 1000 }]));
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
    });

    it('returns a zeroed shape for an empty JSON array', () => {
      const parsed = parsePackJson('[]');
      expect(parsed.fileSizes).toEqual([]);
      expect(parsed.packageSizeBytes).toBe(0);
    });

    it('checkPackSizeAndCount FAILs (not a silent pass) on the resulting zeroed shape', () => {
      const parsed = parsePackJson('');
      const result = checkPackSizeAndCount(parsed);
      expect(result.ok).toBe(false);
      expect(result.severity).toBe('error');
      expect(result.message).toMatch(/could not determine package size/i);
    });
  });
});

// ─── formatBytes ────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats MB, kB, and B ranges', () => {
    expect(formatBytes(2_621_440)).toBe('2.5 MB');
    expect(formatBytes(1536)).toBe('1.5 kB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(0)).toBe('0 B');
  });
});

// ─── normalizeParsed — dual-input (legacy string vs pre-parsed JSON object) ────

describe('normalizeParsed', () => {
  it('parses a legacy npm-notice TEXT string via parsePackOutput', () => {
    const text = [
      'npm notice === Tarball Contents ===',
      'npm notice 1.2kB dist/index.js',
      'npm notice === Tarball Details ===',
      'npm notice package size: 450 kB',
      'npm notice total files: 1',
    ].join('\n');
    const result = normalizeParsed(text);
    expect(result.packageSize).toBe('450 kB');
    expect(result.files).toEqual(['dist/index.js']);
  });

  it('passes a pre-parsed JSON-path object through untouched', () => {
    const parsed = parsePackJson(buildPackJson());
    const result = normalizeParsed(parsed);
    expect(result).toBe(parsed);
  });

  it('checkPackSizeAndCount accepts the JSON-path object directly (no re-parsing as text)', () => {
    const parsed = parsePackJson(buildPackJson({ size: 1_000_000 }));
    const result = checkPackSizeAndCount(parsed);
    expect(result.gate).toBe('pack_size_and_count');
    expect(result.ok).toBe(true);
  });
});

// ─── classifyPackEntry / categoryKeyForPath ────────────────────────────────

describe('classifyPackEntry', () => {
  it('classifies .d.ts before the generic .js bucket', () => {
    expect(classifyPackEntry('dist/core/config.d.ts')).toBe('.d.ts');
    expect(classifyPackEntry('dist/core/config.js')).toBe('.js');
    expect(classifyPackEntry('README.md')).toBe('.md');
    expect(classifyPackEntry('package.json')).toBe('.json');
    expect(classifyPackEntry('assets/Dockerfile.worker')).toBe('asset');
  });
});

describe('categoryKeyForPath', () => {
  it('buckets by first two path segments + extension class', () => {
    expect(categoryKeyForPath('dist/cli/entry.js')).toBe('dist/cli::.js');
    expect(categoryKeyForPath('dist/index.js')).toBe('dist::.js');
    expect(categoryKeyForPath('README.md')).toBe('.::.md');
    expect(categoryKeyForPath('assets/Dockerfile.worker')).toBe('assets::asset');
  });
});

// ─── buildCategoryInventory ─────────────────────────────────────────────────

describe('buildCategoryInventory', () => {
  it('sums count and bytes per category', () => {
    const inventory = buildCategoryInventory([
      { path: 'dist/cli/a.js', bytes: 100 },
      { path: 'dist/cli/b.js', bytes: 200 },
      { path: 'dist/cli/a.d.ts', bytes: 50 },
    ]);
    expect(inventory.categories['dist/cli::.js']).toEqual({ count: 2, bytes: 300 });
    expect(inventory.categories['dist/cli::.d.ts']).toEqual({ count: 1, bytes: 50 });
    expect(inventory.totalBytes).toBe(350);
    expect(inventory.totalFiles).toBe(3);
  });
});

// ─── checkPackCategoryBaseline — three-way delta gate + honest-FAIL paths ──────

describe('checkPackCategoryBaseline', () => {
  const baseline = {
    totalBytes: 1000,
    totalFiles: 20,
    categories: {
      'dist/cli::.js': { count: 10, bytes: 500 },
      'dist/core::.js': { count: 10, bytes: 500 },
    },
  };

  it('PASSES when the pack matches the baseline (clean path)', () => {
    const fileSizes = [
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
    ];
    const result = checkPackCategoryBaseline(fileSizes, baseline);
    expect(result.gate).toBe('pack_category_baseline');
    expect(result.ok).toBe(true);
    expect(result.newCategories).toEqual([]);
    expect(result.grown).toEqual([]);
  });

  it('FAILS when a new category appears that is absent from the baseline', () => {
    const fileSizes = [
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
      { path: 'dist/newmodule/x.js', bytes: 10 },
    ];
    const result = checkPackCategoryBaseline(fileSizes, baseline);
    expect(result.ok).toBe(false);
    expect(result.newCategories).toContain('dist/newmodule::.js');
    expect(result.message).toMatch(/new categories/i);
  });

  it('FAILS when a category count grows more than 10% over baseline', () => {
    // dist/cli baseline count=10; 12 files = +20% growth, over the 10% tolerance.
    const fileSizes = [
      ...Array.from({ length: 12 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
    ];
    const result = checkPackCategoryBaseline(fileSizes, baseline);
    expect(result.ok).toBe(false);
    expect(result.grown.some((g) => g.startsWith('dist/cli::.js'))).toBe(true);
    expect(result.message).toMatch(/grew >10%/i);
  });

  it('FAILS when total packed size grows more than 5 MB over baseline', () => {
    const bigBaseline = { totalBytes: 1000, totalFiles: 2, categories: { 'dist/cli::.js': { count: 1, bytes: 500 } } };
    const fileSizes = [{ path: 'dist/cli/big.js', bytes: 6 * 1024 * 1024 }];
    const result = checkPackCategoryBaseline(fileSizes, bigBaseline);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/total packed size grew/i);
  });

  // PUB-01-adjacent regression lock: an empty pack result must never silently pass
  // the category gate either.
  it('FAILS honestly on an empty fileSizes list (never a silent pass)', () => {
    const result = checkPackCategoryBaseline([], baseline);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toMatch(/empty pack file list/i);
  });

  it('FAILS honestly when no baseline is loaded (missing/malformed scripts/pack-baseline.json)', () => {
    const fileSizes = [{ path: 'dist/cli/a.js', bytes: 100 }];
    const resultNull = checkPackCategoryBaseline(fileSizes, null);
    expect(resultNull.ok).toBe(false);
    expect(resultNull.message).toMatch(/no baseline loaded/i);

    const resultMalformed = checkPackCategoryBaseline(fileSizes, {} as never);
    expect(resultMalformed.ok).toBe(false);
  });

  it('admits only the two native categories explicitly released by a passing native gate', () => {
    const fileSizes = [
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/cli/f${i}.js`, bytes: 50 })),
      ...Array.from({ length: 10 }, (_, i) => ({ path: `dist/core/f${i}.js`, bytes: 50 })),
      { path: 'native/exec-authority/package.json', bytes: 100 },
      { path: 'native/exec-authority/prebuilds/linux-x64/napi-v8/exec_authority.node', bytes: 100 },
    ];

    const withoutNativeAdmission = checkPackCategoryBaseline(fileSizes, baseline);
    expect(withoutNativeAdmission.ok).toBe(false);
    expect(withoutNativeAdmission.newCategories).toEqual([
      'native/exec-authority::.json',
      'native/exec-authority::asset',
    ]);

    const withNativeAdmission = checkPackCategoryBaseline(fileSizes, baseline, [
      'native/exec-authority::.json',
      'native/exec-authority::asset',
    ]);
    expect(withNativeAdmission.ok).toBe(true);

    const unrelated = checkPackCategoryBaseline([
      ...fileSizes,
      { path: 'native/other-authority/forbidden.bin', bytes: 1 },
    ], baseline, [
      'native/exec-authority::.json',
      'native/exec-authority::asset',
    ]);
    expect(unrelated.ok).toBe(false);
    expect(unrelated.newCategories).toEqual(['native/other-authority::asset']);
  });
});

describe('native producer/publish/installed-verifier parity source contract', () => {
  it('admits a baseline write only after the normal publish gates pass', () => {
    expect(NATIVE_PUBLISH_SOURCE).toContain('const validation = await runCli(root);');
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      'const criticalFiles = checkCriticalFilesInTarball(validation.packOutput, validation.pkg);',
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      'validation.npmShrinkwrapCheck,\n    validation.nativeExecAuthorityCheck,\n    criticalFiles,\n    changelog,',
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      'const blockers = admissionChecks.filter(check => !check.ok);',
    );
    expect(NATIVE_PUBLISH_SOURCE).toMatch(
      /if \(blockers\.length > 0\)[\s\S]*return 1;[\s\S]*writeFileSync\(baselinePath/u,
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      "const baselinePath = join(root, 'scripts', 'pack-baseline.json');",
    );
  });

  it('accepts only the normal node-gyp singleton or exact Release/obj.target hardlink pair', () => {
    expect(NATIVE_BUILDER_SOURCE).toContain(
      'if (named.nlink === 1n) return stableFileBytes(path, maximumBytes);',
    );
    expect(NATIVE_BUILDER_SOURCE).toContain(
      "if (named.nlink !== 2n) fail('E_NATIVE_BUILD_OUTPUT_LINK_UNSAFE', path);",
    );
    expect(NATIVE_BUILDER_SOURCE).toContain(
      "const binaryPeerPath = join(stage, 'build', 'Release', 'obj.target', 'exec_authority.node');",
    );
    expect(NATIVE_BUILDER_SOURCE).toMatch(
      /peer\.nlink !== 2n[\s\S]*peer\.dev !== named\.dev \|\| peer\.ino !== named\.ino/u,
    );
    expect(NATIVE_BUILDER_SOURCE).toMatch(
      /afterNamed\.nlink !== 2n[\s\S]*afterPeer\.nlink !== 2n/u,
    );
    expect(NATIVE_BUILDER_SOURCE).toContain(
      'stableGeneratedBinaryBytes(\n      binaryPath,\n      binaryPeerPath,',
    );
  });

  it('pins the shared 16 KiB metadata and <=128/no-NUL version bounds at all three authorities', () => {
    expect(NATIVE_BUILDER_SOURCE).toContain(
      "readJson(join(ROOT, 'package.json'), 16 * 1024)",
    );
    expect(NATIVE_BUILDER_SOURCE).toContain(
      "readJson(join(NATIVE_ROOT, 'package.json'), 16 * 1024)",
    );
    expect(NATIVE_BUILDER_SOURCE).toContain(
      "value.length <= 128\n    && !value.includes('\\0')",
    );
    expect(NATIVE_BUILDER_SOURCE).toContain('packageVersion: nativePackage.version');
    expect(NATIVE_BUILDER_SOURCE).toContain('rootPackageVersion: rootPackage.version');

    expect(NATIVE_PUBLISH_SOURCE).toContain(
      'const NATIVE_RUNTIME_METADATA_MAX_BYTES = 16 * 1024;',
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      "value.length <= 128\n    && !value.includes('\\0')",
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      "readStablePublishFile(root, 'package.json', NATIVE_RUNTIME_METADATA_MAX_BYTES)",
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      "'native/exec-authority/package.json',\n        NATIVE_RUNTIME_METADATA_MAX_BYTES,",
    );
    expect(NATIVE_PUBLISH_SOURCE).toContain(
      'artifactPath,\n      NATIVE_RUNTIME_METADATA_MAX_BYTES,',
    );

    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'const MAX_PACKAGE_JSON_BYTES = 16 * 1024;',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'const MAX_ARTIFACT_BYTES = 16 * 1024;',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      "value.length <= 128\n    && !reflectApply(stringIncludes, value, ['\\0'])",
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'const rootPackage = readJson(rootPackagePath, MAX_PACKAGE_JSON_BYTES).value;',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'const nativePackage = readJson(nativePackagePath, MAX_PACKAGE_JSON_BYTES).value;',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'const { bytes, value } = readJson(path, MAX_ARTIFACT_BYTES);',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain("argv[2] !== '--expected-environment'");
    expect(INSTALLED_VERIFIER_SOURCE).toContain("argv[4] !== '--expected-shrinkwrap-sha256'");
    expect(INSTALLED_VERIFIER_SOURCE).toContain('E_NATIVE_VERIFY_ENVIRONMENT_MISMATCH');
    expect(INSTALLED_VERIFIER_SOURCE).toContain("let operationStep = 'setup';");
    expect(INSTALLED_VERIFIER_SOURCE).toContain("'E_NATIVE_VERIFY_LIFECYCLE_NATIVE',");
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      '`${operationStep},${nativeErrorCode(operationError)}`',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'environmentEvidenceSha256: environment.evidenceSha256',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'const postNpmShrinkwrapBytes = stableFileBytes(',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'postNpmShrinkwrapSha256 !== npmShrinkwrapIdentity.sha256',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toContain(
      'postNpmShrinkwrapBytes.byteLength !== npmShrinkwrapIdentity.byteLength',
    );
    expect(INSTALLED_VERIFIER_SOURCE).toMatch(
      /await import\([\s\S]*const postNpmShrinkwrapBytes = stableFileBytes\(/u,
    );
  });
});

describe('checkNpmShrinkwrapTarball', () => {
  it('accepts exactly one byte-exact canonical root npm-shrinkwrap', () => {
    const fixture = buildNativePackFixture();
    expect(checkNpmShrinkwrapTarball(
      fixture.pack,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
    )).toMatchObject({
      gate: 'npm_shrinkwrap_tarball',
      ok: true,
      missing: [],
      unexpected: [],
      npmShrinkwrapIdentity: {
        schemaVersion: 1,
        lockfileVersion: 3,
        sha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        byteLength: statSync(fixture.shrinkwrapPath).size,
        packageCount: 1,
      },
    });
  });

  it('rejects missing, duplicate, byte-count-drifted and additional root locks', () => {
    const fixture = buildNativePackFixture();
    const files = fixture.pack.fileSizes.map(({ path, bytes }) => ({ path, size: bytes }));
    const withoutShrinkwrap = parsePackJson(buildPackJson({
      files: files.filter(file => file.path !== 'npm-shrinkwrap.json'),
      size: fixture.pack.packageSizeBytes,
    }));
    expect(checkNpmShrinkwrapTarball(
      withoutShrinkwrap,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
    )).toMatchObject({ ok: false, missing: ['npm-shrinkwrap.json'] });

    const shrinkwrapEntry = files.find(file => file.path === 'npm-shrinkwrap.json') as JsonPackFile;
    const duplicate = parsePackJson(buildPackJson({
      files: [...files, shrinkwrapEntry],
      size: fixture.pack.packageSizeBytes,
    }));
    expect(checkNpmShrinkwrapTarball(
      duplicate,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
    )).toMatchObject({
      ok: false,
      unexpected: ['npm-shrinkwrap.json (2 entries)'],
    });

    const wrongSize = parsePackJson(buildPackJson({
      files: files.map(file => file.path === 'npm-shrinkwrap.json'
        ? { ...file, size: file.size + 1 }
        : file),
      size: fixture.pack.packageSizeBytes,
    }));
    expect(checkNpmShrinkwrapTarball(
      wrongSize,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
    )).toMatchObject({
      ok: false,
      message: 'packed byte count differs from source file: npm-shrinkwrap.json',
    });

    const ambiguous = parsePackJson(buildPackJson({
      files: [...files, { path: 'package-lock.json', size: 2 }],
      size: fixture.pack.packageSizeBytes,
    }));
    expect(checkNpmShrinkwrapTarball(
      ambiguous,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
    )).toMatchObject({ ok: false, unexpected: ['package-lock.json'] });
  });

  it('rejects a source package-lock even when npm pack omits it', () => {
    const fixture = buildNativePackFixture();
    writeFileSync(join(fixture.root, 'package-lock.json'), '{}\n');
    expect(checkNpmShrinkwrapTarball(
      fixture.pack,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
    )).toMatchObject({
      ok: false,
      message: expect.stringContaining('E_NPM_SHRINKWRAP_PACKAGE_LOCK_PRESENT'),
    });
  });
});

describe('checkNativeExecAuthorityTarball', () => {
  it('accepts exactly one complete current-platform prebuild pair', () => {
    const fixture = buildNativePackFixture();
    expect(checkNativeExecAuthorityTarball(
      fixture.pack,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
      'linux',
      'x64',
    )).toMatchObject({
      gate: 'native_exec_authority_tarball',
      ok: true,
      missing: [],
      unexpected: [],
    });
  });

  it('rejects an additional complete prebuild pair instead of widening package authority', () => {
    const extraPair = 'native/exec-authority/prebuilds/darwin-arm64/napi-v8';
    const fixture = buildNativePackFixture([extraPair]);
    const result = checkNativeExecAuthorityTarball(
      fixture.pack,
      { name: 'deckent', version: '9.8.7' },
      fixture.root,
      'linux',
      'x64',
    );

    expect(result.ok).toBe(false);
    expect(result.unexpected).toContain(extraPair);
    expect(result.message).toMatch(/unsafe\/unexpected/iu);
  });

  it('rejects reordered or reformatted artifact JSON even when its values are unchanged', () => {
    const reordered = buildNativePackFixture();
    const artifact = JSON.parse(readFileSync(reordered.artifactPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(reordered.artifactPath, `${JSON.stringify({
      abiName: artifact.abiName,
      ...artifact,
    }, null, 2)}\n`);
    expect(checkNativeExecAuthorityTarball(
      refreshNativePackFixture(reordered),
      { name: 'deckent', version: '9.8.7' },
      reordered.root,
      'linux',
      'x64',
    )).toMatchObject({
      ok: false,
      message: expect.stringMatching(/artifact schema or byte identity is invalid/iu),
    });

    const reformatted = buildNativePackFixture();
    const reformattedArtifact = JSON.parse(
      readFileSync(reformatted.artifactPath, 'utf-8'),
    ) as Record<string, unknown>;
    writeFileSync(reformatted.artifactPath, JSON.stringify(reformattedArtifact));
    expect(checkNativeExecAuthorityTarball(
      refreshNativePackFixture(reformatted),
      { name: 'deckent', version: '9.8.7' },
      reformatted.root,
      'linux',
      'x64',
    )).toMatchObject({
      ok: false,
      message: 'current-platform native artifact JSON is not canonical',
    });
  });

  it('rejects duplicate inventory paths and root or nested install lifecycle hooks', () => {
    const duplicate = buildNativePackFixture();
    const duplicateFiles = duplicate.pack.fileSizes.map(({ path, bytes }) => ({ path, size: bytes }));
    const artifactEntry = duplicateFiles.find(({ path }) => path === duplicate.paths.at(-2));
    expect(artifactEntry).toBeDefined();
    const duplicatePack = parsePackJson(buildPackJson({
      files: [...duplicateFiles, artifactEntry as JsonPackFile],
      size: duplicate.pack.packageSizeBytes,
    }));
    expect(checkNativeExecAuthorityTarball(
      duplicatePack,
      { name: 'deckent', version: '9.8.7' },
      duplicate.root,
      'linux',
      'x64',
    )).toMatchObject({
      ok: false,
      message: expect.stringMatching(/duplicate native pack inventory path/iu),
    });

    const nestedLifecycle = buildNativePackFixture();
    const nativePackagePath = join(nestedLifecycle.root, 'native', 'exec-authority', 'package.json');
    const nativePackage = JSON.parse(readFileSync(nativePackagePath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(nativePackagePath, `${JSON.stringify({
      ...nativePackage,
      scripts: { install: 'node forbidden.mjs' },
    })}\n`);
    expect(checkNativeExecAuthorityTarball(
      refreshNativePackFixture(nestedLifecycle),
      { name: 'deckent', version: '9.8.7' },
      nestedLifecycle.root,
      'linux',
      'x64',
    )).toMatchObject({
      ok: false,
      message: 'nested native package identity is invalid',
    });

    const rootLifecycle = buildNativePackFixture();
    const rootPackage = JSON.parse(
      readFileSync(rootLifecycle.rootPackagePath, 'utf-8'),
    ) as Record<string, unknown>;
    overwriteJson(rootLifecycle.rootPackagePath, {
      ...rootPackage,
      scripts: { postinstall: 'node forbidden.mjs' },
    });
    expect(checkNativeExecAuthorityTarball(
      refreshNativePackFixture(rootLifecycle),
      { name: 'deckent', version: '9.8.7' },
      rootLifecycle.root,
      'linux',
      'x64',
    )).toMatchObject({
      ok: false,
      message: 'root package native install lifecycle is invalid',
    });
  });

  it('rejects root, nested, and artifact metadata larger than 16 KiB', () => {
    const cases = [
      ['package.json', (fixture: ReturnType<typeof buildNativePackFixture>) => fixture.rootPackagePath],
      [
        'native/exec-authority/package.json',
        (fixture: ReturnType<typeof buildNativePackFixture>) => fixture.nativePackagePath,
      ],
      [
        'native/exec-authority/prebuilds/linux-x64/napi-v8/artifact.json',
        (fixture: ReturnType<typeof buildNativePackFixture>) => fixture.artifactPath,
      ],
    ] as const;

    for (const [relativePath, selectPath] of cases) {
      const fixture = buildNativePackFixture();
      overwriteJson(selectPath(fixture), { padding: 'x'.repeat(16 * 1024) });
      expect(checkNativeExecAuthorityTarball(
        refreshNativePackFixture(fixture),
        { name: 'deckent', version: '9.8.7' },
        fixture.root,
        'linux',
        'x64',
      )).toMatchObject({
        ok: false,
        message: expect.stringContaining(`E_PUBLISH_NATIVE_FILE_UNSAFE:${relativePath}`),
      });
    }
  });

  it('rejects >128 and NUL versions in root, nested, and artifact metadata', () => {
    for (const invalidVersion of ['v'.repeat(129), '9.8\0.7']) {
      const root = buildNativePackFixture();
      const rootPackage = JSON.parse(readFileSync(root.rootPackagePath, 'utf-8')) as Record<string, unknown>;
      overwriteJson(root.rootPackagePath, { ...rootPackage, version: invalidVersion });
      expect(checkNativeExecAuthorityTarball(
        refreshNativePackFixture(root),
        { name: 'deckent', version: '9.8.7' },
        root.root,
        'linux',
        'x64',
      )).toMatchObject({ ok: false, message: 'root package native install lifecycle is invalid' });

      const nested = buildNativePackFixture();
      const nativePackage = JSON.parse(
        readFileSync(nested.nativePackagePath, 'utf-8'),
      ) as Record<string, unknown>;
      overwriteJson(nested.nativePackagePath, { ...nativePackage, version: invalidVersion });
      expect(checkNativeExecAuthorityTarball(
        refreshNativePackFixture(nested),
        { name: 'deckent', version: '9.8.7' },
        nested.root,
        'linux',
        'x64',
      )).toMatchObject({ ok: false, message: 'nested native package identity is invalid' });

      const artifactFixture = buildNativePackFixture();
      const artifact = JSON.parse(
        readFileSync(artifactFixture.artifactPath, 'utf-8'),
      ) as Record<string, unknown>;
      overwriteJson(artifactFixture.artifactPath, {
        ...artifact,
        packageVersion: invalidVersion,
      });
      expect(checkNativeExecAuthorityTarball(
        refreshNativePackFixture(artifactFixture),
        { name: 'deckent', version: '9.8.7' },
        artifactFixture.root,
        'linux',
        'x64',
      )).toMatchObject({
        ok: false,
        message: 'current-platform native artifact schema or byte identity is invalid',
      });
    }
  });
});

describe.runIf(
  ['linux', 'darwin', 'win32'].includes(process.platform)
    && ['x64', 'arm64', 'ia32', 'arm'].includes(process.arch),
)('installed native verifier metadata bounds', () => {
  it('rejects generic Linux and WSL2 proof-cell substitution before package evaluation', async () => {
    const fixture = buildNativePackFixture([], process.platform, process.arch);
    const actual = expectedEnvironmentKind();
    const wrong = actual === 'wsl2' ? 'linux' : 'wsl2';
    expect((await installedVerifierRejection(fixture.root, wrong)).code)
      .toBe('E_NATIVE_VERIFY_ENVIRONMENT_MISMATCH');
  });

  it('rejects root, nested, and artifact metadata larger than 16 KiB', async () => {
    const selectors = [
      (fixture: ReturnType<typeof buildNativePackFixture>) => fixture.rootPackagePath,
      (fixture: ReturnType<typeof buildNativePackFixture>) => fixture.nativePackagePath,
      (fixture: ReturnType<typeof buildNativePackFixture>) => fixture.artifactPath,
    ];
    for (const selectPath of selectors) {
      const fixture = buildNativePackFixture([], process.platform, process.arch);
      overwriteJson(selectPath(fixture), { padding: 'x'.repeat(16 * 1024) });
      expect((await installedVerifierRejection(fixture.root)).code)
        .toBe('E_NATIVE_VERIFY_FILE_UNSAFE');
    }
  });

  it('rejects >128 and NUL versions in root, nested, and artifact metadata', async () => {
    for (const invalidVersion of ['v'.repeat(129), '9.8\0.7']) {
      const root = buildNativePackFixture([], process.platform, process.arch);
      const rootPackage = JSON.parse(readFileSync(root.rootPackagePath, 'utf-8')) as Record<string, unknown>;
      overwriteJson(root.rootPackagePath, { ...rootPackage, version: invalidVersion });
      expect((await installedVerifierRejection(root.root)).code)
        .toBe('E_NATIVE_VERIFY_PACKAGE_IDENTITY');

      const nested = buildNativePackFixture([], process.platform, process.arch);
      const nativePackage = JSON.parse(
        readFileSync(nested.nativePackagePath, 'utf-8'),
      ) as Record<string, unknown>;
      overwriteJson(nested.nativePackagePath, { ...nativePackage, version: invalidVersion });
      expect((await installedVerifierRejection(nested.root)).code)
        .toBe('E_NATIVE_VERIFY_PACKAGE_IDENTITY');

      const artifactFixture = buildNativePackFixture([], process.platform, process.arch);
      const artifact = JSON.parse(
        readFileSync(artifactFixture.artifactPath, 'utf-8'),
      ) as Record<string, unknown>;
      overwriteJson(artifactFixture.artifactPath, {
        ...artifact,
        packageVersion: invalidVersion,
      });
      expect((await installedVerifierRejection(artifactFixture.root)).code)
        .toBe('E_NATIVE_VERIFY_ARTIFACT_CONTRACT');
    }
  });
});

// ─── checkBuiltinsDrift (PKG-05) ────────────────────────────────────────────

describe('checkBuiltinsDrift', () => {
  it('passes when lint:builtins-drift exits 0', () => {
    const result = checkBuiltinsDrift({ exitCode: 0, stdout: 'clean' });
    expect(result.gate).toBe('builtins_drift');
    expect(result.ok).toBe(true);
  });

  it('fails when lint:builtins-drift exits non-zero', () => {
    const result = checkBuiltinsDrift({ exitCode: 1, stdout: 'new drift detected' });
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
    expect(result.message).toContain('new drift detected');
  });
});
