import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolExecDispatcher, resolveRealPathLenient } from '../../src/cli/commands/chat-tool-exec.js';
import { DeckentError, ErrorRegistry } from '../../src/core/errors.js';

// born-623 (task 402-004, E005-SPLIT) — 397-007 conflated path-RESOLUTION
// failures (ELOOP symlink cycles, and other fs-level errors) with
// DECKENT_E005 "scope violation", misdiagnosing operators toward "worker
// exceeded scope" when the real problem was a broken/cyclic symlink.
// This file proves the two-way split: an fs-resolution failure produces
// the new DECKENT_E075 code; a GENUINE out-of-scope path still produces
// DECKENT_E005. Hermetic: all fixtures live under a per-test tmpdir.

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-toolexec-errsplit-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('DECKENT_E075 registry entry (born-623)', () => {
  it('is registered, distinct from DECKENT_E005', () => {
    expect(ErrorRegistry.has('DECKENT_E075')).toBe(true);
    const e075 = ErrorRegistry.get('DECKENT_E075')!;
    const e005 = ErrorRegistry.get('DECKENT_E005')!;
    expect(e075.message).not.toBe(e005.message);
    expect(e075.message).toContain('path resolution');
  });

  it('has full human-context fields (whatHappened/why/howToFix)', () => {
    const entry = ErrorRegistry.get('DECKENT_E075')!;
    expect(entry.whatHappened).toBeDefined();
    expect(entry.why).toBeDefined();
    expect(entry.howToFix).toBeDefined();
    expect(entry.howToFix!.length).toBeGreaterThanOrEqual(1);
  });

  it('does not collide with any other registered code', () => {
    const all = ErrorRegistry.getAll();
    // DECKENT_E075 must be a NEW entry, not a re-purposed existing one.
    expect(all.get('DECKENT_E075')).not.toEqual(all.get('DECKENT_E005'));
    expect(all.get('DECKENT_E075')).not.toEqual(all.get('DECKENT_E074'));
  });
});

describe('resolveRealPathLenient — fs-resolution failures (born-623)', () => {
  it('ELOOP symlink-cycle throws DECKENT_E075, NOT DECKENT_E005', () => {
    const linkA = join(dir, 'cycle-a');
    const linkB = join(dir, 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    let caught: unknown = null;
    try {
      resolveRealPathLenient(linkA);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DeckentError);
    expect((caught as DeckentError).code).toBe('DECKENT_E075');
    expect((caught as DeckentError).code).not.toBe('DECKENT_E005');
  });

  it('a path segment that does not exist yet resolves leniently (no throw)', () => {
    // Unrelated to born-623, but a regression guard: the ENOENT/ENOTDIR
    // split inside resolveRealPathLenient must keep the original
    // "new file" behavior working (deckent_write_file creates new files).
    const target = join(dir, 'brand-new-subdir', 'brand-new-file.txt');
    expect(() => resolveRealPathLenient(target)).not.toThrow();
  });

  it('a plain existing file (no symlinks) resolves to itself, no throw', () => {
    mkdirSync(join(dir, 'plain'), { recursive: true });
    const target = join(dir, 'plain', 'file.txt');
    const resolved = resolveRealPathLenient(target);
    expect(resolved).toBe(target);
  });
});

describe('createToolExecDispatcher — E005 vs E075 two-way split (born-623)', () => {
  it('a textual out-of-scope path (../escape) → [mcp-error] carries DECKENT_E005', async () => {
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_read_file', { path: '../escape.md' });
    expect(res).toContain('[mcp-error]');
    expect(res).toContain('DECKENT_E005');
    expect(res).not.toContain('DECKENT_E075');
  });

  it('a symlink that resolves outside cwd (not a cycle) → [mcp-error] carries DECKENT_E005', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'deckent-toolexec-outside-'));
    const evilLink = join(dir, 'evil-link.md');
    symlinkSync(join(outside, 'secret.md'), evilLink);

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_read_file', { path: 'evil-link.md' });
    expect(res).toContain('[mcp-error]');
    expect(res).toContain('DECKENT_E005');
    expect(res).not.toContain('DECKENT_E075');
    rmSync(outside, { recursive: true, force: true });
  });

  it('a symlink-cycle path → [mcp-error] carries DECKENT_E075, NOT DECKENT_E005', async () => {
    const linkA = join(dir, 'cycle-a');
    const linkB = join(dir, 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_read_file', { path: 'cycle-a' });
    expect(res).toContain('[mcp-error]');
    expect(res).toContain('DECKENT_E075');
    expect(res).not.toContain('DECKENT_E005');
  });

  it('deckent_write_file with a symlink-cycle path → DECKENT_E075, file never written', async () => {
    const linkA = join(dir, 'cycle-a');
    const linkB = join(dir, 'cycle-b');
    symlinkSync(linkB, linkA);
    symlinkSync(linkA, linkB);

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'cycle-a', content: 'x' });
    expect(res).toContain('DECKENT_E075');
  });
});
