#!/usr/bin/env node
// scripts/xplat-install-smoke.mjs — XPLAT-01 (Task 415-001).
//
// Real, OS-agnostic packed-install smoke test. Proves the actual end-user path
// works on THIS platform (Linux, macOS, or native Windows) — no OS-conditional
// bash lives in the CI workflow; every platform branch lives in this script:
//
//   1. npm pack                 — real tarball, packed from the already-built
//                                  repo (REPO_ROOT/dist must exist — the CI job
//                                  builds it first, same as every other CI job).
//   2. npm install -g <tarball> — isolated prefix (npm_config_prefix + HOME
//                                  override) so nothing touches real global npm
//                                  state ("global-kirlilik YOK").
//   3. installed native verify  — imports the installed dist/core adapter,
//                                  proves the packaged artifact/source/binary
//                                  identity, and executes one bounded native
//                                  custody publication/read lifecycle.
//   4. deckent init --yes       — non-interactive flow (413-001). Asserts the
//                                  outcome-block is printed and the exit code
//                                  matches the 3-state contract: READY=0 and
//                                  SETUP_INCOMPLETE=2 are both accepted (a
//                                  provider-less CI env legitimately lands on
//                                  SETUP_INCOMPLETE); FAILED=1 fails the step.
//   5. deckent doctor            — runs to completion (informational). Its own
//                                  verdict/exit code is logged, not gated — a
//                                  freshly `--yes`-initialized env with no
//                                  provider credentials can legitimately report
//                                  Risky, which is a doctor-verdict concern, not
//                                  a packed-install concern.
//
// Fails FAST and HONEST: the first failing step logs its name + reason to
// stderr and the process exits 1 immediately.
//
// Usage:   node scripts/xplat-install-smoke.mjs
// Success: last stdout line is 'XPLAT SMOKE OK (<platform>)', exit 0.

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { release as osRelease, tmpdir } from 'node:os';
import { join, resolve, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCanonicalNpmShrinkwrapIdentity } from './npm-shrinkwrap-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const IS_WIN = process.platform === 'win32';

function platformLabel() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

const PLATFORM = platformLabel();

function expectedInstalledEnvironmentKind() {
  if (process.platform === 'darwin' || process.platform === 'win32') return process.platform;
  const kernelRelease = osRelease().toLowerCase();
  return kernelRelease.includes('microsoft') && kernelRelease.includes('wsl2') ? 'wsl2' : 'linux';
}

function stepLog(step, msg) {
  process.stderr.write(`[xplat-smoke:${PLATFORM}] ${step} — ${msg}\n`);
}

class SmokeStepError extends Error {
  constructor(step, detail) {
    super(`${step}: ${detail}`);
    this.step = step;
  }
}

/**
 * born-695: honest, diagnosis-grade failure detail for a runCmd result.
 * The 1570143b windows leg failed as a bare "npm install -g exited 1" while
 * BOTH attempts actually ran ~300s (>180s spawn timeout) and npm's real error
 * lived in stdout/its debug log — stderr alone carried only warnings. Every
 * step-failure now reports timedOut + elapsed + stderr + stdout tail so a CI
 * failure is diagnosable from the job log alone.
 */
function failDetail(result, elapsedMs) {
  const tail = (s, n) => {
    const lines = (s ?? '').split('\n');
    return lines.length > n ? `…(+${lines.length - n} lines)\n${lines.slice(-n).join('\n')}` : (s ?? '');
  };
  return (
    `exited ${result.exitCode} (timedOut=${result.timedOut}, elapsed=${Math.round(elapsedMs / 1000)}s)\n` +
    `STDERR:\n${tail(result.stderr, 80)}\n` +
    `STDOUT(tail):\n${tail(result.stdout, 120)}`
  );
}

/** Async spawn wrapper — never spawnSync; multi-minute install steps must not block the event loop. */
function runCmd(cmd, args, cwd, timeoutMs, env) {
  return new Promise((resolvePromise) => {
    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env,
      // npm / installed global shims resolve through .cmd wrappers on Windows —
      // POSIX stays shell-free (mirrors scripts/build-dashboard.mjs).
      shell: IS_WIN,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => resolvePromise({ exitCode: -1, timedOut: false, stdout, stderr: `${stderr}\n${err.message}` }));
    // Spawn-timeout kills the child (SIGTERM) → close fires with code=null.
    // Surface that HONESTLY as timedOut instead of masking it as exit 1 —
    // the first two windows-latest CI legs failed exactly on this mask
    // (born-665 forensics: init exceeded 120s because `--yes` silently
    // npm-installs three provider CLIs, ~2min on the runner; born-666).
    proc.on('close', (code, signal) => resolvePromise({
      exitCode: code ?? 1,
      timedOut: code === null && signal !== null,
      stdout,
      stderr,
    }));
  });
}

