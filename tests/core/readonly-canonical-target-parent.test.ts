// tests/core/readonly-canonical-target-parent.test.ts
// ═══ 7111-b rev2 — Astra post-check: symlink-target parents + bracket negation (verbatim) ═══
import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifyReadOnlyShellCommand as classify } from '../../src/core/shell-readonly-classifier.js';
it('walks parent components introduced by a symlink target', async()=>{
 const base=await mkdtemp(join(tmpdir(),'astra-target-parent-'));
 try {
  const root=join(base,'project'),outside=join(base,'outside');await mkdir(root);await mkdir(outside);
  await writeFile(join(outside,'file.txt'),'DISPOSABLE_ONLY');
  await symlink(outside,join(root,'dirlink'));
  await symlink('dirlink/file.txt',join(root,'notes.txt'));
  expect(await readFile(join(root,'notes.txt'),'utf8')).toBe('DISPOSABLE_ONLY');
  expect(classify('cat notes.txt',{projectRoot:root}).readOnly).toBe(false);
 }finally{await rm(base,{recursive:true,force:true});}
});
it('POSIX bracket negation cannot hide an outside-root match', async()=>{
 const base=await mkdtemp(join(tmpdir(),'astra-negated-glob-'));
 try {
  const root=join(base,'project');await mkdir(root);
  await writeFile(join(root,'a.txt'),'SAFE');await writeFile(join(base,'outside.txt'),'DISPOSABLE_ONLY');
  await symlink(join(base,'outside.txt'),join(root,'b.txt'));
  expect(classify('cat [!a].txt',{projectRoot:root}).readOnly).toBe(false);
 }finally{await rm(base,{recursive:true,force:true});}
});
