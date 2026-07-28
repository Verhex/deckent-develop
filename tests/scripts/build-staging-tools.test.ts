import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  copyAssets,
  ensureBinExecutable,
  writeBuildIdentity,
} from '../../scripts/copy-assets.mjs';
import {
  buildDashboard,
  resolveDashboardOutputDirectory,
  resolveDashboardToolchain,
} from '../../scripts/build-dashboard.mjs';

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-build-staging-'));
  roots.push(root);
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'deckent', version: '9.8.7' })}\n`,
    'utf8',
  );
  return root;
}

function createDashboardToolchain(root: string): void {
  const dashboard = join(root, 'src', 'dashboard');
  mkdirSync(join(dashboard, 'node_modules', 'typescript', 'bin'), {
    recursive: true,
  });
  mkdirSync(join(dashboard, 'node_modules', 'vite', 'bin'), {
    recursive: true,
  });
  writeFileSync(join(dashboard, 'tsconfig.json'), '{}\n', 'utf8');
  writeFileSync(join(dashboard, 'tsconfig.node.json'), '{}\n', 'utf8');
  writeFileSync(
    join(dashboard, 'node_modules', 'typescript', 'bin', 'tsc'),
    '#!/usr/bin/env node\n',
    'utf8',
  );
  writeFileSync(
    join(dashboard, 'node_modules', 'vite', 'bin', 'vite.js'),
    '#!/usr/bin/env node\n',
    'utf8',
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('transactional build staging tools', () => {
  it('copies assets and writes identity into an isolated output tree', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'src', 'core'), { recursive: true });
    mkdirSync(join(root, 'src', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'src', 'core', 'schema.json'), '{"ok":true}\n');
    writeFileSync(join(root, 'src', 'core', 'ignored.ts'), 'export {};\n');
    writeFileSync(
      join(root, 'src', 'dashboard', 'must-not-copy.json'),
      '{"dashboard":true}\n',
    );
    const output = join(root, '.deckent', 'build', 'staging');

    expect(copyAssets(root, output)).toBe(1);
    const identityPath = writeBuildIdentity(root, output);

    expect(readFileSync(join(output, 'core', 'schema.json'), 'utf8'))
      .toBe('{"ok":true}\n');
    expect(existsSync(join(output, 'core', 'ignored.ts'))).toBe(false);
    expect(existsSync(join(output, 'dashboard', 'must-not-copy.json')))
      .toBe(false);
    expect(identityPath).toBe(join(output, 'build-identity.json'));
  });

  it('restores executable bits relative to a non-live output tree', () => {
    const root = fixtureRoot();
    const output = join(root, '.deckent', 'build', 'staging');
    mkdirSync(join(output, 'cli'), { recursive: true });
    mkdirSync(join(output, 'mcp'), { recursive: true });
    writeFileSync(join(output, 'cli', 'entry.js'), '#!/usr/bin/env node\n', {
      mode: 0o644,
    });
    writeFileSync(join(output, 'mcp', 'server.js'), '#!/usr/bin/env node\n', {
      mode: 0o644,
    });

    expect(ensureBinExecutable(root, output)).toBe(2);
  });

  it('runs exact local dashboard tools into the requested staging tree', async () => {
    const root = fixtureRoot();
    createDashboardToolchain(root);
    const output = join(root, '.deckent', 'build', 'staging', 'dashboard');
    const calls: Array<{
      entrypoint: string;
      args: readonly string[];
      cwd: string;
    }> = [];

    const result = await buildDashboard({
      root,
      outputDirectory: output,
      run: async (
        entrypoint: string,
        args: readonly string[],
        cwd: string,
      ) => {
        calls.push({ entrypoint, args, cwd });
      },
    });

    expect(result.outputDirectory).toBe(output);
    expect(calls).toHaveLength(3);
    expect(calls[0]?.entrypoint).toBe(
      join(root, 'src', 'dashboard', 'node_modules', 'typescript', 'bin', 'tsc'),
    );
    expect(calls[1]?.entrypoint).toBe(calls[0]?.entrypoint);
    expect(calls[2]?.entrypoint).toBe(
      join(root, 'src', 'dashboard', 'node_modules', 'vite', 'bin', 'vite.js'),
    );
    expect(calls[2]?.args).toEqual([
      'build',
      '--outDir',
      output,
    ]);
  });

  it('fails closed when the local toolchain is unavailable', () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'src', 'dashboard'), { recursive: true });

    expect(() => resolveDashboardToolchain(root))
      .toThrow(/E_DASHBOARD_BUILD_TOOLCHAIN_MISSING/u);
  });

  it('fails closed before Vite when the bound output directory is replaced', async () => {
    const root = fixtureRoot();
    createDashboardToolchain(root);
    const output = join(root, '.deckent', 'build', 'staging', 'dashboard');
    const replaced = `${output}-replaced`;
    const calls: string[] = [];

    await expect(buildDashboard({
      root,
      outputDirectory: output,
      run: async (entrypoint: string) => {
        calls.push(entrypoint);
        if (calls.length === 1) {
          renameSync(output, replaced);
          mkdirSync(output);
        }
      },
    })).rejects.toMatchObject({
      code: 'E_DASHBOARD_BUILD_OUTPUT_IDENTITY_CHANGED',
    });
    expect(calls).toHaveLength(1);
  });

  it('fails closed when a bound dashboard tool changes during validation', async () => {
    const root = fixtureRoot();
    createDashboardToolchain(root);
    const output = join(root, '.deckent', 'build', 'staging', 'dashboard');
    const vite = join(
      root,
      'src',
      'dashboard',
      'node_modules',
      'vite',
      'bin',
      'vite.js',
    );
    const calls: string[] = [];

    await expect(buildDashboard({
      root,
      outputDirectory: output,
      run: async (entrypoint: string) => {
        calls.push(entrypoint);
        if (calls.length === 1) {
          writeFileSync(vite, '#!/usr/bin/env node\n// changed\n');
        }
      },
    })).rejects.toMatchObject({
      code: 'E_DASHBOARD_BUILD_TOOLCHAIN_IDENTITY_CHANGED',
    });
    expect(calls).toHaveLength(1);
  });

  it('refuses a non-empty output instead of delegating destructive cleanup to Vite', async () => {
    const root = fixtureRoot();
    createDashboardToolchain(root);
    const output = join(root, '.deckent', 'build', 'staging', 'dashboard');
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'retained.txt'), 'retain\n');

    await expect(buildDashboard({
      root,
      outputDirectory: output,
      run: async () => {},
    })).rejects.toMatchObject({
      code: 'E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY',
    });
    expect(readFileSync(join(output, 'retained.txt'), 'utf8')).toBe('retain\n');
  });

  it('does not silently treat an unreadable or missing source tree as no assets', () => {
    const root = fixtureRoot();
    const output = join(root, '.deckent', 'build', 'staging');

    expect(() => copyAssets(root, output)).toThrow();
  });

  it('rejects an output path outside the canonical project root', () => {
    const root = fixtureRoot();
    const outside = join(tmpdir(), `deckent-outside-${Date.now()}`);

    expect(() => resolveDashboardOutputDirectory(root, outside))
      .toThrow(/E_DASHBOARD_BUILD_OUTPUT_OUTSIDE_PROJECT/u);
  });

  it('contains no dependency installation or shell-mediated execution path', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts', 'build-dashboard.mjs'),
      'utf8',
    );

    expect(source).not.toMatch(/\bnpm\s+install\b/u);
    expect(source).not.toMatch(/\bnpx\b/u);
    expect(source).not.toMatch(/\bspawnSync\b/u);
    expect(source).toContain('shell: false');
  });
});
