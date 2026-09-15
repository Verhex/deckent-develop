import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {DockerSpawnBackend} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
import {TaskAttemptCustodyStore} from '/home/alperen/deckent-dev/dist/core/task-attempt-custody-store.js';
const counts=new Map();
for(const name of Object.getOwnPropertyNames(TaskAttemptCustodyStore.prototype)) {
if(!name.startsWith('read') && !['requireCompletedDurableEffect','requireAcceptedResultLandingBinding'].includes(name)) continue;
const descriptor=Object.getOwnPropertyDescriptor(TaskAttemptCustodyStore.prototype,name);
if(typeof descriptor.value!=='function')continue;
const original=descriptor.value;
Object.defineProperty(TaskAttemptCustodyStore.prototype,name,{...descriptor,value:function(...args){const row=counts.get(name)??{count:0,inclusiveMs:0};counts.set(name,row);row.count++;const t=performance.now();try{return Reflect.apply(original,this,args);}finally{row.inclusiveMs+=performance.now()-t;}}});
}
const observed=JSON.parse(readFileSync('/tmp/deckent-r14-evidence/dogfood/fix-observation.json','utf8'));
const checkpoint=observed.files.find(x=>x.path.endsWith('sprint-760-checkpoint.json')).content;
const expected=checkpoint.taskStates.find(x=>x.id==='760-001').exactTerminalAuthority;
const backend=new DockerSpawnBackend('/home/alperen/deckent-dev');const opened=backend.openExactDockerRecoveryStore();if(!opened)throw Error('store-unavailable');backend.openExactDockerRecoveryStore=()=>opened;
const startedAt=new Date().toISOString(), start=performance.now(),cpu=process.cpuUsage();
let result,stats,error;try {const measured=opened.store.withVerifiedReadSnapshot({maxEntries:100000,maxBytes:64*1024*1024,maxDurationMs:10000},()=>backend.readExactDockerAcceptedTaskTerminalAuthority({expectedAcceptedAuthority:expected.acceptedAuthority,expectedTerminalAuthority:expected}));result=measured.value;stats=measured.statistics;}catch(e){result={state:'hold'};error={name:e.name,reasonCode:e.reasonCode??e.code??null,message:e.message};}
const output={snapshotStatistics:stats??null,error:error??null,storeReadCounts:Object.fromEntries(counts),startedAt,endedAt:new Date().toISOString(),elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),maxRSSKiB:process.resourceUsage().maxRSS,state:result.state,reason:result.reasonCode??null,verdict:result.evaluationReceipt?.verdict??null,kind:'readonly-production-terminal-authority-single-call'};
writeFileSync('/tmp/deckent-760-followup/terminal-authority-snapshot.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));process.exitCode=result.state==='current'?0:1;
