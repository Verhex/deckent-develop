import {buildDirectives} from '/home/alperen/deckent-dev/dist/orchestra/directives-builder.js';
import {parseStructuredDirectives,resolveTaskDependenciesLoud} from '/home/alperen/deckent-dev/dist/orchestra/task-builder.js';
import {writeFileSync} from 'node:fs';
const base='docs/execution/active/dogfood-comparison';
const specs=[
['Inventory startup authority boundaries',[]],['Inventory worker custody boundaries',[]],['Inventory result and effect boundaries',[]],['Inventory observable run boundaries',[]],
['Specify startup timing attribution',[1]],['Specify worker birth evidence',[2]],['Specify effect acceptance contract',[3]],['Specify operator state consistency',[4]],
['Compare admission and worker critical paths',[5,6]],['Compare settlement and visible completion',[7,8]],['Map restart and retained result behavior',[5,7]],['Map resource usage and task readiness',[6,8]],
['Define dependency failure propagation proof',[9,11]],['Define scope collision and derived directory proof',[9,12]],['Define archive and replay proof',[10,11]],['Define cross-surface freshness proof',[10,12]],
['Assemble execution correctness acceptance matrix',[13,14]],['Assemble settlement visibility acceptance matrix',[15,16]],['Rank repairs using both acceptance matrices',[17,18]],['Produce final evidence-linked repair decision',[19]]];
const sourceReads=['src/orchestra/sprint-controller.ts','src/orchestra/spawn-backend-docker.ts','src/orchestra/scheduler-effects.ts','src/core/run-status-read-model.ts'];
const path=n=>`${base}/twenty/task-${String(n).padStart(2,'0')}/ANALYSIS.md`;
const common='Read only declared inputs. Deliver a concise, evidence-backed specification in the exact assigned document. Cite path:line and SHA256; separate measured fact, inference and unknown. No runtime/provider calls, no source/config changes, no build, no cleanup, no commit/push. Read predecessor documents only after their accepted dependency settlement; do not invent missing inputs or claim product DONE. The document must advance MASTER3178 recovery decisions for both dogfood and product operators, with cross-platform/tenant scope. Do not repeat whole predecessor reports; synthesize only this task contribution.';
const tasks=specs.map(([title,deps],i)=>({title,desc:common,reads:[...sourceReads,...deps.map(path)],files:[path(i+1)],scope:[path(i+1).slice(0,path(i+1).lastIndexOf('/'))],deps:deps.map(n=>specs[n-1][0]),goCriteria:['Exact assigned document exists with attributable sources.','Declared predecessor inputs are cited by content digest.','Findings distinguish facts from hypotheses; no fabricated receipts or test results.'],nogo:['Missing required dependency output.','Any write outside assigned file or unsupported completion claim.']}));
const single={...tasks[2],title:'Single-worker control: result acceptance and derived directory evidence',deps:[],reads:sourceReads,files:[`${base}/single/result/ANALYSIS.md`],scope:[`${base}/single/result`]};
for(const [name,ts] of [['single',[single]],['twenty',tasks]]){
const text=buildDirectives({title:`MASTER3178 ${name} comparison`,goal:'Owner-admitted diagnostic comparison. Single-worker control first, then twenty-task DAG with max4 concurrent workers resolved through config/capacity. No implementation or product closure in this measurement wave.',tasks:ts});
const parsed=parseStructuredDirectives(text);
if(parsed.length!==ts.length)throw Error('parser cardinality mismatch');
const slots=parsed.map((t,i)=>({id:`proof-${String(i+1).padStart(3,'0')}`,title:t.title,dependencies:t.dependencies??[]}));
for(let i=0;i<slots.length;i++){
const got=resolveTaskDependenciesLoud(slots[i].id,slots[i].dependencies,slots,{strict:true});
const expected=name==='twenty'?specs[i][1].map(n=>slots[n-1].id):[];
if(JSON.stringify(got.resolved)!==JSON.stringify(expected))throw Error('dependency mismatch');
}

writeFileSync(`/tmp/deckent-r25/DIRECTIVES-${name}.md`,text);writeFileSync(`/tmp/deckent-r25/parsed-${name}.json`,JSON.stringify(parsed,null,2));}
writeFileSync('/tmp/deckent-r25/DAG.json',JSON.stringify({tasks:specs.map(([title,deps],i)=>({id:i+1,title,dependencies:deps,file:path(i+1)})),singleWorkerCount:1,twentyConcurrencyCeiling:4},null,2));
console.log(JSON.stringify({singleParsed:1,twentyParsed:20,edges:specs.reduce((n,s)=>n+s[1].length,0)}));
