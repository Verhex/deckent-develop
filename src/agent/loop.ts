// src/agent/loop.ts
// ═══ Agent loop — runAgentTurn (SP-1 §9, §13) ═══════════════════════════════
// The headless engine: append the user input, then repeatedly ask the model
// (via a ProviderAdapter), surface text + tool calls as AgentEvents, gate each
// tool call through the permission engine + guards, execute it, feed the result
// back, and continue until the model answers with no tool call (turn-end) or a
// limit/abort fires. View-neutral: permission suspension is an injected callback.

import type { AgentEvent, PermissionRequestEvent } from './events.js';
import { composeSystemPrompt } from './identity.js';
import { decide, resolveTier } from './permission.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { GrantLifetime, RuleStore } from './permission-store.js';
import type { ApprovalMode } from './permission-types.js';
import { ToolRegistry } from './tools/registry.js';
import type { ToolResult } from './tools/types.js';
import { Transcript } from './transcript.js';
import type { ProviderAdapter, ProviderRequest, ProviderToolCall } from './provider-tooluse/types.js';
import { recursionExceeded } from './guards/recursion.js';
import { checkSelfModifying } from './guards/self-modifying.js';

export type PermissionResponse = { decision: 'once' | 'session' | 'always' | 'deny' };

export interface LoopDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  policy: PermissionPolicy;
  ruleStore: RuleStore;
  cwd: string;
  model: string;
  lang?: 'en' | 'tr';
  maxIterations?: number;
  /** current approval mode (read per-decision so setApprovalMode takes effect). */
  getMode: () => ApprovalMode;
  /** view→core suspension: resolve with the user's choice on an 'ask' decision. */
  requestPermission: (req: PermissionRequestEvent) => Promise<PermissionResponse>;
  /** cooperative cancellation between iterations. */
  isCancelled?: () => boolean;
}

/** Best-effort primary resource for permission glob matching. */
function primaryResource(args: Record<string, unknown>): string {
  const v = args['path'] ?? args['file_path'] ?? args['command'] ?? args['url'] ?? args['pattern'] ?? '';
  return typeof v === 'string' ? v : '';
}

/** Candidate write-target paths for the self-modifying guard. */
function writeTargets(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ['path', 'file_path']) if (typeof args[k] === 'string') out.push(args[k] as string);
  if (Array.isArray(args['files'])) for (const f of args['files']) if (typeof f === 'string') out.push(f);
  return out;
}

export async function* runAgentTurn(deps: LoopDeps, transcript: Transcript, userInput: string): AsyncIterable<AgentEvent> {
  transcript.appendUser(userInput);
  const system = composeSystemPrompt({ cwd: deps.cwd, lang: deps.lang });
  let iterations = 0;

  while (true) {
    if (deps.isCancelled?.()) { yield { type: 'turn-end' }; return; }
    iterations++;
    if (recursionExceeded(iterations, deps.maxIterations)) {
      yield { type: 'error', message: 'recursion limit exceeded' };
      yield { type: 'turn-end' };
      return;
    }

    const req: ProviderRequest = { system, messages: transcript.toProviderMessages(), tools: deps.registry.toNativeSchemas(), model: deps.model };
    let assistantText = '';
    const calls: ProviderToolCall[] = [];
    try {
      for await (const ev of deps.adapter.send(req)) {
        if (ev.type === 'text-delta') { assistantText += ev.text; yield { type: 'text-delta', text: ev.text }; }
        else if (ev.type === 'tool-call') { calls.push(ev); yield { type: 'tool-proposed', id: ev.id, tool: ev.name, args: ev.args }; }
        else if (ev.type === 'usage') { yield { type: 'usage', inputTokens: ev.inputTokens, outputTokens: ev.outputTokens }; }
        // 'done' ends the inner provider stream.
      }
    } catch (e) {
      yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
      yield { type: 'turn-end' };
      return;
    }

    transcript.appendAssistant(assistantText, calls.map((c) => ({ id: c.id, name: c.name, args: c.args })));
    if (calls.length === 0) { yield { type: 'turn-end' }; return; }

    for (const call of calls) {
      const def = deps.registry.get(call.name);
      if (!def) {
        const output = `[unknown tool: ${call.name}]`;
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
        transcript.appendToolResult(call.id, output);
        continue;
      }
      const resource = primaryResource(call.args);
      let tier = resolveTier(def, deps.policy);
      if (checkSelfModifying(deps.cwd, writeTargets(call.args)).elevated) tier = 'always';

      const decision = decide(call.name, resource, tier, { rules: deps.ruleStore.activeRules(), denies: [], policy: deps.policy, mode: deps.getMode() });
      if (decision === 'deny') {
        const output = '[denied by policy]';
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
        transcript.appendToolResult(call.id, output);
        continue;
      }
      if (decision === 'ask') {
        const prompt: PermissionRequestEvent = { type: 'permission-request', id: call.id, tool: call.name, resource, tier };
        yield prompt;
        const resp = await deps.requestPermission(prompt);
        if (resp.decision === 'deny') {
          const output = '[rejected by user]';
          yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
          transcript.appendToolResult(call.id, output);
          continue;
        }
        if (resp.decision !== 'once') deps.ruleStore.grant({ tool: call.name, pattern: resource || '**' }, resp.decision as GrantLifetime);
      }

      yield { type: 'tool-executing', id: call.id, tool: call.name };
      let result: ToolResult;
      try { result = await def.handler(call.args); }
      catch (e) { result = { ok: false, output: e instanceof Error ? e.message : String(e) }; }
      yield { type: 'tool-result', id: call.id, tool: call.name, ok: result.ok, output: result.output };
      transcript.appendToolResult(call.id, result.output);
    }
    // loop continues — the model sees the tool results on the next iteration.
  }
}
