import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {performance} from 'node:perf_hooks';
import {createTaskAttemptCustodyPosixAdapter} from '/home/alperen/deckent-dev/dist/core/task-attempt-custody-posix-adapter.js';
const temp=mkdtempSync(join(tmpdir(),'deckent-depth-profile-'));const rows=[];
try {const project=join(temp,'project');mkdirSync(project,{mode:0o700});const a=createTaskAttemptCustodyPosixAdapter();const root=a.openRoot({absoluteRoot:join(temp,'custody'),canonicalProjectRoot:project,projectId:'isolated-profile',create:true});
for(const depth of [1,4,12]) {const dir=Array.from({length:depth},(_,i)=>'d'+i).join('/');a.ensurePrivateDirectory(root,dir);writeFileSync(join(temp,'custody',dir,'value.bin'),'profile',{mode:0o400});const samples=[];
for(let i=0;i<5;i++){const start=performance.now();const r=a.readFirstWriter({root,relativePath:dir+'/value.bin',policy:{minBytes:1,maxBytes:64,requireSingleLink:true}});const v=a.readVerified({root,proof:r.proof,policy:{minBytes:1,maxBytes:64,requireSingleLink:true}});if(Buffer.from(v.bytes).toString()!=='profile')throw Error('mismatch');samples.push(performance.now()-start);}rows.push({depth,twoReadSamplesMs:samples});}
console.log(JSON.stringify({observedAt:new Date().toISOString(),kind:'isolated-real-native-depth-profile',platform:process.platform,arch:process.arch,rows},null,2));}finally{rmSync(temp,{recursive:true,force:true});}
