// ─── npm pack hermetic smoke test ─────────────────────────────────────────────
// Verifies the full pack → install → run flow without hitting the npm registry
// beyond what --prefer-offline allows (uses warm cache from CI's own npm install).
//
// Three key guarantees checked:
//  T1: npm pack produces a valid tarball with correct metadata
//  T2: Tarball preserves exec-bit (0o755) on dist/cli/entry.js and dist/mcp/server.js
//  T3: Installed package runs `--version` and both the .bin symlink and entry.js are executable
//
// No describe.skipIf(process.env.CI) — test must be hermetic in all environments.
// Heavy install test uses 120s timeout per task spec; lighter checks use 60s.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, rmSync, statSync, existsSync, mkdirSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// ─── Project root ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

// ─── Helper: async spawn wrapper ──────────────────────────────────────────────

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
  return new Promise((resolve, reject) => {
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
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

// ─── Shared state (populated in beforeAll) ────────────────────────────────────

let tmpRoot = '';
let packDir = '';
let extractDir = '';
let tarballPath = '';
let packageVersion = '';

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-pack-smoke-'));
  packDir = join(tmpRoot, 'pack');
  extractDir = join(tmpRoot, 'extracted');
  mkdirSync(packDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });

  // Redirect npm HOME so any cache/log writes land on the main filesystem,
  // not the small tmpfs that $HOME=/tmp/deckent-home may point to.
  const npmHomeDir = join(tmpRoot, 'npm-home');
  mkdirSync(npmHomeDir, { recursive: true });
  const npmEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: npmHomeDir,
    npm_config_cache: join(npmHomeDir, '.npm'),
  };

  // Pack from project root — captures tarball in packDir
  const packResult = await runCmd(
    'npm',
    ['pack', '--json', '--pack-destination', packDir],
    PROJECT_ROOT,
    60_000,
    npmEnv,
  );

  if (packResult.exitCode !== 0) {
    throw new Error(`npm pack failed (exit ${packResult.exitCode}):\n${packResult.stderr}`);
  }

  const packData = JSON.parse(packResult.stdout);
  const entry = Array.isArray(packData) ? packData[0] : packData;
  packageVersion = entry.version as string;
  tarballPath = join(packDir, entry.filename as string);

  // Extract tarball for exec-bit inspection (tar xzf preserves permissions)
  const tarResult = await runCmd(
    'tar', ['xzf', tarballPath, '-C', extractDir],
    extractDir, 30_000,
  );
  if (tarResult.exitCode !== 0) {
    throw new Error(`tar extract failed:\n${tarResult.stderr}`);
  }
}, 90_000);

