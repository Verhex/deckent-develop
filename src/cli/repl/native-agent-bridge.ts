// src/cli/repl/native-agent-bridge.ts
// ═══ Native agent bridge (SP-1 M3, §9) ══════════════════════════════════════
// The engine-swap target: builds an AgentSession and returns a ReplEngine — the
// same (input, {output, onTurnEnd}) shape app.tsx already drives. It maps the
// AgentEvent stream onto the existing view callbacks and bridges the permission
// lifecycle to the existing Sprint-285 confirm-queue (ConfirmTrigger) →
// respondPermission. View-neutral mapping; the legacy path is untouched.

import { createHash } from 'node:crypto';
import {
  createAgentSession,
  REFERENCE_EXCERPT_CHARS,
  type AgentSessionEvent,
  type SessionBudgetExhaustedEvent,
  type StructuredTurnInput,
  type TurnReference,
} from '../../agent/session.js';
import { loadPolicy } from '../../agent/permission-policy.js';
import { createRuleStore } from '../../agent/permission-store.js';
import { createCostGuard } from '../../agent/guards/cost.js';
import { writeAuditEvent } from '../../core/audit-writer.js';
import type { ProviderAdapter, ProviderMessage, ProviderRequest } from '../../agent/provider-tooluse/types.js';
import type { ContentWriter } from '../../agent/tool-result-broker.js';
import type { ToolRegistry } from '../../agent/tools/registry.js';
import { createToolExposure } from '../../agent/tools/exposure.js';
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
import type { TurnRecordMeta } from './trace-wire.js';
import type { resolveNativeAgentBudget } from '../../core/execution-budget-policy.js';

/** Provider name recorded when the caller supplied no `getProvider` resolver —
 *  an honest sentinel, never a guessed provider id (a hardcoded provider name
 *  on a record path is exactly the drift the ledger exists to prevent). */
