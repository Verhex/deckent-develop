// ═══ 583/N2a — silent READ surface pins (list_dir / grep / glob) ═════════════
// Hermetic tmpdir project; the dispatcher's scope-guard + caps + tolerance.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'read-surface-'));
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
  writeFileSync(join(root, 'src', 'alpha.ts'), 'const needle = 1;\nexport {};\n');
  writeFileSync(join(root, 'src', 'deep', 'beta.md'), '# no match here\n');
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'x', 'skip.ts'), 'needle should be skipped\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const dispatch = (name: string, args: Record<string, unknown>) =>
  createToolExecDispatcher({ cwd: root }).dispatch(name, args);

describe('583/N2a — silent READ tools', () => {
  it('list_dir lists entries with dir markers and refuses out-of-scope paths', async () => {
    const out = await dispatch('deckent_list_dir', { path: 'src' });
    expect(out).toContain('alpha.ts');
    expect(out).toContain('deep/');
    expect(await dispatch('deckent_list_dir', { path: '../..' })).toContain('[mcp-error]');
  });

  it('grep returns path:line:text hits, skips node_modules, honest no-match', async () => {
    const out = await dispatch('deckent_grep', { pattern: 'needle' });
    expect(out).toContain('src/alpha.ts:1:const needle = 1;');
    expect(out).not.toContain('node_modules');
    expect(await dispatch('deckent_grep', { pattern: 'zzz-yok' })).toBe('[deckent] no matches');
    expect(await dispatch('deckent_grep', { pattern: '(' })).toContain('invalid regex');
  });

  it('glob matches ** and * against project-relative paths', async () => {
    const out = await dispatch('deckent_glob', { pattern: '**/*.ts' });
    expect(out).toContain('src/alpha.ts');
    expect(out).not.toContain('beta.md');
    expect(await dispatch('deckent_glob', { pattern: 'src/*.md' })).toBe('[deckent] no matches');
  });
});