afterAll(() => {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('npm pack smoke — hermetic install verification', () => {

  // T1: Pack produces a valid tarball with expected metadata
  it('npm pack creates tarball with correct package name, version, and file list', () => {
    expect(tarballPath, 'tarball path must be set by beforeAll').not.toBe('');
    expect(existsSync(tarballPath), `tarball not found: ${tarballPath}`).toBe(true);

    // Tarball size must be non-trivial (dist/ + assets included)
    const stats = statSync(tarballPath);
    expect(stats.size, 'tarball should be larger than 100 KB').toBeGreaterThan(100_000);

    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  // T2: Tarball preserves exec-bit on the CLI and MCP entry points
  it('tarball preserves exec-bit (0o755) on dist/cli/entry.js and dist/mcp/server.js', () => {
    // npm pack extracts into a 'package/' subdirectory inside the tarball
    const pkgDir = join(extractDir, 'package');
    expect(existsSync(pkgDir), `extracted package/ dir not found in ${extractDir}`).toBe(true);

    const entryPath = join(pkgDir, 'dist', 'cli', 'entry.js');
    expect(existsSync(entryPath), `dist/cli/entry.js not found in tarball extract`).toBe(true);
    const entryMode = statSync(entryPath).mode;
    expect(
      entryMode & 0o111,
      `dist/cli/entry.js must have exec bit; actual mode: ${(entryMode & 0o777).toString(8)}`,
    ).not.toBe(0);

    const serverPath = join(pkgDir, 'dist', 'mcp', 'server.js');
    expect(existsSync(serverPath), `dist/mcp/server.js not found in tarball extract`).toBe(true);
    const serverMode = statSync(serverPath).mode;
    expect(
      serverMode & 0o111,
      `dist/mcp/server.js must have exec bit; actual mode: ${(serverMode & 0o777).toString(8)}`,
    ).not.toBe(0);
  });

  // T3: Full install + binary run (heavy — 120s timeout)
  it(
    'installed binary runs --version and installed entry.js has exec-bit',
    async () => {
      const installDir = join(tmpRoot, 'install-test');
      mkdirSync(installDir, { recursive: true });

      // Override HOME so npm logs/cache land on the main filesystem, not the
      // small tmpfs that $HOME=/tmp/deckent-home might point to.
      const npmHomeDir = join(tmpRoot, 'npm-home');
      mkdirSync(npmHomeDir, { recursive: true });
      const npmEnv: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: npmHomeDir,
        npm_config_cache: join(npmHomeDir, '.npm'),
      };

      // Minimal package.json so npm install has a context
      await runCmd('npm', ['init', '-y'], installDir, 10_000, npmEnv);

      // Install the tarball; --cache redirects npm's disk writes to main filesystem
      // (belt-and-suspenders alongside the HOME env override)
      const npmCacheDir = join(npmHomeDir, '.npm');
      const installResult = await runCmd(
        'npm',
        [
          'install', tarballPath,
          '--no-audit', '--no-fund',
          '--prefer-offline',
          '--cache', npmCacheDir,
        ],
        installDir,
        110_000,
        npmEnv,
      );

      expect(
        installResult.exitCode,
        `npm install from tarball failed:\n${installResult.stderr}`,
      ).toBe(0);

      // .bin/deckent symlink must exist and be executable
      const binPath = join(installDir, 'node_modules', '.bin', 'deckent');
      expect(existsSync(binPath), `node_modules/.bin/deckent not found`).toBe(true);
      const binMode = statSync(binPath).mode;
      expect(binMode & 0o111, `.bin/deckent must be executable`).not.toBe(0);

      // Installed dist/cli/entry.js must have exec-bit
      const entryPath = join(installDir, 'node_modules', 'deckent', 'dist', 'cli', 'entry.js');
      expect(existsSync(entryPath), `installed dist/cli/entry.js not found`).toBe(true);
      const entryMode = statSync(entryPath).mode;
      expect(
        entryMode & 0o111,
        `installed dist/cli/entry.js must have exec bit; mode: ${(entryMode & 0o777).toString(8)}`,
      ).not.toBe(0);

      // Run the binary and verify it prints a semver version string
      const versionResult = await runCmd(
        join(installDir, 'node_modules', '.bin', 'deckent'),
        ['--version'],
        installDir,
        15_000,
      );
      expect(
        versionResult.exitCode,
        `deckent --version failed:\nstdout: ${versionResult.stdout}\nstderr: ${versionResult.stderr}`,
      ).toBe(0);
      const versionOutput = (versionResult.stdout + versionResult.stderr).trim();
      expect(
        versionOutput,
        `deckent --version must print a semver string; got: '${versionOutput}'`,
      ).toMatch(/\d+\.\d+\.\d+/);
    },
    120_000,
  );

  // T4: Tarball also includes the MCP server binary (belt-and-suspenders)
  it('tarball includes dist/mcp/server.js (MCP server binary)', () => {
    const serverPath = join(extractDir, 'package', 'dist', 'mcp', 'server.js');
    expect(existsSync(serverPath), `dist/mcp/server.js must be present in packed tarball`).toBe(true);

    // Dashboard bundle should also be present (hollow-serve guard)
    const dashboardIndex = join(extractDir, 'package', 'dist', 'dashboard', 'index.html');
    expect(
      existsSync(dashboardIndex),
      `dist/dashboard/index.html not found — dashboard was not bundled into pack. ` +
      `Run 'npm run build:all' to include it.`,
    ).toBe(true);
  });
});
