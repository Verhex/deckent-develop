import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';

// born-536 (TOOL-EXEC-SYMLINK) — inScope() must resolve symlinks before
// deciding a path is in-scope: a symlink placed inside the scope root can
// point its real target outside it, and writeFileSync/readFileSync follow
// that symlink at the OS level regardless of the textual path looking
// in-scope. Hermetic: two per-test tmpdirs (scope root + an "outside" root
// standing in for anything beyond it), no real cwd touched.

let dir: string;
let outside: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deckent-toolexec-scope-'));
  outside = mkdtempSync(join(tmpdir(), 'deckent-toolexec-outside-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('createToolExecDispatcher — symlink scope-escape (born-536)', () => {
  it('symlink FILE inside cwd pointing to an existing outside target → write rejected', async () => {
    const outsideTarget = join(outside, 'secret.txt');
    writeFileSync(outsideTarget, 'original');
    symlinkSync(outsideTarget, join(dir, 'escape-link.txt'));

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'escape-link.txt', content: 'pwned' });

    expect(res).toContain('[mcp-error]');
    expect(readFileSync(outsideTarget, 'utf-8')).toBe('original');
  });

  it('BROKEN symlink FILE inside cwd pointing outside (target does not exist) → write rejected', async () => {
    const outsideTarget = join(outside, 'not-yet-created.txt');
    symlinkSync(outsideTarget, join(dir, 'broken-link.txt'));

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'broken-link.txt', content: 'pwned' });

    expect(res).toContain('[mcp-error]');
    expect(existsSync(outsideTarget)).toBe(false);
  });

  it('symlink DIRECTORY inside cwd pointing outside → write through it rejected', async () => {
    symlinkSync(outside, join(dir, 'escape-dir'), 'dir');

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'escape-dir/pwned.txt', content: 'pwned' });

    expect(res).toContain('[mcp-error]');
    expect(existsSync(join(outside, 'pwned.txt'))).toBe(false);
  });

  it('legitimate in-scope symlink (target stays inside cwd) → write still succeeds', async () => {
    mkdirSync(join(dir, 'real-sub'));
    writeFileSync(join(dir, 'real-sub', 'target.txt'), 'before');
    symlinkSync(join(dir, 'real-sub', 'target.txt'), join(dir, 'inside-link.txt'));

    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'inside-link.txt', content: 'after' });

    expect(res).toContain('wrote');
    expect(readFileSync(join(dir, 'real-sub', 'target.txt'), 'utf-8')).toBe('after');
  });

  it('plain new file with no symlink involved → still succeeds (regression guard)', async () => {
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'brand-new.md', content: 'hello' });

    expect(res).toContain('wrote');
    expect(readFileSync(join(dir, 'brand-new.md'), 'utf-8')).toBe('hello');
  });
});
