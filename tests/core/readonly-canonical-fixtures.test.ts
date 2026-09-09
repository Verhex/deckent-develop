// tests/core/readonly-canonical-fixtures.test.ts
// ═══ 7111-b — canonical identity + real glob expansion fixtures ═════════════
// Every path argument is canonicalised component by component when the root
// is on disk: each symlink hop and the final real path must be inside the real
// root AND outside the protected trees. Globs are expanded here with sh rules
// and every match is checked. Disposable tmpdir fixtures only; the `.env`
// fixture holds a placeholder, never a credential.
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { classifyReadOnlyShellCommand, DEFAULT_MAX_GLOB_MATCHES } from '../../src/core/shell-readonly-classifier.js';

const LINKS = ['chain2.txt', 'chain1.txt', 'notes.txt', 'escape.txt', 'alias-a.txt', 'sub/linkdir'];

/** Unlink the symlinks FIRST (the hermeticity write guard canonicalises every
 *  deletion target and a dangling link would fail its realpath), then rm -r. */
async function cleanup(base: string, root: string): Promise<void> {
  for (const link of LINKS) await unlink(join(root, link));
  await rm(base, { recursive: true, force: true });
}

async function fixture(): Promise<{ base: string; root: string }> {
  const base = await mkdtemp(join(tmpdir(), 'ro-canonical-'));
  const root = join(base, 'project');
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'sub'));
  await mkdir(join(base, 'elsewhere'));
  await writeFile(join(root, '.env'), 'DISPOSABLE_FIXTURE_ONLY');
  await writeFile(join(root, 'a.txt'), 'A');
  await writeFile(join(root, 'b.txt'), 'B');
  await writeFile(join(root, 'docs', 'c.txt'), 'C');
  await writeFile(join(base, 'outside.txt'), 'OUTSIDE');
  await writeFile(join(base, 'elsewhere', 'x.txt'), 'X');
  await symlink(join(root, '.env'), join(root, 'notes.txt'));           // in-root alias of a protected file
  await symlink(join(root, 'notes.txt'), join(root, 'chain1.txt'));     // chained: chain2 → chain1 → notes → .env
  await symlink(join(root, 'chain1.txt'), join(root, 'chain2.txt'));
  await symlink(join(base, 'outside.txt'), join(root, 'escape.txt'));   // glob match escaping the root
  await symlink(join(base, 'elsewhere'), join(root, 'sub', 'linkdir'));  // intermediate directory symlink
  await symlink(join(root, 'a.txt'), join(root, 'alias-a.txt'));         // benign in-root alias
  return { base, root };
}

const at = (root: string, command: string, extra: Record<string, unknown> = {}) =>
  classifyReadOnlyShellCommand(command, { projectRoot: root, platform: 'linux', ...extra });

async function bashExit(command: string, cwd: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', command], { cwd, stdio: 'ignore' });
    child.on('error', () => resolve(null));
    child.on('close', resolve);
  });
}

