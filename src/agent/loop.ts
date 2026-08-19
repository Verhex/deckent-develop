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
import { grantPatternFor, type ApprovalMode } from './permission-types.js';
import { ToolRegistry, type NativeToolSchema } from './tools/registry.js';
import type { ToolResult } from './tools/types.js';
import { Transcript } from './transcript.js';
import type { ProviderAdapter, ProviderMessage, ProviderRequest, ProviderToolCall } from './provider-tooluse/types.js';
import {
  recursionExceeded,
  createNativeBudgetState,
  evaluateNativeBudget,
  type NativeBudgetState,
} from './guards/recursion.js';
import type { ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';
import { checkSelfModifying } from './guards/self-modifying.js';
import { accrue, costExceeded, type CostGuardState } from './guards/cost.js';
import { classifyShellCommand } from './guards/shell-risk.js';
import {
  fitMessagesToBudget,
  derivePromptBudget,
  estimateTokens,
  estimateMessageTokens,
} from './context-budget.js';
import { matchRule } from './permission-types.js';

const MAX_OUTPUT_CONTINUATIONS = 2;
const CONTINUATION_INSTRUCTION = 'Continue the same answer exactly where it stopped. Do not repeat prior visible text.';

function removeRepeatedPrefix(previous: string, next: string): string {
  const max = Math.min(previous.length, next.length);
  for (let overlap = max; overlap > 0; overlap--) {
    if (previous.endsWith(next.slice(0, overlap))) return next.slice(overlap);
  }
  return next;
}

export type PermissionResponse = { decision: 'once' | 'session' | 'always' | 'deny' };

export interface LoopDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  policy: PermissionPolicy;
  ruleStore: RuleStore;
  cwd: string;
  model: string;
  lang?: 'en' | 'tr';
  /** Session scratchpad root, threaded into the per-turn system prompt so the
   *  model knows where the volatile blackboard is. Absent → the composed prompt
   *  stays byte-identical to the pre-scratchpad behavior. */
  scratchDir?: string;
  maxIterations?: number;
  /** NATIVE-AGENT-HORIZON-001: config-resolved multi-dimension session budget.
   *  Absent → the legacy single-round guard below stays byte-identical. */
  nativeBudget?: ResolvedNativeAgentBudget;
  /** SESSION-cumulative counters (created once per session by the caller) —
   *  a context-epoch reset never resets them. Absent with nativeBudget set →
   *  the loop creates turn-scoped state (still bounded, honestly weaker). */
  nativeBudgetState?: NativeBudgetState;
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
  /** NT-06 progressive tool surface — the provider-visible schema list, re-read
   *  by the caller's own view ONCE PER ROUND. The loop stays deliberately
   *  ignorant of exposure/reveal semantics (that policy lives in
   *  `tools/exposure.ts`, owned by the session layer): it only asks this getter
   *  for "the tools the provider may see right now", so a tool revealed while
   *  round N runs simply appears in round N+1's request — no other loop change,
   *  and the NT-02 admission arithmetic below prices the smaller list for free.
   *  Absent → the full eager `registry.toNativeSchemas()` dump (byte-identical
   *  legacy behavior; the flag-off path never constructs a getter at all). */
  getProviderToolSchemas?: () => NativeToolSchema[];
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

/** Best-effort primary resource for permission glob matching. Exported for the
 *  call_tool parity resolver (born-607) — a nested dispatch must derive the SAME
 *  resource this loop would, or deny-globs diverge between direct and nested paths. */
export function primaryResource(args: Record<string, unknown>): string {
  const v = args['path'] ?? args['file_path'] ?? args['cmd'] ?? args['url'] ?? args['pattern'] ?? '';
  return typeof v === 'string' ? v : '';
}

/** Candidate write-target paths for the self-modifying guard. Exported for the
 *  call_tool parity resolver (born-607) — same rationale as primaryResource. */
export function writeTargets(args: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const k of ['path', 'file_path']) if (typeof args[k] === 'string') out.push(args[k] as string);
  if (Array.isArray(args['files'])) for (const f of args['files']) if (typeof f === 'string') out.push(f);
  return out;
}

