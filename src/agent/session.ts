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
import { ToolRegistry } from './tools/registry.js';
import { Transcript } from './transcript.js';
import type { ProviderAdapter } from './provider-tooluse/types.js';

export interface AgentSessionDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  policy: PermissionPolicy;
  ruleStore: RuleStore;
  cwd: string;
  model: string;
  lang?: 'en' | 'tr';
  maxIterations?: number;
}

export interface AgentSession {
  send(userInput: string): AsyncIterable<AgentEvent>;
  respondPermission(id: string, response: PermissionResponse): void;
  cancel(): void;
  setApprovalMode(mode: ApprovalMode): void;
}

export function createAgentSession(deps: AgentSessionDeps): AgentSession {
  const transcript = new Transcript();
  /** Resolver waiting for a respondPermission call (set AFTER loop calls requestPermission). */
  const pending = new Map<string, (r: PermissionResponse) => void>();
  /** Pre-answers stored when respondPermission arrives before requestPermission is called. */
  const preAnswers = new Map<string, PermissionResponse>();
  let mode: ApprovalMode = deps.policy.defaultMode;
  let cancelled = false;

  const loopDeps: LoopDeps = {
    adapter: deps.adapter,
    registry: deps.registry,
    policy: deps.policy,
    ruleStore: deps.ruleStore,
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    maxIterations: deps.maxIterations,
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
    send(userInput: string): AsyncIterable<AgentEvent> {
      cancelled = false;
      pending.clear();
      preAnswers.clear();
      return runAgentTurn(loopDeps, transcript, userInput);
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
  };
}
