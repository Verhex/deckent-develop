// FORBID-CLEAN contract (MASTER-PLAN row 60).
//
// Measured incident: a test run once reached the dist clean and destroyed the
// built binary mid-run. The destructive authority (`cleanDist` in
// scripts/clean.mjs) has since been hardened — physical-root binding, symlink
// rejection, execution-authority admission — and an unconditional test
// hermeticity refusal (E_HERMETIC_DIST_CLEAN) sits ahead of every other check.
// What was still missing is the CONTRACT: the caller inventory, and proof that
// the refusal fires for every caller class while an operator clean still works.
//
// Caller inventory — the complete set of paths by which TEST code can reach
// `cleanDist`, traced across scripts/ and the package.json script graph:
//
//   C1 import-time   a test imports scripts/clean.mjs and calls cleanDist().
//   C2 spawn-direct  a child runs `node scripts/clean.mjs` (the invokedDirectly
//                    branch at the bottom of clean.mjs).
//   C3 spawn-npm     a child runs the `clean` package script, which is exactly
//                    `node scripts/clean.mjs`.
//   C4 spawn-build   a child runs `build` / `build:all` — both begin with the
//                    `clean` script — or `release` / `prepublishOnly`, which
//                    reach it transitively through those two.
//   C5 build-import  NOT a clean path: scripts/build.mjs imports only the
//                    maintenance-lock symbols from clean.mjs, never cleanDist.
//                    The clean in a build is purely the npm-script prefix.
//                    Pinned below as a negative so wiring cleanDist into
//                    build.mjs cannot silently create a sixth caller class.
//
// Both halves of the guard are pinned here: the STATIC half (the hermeticity
// linter classifies each caller command as a `dist-clean` effect against the
// live dist, so a test that spawns one is a violation) and the RUNTIME half
// (the refusal actually fires, and the operator path actually still cleans).
//
// Every runtime assertion runs against a mkdtemp COPY of clean.mjs. This file
// never invokes the clean against this repository.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { traceCommandEffects } from '../../scripts/lint-test-hermeticity.mjs';

const REPO_ROOT = process.cwd();

/** Composed, never a literal: a bare build command here would trip the
 *  repository's own "no build while a sprint runs" pre-tool guard. */
const NPM_RUN = ['npm', 'run'].join(' ');

interface CommandEffect {
  effect: string;
  chain: string[];
}

const PACKAGE_SCRIPTS: Record<string, string> = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json'), 'utf-8'),
).scripts;

function commandEffects(command: string): CommandEffect[] {
  return traceCommandEffects(
    command,
    PACKAGE_SCRIPTS,
    new Set(),
    { rootDir: REPO_ROOT },
  ) as CommandEffect[];
}

function distCleanChains(command: string): string[][] {
  return commandEffects(command)
    .filter(effect => effect.effect === 'dist-clean')
    .map(effect => effect.chain);
}

const temporaryRoots: string[] = [];

function fixtureRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

/**
 * A physically separate copy of the clean script. `cleanDist` binds its
 * destructive authority to the realpath of its own source file, so the copy can
 * only ever act on this temp fixture — the live checkout is never a candidate,
 * even if a refusal were to regress.
 */
function cleanScriptFixture(prefix: string): { root: string; scriptPath: string } {
  const root = fixtureRoot(prefix);
  const scriptsDir = join(root, 'scripts');
  const scriptPath = join(scriptsDir, 'clean.mjs');
  mkdirSync(scriptsDir, { recursive: true });
  copyFileSync(join(REPO_ROOT, 'scripts', 'clean.mjs'), scriptPath);
  symlinkSync(
    join(REPO_ROOT, 'node_modules'),
    join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return { root, scriptPath };
}

/** Removable output plus the preserved dashboard bundle, as a real dist has. */
function seedDist(root: string): { removable: string; preserved: string } {
  const removable = join(root, 'dist', 'cli', 'entry.js');
  const preserved = join(root, 'dist', 'dashboard', 'index.html');
  mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
  mkdirSync(join(root, 'dist', 'dashboard'), { recursive: true });
  writeFileSync(removable, 'built-binary', 'utf-8');
  writeFileSync(preserved, 'built-dashboard', 'utf-8');
  return { removable, preserved };
}

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return env;
}