/** Global-bin dirs a custom npm_config_prefix can plausibly place shims in, per platform. */
function globalBinDirs(prefixDir) {
  // POSIX: npm always uses `${prefix}/bin`. Windows: npm places shims directly
  // at the prefix root, not a `bin` subdir — but we probe both to stay honest
  // about npm-version-specific layout differences rather than assuming one.
  return IS_WIN ? [prefixDir, join(prefixDir, 'bin')] : [join(prefixDir, 'bin')];
}

function candidateBinPaths(prefixDir) {
  const names = IS_WIN ? ['deckent.cmd', 'deckent.ps1', 'deckent'] : ['deckent'];
  return globalBinDirs(prefixDir).flatMap((dir) => names.map((n) => join(dir, n)));
}

/** npm global installs have one platform-specific package-root layout. */
function installedPackageRoot(prefixDir) {
  const candidates = IS_WIN
    ? [join(prefixDir, 'node_modules', 'deckent'), join(prefixDir, 'lib', 'node_modules', 'deckent')]
    : [join(prefixDir, 'lib', 'node_modules', 'deckent'), join(prefixDir, 'node_modules', 'deckent')];
  const present = candidates.filter((candidate) => existsSync(candidate));
  if (present.length !== 1) {
    throw new SmokeStepError(
      'native-package',
      `expected exactly one installed package root; observed ${present.length}; probed:\n${candidates.join('\n')}`,
    );
  }
  return present[0];
}

