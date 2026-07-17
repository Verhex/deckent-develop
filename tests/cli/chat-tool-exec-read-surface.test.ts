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

// ═══ 583/N2 polish — generated/ignored dirs skipped (Alperen @cost live-fix) ══
import { readIgnoredDirs, walkProjectFiles, BASELINE_IGNORED_DIRS } from '../../src/cli/commands/chat-tool-exec.js';

describe('readIgnoredDirs + walkProjectFiles — VS-Code-like ignore behavior', () => {
  let r: string;
  beforeEach(() => {
    r = mkdtempSync(join(tmpdir(), 'ignore-dirs-'));
  });
  afterEach(() => rmSync(r, { recursive: true, force: true }));

  it('baseline always covers node_modules/.git/dist/build/out/coverage', () => {
    for (const d of ['node_modules', '.git', 'dist', 'build', 'out', 'coverage']) {
      expect(BASELINE_IGNORED_DIRS.has(d), d).toBe(true);
    }
  });

  it('unions the baseline with unambiguous root .gitignore directory entries', () => {
    writeFileSync(join(r, '.gitignore'), [
      'generated/',      // trailing-slash dir → added
      'vendor',          // bare name → added
      '/rooted',         // leading-slash → basename added
      '# a comment',     // ignored
      '!keep',           // negation → ignored
      '*.log',           // glob → ignored
      'src/nested',      // embedded slash → ignored (not a basename ignore)
    ].join('\n'));
    const dirs = readIgnoredDirs(r);
    expect(dirs.has('generated')).toBe(true);
    expect(dirs.has('vendor')).toBe(true);
    expect(dirs.has('rooted')).toBe(true);
    expect(dirs.has('keep')).toBe(false);
    expect(dirs.has('src')).toBe(false);
    expect(dirs.has('node_modules')).toBe(true); // baseline still there
  });

  it('a missing/garbled .gitignore degrades to the baseline (never throws)', () => {
    expect(readIgnoredDirs(r).has('dist')).toBe(true); // no .gitignore → baseline
  });

  it('the walker skips ignored dirs so dist/ duplicates never surface (the @cost class)', () => {
    mkdirSync(join(r, 'src'), { recursive: true });
    mkdirSync(join(r, 'dist'), { recursive: true });
    writeFileSync(join(r, 'src', 'cost.ts'), 'x');
    writeFileSync(join(r, 'dist', 'cost.js'), 'x');
    const seen: string[] = [];
    walkProjectFiles(r, (abs) => { seen.push(abs); return true; }, readIgnoredDirs(r));
    expect(seen.some((p) => p.includes(`${join('src', 'cost.ts')}`))).toBe(true);
    expect(seen.some((p) => p.includes('dist'))).toBe(false);
  });
});
