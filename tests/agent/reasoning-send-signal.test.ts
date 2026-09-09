import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveNativeSelection } from '../../src/cli/repl/native-transport.js';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { DEFAULT_NATIVE_AGENT_BUDGET } from '../../src/core/execution-budget-policy.js';

it('cold unknown descriptor retains turn abort through loop -> send -> second probe', async () => {
  const root = await mkdtemp(join(tmpdir(),'astra-probe-chain-'));
  try {
    const turn = new AbortController();
    const probes: AbortSignal[] = [];
    const fetchFn: typeof fetch = async (url, init) => {
      if (String(url).includes('/props')) {
        // Context-identity probe is a separate existing capability; return its evidence.
        if (!init?.signal) return new Response(JSON.stringify({n_ctx:32768}));
        expect(init.signal).toBeInstanceOf(AbortSignal);
        probes.push(init!.signal as AbortSignal);
        // First loop lookup had no evidence and is not cached. Abort when the
        // adapter resolves the descriptor AGAIN for the generation wire body.
        if (probes.length === 3) turn.abort();
        return new Response('{}',{status:503});
      }
      return new Response('data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
    };
    const resolved = resolveNativeSelection({provider:'local-llm',model:'astra-private-unknown'}, {
      projectRoot:root,env:{},fetchFn,
      config:{local_llm:{endpoint:'http://fixture.invalid/v1',contextSize:32768},execution_budget:{roles:{},native_agent:{reasoningProbeTimeoutMs:50}}},
    });
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) throw Error('fixture resolution failed');
    const deps: LoopDeps = {
      adapter:resolved.adapter,registry:new ToolRegistry(),policy:SAFE_DEFAULT_POLICY,
      ruleStore:{grant(){},revoke(){},activeRules:()=>[],activeDenies:()=>[]},
      cwd:root,model:'astra-private-unknown',lang:'en',nativeBudget:DEFAULT_NATIVE_AGENT_BUDGET,
      getTurnSignal:()=>turn.signal,isCancelled:()=>turn.signal.aborted,getMode:()=> 'suggest',
      issuePermission:()=>{throw Error('unexpected');},requestPermission:async()=>({decision:'hold',reasonCode:'unexpected'}),
      validatePermission:()=>false,claimPermissionEffect:()=>false,
    };
    for await (const _event of runAgentTurn(deps,new Transcript(),'hi')) { /* drain */ }
    expect(probes.length).toBeGreaterThanOrEqual(3);
    expect(turn.signal.aborted).toBe(true);
    expect(probes[2]!.aborted).toBe(true);
  } finally { await rm(root,{recursive:true,force:true}); }
});