function validateNativeVerifierReceipt(stdout, expectedShrinkwrapSha256) {
  const lines = stdout.split(/\r?\n/u).filter((line) => line.length > 0);
  if (lines.length !== 1) {
    throw new SmokeStepError(
      'native-package',
      `verifier emitted ${lines.length} non-empty stdout lines instead of one exact receipt`,
    );
  }
  let receipt;
  try {
    receipt = JSON.parse(lines[0]);
  } catch (error) {
    throw new SmokeStepError('native-package', `verifier receipt is not JSON: ${error.message}`);
  }
  const isDigest = (value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
  const expectedFeatures = process.platform === 'win32'
    ? ['custody-win32-v1']
    : ['custody-posix-v1', 'legacy-posix-fd-v1'];
  const expectedEnvironment = expectedInstalledEnvironmentKind();
  if (receipt === null
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || receipt.schemaVersion !== 1
    || receipt.event !== 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED'
    || receipt.rootPackageName !== 'deckent'
    || receipt.nativePackageName !== '@deckent/exec-authority-native'
    || receipt.platform !== process.platform
    || receipt.arch !== process.arch
    || receipt.environment?.environmentKind !== expectedEnvironment
    || receipt.environment?.expectedEnvironmentKind !== expectedEnvironment
    || !/^0x[0-9a-f]+$/u.test(receipt.environment?.packageFilesystemType ?? '')
    || (process.platform === 'linux' && !isDigest(receipt.environment?.bootIdentitySha256))
    || !isDigest(receipt.environmentEvidenceSha256)
    || receipt.abiVersion !== '1.0.0'
    || receipt.napiVersion !== 8
    || !Array.isArray(receipt.features)
    || receipt.features.length !== expectedFeatures.length
    || receipt.features.some((feature, index) => feature !== expectedFeatures[index])
    || !Number.isSafeInteger(receipt.runtimeNapiVersion)
    || receipt.runtimeNapiVersion < 8
    || receipt.installTimeNativeBuild !== 'ABSENT'
    || receipt.installTimeNativeDownload !== 'ABSENT'
    || receipt.nativeArtifactOrigin !== 'PACKAGED_PREBUILD'
    || !isDigest(receipt.artifactSha256)
    || !isDigest(receipt.binarySha256)
    || !isDigest(receipt.nativeSourceTreeSha256)
    || !isDigest(receipt.packageEvidenceSha256)
    || receipt.npmShrinkwrapSha256 !== expectedShrinkwrapSha256
    || receipt.lifecycle?.state !== 'PUBLISHED_READ_VERIFIED'
    || !/^0x[0-9a-f]+$/u.test(receipt.lifecycle?.filesystemType ?? '')
    || !isDigest(receipt.lifecycle?.payloadSha256)
    || !isDigest(receipt.lifecycle?.evidenceSha256)) {
    throw new SmokeStepError('native-package', 'verifier receipt contract mismatch');
  }
  return receipt;
}

async function main() {
  stepLog('start', `platform=${process.platform} node=${process.version} repoRoot=${REPO_ROOT}`);

  let tmpRoot = null;
  try {
    // This remains the network-enabled cross-platform supporting smoke. The
    // fresh-cache/offline product proof is owned exclusively by
    // verify-packed-networkless-install.mjs and must not be inferred here.
    const sourceNpmShrinkwrapIdentity = readCanonicalNpmShrinkwrapIdentity(REPO_ROOT);
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-xplat-'));
    const npmHomeDir = join(tmpRoot, 'npm-home');
    mkdirSync(npmHomeDir, { recursive: true });
    const npmCacheDir = join(npmHomeDir, '.npm');
    // Redirect HOME/USERPROFILE + npm cache so nothing touches the real user
    // profile or npm state, and cache writes land off any small tmpfs $HOME.
    const isolatedEnv = {
      ...process.env,
      HOME: npmHomeDir,
      USERPROFILE: npmHomeDir,
      npm_config_cache: npmCacheDir,
    };

    // ── Step 1: npm pack — real tarball from the already-built repo ────────
    const packDir = join(tmpRoot, 'pack');
    mkdirSync(packDir, { recursive: true });
    stepLog('pack', 'npm pack --json (real tarball, no mocks)');
    const packResult = await runCmd(
      'npm', ['pack', '--json', '--pack-destination', packDir],
      REPO_ROOT, 120_000, isolatedEnv,
    );
    if (packResult.exitCode !== 0) {
      throw new SmokeStepError('pack', `npm pack exited ${packResult.exitCode}\n${packResult.stderr}`);
    }
    let tarballPath;
    try {
      const packData = JSON.parse(packResult.stdout);
      const entry = Array.isArray(packData) ? packData[0] : packData;
      tarballPath = join(packDir, entry.filename);
    } catch (err) {
      throw new SmokeStepError('pack', `could not parse npm pack --json output: ${err.message}\n${packResult.stdout}`);
    }
    if (!existsSync(tarballPath)) {
      throw new SmokeStepError('pack', `tarball missing after pack: ${tarballPath}`);
    }
    stepLog('pack', `OK — ${tarballPath}`);

    // ── Step 2: isolated-prefix global install (no global pollution) ───────
    const globalPrefix = join(tmpRoot, 'npm-global');
    mkdirSync(globalPrefix, { recursive: true });
    stepLog('install', `npm install -g <tarball> — npm_config_prefix=${globalPrefix} (isolated)`);
    // Deliberately NOT --ignore-scripts: better-sqlite3 needs its own install
    // script to fetch/build the correct native binding for THIS OS/arch — the
    // whole point of this smoke is proving that resolves on every platform.
    const installEnv = { ...isolatedEnv, npm_config_prefix: globalPrefix };
    // born-695: 180s was too tight for a slow windows-latest runner — the
    // 1570143b leg's native-binding install (better-sqlite3 prebuild/gyp)
    // legitimately ran ~300s on BOTH attempts. 360s gives slow runners
    // headroom while the workflow-level bounded retry still caps total cost.
    const installStart = Date.now();
    const installResult = await runCmd(
      'npm', ['install', '-g', tarballPath, '--no-audit', '--no-fund'],
      tmpRoot, 360_000, installEnv,
    );
    if (installResult.exitCode !== 0) {
      throw new SmokeStepError('install', `npm install -g ${failDetail(installResult, Date.now() - installStart)}`);
    }
    const candidates = candidateBinPaths(globalPrefix);
    const resolvedBin = candidates.find((p) => existsSync(p));
    if (!resolvedBin) {
      throw new SmokeStepError('install', `no installed binary found; probed:\n${candidates.join('\n')}`);
    }
    stepLog('install', `OK — resolved binary at ${resolvedBin}`);

    // PATH-based invocation from here on — mirrors what a real user gets after
    // adding the (isolated) global prefix to PATH, and is robust to whichever
    // shim layout the installed npm version actually chose.
    const runnerEnv = {
      ...process.env,
      HOME: npmHomeDir,
      USERPROFILE: npmHomeDir,
      PATH: [...globalBinDirs(globalPrefix), process.env.PATH].join(delimiter),
    };

    // ── Step 3: installed-package native proof (TN-PACKAGE) ───────────────
    const installedRoot = installedPackageRoot(globalPrefix);
    const installedNpmShrinkwrapIdentity = readCanonicalNpmShrinkwrapIdentity(installedRoot);
    if (installedNpmShrinkwrapIdentity.sha256 !== sourceNpmShrinkwrapIdentity.sha256) {
      throw new SmokeStepError(
        'native-package',
        `source/installed npm-shrinkwrap digest mismatch: ${sourceNpmShrinkwrapIdentity.sha256} != ${installedNpmShrinkwrapIdentity.sha256}`,
      );
    }
    const nativeVerifier = join(REPO_ROOT, 'scripts', 'verify-exec-authority-native-package.mjs');
    stepLog('native-package', `verify exact installed root ${installedRoot}`);
    const nativeVerifyStart = Date.now();
    const nativeVerifyResult = await runCmd(
      process.execPath,
      [
        nativeVerifier,
        '--package-root',
        installedRoot,
        '--expected-environment',
        expectedInstalledEnvironmentKind(),
        '--expected-shrinkwrap-sha256',
        sourceNpmShrinkwrapIdentity.sha256,
      ],
      tmpRoot,
      120_000,
      runnerEnv,
    );
    if (nativeVerifyResult.exitCode !== 0) {
      throw new SmokeStepError(
        'native-package',
        `installed native verifier ${failDetail(nativeVerifyResult, Date.now() - nativeVerifyStart)}`,
      );
    }
    const nativeReceipt = validateNativeVerifierReceipt(
      nativeVerifyResult.stdout,
      sourceNpmShrinkwrapIdentity.sha256,
    );
    stepLog(
      'native-package',
      `OK — ${nativeReceipt.platform}/${nativeReceipt.arch} ABI ${nativeReceipt.abiVersion} N-API ${nativeReceipt.napiVersion}`,
    );

    // ── Step 4: deckent init --yes (413-001 non-interactive flow) ──────────
    const initTarget = join(tmpRoot, 'init-target');
    mkdirSync(initTarget, { recursive: true });
    stepLog('init', `deckent init --yes (non-interactive) in ${initTarget}`);
    // 420s: `--yes` currently auto-installs 3 provider CLIs (~2min on slow
    // runners — born-666 decision pending); headroom so timeout means "hung",
    // not "network was slow".
    const initResult = await runCmd('deckent', ['init', '--yes'], initTarget, 420_000, runnerEnv);
    const initOutput = `${initResult.stdout}\n${initResult.stderr}`;
    const hasOutcomeBlock = /Setup outcome:|Kurulum sonucu:/.test(initOutput);
    if (!hasOutcomeBlock) {
      throw new SmokeStepError('init', `no outcome-block found in output (last 2000 chars):\n${initOutput.slice(-2000)}`);
    }
    if (![0, 2].includes(initResult.exitCode)) {
      // WIN665 / 417-001 — stderr-only diagnostic, captured SEPARATELY from the
      // combined stdout+stderr slice above: on windows-latest CI the outcome-block
      // (stdout) has printed correctly while the exit code itself was wrong (2 → 1,
      // likely an unrelated async rejection firing after the outcome decision — see
      // entry.ts's exit-code contract lock). Isolating stderr's own tail here gives
      // the NEXT CI run a chance to show the exact warning/stack the contract lock
      // now prints in that scenario, instead of it being buried in the combined slice.
      const stderrTail = initResult.stderr.trim().length > 0
        ? initResult.stderr.trim().split(/\r?\n/).slice(-20).join('\n')
        : '(stderr was empty)';
      throw new SmokeStepError(
        'init',
        initResult.timedOut
          ? `TIMED OUT (killed by smoke harness) — not an exit-code contract failure; `
            + `likely cause: --yes auto-provisioning network installs (born-666)`
          : `exit code ${initResult.exitCode} outside the accepted contract `
        + `{0=READY, 2=SETUP_INCOMPLETE}; 1=FAILED\n`
        + `--- combined output (last 2000 chars) ---\n${initOutput.slice(-2000)}\n`
        + `--- stderr only (last 20 lines) ---\n${stderrTail}`,
      );
    }
    stepLog('init', `OK — exit ${initResult.exitCode}, outcome-block present`);

    // ── Step 5: deckent doctor (runs + exits — informational) ──────────────
    stepLog('doctor', 'deckent doctor');
    const doctorResult = await runCmd('deckent', ['doctor'], initTarget, 60_000, runnerEnv);
    if (doctorResult.exitCode === -1) {
      throw new SmokeStepError('doctor', `doctor binary failed to spawn:\n${doctorResult.stderr}`);
    }
    stepLog('doctor', `OK — ran to completion, exit ${doctorResult.exitCode} (verdict not gated by this smoke)`);

    process.stdout.write(`XPLAT SMOKE OK (${PLATFORM})\n`);
    process.exitCode = 0;
  } catch (err) {
    const step = err instanceof SmokeStepError ? err.step : 'unknown';
    const detail = err && err.stack ? err.stack : String(err);
    stepLog(step, `FAIL — ${detail}`);
    process.exitCode = 1;
  } finally {
    if (tmpRoot) {
      try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  }
}

await main();
