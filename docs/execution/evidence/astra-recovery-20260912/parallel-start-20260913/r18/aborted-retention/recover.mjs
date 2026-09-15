// Bounded owner-authorized ADR-D-007 operator recovery, not an automatic product path.
// Leaves native entries untouched. Never creates accepted results or effect-complete receipts.
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, readdirSync, readlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join, basename} from 'node:path';
import {pathToFileURL} from 'node:url';
const specPath=process.argv[2];
const execute=process.argv[3]==='--execute';
const specBytes=readFileSync(specPath);const spec=JSON.parse(specBytes);
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=x=>Array.isArray(x)?`[${x.map(canonical).join(',')}]`:x!==null&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')}}`:JSON.stringify(x);
const digest=(domain,x)=>'sha256:'+sha(domain+'\0'+canonical(x));
const checkDigest=(x,key,domain)=>{const {[key]:actual,...body}=x;assert.equal(actual,digest(domain,body));};
const moduleAt=p=>import(pathToFileURL(join(spec.root,p)).href);
const {checkProjectMaintenanceLock,recoverQuarantinedExecutionLock}=await moduleAt('dist/core/file-lock.js');
const {readCanonicalRunStatus}=await moduleAt('dist/core/run-status-authority.js');
const {readSprintTerminalReceiptSummary}=await moduleAt('dist/core/sprint-terminal-publication-status.js');
const {loadExecAuthorityNative}=await moduleAt('dist/core/exec-authority-native.js');
const n=loadExecAuthorityNative();assert.equal(n.available,true);assert.equal(typeof n.effect.openRoot,'function');
const effect=n.effect;const pinned=effect.openRoot('PROJECT',spec.root);
const lock=checkProjectMaintenanceLock(spec.root);assert.equal(lock.state,'quarantined');
const expectedQuarantine=canonical(lock.quarantine);
const out=dirname(specPath);
function prove(q){
 assert.equal(canonical(q),expectedQuarantine);
 assert.equal(process.platform,'linux','this bounded operator verifier supports Linux/WSL identity only; other platforms HOLD');
 assert.equal(q.lock.hostInstanceId,sha(readFileSync('/etc/machine-id','utf8').trim()));
 assert.equal(q.lock.bootSessionId,sha(readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()+':'+readlinkSync('/proc/self/ns/pid')));
 const freshRoot=effect.openRoot('PROJECT',spec.root);
 try{assert.equal(freshRoot.identityDigest,pinned.identityDigest)}finally{effect.closeHandle(freshRoot.handle)}
 assert.equal(q.state,'quarantined');assert.equal(q.reason,'partial-mutation');
 assert(Date.now()>Date.parse(q.lock.renewedAt)+q.lock.leaseDurationMs);
 let dead=false;try{process.kill(q.lock.pid,0)}catch(e){assert.equal(e.code,'ESRCH');dead=true}assert(dead,'owner must be provably absent');
 const status=readCanonicalRunStatus(spec.root,{sprintIdHint:spec.sprintId});
 assert.equal(status.sprintId,spec.sprintId);assert.equal(status.lifecycle,'ABORTED');assert.equal(status.active,false);assert.equal(status.coordinator,'absent');assert.deepEqual(status.conflicts,[]);
 const {receipt,conflict}=readSprintTerminalReceiptSummary(spec.root,spec.sprintId);assert(!conflict);assert.equal(receipt.terminalOutcome,'ABORTED');
 const docs=spec.files.map(f=>{const b=readFileSync(f.path);assert.equal(sha(b),f.sha256);return JSON.parse(b)});
 const prepared=docs.find(x=>x.phase==='PREPARED');const applying=docs.find(x=>x.phase==='APPLYING');const locator=docs.find(x=>x.kind==='execution-effect-landing-locator');
 assert(prepared&&applying&&locator);const steps=docs.filter(x=>x.phase==='STEP').sort((a,b)=>a.index-b.index);
 assert.equal(docs.length,steps.length+3); // no unexplained terminal or suffix record
 assert.deepEqual(readdirSync(dirname(spec.files[0].path)).filter(x=>x.endsWith('.bin')).sort(),spec.files.map(f=>basename(f.path)).sort());
 checkDigest(prepared,'recordDigest','execution-effect-landing-prepared-journal-v1');
 checkDigest(applying,'recordDigest','execution-effect-landing-applying-journal-v1');
 checkDigest(locator,'locatorDigest','execution-effect-landing-locator-v1');
 checkDigest(prepared.transaction,'transactionDigest','execution-effect-landing-transaction-v1');
 assert.equal(prepared.transaction.taskId,spec.taskId);assert.equal(prepared.transaction.attemptId,spec.attemptId);assert.equal(prepared.transaction.transactionDigest,spec.transactionDigest);
 assert.equal(prepared.transaction.projectId,sha(spec.root));
 assert.equal(locator.preparedJournalDigest,prepared.recordDigest);assert.equal(locator.preparedJournalContentDigest,'sha256:'+sha(readFileSync(spec.files.find(f=>JSON.parse(readFileSync(f.path)).phase==='PREPARED').path)));
 assert.equal(applying.preparedJournalDigest,prepared.recordDigest);assert.equal(applying.transactionDigest,spec.transactionDigest);assert.equal(applying.boundary.boundaryId,q.quarantineId);
 assert(q.evidenceRefs.includes('effect-transaction:'+spec.transactionDigest));assert(q.evidenceRefs.includes('prepared-journal:'+prepared.recordDigest));assert(q.evidenceRefs.includes('effect-boundary:'+applying.boundary.boundaryReceiptDigest));
 assert(steps.length>0&&steps.length<prepared.operations.length);
 let previous=applying.recordDigest;const retained=[];
 for(const [i,step] of steps.entries()){
  checkDigest(step,'recordDigest','execution-effect-landing-step-journal-v1');
  assert.equal(step.index,i);assert.equal(step.previousJournalDigest,previous);assert.equal(step.transactionDigest,spec.transactionDigest);assert.equal(step.preparedJournalDigest,prepared.recordDigest);assert.equal(step.applyingJournalDigest,applying.recordDigest);
  const op=prepared.operations[i];assert.equal(op.kind,'ADD_DIRECTORY');assert.equal(op.index,i);assert.equal(step.operationDigest,op.operationDigest);assert.equal(step.nativeReceipt.operationDigest,op.operationDigest);assert.equal(step.nativeReceipt.state,'APPLIED');
  assert.equal(op.entryPreimages.length,1);assert.equal(op.entryPreimages[0].entry.state,'ABSENT');assert.equal(step.nativeReceipt.entryPostimages.length,1);
  const expected=step.nativeReceipt.entryPostimages[0];assert.equal(expected.path,op.path);
  const actual=effect.inspectEntry(pinned.handle,op.path).entry;
  assert.equal(actual.kind,'DIRECTORY');assert.equal(actual.objectIdentityDigest,expected.entry.objectIdentityDigest);assert.equal(parseInt(actual.mode,8),expected.entry.entry.mode);
  for(const p of op.parentAuthorities){
   const found=effect.inspectEntry(pinned.handle,p.path).entry;
   const id=p.source==='PREPARED_PREIMAGE'?p.entry.objectIdentityDigest:retained[p.operationIndex]?.objectIdentityDigest;
   assert.equal(found.objectIdentityDigest,id);
  }
  retained.push(actual);previous=step.recordDigest;
 }
 const unexecuted=[];
 for(const op of prepared.operations.slice(steps.length)){
  assert.equal(op.kind,'ADD');assert.equal(op.entryPreimages.length,1);assert.equal(op.entryPreimages[0].entry.state,'ABSENT');
  let absent=false;try{effect.inspectEntry(pinned.handle,op.path)}catch(e){assert.equal(e.code,'E_EXEC_AUTH_NATIVE_NOT_FOUND');absent=true}assert(absent,'unexecuted target exists');unexecuted.push(op.path);
 }
 // Capture each retained subtree; only the journaled derived directories may exist.
 for(const dir of retained){
  const root=effect.openRoot('PROJECT',join(spec.root,dir.path));
  try{
   const tree=effect.captureTree(root.handle,{deadlineUnixMs:Date.now()+3000,maxDepth:64,maxEntries:retained.length+1,maxFileBytes:1,maxManifestBytes:65536,maxNameBytes:255,maxPathBytes:4096,maxTotalBytes:1});
   assert.equal(tree.totalBytes,0);
   const expected=retained.filter(x=>x.path.startsWith(dir.path+'/')).map(x=>({path:x.path.slice(dir.path.length+1),id:x.objectIdentityDigest}));
   assert.deepEqual(tree.entries.map(x=>{assert.equal(x.kind,'DIRECTORY');return {path:x.path,id:x.objectIdentityDigest}}).sort((a,b)=>a.path.localeCompare(b.path)),expected.sort((a,b)=>a.path.localeCompare(b.path)));
  }finally{effect.closeHandle(root.handle)}
 }
 return {kind:'aborted-empty-directory-retention',projectRootIdentityDigest:pinned.identityDigest,scopeDigest:'sha256:'+sha(specBytes),quarantineDigest:'sha256:'+sha(JSON.stringify(q)),terminalReceipt:receipt,transactionDigest:spec.transactionDigest,preparedJournalDigest:prepared.recordDigest,lastStepDigest:previous,retainedDirectories:retained,unexecutedTargets:unexecuted};
}
try{
 const proof=prove(lock.quarantine);const proofDigest='sha256:'+sha(canonical(proof));
 const attestation={schemaVersion:1,quarantineId:lock.quarantine.quarantineId,fencingToken:lock.lock.fencingToken,operatorId:spec.operatorId,justification:'Owner-authorized ADR-D-007: ABORTED execution, retain verified empty derived directories only; no result acceptance, no replay, no completion.',evidenceRefs:[proofDigest,'effect-transaction:'+spec.transactionDigest,'scope:sha256:'+sha(specBytes)].sort(),attestedAt:new Date().toISOString()};
 const verifier=({attestation:a,quarantine:q,quarantineDigest:d})=>{
  try{return canonical(a)===canonical(attestation)&&d===sha(JSON.stringify(q))&&'sha256:'+sha(canonical(prove(q)))===proofDigest}catch{return false}
 };
 assert.equal(verifier({attestation,quarantine:lock.quarantine,quarantineDigest:sha(JSON.stringify(lock.quarantine))}),true);
 assert.equal(verifier({attestation:{...attestation,operatorId:'wrong'},quarantine:lock.quarantine,quarantineDigest:sha(JSON.stringify(lock.quarantine))}),false);
 assert.equal(verifier({attestation,quarantine:{...lock.quarantine,quarantineId:'wrong'},quarantineDigest:'wrong'}),false);
 writeFileSync(join(out,'proof.json'),JSON.stringify({utc:new Date().toISOString(),proofDigest,proof,attestation,negativeControls:'2/2 rejected'},null,2));
 if(execute){
  const result=recoverQuarantinedExecutionLock(spec.root,lock.lock,attestation,{recoveryAttestationVerifier:verifier});
  writeFileSync(join(out,'recovery-result.json'),JSON.stringify({utc:new Date().toISOString(),result,after:checkProjectMaintenanceLock(spec.root)},null,2));
  console.log(JSON.stringify({state:'RECOVERED',action:result.audit.action,projectionCleanup:result.projectionCleanup,after:checkProjectMaintenanceLock(spec.root).state}));
 }else console.log(JSON.stringify({state:'VERIFIED_READ_ONLY',proofDigest,retainedDirectories:proof.retainedDirectories.length,unexecutedTargets:proof.unexecutedTargets.length}));
}finally{effect.closeHandle(pinned.handle)}
