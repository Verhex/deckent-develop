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
// Escape hatch: DECKENT_SKIP_PACK_TESTS=1 skips this whole suite (heavy: real `npm
// pack` + tar extract + N real subprocess imports). Windows is skipped honestly —
// tar/symlink semantics for node_modules differ there and are not worth emulating
// for a packaging-contract test that already runs on macOS/Linux CI.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, rmSync, mkdirSync, readdirSync, statSync, existsSync, symlinkSync, readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

const SKIP_ENV = process.env.DECKENT_SKIP_PACK_TESTS === '1';
const IS_WINDOWS = process.platform === 'win32';
const SKIP = SKIP_ENV || IS_WINDOWS;

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
let pkg: {
  exports?: Record<string, { import?: string; types?: string }>;
  bin?: Record<string, string>;
};

beforeAll(async () => {
  if (SKIP) return;

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
  const packData = JSON.parse(packResult.stdout);
  const entry = Array.isArray(packData) ? packData[0] : packData;
  const tarballPath = join(packDir, entry.filename as string);

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP)('packed-install-contract (PKG-01) — real tarball, extracted', () => {
  it('produced a real tarball and extracted it to package/', () => {
    expect(pkgDir, 'pkgDir must be set by beforeAll').not.toBe('');
    expect(existsSync(pkgDir)).toBe(true);
    expect(extractedPaths.length, 'extracted tarball must not be empty').toBeGreaterThan(0);
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
});
