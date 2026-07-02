// src/cli/repl/native-agent-bridge.ts
// ═══ Native agent bridge (SP-1 M3, §9) ══════════════════════════════════════
// The engine-swap target: builds an AgentSession and returns a ReplEngine — the
// same (input, {output, onTurnEnd}) shape app.tsx already drives. It maps the
// AgentEvent stream onto the existing view callbacks and bridges the permission
// lifecycle to the existing Sprint-285 confirm-queue (ConfirmTrigger) →
// respondPermission. View-neutral mapping; the legacy path is untouched.

import { createAgentSession } from '../../agent/session.js';
import { loadPolicy } from '../../agent/permission-policy.js';
import { createRuleStore } from '../../agent/permission-store.js';
import { createCostGuard } from '../../agent/guards/cost.js';
import type { ProviderAdapter } from '../../agent/provider-tooluse/types.js';
import type { ToolRegistry } from '../../agent/tools/registry.js';
import type { AgentEvent } from '../../agent/events.js';
import type { PermissionResponse } from '../../agent/loop.js';
import type { ToolInfo } from './app.js';
import type { ChatTurnQueue, ChatTurnPayload } from './chat-turn-queue.js';

/** The view's engine contract (same shape the legacy runChatNativeLoop satisfies). */
export type ReplEngine = (
  input: string,
  cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void },
) => Promise<void>;

export interface NativeEngineDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  cwd: string;
  model: string;
  lang: 'en' | 'tr';
  /** The existing confirm-queue trigger (run.tsx confirmTrigger). 'y'|'a'|'n'. */
  confirm: (summary: string, toolName: string) => Promise<'y' | 'a' | 'n'>;
  /** The existing tool/change-block sink (run.tsx toolSink). */
  toolSink: (info: ToolInfo) => void;
  maxIterations?: number;
  /** Optional hard cost ceiling (USD) for the session; undefined → advisory only. */
  costCeilingUsd?: number;
  /** Blended price per 1M tokens (default 3). */
  usdPerMillionTokens?: number;
  /** Localizer (run.tsx: (key) => getMessage(key, lang)). Defaults to identity. */
  t?: (key: string) => string;
  /** Optional: called with the full transcript after each completed turn (trace recording). */
  recordTurn?: (messages: import('../../agent/provider-tooluse/types.js').ProviderMessage[]) => void;
  /**
   * TERM2-WIRE (356-011) — caller-owned ChatTurnQueue instance. This bridge only
   * calls its public API (READ-ONLY: never edits chat-turn-queue.ts); the
   * caller owns the "event-source seam" — a follow-up task feeds real
   * sprint-done/task-done notify-events in via `bgQueue.enqueueBg(...)`.
   * Absent → bg-turns wiring is fully inert (byte-identical to pre-356-011).
   */
  bgQueue?: ChatTurnQueue;
  /**
   * `repl_surface.bg_turns ?? false` config seam — the real config lookup is a
   * follow-up (run.tsx wiring) task; default false. Even with `bgQueue`
   * supplied, no synthetic turn is ever produced unless this is explicitly true.
   */
  bgTurnsEnabled?: boolean;
}

/** Format one drained ChatTurnPayload (ChatTurnQueue.drainAsTurns()) as the
 *  synthetic user-turn input fed back into the session — one coalesced bucket
 *  becomes one turn. Mirrors app.tsx's `bgPayloadsToTurnTexts` shape, but each
 *  line carries a literal `[bg] ` marker since this text becomes real model
 *  input here (not a UI-only render), so the model can tell a
 *  background-notification turn apart from a genuine user message. */
export function formatBgTurnInput(payload: ChatTurnPayload): string {
  return payload.events.map((e) => `[bg] ${e.summary}`).join('\n');
}

/** Resolve an optional hard cost ceiling (USD) for the native session, so the
 *  loop-level guard (SP1-A1) is reachable on the real REPL path — not just in
 *  tests. Precedence: env override (DECKENT_NATIVE_COST_CEILING) → config
 *  (native_cost_ceiling_usd). A missing/invalid/non-positive value → undefined
 *  (advisory-only, no hard stop). */
