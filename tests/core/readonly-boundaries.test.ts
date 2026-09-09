// tests/core/readonly-boundaries.test.ts
// ═══ 7111 — independent fail-closed boundaries (Astra review, 2026-09-09) ═══
// Copied verbatim from the reviewer's fixture; assertions intentionally kept.
// Real bash + sort are spawned inside disposable tmpdirs only (async spawn).
import { describe, it, expect } from 'vitest';
import { classifyReadOnlyShellCommand as classify } from '../../src/core/shell-readonly-classifier.js';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

describe('Astra independent fail-closed boundaries', () => {
  it.each([
    'sed -n 1p f; rm -rf x', 'cat f > g', 'grep x $(rm y)', 'find . -exec echo x ;',
    `awk 'BEGIN {system("true")}'`, 'git push', 'cat <<EOF\nx\nEOF', 'cat f &>g', 'cat f 2>&1 | tee g',
    'cat ../outside', 'cat .env', 'cat .brain/memory.db', 'cat .git/config',
  ])('refuses %s', (command) => expect(classify(command, {projectRoot:'/project'}).readOnly).toBe(false));
  it('refuses PowerShell output', () => expect(classify('Get-Content f | Out-File g', {dialect:'powershell',projectRoot:'C:\\project'}).readOnly).toBe(false));
  it.each([`sort '--output=out' input`, `sort '-o' out input`, `sort \\-o out input`, `sort ''-o out input`])('quoted/escaped argv still contains mutating option: %s', (command) => {
    expect(classify(command, {projectRoot:'/project'}).readOnly).toBe(false);
  });
  it('PowerShell protected path comparison is case-insensitive', () => expect(classify('Get-Content .ENV', {dialect:'powershell',projectRoot:'C:\\project'}).readOnly).toBe(false));
  it('symlink inside project must not silently read outside project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'astra-scope-proof-'));
    try {
      const project = join(root, 'project');
      await mkdir(project);
      await writeFile(join(root, 'outside.txt'), 'DISPOSABLE_OUTSIDE_SCOPE_FIXTURE');
      await symlink(join(root, 'outside.txt'), join(project, 'link.txt'));
      const verdict = classify('cat link.txt', {projectRoot:project});
      let output = '';
      const code = await new Promise<number|null>((resolve,reject) => {
        const child = spawn('bash', ['-c','cat link.txt'], {cwd:project,stdio:['ignore','pipe','ignore']});
        child.stdout.on('data', bytes => { output += String(bytes); });
        child.on('error',reject);child.on('close',resolve);
      });
      expect(code).toBe(0);
      expect(output).toBe('DISPOSABLE_OUTSIDE_SCOPE_FIXTURE');
      expect(verdict.readOnly).toBe(false);
    } finally { await rm(root,{recursive:true,force:true}); }
  });
  it('POSIX sort really writes through a quoted flag (only disposable fixture)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'astra-sort-proof-'));
    try {
      await writeFile(join(root,'input'), 'b\na\n');
      const command = `sort '--output=out' input`;
      const verdict = classify(command, {projectRoot:root});
      const code = await new Promise<number|null>((resolve,reject) => {
        const child = spawn('bash', ['-c',command], {cwd:root,stdio:'ignore'});
        child.on('error',reject);child.on('close',resolve);
      });
      expect(code).toBe(0);
      expect(await readFile(join(root,'out'),'utf8')).toBe('a\nb\n');
      expect(verdict.readOnly).toBe(false);
    } finally { await rm(root, {recursive:true,force:true}); }
  });
});