const UNRESOLVED_PROVIDER = 'unknown';

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
  /**
   * NT-03 (553-002) — bridges REPL teardown to the AgentSession's own scratch-store
   * teardown (session.ts's `close()`, itself a no-op when no `scratch` deps were
   * supplied). Optional so a bare function value (test fake) still structurally
   * satisfies ReplEngine, same rationale as `setApprovalMode` above.
   */
  close?: (options?: { keepForRecoveryMs?: number }) => void;
  /**
   * NATIVE-BUDGET-RENEWAL (557-002) — bridges the REPL's `/renew` slash to the
   * AgentSession's OWN explicit working-budget renewal (session.ts's
   * `renewBudgetEpoch()`). Renewal is ALWAYS user-driven: nothing in this bridge
   * ever calls it, so an exhausted session stays exhausted until the user asks.
   * It restarts only the working-budget epoch — billing/usage/cost counters are
   * untouched by the session layer. Optional so a bare function value (test fake,
   * legacy engine) still structurally satisfies ReplEngine, same rationale as
   * `setApprovalMode`/`close` above.
   */
  renewBudgetEpoch?: () => { epoch: number };
  /**
   * TERMINAL-TOOLS-008 — abort the turn in flight (session.cancel → the
   * per-turn AbortController → the provider HTTP stream is torn down at once;
   * a parked permission prompt is denied; the loop ends the turn with
   * `turn-end`, never an error). Returns `true` when a turn WAS in flight and
   * the abort was requested, `false` when idle. Optional for the same
   * structural reasons as the members above — the legacy engine has no seam,
   * and the REPL must say so instead of claiming a stop.
   */
  cancelTurn?: () => boolean;
  /** 7087 (562-001 hand-completion) — the SAME context-budget authority the
   *  loop's admission uses (run.tsx getContextBudgetTokens), exposed so the
   *  @ref expansion in app.tsx can size its inline-vs-descriptor decision
   *  from the real ceiling instead of a parallel estimate. Optional for the
   *  same structural reasons as the members above; absent → the caller keeps
   *  its legacy inline behavior (fail-safe, never fail-open). */
  getContextBudgetTokens?: () => number | undefined;
  /**
   * 7089 (NATIVE-SESSION-LEDGER) — load a previously-recorded transcript back
   * into this engine so a resumed session continues the SAME conversation
   * instead of starting blind. The messages ride VERBATIM ahead of every
   * subsequent provider request (and ahead of its token measurement), in the
   * order given. Calling it again REPLACES the hydrated prefix; hydrating an
   * empty array clears it and restores byte-identical un-hydrated behavior.
   *
   * The hydrated prefix is context the provider sees, not history this session
   * produced, so it is deliberately NOT re-emitted to `recordTurn` — the ledger
   * rows it came from are already on disk. Optional for the same structural
   * reasons as the members above.
   *
   * `options.nextTurnIndex` (564-004 hand-completion) — continues the recorder's
   * monotonic turn numbering after the hydrated rows: the FIRST post-resume turn
   * is recorded at this index instead of restarting at 0, so ledger ordering
   * keys never collide with the rows the prefix came from. Only a non-negative
   * integer is honored; absent/invalid → numbering is left untouched (fail-safe:
   * a legacy-history resume has no ledger rows to collide with and keeps 0).
   */
  hydrateTranscript?: (
    messages: import('../../agent/provider-tooluse/types.js').ProviderMessage[],
    options?: { nextTurnIndex?: number },
  ) => void;
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
  /** Live provider name for the same switch seam — stamped on every recorded
   *  turn so a ledger row names the backend that actually served it. Absent →
   *  {@link UNRESOLVED_PROVIDER}. */
  getProvider?: () => string;
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
  /**
   * Called with the full cross-turn transcript AND this turn's accounting after
   * each completed turn. 7089 (NATIVE-SESSION-LEDGER) unified what used to be
   * two half-seams: the `inputTokens`/`outputTokens` the turn accumulated (the
   * born-520 `+=` discipline) now reach the record layer through `meta.usage`
   * instead of dying at `onTurnEnd`, so the number rendered on screen and the
   * number persisted to disk are the same number.
   *
   * The transcript stays FULL here on purpose: a recorder owns its own delta
   * cursor (trace-wire.ts `createDeltaCursor`) and needs the whole transcript to
   * detect a context-epoch compaction. The bg-turn path below routes through the
   * same `runTurn`, so a synthetic turn carries this contract identically.
   */
  recordTurn?: (
    messages: import('../../agent/provider-tooluse/types.js').ProviderMessage[],
    meta: TurnRecordMeta,
  ) => void;
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
  /**
   * NT-03 (553-002) — scratch-session identity (tenantId/projectId/sessionId). The
   * caller (run.tsx) resolves the ids; this bridge appends the fixed
   * `CHECKPOINT_INSTRUCTION` mechanism text (see below) before threading the full
   * object into `createAgentSession`'s `scratch` dep. Absent → no scratch store
   * opens (session.ts's own byte-identical pre-wire behavior).
   */
  scratch?: { tenantId: string; projectId: string; sessionId: string };
  /**
   * 7089 (564-002 hand-completion) — the SAME session-scoped overflow store the
   * caller anchored into `buildNativeToolRegistry`, threaded here so
   * `createAgentSession` owns its teardown: `session.close()` closes it, and a
   * keep-for-recovery close leaves it alive exactly as long as the scratch
   * namespace (checkpoints may still cite its contentRefs). Absent → nothing to
   * close (the dispatcher's legacy store reaps itself by prefix).
   */
  contentStore?: ContentWriter;
}

/**
 * NT-03 (553-002) — fixed structured-checkpoint request sent to the provider as
 * `system` when the loop asks the session layer for a scratch checkpoint
 * (session.ts's `runWithCheckpoints`, on a `budget-checkpoint-request` event).
 * English mechanism text is the PROVIDER contract, not user-facing i18n (quality-bar
 * carve-out) — the model must reply with ONLY the JSON object below, matching
 * `ScratchCheckpointPayload` (scratch-checkpoint.ts) exactly.
 */