export async function* runAgentTurn(deps: LoopDeps, transcript: Transcript, userInput: string): AsyncIterable<AgentEvent> {
  transcript.appendUser(userInput);
  const system = composeSystemPrompt({
    cwd: deps.cwd,
    lang: deps.lang,
    ...(deps.scratchDir !== undefined ? { scratchDir: deps.scratchDir } : {}),
  });
  let iterations = 0;
  const budgetState = deps.nativeBudget
    ? (deps.nativeBudgetState ?? createNativeBudgetState())
    : undefined;

  while (true) {
    if (deps.isCancelled?.()) { yield { type: 'turn-end' }; return; }
    iterations++;
    if (deps.nativeBudget && budgetState) {
      budgetState.rounds++;
      const check = evaluateNativeBudget(budgetState, deps.nativeBudget);
      if (check.verdict === 'terminate') {
        // Typed session-budget termination: the CODE is the contract; the CLI
        // surface localizes it (mechanism string stays terse English).
        yield { type: 'error', code: check.code, message: check.code };
        yield { type: 'turn-end' };
        return;
      }
      if (check.verdict === 'checkpoint') {
        yield {
          type: 'budget-checkpoint-request',
          reason: check.reason,
          rounds: budgetState.rounds,
          toolCalls: budgetState.toolCalls,
        };
      }
    } else if (recursionExceeded(iterations, deps.maxIterations)) {
      yield { type: 'error', code: 'native-budget.rounds-exhausted', message: 'recursion limit exceeded' };
      yield { type: 'turn-end' };
      return;
    }

    // Live-switchable adapter/model (read per call: /model — /provider mid-session).
    const adapter = deps.getAdapter?.() ?? deps.adapter;
    const model = deps.getModel?.() ?? deps.model;

    // Client-side context fitting: drop the oldest messages (pairing-safe)
    // BEFORE the backend hits its window — a server-side truncation returns an
    // empty turn with HTTP 200 and looks like a dead REPL.
    // NT-06: re-read every round — this is what makes a mid-turn reveal visible
    // on the NEXT request without any loop-side exposure state.
    const toolSchemas = deps.getProviderToolSchemas?.() ?? deps.registry.toNativeSchemas();
    const rawBudget = deps.getContextBudgetTokens?.();
    // NT-08: the generation room the prompt arithmetic reserves is also the
    // ceiling the backend is told to respect (adapter → `max_tokens`).
    const outputCeilingTokens = deps.nativeBudget?.outputReserveTokens ?? 0;
    const contextSafetyReserveTokens = deps.nativeBudget?.contextSafetyReserveTokens ?? 0;
    // 548-004 production wiring: the visible reserve arithmetic — system prompt,
    // serialized tool schemas and the configured output/safety reserves all come
    // OUT of the context before transcript fitting, so the backend can never be
    // handed a prompt that leaves no room for its own answer.
    const budget = rawBudget !== undefined && rawBudget > 0
      ? Math.max(
          derivePromptBudget({
            contextTokens: rawBudget,
            systemPrompt: system,
            toolSchemas,
            outputReserveTokens: outputCeilingTokens,
            contextSafetyReserveTokens,
          }).promptBudgetTokens,
          // Floor: overheads (system prompt + tool schemas) may exceed a small
          // configured budget entirely — fitting must still keep a minimal
          // window rather than silently disabling compaction.
          Math.ceil(rawBudget * 0.25),
        )
      : rawBudget;

    // NT-02 per-request admission: fitting alone cannot guarantee the request
    // fits — the current turn (last user message onward) is force-kept whole so
    // a single round of oversized tool results still overflows, and the 25%
    // floor above deliberately keeps a window even when overheads swallow the
    // context. Measure the ACTUAL request the way the wire will carry it.
    const fixedOverheadTokens = estimateTokens(system)
      + estimateTokens(JSON.stringify(toolSchemas))
      + outputCeilingTokens
      + contextSafetyReserveTokens;
    const fitRequest = (source: readonly ProviderMessage[]): {
      messages: ProviderMessage[];
      droppedCount: number;
      keptTokens: number;
      requiredTokens: number;
    } => {
      const fit = budget !== undefined && budget > 0
        ? fitMessagesToBudget(source, budget)
        : { messages: [...source], droppedCount: 0, estimatedTokens: source.reduce((n, m) => n + estimateMessageTokens(m), 0) };
      return {
        messages: fit.messages,
        droppedCount: fit.droppedCount,
        keptTokens: fit.estimatedTokens,
        requiredTokens: fixedOverheadTokens + fit.messages.reduce((n, m) => n + estimateMessageTokens(m), 0),
      };
    };
    // Admission needs BOTH a known effective context and a resolved native
    // budget — the latter is where the reserve arithmetic (output ceiling +
    // safety reserve) comes from, and the production REPL always resolves one
    // (run.tsx: resolveNativeAgentBudget, defaults when unauthored). A legacy
    // caller with neither keeps the pre-NT-02 fitting behavior byte-identical.
    const overContext = (requiredTokens: number): boolean =>
      deps.nativeBudget !== undefined && rawBudget !== undefined && rawBudget > 0
      && requiredTokens > rawBudget;

    let fitted = fitRequest(transcript.toProviderMessages());
    if (fitted.droppedCount > 0) {
      yield {
        type: 'notice',
        code: 'context-compacted',
        message: `context window near its limit — compacted ${fitted.droppedCount} oldest message(s) (~${fitted.keptTokens} tokens kept)`,
      };
    }
    if (overContext(fitted.requiredTokens)) {
      // Epoch-compaction path: ask the session layer ONCE to checkpoint (which
      // may compact the transcript into a fresh epoch while this generator is
      // suspended on the yield), then re-read + re-fit and judge again.
      yield {
        type: 'budget-checkpoint-request',
        reason: 'token-pressure',
        rounds: budgetState?.rounds ?? iterations,
        toolCalls: budgetState?.toolCalls ?? 0,
      };
      // Re-fit silently: a consumer that ignored the checkpoint would otherwise
      // get the identical compaction notice twice for one round.
      fitted = fitRequest(transcript.toProviderMessages());
      if (overContext(fitted.requiredTokens)) {
        // Shipping this request would be a doomed call — the backend truncates
        // server-side and returns an empty turn. Current-turn messages are
        // NEVER dropped to make it fit; the typed denial is the honest outcome.
        yield {
          type: 'error',
          code: 'native-context.admission-denied',
          message: `context admission denied — request needs ~${fitted.requiredTokens} tokens, effective context is ${rawBudget}`,
        };
        yield { type: 'turn-end' };
        return;
      }
    }
    const messages = fitted.messages;

    const req: ProviderRequest = {
      system,
      messages,
      tools: toolSchemas,
      model,
      ...(outputCeilingTokens > 0 ? { outputCeilingTokens } : {}),
    };
    let assistantText = '';
    let calls: ProviderToolCall[] = [];
    let continuationIndex = 0;
    let continuationMessages = messages;
    try {
      while (true) {
        let segmentText = '';
        const segmentCalls: ProviderToolCall[] = [];
        let segmentStopReason: string | undefined;
        let hiddenReasoningObserved = false;
        const segmentRequest: ProviderRequest = { ...req, messages: continuationMessages };
        for await (const ev of adapter.send(segmentRequest)) {
        // Mid-stream cancel(): stop consuming further provider events instead of
        // running the in-flight turn to completion (breaking a for-await triggers
        // the adapter's iterator.return(), giving it a chance to abort cleanly).
        if (deps.isCancelled?.()) break;
        if (ev.type === 'text-delta') {
          segmentText += ev.text;
          // Preserve ordinary streaming order. Continuation segments alone are
          // buffered until their overlap with already-visible text is known.
          if (continuationIndex === 0) yield { type: 'text-delta', text: ev.text };
        }
        else if (ev.type === 'reasoning-activity') { hiddenReasoningObserved = true; }
        else if (ev.type === 'tool-call') { segmentCalls.push(ev); }
        else if (ev.type === 'usage') {
          yield { type: 'usage', inputTokens: ev.inputTokens, outputTokens: ev.outputTokens };
          if (budgetState) {
            // Fresh-token accounting: each round's reported input re-counts the
            // WHOLE resent context, so summing raw input grows quadratically and
            // a normal 118k-context analysis exhausted a 2M cap in ~17 rounds
            // (live incident 2026-08-18). Count output plus only the POSITIVE
            // input growth — the honest new-work approximation. The audit/usage
            // events above stay raw and untouched.
            const freshInput = Math.max(0, ev.inputTokens - budgetState.lastInputTokens);
            budgetState.lastInputTokens = ev.inputTokens;
            budgetState.cumulativeTokens += freshInput + ev.outputTokens;
          }
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
        else if (ev.type === 'done') { segmentStopReason = ev.stopReason; }
        }

        if (deps.isCancelled?.()) break;
        const novelText = continuationIndex === 0
          ? segmentText
          : removeRepeatedPrefix(assistantText, segmentText);
        assistantText += novelText;
        if (continuationIndex > 0 && novelText !== '') {
          yield { type: 'text-delta', text: novelText };
        }

        if (segmentStopReason !== 'length') {
          calls = segmentCalls;
          for (const call of calls) yield { type: 'tool-proposed', id: call.id, tool: call.name, args: call.args };
          break;
        }

        // A length-cut segment is not an atomic tool-call boundary. Even if an
        // adapter recovered JSON from accumulated fragments, none of its calls
        // may be proposed, committed to the transcript, or executed.
        const classification = segmentText === '' && hiddenReasoningObserved
          ? 'EMPTY_VISIBLE_AFTER_REASONING'
          : 'OUTPUT_LIMIT';
        if (continuationIndex >= MAX_OUTPUT_CONTINUATIONS) {
          yield {
            type: 'generation-recovery', classification,
            continuationIndex, maxContinuations: MAX_OUTPUT_CONTINUATIONS,
            hiddenReasoningObserved, action: 'hold',
          };
          yield { type: 'error', code: 'native-output.continuation-exhausted', message: 'native-output.continuation-exhausted' };
          yield { type: 'turn-end' };
          return;
        }
        continuationIndex++;
        yield {
          type: 'generation-recovery', classification,
          continuationIndex, maxContinuations: MAX_OUTPUT_CONTINUATIONS,
          hiddenReasoningObserved, action: 'continue',
        };
        continuationMessages = [
          ...messages,
          ...(assistantText === '' ? [] : [{ role: 'assistant' as const, content: assistantText }]),
          { role: 'user', content: CONTINUATION_INSTRUCTION },
        ];
      }
    } catch (e) {
      yield { type: 'error', message: e instanceof Error ? e.message : String(e) };
      yield { type: 'turn-end' };
      return;
    }

    // The stream was interrupted mid-turn: nothing proposed this round was ever
    // executed, so committing it (transcript.appendAssistant below) would leave
    // orphan tool_use ids with no matching tool_result — reject before that happens.
    if (deps.isCancelled?.()) { yield { type: 'turn-end' }; return; }

    // Skip a truly-empty assistant turn (no text, no tool calls) — appending
    // `{role:'assistant', content:''}` would replay to the provider next send
    // (OpenAI may 400 on empty content with no tool_calls). Review carry-over.
    if (budgetState) {
      // Progress = at least one semantically-new tool call (name + canonical
      // args digest unseen this session) OR substantive assistant text. Distinct
      // relevant work never trips the no-progress guard; repeat spirals do.
      budgetState.toolCalls += calls.length;
      let sawNewCall = false;
      for (const call of calls) {
        const digest = `${call.name}\u0000${JSON.stringify(call.args, Object.keys(call.args).sort())}`;
        if (!budgetState.seenCallDigests.has(digest)) {
          budgetState.seenCallDigests.add(digest);
          sawNewCall = true;
        }
      }
      const substantiveText = assistantText.trim().length > 80;
      if (sawNewCall || substantiveText) {
        budgetState.noProgressRounds = 0;
        budgetState.noProgressCheckpointRequested = false;
      } else {
        budgetState.noProgressRounds++;
      }
    }
    if (assistantText !== '' || calls.length > 0) {
      transcript.appendAssistant(assistantText, calls.map((c) => ({ id: c.id, name: c.name, args: c.args })));
    }
    if (calls.length === 0) {
      // Empty turn (no text, no tool calls): a healthy model never does this —
      // it is the signature of a full context window (or a broken backend).
      // Fail honestly instead of closing the turn as if it succeeded.
      if (assistantText === '') {
        yield {
          type: 'generation-recovery', classification: 'TRANSPORT_EMPTY',
          continuationIndex: 0, maxContinuations: MAX_OUTPUT_CONTINUATIONS,
          hiddenReasoningObserved: false, action: 'hold',
        };
        yield {
          type: 'error',
          code: 'empty-response',
          message: 'model returned an empty response — its context window may be full',
        };
      }
      yield { type: 'turn-end' };
      return;
    }

    let cancelledAt = -1;
    for (const [callIndex, call] of calls.entries()) {
      // cancel() stops the rest of the in-flight batch (incl. auto-tier calls),
      // not just subsequent ask-tier ones (review follow-up #1).
      if (deps.isCancelled?.()) { cancelledAt = callIndex; break; }
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
      const isShellTool = call.name === 'bash' || call.name.endsWith('_bash');
      const rawShellCommand = call.args['command'] ?? call.args['cmd'] ?? resource;
      const shellCommand = typeof rawShellCommand === 'string' ? rawShellCommand : '';
      const shellRisk = isShellTool ? classifyShellCommand(shellCommand) : undefined;
      if (shellRisk?.risk === 'destructive') tier = 'always';
      else if (shellRisk?.risk === 'safe-read') tier = 'silent';
      if (elevated) tier = 'always';

      const decision = decide(call.name, resource, tier, { rules: deps.ruleStore.activeRules(), denies: deps.ruleStore.activeDenies(), policy: deps.policy, mode: deps.getMode() });
      // Every NON-ask outcome is an auditable auto-decision (548-T2 contract):
      // mode, tool, resource class, matched rule, tier, decision and floor
      // status — the trace-side record of what ran without a human prompt.
      if (decision !== 'ask') {
        const matched = decision === 'deny'
          ? deps.ruleStore.activeDenies().find((d) => matchRule(d, call.name, resource))
          : deps.ruleStore.activeRules().find((r) => matchRule(r, call.name, resource));
        yield {
          type: 'permission-auto-decision',
          tool: call.name,
          resource,
          resourceClass: isShellTool ? (shellRisk?.risk ?? 'modify') : 'non-shell',
          decision: decision === 'deny' ? 'deny' : 'allow',
          matchedRule: matched ? `${matched.tool}(${matched.pattern})` : null,
          mode: deps.getMode(),
          tier,
          grantLifetime: 'none',
          floor: tier === 'always',
        };
      }
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
        if (resp.decision !== 'once' && !elevated) {
          const lifetime = resp.decision as Exclude<GrantLifetime, 'once'>;
          deps.ruleStore.grant({ tool: call.name, pattern: grantPatternFor(call.name, resource, lifetime) }, lifetime);
        }
      }

      yield { type: 'tool-executing', id: call.id, tool: call.name };
      let result: ToolResult;
      try { result = await def.handler(call.args); }
      catch (e) { result = { ok: false, output: e instanceof Error ? e.message : String(e) }; }
      yield { type: 'tool-result', id: call.id, tool: call.name, ok: result.ok, output: result.output };
      transcript.appendToolResult(call.id, result.output);
    }

    if (cancelledAt !== -1) {
      // The assistant message above already committed every proposed tool_use id
      // (calls.map(...)) — an unexecuted tail would leave orphan tool_use entries
      // with no tool_result, which the next provider call rejects. Pair each one
      // in the transcript with a synthetic cancelled result; these calls never
      // reached tool-executing, so (unlike an executed/denied call) no tool-result
      // view event fires for them either — the batch was simply cut short.
      for (const call of calls.slice(cancelledAt)) transcript.appendToolResult(call.id, '[cancelled]');
      yield { type: 'turn-end' };
      return;
    }
    // loop continues — the model sees the tool results on the next iteration.
  }
}