export function resolveCostCeilingUsd(
  env: NodeJS.ProcessEnv,
  cfg: { native_cost_ceiling_usd?: unknown },
): number | undefined {
  const raw = env['DECKENT_NATIVE_COST_CEILING'];
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const c = cfg.native_cost_ceiling_usd;
  if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  return undefined;
}

/** Map a confirm-queue answer to a session permission decision. */
function toDecision(answer: 'y' | 'a' | 'n'): PermissionResponse {
  if (answer === 'n') return { decision: 'deny' };
  if (answer === 'a') return { decision: 'always' }; // persisted, matches "hep izin ver"
  return { decision: 'once' };
}

export function createNativeEngine(deps: NativeEngineDeps): ReplEngine {
  const t = deps.t ?? ((k: string): string => k);
  // The loop owns cost accrual + the hard-ceiling abort (SP1-A1) — the session
  // threads this guard into LoopDeps so the default-ON path enforces the ceiling,
  // not just the view layer. A crossed ceiling surfaces as an 'error' event below.
  const cost = createCostGuard({
    usdPerMillionTokens: deps.usdPerMillionTokens ?? 3,
    ...(deps.costCeilingUsd !== undefined ? { ceilingUsd: deps.costCeilingUsd } : {}),
  });
  const session = createAgentSession({
    adapter: deps.adapter,
    registry: deps.registry,
    policy: loadPolicy(deps.cwd),
    ruleStore: createRuleStore(deps.cwd),
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    costGuard: cost,
    ...(deps.maxIterations !== undefined ? { maxIterations: deps.maxIterations } : {}),
  });

  const runTurn: ReplEngine = async (input, cbs) => {
    let inputTokens = 0;
    let outputTokens = 0;
    for await (const ev of session.send(input) as AsyncIterable<AgentEvent>) {
      switch (ev.type) {
        case 'text-delta':
          cbs.output(ev.text);
          break;
        case 'permission-request': {
          const answer = await deps.confirm(`${t('native.run_tool')}: ${ev.tool}${ev.resource ? ` (${ev.resource})` : ''}`, ev.tool);
          session.respondPermission(ev.id, toDecision(answer));
          break;
        }
        case 'tool-result':
          deps.toolSink({ verb: `${ev.tool} — ${t('native.tool_ran')}`, target: '', ...(ev.ok ? {} : { failed: true }) });
          break;
        case 'usage':
          inputTokens = ev.inputTokens;
          outputTokens = ev.outputTokens;
          // accrual + ceiling check happen in the loop (via the threaded costGuard);
          // a crossed hard ceiling arrives here as an 'error' event, printed below.
          break;
        case 'error':
          cbs.output(`\n[${ev.message}]`);
          break;
        // 'tool-proposed' / 'tool-executing' are progress-only; 'turn-end' falls through.
      }
    }
    cbs.onTurnEnd({ inputTokens, outputTokens });
    if (deps.recordTurn) deps.recordTurn(session.transcript());
  };

  // TERM2-WIRE (356-011): bg-turns wiring is fully OFF by default — no queue
  // supplied, or `bgTurnsEnabled` unset/false → return runTurn unwrapped, so
  // the flag-off path stays byte-identical to pre-356-011 (no extra Promise
  // hops, no queue reads at all).
  const bgQueue = deps.bgQueue;
  if (!bgQueue || !deps.bgTurnsEnabled) return runTurn;

  return async (input, cbs) => {
    bgQueue.userTurnActive = true;
    try {
      await runTurn(input, cbs);
    } finally {
      bgQueue.userTurnActive = false;
    }
    // Hermes rule (chat-turn-queue.ts): drainAsTurns() no-ops while
    // userTurnActive is true, so anything enqueued during the turn above was
    // buffered, never mid-turn-injected. Now that the turn is over, drain and
    // run each coalesced bucket as its own synthetic user turn — through the
    // SAME output/onTurnEnd/recordTurn pipeline as a real turn.
    for (const payload of bgQueue.drainAsTurns()) {
      await runTurn(formatBgTurnInput(payload), cbs);
    }
  };
}