const CHECKPOINT_INSTRUCTION =
  'Summarize this session\'s progress as a single JSON object (no prose, no markdown fences) ' +
  'matching exactly this shape: {"schemaVersion":1,"objective":string,"findings":string[],' +
  '"evidenceRefs":string[],"decisions":string[],"unresolved":string[],"nextActions":string[],' +
  '"inspectedAreas":string[],"toolResultDigests":string[],"cumulativeCounters":{[name: string]: number},' +
  '"createdAt": ISO-8601 string}. Every array must contain short, concrete strings drawn from the ' +
  'actual conversation so far. Return ONLY the JSON object.';

/** NT-12 (553-002) — writeAuditEvent's partition for REPL-originated audit events;
 *  mirrors process-runtime.ts's own 'process' partition for non-sprint-bound events. */
const NATIVE_AGENT_AUDIT_PARTITION = 'repl';

// ═══ @ref lineage recovery (560-004, RCA §5) ════════════════════════════════
// app.tsx expands `@path` tokens into the OUTBOUND prompt at the submit boundary
// (at-ref.ts's expandAtRefs) — by the time a line reaches this engine the 26-char
// intent and a 99,327-char attachment are ONE string, and everything downstream
// (context epochs, compaction objectives) inherited that conflation. The `[@ref]`
// markers are a documented, English-canonical PROTOCOL (at-ref.ts's i18n note),
// so they are parseable back into the three carriers the session wants: the raw
// intent, the expanded payload actually sent this turn, and the identity of each
// reference (canonical path + digest + bounded excerpt).

/** Block separator expandAtRefs writes between the user's text and the first ref.
 *  Broadened (562-003) to match EITHER an inline `[@ref] ` block OR a budget-fallback
 *  `[@ref-descriptor] ` block — the literal used to be `'\n\n[@ref] '` (trailing space),
 *  which never matched a prompt whose first/only block was a descriptor (the incident
 *  shape: every ref over budget), silently losing the whole reference list. */
