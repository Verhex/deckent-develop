// ─── PKG-01: packed-install-contract ───────────────────────────────────────
// Sprint 413 task 413-003 (RC3B). Gap this closes: `scripts/validate-publish.mjs`'s
// `checkCriticalFilesInTarball` only asserts root main/types + the 2 bin files + the
// dashboard bundle are present in the tarball — it never looks at `exports["./sdk"]`,
// the builtins tree (agents/skills), or `assets/Dockerfile.worker`. A tarball with a
// broken SDK export or a missing builtin could pass that gate today.
//
// This test packs a REAL tarball (`npm pack`), extracts it to a tmpdir, and proves
// against that extracted copy — not the live repo `dist/`, not a mock manifest —
// that every package.json `exports` entry is both present AND actually importable,
// that every `bin` entry is present and executable, and that the dashboard/builtins/
// Dockerfile contract holds. It also asserts no dev-only source (`tests/`, `src/`,
// `.deckent/`, `.brain/`, `.tasks/`) leaked into the tarball.
//
// T20 active proof is Linux-only. macOS and Windows-native remain explicit
// residuals and are not simulated here. On Linux there is deliberately no skip
// escape hatch: an absent tarball, native artifact or verifier receipt must fail.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { release as osRelease, tmpdir } from 'node:os';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { readCanonicalNpmShrinkwrapIdentity } from '../../scripts/npm-shrinkwrap-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const ACTIVE_LINUX_PROOF = process.platform === 'linux';

function expectedEnvironmentKind(): 'darwin' | 'linux' | 'win32' | 'wsl2' {
  if (process.platform === 'darwin' || process.platform === 'win32') return process.platform;
  const kernelRelease = osRelease().toLowerCase();
  return kernelRelease.includes('microsoft') && kernelRelease.includes('wsl2') ? 'wsl2' : 'linux';
}

// ─── Async subprocess helper (no spawnSync — hermeticity rule) ────────────────

interface CmdResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<CmdResult> {
  return new Promise((res, rej) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', rej);
    proc.on('close', (code) => res({ exitCode: code ?? 1, stdout, stderr }));
  });
}

/** Recursively list every file+dir under `root`, as POSIX-style paths relative to `root`. */
function walkAll(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = relative(root, full).split(sep).join('/');
      out.push(rel);
      if (statSync(full).isDirectory()) stack.push(full);
    }
  }
  return out;
}

// ─── Shared state (populated in beforeAll) ────────────────────────────────────

let tmpRoot = '';
let pkgDir = '';
let extractedPaths: string[] = [];
let sourceNpmShrinkwrapSha256 = '';
let pkg: {
  exports?: Record<string, { import?: string; types?: string }>;
  bin?: Record<string, string>;
};

