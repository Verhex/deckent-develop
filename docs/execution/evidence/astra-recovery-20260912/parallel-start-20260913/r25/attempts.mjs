import {DockerSpawnBackend} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
import {readFileSync,writeFileSync} from 'node:fs';
const b=new DockerSpawnBackend('/home/alperen/deckent-dev');const {store,policy}=b.openExactDockerRecoveryStore();
const entries=JSON.parse(readFileSync('/tmp/deckent-r25/admissions.json')).entries.filter(e=>e.ref?.identity?.taskId?.startsWith('764-'));
const original=b.exactCanonicalHostWorkAuthorityFromAccepted;
b.exactCanonicalHostWorkAuthorityFromAccepted=function(scope,exit,result,prompt){
const baseline=scope.taskSnapshot.dispatch.scopeBaselineSha256.slice(7);
writeFileSync('/tmp/deckent-r25/work-authority-diagnostic.json',JSON.stringify({utc:new Date().toISOString(),taskId:scope.identity.taskId,work:result.workAttribution,expected:{attemptId:scope.identity.attemptId,baselineSha256:baseline,baselineRef:`task-attempt-custody-provider-exit:${exit.observationReceiptDigest}#scope-baseline:sha256:${baseline}`,agent:prompt.agentId,skills:prompt.skillIds,scopeFiles:scope.taskSnapshot.material.dispatch.scope.filesWrite},actual:{diskVerified:result.diskVerified,boundaryViolations:result.boundaryViolations,promptState:result.promptDeliveryAttribution?.state,agent:result.agent,skills:result.skills,hostTerminalProjection:result.hostTerminalProjection,filesChanged:result.filesChanged,totalLinesAdded:result.totalLinesAdded,totalLinesRemoved:result.totalLinesRemoved}},null,2));
return original.call(this,scope,exit,result,prompt);};
const result=[];
for(const e of entries){const r={taskId:e.ref.identity.taskId,dispatch:e.reservation.dispatchRequestId};try{const x=store.withVerifiedReadSnapshot({maxEntries:100000,maxBytes:64*1024*1024,maxDurationMs:10000},()=>({authority:store.readDispatchAuthority({admissionRef:e.ref,policy}),resolved:b.inspectAdmissionResolvedForPlanning(store,policy,e)}));Object.assign(r,x.value)}catch(error){r.error={code:error.code,message:error.message,stack:error.stack}}result.push(r);}
writeFileSync('/tmp/deckent-r25/attempts.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
