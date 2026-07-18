// ═══ chat-tool-exec git tools — 583/N4 (KARAR-2 native-araç-seti) ═══════════
//
// The five deckent_git_* tools through the REAL dispatcher against a REAL git
// tmpdir (async spawn only). The confirm-tier line is the heart: status/log/
// diff never ask, add/commit ALWAYS ask (the human seal) and a denial leaves
// the repo untouched. Protocol strings are English-canonical ([deckent]/
// [mcp-error]) — the localized confirm summary is the only user-facing text.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';

function gitRun(cwd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.on('error', () => resolve({ code: -1, stdout }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout }));
  });
}

async function initRepoWithBaseline(dir: string): Promise<void> {
  expect((await gitRun(dir, ['init', '--quiet', '-b', 'main'])).code).toBe(0);
  await gitRun(dir, ['config', '--local', 'core.hooksPath', '/dev/null']);
  await gitRun(dir, ['config', '--local', 'commit.gpgsign', 'false']);
  await gitRun(dir, ['config', '--local', 'user.name', 'test']);
  await gitRun(dir, ['config', '--local', 'user.email', 'test@example.com']);
  writeFileSync(join(dir, 'base.txt'), 'baseline\n', 'utf-8');
  await gitRun(dir, ['add', 'base.txt']);
  expect((await gitRun(dir, ['commit', '--quiet', '--no-gpg-sign', '-m', 'baseline'])).code).toBe(0);
}

let root: string;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'chat-git-'));
  await initRepoWithBaseline(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('silent tier — status / log / diff never invoke confirm', () => {
  it('git_status reads branch + entries without a confirm call', async () => {
    const confirm = vi.fn(async () => true);
    const d = createToolExecDispatcher({ cwd: root, confirm });
    writeFileSync(join(root, 'new.txt'), 'n\n', 'utf-8');

    const out = await d.dispatch('deckent_git_status', {});
    expect(out).toContain('[deckent] branch main');
    expect(out).toContain('?? new.txt');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('git_log lists commits; git_diff shows the pending hunk — both silent', async () => {
    const confirm = vi.fn(async () => true);
    const d = createToolExecDispatcher({ cwd: root, confirm });
    writeFileSync(join(root, 'base.txt'), 'baseline\nplus\n', 'utf-8');

    const log = await d.dispatch('deckent_git_log', { limit: 3 });
    expect(log).toContain('baseline');
    const diff = await d.dispatch('deckent_git_diff', {});
    expect(diff).toContain('+plus');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('a clean tree answers `git diff: empty` honestly', async () => {
    const d = createToolExecDispatcher({ cwd: root });
    expect(await d.dispatch('deckent_git_diff', {})).toBe('[deckent] git diff: empty');
  });
});

describe('confirm tier — add / commit are the human seal', () => {
  it('add asks with the paths summary; commit asks with the subject; approval → real commit lands', async () => {
    const summaries: string[] = [];
    const confirm = vi.fn(async (summary: string) => { summaries.push(summary); return true; });
    const d = createToolExecDispatcher({ cwd: root, confirm });
    writeFileSync(join(root, 'feature.txt'), 'feature\n', 'utf-8');

    const added = await d.dispatch('deckent_git_add', {});
    expect(added).toBe('[deckent] staged 1 file(s)');
    const committed = await d.dispatch('deckent_git_commit', { message: 'feat: add feature\n\ndeckent-run: f-1' });
    expect(committed).toMatch(/^\[deckent\] committed [0-9a-f]{7,}$/);

    expect(summaries).toEqual(['Stage changes: all', 'Commit: feat: add feature']);
    const log = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(log.stdout.trim()).toBe('feat: add feature');
  });

  it('a DENIED add/commit returns the denial marker and leaves the repo untouched', async () => {
    const d = createToolExecDispatcher({ cwd: root, confirm: async () => false });
    writeFileSync(join(root, 'never.txt'), 'never\n', 'utf-8');

    expect(await d.dispatch('deckent_git_add', {})).toBe('[deckent-denied] deckent_git_add');
    expect(await d.dispatch('deckent_git_commit', { message: 'nope' })).toBe('[deckent-denied] deckent_git_commit');
    const staged = await gitRun(root, ['diff', '--staged', '--name-only']);
    expect(staged.stdout.trim()).toBe('');
    const head = await gitRun(root, ['log', '-n1', '--pretty=%s']);
    expect(head.stdout.trim()).toBe('baseline');
  });

  it('git_add with an out-of-scope path is refused before git ever runs (E005 scope marker)', async () => {
    const d = createToolExecDispatcher({ cwd: root, confirm: async () => true });
    const out = await d.dispatch('deckent_git_add', { paths: ['../outside.txt'] });
    // inScope throws the coded scope-violation — the dispatcher's outer catch
    // surfaces it with the E005 marker (born-623 vocabulary), which is the
    // designed, MORE specific refusal.
    expect(out).toContain('[mcp-error] deckent_git_add:');
    expect(out).toContain('[DECKENT_E005]');
    expect(out).toContain('path escapes scope');
  });

  it('an empty commit message is refused with an honest marker', async () => {
    const d = createToolExecDispatcher({ cwd: root, confirm: async () => true });
    expect(await d.dispatch('deckent_git_commit', { message: '   ' }))
      .toBe('[mcp-error] deckent_git_commit: empty message');
  });
});

describe('non-git honesty', () => {
  it('every tool answers `not a git repository` instead of throwing', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'chat-git-plain-'));
    try {
      const d = createToolExecDispatcher({ cwd: plain, confirm: async () => true });
      expect(await d.dispatch('deckent_git_status', {})).toContain('not a git repository');
      expect(await d.dispatch('deckent_git_log', {})).toContain('not a git repository');
      expect(await d.dispatch('deckent_git_diff', {})).toContain('not a git repository');
      expect(await d.dispatch('deckent_git_add', {})).toContain('not a git repository');
      expect(await d.dispatch('deckent_git_commit', { message: 'm' })).toContain('not a git repository');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
