import {DockerSpawnBackend} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
import {readFileSync,writeFileSync} from 'node:fs';
const b=new DockerSpawnBackend('/home/alperen/deckent-dev');const {store,policy}=b.openExactDockerRecoveryStore();
const entries=JSON.parse(readFileSync('/tmp/deckent-r29/admissions.json')).entries.filter(e=>e.ref?.identity?.taskId?.startsWith('766-'));
const result=[];
for(const e of entries){const r={taskId:e.ref.identity.taskId,dispatch:e.reservation.dispatchRequestId};try{const x=store.withVerifiedReadSnapshot({maxEntries:100000,maxBytes:64*1024*1024,maxDurationMs:10000},()=>({authority:store.readDispatchAuthority({admissionRef:e.ref,policy}),resolved:b.inspectAdmissionResolvedForPlanning(store,policy,e)}));Object.assign(r,x.value)}catch(error){r.error={code:error.code,message:error.message,stack:error.stack}}result.push(r);}
writeFileSync('/tmp/deckent-r33/attempts-after.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
