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

import { createHash } from 'node:crypto';
import type { AgentEvent } from './events.js';
import { runAgentTurn, type LoopDeps, type PermissionResponse } from './loop.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { RuleStore } from './permission-store.js';
import type { ApprovalMode } from './permission-types.js';
import { accrue, type CostGuardState } from './guards/cost.js';
import { ToolRegistry } from './tools/registry.js';
import { Transcript } from './transcript.js';
import type {
  ProviderAdapter,
  ProviderContextIdentity,
  ProviderMessage,
  ProviderRequest,
} from './provider-tooluse/types.js';
import { decideProviderAdmission, estimateTokens, measureProviderRequest } from './context-budget.js';
import { openScratchStore, type CheckpointReadResult, type ScratchCheckpointPayload, type ScratchStore } from './scratch-checkpoint.js';
import { createNativeBudgetState, type NativeBudgetState } from './guards/recursion.js';
import type { ContentWriter } from './tool-result-broker.js';
import { projectSlug } from '../core/project-slug.js';

export type NativeBudgetTerminalCode = `native-budget.${string}`;

export interface SessionBudgetExhaustedEvent {
  type: 'session-budget-exhausted';
  code: NativeBudgetTerminalCode;
  epoch: number;
  renewalHint: true;
}

export type AgentSessionEvent = AgentEvent | SessionBudgetExhaustedEvent;

// ═══ Context epoch + @ref lineage (560-004, RCA §4-§6) ══════════════════════
// Three carriers were previously ONE string: what the user actually typed, the
// provider-EXPANDED payload (`@path` file injection, app.tsx's submit boundary)
// and the identity of the referenced material. Collapsing them meant a 26-char
// intent whose 99,327-char expansion became the "objective" of the next context
// epoch — the epoch summary carried the attachment instead of a reference to it.
// They are carried separately from here on: the live turn rides the expansion
// (the model needs the file), the EPOCH keeps intent + canonical path + digest +
// a bounded excerpt.

/** Identity of one referenced artifact — never its payload. */
export interface TurnReference {
  /** Canonical (project-relative) path exactly as the user referenced it. */
  path: string;
  /** sha256 of the FULL referenced payload — identity that survives compaction. */
  digest: string;
  /** Byte length of the full referenced payload. */
  bytes: number;
  /** Bounded excerpt retained across epoch boundaries (never the whole file). */
  excerpt: string;
  /** false → the reference could not be read (missing, binary, out of scope). */
  ok: boolean;
  /** true → the expansion itself was already cut at its own char cap. */
  truncated: boolean;
}

/** The three separately-carried halves of one user turn. */
export interface StructuredTurnInput {
  /** Exactly what the user typed. */
  rawIntent: string;
  /** What actually goes on the wire this turn (intent + expanded references). */
  expandedPayload: string;
  references: TurnReference[];
}

/** A bare string keeps the pre-560-004 behavior (intent === payload, no refs). */
export type TurnInput = string | StructuredTurnInput;

/** Chars of a referenced payload kept in the lineage across an epoch. Exported
 *  so the producer of a StructuredTurnInput bounds its excerpts identically. */
export const REFERENCE_EXCERPT_CHARS = 320;
/** Most references tracked per session (oldest evicted first). */
const MAX_TRACKED_REFERENCES = 32;
/** Hard CAP on how much transcript delta one checkpoint request may carry. This
 *  is a ceiling on what we SEND, never an assumption about the context window —
 *  an unknown context authority can only make the request smaller, never bigger. */
const CHECKPOINT_DELTA_TOKEN_CAP = 8_000;
/** Chars of any single message kept inside a checkpoint chunk. */
const CHECKPOINT_MESSAGE_CHARS = 2_000;
/** Bounded recursion: chunk→summarize→merge may not run forever (typed failure). */
const CHECKPOINT_MERGE_MAX_DEPTH = 4;
/** Measured share of the context window that triggers a PROACTIVE checkpoint —
 *  the epoch turns over BEFORE the request jams, not after it is refused. */
const CONTEXT_HIGH_WATER_RATIO = 0.75;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cut `text` at `maxChars`, replacing the tail with an honest identity marker —
 *  a bounded excerpt plus a digest, never a silent truncation. */
