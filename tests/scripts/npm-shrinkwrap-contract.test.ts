import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NPM_SHRINKWRAP_MAX_BYTES,
  readCanonicalNpmShrinkwrapIdentity,
} from '../../scripts/npm-shrinkwrap-contract.mjs';

const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-shrinkwrap-contract-'));
  roots.push(root);
  const packageJson = {
    name: 'deckent',
    version: '9.8.7',
    type: 'module',
    dependencies: { alpha: '^1.0.0' },
    devDependencies: { beta: '^2.0.0' },
    optionalDependencies: { gamma: '^3.0.0' },
  };
  const shrinkwrap = {
    name: packageJson.name,
    version: packageJson.version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: packageJson.name,
        version: packageJson.version,
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies,
        optionalDependencies: packageJson.optionalDependencies,
      },
      'node_modules/alpha': { version: '1.0.0' },
      'node_modules/beta': { version: '2.0.0', dev: true },
      'node_modules/gamma': { version: '3.0.0', optional: true },
    },
  };
  const packagePath = join(root, 'package.json');
  const shrinkwrapPath = join(root, 'npm-shrinkwrap.json');
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(shrinkwrapPath, `${JSON.stringify(shrinkwrap, null, 2)}\n`);
  return { root, packageJson, packagePath, shrinkwrap, shrinkwrapPath };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical npm shrinkwrap contract', () => {
  it('returns exact byte, digest, lockfile and package-count identity', () => {
    const value = fixture();
    const bytes = readFileSync(value.shrinkwrapPath);
    expect(readCanonicalNpmShrinkwrapIdentity(value.root)).toEqual({
      schemaVersion: 1,
      name: 'deckent',
      version: '9.8.7',
      lockfileVersion: 3,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      byteLength: bytes.byteLength,
      packageCount: 4,
    });
  });

  it('rejects a second root package-lock authority', () => {
    const value = fixture();
    writeFileSync(join(value.root, 'package-lock.json'), '{}\n');
    expect(() => readCanonicalNpmShrinkwrapIdentity(value.root))
      .toThrowError(/E_NPM_SHRINKWRAP_PACKAGE_LOCK_PRESENT/u);
  });

  it('rejects every alternative root dependency-lock authority', () => {
    for (const filename of [
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
    ]) {
      const value = fixture();
      writeFileSync(join(value.root, filename), 'competing lock authority\n');
      expect(() => readCanonicalNpmShrinkwrapIdentity(value.root))
        .toThrowError(new RegExp(`E_NPM_SHRINKWRAP_COMPETING_LOCK_PRESENT:${filename}`, 'u'));
    }
  });

  it('does not treat a nested product lock as a competing root authority', () => {
    const value = fixture();
    const nested = join(value.root, 'dist', 'dashboard');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'pnpm-lock.yaml'), 'nested product lock\n');
    expect(readCanonicalNpmShrinkwrapIdentity(value.root).sha256)
      .toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('rejects missing, malformed and oversized shrinkwrap bytes', () => {
    const missing = fixture();
    rmSync(missing.shrinkwrapPath);
    expect(() => readCanonicalNpmShrinkwrapIdentity(missing.root))
      .toThrowError(/E_NPM_SHRINKWRAP_FILE_UNSAFE/u);

    const malformed = fixture();
    writeFileSync(malformed.shrinkwrapPath, '{not-json}\n');
    expect(() => readCanonicalNpmShrinkwrapIdentity(malformed.root))
      .toThrowError(/E_NPM_SHRINKWRAP_FILE_JSON_INVALID/u);

    const oversized = fixture();
    writeFileSync(oversized.shrinkwrapPath, 'x'.repeat(NPM_SHRINKWRAP_MAX_BYTES + 1));
    expect(() => readCanonicalNpmShrinkwrapIdentity(oversized.root))
      .toThrowError(/E_NPM_SHRINKWRAP_FILE_UNSAFE/u);
  });

  it('rejects symlinked and hard-linked shrinkwrap authority', () => {
    const symlinked = fixture();
    const target = join(symlinked.root, 'shrinkwrap-target.json');
    writeFileSync(target, readFileSync(symlinked.shrinkwrapPath));
    rmSync(symlinked.shrinkwrapPath);
    symlinkSync(target, symlinked.shrinkwrapPath);
    expect(() => readCanonicalNpmShrinkwrapIdentity(symlinked.root))
      .toThrowError(/E_NPM_SHRINKWRAP_FILE_UNSAFE/u);

    const hardLinked = fixture();
    linkSync(hardLinked.shrinkwrapPath, join(hardLinked.root, 'shrinkwrap-peer.json'));
    expect(() => readCanonicalNpmShrinkwrapIdentity(hardLinked.root))
      .toThrowError(/E_NPM_SHRINKWRAP_FILE_UNSAFE/u);
  });

  it('rejects non-v3, package identity and root dependency-map drift', () => {
    const nonV3 = fixture();
    writeFileSync(nonV3.shrinkwrapPath, `${JSON.stringify({
      ...nonV3.shrinkwrap,
      lockfileVersion: 2,
    }, null, 2)}\n`);
    expect(() => readCanonicalNpmShrinkwrapIdentity(nonV3.root))
      .toThrowError(/E_NPM_SHRINKWRAP_IDENTITY_MISMATCH/u);

    const identityDrift = fixture();
    writeFileSync(identityDrift.shrinkwrapPath, `${JSON.stringify({
      ...identityDrift.shrinkwrap,
      version: '9.8.8',
    }, null, 2)}\n`);
    expect(() => readCanonicalNpmShrinkwrapIdentity(identityDrift.root))
      .toThrowError(/E_NPM_SHRINKWRAP_IDENTITY_MISMATCH/u);

    const mapDrift = fixture();
    const rootEntry = mapDrift.shrinkwrap.packages[''];
    writeFileSync(mapDrift.shrinkwrapPath, `${JSON.stringify({
      ...mapDrift.shrinkwrap,
      packages: {
        ...mapDrift.shrinkwrap.packages,
        '': { ...rootEntry, dependencies: { alpha: '^9.0.0' } },
      },
    }, null, 2)}\n`);
    expect(() => readCanonicalNpmShrinkwrapIdentity(mapDrift.root))
      .toThrowError(/E_NPM_SHRINKWRAP_DEPENDENCY_MAP_MISMATCH/u);
  });

  it('rejects reformatted or top-level reordered shrinkwrap bytes', () => {
    const reformatted = fixture();
    writeFileSync(reformatted.shrinkwrapPath, JSON.stringify(reformatted.shrinkwrap));
    expect(() => readCanonicalNpmShrinkwrapIdentity(reformatted.root))
      .toThrowError(/E_NPM_SHRINKWRAP_BYTES_NONCANONICAL/u);

    const reordered = fixture();
    writeFileSync(reordered.shrinkwrapPath, `${JSON.stringify({
      version: reordered.shrinkwrap.version,
      name: reordered.shrinkwrap.name,
      lockfileVersion: 3,
      requires: true,
      packages: reordered.shrinkwrap.packages,
    }, null, 2)}\n`);
    expect(() => readCanonicalNpmShrinkwrapIdentity(reordered.root))
      .toThrowError(/E_NPM_SHRINKWRAP_IDENTITY_MISMATCH/u);
  });
});
