import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const [binaryRoot, projectRoot, dispatchRequestId, transactionDigest, recoveryFile] = process.argv.slice(2);
const moduleAt = p => import(pathToFileURL(`${binaryRoot}/dist/${p}.js`).href);
const {DockerSpawnBackend} = await moduleAt('orchestra/spawn-backend-docker');
const {loadExecAuthorityNative} = await moduleAt('core/exec-authority-native');
const {readRecoveredExecutionLockBoundary} = await moduleAt('core/file-lock');
const {readCanonicalRunStatus} = await moduleAt('core/run-status-authority');
const backend = new DockerSpawnBackend(projectRoot);
// Diagnostic access to existing compiled read methods; no replacement policy,
// mutation call, recovery dispatch, or startup readiness claim.
const {store,policy} = backend.openExactDockerRecoveryStore();
const admitted=store.readDispatchAdmission({dispatchRequestId,policy});assert.equal(admitted.state,'admitted');
const scope=backend.reconstructExactDockerRecoveryScope(store,policy,admitted);
const adapter=backend.exactCommittedUnsettledSemanticAdapter(scope);
const start=performance.now();
const snapshot=store.withVerifiedReadSnapshot({maxEntries:100000,maxBytes:64*1024*1024,maxDurationMs:10000},()=>adapter.readPartialLandingJournal(transactionDigest));
const proof=snapshot.value;assert.equal(proof?.state,'PARTIAL_JOURNAL');
const historical=JSON.parse(readFileSync(recoveryFile,'utf8')).result;
const recovery=readRecoveredExecutionLockBoundary(projectRoot,historical.recovered.lock,proof.applying.boundary.boundaryId);
assert(recovery);assert.deepEqual(recovery.audit,historical.audit);
assert(recovery.recovered.evidenceRefs.includes(`effect-transaction:${transactionDigest}`));
assert(recovery.recovered.evidenceRefs.includes(`prepared-journal:${proof.prepared.recordDigest}`));
assert(recovery.recovered.evidenceRefs.includes(`effect-boundary:${proof.applying.boundary.boundaryReceiptDigest}`));
const loaded=loadExecAuthorityNative();assert.equal(loaded.available,true);const effect=loaded.effect;
const pinned=effect.openRoot('PROJECT',projectRoot);const retained=[];const unapplied=[];
try{
 for(const step of proof.steps){
  const op=proof.prepared.operations[step.index];assert.equal(op.kind,'ADD_DIRECTORY');assert(op.derivedParent);
  const expected=step.nativeReceipt.entryPostimages[0];assert.equal(expected.path,op.path);
  const actual=effect.inspectEntry(pinned.handle,op.path).entry;
  assert.equal(actual.kind,'DIRECTORY');assert.equal(actual.objectIdentityDigest,expected.entry.objectIdentityDigest);
  assert.equal(parseInt(actual.mode,8),expected.entry.entry.mode);
  for(const parent of op.parentAuthorities){
   const found=effect.inspectEntry(pinned.handle,parent.path).entry;
   const identity=parent.source==='PREPARED_PREIMAGE'?parent.entry.objectIdentityDigest:retained[parent.operationIndex]?.objectIdentityDigest;
   assert.equal(found.objectIdentityDigest,identity);
  }
  retained.push(actual);
 }
 for(const op of proof.prepared.operations.slice(proof.steps.length)){
  assert.equal(op.kind,'ADD');assert.equal(op.entryPreimages[0].entry.state,'ABSENT');
  assert.throws(()=>effect.inspectEntry(pinned.handle,op.path), e=>e.code==='E_EXEC_AUTH_NATIVE_NOT_FOUND');unapplied.push(op.path);
 }
 for(const dir of retained){
  const sub=effect.openRoot('PROJECT',`${projectRoot}/${dir.path}`);
  try{
   const tree=effect.captureTree(sub.handle,{deadlineUnixMs:Date.now()+3000,maxDepth:64,maxEntries:retained.length+1,maxFileBytes:1,maxManifestBytes:65536,maxNameBytes:255,maxPathBytes:4096,maxTotalBytes:1});
   assert.equal(tree.totalBytes,0);
   const actual=tree.entries.map(x=>{assert.equal(x.kind,'DIRECTORY');return {path:x.path,id:x.objectIdentityDigest}});
   const expected=retained.filter(x=>x.path.startsWith(dir.path+'/')).map(x=>({path:x.path.slice(dir.path.length+1),id:x.objectIdentityDigest}));
   assert.deepEqual(actual.sort((a,b)=>a.path.localeCompare(b.path)),expected.sort((a,b)=>a.path.localeCompare(b.path)));
  }finally{effect.closeHandle(sub.handle)}
 }
}finally{effect.closeHandle(pinned.handle)}
const status=readCanonicalRunStatus(projectRoot,{sprintIdHint:historical.recovered.lock.taskId});assert.equal(status.active,false);assert.equal(status.lifecycle,'ABORTED');
console.log(JSON.stringify({utc:new Date().toISOString(),elapsedMs:performance.now()-start,taskId:admitted.ref.identity.taskId,transactionDigest,journalEvidenceDigest:proof.evidenceDigest,appliedStepCount:proof.steps.length,operationCount:proof.prepared.operations.length,retained,unapplied,recoveredAuditEventId:recovery.audit.eventId,statistics:snapshot.statistics,status:status.lifecycle,disposition:'HOLD: no partial-effect retention published'},null,2));
