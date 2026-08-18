// src/agent/session.ts
// ═══ AgentSession — the core's public API (SP-1 §9) ═════════════════════════
// Commands (view→core): send · respondPermission · cancel · setApprovalMode.
// Events (core→view): the AgentEvent stream returned by send(). The session
// owns the cross-turn Transcript, the pending-permission Promise registry that
// bridges the loop's await to the view's respondPermission, the mutable approval
// mode, and a per-turn cancellation flag. Transport-neutral: the same stream
// drives Ink / web-SSE / NDJSON.
//
// Timing note: the loop emits `permission-request` via `yield prompt` BEFORE it
// calls `deps.requestPermission(prompt)`. The `for await` consumer therefore
// runs `respondPermission` before `requestPermission` has set up its resolver.
// We handle this with a pre-answer cache: `respondPermission` stores the answer
// by id; `requestPermission` resolves immediately when a pre-answer exists.

import type { AgentEvent } from './events.js';
import { runAgentTurn, type LoopDeps, type PermissionResponse } from './loop.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { RuleStore } from './permission-store.js';
import type { ApprovalMode } from './permission-types.js';
import type { CostGuardState } from './guards/cost.js';
import { ToolRegistry } from './tools/registry.js';
import { Transcript } from './transcript.js';
import type { ProviderAdapter, ProviderMessage } from './provider-tooluse/types.js';
import { openScratchStore, type CheckpointReadResult, type ScratchCheckpointPayload, type ScratchStore } from './scratch-checkpoint.js';
import { createNativeBudgetState, type NativeBudgetState } from './guards/recursion.js';

export type NativeBudgetTerminalCode = `native-budget.${string}`;

export interface SessionBudgetExhaustedEvent {
  type: 'session-budget-exhausted';
  code: NativeBudgetTerminalCode;
  epoch: number;
  renewalHint: true;
}

export type AgentSessionEvent = AgentEvent | SessionBudgetExhaustedEvent;

export interface AgentSessionDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  policy: PermissionPolicy;
  ruleStore: RuleStore;
  cwd: string;
  model: string;
  lang?: 'en' | 'tr';
  maxIterations?: number;
  /** Optional per-session cost accumulator; a configured hard ceiling aborts the turn. */
  costGuard?: CostGuardState;
  /** Live adapter/model/context-budget overrides (read per provider call) — the
   *  seam a runtime /model — /provider switch uses WITHOUT rebuilding the
   *  session, so the cross-turn transcript survives the switch. Absent → the
   *  fixed `adapter`/`model` above (back-compat). */
  getAdapter?: () => ProviderAdapter;
  getModel?: () => string;
  getContextBudgetTokens?: () => number | undefined;
  /** NT-06 progressive tool surface — per-round provider schema view (loop.ts
   *  falls back to the full registry when absent). */
  getProviderToolSchemas?: LoopDeps['getProviderToolSchemas'];
  /** NATIVE-AGENT-HORIZON-001: resolved multi-dimension session budget. */
  nativeBudget?: import('../core/execution-budget-policy.js').ResolvedNativeAgentBudget;
  scratch?: { tenantId: string; projectId: string; sessionId: string; checkpointInstruction: string };
}

export interface AgentSession {
  send(userInput: string): AsyncIterable<AgentSessionEvent>;
  renewBudgetEpoch(): { epoch: number };
  respondPermission(id: string, response: PermissionResponse): void;
  cancel(): void;
  setApprovalMode(mode: ApprovalMode): void;
  /** Live approval mode — the call_tool parity resolver (born-607) reads this so a
   *  nested dispatch honors the SAME mode the loop's direct path would. */
  getApprovalMode(): ApprovalMode;
  /** The cross-turn transcript (a copy) — for trace recording. */
  transcript(): ProviderMessage[];
  latestCheckpoint(): CheckpointReadResult;
  close(options?: { keepForRecoveryMs?: number }): void;
}

