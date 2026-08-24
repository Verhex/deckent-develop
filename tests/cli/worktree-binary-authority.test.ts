import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  BUILD_IDENTITY_SCHEMA_VERSION,
  buildSourceRootSha256,
  buildSourceTreeIdentity,
  evaluateWorktreeBinaryAuthority,
  parseBuildIdentity,
  readRuntimeBuildIdentity,
  resolveWorktreeBinaryAuthority,
  shouldCheckWorktreeBinaryAuthority,
  type DeckentBuildIdentity,
} from '../../src/cli/worktree-binary-authority.js';

const roots: string[] = [];

function makeRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

function makeDeckentCheckout(root: string): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'deckent', version: '1.2.3' })}\n`,
    'utf-8',
  );
  writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify({ include: ['src/**/*.ts'] })}\n`);
  writeFileSync(join(root, 'src', 'entry.ts'), 'export const value = 1;\n');
}

function identityFor(root: string): DeckentBuildIdentity {
  makeDeckentCheckout(root);
  const sourceTree = buildSourceTreeIdentity(root);
  return {
    schemaVersion: BUILD_IDENTITY_SCHEMA_VERSION,
    packageName: 'deckent',
    packageVersion: '1.2.3',
    sourceRootSha256: buildSourceRootSha256(root),
    sourceTreeSha256: sourceTree.sourceTreeSha256,
    sourceTreeFileCount: sourceTree.sourceTreeFileCount,
  };
}

function foreignIdentity(): DeckentBuildIdentity {
  const root = makeRoot('deckent-stale-build');
  makeDeckentCheckout(root);
  return identityFor(root);
}

