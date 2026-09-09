// tests/core/readonly-canonical-path.test.ts
// ═══ 7111-b — Astra post-landing canonical-path boundaries (copied verbatim) ═══
import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyReadOnlyShellCommand } from '../../src/core/shell-readonly-classifier.js';

it('cannot silently read a protected file through an innocuous in-root symlink', async () => {
 const root = await mkdtemp(join(tmpdir(),'astra-protected-alias-'));
 try {
  await writeFile(join(root,'.env'),'DISPOSABLE_FIXTURE_ONLY');
  await symlink(join(root,'.env'),join(root,'notes.txt'));
  expect(classifyReadOnlyShellCommand('cat notes.txt',{projectRoot:root}).readOnly).toBe(false);
 } finally { await rm(root,{recursive:true,force:true}); }
});
it('glob expansion cannot silently follow an outside-root symlink', async () => {
 const base = await mkdtemp(join(tmpdir(),'astra-glob-alias-'));
 try {
  const root = join(base,'project'); await mkdir(root);
  await writeFile(join(base,'outside.txt'),'DISPOSABLE_FIXTURE_ONLY');
  await symlink(join(base,'outside.txt'),join(root,'notes.txt'));
  expect(classifyReadOnlyShellCommand('cat *.txt',{projectRoot:root}).readOnly).toBe(false);
 } finally { await rm(base,{recursive:true,force:true}); }
});