describe('7111-b canonical identity — symlinks to protected / outside targets', () => {
  it('B3a: an in-root symlink to a protected file is PATH_PROTECTED (direct and chained)', async () => {
    const { base, root } = await fixture();
    try {
      expect(at(root, 'cat notes.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED', detail: 'notes.txt' });
      expect(at(root, 'cat chain2.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
      expect(at(root, 'head -1 chain1.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
      expect(at(root, 'wc -l < notes.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
      expect(at(root, 'cat alias-a.txt')).toMatchObject({ readOnly: true });
      // The real shell WOULD read the protected bytes through the alias.
      const code = await bashExit('cat notes.txt', root);
      if (code !== null) expect(code).toBe(0);
    } finally { await cleanup(base, root); }
  });

  it('intermediate directory symlink escaping the root fails closed', async () => {
    const { base, root } = await fixture();
    try {
      expect(at(root, 'cat sub/linkdir/x.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at(root, 'cat sub/linkdir/*.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at(root, 'grep -r x sub/linkdir')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
    } finally { await cleanup(base, root); }
  });
});

describe('7111-b real glob expansion', () => {
  it('B3b: a glob whose match is a symlink to an outside file fails closed; a clean glob passes', async () => {
    const { base, root } = await fixture();
    try {
      expect(at(root, 'cat *.txt')).toMatchObject({ readOnly: false });
      expect(['PATH_OUTSIDE_ROOT', 'PATH_PROTECTED']).toContain(at(root, 'cat *.txt').reasonCode);
      expect(at(root, 'cat docs/*.txt')).toMatchObject({ readOnly: true, paths: ['docs'] });
      expect(at(root, 'cat [ab].txt')).toMatchObject({ readOnly: true });
      expect(at(root, 'cat ?.txt')).toMatchObject({ readOnly: true });
      expect(at(root, 'cat c*.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' }); // chain1/chain2 → .env
      expect(at(root, 'cat e*.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' }); // escape.txt
    } finally { await cleanup(base, root); }
  });

  it('sh dotfile rule: `*` never reaches .env, `.*` does; `**` is `*`', async () => {
    const { base, root } = await fixture();
    try {
      // `*` matches every non-dot entry in the root — including the aliases, so fail closed.
      expect(at(root, 'cat *')).toMatchObject({ readOnly: false });
      expect(at(root, 'cat .*')).toMatchObject({ readOnly: false, reasonCode: 'PATH_PROTECTED' });
      expect(at(root, 'cat docs/**')).toMatchObject({ readOnly: true });
      expect(at(root, 'cat docs/*')).toMatchObject({ readOnly: true });
    } finally { await cleanup(base, root); }
  });

  it('zero matches, over-bound expansion and brace expansion all fail closed', async () => {
    const { base, root } = await fixture();
    try {
      expect(at(root, 'cat docs/*.md')).toMatchObject({ readOnly: false, reasonCode: 'GLOB_EXPANSION' });
      expect(at(root, 'cat nope/*.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_UNRESOLVED' });
      expect(at(root, 'cat docs/*.txt', { maxGlobMatches: 1 })).toMatchObject({ readOnly: true });
      expect(at(root, 'cat [ab].txt', { maxGlobMatches: 1 })).toMatchObject({ readOnly: false, reasonCode: 'GLOB_EXPANSION' });
      expect(DEFAULT_MAX_GLOB_MATCHES).toBe(10_000);
      expect(at(root, 'cat {a,b}.txt')).toMatchObject({ readOnly: false, reasonCode: 'BRACE_EXPANSION' });
      expect(at(root, "cat '*.txt'")).toMatchObject({ readOnly: false, reasonCode: 'PATH_UNRESOLVED' }); // literal file name, absent
    } finally { await cleanup(base, root); }
  });
});

describe('7111-b rev2 — symlink-target parents and POSIX bracket expressions', () => {
  it('re-walks parent components introduced by a symlink target (direct and nested dirlinks)', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ro-target-parent-'));
    try {
      const root = join(base, 'project');
      const outside = join(base, 'outside');
      await mkdir(join(root, 'inner'), { recursive: true });
      await mkdir(join(outside, 'deep'), { recursive: true });
      await writeFile(join(outside, 'file.txt'), 'DISPOSABLE');
      await writeFile(join(outside, 'deep', 'leaf.txt'), 'DISPOSABLE');
      await writeFile(join(root, 'inner', 'ok.txt'), 'OK');
      await symlink(outside, join(root, 'dirlink'));                       // dirlink → outside
      await symlink('dirlink/file.txt', join(root, 'notes.txt'));           // notes → dirlink/file.txt
      await symlink(join(root, 'dirlink'), join(root, 'inner', 'hop'));     // inner/hop → dirlink (nested dirlink)
      await symlink('hop/deep/leaf.txt', join(root, 'inner', 'leaf.txt'));  // leaf → hop/deep/leaf.txt → dirlink/deep/leaf.txt → outside
      await symlink('inner/ok.txt', join(root, 'fine.txt'));
      const at = (cmd: string) => classifyReadOnlyShellCommand(cmd, { projectRoot: root, platform: 'linux' });
      expect(at('cat notes.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat inner/leaf.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat inner/hop/file.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat fine.txt')).toMatchObject({ readOnly: true });
      expect(at('cat inner/*.txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      for (const link of ['fine.txt', 'inner/leaf.txt', 'inner/hop', 'notes.txt', 'dirlink']) await unlink(join(root, link));
    } finally { await rm(base, { recursive: true, force: true }); }
  });

  it('POSIX bracket expressions: negation, ranges, classes, leading ], unsupported forms', async () => {
    const base = await mkdtemp(join(tmpdir(), 'ro-bracket-'));
    try {
      const root = join(base, 'project');
      await mkdir(root);
      await writeFile(join(root, 'a.txt'), 'A');
      await writeFile(join(root, 'c.txt'), 'C');
      await writeFile(join(root, ']x.txt'), 'X');
      await writeFile(join(root, '1.txt'), '1');
      await writeFile(join(base, 'outside.txt'), 'DISPOSABLE');
      await symlink(join(base, 'outside.txt'), join(root, 'b.txt'));
      const at = (cmd: string) => classifyReadOnlyShellCommand(cmd, { projectRoot: root, platform: 'linux' });
      expect(at('cat [!a].txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });   // selects b.txt (and c/1)
      expect(at('cat [^a].txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat [!bc1].txt')).toMatchObject({ readOnly: true, paths: ['.'] });                     // only a.txt
      expect(at('cat [a-b].txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });   // range reaches b.txt
      expect(at('cat [c-z].txt')).toMatchObject({ readOnly: true });
      expect(at('cat [[:digit:]].txt')).toMatchObject({ readOnly: true });
      expect(at('cat [[:alpha:]].txt')).toMatchObject({ readOnly: false, reasonCode: 'PATH_OUTSIDE_ROOT' });
      expect(at('cat []]x.txt')).toMatchObject({ readOnly: true });                                      // leading ] is literal
      expect(at('cat [[=a=]].txt')).toMatchObject({ readOnly: false, reasonCode: 'GLOB_UNSUPPORTED' });
      expect(at('cat [[.a.]].txt')).toMatchObject({ readOnly: false, reasonCode: 'GLOB_UNSUPPORTED' });
      expect(at('cat [[:nope:]].txt')).toMatchObject({ readOnly: false, reasonCode: 'GLOB_UNSUPPORTED' });
      expect(at('cat [z-a].txt')).toMatchObject({ readOnly: false, reasonCode: 'GLOB_UNSUPPORTED' });
      expect(at('cat [abc.txt')).toMatchObject({ readOnly: false, reasonCode: 'GLOB_EXPANSION' });       // unterminated [ = literal name, no such file
      expect(classifyReadOnlyShellCommand('cat [[=a=]].txt', { projectRoot: '/__deckent_7111_not_on_disk__/p' })).toMatchObject({ readOnly: false, reasonCode: 'GLOB_UNSUPPORTED' });
      await unlink(join(root, 'b.txt'));
    } finally { await rm(base, { recursive: true, force: true }); }
  });
});