export function boundTextForCheckpoint(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[bounded: ${text.length} chars, sha256:${sha256(text).slice(0, 16)}]`;
}

/** Pack already-rendered lines into chunks that each stay within `budgetTokens`. */
function packLines(lines: readonly string[], budgetTokens: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    if (line.length === 0) continue;
    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (current.length > 0 && estimateTokens(candidate) > budgetTokens) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Plan the BOUNDED DELTA a checkpoint request may carry. Pure + exported so the
 * "never ship the full transcript" guarantee is directly assertable: every
 * message becomes one `[role] …` line bounded to at most half the chunk budget
 * (with a digest marker where it was cut), and the lines are packed into chunks
 * that each stay within `budgetTokens`. More than one chunk means the caller
 * must chunk→summarize→merge recursively rather than widen the request.
 */
export function planCheckpointDelta(
  messages: readonly ProviderMessage[],
  budgetTokens: number,
): string[] {
  const perMessageChars = Math.max(128, Math.min(CHECKPOINT_MESSAGE_CHARS, budgetTokens * 2));
  return packLines(
    messages.map((message) => `[${message.role}] ${boundTextForCheckpoint(message.content, perMessageChars)}`),
    budgetTokens,
  );
}

/** Render the reference lineage that replaces expanded payloads at an epoch
 *  boundary: canonical path + digest + bounded excerpt, never the attachment. */
export function renderReferenceLineage(references: readonly TurnReference[]): string {
  if (references.length === 0) return '';
  const lines = references.map((reference) => {
    const flags = `${reference.truncated ? ' · truncated' : ''}${reference.ok ? '' : ' · unreadable'}`;
    const excerpt = reference.excerpt.length > 0 ? `\n  excerpt: ${reference.excerpt}` : '';
    return `- ${reference.path} · sha256:${reference.digest.slice(0, 16)} · ${reference.bytes} bytes${flags}${excerpt}`;
  });
  return `\n\n[@ref-lineage] referenced material is identified, not copied:\n${lines.join('\n')}`;
}

function normalizeTurnInput(input: TurnInput): StructuredTurnInput {
  return typeof input === 'string'
    ? { rawIntent: input, expandedPayload: input, references: [] }
    : input;
}

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
  /** `slug` is the canonical project-directory slug (`projectSlug()`); absent →
   *  it is derived from `cwd`, so every session of one project shares — and the
   *  reaper sweeps — one scratch namespace. */
  scratch?: {
    tenantId: string;
    projectId: string;
    sessionId: string;
    checkpointInstruction: string;
    slug?: string;
  };
  /** Tool-result overflow store. Owned by the caller (it is built with the
   *  registry, before the session exists — see `resolveScratchRoot`), but
   *  CLOSED here so scratch teardown sweeps one namespace, not two. */
  contentStore?: ContentWriter;
}

export interface AgentSession {
  /** A bare string is the raw intent AND the payload; a StructuredTurnInput
   *  carries the raw intent, the provider-expanded payload and the reference
   *  identifiers separately (560-004). */
  send(userInput: TurnInput): AsyncIterable<AgentSessionEvent>;
  /** Restarts the WORKING budget epoch only — cumulative billing/cost/usage is
   *  never reset here or anywhere below. It additionally PLANS a safe
   *  context-epoch refresh, performed through the ordinary bounded-delta
   *  checkpoint path on the next `send()`. */
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
  /** TERMINAL-TOOLS-008 — abort seam of the turn in flight (fresh per send()). */
  let turnAbort: AbortController | undefined;
  let turnSequence = 0;
  let budgetEpoch = 1;
  let exhausted: { code: NativeBudgetTerminalCode; at: number; epoch: number } | undefined;
  const scratchDeps = deps.scratch;
  const scratch: ScratchStore | undefined = scratchDeps
    ? openScratchStore({ ...scratchDeps, slug: scratchDeps.slug ?? projectSlug(deps.cwd) })
    : undefined;
  let checkpointDegradation: CheckpointReadResult | undefined;
  /** Messages the LAST epoch compaction installed — the checkpoint delta is
   *  strictly everything after them, so a checkpoint never re-reads its own
   *  preamble (and never the full transcript). */
  let epochPreambleLength = 0;
  let contextEpoch = 1;
  /** `/renew` asked for a safe context refresh; the next send performs it. */
  let contextRefreshPlanned = false;
  /** Reference identity accumulated across the session, keyed path\0digest. */
  const references = new Map<string, TurnReference>();
  let lastRawIntent = '';

  function rememberReference(reference: TurnReference): void {
    const key = `${reference.path}\0${reference.digest}`;
    references.delete(key); // re-insert → most-recent-last ordering
    references.set(key, reference);
    while (references.size > MAX_TRACKED_REFERENCES) {
      const oldest = references.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      references.delete(oldest);
    }
  }

  /** The objective a fresh epoch opens on: the RAW intent plus the reference
   *  lineage — never the provider-expanded payload (RCA §5). */
  function epochObjective(): string {
    return `${lastRawIntent}${renderReferenceLineage([...references.values()])}`;
  }

  /** Ceiling on one checkpoint request's delta. Derived from the known context
   *  when there is one; otherwise the fixed CAP — either way a bound on what we
   *  send, never an assumed window size. */
  function checkpointDeltaBudget(): number {
    const contextTokens = deps.getContextBudgetTokens?.();
    const fromContext = contextTokens !== undefined && contextTokens > 0
      ? Math.floor(contextTokens / 4)
      : undefined;
    return Math.max(512, Math.min(CHECKPOINT_DELTA_TOKEN_CAP, fromContext ?? CHECKPOINT_DELTA_TOKEN_CAP));
  }

  /** The previous epoch's checkpoint, bounded — a checkpoint request is
   *  "previous summary + bounded delta", never a replayed transcript. */
  function previousCheckpointSummary(): string | undefined {
    const latest = scratch?.readLatestCheckpoint();
    if (latest?.status !== 'ok') return undefined;
    return boundTextForCheckpoint(JSON.stringify(latest.payload), CHECKPOINT_MESSAGE_CHARS * 2);
  }

  interface UsageTotals { inputTokens: number; outputTokens: number }

  /** One checkpoint provider call. It goes through the SAME adapter as every
   *  other turn — so the same measurement/admission wrapper (native-transport's
   *  withMeasuredAdmission) gates it — and its usage is returned to the caller
   *  so it lands in the SAME usage/cost chain, never off-books. */
  async function callCheckpointProvider(
    previousSummary: string | undefined,
    delta: string,
    usage: UsageTotals,
  ): Promise<string> {
    if (!scratchDeps) throw new Error('checkpoint requested without a scratch session');
    const adapter = deps.getAdapter?.() ?? deps.adapter;
    const messages: ProviderMessage[] = [];
    if (previousSummary !== undefined) messages.push({ role: 'user', content: `[previous-checkpoint]\n${previousSummary}` });
    messages.push({ role: 'user', content: `[transcript-delta]\n${delta}` });
    const request: ProviderRequest = {
      system: scratchDeps.checkpointInstruction,
      messages,
      tools: [],
      model: deps.getModel?.() ?? deps.model,
    };
    let text = '';
    for await (const response of adapter.send(request)) {
      if (response.type === 'text-delta') text += response.text;
      else if (response.type === 'usage') {
        usage.inputTokens += response.inputTokens;
        usage.outputTokens += response.outputTokens;
      }
    }
    return text;
  }

  /**
   * Summarize the delta since the last epoch. When the delta does not fit one
   * bounded request it is chunked, each chunk summarized, and the partial
   * summaries recursively chunked+merged — depth-bounded, so an oversized
   * transcript ends in a typed failure rather than an endless continuation.
   */
  async function summarizeBoundedDelta(usage: UsageTotals): Promise<string> {
    const all = transcript.toProviderMessages();
    const delta = all.slice(Math.min(epochPreambleLength, all.length));
    const budget = checkpointDeltaBudget();
    const previousSummary = previousCheckpointSummary();
    let chunks = planCheckpointDelta(delta, budget);
    if (chunks.length === 0) chunks = ['(no new activity since the previous checkpoint)'];
    for (let depth = 0; chunks.length > 1; depth++) {
      if (depth >= CHECKPOINT_MERGE_MAX_DEPTH) throw new Error('checkpoint-merge-depth-exceeded');
      const partials: string[] = [];
      for (const chunk of chunks) partials.push(await callCheckpointProvider(previousSummary, chunk, usage));
      chunks = packLines(
        partials.map((partial) => boundTextForCheckpoint(partial, Math.max(128, budget * 2))),
        budget,
      );
      if (chunks.length === 0) throw new Error('checkpoint-merge-produced-nothing');
    }
    return callCheckpointProvider(previousSummary, chunks[0]!, usage);
  }

  /** Measure what the CURRENT transcript (plus any pending extra messages) would
   *  cost on the wire. `undefined` when no context authority is known — the
   *  caller then fails closed rather than guessing a window size. */
  async function measureContext(extra: readonly ProviderMessage[] = []): Promise<
    { inputTokens: number; window: number } | undefined
  > {
    const window = deps.getContextBudgetTokens?.();
    if (window === undefined || !(window > 0)) return undefined;
    const adapter = deps.getAdapter?.() ?? deps.adapter;
    const model = deps.getModel?.() ?? deps.model;
    const request: ProviderRequest = {
      system: '',
      messages: [...transcript.toProviderMessages(), ...extra],
      tools: [],
      model,
    };
    const identity: ProviderContextIdentity = {
      provider: adapter.name,
      model,
      contextWindowTokens: window,
      contextProvenance: 'configured-narrowing',
    };
    const measurement = await measureProviderRequest({
      request,
      identity,
      ...(adapter.requestMeasurement ? { capability: adapter.requestMeasurement } : {}),
    });
    return { inputTokens: measurement.inputTokens, window };
  }

  /** Verified exact fit of the fresh epoch — the precondition for the single
   *  bounded retry. Unknown context authority → not verifiable → no retry. */
  async function epochFits(retryInput: string): Promise<boolean> {
    const window = deps.getContextBudgetTokens?.();
    if (window === undefined || !(window > 0)) return false;
    const measured = await measureContext([{ role: 'user', content: retryInput }]);
    if (!measured) return false;
    const adapter = deps.getAdapter?.() ?? deps.adapter;
    const model = deps.getModel?.() ?? deps.model;
    return decideProviderAdmission(
      {
        inputTokens: measured.inputTokens,
        quality: 'conservative-upper-bound',
        provenance: 'session-epoch-fit',
        requestDigest: '',
        identity: {
          provider: adapter.name,
          model,
          contextWindowTokens: measured.window,
          contextProvenance: 'configured-narrowing',
        },
      },
      deps.nativeBudget?.outputReserveTokens ?? 0,
      deps.nativeBudget?.contextSafetyReserveTokens ?? 0,
    ).admitted;
  }

  /** Set by a successful epoch turnover — the precondition for the one retry. */
  let epochAdvancedThisTurn = false;

  /** Take one context epoch: bounded-delta checkpoint → durable write → compact
   *  the transcript onto raw intent + reference lineage + the checkpoint. Usage
   *  is emitted (and accrued) even when the summarization itself fails — the
   *  provider call happened, so it is billed and reported either way. */
  async function* takeContextEpoch(turnId: string): AsyncIterable<AgentSessionEvent> {
    if (!scratch || !scratchDeps) return;
    const usage: UsageTotals = { inputTokens: 0, outputTokens: 0 };
    let text: string | undefined;
    let failure: string | undefined;
    try {
      text = await summarizeBoundedDelta(usage);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    if (usage.inputTokens > 0 || usage.outputTokens > 0) {
      if (deps.costGuard) accrue(deps.costGuard, usage);
      yield { type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    }
    if (text !== undefined) {
      try {
        scratch.writeCheckpoint(JSON.parse(text) as ScratchCheckpointPayload);
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
    }
    if (failure !== undefined || text === undefined) {
      checkpointDegradation = {
        status: 'corrupt',
        path: scratch.info.root,
        reason: `checkpoint-degraded: ${failure ?? 'no checkpoint text'}`,
      };
      // The existing epoch is deliberately left untouched on refusal/corruption.
      yield { type: 'notice', code: 'native.checkpoint.degraded', message: `checkpoint degraded — context epoch ${contextEpoch} kept` };
      return;
    }
    transcript.compactForContextEpoch(epochObjective(), text, turnId);
    epochPreambleLength = transcript.toProviderMessages().length;
    contextEpoch++;
    epochAdvancedThisTurn = true;
    checkpointDegradation = undefined;
    yield { type: 'notice', code: 'native.checkpoint.saved', message: `context epoch ${contextEpoch} — checkpointed from a bounded delta` };
  }

  /** PROACTIVE trigger: turn the epoch over BEFORE the request jams. Measured,
   *  not guessed — an unknown context authority simply never triggers it. */
  async function* maybeRefreshBeforeTurn(turnId: string): AsyncIterable<AgentSessionEvent> {
    const planned = contextRefreshPlanned;
    contextRefreshPlanned = false;
    if (!scratch || !scratchDeps) return;
    if (planned) {
      yield* takeContextEpoch(turnId);
      return;
    }
    const measured = await measureContext();
    if (!measured) return;
    if (measured.inputTokens >= Math.floor(measured.window * CONTEXT_HIGH_WATER_RATIO)) {
      yield* takeContextEpoch(turnId);
    }
  }

  async function* runWithCheckpoints(input: StructuredTurnInput, turnId: string): AsyncIterable<AgentSessionEvent> {
    lastRawIntent = input.rawIntent;
    for (const reference of input.references) rememberReference(reference);
    yield* maybeRefreshBeforeTurn(turnId);
    // The recovery turn drops the expansion and rides intent + lineage instead —
    // re-sending the payload that just overflowed would be a doomed second call.
    const retryInput = epochObjective();
    for (let attempt = 0; ; attempt++) {
      epochAdvancedThisTurn = false;
      transcript.setNextUserMetadata({ turnId, origin: 'user' });
      const payload = attempt === 0 ? input.expandedPayload : retryInput;
      let retry = false;
      for await (const event of runAgentTurn(loopDeps, transcript, payload)) {
        if (event.type === 'error' && isNativeBudgetTerminalCode(event.code)) {
          exhausted = { code: event.code, at: Date.now(), epoch: budgetEpoch };
        }
        if (
          event.type === 'error'
          && event.code === 'native-context.admission-denied'
          && attempt === 0
          && epochAdvancedThisTurn
          && await epochFits(retryInput)
        ) {
          // ONE bounded recovery path for a typed overflow: a verified-exact-fit
          // fresh epoch, the original turn retried exactly once. No loop.
          retry = true;
          break;
        }
        yield event;
        if (event.type !== 'budget-checkpoint-request') continue;
        yield* takeContextEpoch(turnId);
      }
      if (!retry) return;
      yield {
        type: 'notice',
        code: 'native.checkpoint.epoch-advanced',
        message: `context epoch ${contextEpoch} verified to fit — retrying the turn once`,
      };
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
    ...(scratch ? { scratchDir: scratch.info.root } : {}),
    maxIterations: deps.maxIterations,
    costGuard: deps.costGuard,
    ...(deps.getAdapter ? { getAdapter: deps.getAdapter } : {}),
    ...(deps.getModel ? { getModel: deps.getModel } : {}),
    ...(deps.getContextBudgetTokens ? { getContextBudgetTokens: deps.getContextBudgetTokens } : {}),
    ...(deps.getProviderToolSchemas ? { getProviderToolSchemas: deps.getProviderToolSchemas } : {}),
    getMode: () => mode,
    isCancelled: () => cancelled,
    // TERMINAL-TOOLS-008 — the per-turn AbortController's signal (see send()).
    getTurnSignal: () => turnAbort?.signal,
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
    send(userInput: TurnInput): AsyncIterable<AgentSessionEvent> {
      cancelled = false;
      // TERMINAL-TOOLS-008 — a fresh controller per turn: a late cancel() on a
      // finished turn can never poison the next one.
      turnAbort = new AbortController();
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
      return runWithCheckpoints(normalizeTurnInput(userInput), turnId);
    },
    renewBudgetEpoch(): { epoch: number } {
      budgetEpoch++;
      exhausted = undefined;
      if (deps.nativeBudget) loopDeps.nativeBudgetState = createNativeBudgetState();
      // Cumulative billing/cost/usage is NOT touched here — `deps.costGuard` and
      // every emitted usage total stay exactly as they were; only the WORKING
      // budget restarts. The context epoch is refreshed safely on the next send
      // (bounded-delta checkpoint), so `/renew` never has to mean "forget".
      contextRefreshPlanned = true;
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
      // TERMINAL-TOOLS-008 — abort the in-flight provider request/stream NOW
      // (fetch rejects with AbortError; the loop ends the turn without an
      // error event). Before this the flag was only honored at the next event.
      turnAbort?.abort();
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
      const keep = options.keepForRecoveryMs ?? 0;
      // Fail-open, and only on a real teardown: a kept scratchpad's checkpoints
      // may still cite contentRefs, so the content store survives exactly as
      // long as the recovery window that the reaper later enforces.
      if (keep <= 0) {
        try { deps.contentStore?.close?.(); } catch { /* teardown hygiene never fails a close */ }
      }
      if (!scratch) return;
      scratch.close(keep > 0 ? { policy: 'keep-for-recovery', recoveryWindowMs: keep } : { policy: 'delete' });
    },
  };
}

function isNativeBudgetTerminalCode(code: string | undefined): code is NativeBudgetTerminalCode {
  return code?.startsWith('native-budget.') === true;
}
