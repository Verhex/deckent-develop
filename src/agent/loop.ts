// src/agent/loop.ts
// ═══ Agent loop — runAgentTurn (SP-1 §9, §13) ═══════════════════════════════
// The headless engine: append the user input, then repeatedly ask the model
// (via a ProviderAdapter), surface text + tool calls as AgentEvents, gate each
// tool call through the permission engine + guards, execute it, feed the result
// back, and continue until the model answers with no tool call (turn-end) or a
// limit/abort fires. View-neutral: permission suspension is an injected callback.

import type { AgentEvent, PermissionRequestEvent } from './events.js';
import { providerContextErrorCode } from './provider-tooluse/context-errors.js';
import { ProviderTransportError, resolveTransportRetryPolicy } from './provider-tooluse/transport-errors.js';
import {
  approximateReasoningTokens,
  planReasoning,
  planReasoningExhaustionRecovery,
  planReasoningRaiseFallback,
  resolveAdapterReasoningControl,
} from './reasoning-control.js';
import { composeSystemPrompt } from './identity.js';
import { decide, resolveTier } from './permission.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { GrantLifetime, RuleStore } from './permission-store.js';
import { grantPatternFor, type ApprovalMode } from './permission-types.js';
import { ToolRegistry, type NativeToolSchema } from './tools/registry.js';
import type { ToolResult } from './tools/types.js';
import { Transcript } from './transcript.js';
import type {
  ProviderAdapter, ProviderMessage, ProviderRequest, ProviderToolCall, RequestMeasurement,
} from './provider-tooluse/types.js';
import {
  recursionExceeded,
  createNativeBudgetState,
  evaluateNativeBudget,
  type NativeBudgetState,
} from './guards/recursion.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, type ResolvedNativeAgentBudget } from '../core/execution-budget-policy.js';
import { PreambleBudgetError, type PreambleBudgeter } from './preamble-budget.js';
import { brokerToolResult, ToolResultContextBudgetError, type ContentWriter } from './tool-result-broker.js';
import { checkSelfModifying } from './guards/self-modifying.js';
import { accrue, costExceeded, type CostGuardState } from './guards/cost.js';
import { classifyShellCommand } from './guards/shell-risk.js';
import {
  fitMessagesToBudget,
  derivePromptBudget,
  measureProviderRequest,
  digestProviderRequest,
  estimateMessageTokens,
  deriveMeasuredTokensPerUtf8Byte,
  measureRetainedToolResultTokens,
  providerRequestWireUtf8Bytes,
  sumToolResultUtf8Bytes,
  toolResultBytesToTokens,
} from './context-budget.js';
import type { BudgetCheckpointPressure } from './events.js';
import { previewBytesFromTokenShare } from './tool-result-broker.js';
import { matchRule } from './permission-types.js';
import type {
  NativePermissionBinding,
  NativePermissionLifetime,
} from './native-permission-binding.js';
import { classifyNativeToolApproval } from './native-tool-approval.js';
import type { NativeToolApprovalClassification } from './tools/types.js';
import { ALL_APPROVAL_RISKS, ALL_APPROVAL_SCOPES } from '../core/approval-contract.js';

const MAX_OUTPUT_CONTINUATIONS = 2;

/** 7108-b — carries an UNRELATED fault thrown by the preamble authority while
 *  the exhaustion retry is being re-prepared inside the provider try/catch, so
 *  it can be rethrown as-is instead of being relabeled a provider failure
 *  (7106 contract: preparation faults never masquerade as anything else). */
class UnrelatedPreparationFault extends Error {
  constructor(readonly fault: unknown) { super('unrelated preparation fault'); this.name = 'UnrelatedPreparationFault'; }
}
const CONTINUATION_INSTRUCTION = 'Continue the same answer exactly where it stopped. Do not repeat prior visible text.';

function isValidApprovalClassification(value: NativeToolApprovalClassification): boolean {
  return ALL_APPROVAL_SCOPES.includes(value.scope)
    && ALL_APPROVAL_RISKS.includes(value.risk)
    && typeof value.scopeId === 'string'
    && value.scopeId.trim().length > 0
    && value.scopeId === value.scopeId.trim()
    && typeof value.resource === 'string';
}

function removeRepeatedPrefix(previous: string, next: string): string {
  const max = Math.min(previous.length, next.length);
  for (let overlap = max; overlap > 0; overlap--) {
    if (previous.endsWith(next.slice(0, overlap))) return next.slice(overlap);
  }
  return next;
}

