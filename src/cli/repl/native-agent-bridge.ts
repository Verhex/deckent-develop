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
import { primaryResource, writeTargets, type PermissionResponse } from '../../agent/loop.js';
import { decide, resolveTier } from '../../agent/permission.js';
import { checkSelfModifying } from '../../agent/guards/self-modifying.js';
import {
  BRIDGE_RISK_BY_TIER,
  PARITY_POLICY_DENIAL_PREFIX,
  PARITY_USER_REJECTION_PREFIX,
  asToolResult,
  type ToolSurfaceOptions,
} from './native-tool-registry.js';
import { meetsRiskThreshold } from '../../core/tool-dispatch.js';
import type { ToolRiskLevel as CoreToolRiskLevel } from '../../core/tool-registry.js';
import type { ApprovalMode } from '../../agent/permission-types.js';
import type { ToolInfo } from './app.js';
import type { ChatTurnQueue, ChatTurnPayload } from './chat-turn-queue.js';
import type { resolveNativeAgentBudget } from '../../core/execution-budget-policy.js';

/** The view's engine contract (same shape the legacy runChatNativeLoop satisfies).
 *  `onTurnEnd` intentionally stays `{inputTokens, outputTokens}` — no `elapsedMs`, unlike
 *  legacy's `{elapsedMs, usage?}` (chat-native.ts's `ChatNativeOptions.onTurnEnd`). This is
 *  a KNOWN, tracked divergence (NATIVE-M5-GATE KNOWN_DIVERGENCES id
 *  'onturnend-stats-shape', tests/cli/native-parity-gate.test.ts) — the practical gap is
 *  already closed for the one real consumer via `native-elapsed.ts`'s `measuredOnTurnEnd`
 *  (wired at app.tsx's nativeEngine call site), NOT here: widening this raw shape would
 *  require `runTurn` below to always emit `elapsedMs`, which breaks
 *  `tests/cli/native-agent-bridge.test.ts`'s exact `toEqual({inputTokens, outputTokens})`
 *  assertion on the raw engine contract. Leave as-is; see the divergence entry for the
 *  full disk-verified rationale. */
export interface ReplEngine {
  (
    input: string,
    cbs: { output: (text: string) => void; onTurnEnd: (stats: { inputTokens: number; outputTokens: number }) => void },
  ): Promise<void>;
  /**
   * born-493 (387-002) — bridges `/approve <mode>` to the native
   * AgentSession's OWN permission engine (session.ts's `setApprovalMode`,
   * previously a 0-caller dead export). Without this, `/approve full-auto`
   * only updated run.tsx's legacy-dispatcher-local `approvalMode` variable
   * (consumed by the run.tsx `dispatcher` object, used for slash-triggered
   * CLI-bridge tools) — the native session's OWN tool-use loop (loop.ts's
   * `decide()`, gating write/edit/bash calls the MODEL itself proposes)
   * never saw the mode change and kept asking every time, so "onay modu
   * ayarlandı" was a false claim for a native-engine session. Optional so a
   * bare function value (e.g. a test fake) still structurally satisfies
   * ReplEngine.
   */
  setApprovalMode?: (mode: ApprovalMode) => void;
}

