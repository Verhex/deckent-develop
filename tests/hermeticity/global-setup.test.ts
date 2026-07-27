import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  activateHermeticityEnvironment,
  assertSnapshotHasNoSymlinks,
  beginDistIntegritySession,
  firstSnapshotDifference,
  snapshotTree,
} from './global-setup.js';

const temporaryRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-dist-integrity-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('dist integrity snapshot', () => {
  it('is deterministic when path, bytes and metadata are unchanged', async () => {
    const root = fixtureRoot();
    mkdirSync(join(root, 'cli'), { recursive: true });
    writeFileSync(join(root, 'cli', 'entry.js'), '#!/usr/bin/env node\n');

    const before = await snapshotTree(root);
    const after = await snapshotTree(root);
    expect(firstSnapshotDifference(before, after)).toBeUndefined();
  });

  it('detects create, delete, content and mode changes', async () => {
    const root = fixtureRoot();
    const target = join(root, 'index.js');
    writeFileSync(target, 'before');
    const baseline = await snapshotTree(root);

    writeFileSync(target, 'after');
    expect(firstSnapshotDifference(baseline, await snapshotTree(root))).toBe('changed:index.js');

    writeFileSync(target, 'before');
    chmodSync(target, 0o700);
    expect(firstSnapshotDifference(baseline, await snapshotTree(root))).toBe('changed:index.js');

    writeFileSync(join(root, 'new.js'), 'new');
    expect(firstSnapshotDifference(baseline, await snapshotTree(root))).toBeDefined();

    rmSync(root, { recursive: true, force: true });
    expect(firstSnapshotDifference(baseline, await snapshotTree(root))).toBe('removed:.');
  });

  it('distinguishes an absent tree from an empty tree', async () => {
    const root = join(fixtureRoot(), 'dist');
    const absent = await snapshotTree(root);
    mkdirSync(root);
    const present = await snapshotTree(root);
    expect(firstSnapshotDifference(absent, present)).toBe('created:.');
  });

  it.skipIf(process.platform === 'win32')('rejects a symlink anywhere in the dist snapshot', async () => {
    const root = fixtureRoot();
    const external = fixtureRoot();
    symlinkSync(external, join(root, 'external-link'));
    const snapshot = await snapshotTree(root);

    expect(() => assertSnapshotHasNoSymlinks(snapshot))
      .toThrow(/E_HERMETIC_DIST_SYMLINK:external-link/);
  });
});

describe('global setup environment ownership', () => {
  it('restores an existing caller value exactly', () => {
    const original = process.env.DECKENT_TEST_HERMETICITY;
    process.env.DECKENT_TEST_HERMETICITY = 'caller-owned';
    try {
      const restore = activateHermeticityEnvironment();
      expect(process.env.DECKENT_TEST_HERMETICITY).toBe('1');
      restore();
      expect(process.env.DECKENT_TEST_HERMETICITY).toBe('caller-owned');
    } finally {
      if (original === undefined) delete process.env.DECKENT_TEST_HERMETICITY;
      else process.env.DECKENT_TEST_HERMETICITY = original;
    }
  });

  it('deletes the marker when it did not exist before activation', () => {
    const original = process.env.DECKENT_TEST_HERMETICITY;
    delete process.env.DECKENT_TEST_HERMETICITY;
    try {
      const restore = activateHermeticityEnvironment();
      expect(process.env.DECKENT_TEST_HERMETICITY).toBe('1');
      restore();
      expect(process.env.DECKENT_TEST_HERMETICITY).toBeUndefined();
    } finally {
      if (original === undefined) delete process.env.DECKENT_TEST_HERMETICITY;
      else process.env.DECKENT_TEST_HERMETICITY = original;
    }
  });

  it('restores the caller marker when baseline acquisition fails', async () => {
    const original = process.env.DECKENT_TEST_HERMETICITY;
    process.env.DECKENT_TEST_HERMETICITY = 'caller-owned';
    try {
      await expect(beginDistIntegritySession(
        join(fixtureRoot(), 'dist'),
        async () => {
          throw new Error('fixture snapshot failure');
        },
      )).rejects.toThrow('fixture snapshot failure');
      expect(process.env.DECKENT_TEST_HERMETICITY).toBe('caller-owned');
    } finally {
      if (original === undefined) delete process.env.DECKENT_TEST_HERMETICITY;
      else process.env.DECKENT_TEST_HERMETICITY = original;
    }
  });
});
