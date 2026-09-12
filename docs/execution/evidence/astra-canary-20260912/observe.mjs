import {readCanonicalRunStatus} from '/home/alperen/deckent-dev/dist/core/run-status-authority.js';
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
const root=process.cwd();
const taskFiles=readdirSync('.tasks').filter(n=> /^(?:task-|sprint-)75[1-9](?:[.-]|$)/.test(n)).map(n=>{const p='.tasks/'+n;const b=readFileSync(p);let v;try{v=JSON.parse(b.toString())}catch{};return {path:p,bytes:b.length,modifiedAt:statSync(p).mtime.toISOString(),...(v?{fields:Object.fromEntries(['id','status','model','provider','attemptId','workerId','sprintId','phase','skills','startedAt','completedAt','verdict'].filter(k=>v[k]!==undefined).map(k=>[k,v[k]]))}:{})}});
const pidFiles=existsSync('.deckent/pids')?readdirSync('.deckent/pids').filter(n=>/^(?:task-|sprint-)75[1-9](?:[.-]|$)/.test(n)):[];
console.log(JSON.stringify({observedAt:new Date().toISOString(),authority:readCanonicalRunStatus(root),taskFiles,pidFiles}));