export interface NativeEngineDeps {
  adapter: ProviderAdapter;
  registry: ToolRegistry;
  cwd: string;
  model: string;
  lang: 'en' | 'tr';
  /** Live adapter/model/context-budget overrides (read per provider call) — the
   *  seam the /model — /provider runtime switch drives. The session (and its
   *  cross-turn transcript) survives the switch; only the backend swaps. */
  getAdapter?: () => ProviderAdapter;
  getModel?: () => string;
  getContextBudgetTokens?: () => number | undefined;
  /** The existing confirm-queue trigger (run.tsx confirmTrigger). 'y'|'a'|'n'. */
  confirm: (summary: string, toolName: string) => Promise<'y' | 'a' | 'n'>;
  /** The existing tool/change-block sink (run.tsx toolSink). */
  toolSink: (info: ToolInfo) => void;
  maxIterations?: number;
  /** Config-resolved, multi-dimensional native-agent session budget. */
  nativeBudget?: ReturnType<typeof resolveNativeAgentBudget>;
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
  /**
   * born-607 CALLTOOL-EXEC-WIRE — the SAME mutable ToolSurfaceOptions object that
   * was passed to `buildNativeToolRegistry`. When present+enabled, this bridge
   * fills `execImpl` with the ENGINE-PARITY resolver (deny-rules → tierMap/floor →
   * self-mod elevation → approval-mode, the loop's own gate order) and `confirm`
   * with an allow-passthrough (the inner risk-threshold gate is DELEGATED to the
   * parity resolver — two askers would double-prompt). Absent → registry default
   * stays NOT_WIRED_EXEC (fail-closed).
   */
  toolSurface?: ToolSurfaceOptions;
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

/** Structural slice of the session's rule store the parity resolver consults. */
export interface ParityRuleStoreLike {
  activeRules(): ReturnType<ReturnType<typeof createRuleStore>['activeRules']>;
  activeDenies(): ReturnType<ReturnType<typeof createRuleStore>['activeDenies']>;
}

export interface ParityExecContext {
  registry: Pick<ToolRegistry, 'get'>;
  policy: ReturnType<typeof loadPolicy>;
  ruleStore: ParityRuleStoreLike;
  getMode: () => ApprovalMode;
  confirm: (summary: string, toolName: string) => Promise<'y' | 'a' | 'n'>;
  cwd: string;
  t: (key: string) => string;
  /**
   * born-607 P1 (advisor BEFORE-done): an EXPLICIT `tool_surface.riskThreshold`
   * is honored as an additional ask-floor — a decide()-'allow' (silent tier /
   * grant / full-auto) is escalated to ask when the target's bridged risk meets
   * the threshold. Absent (the default) → pure engine-parity, no extra floor.
   * Without this the config knob was dead on every production path.
   */
  riskThreshold?: CoreToolRiskLevel;
  /**
   * born-633 NESTED-HONESTY item(4) — the SAME run.tsx toolSink the loop's own
   * direct tool-call path reports through. A nested dispatch never reaches the
   * AgentSession's own 'tool-result' event (the loop only ever sees the OUTER
   * `deckent_call_tool` invocation), so without this the actual target tool
   * that ran stayed invisible in the toolSink/change-block log. Optional —
   * absent means the pre-633 behavior (no nested entry) is preserved byte-for-
   * byte, e.g. for callers/tests that don't wire it.
   */
  toolSink?: (info: ToolInfo) => void;
}

/** Resolves `key` via the injected localizer, falling back to `fallback` when
 *  the key isn't registered yet — the SAME unlocalized-key guard `runTurn`'s
 *  `localizeSignal` uses, hoisted here so `createParityExecImpl` (a
 *  free-standing exported function, outside `createNativeEngine`'s closure)
 *  can share it. Lets born-633's new nested-confirm hint (item 3) ship from
 *  day one even before messages.ts (out of this task's write-scope) gains a
 *  real translated entry for it. */
function localizeOrFallback(t: (key: string) => string, key: string, fallback: string): string {
  const label = t(key);
  return label === key ? fallback : label;
}

const NATIVE_AGENT_SIGNAL_KEYS = new Set([
  'native-budget.rounds-exhausted',
  'native-budget.toolcalls-exhausted',
  'native-budget.walltime-exhausted',
  'native-budget.tokens-exhausted',
  'native-budget.noprogress-terminated',
  'native.checkpoint.saved',
  'native.checkpoint.epoch-advanced',
  'native.checkpoint.degraded',
]);

/** Resolve stable native-agent codes at the CLI boundary. Unknown codes retain
 * the mechanism-provided fallback instead of exposing an untranslated key. */
export function localizeNativeAgentSignal(
  t: (key: string) => string,
  code: string | undefined,
  fallback: string,
): string {
  if (!code) return fallback;
  const key = NATIVE_AGENT_SIGNAL_KEYS.has(code) ? code : `native.${code}`;
  return localizeOrFallback(t, key, fallback);
}

/**
 * born-607 — ENGINE-PARITY exec resolver for `deckent_call_tool`. A nested
 * dispatch (call_tool → target) is NOT a model-proposed tool_use, so the loop's
 * own gate (loop.ts: deny-rules → tierMap/alwaysFloor → self-mod elevation →
 * approval-mode → grants) never sees it. This resolver re-applies the IDENTICAL
 * checks — same helpers, same order, same policy/ruleStore/mode instances —
 * then invokes the target's registered native handler. Divergence here is a
 * policy-bypass ramp (advisor born-607 P0: a user's deny-glob must hold on BOTH
 * paths). Nested asks never persist a grant ('a' degrades to once): the ask has
 * no per-resource pattern worth an 'always', and an elevated (self-modifying)
 * call must be re-confirmed every time anyway.
 */
export function createParityExecImpl(ctx: ParityExecContext) {
  return async ({ name, args }: { name: string; args: unknown }): Promise<unknown> => {
    const def = ctx.registry.get(name);
    if (!def) throw new Error(`unknown tool: ${name}`);
    const callArgs = (args && typeof args === 'object' && !Array.isArray(args))
      ? (args as Record<string, unknown>)
      : {};
    const resource = primaryResource(callArgs);
    const elevated = checkSelfModifying(ctx.cwd, writeTargets(callArgs)).elevated;
    let tier = resolveTier(def, ctx.policy);
    if (elevated) tier = 'always';
    let decision = decide(name, resource, tier, {
      rules: ctx.ruleStore.activeRules(),
      denies: ctx.ruleStore.activeDenies(),
      policy: ctx.policy,
      mode: ctx.getMode(),
    });
    if (decision === 'deny') throw new Error(`${PARITY_POLICY_DENIAL_PREFIX} ${name}`);
    // Explicit riskThreshold = extra ask-floor (see ParityExecContext.riskThreshold).
    if (
      decision === 'allow' &&
      ctx.riskThreshold !== undefined &&
      meetsRiskThreshold(BRIDGE_RISK_BY_TIER[tier], ctx.riskThreshold)
    ) {
      decision = 'ask';
    }
    if (decision === 'ask') {
      // born-633 item(3): this reuses the SAME confirm queue/UI as the
      // top-level model-proposed tool-use path, whose 'a' answer means
      // "always" (a PERSISTED grant — see toDecision below). The nested path
      // never persists 'a' (a fresh ruleStore lookup runs on every nested
      // call — see the "'a' degrade pin" test) — the label must say so, or
      // 'a' here silently overpromises what it does.
      const onceHint = localizeOrFallback(
        ctx.t,
        'native.nested_confirm_once',
        '(this call only — "always" is not saved for nested calls)',
      );
      const answer = await ctx.confirm(
        `${ctx.t('native.run_tool')}: ${name}${resource ? ` (${resource})` : ''} ${onceHint}`,
        name,
      );
      if (answer === 'n') throw new Error(`${PARITY_USER_REJECTION_PREFIX} ${name}`);
    }
    const handlerResult = await def.handler(callArgs);
    // born-633 item(4): the loop's own 'tool-result' event only ever sees the
    // OUTER deckent_call_tool invocation — record the REAL nested target call
    // too, nested-marked so it reads distinctly from a top-level tool-result.
    const handlerToolResult = asToolResult(handlerResult);
    ctx.toolSink?.({
      verb: `${name} — ${ctx.t('native.tool_ran')}`,
      target: resource,
      note: '[nested]',
      ...(handlerToolResult && !handlerToolResult.ok ? { failed: true } : {}),
    });
    return handlerResult;
  };
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
  // Hoisted (born-607): the parity resolver below must consult the SAME policy +
  // rule-store instances the session's loop uses — a second createRuleStore would
  // fork session-lifetime grant/deny state between direct and nested dispatch.
  const policy = loadPolicy(deps.cwd);
  const ruleStore = createRuleStore(deps.cwd);
  const session = createAgentSession({
    adapter: deps.adapter,
    registry: deps.registry,
    policy,
    ruleStore,
    cwd: deps.cwd,
    model: deps.model,
    lang: deps.lang,
    costGuard: cost,
    ...(deps.nativeBudget ? { nativeBudget: deps.nativeBudget } : {}),
    ...((deps.nativeBudget?.maxModelRounds ?? deps.maxIterations) !== undefined
      ? { maxIterations: deps.nativeBudget?.maxModelRounds ?? deps.maxIterations }
      : {}),
    ...(deps.getAdapter ? { getAdapter: deps.getAdapter } : {}),
    ...(deps.getModel ? { getModel: deps.getModel } : {}),
    ...(deps.getContextBudgetTokens ? { getContextBudgetTokens: deps.getContextBudgetTokens } : {}),
  });

  // born-607 CALLTOOL-EXEC-WIRE: arm `deckent_call_tool` with the engine-parity
  // resolver (see createParityExecImpl). Fills the shared options object in
  // place; dispatch reads it per-call.
  if (deps.toolSurface?.enabled) {
    deps.toolSurface.execImpl = createParityExecImpl({
      registry: deps.registry,
      policy,
      ruleStore,
      getMode: () => session.getApprovalMode(),
      confirm: deps.confirm,
      cwd: deps.cwd,
      t,
      toolSink: deps.toolSink,
      ...(deps.toolSurface.riskThreshold !== undefined
        ? { riskThreshold: deps.toolSurface.riskThreshold }
        : {}),
    });
    // Inner risk-threshold gate is delegated to the parity resolver above — a
    // second asker here would double-prompt (single-gate doctrine).
    deps.toolSurface.confirm = () => 'allow';
  }

  // Localize a loop signal by its stable code ('native.<code>' message key);
  // an unmapped/unlocalized code falls back to the loop's English default.
  const localizeSignal = (code: string | undefined, fallback: string): string =>
    localizeNativeAgentSignal(t, code, fallback);

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
          // `+=`: session.send() yields one 'usage' event per loop.ts round
          // (loop.ts:114-130), and a multi-tool-call turn runs multiple
          // rounds — a plain `=` here overwrote with each round and only the
          // LAST round's tokens reached onTurnEnd, undercounting the
          // displayed token/cost for any 2+-round turn (born-520).
          inputTokens += ev.inputTokens;
          outputTokens += ev.outputTokens;
          // accrual + ceiling check happen in the loop (via the threaded costGuard);
          // a crossed hard ceiling arrives here as an 'error' event, printed below.
          break;
        case 'error':
          cbs.output(`\n[${localizeSignal(ev.code, ev.message)}]`);
          break;
        case 'notice':
          // Honest degradation signal (truncated / context-compacted): visible
          // but non-fatal — silence here is what made a full context window
          // read as "the REPL died" (2026-07-07 incident).
          cbs.output(`\n[${localizeSignal(ev.code, ev.message)}]\n`);
          break;
        // 'tool-proposed' / 'tool-executing' are progress-only; 'turn-end' falls through.
      }
    }
    cbs.onTurnEnd({ inputTokens, outputTokens });
    if (deps.recordTurn) deps.recordTurn(session.transcript());
  };

  // TERM2-WIRE (356-011): bg-turns wiring is fully OFF by default — no queue
  // supplied, or `bgTurnsEnabled` unset/false → engine stays runTurn
  // unwrapped, so the flag-off path stays byte-identical to pre-356-011 (no
  // extra Promise hops, no queue reads at all).
  const bgQueue = deps.bgQueue;
  const engine: ReplEngine = (!bgQueue || !deps.bgTurnsEnabled)
    ? runTurn
    : async (input, cbs) => {
        bgQueue.userTurnActive = true;
        try {
          await runTurn(input, cbs);
        } finally {
          bgQueue.userTurnActive = false;
        }
        // Hermes rule (chat-turn-queue.ts): drainAsTurns() no-ops while
        // userTurnActive is true, so anything enqueued during the turn above
        // was buffered, never mid-turn-injected. Now that the turn is over,
        // drain and run each coalesced bucket as its own synthetic user turn
        // — through the SAME output/onTurnEnd/recordTurn pipeline as a real
        // turn.
        for (const payload of bgQueue.drainAsTurns()) {
          await runTurn(formatBgTurnInput(payload), cbs);
        }
      };
  // born-493 (387-002) — see the ReplEngine.setApprovalMode doc comment above.
  engine.setApprovalMode = (mode) => session.setApprovalMode(mode);
  return engine;
}
