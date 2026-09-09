import {afterEach,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createPreambleBudgeter} from '../../src/agent/preamble-budget.js';
import {composeSystemPrompt,IMMUTABLE_CORE_EN} from '../../src/agent/identity.js';
import {ToolRegistry} from '../../src/agent/tools/registry.js';
import {createSessionContentStore} from '../../src/agent/tool-result-broker.js';
import {resolveNativeAgentBudget} from '../../src/core/execution-budget-policy.js';
import {createAgentSession} from '../../src/agent/session.js';
import {SAFE_DEFAULT_POLICY} from '../../src/agent/permission-policy.js';
import type {ProviderAdapter,ProviderRequest} from '../../src/agent/provider-tooluse/types.js';
const roots:string[]=[];
afterEach(()=>{for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true});});
function fixture(){
 const cwd=mkdtempSync(join(tmpdir(),'preamble-'));roots.push(cwd);mkdirSync(join(cwd,'.deckent','workspace'),{recursive:true});
 writeFileSync(join(cwd,'DECKENT.md'),'# Repository instructions\n'+'policy reference '.repeat(2500));
 writeFileSync(join(cwd,'.deckent','workspace','IDENTITY.md'),'# Project identity\n'+'context data '.repeat(120));
 const registry=new ToolRegistry();
 for(const name of ['deckent_search_tools','deckent_describe_tool','deckent_call_tool','read','list','grep'])registry.register({name,description:name.startsWith('deckent_')?'catalog':name+' '+ 'schema description '.repeat(350),inputSchema:{type:'object'},category:'coding',tier:'silent',source:'builtin',exposure:name.startsWith('deckent_')?'core':'discoverable',handler:async()=>({ok:true,output:'ok'})});
 const store=createSessionContentStore({dir:join(cwd,'content')});
 const adapter:ProviderAdapter={name:'fixture-preamble',async *send(){yield {type:'done'};}};
 const input={compose:{cwd,lang:'en' as const},tools:registry.toNativeSchemas(),adapter,model:'fixture',window:131072,outputCeilingTokens:4096};
 return {cwd,registry,store,adapter,input};
}
it('reduces references then schemas using measured share, retaining immutable safety',async()=>{
 const f=fixture(),p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:f.store});
 const actual=await p.prepare(f.input);expect(p.snapshot()!.tokens).toBeLessThanOrEqual(Math.floor(131072*.15));
 expect(actual.system.startsWith(IMMUTABLE_CORE_EN)).toBe(true);expect(actual.system).toContain('sha256:');expect(actual.system).not.toContain('policy reference '.repeat(100));
 expect(actual.tools.map(t=>t.name)).toEqual(['deckent_search_tools','deckent_describe_tool','deckent_call_tool']);
 const path=JSON.parse(actual.system.match(/full text: ("[^"]+")/)![1]!);const bytes=readFileSync(path);expect(bytes.toString()).toBe(readFileSync(join(f.cwd,'DECKENT.md'),'utf8'));expect(actual.system).toContain(createHash('sha256').update(bytes).digest('hex'));f.store.close?.();
});
it('preserves full original composition on a sufficiently large window',async()=>{
 const f=fixture(),p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:f.store});const result=await p.prepare({...f.input,window:1000000});
 expect(result.system).toBe(composeSystemPrompt(f.input.compose));expect(result.tools).toEqual(f.input.tools);expect(p.snapshot()!.reduced).toBe(false);f.store.close?.();
});
it('reveals discovered schemas idempotently and retains access through meta dispatch',async()=>{
 const f=fixture(),p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:f.store});await p.prepare(f.input);
 p.observeToolResult('deckent_search_tools',{}, {ok:true,output:JSON.stringify({results:[{name:'read'},{name:'read'},{name:'unknown'}]})});
 const next=await p.prepare(f.input);expect(next.tools.filter(t=>t.name==='read')).toHaveLength(1);expect(next.tools.some(t=>t.name==='deckent_call_tool')).toBe(true);expect(p.snapshot()!.tokens).toBeLessThanOrEqual(p.snapshot()!.limit);f.store.close?.();
});
it('does not discard references on failed persistence or forged digest',async()=>{
 for(const forge of [false,true]){const f=fixture(),p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:{write(){if(!forge)throw Error('disk full');return {path:join(f.cwd,'DECKENT.md'),sha256:'0'.repeat(64)};}}});await expect(p.prepare({...f.input,window:32768})).rejects.toHaveProperty('code','PREAMBLE_CONTEXT_BUDGET_EXHAUSTED');f.store.close?.();}
});
it('uses the adapter measurement authority instead of enforcing byte heuristics',async()=>{
 const f=fixture();const adapter:ProviderAdapter={...f.adapter,name:'exact-fit',requestMeasurement:{async measure(){return {inputTokens:1,provenance:'fixture-exact'};}}};
 const p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:f.store});const result=await p.prepare({...f.input,adapter});expect(result.system).toBe(composeSystemPrompt(f.input.compose));expect(p.snapshot()!.quality).toBe('exact');f.store.close?.();
});
it('validates configured preamble shares',()=>{
 expect(resolveNativeAgentBudget({}).maxPreambleShareOfContext).toBe(.15);
 expect(resolveNativeAgentBudget({}).minTranscriptShareOfContext).toBe(.1);
 for(const v of [0,1,-1,NaN,Infinity])expect(()=>resolveNativeAgentBudget({policy:{native_agent:{minTranscriptShareOfContext:v}} as never})).toThrow('minTranscriptShareOfContext');
 for(const v of [0,1,-1,NaN,Infinity])expect(()=>resolveNativeAgentBudget({policy:{native_agent:{maxPreambleShareOfContext:v}} as never})).toThrow();
});
it('wires session discovery to next request and reports preamble alongside completion',async()=>{
 const f=fixture();const requests:ProviderRequest[]=[];let round=0;
 f.registry.register({...f.registry.get('deckent_search_tools')!,handler:async()=>({ok:true,output:JSON.stringify({results:[{name:'read'}]})})});
 const adapter:ProviderAdapter={name:'session-preamble',async *send(req){requests.push(req);if(round++===0)yield {type:'tool-call',id:'discover',name:'deckent_search_tools',args:{query:'read'}};else yield {type:'text-delta',text:'done'};yield {type:'done'};}};
 const session=createAgentSession({adapter,model:'fixture',cwd:f.cwd,lang:'en',registry:f.registry,contentStore:f.store,policy:SAFE_DEFAULT_POLICY,ruleStore:{grant(){},revoke(){},activeRules:()=>[],activeDenies:()=>[]},nativeBudget:resolveNativeAgentBudget({}),getContextBudgetTokens:()=>131072});
 try{const events=[];for await(const e of session.send('discover read'))events.push(e);expect(events.filter(e=>e.type==='error')).toEqual([]);expect(requests).toHaveLength(2);expect(requests[0]!.tools.some(t=>t.name==='read')).toBe(false);expect(requests[1]!.tools.some(t=>t.name==='read')).toBe(true);const snap=await session.contextSnapshot();expect(snap.preambleBudget!.tokens).toBeLessThanOrEqual(snap.preambleBudget!.limit);}finally{session.close();}
});