const AT_REF_BLOCK_MARKER = '\n\n[@ref';
/** `[@ref] <path>[ (truncated at N chars)]:` — a fenced expansion's header. */
const AT_REF_FENCED_HEADER = /^\[@ref\] (.+?)(?: \(truncated at \d+ chars\))?:$/;
/** `[@ref] <path> — unreadable (…)` — an honestly-noted failed reference. */
const AT_REF_UNREADABLE_HEADER = /^\[@ref\] (.+?) — unreadable \(/;
/** `[@ref-descriptor] <path> — <bytes> bytes, <lines> lines, sha256:<hex> — …` — a
 *  single-line, budget-fallback reference (562-001's `expandAtRefs`, at-ref.ts). No
 *  fenced body: the payload never left disk, so the lineage carries only its identity. */
const AT_REF_DESCRIPTOR_HEADER = /^\[@ref-descriptor\] (.+?) — (\d+) bytes, \d+ lines, sha256:([0-9a-f]+) — /;
const AT_REF_FENCE = /^`{3,}$/;

/** `parseAtRefLineage` + the descriptor-fallback count in one pass, so `runTurn` can
 *  render its typed info line without re-deriving the reference list. */
interface AtRefLineageResult { lineage: StructuredTurnInput; descriptorCount: number }

function deriveAtRefLineage(prompt: string): AtRefLineageResult {
  const markerIndex = prompt.indexOf(AT_REF_BLOCK_MARKER);
  if (markerIndex < 0) {
    return { lineage: { rawIntent: prompt, expandedPayload: prompt, references: [] }, descriptorCount: 0 };
  }
  const lines = prompt.slice(markerIndex + 2).split('\n');
  const references: TurnReference[] = [];
  let descriptorCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const unreadable = AT_REF_UNREADABLE_HEADER.exec(line);
    if (unreadable) {
      references.push({ path: unreadable[1] as string, digest: '', bytes: 0, excerpt: '', ok: false, truncated: false });
      continue;
    }
    const descriptor = AT_REF_DESCRIPTOR_HEADER.exec(line);
    if (descriptor) {
      descriptorCount++;
      references.push({
        path: descriptor[1] as string,
        digest: descriptor[3] as string,
        bytes: Number(descriptor[2]),
        excerpt: '',
        ok: true,
        truncated: false,
      });
      continue;
    }
    const fenced = AT_REF_FENCED_HEADER.exec(line);
    if (!fenced) continue;
    const fence = lines[i + 1];
    if (fence === undefined || !AT_REF_FENCE.test(fence)) continue;
    let end = i + 2;
    while (end < lines.length && lines[end] !== fence) end++;
    const body = lines.slice(i + 2, end).join('\n');
    references.push({
      path: fenced[1] as string,
      digest: createHash('sha256').update(body).digest('hex'),
      bytes: Buffer.byteLength(body, 'utf8'),
      excerpt: body.slice(0, REFERENCE_EXCERPT_CHARS),
      ok: true,
      truncated: line.endsWith(' chars):'),
    });
    i = end;
  }
  // A `[@ref` marker that parsed into nothing is just user text — never let a
  // failed parse silently split a real prompt in half.
  if (references.length === 0) {
    return { lineage: { rawIntent: prompt, expandedPayload: prompt, references: [] }, descriptorCount: 0 };
  }
  return { lineage: { rawIntent: prompt.slice(0, markerIndex), expandedPayload: prompt, references }, descriptorCount };
}

/**
 * Recover `{rawIntent, expandedPayload, references}` from an already-expanded
 * prompt. No `[@ref]`/`[@ref-descriptor]` block (the overwhelmingly common case) →
 * intent and payload are the same string and the reference list is empty, byte-identical
 * to the pre-560-004 behavior. Pure: no fs, no provider — hermetically testable.
 */
export function parseAtRefLineage(prompt: string): StructuredTurnInput {
  return deriveAtRefLineage(prompt).lineage;
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

// 560-005 (RCA §7) — the two loop-level codes carrying their own typed context-
// lifecycle class (see ContextLifecycleClass below). Named consts so
// NATIVE_AGENT_SIGNAL_KEYS and CONTEXT_LIFECYCLE_MESSAGE_KEY can never diverge
// on the same class's message key.
const INPUT_CONTEXT_OVERFLOW_KEY = 'native-context.admission-denied';
const CONTINUATION_EXHAUSTED_KEY = 'native-output.continuation-exhausted';
const OUTPUT_CEILING_REACHED_KEY = 'native.output-ceiling-reached';
const EMPTY_VISIBLE_WITH_REASONING_KEY = 'native.empty-visible-with-reasoning';
const REFERENCE_EXPANSION_CHECKPOINT_KEY = 'native.reference-expansion-checkpoint';
// 562-003 — the same REFERENCE_EXPANSION class family: a Task-1 (562-001) descriptor
// fallback is INFORMATION about what happened this turn, never a rejection.
const REFERENCE_DESCRIPTOR_FALLBACK_KEY = 'native.reference-descriptor-fallback';

const NATIVE_AGENT_SIGNAL_KEYS = new Set([
  'native-budget.rounds-exhausted',
  'native-budget.toolcalls-exhausted',
  'native-budget.walltime-exhausted',
  'native-budget.tokens-exhausted',
  'native-budget.noprogress-terminated',
  'native.checkpoint.saved',
  'native.checkpoint.epoch-advanced',
  'native.checkpoint.degraded',
  INPUT_CONTEXT_OVERFLOW_KEY,
  CONTINUATION_EXHAUSTED_KEY,
]);

/**
 * 560-005 (RCA §7) — the five typed context-lifecycle UX states. Terminal
 * OUTPUT exhaustion (OUTPUT_CEILING_REACHED / CONTINUATION_EXHAUSTED /
 * EMPTY_VISIBLE_CONTENT_WITH_REASONING) must never read like a genuine
 * INPUT_CONTEXT_OVERFLOW, and vice versa — today's "context window may be
 * full" mislabel on a plain output-exhaustion event is the bug this type
 * exists to prevent. REFERENCE_EXPANSION_REQUIRES_CHECKPOINT covers the
 * distinct case where expanded @ref material forces a mid-turn checkpoint.
 */
export type ContextLifecycleClass =
  | 'INPUT_CONTEXT_OVERFLOW'
  | 'OUTPUT_CEILING_REACHED'
  | 'CONTINUATION_EXHAUSTED'
  | 'EMPTY_VISIBLE_CONTENT_WITH_REASONING'
  | 'REFERENCE_EXPANSION_REQUIRES_CHECKPOINT';

const CONTEXT_LIFECYCLE_MESSAGE_KEY: Record<ContextLifecycleClass, string> = {
  INPUT_CONTEXT_OVERFLOW: INPUT_CONTEXT_OVERFLOW_KEY,
  OUTPUT_CEILING_REACHED: OUTPUT_CEILING_REACHED_KEY,
  CONTINUATION_EXHAUSTED: CONTINUATION_EXHAUSTED_KEY,
  EMPTY_VISIBLE_CONTENT_WITH_REASONING: EMPTY_VISIBLE_WITH_REASONING_KEY,
  REFERENCE_EXPANSION_REQUIRES_CHECKPOINT: REFERENCE_EXPANSION_CHECKPOINT_KEY,
};

/**
 * Classify one AgentSessionEvent into a typed context-lifecycle UX class, or
 * `undefined` when the event carries none of the five (e.g. a non-token-
 * pressure checkpoint reason, or any other event type) — pure, so the
 * 5-way separation is directly unit-testable without driving the real loop.
 */
export function classifyContextLifecycleEvent(ev: AgentSessionEvent): ContextLifecycleClass | undefined {
  if (ev.type === 'error' && ev.code === INPUT_CONTEXT_OVERFLOW_KEY) return 'INPUT_CONTEXT_OVERFLOW';
  if (ev.type === 'error' && ev.code === CONTINUATION_EXHAUSTED_KEY) return 'CONTINUATION_EXHAUSTED';
  if (ev.type === 'generation-recovery' && ev.action === 'continue') {
    return ev.classification === 'EMPTY_VISIBLE_AFTER_REASONING'
      ? 'EMPTY_VISIBLE_CONTENT_WITH_REASONING'
      : 'OUTPUT_CEILING_REACHED';
  }
  if (ev.type === 'budget-checkpoint-request' && ev.reason === 'token-pressure') {
    return 'REFERENCE_EXPANSION_REQUIRES_CHECKPOINT';
  }
  return undefined;
}

/** Localize a typed context-lifecycle class via the injected localizer. */
export function localizeContextLifecycleClass(t: (key: string) => string, cls: ContextLifecycleClass): string {
  return t(CONTEXT_LIFECYCLE_MESSAGE_KEY[cls]);
}

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

/** NATIVE-BUDGET-RENEWAL (557-002) — i18n key of the single offer line shown when
 *  a session's working budget is exhausted (`{dimension}` = the localized
 *  `native-budget.*-exhausted` line for the dimension that ran out). */
const RENEWAL_OFFER_KEY = 'native-budget.renewal-offer';

/**
 * NATIVE-BUDGET-RENEWAL (557-002) — per-session offer gate. session.ts keeps the
 * exhaustion latched: EVERY further `send()` re-yields the same
 * `session-budget-exhausted` event, so rendering it unconditionally would repeat
 * the offer on every message the user types (offer spam = the task's explicit
 * NO_GO). The gate fingerprints `code#epoch` and returns the localized line only
 * the first time it sees one — a renewal advances the epoch, so a LATER
 * exhaustion is a genuinely new offer and is shown again.
 */
export function createBudgetRenewalOffer(
  t: (key: string) => string,
): (event: SessionBudgetExhaustedEvent) => string | undefined {
  let offered: string | undefined;
  return (event) => {
    const fingerprint = `${event.code}#${event.epoch}`;
    if (fingerprint === offered) return undefined;
    offered = fingerprint;
    const dimension = localizeNativeAgentSignal(t, event.code, event.code);
    return t(RENEWAL_OFFER_KEY).replace('{dimension}', dimension);
  };
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
  // NT-06 progressive tool surface — this session's monotonic exposure view.
  // Flag-gated on the RESOLVED `tool_surface.progressive` (resolveToolSurfaceOptions
  // admits only a literal `true`, fail-closed): flag absent/false constructs NOTHING,
  // so the provider surface stays the full eager list, byte-identical to pre-NT-06.
  // Filled onto the shared ToolSurfaceOptions object in place — the SAME pattern
  // `execImpl`/`confirm` use below, and the only seam available here: run.tsx (not
  // this bridge) calls buildNativeToolRegistry, so that mutable options object is
  // what actually reaches the registered meta-tools. deckent_describe_tool and
  // deckent_call_tool read `opts.exposure` per call, so this assignment is what
  // makes a describe/call reveal into THIS session's view.
  const exposure = deps.toolSurface?.progressive === true
    ? createToolExposure({ progressive: true }, deps.registry)
    : undefined;
  if (exposure && deps.toolSurface) deps.toolSurface.exposure = exposure;

  // 7089 (NATIVE-SESSION-LEDGER) — the re-hydration seam. `session.ts` owns the
  // Transcript and exposes no seed, so hydration is applied at the ONE boundary
  // this bridge does own: every provider request (and its token measurement)
  // gets the hydrated messages prepended VERBATIM. Empty prefix → the request
  // object is passed through untouched, so an un-hydrated session stays
  // byte-identical to pre-7089.
  const hydrated: ProviderMessage[] = [];
  const withHydratedPrefix = (req: ProviderRequest): ProviderRequest =>
    (hydrated.length === 0 ? req : { ...req, messages: [...hydrated, ...req.messages] });
  const hydrating = (base: ProviderAdapter): ProviderAdapter => ({
    get name() { return base.name; },
    ...(base.requestMeasurement
      // Measure the request the backend will actually receive — a measurement
      // that ignored the prefix would under-count and fail admission OPEN.
      ? {
          requestMeasurement: {
            measure: (req: ProviderRequest, signal: AbortSignal) =>
              base.requestMeasurement!.measure(withHydratedPrefix(req), signal),
          },
        }
      : {}),
    send: (req: ProviderRequest) => base.send(withHydratedPrefix(req)),
  });

  const session = createAgentSession({
    adapter: hydrating(deps.adapter),
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
    ...(deps.getAdapter ? { getAdapter: (): ProviderAdapter => hydrating(deps.getAdapter!()) } : {}),
    ...(deps.getModel ? { getModel: deps.getModel } : {}),
    ...(deps.getContextBudgetTokens ? { getContextBudgetTokens: deps.getContextBudgetTokens } : {}),
    // NT-06 consumer half (554-002 tech-debt closure, Brain hand-completion):
    // the per-round provider schema view is the exposure filter — a tool
    // revealed by describe/call in round N rides round N+1's request.
    ...(exposure
      ? { getProviderToolSchemas: () => deps.registry.toNativeSchemas((def) => exposure.isExposed(def.name)) }
      : {}),
    ...(deps.scratch ? { scratch: { ...deps.scratch, checkpointInstruction: CHECKPOINT_INSTRUCTION } } : {}),
    ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
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

  // NATIVE-BUDGET-RENEWAL (557-002) — one gate per engine (per session), so the
  // dedup survives across turns exactly as long as the exhaustion itself does.
  const renewalOffer = createBudgetRenewalOffer(t);

  // 7089 — monotonic per-session turn index stamped on every recorded turn
  // (real and bg-synthetic alike, since both run through `runTurn`). It is the
  // ledger's ordering key, so it must never restart or skip within a session.
  let turnIndex = 0;
  /** TERMINAL-TOOLS-008 — turns currently inside runTurn (0 or 1 on the REPL
   *  path; the bg-turn wrapper below runs its drained turns sequentially). */
  let turnsInFlight = 0;

  const runTurnInner: ReplEngine = async (input, cbs) => {
    let inputTokens = 0;
    let outputTokens = 0;
    // 560-004: the three carriers are separated HERE, at the last seam before the
    // session — the live turn still rides the expanded payload, but a context
    // epoch now compacts onto the raw intent plus reference identity.
    const { lineage, descriptorCount } = deriveAtRefLineage(input);
    // 562-003 — ONE typed info line per turn when Task 1's budget-aware @ref
    // expansion (at-ref.ts's expandAtRefs) fell back to a descriptor for at least
    // one reference. Rendered BEFORE dispatch: this is a heads-up on what the
    // model is about to do (read the rest itself via deckent_read_file), not a
    // verdict on the turn — never gated behind success/failure of the send below.
    if (descriptorCount > 0) {
      cbs.output(`\n[${t(REFERENCE_DESCRIPTOR_FALLBACK_KEY).replace('{n}', String(descriptorCount))}]\n`);
    }
    for await (const ev of session.send(lineage) as AsyncIterable<AgentSessionEvent>) {
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
        case 'permission-auto-decision':
          // NT-12 (553-002) — the trace snapshot is NOT the audit record: every
          // auto-decision (silent tierMap allow/deny, no confirm-queue round trip)
          // is persisted durably here via the same hash-chained audit-writer every
          // other subsystem uses (writeAuditEvent is itself fail-safe on I/O).
          writeAuditEvent(deps.cwd, NATIVE_AGENT_AUDIT_PARTITION, {
            tenantId: deps.scratch?.tenantId ?? 'local',
            actor: 'native-agent',
            action: `permission.auto-decision.${ev.decision}`,
            target: ev.tool,
            metadata: {
              resource: ev.resource,
              resourceClass: ev.resourceClass,
              matchedRule: ev.matchedRule,
              mode: ev.mode,
              tier: ev.tier,
              grantLifetime: ev.grantLifetime,
              floor: ev.floor,
            },
          });
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
        case 'error': {
          cbs.output(`\n[${localizeSignal(ev.code, ev.message)}]`);
          // 560-005 (RCA §7) — durable, privacy-safe record of a typed
          // context-lifecycle terminal state (code + measured token counters
          // only — never the prompt body or the streamed answer text).
          const errorLifecycleClass = classifyContextLifecycleEvent(ev);
          if (errorLifecycleClass) {
            writeAuditEvent(deps.cwd, NATIVE_AGENT_AUDIT_PARTITION, {
              tenantId: deps.scratch?.tenantId ?? 'local',
              actor: 'native-agent',
              action: `context-lifecycle.${errorLifecycleClass}`,
              target: deps.scratch?.sessionId ?? 'session',
              metadata: { code: ev.code, measuredInputTokens: inputTokens, measuredOutputTokens: outputTokens },
            });
          }
          break;
        }
        case 'generation-recovery':
        case 'budget-checkpoint-request': {
          // 560-005 (RCA §7) — classify + render the typed context-lifecycle
          // states these two event types carry; `undefined` (e.g. a
          // non-token-pressure checkpoint reason) stays silent, matching
          // pre-task behavior for reasons outside this task's scope.
          const lifecycleClass = classifyContextLifecycleEvent(ev);
          if (lifecycleClass) cbs.output(`\n[${localizeContextLifecycleClass(t, lifecycleClass)}]\n`);
          // Privacy-safe lifecycle audit for EVERY generation-recovery /
          // checkpoint-request event, not just the ones with a rendered
          // message — continuation index, stop-reason classification,
          // hidden-reasoning-observed bool, recovery action, checkpoint
          // reason/rounds/toolCalls, and measured token counters ONLY;
          // never the prompt body, transcript delta, or streamed text.
          writeAuditEvent(deps.cwd, NATIVE_AGENT_AUDIT_PARTITION, {
            tenantId: deps.scratch?.tenantId ?? 'local',
            actor: 'native-agent',
            action: `context-lifecycle.${lifecycleClass ?? ev.type}`,
            target: deps.scratch?.sessionId ?? 'session',
            metadata: ev.type === 'generation-recovery'
              ? {
                  stopReason: ev.classification,
                  continuationIndex: ev.continuationIndex,
                  maxContinuations: ev.maxContinuations,
                  hiddenReasoningObserved: ev.hiddenReasoningObserved,
                  recoveryAction: ev.action,
                  measuredInputTokens: inputTokens,
                  measuredOutputTokens: outputTokens,
                }
              : {
                  reason: ev.reason,
                  rounds: ev.rounds,
                  toolCalls: ev.toolCalls,
                  measuredInputTokens: inputTokens,
                  measuredOutputTokens: outputTokens,
                },
          });
          break;
        }
        case 'session-budget-exhausted': {
          // ONE offer per exhaustion (see createBudgetRenewalOffer) — the
          // session refuses every further provider turn until the user types
          // `/renew`; nothing here renews on the user's behalf.
          const offer = renewalOffer(ev);
          if (offer) cbs.output(`\n[${offer}]\n`);
          break;
        }
        case 'notice':
          // Honest degradation signal (truncated / context-compacted): visible
          // but non-fatal — silence here is what made a full context window
          // read as "the REPL died" (2026-07-07 incident).
          cbs.output(`\n[${localizeSignal(ev.code, ev.message)}]\n`);
          // 560-004: a context epoch is a durable state transition, so it rides
          // the SAME canonical hash-chained audit sink every other subsystem
          // uses. Privacy-safe by construction: the stable CODE only — never the
          // prompt body, the transcript delta or the checkpoint text.
          if (ev.code.startsWith('native.checkpoint.')) {
            writeAuditEvent(deps.cwd, NATIVE_AGENT_AUDIT_PARTITION, {
              tenantId: deps.scratch?.tenantId ?? 'local',
              actor: 'native-agent',
              action: ev.code,
              target: deps.scratch?.sessionId ?? 'session',
              metadata: {},
            });
          }
          break;
        // 'tool-proposed' / 'tool-executing' are progress-only; 'turn-end' falls through.
      }
    }
    cbs.onTurnEnd({ inputTokens, outputTokens });
    // 7089 — ONE seam: the same accumulated counters `onTurnEnd` just reported
    // now ride into the record layer, so usage reaches disk instead of dying at
    // the view boundary.
    if (deps.recordTurn) {
      deps.recordTurn(session.transcript(), {
        usage: { inputTokens, outputTokens },
        model: deps.getModel?.() ?? deps.model,
        provider: deps.getProvider?.() ?? UNRESOLVED_PROVIDER,
        turnIndex: turnIndex++,
      });
    }
  };

  // TERM2-WIRE (356-011): bg-turns wiring is fully OFF by default — no queue
  // supplied, or `bgTurnsEnabled` unset/false → engine stays runTurn
  // unwrapped, so the flag-off path stays byte-identical to pre-356-011 (no
  // extra Promise hops, no queue reads at all).
  // TERMINAL-TOOLS-008 — in-flight bookkeeping for cancelTurn (below): the
  // seam must refuse while idle, so a stray Esc never cancels the NEXT turn.
  const runTurn: ReplEngine = async (input, cbs) => {
    turnsInFlight++;
    try {
      await runTurnInner(input, cbs);
    } finally {
      turnsInFlight--;
    }
  };
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
  // TERMINAL-TOOLS-008 — see the ReplEngine.cancelTurn doc comment above.
  engine.cancelTurn = () => {
    if (turnsInFlight === 0) return false;
    session.cancel();
    return true;
  };
  // born-493 (387-002) — see the ReplEngine.setApprovalMode doc comment above.
  engine.setApprovalMode = (mode) => session.setApprovalMode(mode);
  // NT-03 (553-002) — see the ReplEngine.close doc comment above.
  engine.close = (options) => session.close(options);
  // NATIVE-BUDGET-RENEWAL (557-002) — see the ReplEngine.renewBudgetEpoch doc
  // comment above; only run.tsx's explicit `/renew` slash ever calls this.
  engine.renewBudgetEpoch = () => session.renewBudgetEpoch();
  // 7087 — see the ReplEngine.getContextBudgetTokens doc comment above.
  if (deps.getContextBudgetTokens) engine.getContextBudgetTokens = deps.getContextBudgetTokens;
  // 7089 — the SINGLE re-hydration entrypoint (app.tsx's native `/resume`).
  // Defensive copies: the caller's array/messages stay its own.
  engine.hydrateTranscript = (messages, options) => {
    hydrated.splice(0, hydrated.length, ...messages.map((message) => ({ ...message })));
    // 564-004 hand-completion — recordTurn continuity: a ledger resume passes
    // its on-disk row count so the next recorded turn continues the session's
    // ordering key instead of restarting at 0 (see the interface doc above).
    if (options?.nextTurnIndex !== undefined
      && Number.isInteger(options.nextTurnIndex) && options.nextTurnIndex >= 0) {
      turnIndex = options.nextTurnIndex;
    }
  };
  return engine;
}
