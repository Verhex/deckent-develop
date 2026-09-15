import assert from 'node:assert/strict';
import {DockerSpawnBackend} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
import {readCanonicalRunStatus} from '/home/alperen/deckent-dev/dist/core/run-status-authority.js';
import {withExecutionLock,assertExecutionLockAuthority,PROJECT_MAINTENANCE_LOCK_TASK_ID} from '/home/alperen/deckent-dev/dist/core/file-lock.js';
import {readFileSync,writeFileSync} from 'node:fs';
const root='/home/alperen/deckent-dev';const b=new DockerSpawnBackend(root);const {store,policy}=b.openExactDockerRecoveryStore();
const prior=JSON.parse(readFileSync('/tmp/deckent-r25/admissions.json')).entries.find(e=>e.ref?.identity?.taskId==='764-002');
const verify=()=>{const status=readCanonicalRunStatus(root,{sprintIdHint:'sprint-764'});assert.equal(status.lifecycle,'ABORTED');assert.equal(status.active,false);assert.equal(status.coordinator,'absent');assert.equal(status.sprintId,'sprint-764');assert.deepEqual(status.conflicts,[]);return status;};
const admitted=store.readDispatchAdmission({dispatchRequestId:prior.reservation.dispatchRequestId,policy});assert.equal(admitted.ref.refDigest,prior.ref.refDigest);
const scope=b.reconstructExactDockerRecoveryScope(store,policy,admitted);const adapter=b.exactCommittedUnsettledSemanticAdapter(scope);const progress=adapter.readLatestReleaseProgress();assert.equal(progress.state,'DEPENDENCY_VOLUME_DELETE_INTENT');assert.equal(progress.progressDigest,'sha256:19ca4a8f2b931ee5dbf676d66a73400dd2dfce420105a6be0c29a8e8b53184c5');
const recovery=adapter.readReleaseRecoveryAuthority();assert(recovery);const before={utc:new Date().toISOString(),status:verify(),progress,transaction:recovery.landingReceipt.transaction};writeFileSync('/tmp/deckent-r27/release-before.json',JSON.stringify(before,null,2));
if(process.argv.includes('--apply')){
const result=await withExecutionLock(root,PROJECT_MAINTENANCE_LOCK_TASK_ID,'maintenance',async lock=>{verify();assertExecutionLockAuthority(root,lock);const accepted=await b.resumeExactDockerEffectRelease(scope);assert(accepted,'existing release replay returned HOLD');assertExecutionLockAuthority(root,lock);return {utc:new Date().toISOString(),binding:accepted.binding,projection:accepted.projection,status:verify()};});
writeFileSync('/tmp/deckent-r27/release-after.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}else console.log(JSON.stringify({utc:before.utc,eligible:true,phase:progress.state,transaction:before.transaction}));
