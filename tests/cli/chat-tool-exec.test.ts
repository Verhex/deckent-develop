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
    expect(res).toContain('wrote');
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
    expect(res).toContain('edited');
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
    expect(res).toContain('[deckent-denied]');
    expect(existsSync(join(dir, 'no.md'))).toBe(false);
  });

  it('unknown tool → [mcp-error], never throws', async () => {
    const d = createToolExecDispatcher({ cwd: dir });
    expect(await d.dispatch('deckent_nope', {})).toContain('unknown tool');
  });
});

describe('createToolExecDispatcher — i18n confirm summaries (REPL-575 K5)', () => {
  it('default (no labels) → English confirm summary, never hardcoded Turkish', async () => {
    const seen: string[] = [];
    const d = createToolExecDispatcher({
      cwd: dir,
      confirm: async (summary) => { seen.push(summary); return true; },
    });
    await d.dispatch('deckent_write_file', { path: 'x.md', content: 'hello' });
    await d.dispatch('deckent_bash', { cmd: 'echo hi' });
    expect(seen[0]).toBe('Write file: x.md (5 chars)');
    expect(seen[1]).toBe('Run command: echo hi');
    // The old hardcoded-Turkish summary must be gone.
    expect(seen.join(' ')).not.toMatch(/Dosya yaz|Komut çalıştır/);
  });

  it('injected labels → confirm summary uses the caller-localized text (mechanism string-free)', async () => {
    const seen: string[] = [];
    const d = createToolExecDispatcher({
      cwd: dir,
      confirm: async (summary) => { seen.push(summary); return true; },
      labels: {
        writeSummary: (path, chars) => `Dosya yaz: ${path} (${chars} karakter)`,
        editSummary: (path) => `Dosya düzenle: ${path}`,
        bashSummary: (cmd) => `Komut çalıştır: ${cmd}`,
      },
    });
    writeFileSync(join(dir, 'e.txt'), 'a');
    await d.dispatch('deckent_write_file', { path: 'w.md', content: 'ab' });
    await d.dispatch('deckent_edit_file', { path: 'e.txt', old: 'a', new: 'b' });
    await d.dispatch('deckent_bash', { cmd: 'ls' });
    expect(seen).toEqual([
      'Dosya yaz: w.md (2 karakter)',
      'Dosya düzenle: e.txt',
      'Komut çalıştır: ls',
    ]);
  });

  it('partial label override → missing labels fall back to the English default', async () => {
    const seen: string[] = [];
    const d = createToolExecDispatcher({
      cwd: dir,
      confirm: async (summary) => { seen.push(summary); return true; },
      labels: { bashSummary: (cmd) => `Koş: ${cmd}` },
    });
    await d.dispatch('deckent_write_file', { path: 'x.md', content: 'hi' });
    await d.dispatch('deckent_bash', { cmd: 'pwd' });
    expect(seen[0]).toBe('Write file: x.md (2 chars)'); // default
    expect(seen[1]).toBe('Koş: pwd');                   // override
  });
});
