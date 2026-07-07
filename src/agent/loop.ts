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
import { accrue, costExceeded, type CostGuardState } from './guards/cost.js';
import { fitMessagesToBudget } from './context-budget.js';

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
  /** Live adapter override — read per provider call so a runtime /provider
   *  switch takes effect mid-session without rebuilding the loop/transcript.
   *  Absent → the fixed `adapter` above (back-compat). */
  getAdapter?: () => ProviderAdapter;
  /** Live model override — read per provider call so a runtime /model switch
   *  takes effect mid-session. Absent → the fixed `model` above. */
  getModel?: () => string;
  /** Prompt-side token budget (estimated) for the transcript window. Read per
   *  provider call; when the transcript overflows it, the oldest messages are
   *  compacted away (pairing-safe) and a 'notice' event reports it — instead
   *  of the backend silently truncating and returning an empty turn. Absent /
   *  <=0 → no client-side fitting. */
  getContextBudgetTokens?: () => number | undefined;
  /** current approval mode (read per-decision so setApprovalMode takes effect). */
  getMode: () => ApprovalMode;
  /** view→core suspension: resolve with the user's choice on an 'ask' decision. */
  requestPermission: (req: PermissionRequestEvent) => Promise<PermissionResponse>;
  /** cooperative cancellation between iterations. */
  isCancelled?: () => boolean;
  /** Optional per-session cost accumulator. When a hard ceilingUsd is configured
   *  and crossed, the turn aborts mid-stream (not advisory-only). Undefined → no
   *  cost gating at the loop level. */
  costGuard?: CostGuardState;
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

    // Live-switchable adapter/model (read per call: /model — /provider mid-session).
    const adapter = deps.getAdapter?.() ?? deps.adapter;
    const model = deps.getModel?.() ?? deps.model;

    // Client-side context fitting: drop the oldest messages (pairing-safe)
    // BEFORE the backend hits its window — a server-side truncation returns an
    // empty turn with HTTP 200 and looks like a dead REPL.
    let messages = transcript.toProviderMessages();
    const budget = deps.getContextBudgetTokens?.();
    if (budget !== undefined && budget > 0) {
      const fit = fitMessagesToBudget(messages, budget);
      if (fit.droppedCount > 0) {
        messages = fit.messages;
        yield {
          type: 'notice',
          code: 'context-compacted',
          message: `context window near its limit — compacted ${fit.droppedCount} oldest message(s) (~${fit.estimatedTokens} tokens kept)`,
        };
      }
    }

    const req: ProviderRequest = { system, messages, tools: deps.registry.toNativeSchemas(), model };
    let assistantText = '';
    let stopReason: string | undefined;
    const calls: ProviderToolCall[] = [];
    try {
      for await (const ev of adapter.send(req)) {
        if (ev.type === 'text-delta') { assistantText += ev.text; yield { type: 'text-delta', text: ev.text }; }
        else if (ev.type === 'tool-call') { calls.push(ev); yield { type: 'tool-proposed', id: ev.id, tool: ev.name, args: ev.args }; }
        else if (ev.type === 'usage') {
          yield { type: 'usage', inputTokens: ev.inputTokens, outputTokens: ev.outputTokens };
          if (deps.costGuard) {
            accrue(deps.costGuard, { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens });
            const c = costExceeded(deps.costGuard);
            if (c.exceeded) {
              yield { type: 'error', message: `${c.reason}: ~$${c.spentUsd.toFixed(4)}` };
              yield { type: 'turn-end' };
              return;
            }
          }
        }
        else if (ev.type === 'done') { stopReason = ev.stopReason; }
      }
    } catch (e) {
      yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
      yield { type: 'turn-end' };
      return;
    }

    // Honest truncation signal: the backend cut generation at its token/context
    // ceiling. The turn still carries whatever arrived, but the user must know
    // the reply is incomplete rather than mistaking it for a finished answer.
    if (stopReason === 'length') {
      yield { type: 'notice', code: 'truncated', message: 'response truncated — the model hit its output/context token limit' };
    }

    // Skip a truly-empty assistant turn (no text, no tool calls) — appending
    // `{role:'assistant', content:''}` would replay to the provider next send
    // (OpenAI may 400 on empty content with no tool_calls). Review carry-over.
    if (assistantText !== '' || calls.length > 0) {
      transcript.appendAssistant(assistantText, calls.map((c) => ({ id: c.id, name: c.name, args: c.args })));
    }
    if (calls.length === 0) {
      // Empty turn (no text, no tool calls): a healthy model never does this —
      // it is the signature of a full context window (or a broken backend).
      // Fail honestly instead of closing the turn as if it succeeded.
      if (assistantText === '') {
        yield {
          type: 'error',
          code: 'empty-response',
          message: 'model returned an empty response — its context window may be full',
        };
      }
      yield { type: 'turn-end' };
      return;
    }

    for (const call of calls) {
      // cancel() stops the rest of the in-flight batch (incl. auto-tier calls),
      // not just subsequent ask-tier ones (review follow-up #1).
      if (deps.isCancelled?.()) break;
      const def = deps.registry.get(call.name);
      if (!def) {
        const output = `[unknown tool: ${call.name}]`;
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
        transcript.appendToolResult(call.id, output);
        continue;
      }
      const resource = primaryResource(call.args);
      const elevated = checkSelfModifying(deps.cwd, writeTargets(call.args)).elevated;
      let tier = resolveTier(def, deps.policy);
      if (elevated) tier = 'always';

      const decision = decide(call.name, resource, tier, { rules: deps.ruleStore.activeRules(), denies: deps.ruleStore.activeDenies(), policy: deps.policy, mode: deps.getMode() });
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
        // A self-modifying-elevated call never persists a grant — each deckent-source
        // write must be re-confirmed, or a single "always" would silently auto-approve
        // later source writes by this tool and defeat the guard (review follow-up #2).
        if (resp.decision !== 'once' && !elevated) deps.ruleStore.grant({ tool: call.name, pattern: resource || '**' }, resp.decision as GrantLifetime);
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
