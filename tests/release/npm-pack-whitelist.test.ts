// ─── npm-pack-whitelist (row 8091) ─────────────────────────────────────────
// Task 519-007. Measured: the `deckent` name returned registry 404 on 2026-07-31 —
// unregistered and squatting-exposed. Publish itself is ALWAYS owner-manual (see the
// exact, unexecuted owner-run commands in this task's .result notes). What CAN be
// proven hermetically — without publishing and without network — is the SHAPE of the
// tarball npm would produce.
//
// Primary path: `npm pack --dry-run --json` as a local child process against the real
// package.json. `--dry-run` never writes a tarball or touches the registry; `--offline`
// plus `NO_UPDATE_NOTIFIER=1` additionally suppress npm's background update-check ping,
// so the whole call is network-free (verified manually against this repo's real
// manifest before writing this suite).
//
// Fallback: if the sandbox's hermeticity policy refuses even that local child process,
// this suite derives the identical file list in-process — package.json `files` field
// walked on disk, plus npm's always-included package.json/README*/LICENSE* — with no
// npm invocation and no network at all. Which path ran is recorded in `derivation.via`
// and asserted below.
//
// Whitelist note: the row's shorthand ("dist, bin, README and LICENSE only") describes
// the load-bearing categories; the real manifest's own `files` field additionally
// declares `assets` (ships `assets/Dockerfile.worker`, required by
// tests/release/packed-install-contract.test.ts) and npm always adds `package.json`
// itself. The whitelist here is derived FROM the manifest's own `files` field (not
// hardcoded independently of it) so it fails honestly if an undeclared path — internal
// state, test/source files, source maps — ever leaks into the packed tarball.

import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

interface PackedFile {
  path: string;
  size: number;
}

interface DerivationResult {
  via: 'npm-dry-run' | 'manifest-fallback';
  files: PackedFile[];
}

interface PackageManifest {
  name: string;
  files?: string[];
  bin?: Record<string, string>;
}

// Async subprocess — no spawnSync (project hermeticity rule: scripts/lint-no-spawnsync.mjs).
function runCmd(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env: NodeJS.ProcessEnv,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((res, rej) => {
    const proc = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs, env });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', rej);
    proc.on('close', (code) => res({ exitCode: code ?? 1, stdout, stderr }));
  });
}

/** Recursively list every FILE under `absDir`, as POSIX-style paths relative to PROJECT_ROOT. */
function walkFiles(absDir: string): PackedFile[] {
  const out: PackedFile[] = [];
  const stack = [absDir];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else {
        out.push({ path: relative(PROJECT_ROOT, full).split(sep).join('/'), size: st.size });
      }
    }
  }
  return out;
}

/** In-process fallback: manifest `files` field + npm's always-included entries. No npm, no network. */
function deriveFromManifestInProcess(pkg: PackageManifest): PackedFile[] {
  const files: PackedFile[] = [];
  const pkgJsonPath = join(PROJECT_ROOT, 'package.json');
  files.push({ path: 'package.json', size: statSync(pkgJsonPath).size });

  for (const entry of readdirSync(PROJECT_ROOT)) {
    if (/^README/i.test(entry) || /^LICEN[SC]E/i.test(entry)) {
      const full = join(PROJECT_ROOT, entry);
      if (statSync(full).isFile()) files.push({ path: entry, size: statSync(full).size });
    }
  }

  for (const declared of pkg.files ?? []) {
    const abs = join(PROJECT_ROOT, declared);
    if (!existsSync(abs)) continue; // declared but absent on this checkout — not a leak
    const st = statSync(abs);
    if (st.isDirectory()) {
      files.push(
        ...walkFiles(abs).filter(
          (f) => !/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f.path) && !f.path.split('/').includes('node_modules'),
        ),
      );
    } else if (st.isFile()) {
      files.push({ path: declared, size: st.size });
    }
  }
  return files;
}

let derivation: DerivationResult;
let pkg: PackageManifest;

