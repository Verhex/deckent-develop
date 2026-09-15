// Isolated compiled-ingress probe. Fixtures are NOT product executions or receipts.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
const dist = resolve(process.argv[2]);
const mod = p => import(pathToFileURL(join(dist, p)).href);
const { publishCanonicalRunStatusReadModel } = await mod('core/run-status-read-model.js');
const { readCanonicalRunStatus } = await mod('core/run-status-authority.js');
const { reconcileStatusResponse } = await mod('api/status-reconcile.js');
const { registerStatusTool } = await mod('mcp/tools/status.js');
const { readLiveFooterState } = await mod('cli/helpers/run-state-feed.js');
const root = mkdtempSync(join(tmpdir(), 'deckent-r9-status-'));
const write = (p,v) => { mkdirSync(join(root,p,'..'), {recursive:true}); writeFileSync(join(root,p), JSON.stringify(v)); };
const tasks = Array.from({length:8},(_,i)=>({id:`900-${i+1}`,sprintId:'sprint-900',title:`fixture-${i+1}`,description:'isolated projection fixture',status:i===1?'DONE':i<3?'EXECUTING':'PENDING',dependencies:[],scope:{filesRead:[],filesWrite:[]},createdAt:'2026-09-13T00:00:00.000Z',updatedAt:'2026-09-13T00:00:00.000Z'}));
const report = {at:new Date().toISOString(),kind:'compiled-isolated-ingress-not-live-dogfood',cases:[]};
async function cli() {
 return await new Promise((ok,bad)=>{
  const p=spawn(process.execPath,[join(dist,'cli/entry.js'),'status','--json'],{cwd:root,stdio:['ignore','pipe','pipe']}); let stdout='',stderr='';
  p.stdout.on('data',c=>stdout+=c);p.stderr.on('data',c=>stderr+=c);
  const timer=setTimeout(()=>{p.kill('SIGTERM');bad(new Error('probe CLI timeout'));},60000);
  p.on('error',e=>{clearTimeout(timer);bad(e)});
  p.on('close',code=>{clearTimeout(timer);try {ok({code,payload:JSON.parse(stdout),stderr});}catch{bad(new Error(JSON.stringify({code,stdout,stderr})))} });
 });
}
async function sample(label) {
 const c=await cli();const a=reconcileStatusResponse(root,null);
 let handler;registerStatusTool({registerTool:(_n,_c,h)=>handler=h});
 const cwd=process.cwd();let m;
 try{process.chdir(root);m=JSON.parse((await handler({json:true})).content[0].text);}finally{process.chdir(cwd)}
 const terminal=readLiveFooterState({projectRoot:root});
 report.cases.push({label,cli:c,api:a,mcp:m,terminal});
}
try {
 write('.deckent/sprint-state.json',{sprintId:'sprint-900',status:'ACTIVE',phase:'EXECUTE',taskIds:tasks.map(t=>t.id)});
 write('.deckent/pids/sprint-900.pid',{pid:process.pid,leaseId:'probe-current',startedAt:new Date().toISOString()});
 publishCanonicalRunStatusReadModel(root,{coordinatorSnapshot:{sprintId:'sprint-900',runGeneration:'lease:probe-current',tasks,heldTaskIds:['900-1']}});
 await sample('no-task-or-dashboard-files');
 for(const task of tasks.slice(0,3))write(`.tasks/task-${task.id}.json`,{...task,status:'EXECUTING'});
 write('.dashboard',{sprint:{id:'sprint-900',phase:'EXECUTE',status:'ACTIVE'},agents:[],progress:{done:0,active:3,blocked:0,total:3},alerts:[],updatedAt:new Date().toISOString()});
 await sample('three-stale-task-files');
 write('.deckent/pids/sprint-900.pid',{pid:process.pid,leaseId:'probe-successor',startedAt:new Date().toISOString()});
 await sample('successor-lease-same-authority');
 console.log(JSON.stringify(report,null,2));
 for(const row of report.cases.slice(0,2)) {
  if(row.cli.code!==0)throw new Error('CLI nonzero');
  for(const name of ['cli','api','mcp']) {
   const value=name==='cli'?row.cli.payload:row[name];
   if(value.progress?.total!==8 || value.progress?.done!==1 || value.progress?.active!==1 || value.progress?.blocked!==6)throw new Error(`${row.label}: ${name} lost canonical progress`);
  }
 }
 for(const name of ['cli','api','mcp','terminal']) {
  const row=report.cases[2]; const value=name==='cli'?row.cli.payload:row[name];
  if(value.statusReadModel?.state==='persisted')throw new Error(`${name} accepted old lease`);
  if(name!=='terminal' && value.progress != null)throw new Error(`${name} exposed stale progress`);
 }
} finally {rmSync(root,{recursive:true,force:true});}