beforeAll(async () => {
  if (!ACTIVE_LINUX_PROOF) return;

  sourceNpmShrinkwrapSha256 = readCanonicalNpmShrinkwrapIdentity(PROJECT_ROOT).sha256;

  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-pkg01-'));
  const packDir = join(tmpRoot, 'pack');
  const extractDir = join(tmpRoot, 'extracted');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });

  // Redirect npm HOME so cache/log writes land on the main filesystem, not a
  // small tmpfs that $HOME may point to (mirrors tests/e2e/npm-pack-smoke.test.ts).
  const npmHomeDir = join(tmpRoot, 'npm-home');
  mkdirSync(npmHomeDir, { recursive: true });
  const npmEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: npmHomeDir,
    npm_config_cache: join(npmHomeDir, '.npm'),
  };

  // 1) Real tarball — not --dry-run, --ignore-scripts so lifecycle hooks (e.g.
  //    prepublishOnly) don't run.
  const packResult = await runCmd(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', packDir],
    PROJECT_ROOT,
    60_000,
    npmEnv,
  );
  if (packResult.exitCode !== 0) {
    throw new Error(`npm pack failed (exit ${packResult.exitCode}):\n${packResult.stderr}`);
  }
  if (packResult.stdout.trim() === '') {
    throw new Error('E_PACKED_INSTALL_PACK_JSON_EMPTY');
  }
  let packData: unknown;
  try {
    packData = JSON.parse(packResult.stdout);
  } catch {
    throw new Error('E_PACKED_INSTALL_PACK_JSON_INVALID');
  }
  if (!Array.isArray(packData) || packData.length !== 1) {
    throw new Error('E_PACKED_INSTALL_PACK_JSON_EMPTY_OR_AMBIGUOUS');
  }
  const entry = packData[0];
  const filename = entry !== null && typeof entry === 'object'
    ? (entry as { filename?: unknown }).filename
    : undefined;
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new Error('E_PACKED_INSTALL_PACK_FILENAME_INVALID');
  }
  const tarballPath = resolve(packDir, filename);
  if (dirname(tarballPath) !== packDir || !existsSync(tarballPath)) {
    throw new Error('E_PACKED_INSTALL_TARBALL_MISSING_OR_OUTSIDE_DESTINATION');
  }

  // 2) Real extraction — system tar (no npm devDep ships a tar library).
  const tarResult = await runCmd('tar', ['xzf', tarballPath, '-C', extractDir], extractDir, 30_000);
  if (tarResult.exitCode !== 0) {
    throw new Error(`tar extract failed:\n${tarResult.stderr}`);
  }

  pkgDir = join(extractDir, 'package');
  if (!existsSync(pkgDir)) {
    throw new Error(`extracted package/ dir not found under ${extractDir}`);
  }

  // Ground-truth file listing, captured BEFORE any test scaffolding (the
  // node_modules symlink below) touches pkgDir — this is what actually shipped.
  extractedPaths = walkAll(pkgDir);

  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    throw new Error(`package.json not found in extracted tarball at ${pkgJsonPath}`);
  }
  pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
  const installedNpmShrinkwrapIdentity = readCanonicalNpmShrinkwrapIdentity(pkgDir);
  if (installedNpmShrinkwrapIdentity.sha256 !== sourceNpmShrinkwrapSha256) {
    throw new Error(
      `E_PACKED_INSTALL_SHRINKWRAP_MISMATCH:${sourceNpmShrinkwrapSha256}:${installedNpmShrinkwrapIdentity.sha256}`,
    );
  }

  // Symlink node_modules from the live workspace so the real-import checks below
  // resolve external bare specifiers (better-sqlite3, commander, ws, ...) without
  // re-running a full `npm install` — tests/e2e/npm-pack-smoke.test.ts already
  // covers the full-install path. Node's ESM resolver walks up from the importing
  // file looking for a node_modules dir; placing one at pkgDir satisfies every
  // import inside the tarball, at any depth. Verified manually: real dynamic
  // `import()` of a copied dist/index.js + dist/sdk/index.js against a symlinked
  // node_modules succeeds in an isolated tmpdir.
  symlinkSync(join(PROJECT_ROOT, 'node_modules'), join(pkgDir, 'node_modules'), 'dir');
}, 90_000);

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

async function runInstalledNativeVerifier(packageRoot: string): Promise<CmdResult> {
  return runCmd(
    process.execPath,
    [
      join(PROJECT_ROOT, 'scripts', 'verify-exec-authority-native-package.mjs'),
      '--package-root',
      packageRoot,
      '--expected-environment',
      expectedEnvironmentKind(),
      '--expected-shrinkwrap-sha256',
      sourceNpmShrinkwrapSha256,
    ],
    tmpRoot,
    120_000,
  );
}

function rejectedVerifierCode(result: CmdResult): string {
  expect(result.exitCode).not.toBe(0);
  const lines = result.stderr.trim().split(/\r?\n/u).filter(Boolean);
  expect(lines).toHaveLength(1);
  const receipt = JSON.parse(lines[0]) as { event?: unknown; code?: unknown };
  expect(receipt.event).toBe('EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_REJECTED');
  expect(receipt.code).toMatch(/^E_NATIVE_VERIFY_/u);
  return receipt.code as string;
}