it('reduces identity only after references and schemas cannot fit', async () => {
 const f=fixture();writeFileSync(join(f.cwd,'.deckent','workspace','IDENTITY.md'),'# identity\n'+'identity context '.repeat(9000));
 const p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:f.store});const value=await p.prepare(f.input);
 expect(value.system).toContain('[project identity reference');expect(value.system).toContain(IMMUTABLE_CORE_EN);
 expect(p.snapshot()!.tokens).toBeLessThanOrEqual(p.snapshot()!.limit);f.store.close?.();
});
it('keeps capabilities when discovery is unavailable instead of silently dropping schemas', async () => {
 const f=fixture();const registry=new ToolRegistry();registry.register({...f.registry.get('read')!,description:'large schema '.repeat(5000)});
 const p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry,contentStore:f.store});
 await expect(p.prepare({...f.input,window:32768,tools:registry.toNativeSchemas()})).rejects.toHaveProperty('code','PREAMBLE_CONTEXT_BUDGET_EXHAUSTED');f.store.close?.();
});

it('shares successful search reveals with the bridge NT-06 exposure object', async () => {
 const f=fixture();
 const {createToolExposure}=await import('../../src/agent/tools/exposure.js');
 const {createNativeEngine}=await import('../../src/cli/repl/native-agent-bridge.js');
 const exposure=createToolExposure({progressive:true},f.registry);
 const toolSurface={enabled:true,progressive:true,exposure};
 const requests:ProviderRequest[]=[];
 f.registry.register({...f.registry.get('deckent_search_tools')!,handler:async()=>({ok:true,output:JSON.stringify({results:[{name:'read'}]})})});
 const adapter:ProviderAdapter={name:'shared-exposure',async *send(req){requests.push(req);if(requests.length===1)yield {type:'tool-call',id:'search',name:'deckent_search_tools',args:{query:'read'}};else yield {type:'text-delta',text:'done'};yield {type:'done'};}};
 const engine=createNativeEngine({adapter,registry:f.registry,cwd:f.cwd,model:'fixture',lang:'en',toolSurface,contentStore:f.store,nativeBudget:resolveNativeAgentBudget({}),getContextBudgetTokens:()=>131072,confirm:async()=> 'y',toolSink:()=>{}});
 await engine('discover read',{output:()=>{},onTurnEnd:()=>{}});
 expect(toolSurface.exposure).toBe(exposure);
 expect(exposure.revealedNames()).toContain('read');
 expect(requests[0]!.tools.some(t=>t.name==='read')).toBe(false);
 expect(requests[1]!.tools.some(t=>t.name==='read')).toBe(true);
 engine.close?.();
});
it('localizes durable reference stubs without losing their authority or digest',async()=>{
 const f=fixture(),p=createPreambleBudgeter({share:.15,transcriptReserveShare:.1,registry:f.registry,contentStore:f.store});
 const en=await p.prepare(f.input);
 const tr=await p.prepare({...f.input,compose:{...f.input.compose,lang:'tr'}});
 expect(en.system).toContain('Read the full reference');expect(tr.system).toContain('tam referansı');
 expect(tr.system).not.toContain('Read the full reference');expect(tr.system).toContain('sha256:');f.store.close?.();
});
it('admits an irreducible floor over the target only inside all three reserves',async()=>{
 const f=fixture(),p=createPreambleBudgeter({share:.01,transcriptReserveShare:.25,registry:f.registry,contentStore:f.store});
 const input={...f.input,window:16384,safetyReserveTokens:2048};
 await p.prepare(input);expect(p.snapshot()).toMatchObject({status:'floor-admitted',toolCount:3,hardLimit:6144,limit:163});
 expect(p.snapshot()!.tokens).toBeLessThanOrEqual(6144);
 await expect(p.prepare({...input,outputCeilingTokens:12000})).rejects.toHaveProperty('code','PREAMBLE_CONTEXT_BUDGET_EXHAUSTED');
 expect(p.snapshot()!.status).toBe('exhausted');f.store.close?.();
});
