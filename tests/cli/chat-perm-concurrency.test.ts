// born-539: CHAT-PERM-CONCURRENCY — read-merge-write concurrent grant kaybı (P2).
// chat-permissions.ts's PermissionStore loads the allow-set once into a
// closure-local cache at creation time. Two store instances sharing the same
// .deckent/settings.local.json (e.g. two concurrent REPL/worker sessions) each
// hold an independent stale snapshot; before the born-539 fix, writing that raw
// snapshot let the later writer silently clobber an earlier concurrent grant
// (last-writer-wins → grant loss). These tests assert both grants survive.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPermissionStore,
  loadPermissions,
  settingsLocalPath,
} from '../../src/cli/commands/chat-permissions.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-perm-concurrency-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('chat-permissions read-merge-write concurrency (born-539)', () => {
  it('two concurrent grants from separate store instances both persist (no last-writer-wins loss)', () => {
    // Two instances created against the same (empty) initial state — the
    // shape of two concurrent processes/sessions each snapshotting at t0.
    const storeA = createPermissionStore(dir);
    const storeB = createPermissionStore(dir);

    storeA.allow('deckent_write_file');
    storeB.allow('deckent_bash');

    const doc = JSON.parse(readFileSync(settingsLocalPath(dir), 'utf-8'));
    expect(doc.permissions.allow).toEqual(
      expect.arrayContaining(['deckent_write_file', 'deckent_bash']),
    );
    expect(doc.permissions.allow).toHaveLength(2);
  });

  it('a store instance created after two concurrent grants observes both', () => {
    const storeA = createPermissionStore(dir);
    const storeB = createPermissionStore(dir);
    storeA.allow('deckent_write_file');
    storeB.allow('deckent_bash');

    const storeC = createPermissionStore(dir);
    expect(storeC.isAllowed('deckent_write_file')).toBe(true);
    expect(storeC.isAllowed('deckent_bash')).toBe(true);
    expect(storeC.list()).toEqual(['deckent_bash', 'deckent_write_file']);
  });

  it('B loads its stale snapshot after A has already granted once, then A grants again concurrently — all three survive', () => {
    const storeA = createPermissionStore(dir);
    storeA.allow('deckent_edit_file'); // disk now has ['deckent_edit_file']

    // B snapshots the post-A-first-grant state, then A grants a second tool
    // before B's own (interleaved/concurrent) grant reaches disk.
    const storeB = createPermissionStore(dir);
    storeA.allow('deckent_read_file'); // disk now has both A grants
    storeB.allow('deckent_bash'); // B's snapshot didn't know about read_file

    const doc = JSON.parse(readFileSync(settingsLocalPath(dir), 'utf-8'));
    expect(doc.permissions.allow).toEqual(
      expect.arrayContaining(['deckent_edit_file', 'deckent_read_file', 'deckent_bash']),
    );
    expect(doc.permissions.allow).toHaveLength(3);
  });

  it('concurrent grants preserve unrelated top-level fields (merge, not overwrite)', () => {
    mkdirSync(join(dir, '.deckent'), { recursive: true });
    writeFileSync(settingsLocalPath(dir), JSON.stringify({ theme: 'dark' }), 'utf-8');

    const storeA = createPermissionStore(dir);
    const storeB = createPermissionStore(dir);
    storeA.allow('deckent_write_file');
    storeB.allow('deckent_bash');

    const doc = JSON.parse(readFileSync(settingsLocalPath(dir), 'utf-8'));
    expect(doc.theme).toBe('dark');
    expect(doc.permissions.allow).toEqual(
      expect.arrayContaining(['deckent_write_file', 'deckent_bash']),
    );
  });

  it('granting the same tool from two stale instances does not duplicate or lose entries', () => {
    const storeA = createPermissionStore(dir);
    const storeB = createPermissionStore(dir);
    storeA.allow('deckent_bash');
    storeB.allow('deckent_bash');

    expect(loadPermissions(dir).size).toBe(1);
    expect([...loadPermissions(dir)]).toEqual(['deckent_bash']);
  });
});
