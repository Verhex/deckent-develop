import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';

// born-537 (task 389-003) — deckent_edit_file unique-match / replaceAll / empty-old
// guards. Hermetic: all I/O under a per-test tmpdir (mirrors chat-tool-exec.test.ts).

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-edit-unique-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('deckent_edit_file — unique-match / replaceAll / empty-old (born-537)', () => {
  it('single match → replaces normally', async () => {
    writeFileSync(join(dir, 'a.txt'), 'foo bar baz');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'a.txt', old: 'bar', new: 'qux' });
    expect(res).toContain('düzenlendi');
    expect(readFileSync(join(dir, 'a.txt'), 'utf-8')).toBe('foo qux baz');
  });

  it('multiple matches without replaceAll → [mcp-error], file unchanged', async () => {
    writeFileSync(join(dir, 'b.txt'), 'foo foo foo');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'b.txt', old: 'foo', new: 'bar' });
    expect(res).toContain('[mcp-error]');
    expect(res).toContain('birden çok');
    expect(readFileSync(join(dir, 'b.txt'), 'utf-8')).toBe('foo foo foo');
  });

  it('multiple matches + replaceAll:true → all occurrences replaced', async () => {
    writeFileSync(join(dir, 'c.txt'), 'foo foo foo');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'c.txt', old: 'foo', new: 'bar', replaceAll: true });
    expect(res).toContain('düzenlendi');
    expect(readFileSync(join(dir, 'c.txt'), 'utf-8')).toBe('bar bar bar');
  });

  it('multiple matches + replace_all:true (snake_case) → all occurrences replaced', async () => {
    writeFileSync(join(dir, 'c2.txt'), 'x-x-x');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'c2.txt', old: 'x', new: 'y', replace_all: true });
    expect(res).toContain('düzenlendi');
    expect(readFileSync(join(dir, 'c2.txt'), 'utf-8')).toBe('y-y-y');
  });

  it('empty old_string → explicit [mcp-error], file unchanged', async () => {
    writeFileSync(join(dir, 'd.txt'), 'original content');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'd.txt', old: '', new: 'inserted' });
    expect(res).toContain('[mcp-error]');
    expect(res).toContain('boş olamaz');
    expect(readFileSync(join(dir, 'd.txt'), 'utf-8')).toBe('original content');
  });

  it('zero matches → existing "eşleşme yok" error still fires (regression guard)', async () => {
    writeFileSync(join(dir, 'e.txt'), 'unrelated content');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'e.txt', old: 'nope', new: 'x' });
    expect(res).toContain('[mcp-error]');
    expect(res).toContain('eşleşme yok');
    expect(readFileSync(join(dir, 'e.txt'), 'utf-8')).toBe('unrelated content');
  });

  it('replaceAll on a single match behaves the same as a normal replace', async () => {
    writeFileSync(join(dir, 'f.txt'), 'only one here');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'f.txt', old: 'one', new: 'single', replaceAll: true });
    expect(res).toContain('düzenlendi');
    expect(readFileSync(join(dir, 'f.txt'), 'utf-8')).toBe('only single here');
  });
});
