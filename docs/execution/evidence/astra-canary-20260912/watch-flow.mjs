// Read-only canary observer. No authority, worker creation, retry or settlement.
import {readFlowEvents,loadLatestStartAttempt} from '/home/alperen/deckent-dev/dist/core/run-flow-store.js';
import {readCanonicalRunStatus} from '/home/alperen/deckent-dev/dist/core/run-status-authority.js';
import {appendFileSync,readdirSync,existsSync,readFileSync,statSync} from 'node:fs';
const flowId='963bbc69-bfff-4b5f-b5ac-6ba130853feb';const root=process.cwd();const out='/tmp/deckent-canary-astra-20260912/flow-observations.jsonl';
for(let i=0;i<120;i++){
 const events=readFlowEvents(root,flowId);const a=loadLatestStartAttempt(root,flowId);const pid=a?.process?.pid;
 let alive=false;try{if(pid){process.kill(pid,0);alive=true}}catch{}
 const log='.deckent/runtime/logs/detached/start-'+flowId+'-1789238595489.log';
 const last=events.at(-1);const row={observedAt:new Date().toISOString(),flowId,event:last?{type:last.type,sequence:last.sequence,timestamp:last.timestamp,error:last.error,reason:last.reason}:null,attempt:a?{state:a.state,attemptId:a.attemptId,pid,alive,updatedAt:a.updatedAt,settlement:a.settlement}:null,authority:readCanonicalRunStatus(root,{sprintIdHint:'sprint-751'}),taskFiles:readdirSync('.tasks').filter(n=>/^task-751-/.test(n)),logBytes:existsSync(log)?statSync(log).size:0};
 appendFileSync(out,JSON.stringify(row)+'\n');console.log(JSON.stringify({observedAt:row.observedAt,event:row.event,attempt:row.attempt,authority:{lifecycle:row.authority.lifecycle,active:row.authority.active,phase:row.authority.phase,coordinator:row.authority.coordinator},taskFiles:row.taskFiles,logBytes:row.logBytes}));
 if(last&&['RUN_COMPLETED','RUN_FAILED','FLOW_ABORTED','RUN_PAUSED'].includes(last.type))break;
 if(!alive)break;
 await new Promise(r=>setTimeout(r,30000));
}
