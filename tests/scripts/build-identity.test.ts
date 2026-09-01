import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  BUILD_IDENTITY_RELATIVE_PATH,
  buildSourceTreeIdentity,
  writeBuildIdentity,
} from '../../scripts/copy-assets.mjs';
import { nativeSourceTreeIdentity } from '../../scripts/build-exec-authority-native.mjs';
import {
  buildNativeSourceTreeIdentity,
  buildSourceTreeIdentity as buildRuntimeSourceTreeIdentity,
  parseBuildIdentity,
  readRuntimeBuildIdentity,
} from '../../src/cli/worktree-binary-authority.js';

const roots: string[] = [];

function fixtureRoot(version = '9.8.7'): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-build-identity-'));
  roots.push(root);
  mkdirSync(join(root, 'dist'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'native', 'exec-authority', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'deckent', version })}\n`,
    'utf-8',
  );
  writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify({ include: ['src/**/*.ts'] })}\n`);
  writeFileSync(join(root, 'src', 'entry.ts'), 'export const value = 1;\n');
  writeFileSync(join(root, 'native', 'exec-authority', 'binding.gyp'), '{}\n');
  writeFileSync(join(root, 'native', 'exec-authority', 'index.mjs'), 'export {};\n');
  writeFileSync(
    join(root, 'native', 'exec-authority', 'package.json'),
    `${JSON.stringify({ name: '@deckent/exec-authority-native', version: '0.1.0' })}\n`,
  );
  for (const source of [
    'custody_common.h',
    'custody_posix.c',
    'custody_win32.c',
    'exec_authority.c',
  ]) {
    writeFileSync(
      join(root, 'native', 'exec-authority', 'src', source),
      `/* exact fixture: ${source} */\n`,
    );
  }
  return root;
}

function writeRuntimeEntrypoint(root: string): string {
  const entrypoint = join(root, 'dist', 'cli', 'entry.js');
  mkdirSync(join(root, 'dist', 'cli'), { recursive: true });
  writeFileSync(entrypoint, 'export {};\n');
  return entrypoint;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('copy-assets build identity', () => {
  it('writes a deterministic, runtime-parseable manifest without the source path', () => {
    const root = fixtureRoot();
    const written = writeBuildIdentity(root);
    const raw = readFileSync(written, 'utf-8');
    const parsed = parseBuildIdentity(raw);
    const expectedDigest = createHash('sha256')
      .update(realpathSync.native(root))
      .digest('hex');
    const sourceTree = buildSourceTreeIdentity(root);
    const nativeSourceTree = nativeSourceTreeIdentity(root);
    const entrypoint = writeRuntimeEntrypoint(root);
    expect(buildRuntimeSourceTreeIdentity(root)).toEqual(sourceTree);
    expect(buildNativeSourceTreeIdentity(root)).toEqual({
      nativeSourceTreeSha256: nativeSourceTree.sha256,
      nativeSourceTreeFileCount: nativeSourceTree.fileCount,
    });
    expect(nativeSourceTree.paths).toEqual([
      'native/exec-authority/binding.gyp',
      'native/exec-authority/index.mjs',
      'native/exec-authority/package.json',
      'native/exec-authority/src/custody_common.h',
      'native/exec-authority/src/custody_posix.c',
      'native/exec-authority/src/custody_win32.c',
      'native/exec-authority/src/exec_authority.c',
    ]);

    expect(written).toBe(join(root, BUILD_IDENTITY_RELATIVE_PATH));
    expect(parsed).toEqual({
      schemaVersion: 3,
      packageName: 'deckent',
      packageVersion: '9.8.7',
      sourceRootSha256: expectedDigest,
      sourceTreeSha256: sourceTree.sourceTreeSha256,
      sourceTreeFileCount: sourceTree.sourceTreeFileCount,
      nativeSourceTreeSha256: nativeSourceTree.sha256,
      nativeSourceTreeFileCount: nativeSourceTree.fileCount,
    });
    expect(raw).not.toContain(root);
    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toMatchObject({
      status: 'adopt',
      binding: {
        buildIdentitySha256: createHash('sha256').update(raw).digest('hex'),
        entrypointSha256: createHash('sha256').update('export {};\n').digest('hex'),
      },
    });

    const first = raw;
    writeBuildIdentity(root);
    expect(readFileSync(written, 'utf-8')).toBe(first);
  });

  it('rejects missing, partial and artifact-drifted schema-v3 identity data', () => {
    const root = fixtureRoot();
    const written = writeBuildIdentity(root);
    const valid = JSON.parse(readFileSync(written, 'utf-8')) as Record<string, unknown>;

    expect(parseBuildIdentity(JSON.stringify({ ...valid, schemaVersion: 2 }))).toBeUndefined();
    const partial = { ...valid };
    delete partial.nativeSourceTreeFileCount;
    expect(parseBuildIdentity(JSON.stringify(partial))).toBeUndefined();
    const artifactDrift = {
      ...valid,
      nativeSourceTreeSha256: `sha256:${'0'.repeat(64)}`,
    };
    expect(parseBuildIdentity(JSON.stringify(artifactDrift))).toEqual(expect.objectContaining({
      nativeSourceTreeSha256: `sha256:${'0'.repeat(64)}`,
    }));

    const entrypoint = writeRuntimeEntrypoint(root);
    writeFileSync(written, `${JSON.stringify(artifactDrift)}\n`);
    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toEqual({ status: 'hold', issue: 'build-source-mismatch' });

    writeFileSync(written, `${JSON.stringify({
      ...valid,
      nativeSourceTreeSha256: 'not-a-digest',
    })}\n`);
    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toEqual({ status: 'hold', issue: 'build-identity-invalid' });

    rmSync(written);
    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toEqual({ status: 'hold', issue: 'build-identity-missing' });
  });

  it('fails closed when exact native source bytes drift after the manifest is written', () => {
    const root = fixtureRoot();
    writeBuildIdentity(root);
    const entrypoint = writeRuntimeEntrypoint(root);
    writeFileSync(
      join(root, 'native', 'exec-authority', 'src', 'custody_posix.c'),
      '/* drifted after build */\n',
    );

    expect(readRuntimeBuildIdentity({
      projectRoot: root,
      runtimeModuleUrl: pathToFileURL(entrypoint).href,
    })).toEqual({ status: 'hold', issue: 'build-source-mismatch' });
  });

  it('rejects a non-Deckent package instead of minting a misleading identity', () => {
    const root = fixtureRoot();
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({ name: 'other-package', version: '1.0.0' })}\n`,
      'utf-8',
    );

    expect(() => writeBuildIdentity(root)).toThrow(/package name/i);
  });
});
