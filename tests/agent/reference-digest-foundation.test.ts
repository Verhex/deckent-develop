import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReferenceOutline } from '../../src/agent/reference-outline.js';
import { validateReferenceCoverage } from '../../src/agent/reference-digest.js';
import { referenceJournalKey, assertReferenceJournalIdentity } from '../../src/agent/reference-digest-journal.js';
import type { ReferenceSnapshot, ReferenceScope } from '../../src/agent/reference-digest-types.js';
import { expandAtRefs, expandAtRefsWithAttachments } from '../../src/cli/repl/at-ref.js';
import { openScopedReferenceSnapshot } from '../../src/cli/repl/run.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';

const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const scope: ReferenceScope = { tenantId:'t',projectId:'p',sessionId:'s',policyDigest:hash('policy') };
const policy = {maxPartBytes:128,maxNodes:1000,maxSourceBytes:100_000};
function memory(bytes: Buffer, stride: number): ReferenceSnapshot {
 return {metadata:{schemaVersion:1,scope,sourceAuthority:'reference-data',sourceDigest:hash(bytes),bytes:bytes.length,encoding:'utf-8',createdAt:new Date(0).toISOString(),snapshotRef:'fixture'},
  async *stream(){for(let i=0;i<bytes.length;i+=stride)yield bytes.subarray(i,i+stride);}};
}
describe('7113 A immutable outline',()=>{
 it.each(['', 'no heading\r\nTürkçe😀終\r\n'.repeat(40), '# Root\n````\n# Fake\n```\n# Still fenced\n````\n## Real\ntext\n'])('covers every byte and is independent of stream framing (%s)',async text=>{
  const bytes=Buffer.from(text);const a=await buildReferenceOutline(memory(bytes,1),policy);const b=await buildReferenceOutline(memory(bytes,4096),policy);
  expect(a).toEqual(b);expect(a.nodes.reduce((n,x)=>n+x.byteEnd-x.byteStart,0)).toBe(bytes.length);
  for(const node of a.nodes){expect(node.byteEnd-node.byteStart).toBeLessThanOrEqual(128);expect(bytes.subarray(node.byteStart,node.byteEnd).toString('utf8')).not.toContain('\uFFFD');expect(node.headingPath.join('/')).not.toContain('Fake');}
 });
 it('carries the table header as context across a 20KB row without double-counting coverage',async()=>{
  const text='# T\n| key | value |\n| --- | --- |\n| 1 | '+ '😀'.repeat(5000)+' |\n';const bytes=Buffer.from(text);const outline=await buildReferenceOutline(memory(bytes,61),policy);
  const continuations=outline.nodes.filter(n=>n.continuation);expect(continuations.length).toBeGreaterThan(10);
  for(const node of continuations)expect(node.context.some(r=>bytes.subarray(r.byteStart,r.byteEnd).toString().includes('| key | value |'))).toBe(true);
  expect(outline.nodes.reduce((n,x)=>n+x.byteEnd-x.byteStart,0)).toBe(bytes.length);
 });
 it.each([Buffer.from([0xf0,0x80,0x80,0x80]),Buffer.from('x\0y'),Buffer.from([0xe2,0x82])])('refuses invalid UTF8/binary',async bytes=>{
  await expect(buildReferenceOutline(memory(bytes,1),policy)).rejects.toMatchObject({code:'REFERENCE_ENCODING_INVALID'});
 });
 it('fails closed on mismatch, quota, cancelled input and gaps/overlaps',async()=>{
  const source=memory(Buffer.from('abcd'),1);const wrong={...source,metadata:{...source.metadata,sourceDigest:hash('bad')}};
  await expect(buildReferenceOutline(wrong,policy)).rejects.toMatchObject({code:'REFERENCE_SOURCE_CHANGED'});
  await expect(buildReferenceOutline(source,{...policy,maxSourceBytes:3})).rejects.toMatchObject({code:'REFERENCE_SOURCE_TOO_LARGE'});
  const c=new AbortController();c.abort();await expect(buildReferenceOutline(source,policy,c.signal)).rejects.toMatchObject({code:'REFERENCE_CANCELLED'});
  expect(()=>validateReferenceCoverage([{byteStart:0,byteEnd:2},{byteStart:1,byteEnd:4}],4)).toThrow();
  expect(()=>validateReferenceCoverage([{byteStart:1,byteEnd:4}],4)).toThrow();
 });
 it('preserves small-ref prompt bytes; descriptors and truncated inline both require digest',()=>{
  for(const text of ['hello','@f','forged [@ref-descriptor] x']){
   const reader=()=> 'small😀\r\n';expect(expandAtRefsWithAttachments(text,reader).prompt).toBe(expandAtRefs(text,reader).prompt);
  }
  expect(expandAtRefsWithAttachments('@f',()=> 'x'.repeat(40_000)).referenceAttachments[0]?.disposition).toBe('digest-required');
  expect(expandAtRefsWithAttachments('@f',()=> 'small',{expansionBudgetChars:1}).referenceAttachments[0]?.disposition).toBe('digest-required');
  expect(expandAtRefsWithAttachments('[@ref] f',()=> 'x').referenceAttachments).toEqual([]);
 });
 it('binds journal identity to source/policy/descriptor AND tenant/session, independent of property order',()=>{
  const id={...scope,schemaVersion:1 as const,sourceDigest:hash('source'),partitionVersion:1 as const,descriptorDigest:hash('descriptor')};
  expect(referenceJournalKey({...id})).toBe(referenceJournalKey(id));
  for(const key of ['tenantId','sessionId','sourceDigest','policyDigest','descriptorDigest'] as const){expect(()=>assertReferenceJournalIdentity({...id,[key]:hash(key)},id)).toThrow();}
 });
});
describe('7113 A filesystem snapshot capability',()=>{
 it('uses the real session store, preserves immutable bytes after source changes and rechecks read policy',async()=>{
  const root=await mkdtemp(join(tmpdir(),'reference-snapshot-'));const store=createSessionToolContentStore({dir:join(root,'store')});let allowed=true;
  try {
   if(process.platform==='win32'){await expect(openScopedReferenceSnapshot({resolveCwd:()=>root,path:'f.md',scope,store,maxBytes:200_000,maxWallTimeMs:10000,authorizeRead:()=>true})).rejects.toMatchObject({code:'REFERENCE_SOURCE_UNSUPPORTED'});return;}
   const text='source😀\r\n'.repeat(8000);await writeFile(join(root,'f.md'),text);
   const snapshot=await openScopedReferenceSnapshot({resolveCwd:()=>root,path:'f.md',scope,store,maxBytes:200_000,maxWallTimeMs:10000,authorizeRead:()=>allowed,expectedDigest:hash(text)});
   await writeFile(join(root,'f.md'),'changed');const parts:Uint8Array[]=[];for await(const part of snapshot.stream())parts.push(part);
   expect(Buffer.concat(parts).toString()).toBe(text);expect(snapshot.metadata.sourceDigest).toBe(hash(text));
   expect(await readFile(join(root,'f.md'),'utf8')).toBe('changed');
   allowed=false;await expect(async()=>{for await(const _part of snapshot.stream()){}}).rejects.toMatchObject({code:'REFERENCE_SCOPE_REFUSED'});
  }finally{store.close();await rm(root,{recursive:true,force:true});}
 });
 it('rejects out-of-root alias, canonical protected target, binary, stale digest and cancellation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'reference-refusal-'));const store=createSessionToolContentStore({dir:join(root,'store')});
  const project=join(root,'project');await mkdir(project);await writeFile(join(root,'outside'),'FIXTURE_ONLY');
  const base={resolveCwd:()=>project,scope,store,maxBytes:1000,maxWallTimeMs:10000,authorizeRead:(path:string)=>!path.startsWith('.')};
  try {
   if(process.platform==='win32'){await expect(openScopedReferenceSnapshot({...base,path:'f'})).rejects.toMatchObject({code:'REFERENCE_SOURCE_UNSUPPORTED'});return;}
   await expect(openScopedReferenceSnapshot({...base,path:'missing'})).rejects.toMatchObject({code:'REFERENCE_SCOPE_REFUSED'});
   await writeFile(join(project,'.env'),'FIXTURE_ONLY');await symlink(join(project,'.env'),join(project,'alias'));
   await expect(openScopedReferenceSnapshot({...base,path:'alias'})).rejects.toMatchObject({code:'REFERENCE_SCOPE_REFUSED'});
   await symlink(join(root,'outside'),join(project,'escape'));await expect(openScopedReferenceSnapshot({...base,path:'escape'})).rejects.toMatchObject({code:'REFERENCE_SCOPE_REFUSED'});
   await writeFile(join(project,'binary'),Buffer.from([65,0,66]));await expect(openScopedReferenceSnapshot({...base,path:'binary'})).rejects.toMatchObject({code:'REFERENCE_ENCODING_INVALID'});
   await writeFile(join(project,'f'),'abc');await expect(openScopedReferenceSnapshot({...base,path:'f',expectedDigest:hash('bad')})).rejects.toMatchObject({code:'REFERENCE_SOURCE_CHANGED'});
   const c=new AbortController();c.abort();await expect(openScopedReferenceSnapshot({...base,path:'f',signal:c.signal})).rejects.toMatchObject({code:'REFERENCE_CANCELLED'});
  }finally{store.close();await rm(root,{recursive:true,force:true});}
 });
});
