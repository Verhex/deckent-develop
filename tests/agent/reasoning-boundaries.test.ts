// tests/agent/reasoning-boundaries.test.ts
// ═══ 7108-b — independent post-landing boundary checks (gpt-6-astra, copied
// verbatim from /tmp/astra-7108-postlanding-20260909; assertions unchanged) ═══
import {it,expect,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOpenAIAdapter} from '../../src/agent/provider-tooluse/openai.js';
import {probeOpenAICompatReasoningControl} from '../../src/core/reasoning-control.js';
import {runAgentTurn,type LoopDeps} from '../../src/agent/loop.js';
import {Transcript} from '../../src/agent/transcript.js';
import {ToolRegistry} from '../../src/agent/tools/registry.js';
import {SAFE_DEFAULT_POLICY} from '../../src/agent/permission-policy.js';
import {DEFAULT_NATIVE_AGENT_BUDGET} from '../../src/core/execution-budget-policy.js';
import {createPreambleBudgeter} from '../../src/agent/preamble-budget.js';
import type {ProviderAdapter,ProviderRequest} from '../../src/agent/provider-tooluse/types.js';
async function collect(xs:AsyncIterable<unknown>){const out=[];for await(const x of xs)out.push(x);return out;}
const req:ProviderRequest={system:'s',model:'fixture',messages:[{role:'user',content:'hi'}],tools:[],transportRetry:{attempts:1,backoffMs:0}};
it('never retries a nested AbortError even without a signal on the request',async()=>{
 const abort=Object.assign(new Error('cancelled'),{name:'AbortError'});
 const error=new TypeError('fetch failed',{cause:new Error('wrapped',{cause:abort})});
 const fetchImpl=vi.fn<typeof fetch>().mockRejectedValue(error);
 const adapter=createOpenAIAdapter({baseUrl:'http://fixture.invalid/v1',fetchImpl});
 await collect(adapter.send(req)).catch(()=>{});
 expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('does not treat a permanent TLS identity failure as transient',async()=>{
 const error=new TypeError('fetch failed',{cause:Object.assign(new Error('certificate mismatch'),{code:'ERR_TLS_CERT_ALTNAME_INVALID'})});
 const fetchImpl=vi.fn<typeof fetch>().mockRejectedValue(error);
 const adapter=createOpenAIAdapter({baseUrl:'https://fixture.invalid/v1',fetchImpl});
 await collect(adapter.send(req)).catch(()=>{});
 expect(fetchImpl).toHaveBeenCalledTimes(1);
});
it('attaches a bounded cancellation signal when a props caller omits one',async()=>{
 const observed:Array<AbortSignal|null|undefined>=[];
 const fetchFn=vi.fn<typeof fetch>(async(_url,init)=>{observed.push(init?.signal);return new Response('{}',{status:503});});
 await probeOpenAICompatReasoningControl({endpoint:'http://fixture.invalid/v1',model:'fixture',fetchFn});
 expect(observed).toHaveLength(2);
 expect(observed.every(signal=>signal instanceof AbortSignal)).toBe(true);
});
it('rechecks the preamble hard reserve before raising the reasoning retry ceiling',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'astra-7108-'));const registry=new ToolRegistry();const requests:ProviderRequest[]=[];
 const adapter:ProviderAdapter={name:'fixture',reasoningControl:async()=>({toggle:{kind:'none'},sharesCompletionBudget:true,provenance:'server-reported'}),requestMeasurement:{measure:async()=>({inputTokens:8000,provenance:'fixture-exact'})},async *send(request){requests.push(request);if(requests.length===1){yield {type:'reasoning-activity',chars:500};yield {type:'done',stopReason:'length'};}else {yield {type:'text-delta',text:'answer'};yield {type:'done',stopReason:'stop'};}}};
 const nativeBudget={...DEFAULT_NATIVE_AGENT_BUDGET,reasoning:{...DEFAULT_NATIVE_AGENT_BUDGET.reasoning,mode:'on' as const}};
 const preambleBudgeter=createPreambleBudgeter({share:nativeBudget.maxPreambleShareOfContext,transcriptReserveShare:nativeBudget.minTranscriptShareOfContext,registry});
 const deps:LoopDeps={adapter,registry,policy:SAFE_DEFAULT_POLICY,ruleStore:{grant(){},revoke(){},activeRules:()=>[],activeDenies:()=>[]},cwd,model:'fixture',lang:'en',nativeBudget,preambleBudgeter,getContextBudgetTokens:()=>32768,getMode:()=> 'suggest',issuePermission:()=>{throw Error('unexpected');},requestPermission:async()=>({decision:'hold',reasonCode:'unexpected'}),validatePermission:()=>false,claimPermissionEffect:()=>false};
 try{await collect(runAgentTurn(deps,new Transcript(),'go'));expect(requests[0]?.outputCeilingTokens).toBe(12288);expect(requests).toHaveLength(1);}finally{rmSync(cwd,{recursive:true,force:true});}
});
