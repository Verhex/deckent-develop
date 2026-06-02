import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';

// Sprint 224 T-224-005 — deckent tool-exec layer. Hermetic: all I/O under a
// per-test tmpdir, bash stubbed, confirm stubbed. Never touches the real cwd.

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-toolexec-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('createToolExecDispatcher (T-224-005)', () => {
  it('deckent_write_file → creates the file with content', async () => {
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: 'deckent1st.md', content: 'merhaba' });
    expect(res).toContain('yazıldı');
    expect(readFileSync(join(dir, 'deckent1st.md'), 'utf-8')).toBe('merhaba');
  });

  it('deckent_read_file → returns content (read is unconfirmed)', async () => {
    writeFileSync(join(dir, 'a.txt'), 'içerik');
    const d = createToolExecDispatcher({ cwd: dir });
    expect(await d.dispatch('deckent_read_file', { path: 'a.txt' })).toBe('içerik');
  });

  it('deckent_edit_file → replaces matched text', async () => {
    writeFileSync(join(dir, 'b.txt'), 'eski metin');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_edit_file', { path: 'b.txt', old: 'eski', new: 'yeni' });
    expect(res).toContain('düzenlendi');
    expect(readFileSync(join(dir, 'b.txt'), 'utf-8')).toBe('yeni metin');
  });

  it('deckent_bash → returns injected command output', async () => {
    const bashRun = vi.fn(async () => 'komut-çıktısı');
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true, bashRun });
    expect(await d.dispatch('deckent_bash', { cmd: 'echo hi' })).toBe('komut-çıktısı');
    expect(bashRun).toHaveBeenCalledWith('echo hi', dir);
  });

  it('scope-guard → path outside cwd is rejected with [mcp-error]', async () => {
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => true });
    const res = await d.dispatch('deckent_write_file', { path: '../escape.md', content: 'x' });
    expect(res).toContain('[mcp-error]');
    expect(existsSync(join(dir, '..', 'escape.md'))).toBe(false);
  });

  it('confirm reject → side-effecting tool is cancelled, no file written', async () => {
    const d = createToolExecDispatcher({ cwd: dir, confirm: async () => false });
    const res = await d.dispatch('deckent_write_file', { path: 'no.md', content: 'x' });
    expect(res).toContain('iptal');
    expect(existsSync(join(dir, 'no.md'))).toBe(false);
  });

  it('unknown tool → [mcp-error], never throws', async () => {
    const d = createToolExecDispatcher({ cwd: dir });
    expect(await d.dispatch('deckent_nope', {})).toContain('unknown tool');
  });
});
