import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILD_IDENTITY_SCHEMA_VERSION,
  buildSourceRootSha256,
  buildSourceTreeIdentity,
  evaluateWorktreeBinaryAuthority,
  parseBuildIdentity,
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

  it('holds a same-root dist runtime when a build input changes after the manifest was minted', () => {
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
    })).toMatchObject({ status: 'hold', issue: 'build-source-mismatch' });
  });

  it('never lets the cross-checkout diagnostic override bypass same-root source drift', () => {
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
    })).toMatchObject({ status: 'hold', issue: 'build-source-mismatch' });
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

  it.each([
    ['missing', undefined, 'build-identity-missing'],
    ['stale root digest', { ...foreignIdentity() }, 'build-root-mismatch'],
  ] as const)('holds a same-root dist runtime with %s identity', (_label, buildIdentity, issue) => {
    const root = makeRoot('deckent-same-root');
    makeDeckentCheckout(root);

    expect(evaluateWorktreeBinaryAuthority({
      projectRoot: root,
      runtimePackageRoot: root,
      runtimeKind: 'dist',
      buildIdentity,
      override: false,
    })).toMatchObject({ status: 'hold', issue });
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