export type PermissionResponse =
  | {
      readonly decision: NativePermissionLifetime | 'deny';
      readonly binding: NativePermissionBinding;
    }
  | {
      readonly decision: 'hold';
      readonly reasonCode: string;
    };

export interface PermissionIssueInput {
  readonly callId: string;
  readonly tool: string;
  readonly rawArgs: Record<string, unknown>;
  readonly resource: string;
  readonly tier: import('./tools/types.js').ToolPermissionTier;
  readonly elevated: boolean;
  readonly nested: boolean;
  readonly approval: NativeToolApprovalClassification;
}

export interface LoopDeps {
  contentStore?: ContentWriter;
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
  preambleBudgeter?: PreambleBudgeter;
  /** current approval mode (read per-decision so setApprovalMode takes effect). */
  getMode: () => ApprovalMode;
  /** Session-owned identity registration. The invocation is registered before
   *  the returned event is yielded, so an immediate response is never unissued. */
  issuePermission: (input: PermissionIssueInput) => PermissionRequestEvent;
  /** view→core suspension: resolve with the user's choice on an 'ask' decision. */
  requestPermission: (req: PermissionRequestEvent) => Promise<PermissionResponse>;
  /** Non-consuming binding/lifecycle/argument check before a persistent grant. */
  validatePermission: (
    req: PermissionRequestEvent,
    response: PermissionResponse,
    rawArgs: Record<string, unknown>,
  ) => boolean;
  /** Revalidate and consume one exact issued invocation immediately before its
   *  effect. False means HOLD; callers never infer authority from the callback. */
  claimPermissionEffect: (
    req: PermissionRequestEvent,
    response: PermissionResponse,
    rawArgs: Record<string, unknown>,
  ) => boolean;
  /** Marks the actual top-level invocation whose handler is executing. Nested
   *  permission calls derive their parent call id from this session-owned seam. */
  enterToolExecution?: (callId: string) => () => void;
  /** cooperative cancellation between iterations. */
  isCancelled?: () => boolean;
  /** TERMINAL-TOOLS-008 — the current turn's abort signal (session-owned
   *  AbortController), threaded onto every ProviderRequest so the HTTP stream
   *  itself is torn down on cancel — not only skipped at the next event. */
  getTurnSignal?: () => AbortSignal | undefined;
  /** Optional per-session cost accumulator. When a hard ceilingUsd is configured
   *  and crossed, the turn aborts mid-stream (not advisory-only). Undefined → no
   *  cost gating at the loop level. */
  costGuard?: CostGuardState;
  /**
   * 7110 — post-checkpoint restart-loop guard (session-owned). Consulted at the
   * single execution point, AFTER every permission/policy check has passed for
   * this exact call: a non-undefined result is delivered as the tool result
   * (already a rendered envelope, so it bypasses the broker) and the handler is
   * NOT run. `undefined` → ordinary execution. The seam never widens authority:
   * a denied/held call never reaches it.
   */
  interceptToolCall?: (call: { readonly id: string; readonly name: string; readonly args: Record<string, unknown> }) => ToolResult | undefined;
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
  let system = composeSystemPrompt({
    cwd: deps.cwd,
    lang: deps.lang,
    ...(deps.scratchDir !== undefined ? { scratchDir: deps.scratchDir } : {}),
  });
  let iterations = 0;
  let lastPressureTranscript: string | undefined;
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
    let toolSchemas = deps.getProviderToolSchemas?.() ?? deps.registry.toNativeSchemas();
    const rawBudget = deps.getContextBudgetTokens?.();
    // NT-08: the generation room the prompt arithmetic reserves is also the
    // ceiling the backend is told to respect (adapter → `max_tokens`).
    // 7108: that ceiling now INCLUDES the hidden-reasoning room when the
    // model's descriptor proves reasoning shares the completion budget — the
    // same number feeds prompt fitting, admission and the wire, so a thinking
    // model can no longer spend the whole visible reserve on reasoning.
    const reasoningPolicy = deps.nativeBudget?.reasoning;
    // 7108-b: the descriptor await rides the turn's abort signal (and the
    // config-resolved probe deadline inside the transport) — never an
    // unbounded hang before the first request.
    const reasoningDescriptor = reasoningPolicy
      ? await resolveAdapterReasoningControl(adapter, model, deps.getTurnSignal?.())
      : undefined;
    const reasoningPlan = planReasoning({
      policy: reasoningPolicy, descriptor: reasoningDescriptor, structured: false,
      visibleReserveTokens: deps.nativeBudget?.outputReserveTokens ?? 0,
    });
    // `let`: the single exhaustion retry may raise it (config-bounded) — every
    // closure below reads the CURRENT value, so admission follows the raise.
    let outputCeilingTokens = reasoningPlan.outputCeilingTokens;
    const contextSafetyReserveTokens = deps.nativeBudget?.contextSafetyReserveTokens ?? 0;
    const transportRetry = resolveTransportRetryPolicy(deps.nativeBudget);
    // 7106 × 7108: the preamble hard limit subtracts the SAME inclusive ceiling
    // (visible reserve + proven reasoning room) — one authority, counted once.
    if (deps.preambleBudgeter && rawBudget !== undefined && rawBudget > 0) {
      try {
        const prepared = await deps.preambleBudgeter.prepare({
          compose: {cwd: deps.cwd, lang: deps.lang,
            ...(deps.scratchDir ? {scratchDir: deps.scratchDir} : {})},
          tools: toolSchemas, adapter, model, window: rawBudget,
          outputCeilingTokens, safetyReserveTokens: contextSafetyReserveTokens,
        });
        system = prepared.system; toolSchemas = prepared.tools;
      } catch (error) {
        if (!(error instanceof PreambleBudgetError)) throw error;
        yield {type: 'error', code: 'PREAMBLE_CONTEXT_BUDGET_EXHAUSTED', message: 'PREAMBLE_CONTEXT_BUDGET_EXHAUSTED'};
        yield {type: 'turn-end'};
        return;
      }
    }
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
    let lastTokensPerUtf8Byte = 1;
    const measureInflight = new Map<string, Promise<RequestMeasurement>>();
    const measureRequest = async (source: readonly ProviderMessage[]): Promise<RequestMeasurement> => {
      if (rawBudget === undefined || rawBudget <= 0) {
        return {
          inputTokens: 0,
          quality: 'exact',
          provenance: 'no-context-window',
          requestDigest: '',
          identity: {
            provider: adapter.name, model, contextWindowTokens: 0,
            contextProvenance: 'configured-narrowing',
          },
        };
      }
      const request = {
        system, messages: [...source], tools: toolSchemas, model,
        ...(outputCeilingTokens > 0 ? { outputCeilingTokens } : {}),
      };
      const requestDigest = digestProviderRequest(request);
      const inflightKey = `${adapter.name}\0${model}\0${rawBudget}\0${requestDigest}`;
      let inflight = measureInflight.get(inflightKey);
      if (!inflight) {
        inflight = measureProviderRequest({
          request,
          identity: {
            provider: adapter.name, model, contextWindowTokens: rawBudget,
            contextProvenance: 'configured-narrowing',
          },
          ...(adapter.requestMeasurement ? { capability: adapter.requestMeasurement } : {}),
        }).finally(() => { measureInflight.delete(inflightKey); });
        measureInflight.set(inflightKey, inflight);
      }
      const measurement = await inflight;
      lastTokensPerUtf8Byte = deriveMeasuredTokensPerUtf8Byte(
        measurement.inputTokens,
        providerRequestWireUtf8Bytes(request),
      );
      return measurement;
    };
    const measureMessages = async (source: readonly ProviderMessage[]): Promise<number> =>
      (await measureRequest(source)).inputTokens + outputCeilingTokens + contextSafetyReserveTokens;
    const tokenPressureJustification = (
      retainedTokens: number,
      capTokens: number,
      quality: BudgetCheckpointPressure['quality'],
      scope: BudgetCheckpointPressure['scope'],
    ): BudgetCheckpointPressure => ({
      retainedTokens,
      capTokens,
      windowTokens: rawBudget!,
      quality,
      scope,
    });
    const fitRequest = async (source: readonly ProviderMessage[]): Promise<{
      messages: ProviderMessage[];
      droppedCount: number;
      keptTokens: number;
      requiredTokens: number;
    }> => {
      const measured = await measureMessages(source);
      // Exact measurement is authority. The heuristic chooses a pairing-safe
      // candidate only after the whole request is proven too large.
      const needsFit = deps.nativeBudget === undefined || (rawBudget !== undefined && measured > rawBudget);
      const fit = needsFit && budget !== undefined && budget > 0
        ? fitMessagesToBudget(source, budget)
        : { messages: [...source], droppedCount: 0, estimatedTokens: source.reduce((n, m) => n + estimateMessageTokens(m), 0) };
      return {
        messages: fit.messages,
        droppedCount: fit.droppedCount,
        keptTokens: fit.estimatedTokens,
        requiredTokens: fit.droppedCount > 0 ? await measureMessages(fit.messages) : measured,
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

    let fitted = await fitRequest(transcript.toProviderMessages());
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
      const pressureTranscript = digestProviderRequest({ system, messages: transcript.toProviderMessages(), tools: toolSchemas, model });
      if (pressureTranscript !== lastPressureTranscript) {
        lastPressureTranscript = pressureTranscript;
        const admissionMeasure = await measureRequest(transcript.toProviderMessages());
        yield {
          type: 'budget-checkpoint-request', reason: 'token-pressure',
          rounds: budgetState?.rounds ?? iterations, toolCalls: budgetState?.toolCalls ?? 0,
          pressure: tokenPressureJustification(
            fitted.requiredTokens,
            Math.floor(rawBudget! * (deps.nativeBudget?.contextHighWaterRatio ?? DEFAULT_NATIVE_AGENT_BUDGET.contextHighWaterRatio)),
            admissionMeasure.quality,
            'full-request',
          ),
        };
      }
      // Re-fit silently: a consumer that ignored the checkpoint would otherwise
      // get the identical compaction notice twice for one round.
      fitted = await fitRequest(transcript.toProviderMessages());
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
      ...(reasoningPlan.directive ? { reasoning: reasoningPlan.directive } : {}),
      ...(transportRetry ? { transportRetry } : {}),
    };
    let assistantText = '';
    let calls: ProviderToolCall[] = [];
    let continuationIndex = 0;
    let continuationMessages = messages;
    // 7108 — the ONE bounded reasoning-exhaustion retry: fields it overrides on
    // the otherwise identical request (reasoning off, or a raised ceiling).
    let reasoningRetryOverride: Partial<Pick<ProviderRequest, 'reasoning' | 'outputCeilingTokens' | 'system' | 'tools'>> = {};
    let reasoningRetryUsed = false;
    try {
      while (true) {
        let segmentText = '';
        const segmentCalls: ProviderToolCall[] = [];
        let segmentStopReason: string | undefined;
        let hiddenReasoningObserved = false;
        let hiddenReasoningChars = 0;
        const turnSignal = deps.getTurnSignal?.();
        const segmentRequest: ProviderRequest = {
          ...req, ...reasoningRetryOverride, messages: continuationMessages, ...(turnSignal ? { signal: turnSignal } : {}),
        };
        if (continuationIndex > 0 && overContext(await measureMessages(continuationMessages))) {
          yield { type: 'error', code: 'native-context.admission-denied', message: 'native-context.admission-denied' };
          yield { type: 'turn-end' };
          return;
        }
        for await (const ev of adapter.send(segmentRequest)) {
        // Mid-stream cancel(): stop consuming further provider events instead of
        // running the in-flight turn to completion (breaking a for-await triggers
        // the adapter's iterator.return(), giving it a chance to abort cleanly).
        if (deps.isCancelled?.()) break;
        if (ev.type === 'request-measurement') {
          yield Object.freeze({ type: 'request-measurement', decision: ev.decision, purpose: 'turn' });
        }
        else if (ev.type === 'text-delta') {
          segmentText += ev.text;
          // Preserve ordinary streaming order. Continuation segments alone are
          // buffered until their overlap with already-visible text is known.
          if (continuationIndex === 0) yield { type: 'text-delta', text: ev.text };
        }
        else if (ev.type === 'reasoning-activity') {
          hiddenReasoningObserved = true;
          hiddenReasoningChars += ev.chars;
          // Metadata only (privacy contract 7086/RCA §3): counts, never text.
          yield { type: 'reasoning-activity', chars: ev.chars, cumulativeChars: hiddenReasoningChars };
        }
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
        // 7108 — reasoning exhausted the ceiling with NO visible text: a plain
        // continuation would resend the same prompt into the same trap (the
        // measured incident: four 4,096-token hidden-only generations, 0 output).
        // Instead: ONE retry of the SAME request with thinking off (when the
        // descriptor can toggle it) or a raised, config-bounded ceiling; a second
        // exhaustion ends the turn typed. Legacy callers (no native budget) keep
        // the classic continuation path byte-identical.
        if (classification === 'EMPTY_VISIBLE_AFTER_REASONING' && reasoningPolicy) {
          const reasoningTokens = String(approximateReasoningTokens(hiddenReasoningChars));
          const recovery = reasoningRetryUsed
            ? { kind: 'none' as const }
            : planReasoningExhaustionRecovery(reasoningPlan, reasoningPolicy);
          if (recovery.kind === 'none') {
            yield {
              type: 'generation-recovery', classification,
              continuationIndex, maxContinuations: MAX_OUTPUT_CONTINUATIONS,
              hiddenReasoningObserved, action: 'hold',
            };
            yield {
              type: 'error', code: 'native.reasoning_exhausted', message: 'native.reasoning_exhausted',
              vars: { reasoningTokens, ceiling: String(segmentRequest.outputCeilingTokens ?? outputCeilingTokens) },
            };
            yield { type: 'turn-end' };
            return;
          }
          reasoningRetryUsed = true;
          let action: 'retry-reasoning-off' | 'retry-raised-ceiling' = recovery.kind;
          if (recovery.kind === 'retry-raised-ceiling') {
            // 7108-b: a raised ceiling shrinks the preamble hard limit and the
            // transcript room — the retry must be re-prepared through the SAME
            // preamble-budget authority (reduced preamble or typed hold) and
            // re-admitted against the raised ceiling. Never a request that
            // breaks the transcript/preamble reserves, never a stale preamble.
            const exhaustedCeiling = outputCeilingTokens;
            outputCeilingTokens = recovery.outputCeilingTokens;
            let admitted = true;
            let raisedSystem = system;
            let raisedTools = toolSchemas;
            if (deps.preambleBudgeter && rawBudget !== undefined && rawBudget > 0) {
              try {
                const prepared = await deps.preambleBudgeter.prepare({
                  compose: {cwd: deps.cwd, lang: deps.lang,
                    ...(deps.scratchDir ? {scratchDir: deps.scratchDir} : {})},
                  tools: deps.getProviderToolSchemas?.() ?? deps.registry.toNativeSchemas(),
                  adapter, model, window: rawBudget,
                  outputCeilingTokens, safetyReserveTokens: contextSafetyReserveTokens,
                });
                raisedSystem = prepared.system; raisedTools = prepared.tools;
              } catch (error) {
                if (!(error instanceof PreambleBudgetError)) throw new UnrelatedPreparationFault(error);
                admitted = false;
              }
            }
            if (admitted) {
              // Admission reads the current bindings: measure the retry exactly as it would ship.
              const previousSystem = system; const previousTools = toolSchemas;
              system = raisedSystem; toolSchemas = raisedTools;
              admitted = !overContext(await measureMessages(continuationMessages));
              if (!admitted) { system = previousSystem; toolSchemas = previousTools; }
            }
            if (admitted) {
              reasoningRetryOverride = { outputCeilingTokens, system, tools: toolSchemas };
            } else {
              outputCeilingTokens = exhaustedCeiling;
              const fallback = planReasoningRaiseFallback(reasoningPlan, reasoningPolicy);
              if (fallback === 'none') {
                yield {
                  type: 'generation-recovery', classification,
                  continuationIndex, maxContinuations: MAX_OUTPUT_CONTINUATIONS,
                  hiddenReasoningObserved, action: 'hold',
                };
                yield {
                  type: 'error', code: 'native.reasoning_exhausted.retry-unadmissible',
                  message: 'native.reasoning_exhausted.retry-unadmissible',
                  vars: { reasoningTokens, ceiling: String(exhaustedCeiling), raised: String(recovery.outputCeilingTokens) },
                };
                yield { type: 'turn-end' };
                return;
              }
              action = fallback;
              reasoningRetryOverride = { reasoning: { mode: 'off' } };
            }
          } else {
            reasoningRetryOverride = { reasoning: { mode: 'off' } };
          }
          yield {
            type: 'generation-recovery', classification,
            continuationIndex, maxContinuations: MAX_OUTPUT_CONTINUATIONS,
            hiddenReasoningObserved, action,
          };
          yield {
            type: 'notice', code: 'native.reasoning_exhausted_output_ceiling',
            message: 'native.reasoning_exhausted_output_ceiling',
            vars: { action, reasoningTokens, ceiling: String(outputCeilingTokens) },
          };
          continue;
        }
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
      // 7108-b — an unrelated preamble-preparation fault surfaces as itself.
      if (e instanceof UnrelatedPreparationFault) throw e.fault;
      // TERMINAL-TOOLS-008 — an aborted stream is the user's own cancel, not a
      // provider failure: end the turn honestly, never as an 'error' event.
      if (deps.isCancelled?.() || (e instanceof Error && e.name === 'AbortError')) {
        yield { type: 'turn-end' };
        return;
      }
      // 7108 §3 — a typed transport failure names the real socket cause and
      // whether the bounded retry already ran, so the view can say
      // "connection dropped (ECONNRESET) — retried once" instead of "fetch failed".
      if (e instanceof ProviderTransportError) {
        // 7108-b: the code names the honest reason — retried N× (configured
        // count), not retried because the response had started, because the
        // failure is permanent (TLS/DNS/unknown), or because transportRetry=0.
        const codeByReason = {
          exhausted: 'native.transport-failure',
          'stream-phase': 'native.transport-failure.no-retry',
          permanent: 'native.transport-failure.permanent',
          'not-authorized': 'native.transport-failure.not-authorized',
        } as const;
        yield {
          type: 'error',
          code: codeByReason[e.noRetryReason],
          message: e.message,
          vars: {
            code: e.failure.code ?? e.failure.class, class: e.failure.class,
            retries: String(e.retries), configured: String(e.retryBudget), phase: e.phase,
          },
        };
        yield { type: 'turn-end' };
        return;
      }
      const contextCode = providerContextErrorCode(e);
      yield {
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
        ...(contextCode ? { code: contextCode } : {}),
      };
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
    // Reserve room for the incoming batch before publishing its tool-call
    // owner. A checkpoint here cannot orphan pending call/result pairs.
    if (calls.length > 0 && deps.nativeBudget && rawBudget !== undefined && rawBudget > 0) {
      const turnCapTokens = Math.floor(rawBudget * deps.nativeBudget.maxTurnToolResultShareOfContext);
      const singleCapTokens = Math.floor(rawBudget * deps.nativeBudget.maxToolResultShareOfContext);
      const desiredTokens = Math.min(
        singleCapTokens * calls.length,
        Math.floor(turnCapTokens * deps.nativeBudget.contextHighWaterRatio),
      );
      const retainedMeasure = await measureRetainedToolResultTokens(
        transcript.toProviderMessages(),
        measureRequest,
      );
      if (retainedMeasure.retainedTokens > 0 && turnCapTokens - retainedMeasure.retainedTokens < desiredTokens) {
        yield {
          type: 'budget-checkpoint-request', reason: 'token-pressure',
          rounds: budgetState?.rounds ?? iterations, toolCalls: budgetState?.toolCalls ?? 0,
          pressure: tokenPressureJustification(
            retainedMeasure.retainedTokens, turnCapTokens, retainedMeasure.quality, 'tool-results',
          ),
        };
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
      const resolveCurrentPermission = () => {
        const resource = primaryResource(call.args);
        const elevated = checkSelfModifying(deps.cwd, writeTargets(call.args)).elevated;
        let tier = resolveTier(def, deps.policy);
        const isShellTool = call.name === 'bash' || call.name.endsWith('_bash');
        const rawShellCommand = call.args['command'] ?? call.args['cmd'] ?? resource;
        const shellCommand = typeof rawShellCommand === 'string' ? rawShellCommand : '';
        const shellRisk = isShellTool ? classifyShellCommand(shellCommand) : undefined;
        let approval: NativeToolApprovalClassification | { readonly reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' };
        try {
          approval = classifyNativeToolApproval(def.approval, call.args, resource);
        } catch {
          approval = { reasonCode: 'NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE' };
        }
        if (shellRisk?.risk === 'destructive') tier = 'always';
        else if (shellRisk?.risk === 'safe-read') tier = 'silent';
        if (elevated) tier = 'always';
        return {
          resource,
          elevated,
          tier,
          isShellTool,
          shellRisk,
          approval,
          decision: decide(call.name, resource, tier, {
            rules: deps.ruleStore.activeRules(),
            denies: deps.ruleStore.activeDenies(),
            policy: deps.policy,
            mode: deps.getMode(),
          }),
        };
      };
      const initialPermission = resolveCurrentPermission();
      const { resource, elevated, tier, isShellTool, shellRisk, decision } = initialPermission;
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
      let permission: { request: PermissionRequestEvent; response: PermissionResponse } | undefined;
      if (decision === 'deny') {
        const output = '[denied by policy]';
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output };
        transcript.appendToolResult(call.id, output);
        continue;
      }
      if (decision === 'ask') {
        if ('reasonCode' in initialPermission.approval
          || !isValidApprovalClassification(initialPermission.approval)
          || initialPermission.approval.resource !== resource) {
          const code = 'native.permission.classification-unavailable';
          const output = code;
          yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output, code };
          transcript.appendToolResult(call.id, output);
          continue;
        }
        let prompt: PermissionRequestEvent;
        try {
          prompt = deps.issuePermission({
            callId: call.id,
            tool: call.name,
            rawArgs: call.args,
            resource,
            tier,
            elevated,
            nested: false,
            approval: initialPermission.approval,
          });
        } catch {
          const code = 'native.permission.binding-invalid';
          const output = code;
          yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output, code };
          transcript.appendToolResult(call.id, output);
          continue;
        }
        yield prompt;
        const resp = await deps.requestPermission(prompt);
        if (resp.decision === 'deny' || resp.decision === 'hold') {
          const cancelled = deps.isCancelled?.() === true;
          const code = !cancelled && resp.decision === 'hold'
            ? resp.reasonCode === 'terminal-restoration-unconfirmed'
              ? 'native.permission.terminal-unavailable'
              : 'native.permission.hold'
            : undefined;
          const output = cancelled
            ? '[cancelled]'
            : resp.decision === 'deny' ? '[rejected by user]' : code!;
          yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output, ...(code ? { code } : {}) };
          transcript.appendToolResult(call.id, output);
          if (deps.isCancelled?.()) { cancelledAt = callIndex + 1; break; }
          continue;
        }
        const beforeGrant = resolveCurrentPermission();
        const currentBeforeGrant = !deps.isCancelled?.()
          && call.name === prompt.tool
          && beforeGrant.resource === prompt.resource
          && beforeGrant.tier === prompt.tier
          && beforeGrant.elevated === prompt.invocation.elevated
          && !('reasonCode' in beforeGrant.approval)
          && beforeGrant.approval.scope === prompt.approval.scope
          && beforeGrant.approval.risk === prompt.approval.risk
          && beforeGrant.approval.scopeId === prompt.approval.scopeId
          && beforeGrant.approval.resource === prompt.approval.resource
          && beforeGrant.decision !== 'deny'
          && deps.validatePermission(prompt, resp, call.args);
        if (!currentBeforeGrant) {
          const code = deps.isCancelled?.() ? undefined : 'native.permission.no-longer-current';
          const output = code ?? '[cancelled]';
          yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output, ...(code ? { code } : {}) };
          transcript.appendToolResult(call.id, output);
          if (deps.isCancelled?.()) { cancelledAt = callIndex + 1; break; }
          continue;
        }
        // A self-modifying-elevated call never persists a grant — each deckent-source
        // write must be re-confirmed, or a single "always" would silently auto-approve
        // later source writes by this tool and defeat the guard (review follow-up #2).
        if (resp.decision !== 'once' && !elevated) {
          const lifetime = resp.decision as Exclude<GrantLifetime, 'once'>;
          try {
            deps.ruleStore.grant({ tool: call.name, pattern: grantPatternFor(call.name, resource, lifetime) }, lifetime);
          } catch {
            const code = 'native.permission.grant-failed';
            const output = code;
            yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output, code };
            transcript.appendToolResult(call.id, output);
            continue;
          }
        }
        permission = { request: prompt, response: resp };
      }

      yield { type: 'tool-executing', id: call.id, tool: call.name };
      const beforeEffect = resolveCurrentPermission();
      const livePolicyAllows = !deps.isCancelled?.()
        && call.name === def.name
        && beforeEffect.decision !== 'deny'
        && (permission === undefined
          || (beforeEffect.resource === permission.request.resource
            && beforeEffect.tier === permission.request.tier
            && beforeEffect.elevated === permission.request.invocation.elevated
            && !('reasonCode' in beforeEffect.approval)
            && beforeEffect.approval.scope === permission.request.approval.scope
            && beforeEffect.approval.risk === permission.request.approval.risk
            && beforeEffect.approval.scopeId === permission.request.approval.scopeId
            && beforeEffect.approval.resource === permission.request.approval.resource));
      const permissionClaimed = livePolicyAllows && (permission === undefined
        || deps.claimPermissionEffect(permission.request, permission.response, call.args));
      if (!livePolicyAllows || !permissionClaimed) {
        const code = deps.isCancelled?.() ? undefined : 'native.permission.no-longer-current';
        const output = code ?? '[cancelled]';
        yield { type: 'tool-result', id: call.id, tool: call.name, ok: false, output, ...(code ? { code } : {}) };
        transcript.appendToolResult(call.id, output);
        if (deps.isCancelled?.()) { cancelledAt = callIndex + 1; break; }
        continue;
      }
      // 7110 replay guard: a byte-identical read-only call already in the
      // checkpoint trail of this turn is served from the trail, not re-run.
      const replayed = deps.interceptToolCall?.({ id: call.id, name: call.name, args: call.args });
      let result: ToolResult;
      if (replayed !== undefined) {
        result = replayed;
      } else {
        const leaveToolExecution = deps.enterToolExecution?.(call.id);
        try { result = await def.handler(call.args); }
        catch (e) { result = { ok: false, output: e instanceof Error ? e.message : String(e) }; }
        finally { leaveToolExecution?.(); }
      }
      // 7106 preamble budgeter observes EVERY result the model will see —
      // a replayed envelope occupies context exactly like an executed one.
      deps.preambleBudgeter?.observeToolResult(call.name, call.args, result);
      // 7110: a replayed envelope is already brokered/bounded — never re-capped.
      if (replayed === undefined && deps.nativeBudget && rawBudget !== undefined && rawBudget > 0) {
        const singleShare = deps.nativeBudget.maxToolResultShareOfContext ?? DEFAULT_NATIVE_AGENT_BUDGET.maxToolResultShareOfContext;
        const turnShare = deps.nativeBudget.maxTurnToolResultShareOfContext ?? DEFAULT_NATIVE_AGENT_BUDGET.maxTurnToolResultShareOfContext;
        const turnCapTokens = Math.floor(rawBudget * turnShare);
        const singleCapTokens = Math.floor(rawBudget * singleShare);
        // In-flight batch: size against brokered UTF-8 bodies with the same measured
        // wire ratio — not the conservative full−nonTool probe (that upper-bounds each
        // body byte as a token and starves large parallel batches mid-turn).
        const retainedBytes = sumToolResultUtf8Bytes(transcript.toProviderMessages());
        const retainedTokens = toolResultBytesToTokens(retainedBytes, lastTokensPerUtf8Byte);
        const remainingTurnTokens = Math.max(0, turnCapTokens - retainedTokens);
        const perCallTokenCap = Math.min(
          singleCapTokens,
          Math.floor(remainingTurnTokens / (calls.length - callIndex)),
        );
        const previewBytes = previewBytesFromTokenShare(perCallTokenCap, lastTokensPerUtf8Byte);
        try {
          result = { ...result, output: brokerToolResult(result, {
            store: deps.contentStore ?? { write: () => { throw new Error('Session content store unavailable'); } },
            maxPreviewBytes: previewBytes, maxRenderedBytes: previewBytes,
          }) };
        } catch (error) {
          if (!(error instanceof ToolResultContextBudgetError)) throw error;
          for (const pending of calls.slice(callIndex)) transcript.appendToolResult(pending.id, '[context-budget-hold]');
          yield { type: 'error', code: error.code, message: error.code };
          yield { type: 'turn-end' };
          return;
        }
      }
      // A handler may attach a typed `meta.code` (7110: replay-served, content-ref
      // refusals) — surfaced on the event so the view localizes it; never on the wire.
      const resultCode = typeof result.meta?.['code'] === 'string' ? result.meta['code'] : undefined;
      yield { type: 'tool-result', id: call.id, tool: call.name, ok: result.ok, output: result.output, ...(resultCode ? { code: resultCode } : {}) };
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
    if (deps.nativeBudget && rawBudget !== undefined && rawBudget > 0) {
      const highWater = deps.nativeBudget.contextHighWaterRatio ?? DEFAULT_NATIVE_AGENT_BUDGET.contextHighWaterRatio;
      const turnCapTokens = Math.floor(rawBudget * (deps.nativeBudget.maxTurnToolResultShareOfContext ?? DEFAULT_NATIVE_AGENT_BUDGET.maxTurnToolResultShareOfContext));
      const highWaterWindow = Math.floor(rawBudget * highWater);
      const highWaterRetained = Math.floor(turnCapTokens * highWater);
      const messages = transcript.toProviderMessages();
      const totalMeasured = await measureMessages(messages);
      const retainedMeasure = await measureRetainedToolResultTokens(messages, measureRequest);
      if (totalMeasured >= highWaterWindow || retainedMeasure.retainedTokens >= highWaterRetained) {
        const pressureTranscript = digestProviderRequest({ system, messages, tools: toolSchemas, model });
        if (pressureTranscript !== lastPressureTranscript) {
          lastPressureTranscript = pressureTranscript;
          yield {
            type: 'budget-checkpoint-request', reason: 'token-pressure',
            rounds: budgetState?.rounds ?? iterations, toolCalls: budgetState?.toolCalls ?? 0,
            pressure: tokenPressureJustification(
              retainedMeasure.retainedTokens, highWaterRetained, retainedMeasure.quality, 'tool-results',
            ),
          };
        }
      }
    }
    // loop continues — the model sees the tool results on the next iteration.
  }
}