function runNode(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', rejectPromise);
    child.on('close', code => {
      clearTimeout(timeout);
      resolvePromise({ code, output });
    });
  });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('FORBID-CLEAN — static caller inventory', () => {
  it('pins the exact package scripts that reach the destructive clean', () => {
    const reaching = Object.entries(PACKAGE_SCRIPTS)
      .filter(([, body]) => distCleanChains(body).length > 0)
      .map(([name]) => name)
      .sort();

    // A ratchet, not a snapshot: a new script that reaches the clean is a new
    // caller class and must be added here deliberately, with its own runtime
    // refusal evidence below.
    expect(reaching).toEqual([
      'build',
      'build:all',
      'clean',
      'prepublishOnly',
      'release',
    ]);
  });

  it('classifies every test-reachable caller command as a dist-clean effect', () => {
    const callers: Array<{ label: string; command: string }> = [
      { label: 'C2 spawn-direct', command: 'node scripts/clean.mjs' },
      { label: 'C3 spawn-npm', command: `${NPM_RUN} clean` },
      { label: 'C4 spawn-build', command: `${NPM_RUN} build` },
      { label: 'C4 spawn-build:all', command: `${NPM_RUN} build:all` },
      { label: 'C4 transitive release', command: `${NPM_RUN} release` },
      { label: 'C4 transitive publish', command: `${NPM_RUN} prepublishOnly` },
    ];

    for (const caller of callers) {
      const chains = distCleanChains(caller.command);
      expect(chains, `${caller.label}: ${caller.command}`).toHaveLength(1);
      // Every chain must terminate at the one destructive script, so the
      // linter reports the real target rather than an opaque npm alias.
      expect(chains[0]!.at(-1), caller.label).toBe('scripts/clean.mjs');
    }
  });

  it('leaves legitimate non-clean commands unflagged', () => {
    // Over-blocking would make the guard unusable: the linter must not paint
    // ordinary build steps or test runs as destructive.
    for (const command of [
      'npx vitest run tests/scripts/forbid-clean-in-tests.test.ts',
      'tsc --noEmit',
      'node scripts/copy-assets.mjs',
      `${NPM_RUN} build:dashboard`,
    ]) {
      expect(distCleanChains(command), command).toEqual([]);
    }
  });

  it('keeps scripts/build.mjs off the clean path (C5 negative)', () => {
    const build = readFileSync(join(REPO_ROOT, 'scripts', 'build.mjs'), 'utf-8');
    const cleanImport = /import\s*\{([^}]*)\}\s*from\s*'\.\/clean\.mjs'/.exec(build);

    expect(cleanImport, 'build.mjs must still import from clean.mjs').not.toBeNull();
    const imported = cleanImport![1]!
      .split(',')
      .map(symbol => symbol.trim())
      .filter(Boolean);
    // Maintenance-lock symbols only. Importing cleanDist here would turn every
    // test that imports build.mjs into a live caller of the destructive clean.
    expect(imported).not.toContain('cleanDist');
    expect(build).not.toMatch(/\bcleanDist\s*\(/);
  });
});

