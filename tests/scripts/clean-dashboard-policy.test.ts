// Row 3325: `npm run clean` preserved dist/dashboard by policy while
// `build:dashboard` demanded an empty output directory and died with
// E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY — two scripts, two contradictory private
// policies, and a manual `rm -rf dist/dashboard` as the only way through.
//
// These tests pin the reconciliation: ONE typed decision
// (DASHBOARD_OUTPUT_POLICY, defined in scripts/clean.mjs and read by
// scripts/build-dashboard.mjs) decides both halves, so a clean followed by a
// dashboard build succeeds. The reclaim authority stays bound to the artifact
// the policy names — a caller-staged output directory is still refused rather
// than handed to vite for destructive cleanup.
//
// Hermetic: every filesystem effect happens inside a mkdtemp fixture with an
// injected tool runner. The real dist/ tree is never read for state and never
// mutated, and no process is spawned.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { DASHBOARD_OUTPUT_POLICY } from '../../scripts/clean.mjs';
import {
  buildDashboard,
  resolveDashboardOutputDirectory,
} from '../../scripts/build-dashboard.mjs';

const SCRIPTS_DIRECTORY = fileURLToPath(
  new URL('../../scripts/', import.meta.url),
);
const CLEAN_SOURCE = readFileSync(
  join(SCRIPTS_DIRECTORY, 'clean.mjs'),
  'utf-8',
);
const BUILD_SOURCE = readFileSync(
  join(SCRIPTS_DIRECTORY, 'build-dashboard.mjs'),
  'utf-8',
);

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

interface ToolInvocation {
  entrypoint: string;
  args: string[];
  cwd: string;
}

interface Fixture {
  root: string;
  outputDirectory: string;
  invocations: ToolInvocation[];
  run: (entrypoint: string, args: string[], cwd: string) => Promise<void>;
}

/**
 * A repository-shaped fixture: a dashboard source tree with the toolchain
 * entrypoints build-dashboard.mjs binds, plus the policy-owned output directory
 * in the state `scripts/clean.mjs` leaves behind.
 */
function fixture(options: { preservedBundle: boolean }): Fixture {
  const root = realpathSync.native(
    mkdtempSync(join(realpathSync.native(tmpdir()), 'deckent-dash-policy-')),
  );
  temporaryRoots.push(root);

  const sourceDirectory = join(root, 'src', 'dashboard');
  const toolchain = join(sourceDirectory, 'node_modules');
  mkdirSync(join(toolchain, 'typescript', 'bin'), { recursive: true });
  mkdirSync(join(toolchain, 'vite', 'bin'), { recursive: true });
  writeFileSync(join(toolchain, 'typescript', 'bin', 'tsc'), '// stub\n');
  writeFileSync(join(toolchain, 'vite', 'bin', 'vite.js'), '// stub\n');
  writeFileSync(join(sourceDirectory, 'tsconfig.json'), '{}\n');
  writeFileSync(join(sourceDirectory, 'tsconfig.node.json'), '{}\n');

  const outputDirectory = join(root, DASHBOARD_OUTPUT_POLICY.outputRelativePath);
  if (options.preservedBundle) {
    // Exactly what `npm run clean` leaves in place: the previous bundle.
    mkdirSync(join(outputDirectory, 'assets'), { recursive: true });
    writeFileSync(join(outputDirectory, 'index.html'), '<!-- stale -->\n');
    writeFileSync(join(outputDirectory, 'assets', 'index-stale.js'), '0;\n');
  }

  const invocations: ToolInvocation[] = [];
  return {
    root,
    outputDirectory,
    invocations,
    run: async (entrypoint, args, cwd) => {
      invocations.push({ entrypoint, args, cwd });
    },
  };
}

function viteInvocation(invocations: ToolInvocation[]): ToolInvocation {
  const call = invocations.find(invocation => invocation.args[0] === 'build');
  expect(call).toBeDefined();
  return call as ToolInvocation;
}