function cloneExtractedPackage(label: string): string {
  const cloneRoot = join(tmpRoot, label);
  cpSync(pkgDir, cloneRoot, {
    recursive: true,
    dereference: false,
    filter: (source) => source !== join(pkgDir, 'node_modules'),
  });
  return cloneRoot;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.runIf(ACTIVE_LINUX_PROOF)(
  'packed-install-contract (PKG-01/T20) — real Linux tarball, extracted',
  () => {
  it('produced a real tarball and extracted it to package/', () => {
    expect(pkgDir, 'pkgDir must be set by beforeAll').not.toBe('');
    expect(existsSync(pkgDir)).toBe(true);
    expect(extractedPaths.length, 'extracted tarball must not be empty').toBeGreaterThan(0);
  });

  it('ships one canonical shrinkwrap and no competing root lock authority', () => {
    expect(readCanonicalNpmShrinkwrapIdentity(pkgDir).sha256)
      .toBe(sourceNpmShrinkwrapSha256);
    expect(extractedPaths.filter(path => path === 'npm-shrinkwrap.json')).toHaveLength(1);
    for (const forbiddenLock of [
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
    ]) {
      expect(extractedPaths).not.toContain(forbiddenLock);
    }
  });

  it(
    'every package.json exports entry resolves to a real, importable file in the extracted tarball',
    async () => {
      const exportsMap = pkg.exports ?? {};
      const subpaths = Object.keys(exportsMap);
      expect(subpaths.length, 'package.json exports map must not be empty').toBeGreaterThan(0);

      for (const subpath of subpaths) {
        const target = exportsMap[subpath];
        const importRel = target?.import;
        expect(typeof importRel, `exports["${subpath}"].import must be a string`).toBe('string');

        const absPath = join(pkgDir, importRel as string);
        expect(
          existsSync(absPath),
          `exports["${subpath}"].import ("${importRel}") not found in extracted tarball at ${absPath}`,
        ).toBe(true);

        const fileUrl = pathToFileURL(absPath).href;
        const script =
          `import(${JSON.stringify(fileUrl)})` +
          `.then(() => { process.exit(0); })` +
          `.catch((e) => { console.error(e && e.stack ? e.stack : String(e)); process.exit(1); });`;
        const importResult = await runCmd('node', ['-e', script], pkgDir, 30_000);
        expect(
          importResult.exitCode,
          `real import of exports["${subpath}"] (${importRel}) failed from the extracted tarball:\n${importResult.stderr}`,
        ).toBe(0);
      }
    },
    120_000,
  );

  it('every package.json bin entry exists and is executable in the extracted tarball', () => {
    const binMap = pkg.bin ?? {};
    const binNames = Object.keys(binMap);
    expect(binNames.length, 'package.json bin map must not be empty').toBeGreaterThan(0);

    for (const name of binNames) {
      const rel = binMap[name] as string;
      const absPath = join(pkgDir, rel);
      expect(existsSync(absPath), `bin["${name}"] ("${rel}") not found in extracted tarball`).toBe(true);
      const mode = statSync(absPath).mode;
      expect(mode & 0o111, `bin["${name}"] ("${rel}") must have an execute bit set`).not.toBe(0);
    }
  });

  it('dashboard bundle (index.html + assets) is present in the extracted tarball', () => {
    const indexHtml = join(pkgDir, 'dist', 'dashboard', 'index.html');
    expect(existsSync(indexHtml), 'dist/dashboard/index.html missing from extracted tarball').toBe(true);

    const assetsDir = join(pkgDir, 'dist', 'dashboard', 'assets');
    expect(existsSync(assetsDir), 'dist/dashboard/assets/ missing from extracted tarball').toBe(true);
    const assetFiles = readdirSync(assetsDir);
    expect(assetFiles.length, 'dist/dashboard/assets/ must contain at least one file').toBeGreaterThan(0);
  });

  it('builtins tree ships at least one agent PROMPT.md and one skill SKILL.md', () => {
    const agentsDir = join(pkgDir, 'dist', 'core', 'builtins', 'agents');
    expect(existsSync(agentsDir), 'dist/core/builtins/agents/ missing from extracted tarball').toBe(true);
    const agentDirs = readdirSync(agentsDir).filter((e) => statSync(join(agentsDir, e)).isDirectory());
    const agentsWithPrompt = agentDirs.filter((d) => existsSync(join(agentsDir, d, 'PROMPT.md')));
    expect(
      agentsWithPrompt.length,
      `expected >=1 agent with PROMPT.md under dist/core/builtins/agents/; found dirs: ${agentDirs.join(', ')}`,
    ).toBeGreaterThan(0);

    const skillsDir = join(pkgDir, 'dist', 'core', 'builtins', 'skills');
    expect(existsSync(skillsDir), 'dist/core/builtins/skills/ missing from extracted tarball').toBe(true);
    const skillDirs = readdirSync(skillsDir).filter((e) => statSync(join(skillsDir, e)).isDirectory());
    const skillsWithManifest = skillDirs.filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')));
    expect(
      skillsWithManifest.length,
      `expected >=1 skill with SKILL.md under dist/core/builtins/skills/; found dirs: ${skillDirs.join(', ')}`,
    ).toBeGreaterThan(0);
  });

  it('assets/Dockerfile.worker is present in the extracted tarball', () => {
    const dockerfilePath = join(pkgDir, 'assets', 'Dockerfile.worker');
    expect(existsSync(dockerfilePath), 'assets/Dockerfile.worker missing from extracted tarball').toBe(true);
  });

  it('runs the installed-package native verifier unconditionally and accepts one exact receipt', async () => {
    const result = await runInstalledNativeVerifier(pkgDir);
    expect(result.exitCode, result.stderr).toBe(0);
    const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      schemaVersion: 1,
      event: 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED',
      rootPackageName: 'deckent',
      nativePackageName: '@deckent/exec-authority-native',
      platform: 'linux',
      arch: process.arch,
      environment: {
        environmentKind: expectedEnvironmentKind(),
        expectedEnvironmentKind: expectedEnvironmentKind(),
      },
      environmentEvidenceSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      npmShrinkwrapSha256: sourceNpmShrinkwrapSha256,
      npmShrinkwrapByteLength: statSync(join(pkgDir, 'npm-shrinkwrap.json')).size,
      npmShrinkwrapPackageCount: expect.any(Number),
      nativeArtifactOrigin: 'PACKAGED_PREBUILD',
      installTimeNativeBuild: 'ABSENT',
      installTimeNativeDownload: 'ABSENT',
      lifecycle: {
        state: 'PUBLISHED_READ_VERIFIED',
        filesystemType: expect.stringMatching(/^0x[0-9a-f]+$/u),
      },
    });
  }, 120_000);

  it('rejects missing, partial, artifact, source and shrinkwrap drift', async () => {
    const relativeArtifactRoot = join(
      'native',
      'exec-authority',
      'prebuilds',
      `linux-${process.arch}`,
      'napi-v8',
    );

    const missing = cloneExtractedPackage('missing-native-payload');
    rmSync(join(missing, 'native', 'exec-authority', 'prebuilds'), {
      recursive: true,
      force: true,
    });
    expect(rejectedVerifierCode(await runInstalledNativeVerifier(missing)))
      .toBe('E_NATIVE_VERIFY_PREBUILD_LAYOUT');

    const partial = cloneExtractedPackage('partial-native-payload');
    rmSync(join(partial, relativeArtifactRoot, 'exec_authority.node'));
    expect(rejectedVerifierCode(await runInstalledNativeVerifier(partial)))
      .toBe('E_NATIVE_VERIFY_PREBUILD_LAYOUT');

    const artifactDrift = cloneExtractedPackage('artifact-drift-native-payload');
    const artifactPath = join(artifactDrift, relativeArtifactRoot, 'artifact.json');
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8')) as Record<string, unknown>;
    writeFileSync(artifactPath, `${JSON.stringify({
      ...artifact,
      binarySha256: `sha256:${'0'.repeat(64)}`,
    }, null, 2)}\n`);
    expect(rejectedVerifierCode(await runInstalledNativeVerifier(artifactDrift)))
      .toBe('E_NATIVE_VERIFY_BINARY_IDENTITY');

    const sourceDrift = cloneExtractedPackage('source-drift-native-payload');
    writeFileSync(
      join(sourceDrift, 'native', 'exec-authority', 'src', 'custody_posix.c'),
      '/* source drift after artifact build */\n',
    );
    expect(rejectedVerifierCode(await runInstalledNativeVerifier(sourceDrift)))
      .toBe('E_NATIVE_VERIFY_SOURCE_IDENTITY');

    const shrinkwrapDrift = cloneExtractedPackage('shrinkwrap-drift-native-payload');
    const shrinkwrapPath = join(shrinkwrapDrift, 'npm-shrinkwrap.json');
    const shrinkwrap = JSON.parse(readFileSync(shrinkwrapPath, 'utf-8')) as {
      packages: Record<string, unknown>;
    };
    shrinkwrap.packages['node_modules/unauthorized-drift'] = { version: '1.0.0' };
    writeFileSync(shrinkwrapPath, `${JSON.stringify(shrinkwrap, null, 2)}\n`);
    expect(rejectedVerifierCode(await runInstalledNativeVerifier(shrinkwrapDrift)))
      .toBe('E_NATIVE_VERIFY_NPM_SHRINKWRAP_DIGEST_MISMATCH');
  }, 120_000);

  it('no dev-only source (.deckent/ .brain/ .tasks/ tests/ src/) leaked into the tarball root', () => {
    // Checked at the TOP LEVEL of the packaged tree only (package.json "files" controls
    // exactly what ships at the root) — NOT as "any path segment anywhere", which would
    // false-positive on legitimate nested dist output. E.g. the vscode extension's own
    // source layout is src/extensions/vscode/src/*.ts, so its compiled artifacts land at
    // dist/extensions/vscode/src/*.js — a real, required build output, not leaked dev source.
    const forbidden = ['.deckent', '.brain', '.tasks', 'tests', 'src'];
    const topLevelEntries = new Set(extractedPaths.map((p) => p.split('/')[0]));
    const offenders = forbidden.filter((name) => topLevelEntries.has(name));
    expect(
      offenders,
      `internal/dev-source dir(s) leaked into the tarball root: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
  },
);