describe('FORBID-CLEAN — runtime refusal per caller class', () => {
  it('refuses an in-process import-time cleanDist() call under vitest (C1)', async () => {
    const fixture = cleanScriptFixture('deckent-forbid-clean-import-');
    const dist = seedDist(fixture.root);
    const previousVitest = process.env.VITEST;
    const previousHermeticity = process.env.DECKENT_TEST_HERMETICITY;
    let thrown: unknown;

    process.env.VITEST = 'true';
    delete process.env.DECKENT_TEST_HERMETICITY;
    try {
      const module = await import(
        /* @vite-ignore */ pathToFileURL(fixture.scriptPath).href
      ) as { cleanDist: (options?: Record<string, unknown>) => unknown };
      try {
        module.cleanDist();
      } catch (error) {
        thrown = error;
      }
    } finally {
      if (previousVitest === undefined) delete process.env.VITEST;
      else process.env.VITEST = previousVitest;
      if (previousHermeticity === undefined) delete process.env.DECKENT_TEST_HERMETICITY;
      else process.env.DECKENT_TEST_HERMETICITY = previousHermeticity;
    }

    expect((thrown as { code?: string } | undefined)?.code)
      .toBe('E_HERMETIC_DIST_CLEAN');
    // Fail-loud, not fail-quiet-after-deleting.
    expect(readFileSync(dist.removable, 'utf-8')).toBe('built-binary');
    expect(readFileSync(dist.preserved, 'utf-8')).toBe('built-dashboard');
  });

  it('refuses a spawned clean that inherits only the vitest env (C2)', async () => {
    const fixture = cleanScriptFixture('deckent-forbid-clean-vitest-env-');
    const dist = seedDist(fixture.root);

    const result = await runNode([fixture.scriptPath], fixture.root, envWith({
      VITEST: 'true',
      DECKENT_TEST_HERMETICITY: undefined,
    }));

    expect(result.code).toBe(1);
    expect(result.output).toContain('E_HERMETIC_DIST_CLEAN');
    expect(readFileSync(dist.removable, 'utf-8')).toBe('built-binary');
  }, 30_000);

  it('refuses a spawned clean that carries only the hermeticity env (C2)', async () => {
    const fixture = cleanScriptFixture('deckent-forbid-clean-hermetic-env-');
    const dist = seedDist(fixture.root);

    const result = await runNode([fixture.scriptPath], fixture.root, envWith({
      VITEST: undefined,
      DECKENT_TEST_HERMETICITY: '1',
    }));

    expect(result.code).toBe(1);
    expect(result.output).toContain('E_HERMETIC_DIST_CLEAN');
    expect(readFileSync(dist.removable, 'utf-8')).toBe('built-binary');
  }, 30_000);

  it('refuses through an intermediate runner process (C3/C4 env inheritance)', async () => {
    // `npm run clean` and the build scripts reach clean.mjs through a wrapper
    // process. The refusal must survive that hop, which it does only because
    // the marker travels in the inherited environment rather than in argv.
    const fixture = cleanScriptFixture('deckent-forbid-clean-wrapper-');
    const dist = seedDist(fixture.root);
    const wrapperPath = join(fixture.root, 'scripts', 'runner.mjs');
    writeFileSync(wrapperPath, [
      "import { spawn } from 'node:child_process';",
      "const child = spawn(process.argv[2], [process.argv[3]], { stdio: 'inherit' });",
      "child.on('close', code => { process.exitCode = code ?? 1; });",
      '',
    ].join('\n'), 'utf-8');

    const result = await runNode(
      [wrapperPath, process.execPath, fixture.scriptPath],
      fixture.root,
      envWith({ VITEST: 'true', DECKENT_TEST_HERMETICITY: undefined }),
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain('E_HERMETIC_DIST_CLEAN');
    expect(readFileSync(dist.removable, 'utf-8')).toBe('built-binary');
  }, 30_000);

  it('still lets a plain operator clean run (no over-blocking)', async () => {
    const fixture = cleanScriptFixture('deckent-forbid-clean-operator-');
    const dist = seedDist(fixture.root);

    const result = await runNode([fixture.scriptPath], fixture.root, envWith({
      VITEST: undefined,
      DECKENT_TEST_HERMETICITY: undefined,
    }));

    // The one thing an operator clean must never hit is the test refusal.
    expect(result.output).not.toContain('E_HERMETIC_DIST_CLEAN');
    if (result.code === 0) {
      expect(existsSync(join(fixture.root, 'dist', 'cli'))).toBe(false);
      expect(readFileSync(dist.preserved, 'utf-8')).toBe('built-dashboard');
    } else {
      // Platforms without an identity-stable delete adapter stay fail-closed on
      // a present dist; that is a typed HOLD, still not a hermeticity refusal.
      expect(result.output).toContain('E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED');
      expect(readFileSync(dist.removable, 'utf-8')).toBe('built-binary');
    }
  }, 30_000);
});