describe('dist/dashboard policy: one typed decision for clean + build', () => {
  it('exposes a single frozen typed decision', () => {
    expect(Object.isFrozen(DASHBOARD_OUTPUT_POLICY)).toBe(true);
    expect(DASHBOARD_OUTPUT_POLICY.schemaVersion).toBe(1);
    expect(DASHBOARD_OUTPUT_POLICY.mode).toBe('preserve-then-overwrite');
    expect(Object.isFrozen(DASHBOARD_OUTPUT_POLICY.preservedDistEntries))
      .toBe(true);
  });

  it('preserves exactly the dist entry the build writes', () => {
    // The reconciliation invariant: what clean keeps and what the build
    // produces are the same name, derived from one field.
    expect([...DASHBOARD_OUTPUT_POLICY.preservedDistEntries]).toContain(
      basename(DASHBOARD_OUTPUT_POLICY.outputRelativePath),
    );

    const { root } = fixture({ preservedBundle: false });
    expect(resolveDashboardOutputDirectory(root)).toBe(
      join(root, DASHBOARD_OUTPUT_POLICY.outputRelativePath),
    );
  });

  it('keeps clean.mjs standalone: it defines the decision, imports nothing',
    () => {
      // dist-clean-guard runs clean.mjs as a single copied file, so the
      // decision must live here rather than behind a sibling import.
      expect(CLEAN_SOURCE).toContain('export const DASHBOARD_OUTPUT_POLICY');
      expect(CLEAN_SOURCE).toContain(
        'new Set(DASHBOARD_OUTPUT_POLICY.preservedDistEntries)',
      );
      // No second, drifting definition of the preserved entry name.
      expect(CLEAN_SOURCE).not.toMatch(/new Set\(\s*\[\s*'dashboard'/);
      expect(CLEAN_SOURCE).not.toMatch(/^import .* from '\.\//mu);
    });

  it('has build-dashboard.mjs read that decision instead of a private copy',
    () => {
      expect(BUILD_SOURCE).toContain(
        "import { DASHBOARD_OUTPUT_POLICY } from './clean.mjs';",
      );
      expect(BUILD_SOURCE).toContain(
        'const DEFAULT_OUTPUT_RELATIVE_PATH = DASHBOARD_OUTPUT_POLICY.outputRelativePath;',
      );
      expect(BUILD_SOURCE).not.toContain("join('dist', 'dashboard')");
    });
});

describe('a clean followed by the dashboard build succeeds', () => {
  it('builds over a preserved bundle without E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY',
    async () => {
      const { root, outputDirectory, invocations, run } = fixture({
        preservedBundle: true,
      });
      expect(readdirSync(outputDirectory).length).toBeGreaterThan(0);

      const result = await buildDashboard({ root, run });

      expect(result.outputDirectory).toBe(outputDirectory);
      expect(viteInvocation(invocations).args).toContain('--emptyOutDir');
    });

  it('builds over an empty output directory too', async () => {
    const { root, outputDirectory, invocations, run } = fixture({
      preservedBundle: false,
    });

    const result = await buildDashboard({ root, run });

    expect(result.outputDirectory).toBe(outputDirectory);
    expect(readdirSync(outputDirectory)).toEqual([]);
    expect(viteInvocation(invocations).args).toContain('--emptyOutDir');
  });

  it('leaves the overwrite to vite instead of deleting the bundle itself',
    async () => {
      const { root, outputDirectory, run } = fixture({ preservedBundle: true });

      await buildDashboard({ root, run });

      // The runner is stubbed, so vite never ran: anything still present proves
      // the build script performed no deletion of its own.
      expect(readdirSync(outputDirectory).sort()).toEqual([
        'assets',
        'index.html',
      ]);
    });
});

describe('reclaim authority stops at the artifact the policy names', () => {
  it('still refuses a non-empty output directory the policy does not cover',
    async () => {
      const { root, invocations, run } = fixture({ preservedBundle: false });
      const staged = join(root, '.deckent', 'build', 'staging', 'dashboard');
      mkdirSync(staged, { recursive: true });
      writeFileSync(join(staged, 'retained.txt'), 'retain\n');

      await expect(buildDashboard({
        root,
        outputDirectory: staged,
        run,
      })).rejects.toMatchObject({
        code: 'E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY',
      });

      expect(readFileSync(join(staged, 'retained.txt'), 'utf-8'))
        .toBe('retain\n');
      expect(invocations).toEqual([]);
    });

  it('never hands --emptyOutDir to vite for a directory it does not own',
    async () => {
      const { root, invocations, run } = fixture({ preservedBundle: false });
      const staged = join(root, '.deckent', 'build', 'staging', 'dashboard');

      await buildDashboard({ root, outputDirectory: staged, run });

      expect(viteInvocation(invocations).args).not.toContain('--emptyOutDir');
    });
});