function writeDist(root: string, identity: DeckentBuildIdentity): string {
  const entrypoint = join(root, 'dist', 'cli', 'entry.js');
  mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
  writeFileSync(entrypoint, '#!/usr/bin/env node\nconsole.log("fixture");\n');
  writeFileSync(join(root, 'dist', 'build-identity.json'), `${JSON.stringify(identity)}\n`);
  return entrypoint;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('worktree binary authority', () => {
  it('does not impose dogfood identity checks on an ordinary user project', () => {
    const projectRoot = makeRoot('deckent-user-project');
    const runtimeRoot = makeRoot('deckent-global-install');
    mkdirSync(join(projectRoot, '.deckent'));
    writeFileSync(
      join(projectRoot, 'package.json'),
      `${JSON.stringify({ name: 'customer-app' })}\n`,
      'utf-8',
    );

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot,
      runtimePackageRoot: runtimeRoot,
      runtimeKind: 'dist',
      buildIdentity: undefined,
      override: false,
    })).toEqual({ status: 'allow', reason: 'user-project' });
  });

  // PROD-BINARY-IDENTITY-EAGER-CRASH-001 regression: the resolver used to precompute
  // buildSourceTreeIdentity(projectRoot) BEFORE evaluate's user-project gate, so any
  // src-less user project crashed every non-diagnostic command with a raw
  // E_BUILD_SOURCE_TREE_MISSING instead of the honest 'user-project' allow.
  it('resolves a src-less user project to allow instead of crashing on eager identity', () => {
    const projectRoot = makeRoot('deckent-srcless-user-project');
    writeFileSync(
      join(projectRoot, 'package.json'),
      `${JSON.stringify({ name: 'customer-app' })}\n`,
      'utf-8',
    );
    // Runtime is a real dist-shaped install WITH a valid build identity — the exact
    // precondition that armed the eager crash path.
    const runtimeRoot = makeRoot('deckent-dist-install');
    const identity = identityFor(runtimeRoot);
    mkdirSync(join(runtimeRoot, 'dist', 'cli'), { recursive: true });
    writeFileSync(join(runtimeRoot, 'dist', 'cli', 'entry.js'), '// built\n', 'utf-8');
    writeFileSync(
      join(runtimeRoot, 'dist', 'build-identity.json'),
      `${JSON.stringify(identity)}\n`,
      'utf-8',
    );

    expect(resolveWorktreeBinaryAuthority({
      argv: ['node', 'entry.js', 'status'],
      runtimeModuleUrl: pathToFileURL(join(runtimeRoot, 'dist', 'cli', 'entry.js')).href,
      projectRoot,
    })).toEqual({ status: 'allow', reason: 'user-project' });
  });

  it('allows a compiled binary bound to the exact Deckent checkout root', () => {
    const root = makeRoot('deckent-exact-worktree');
    makeDeckentCheckout(root);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: root,
      runtimePackageRoot: root,
      runtimeKind: 'dist',
      buildIdentity: identityFor(root),
      override: false,
    })).toEqual({ status: 'allow', reason: 'matching-build-identity' });
  });

  // Same-checkout drift is ADVISORY (owner decision 2026-08-09). Deckent is a
  // self-modifying runtime: a worker writing to `src/` during a run makes
  // `dist/` stale by construction, and holding here locked the operator out of
  // `status`/`watch`/`recover`/`finalize` — the exact commands needed to observe
  // or rescue that run. Measured three times on 2026-08-09; each occurrence
  // produced a closed loop escapable only by a clean-less `tsc`. The drift is
  // still surfaced, just not fatal. Cross-checkout stays fail-closed below.
  it('warns instead of holding when a same-root build input changes after the manifest was minted', () => {
    const root = makeRoot('deckent-source-drift');
    makeDeckentCheckout(root);
    const buildIdentity = identityFor(root);
    writeFileSync(join(root, 'src', 'entry.ts'), 'export const value = 2;\n');

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: root,
      runtimePackageRoot: root,
      runtimeKind: 'dist',
      buildIdentity,
      override: false,
    })).toMatchObject({ status: 'warn', issue: 'build-source-mismatch' });
  });

  it('reports same-root source drift as warn with or without the diagnostic override', () => {
    const root = makeRoot('deckent-source-drift-override');
    makeDeckentCheckout(root);
    const buildIdentity = identityFor(root);
    writeFileSync(join(root, 'src', 'entry.ts'), 'export const value = 3;\n');

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: root,
      runtimePackageRoot: root,
      runtimeKind: 'dist',
      buildIdentity,
      override: true,
    })).toMatchObject({ status: 'warn', issue: 'build-source-mismatch' });
  });

  it('holds when a Deckent checkout is driven by another worktree runtime', () => {
    const projectRoot = makeRoot('deckent-worktree-a');
    const runtimeRoot = makeRoot('deckent-worktree-b');
    makeDeckentCheckout(projectRoot);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot,
      runtimePackageRoot: runtimeRoot,
      runtimeKind: 'dist',
      buildIdentity: identityFor(runtimeRoot),
      override: false,
    })).toMatchObject({ status: 'hold', issue: 'runtime-root-mismatch' });
  });

  // A missing/invalid manifest is the same self-modification class: it is what
  // an interrupted build leaves behind, which is precisely when the recovery
  // commands must stay reachable. A foreign root digest is NOT — that binary
  // provably belongs to another checkout, so it stays fail-closed.
  it.each([
    ['missing', undefined, 'build-identity-missing', 'warn'],
    ['stale root digest', { ...foreignIdentity() }, 'build-root-mismatch', 'hold'],
  ] as const)('classifies a same-root dist runtime with %s identity as %s', (
    _label,
    buildIdentity,
    issue,
    status,
  ) => {
    const root = makeRoot('deckent-same-root');
    makeDeckentCheckout(root);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: root,
      runtimePackageRoot: root,
      runtimeKind: 'dist',
      buildIdentity,
      override: false,
    })).toMatchObject({ status, issue });
  });

  it('allows direct same-root source execution without manufacturing a dist identity', () => {
    const root = makeRoot('deckent-source-entry');
    makeDeckentCheckout(root);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: root,
      runtimePackageRoot: root,
      runtimeKind: 'source',
      buildIdentity: undefined,
      override: false,
    })).toEqual({ status: 'allow', reason: 'same-root-source-entry' });
  });

  it('turns a mismatch into a visible override decision only with the exact env opt-in', () => {
    const projectRoot = makeRoot('deckent-override-project');
    const runtimeRoot = makeRoot('deckent-override-runtime');
    makeDeckentCheckout(projectRoot);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot,
      runtimePackageRoot: runtimeRoot,
      runtimeKind: 'dist',
      buildIdentity: identityFor(runtimeRoot),
      override: true,
    })).toMatchObject({ status: 'override', issue: 'runtime-root-mismatch' });
  });

  it('compares Windows roots case-insensitively while preserving POSIX case', () => {
    const root = makeRoot('deckent-platform-identity');
    makeDeckentCheckout(root);
    const buildIdentity = identityFor(root);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: 'C:\\Repo\\Deckent',
      runtimePackageRoot: 'c:\\repo\\deckent',
      runtimeKind: 'dist',
      buildIdentity,
      override: false,
      platform: 'win32',
      isDeckentCheckout: true,
      projectRootSha256: buildIdentity.sourceRootSha256,
      projectSourceTreeIdentity: {
        sourceTreeSha256: buildIdentity.sourceTreeSha256,
        sourceTreeFileCount: buildIdentity.sourceTreeFileCount,
      },
    })).toEqual({ status: 'allow', reason: 'matching-build-identity' });
    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: '/Repo/Deckent',
      runtimePackageRoot: '/repo/deckent',
      runtimeKind: 'dist',
      buildIdentity,
      override: false,
      platform: 'linux',
      isDeckentCheckout: true,
      projectRootSha256: buildIdentity.sourceRootSha256,
      projectSourceTreeIdentity: {
        sourceTreeSha256: buildIdentity.sourceTreeSha256,
        sourceTreeFileCount: buildIdentity.sourceTreeFileCount,
      },
    })).toMatchObject({ status: 'hold', issue: 'runtime-root-mismatch' });
  });

  it('strictly parses the four-field manifest and rejects corruption/unknown fields', () => {
    const valid = identityFor(makeRoot('deckent-parse-identity'));
    expect(parseBuildIdentity(JSON.stringify(valid))).toEqual(valid);
    expect(parseBuildIdentity('{')).toBeUndefined();
    expect(parseBuildIdentity(JSON.stringify({ ...valid, sourceRootSha256: 'nope' }))).toBeUndefined();
    expect(parseBuildIdentity(JSON.stringify({ ...valid, extra: true }))).toBeUndefined();
  });
});

