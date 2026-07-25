import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILD_IDENTITY_RELATIVE_PATH,
  writeBuildIdentity,
} from '../../scripts/copy-assets.mjs';
import { parseBuildIdentity } from '../../src/cli/worktree-binary-authority.js';

const roots: string[] = [];

function fixtureRoot(version = '9.8.7'): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-build-identity-'));
  roots.push(root);
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'deckent', version })}\n`,
    'utf-8',
  );
  return root;
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

    expect(written).toBe(join(root, BUILD_IDENTITY_RELATIVE_PATH));
    expect(parsed).toEqual({
      schemaVersion: 1,
      packageName: 'deckent',
      packageVersion: '9.8.7',
      sourceRootSha256: expectedDigest,
    });
    expect(raw).not.toContain(root);

    const first = raw;
    writeBuildIdentity(root);
    expect(readFileSync(written, 'utf-8')).toBe(first);
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
