import {it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPreambleBudgeter} from '../../src/agent/preamble-budget.js';
import {createSessionContentStore} from '../../src/agent/tool-result-broker.js';
import {buildNativeToolRegistry} from '../../src/cli/repl/native-tool-registry.js';
import {resolveNativeAgentBudget} from '../../src/core/execution-budget-policy.js';
import {IMMUTABLE_CORE_EN} from '../../src/agent/identity.js';
import type {ProviderAdapter} from '../../src/agent/provider-tooluse/types.js';
// Production registry and real repository knowledge, copied into a disposable
// workspace. Never write the source repository or call a live provider here.
it('prices the real registry and repository across the supported context matrix',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'preamble-real-'));
 mkdirSync(join(cwd,'.deckent','workspace'),{recursive:true});
 for(const path of ['DECKENT.md','.deckent/workspace/IDENTITY.md']) {
  writeFileSync(join(cwd,path),readFileSync(new URL('../../'+path,import.meta.url)));
 }
 const store=createSessionContentStore({dir:join(cwd,'content')});
 const registry=buildNativeToolRegistry({cwd:()=>cwd,toolSurface:{enabled:true,progressive:false},contentStore:store});
 const policy=resolveNativeAgentBudget({});
 const adapter:ProviderAdapter={name:'matrix-conservative',async *send(){throw Error('matrix must never send');}};
 const rows=[];
 try {
  for(const window of [8192,16384,32768,65536,131072]) {
   const p=createPreambleBudgeter({share:policy.maxPreambleShareOfContext,transcriptReserveShare:policy.minTranscriptShareOfContext,registry,contentStore:store});
   const request=p.prepare({compose:{cwd,lang:'en'},tools:registry.toNativeSchemas(),adapter,model:'fixture',window,outputCeilingTokens:policy.outputReserveTokens,safetyReserveTokens:policy.contextSafetyReserveTokens});
   if(window===8192) await expect(request).rejects.toHaveProperty('code','PREAMBLE_CONTEXT_BUDGET_EXHAUSTED');
   else expect((await request).system.startsWith(IMMUTABLE_CORE_EN)).toBe(true);
   const snapshot=p.snapshot()!;rows.push(snapshot);
   expect(snapshot.limit).toBe(Math.floor(window*.15));
   expect(snapshot.hardLimit).toBe(window-6144-Math.ceil(window*.1));
   if(window!==8192) expect(snapshot.tokens).toBeLessThanOrEqual(snapshot.hardLimit);
  }
  expect(rows.map(row => [row.window,row.status,row.toolCount])).toEqual([
   [8192,'exhausted',3], [16384,'floor-admitted',3], [32768,'within-target',3],
   [65536,'within-target',15], [131072,'within-target',15],
  ]);
  // An 8k model can run with smaller, explicitly resolved output/safety reserves.
  const small=resolveNativeAgentBudget({policy:{native_agent:{outputReserveTokens:512,contextSafetyReserveTokens:256}}});
  const p=createPreambleBudgeter({share:small.maxPreambleShareOfContext,transcriptReserveShare:small.minTranscriptShareOfContext,registry,contentStore:store});
  await p.prepare({compose:{cwd,lang:'en'},tools:registry.toNativeSchemas(),adapter,model:'fixture',window:8192,outputCeilingTokens:small.outputReserveTokens,safetyReserveTokens:small.contextSafetyReserveTokens});
  expect(p.snapshot()).toMatchObject({status:'floor-admitted',toolCount:3,hardLimit:6604});
  console.log(JSON.stringify({matrix:rows,configured8k:p.snapshot()}));
 }finally{store.close?.();rmSync(cwd,{recursive:true,force:true});}
});