export function createAgentSession(deps: AgentSessionDeps): AgentSession {
  const transcript = new Transcript();
  /** Resolver waiting for a respondPermission call (set AFTER loop calls requestPermission). */
  const pending = new Map<string, (r: PermissionResponse) => void>();
  /** Pre-answers stored when respondPermission arrives before requestPermission is called. */
  const preAnswers = new Map<string, PermissionResponse>();
  let mode: ApprovalMode = deps.policy.defaultMode;
  let cancelled = false;
  let turnSequence = 0;
  let budgetEpoch = 1;
  let exhausted: { code: NativeBudgetTerminalCode; at: number; epoch: number } | undefined;
  const scratch: ScratchStore | undefined = deps.scratch ? openScratchStore(deps.scratch) : undefined;
  let checkpointDegradation: CheckpointReadResult | undefined;

  async function* runWithCheckpoints(userInput: string, turnId: string): AsyncIterable<AgentSessionEvent> {
    const events = runAgentTurn(loopDeps, transcript, userInput);
    for await (const event of events) {
      if (event.type === 'error' && isNativeBudgetTerminalCode(event.code)) {
        exhausted = { code: event.code, at: Date.now(), epoch: budgetEpoch };
      }
      yield event;
      if ((event as { type: string }).type !== 'budget-checkpoint-request' || !scratch || !deps.scratch) continue;
      try {
        let text = '';
        const adapter = deps.getAdapter?.() ?? deps.adapter;
        const request = {
          system: deps.scratch.checkpointInstruction,
          messages: transcript.toProviderMessages(),
          tools: [],
          model: deps.getModel?.() ?? deps.model,
        };
        for await (const response of adapter.send(request)) if (response.type === 'text-delta') text += response.text;
        const payload = JSON.parse(text) as ScratchCheckpointPayload;
        scratch.writeCheckpoint(payload);
        transcript.compactForContextEpoch(userInput, text, turnId);
        checkpointDegradation = undefined;
      } catch (error) {
        checkpointDegradation = {
          status: 'corrupt',
          path: scratch.info.root,
          reason: `checkpoint-degraded: ${error instanceof Error ? error.message : String(error)}`,
        };
        // The existing epoch is deliberately left untouched on refusal/corruption.
      }
    }
  }

  const nativeBudgetState: NativeBudgetState | undefined = deps.nativeBudget ? createNativeBudgetState() : undefined;
  const loopDeps: LoopDeps = {
    adapter: deps.adapter,
    ...(deps.nativeBudget ? { nativeBudget: deps.nativeBudget } : {}),
    ...(nativeBudgetState ? { nativeBudgetState } : {}),
    registry: deps.registry,
    policy: deps.policy,
    ruleStore: deps.ruleStore,
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    maxIterations: deps.maxIterations,
    costGuard: deps.costGuard,
    ...(deps.getAdapter ? { getAdapter: deps.getAdapter } : {}),
    ...(deps.getModel ? { getModel: deps.getModel } : {}),
    ...(deps.getContextBudgetTokens ? { getContextBudgetTokens: deps.getContextBudgetTokens } : {}),
    ...(deps.getProviderToolSchemas ? { getProviderToolSchemas: deps.getProviderToolSchemas } : {}),
    getMode: () => mode,
    isCancelled: () => cancelled,
    requestPermission: (req) =>
      new Promise<PermissionResponse>((resolve) => {
        if (cancelled) { resolve({ decision: 'deny' }); return; }
        // If respondPermission (or cancel) already ran before this call, consume it.
        const pre = preAnswers.get(req.id);
        if (pre !== undefined) { preAnswers.delete(req.id); resolve(pre); return; }
        pending.set(req.id, resolve);
      }),
  };

  return {
    send(userInput: string): AsyncIterable<AgentSessionEvent> {
      cancelled = false;
      pending.clear();
      preAnswers.clear();
      if (exhausted) {
        const event: SessionBudgetExhaustedEvent = {
          type: 'session-budget-exhausted',
          code: exhausted.code,
          epoch: exhausted.epoch,
          renewalHint: true,
        };
        return (async function* exhaustedTurn(): AsyncIterable<AgentSessionEvent> {
          yield event;
          yield { type: 'turn-end' };
        })();
      }
      const turnId = `turn-${++turnSequence}`;
      transcript.setNextUserMetadata({ turnId, origin: 'user' });
      return runWithCheckpoints(userInput, turnId);
    },
    renewBudgetEpoch(): { epoch: number } {
      budgetEpoch++;
      exhausted = undefined;
      if (deps.nativeBudget) loopDeps.nativeBudgetState = createNativeBudgetState();
      return { epoch: budgetEpoch };
    },
    respondPermission(id: string, response: PermissionResponse): void {
      const resolve = pending.get(id);
      if (resolve) {
        // requestPermission already called — resolve it directly.
        pending.delete(id);
        resolve(response);
      } else {
        // requestPermission not yet called — stash as pre-answer.
        preAnswers.set(id, response);
      }
    },
    cancel(): void {
      cancelled = true;
      // Deny everything already parked; ids not yet requested are covered by the
      // `if (cancelled)` guard in requestPermission + the loop's isCancelled() checks.
      for (const [id, resolve] of pending) { pending.delete(id); resolve({ decision: 'deny' }); }
    },
    setApprovalMode(next: ApprovalMode): void {
      mode = next;
    },
    getApprovalMode(): ApprovalMode {
      return mode;
    },
    transcript(): ProviderMessage[] {
      return transcript.toProviderMessages();
    },
    latestCheckpoint(): CheckpointReadResult { return checkpointDegradation ?? scratch?.readLatestCheckpoint() ?? { status: 'empty' }; },
    close(options = {}): void {
      if (!scratch) return;
      const keep = options.keepForRecoveryMs ?? 0;
      scratch.close(keep > 0 ? { policy: 'keep-for-recovery', recoveryWindowMs: keep } : { policy: 'delete' });
    },
  };
}

function isNativeBudgetTerminalCode(code: string | undefined): code is NativeBudgetTerminalCode {
  return code?.startsWith('native-budget.') === true;
}