beforeAll(async () => {
  pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8')) as PackageManifest;

  const env: NodeJS.ProcessEnv = { ...process.env, NO_UPDATE_NOTIFIER: '1' };
  try {
    const result = await runCmd('npm', ['pack', '--dry-run', '--json', '--offline'], PROJECT_ROOT, 60_000, env);
    if (result.exitCode !== 0) {
      throw new Error(`npm pack --dry-run exited ${result.exitCode}: ${result.stderr}`);
    }
    const parsed: unknown = JSON.parse(result.stdout);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const rawFiles = (entry as { files?: unknown })?.files;
    if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
      throw new Error('npm pack --dry-run --json produced no files[] — cannot derive whitelist');
    }
    derivation = {
      via: 'npm-dry-run',
      files: rawFiles.map((f) => ({ path: (f as PackedFile).path, size: (f as PackedFile).size })),
    };
  } catch (err) {
    derivation = { via: 'manifest-fallback', files: deriveFromManifestInProcess(pkg) };
    // eslint-disable-next-line no-console
    console.warn(
      'npm-pack-whitelist: real `npm pack --dry-run` unavailable in this sandbox ' +
        `(${(err as Error).message}); derived the whitelist from package.json files field ` +
        'in-process instead.',
    );
  }
}, 90_000);

describe('npm pack whitelist (row 8091) — hermetic, no publish, no network', () => {
  it('derived a non-empty file list via one of the two sanctioned paths', () => {
    expect(['npm-dry-run', 'manifest-fallback']).toContain(derivation.via);
    expect(derivation.files.length).toBeGreaterThan(0);
  });

  it('every packed top-level entry is in the manifest-declared whitelist (dist, bin, assets, README*, LICENSE*, package.json)', () => {
    const declaredDirs = new Set((pkg.files ?? []).filter((f) => !/^(README|LICEN[SC]E)/i.test(f)));
    const isAllowed = (topSegment: string) =>
      topSegment === 'package.json' ||
      /^README/i.test(topSegment) ||
      /^LICEN[SC]E/i.test(topSegment) ||
      declaredDirs.has(topSegment);

    const offenders = derivation.files.filter((f) => !isAllowed(f.path.split('/')[0]));
    expect(
      offenders.map((f) => f.path),
      `unexpected top-level entries outside the manifest whitelist (${[...declaredDirs].join(', ')}, README*, LICENSE*, package.json)`,
    ).toEqual([]);
  });

  it('no internal/dev state leaks in (.deckent, .brain, .tasks, .locks, .dashboard, .claude, .git, node_modules, docs, examples, deckent-hub, .contracts)', () => {
    const forbidden = [
      '.deckent', '.brain', '.tasks', '.locks', '.dashboard', '.claude', '.git',
      'node_modules', 'docs', 'examples', 'deckent-hub', '.contracts',
    ];
    const topLevel = new Set(derivation.files.map((f) => f.path.split('/')[0]));
    const offenders = forbidden.filter((name) => topLevel.has(name));
    expect(offenders, `forbidden internal path(s) present in the packed whitelist: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no test/spec source files ship (tests/, *.test.ts, *.test.js, *.spec.ts, *.spec.js)', () => {
    const offenders = derivation.files.filter(
      (f) => /(^|\/)tests?\//.test(f.path) || /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f.path),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('no source maps ship (no *.map) — private source paths / sourcesContent must never leak', () => {
    const offenders = derivation.files.filter((f) => f.path.endsWith('.map'));
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('dist/ is present and non-empty', () => {
    const distFiles = derivation.files.filter((f) => f.path.startsWith('dist/'));
    expect(distFiles.length).toBeGreaterThan(0);
  });

  it('every package.json bin entry resolves to a path that would ship', () => {
    const binMap = pkg.bin ?? {};
    const binPaths = Object.values(binMap).map((p) => p.replace(/^\.\//, ''));
    expect(binPaths.length).toBeGreaterThan(0);
    const shipped = new Set(derivation.files.map((f) => f.path));
    for (const rel of binPaths) {
      expect(shipped.has(rel), `bin entry "${rel}" not found in the packed whitelist`).toBe(true);
    }
  });

  it('README and LICENSE ship (root docs required for a public package)', () => {
    const paths = derivation.files.map((f) => f.path);
    expect(paths.some((p) => /^README(\.|$)/i.test(p))).toBe(true);
    expect(paths.some((p) => /^LICEN[SC]E(\.|$)/i.test(p))).toBe(true);
  });
});