describe('worktree authority invocation classification', () => {
  it.each([
    ['--help'],
    ['-h'],
    ['help'],
    ['help', 'start'],
    ['--version'],
    ['-V'],
    ['--version-json'],
  ])('keeps diagnostic invocation %j reachable', (...args) => {
    expect(shouldCheckWorktreeBinaryAuthority(['node', 'deckent', ...args])).toBe(false);
  });

  it.each([
    [],
    ['xverify'],
    ['status'],
    ['start', '--backend', 'docker'],
    ['start', '--backend', 'subprocess'],
    ['unknown-command'],
  ])('checks operational invocation %j', (...args) => {
    expect(shouldCheckWorktreeBinaryAuthority(['node', 'deckent', ...args])).toBe(true);
  });
});

describe('fresh runtime build-identity read model', () => {
  it('returns a normalized binding to the exact manifest, source tree, and entrypoint bytes', () => {
    const root = makeRoot('deckent-runtime-binding');
    const identity = identityFor(root);
    const entrypoint = writeDist(root, identity);
    const result = readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    });

    expect(result).toEqual({
      status: 'adopt',
      binding: {
        runtimePackageRoot: root,
        entrypointPath: entrypoint,
        buildIdentityPath: join(root, 'dist', 'build-identity.json'),
        buildIdentity: identity,
        currentSourceTreeIdentity: {
          sourceTreeSha256: identity.sourceTreeSha256,
          sourceTreeFileCount: identity.sourceTreeFileCount,
        },
        buildIdentitySha256: createHash('sha256')
          .update(`${JSON.stringify(identity)}\n`)
          .digest('hex'),
        entrypointSha256: createHash('sha256')
          .update('#!/usr/bin/env node\nconsole.log("fixture");\n')
          .digest('hex'),
      },
    });
    expect(result.status === 'adopt' && Object.isFrozen(result.binding)).toBe(true);
  });

  it('never manufactures a dist identity for direct source execution', () => {
    const root = makeRoot('deckent-source-binding');
    identityFor(root);

    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(join(root, 'src', 'entry.ts')).href,
    })).toEqual({ status: 'hold', issue: 'runtime-not-checkout-dist' });
  });

  it('holds when the executing module is another checkout or current sources drift', () => {
    const root = makeRoot('deckent-binding-root');
    const identity = identityFor(root);
    const entrypoint = writeDist(root, identity);
    const other = makeRoot('deckent-binding-other');
    const otherEntrypoint = writeDist(other, identityFor(other));

    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(otherEntrypoint).href,
    })).toEqual({ status: 'hold', issue: 'runtime-not-checkout-dist' });

    writeFileSync(join(root, 'src', 'entry.ts'), 'export const value = 99;\n');
    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toEqual({ status: 'hold', issue: 'build-source-mismatch' });
  });

  it.skipIf(process.platform === 'win32')('rejects a symlinked build identity instead of hashing its target', () => {
    const root = makeRoot('deckent-symlinked-manifest');
    const identity = identityFor(root);
    const entrypoint = writeDist(root, identity);
    const manifest = join(root, 'dist', 'build-identity.json');
    const target = join(root, 'identity-target.json');
    rmSync(manifest);
    writeFileSync(target, `${JSON.stringify(identity)}\n`);
    symlinkSync(target, manifest);

    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toEqual({ status: 'hold', issue: 'build-identity-unsafe' });
  });
});
