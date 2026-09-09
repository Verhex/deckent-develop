// src/agent/session.ts
// ═══ AgentSession — the core's public API (SP-1 §9) ═════════════════════════
// Commands (view→core): send · respondPermission · cancel · setApprovalMode.
// Events (core→view): the AgentEvent stream returned by send(). The session
// owns the cross-turn Transcript, the pending-permission Promise registry that
// bridges the loop's await to the view's respondPermission, the mutable approval
// mode, and a per-turn cancellation flag. Transport-neutral: the same stream
// drives Ink / web-SSE / NDJSON.
//
// Timing note: the session registers the immutable invocation BEFORE the loop
// yields `permission-request`. An immediate view response therefore resolves an
// issued record; unknown ids are never cached as future authority.

import { createHash, randomUUID } from 'node:crypto';
import type { AgentEvent, BudgetCheckpointPressure, PermissionRequestEvent, RequestMeasurementEvent } from './events.js';
import {
  runAgentTurn,
  type LoopDeps,
  type PermissionIssueInput,
  type PermissionResponse,
} from './loop.js';
import type { PermissionPolicy } from './permission-policy.js';
import type { RuleStore } from './permission-store.js';
import type { ApprovalMode } from './permission-types.js';
import { accrue, costExceeded, type CostGuardState } from './guards/cost.js';
import { ToolRegistry } from './tools/registry.js';
import { Transcript } from './transcript.js';
import type {
  ProviderAdapter,
  ProviderContextIdentity,
  ProviderMessage,
  ProviderRequest,
} from './provider-tooluse/types.js';
import { InputContextOverflowError } from './provider-tooluse/context-errors.js';
import { providerContextErrorCode } from './provider-tooluse/context-errors.js';
import {
  decideProviderAdmission,
  estimateTokens,
  measureProviderRequest,
  deriveMeasurementAuthority,
  type RequestMeasurementAuthorityStatus,
} from './context-budget.js';
import { openScratchStore, type CheckpointReadResult, type ScratchCheckpointPayload, type ScratchStore, SCRATCH_CHECKPOINT_SCHEMA_VERSION } from './scratch-checkpoint.js';
import {
  boundLastAssistantText,
  checkpointCompactionText,
  DEFAULT_CHECKPOINT_TRAIL_LABELS,
  hostStampCheckpoint,
  renderToolTrail,
  resolveTrailOpeningBudget,
  toolCallDigest,
  ToolTrailRecorder,
  type CheckpointTrailLabels,
  type HostCheckpointState,
} from './checkpoint-trail.js';
import { CONTENT_REF_TOOL_NAME } from './tools/content-ref-tool.js';
import { createNativeBudgetState, evaluateNativeBudget, type NativeBudgetState } from './guards/recursion.js';
import { containToolResult, renderToolResultEnvelope, type ContentWriter } from './tool-result-broker.js';
import { createPreambleBudgeter, PreambleBudgetError, type PreambleSnapshot } from './preamble-budget.js';
import { composeSystemPrompt } from './identity.js';
import { resolveTransportRetryPolicy } from './provider-tooluse/transport-errors.js';
import { planReasoning, resolveAdapterReasoningControl } from './reasoning-control.js';
import { resolveNativeAgentBudget } from '../core/execution-budget-policy.js';
import { projectSlug } from '../core/project-slug.js';
import { ALL_APPROVAL_RISKS, ALL_APPROVAL_SCOPES } from '../core/approval-contract.js';
import { maskArgs } from '../core/approval-masking.js';
import {
  bindNativePermissionIntent,
  createNativePermissionInvocation,
  digestNativePermissionArgs,
  nativePermissionBindingsEqual,
  parseNativePermissionBinding,
  type NativePermissionBinding,
} from './native-permission-binding.js';

export type NativeBudgetTerminalCode = `native-budget.${string}`;

export interface SessionBudgetExhaustedEvent {
  type: 'session-budget-exhausted';
  code: NativeBudgetTerminalCode;
  epoch: number;
  renewalHint: true;
}

export type AgentSessionEvent = AgentEvent | SessionBudgetExhaustedEvent;

export type PermissionResponseDisposition =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reasonCode:
        | 'PERMISSION_SESSION_CLOSED'
        | 'PERMISSION_STALE'
        | 'PERMISSION_UNKNOWN'
        | 'PERMISSION_MODIFIED'
        | 'PERMISSION_DUPLICATE'
        | 'PERMISSION_RESPONSE_INVALID';
    };

export type NativePermissionDecisionCallback = (
  request: PermissionRequestEvent,
  signal: AbortSignal,
) => Promise<PermissionResponse>;

export type NestedPermissionRequestInput = Omit<PermissionIssueInput, 'callId' | 'nested'>;

export type NestedPermissionRequestResult =
  | {
      readonly kind: 'resolved';
      readonly request: PermissionRequestEvent;
      readonly response: Exclude<PermissionResponse, { decision: 'hold' }>;
    }
  | { readonly kind: 'hold'; readonly reasonCode: string };

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
// High-water comes from the same resolved native budget as the loop.

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
  /** Typed boot probe for exact token counting (7109-b). */
  measurementAuthority?: RequestMeasurementAuthorityStatus;
  /** NT-06 progressive tool surface — per-round provider schema view (loop.ts
   *  falls back to the full registry when absent). */
  getProviderToolSchemas?: LoopDeps['getProviderToolSchemas'];
  toolExposure?: import('./tools/exposure.js').ToolExposure;
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
    checkpointProjectRoot?: string;
  };
  /** Tool-result overflow store. Owned by the caller (it is built with the
   *  registry, before the session exists — see `resolveScratchRoot`), but
   *  CLOSED here so scratch teardown sweeps one namespace, not two. */
  contentStore?: ContentWriter;
  /** 7110 — labels of the deterministic checkpoint trail rendered into the
   *  epoch-opening message (caller injects `getMessage` EN/TR text; absent →
   *  the mechanism module's English defaults). */
  checkpointLabels?: CheckpointTrailLabels;
  /** 7110 — host clock for `createdAt` stamping (tests inject; absent → wall clock). */
  now?: () => Date;
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
  respondPermission(
    request: PermissionRequestEvent,
    response: PermissionResponse,
  ): PermissionResponseDisposition;
  /** Session-owned nested gate. The parent call id comes from the currently
   *  executing top-level handler; callers cannot manufacture that identity. */
  requestNestedPermission(
    input: NestedPermissionRequestInput,
    decidePermission: NativePermissionDecisionCallback,
  ): Promise<NestedPermissionRequestResult>;
  /** Final synchronous authority/lifecycle check immediately before an effect. */
  claimPermissionEffect(
    request: PermissionRequestEvent,
    response: PermissionResponse,
    rawArgs: Record<string, unknown>,
  ): boolean;
  /** Rehashes session-owned raw args and checks current generation/cancellation
   *  before a consumer submits the immutable event to its authority adapter. */
  validatePermissionRequest(request: PermissionRequestEvent): boolean;
  cancel(): void;
  setApprovalMode(mode: ApprovalMode): void;
  /** Live approval mode — the call_tool parity resolver (born-607) reads this so a
   *  nested dispatch honors the SAME mode the loop's direct path would. */
  getApprovalMode(): ApprovalMode;
  /** The cross-turn transcript (a copy) — for trace recording. */
  transcript(): ProviderMessage[];
  latestCheckpoint(): CheckpointReadResult;
  /**
   * TERMINAL-TOOLS-010 — read-only context occupancy for the `/context`
   * surface: measured (never guessed) input tokens of the current transcript
   * against the context authority's window, plus epoch/transcript/checkpoint
   * state. `window`/`measuredInputTokens` are undefined when no authority or
   * measurement exists — the caller renders "unknown", never an estimate.
   */
  contextSnapshot(): Promise<ContextSnapshot>;
  /** Clear only the last-request display attribution after a successful
   * transcript identity switch. Provider usage, cost and budget stay intact. */
  clearLastRequestMeasurement(): void;
  /** Plan a context-epoch refresh for the NEXT send() — the `/renew` side
   *  effect without the working-budget renewal. */
  planContextRefresh(): void;
  /**
   * TERMINAL-TOOLS-010 — take a context epoch NOW (`/compact`): the same
   * bounded-delta checkpoint path the proactive high-water trigger uses
   * (one checkpoint provider call, usage emitted and accrued, durable write,
   * transcript compacted onto intent + lineage + checkpoint). Without a
   * scratch store it yields the typed `native.compact.unavailable` notice.
   */
  compactContext(): AsyncIterable<AgentSessionEvent>;
  close(options?: { keepForRecoveryMs?: number }): void;
}

/** TERMINAL-TOOLS-010 — `/context` read model (see AgentSession.contextSnapshot). */
export interface ContextSnapshot {
  preambleBudget?: PreambleSnapshot;
  window: number | undefined;
  measuredInputTokens: number | undefined;
  lastRequestMeasurement?: RequestMeasurementEvent;
  providerReportedUsage?: { inputTokens: number; outputTokens: number; reports: number };
  epoch: number;
  messages: number;
  preambleMessages: number;
  checkpoint: CheckpointReadResult['status'];
  refreshPlanned: boolean;
  highWaterRatio: number;
  lastContextTrigger?: 'token-pressure' | 'overflow' | 'manual' | 'planned' | 'cadence';
  lastCheckpointPressure?: BudgetCheckpointPressure;
  /** Boot-time exact-counter probe — honest unavailable is visible on /context. */
  measurementAuthority?: RequestMeasurementAuthorityStatus;
}

export function createAgentSession(deps: AgentSessionDeps): AgentSession {
  const transcript = new Transcript();
  const contextBudget = { ...resolveNativeAgentBudget({}), ...deps.nativeBudget };
  const preambleBudgeter = deps.nativeBudget ? createPreambleBudgeter({
    share: contextBudget.maxPreambleShareOfContext,
    transcriptReserveShare: contextBudget.minTranscriptShareOfContext,
    ...(deps.toolExposure ? {exposure: deps.toolExposure} : {}),
    registry: deps.registry,
    ...(deps.contentStore ? {contentStore: deps.contentStore} : {}),
  }) : undefined;
  let lastContextTrigger: ContextSnapshot['lastContextTrigger'];
  let lastCheckpointPressure: BudgetCheckpointPressure | undefined;
  let mode: ApprovalMode = deps.policy.defaultMode;
  /** TERMINAL-TOOLS-008 — abort seam of the turn in flight (fresh per send()). */
  let turnAbort: AbortController | undefined;
  let turnSequence = 0;
  let closed = false;
  const sessionId = deps.scratch?.sessionId ?? `native-session-${randomUUID()}`;
  const sessionInstanceId = `native-instance-${randomUUID()}`;
  interface IssuedPermission {
    readonly request: PermissionRequestEvent;
    readonly rawArgs: Record<string, unknown>;
    state: 'issued' | 'answered' | 'consumed';
    response?: PermissionResponse;
    resolve?: (response: PermissionResponse) => void;
    promise?: Promise<PermissionResponse>;
  }
  interface PermissionTurn {
    readonly generation: number;
    readonly controller: AbortController;
    readonly issued: Map<string, IssuedPermission>;
    retired: boolean;
    activeParent?: { readonly token: symbol; readonly callId: string };
  }
  let activePermissionTurn: PermissionTurn | undefined;
  let budgetEpoch = 1;
  let exhausted: { code: NativeBudgetTerminalCode; at: number; epoch: number } | undefined;
  let lastRequestMeasurement: RequestMeasurementEvent | undefined;
  let requestAttributionGeneration = 0;
  const providerReportedUsage = { inputTokens: 0, outputTokens: 0, reports: 0 };
  const scratchDeps = deps.scratch;
  const scratch: ScratchStore | undefined = scratchDeps
    ? openScratchStore(
        { ...scratchDeps, slug: scratchDeps.slug ?? projectSlug(deps.cwd) },
        { checkpointProjectRoot: scratchDeps.checkpointProjectRoot },
      )
    : undefined;
  let checkpointDegradation: CheckpointReadResult | undefined;
  /** Messages the LAST epoch compaction installed — the checkpoint delta is
   *  strictly everything after them, so a checkpoint never re-reads its own
   *  preamble (and never the full transcript). */
  let epochPreambleLength = 0;
  let contextEpoch = 1;
  /** `/renew` asked for a safe context refresh; the next send performs it. */
  let contextRefreshPlanned = false;
  /** TERMINAL-TOOLS-010 — turn ids for explicit `/compact` epochs. */
  let compactSequence = 0;
  /** Reference identity accumulated across the session, keyed path\0digest. */
  const references = new Map<string, TurnReference>();
  let lastRawIntent = '';
  // ═══ 7110 — host-derived checkpoint continuity ═══════════════════════════
  /** Per-turn tool trail derived from the loop's own events (no model call). */
  const trail = new ToolTrailRecorder(contextBudget.checkpointReplayCacheEntries, deps.contentStore);
  const trailLabels: CheckpointTrailLabels = deps.checkpointLabels ?? DEFAULT_CHECKPOINT_TRAIL_LABELS;
  /** Visible assistant text of the round in flight / the last completed round. */
  let assistantTextBuffer = '';
  let lastAssistantText = '';
  /** Armed by a completed context epoch; a byte-identical read-only call made
   *  afterwards in the SAME turn is served from the trail instead of re-run. */
  let replayArmed = false;
  /** Digest of the last persisted full trail (cited by the opening's omission line). */
  let lastTrailRef: string | null = null;
  const REPLAY_SERVED_CODE = 'native.checkpoint.replay-served';
  const PRESSURE_SUPPRESSED_CODE = 'native.checkpoint.pressure-suppressed';
  const hostNow = (): string => (deps.now?.() ?? new Date()).toISOString();

  const hold = (reasonCode: string): PermissionResponse => Object.freeze({ decision: 'hold', reasonCode });

  function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasPermissionRequestIdentity(value: unknown): value is PermissionRequestEvent {
    if (!isRecord(value) || !isRecord(value['invocation'])) return false;
    return typeof value['invocation']['invocationId'] === 'string'
      && typeof value['invocation']['turnGeneration'] === 'number';
  }

  function hasPermissionResponseShape(value: unknown): value is PermissionResponse {
    return isRecord(value) && typeof value['decision'] === 'string';
  }

  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  }

  function eventsEqual(left: PermissionRequestEvent, right: PermissionRequestEvent): boolean {
    try {
      if (left.type !== right.type
        || left.id !== right.id
        || left.tool !== right.tool
        || left.resource !== right.resource
        || left.tier !== right.tier
        || left.approval.scope !== right.approval.scope
        || left.approval.risk !== right.approval.risk
        || left.approval.scopeId !== right.approval.scopeId
        || left.approval.resource !== right.approval.resource) return false;
      return digestNativePermissionArgs(left.maskedArgs as Record<string, unknown>)
          === digestNativePermissionArgs(right.maskedArgs as Record<string, unknown>)
        && nativePermissionBindingsEqual(
        bindNativePermissionIntent(left.invocation, 'once', left.resource),
        bindNativePermissionIntent(right.invocation, 'once', right.resource),
      );
    } catch {
      return false;
    }
  }

  function retireTurn(turn: PermissionTurn, reasonCode: string): void {
    if (turn.retired) return;
    turn.retired = true;
    turn.controller.abort();
    turn.activeParent = undefined;
    for (const record of turn.issued.values()) {
      if (record.state !== 'issued') continue;
      record.state = 'answered';
      record.response = hold(reasonCode);
      record.resolve?.(record.response);
      record.resolve = undefined;
    }
  }

  function issuePermission(turn: PermissionTurn, input: PermissionIssueInput): PermissionRequestEvent {
    if (closed || turn.retired || turn.controller.signal.aborted || activePermissionTurn !== turn) {
      throw new Error('PERMISSION_STALE');
    }
    if (!ALL_APPROVAL_SCOPES.includes(input.approval.scope)
      || !ALL_APPROVAL_RISKS.includes(input.approval.risk)
      || input.approval.scopeId.trim().length === 0
      || input.approval.scopeId !== input.approval.scopeId.trim()
      || typeof input.approval.resource !== 'string'
      || input.approval.resource !== input.resource) {
      throw new Error('NATIVE_PERMISSION_CLASSIFICATION_UNAVAILABLE');
    }
    const invocation = createNativePermissionInvocation({
      sessionId,
      sessionInstanceId,
      turnGeneration: turn.generation,
      invocationId: `native-permission-${randomUUID()}`,
      callId: input.callId,
      tool: input.tool,
      rawArgs: input.rawArgs,
      tier: input.tier,
      elevated: input.elevated,
      nested: input.nested,
    });
    const request = Object.freeze({
      type: 'permission-request' as const,
      id: input.callId,
      tool: input.tool,
      resource: input.resource,
      tier: input.tier,
      approval: Object.freeze({ ...input.approval }),
      maskedArgs: deepFreeze(maskArgs(input.rawArgs)),
      invocation,
    });
    turn.issued.set(invocation.invocationId, { request, rawArgs: input.rawArgs, state: 'issued' });
    return request;
  }

  function validatePermissionRequest(request: PermissionRequestEvent): boolean {
    try {
      if (!hasPermissionRequestIdentity(request)) return false;
      const turn = activePermissionTurn;
      if (!turn || closed || turn.retired || turn.controller.signal.aborted
        || request.invocation.turnGeneration !== turn.generation) return false;
      const record = turn.issued.get(request.invocation.invocationId);
      if (!record || record.state === 'consumed' || !eventsEqual(record.request, request)) return false;
      if (request.invocation.nested && turn.activeParent?.callId !== request.invocation.callId) return false;
      return digestNativePermissionArgs(record.rawArgs) === request.invocation.invocationArgsDigest;
    } catch {
      return false;
    }
  }

  function responseBinding(
    record: IssuedPermission,
    response: PermissionResponse,
  ): NativePermissionBinding | undefined {
    if (response.decision === 'hold') return undefined;
    const parsed = parseNativePermissionBinding({ nativePermission: response.binding });
    if (!parsed.ok) return undefined;
    let expected: NativePermissionBinding;
    try {
      expected = bindNativePermissionIntent(
        record.request.invocation,
        parsed.value.requestedLifetime,
        record.request.resource,
      );
    } catch {
      return undefined;
    }
    if (!nativePermissionBindingsEqual(parsed.value, expected)) return undefined;
    if (response.decision !== 'deny' && response.decision !== parsed.value.requestedLifetime) return undefined;
    return parsed.value;
  }

  function acceptPermissionResponse(
    turn: PermissionTurn | undefined,
    request: PermissionRequestEvent,
    response: PermissionResponse,
  ): PermissionResponseDisposition {
    if (closed) return { ok: false, reasonCode: 'PERMISSION_SESSION_CLOSED' };
    if (!hasPermissionRequestIdentity(request)) return { ok: false, reasonCode: 'PERMISSION_UNKNOWN' };
    if (!hasPermissionResponseShape(response)) return { ok: false, reasonCode: 'PERMISSION_RESPONSE_INVALID' };
    if (!turn || activePermissionTurn !== turn || request.invocation.turnGeneration !== turn.generation
      || turn.retired || turn.controller.signal.aborted) {
      return { ok: false, reasonCode: 'PERMISSION_STALE' };
    }
    const record = turn.issued.get(request.invocation.invocationId);
    if (!record) return { ok: false, reasonCode: 'PERMISSION_UNKNOWN' };
    if (!eventsEqual(record.request, request)) return { ok: false, reasonCode: 'PERMISSION_MODIFIED' };
    if (record.state !== 'issued') return { ok: false, reasonCode: 'PERMISSION_DUPLICATE' };
    if (!validatePermissionRequest(request)) return { ok: false, reasonCode: 'PERMISSION_MODIFIED' };
    let accepted: PermissionResponse;
    if (response.decision === 'hold') {
      if (typeof response.reasonCode !== 'string' || response.reasonCode.trim().length === 0) {
        return { ok: false, reasonCode: 'PERMISSION_RESPONSE_INVALID' };
      }
      accepted = hold(response.reasonCode);
    } else {
      const binding = responseBinding(record, response);
      if (!binding) return { ok: false, reasonCode: 'PERMISSION_RESPONSE_INVALID' };
      accepted = Object.freeze({ decision: response.decision, binding });
    }
    record.state = 'answered';
    record.response = accepted;
    record.resolve?.(accepted);
    record.resolve = undefined;
    return { ok: true };
  }

  function awaitPermission(turn: PermissionTurn, request: PermissionRequestEvent): Promise<PermissionResponse> {
    const record = turn.issued.get(request.invocation.invocationId);
    if (!record || !eventsEqual(record.request, request)) return Promise.resolve(hold('PERMISSION_UNKNOWN'));
    if (record.response) return Promise.resolve(record.response);
    if (!record.promise) {
      record.promise = new Promise<PermissionResponse>((resolve) => { record.resolve = resolve; });
    }
    return record.promise;
  }

  function validatePermission(
    request: PermissionRequestEvent,
    response: PermissionResponse,
    rawArgs: Record<string, unknown>,
  ): boolean {
    if (!validatePermissionRequest(request) || !hasPermissionResponseShape(response)) return false;
    const turn = activePermissionTurn;
    if (!turn || closed || turn.retired || turn.controller.signal.aborted
      || request.invocation.turnGeneration !== turn.generation
      || response.decision === 'hold' || response.decision === 'deny') return false;
    const record = turn.issued.get(request.invocation.invocationId);
    if (!record || record.state !== 'answered' || record.response !== response
      || !eventsEqual(record.request, request)) return false;
    const binding = responseBinding(record, response);
    if (!binding) return false;
    if (binding.invocation.nested && turn.activeParent?.callId !== binding.invocation.callId) return false;
    try {
      if (digestNativePermissionArgs(rawArgs) !== binding.invocation.invocationArgsDigest) return false;
    } catch {
      return false;
    }
    return true;
  }

  function claimPermissionEffect(
    request: PermissionRequestEvent,
    response: PermissionResponse,
    rawArgs: Record<string, unknown>,
  ): boolean {
    if (!validatePermission(request, response, rawArgs)) return false;
    const record = activePermissionTurn?.issued.get(request.invocation.invocationId);
    if (!record) return false;
    record.state = 'consumed';
    return true;
  }

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

  /** What the visible last-assistant text is RIGHT NOW (bounded). */
  function currentLastAssistantText(): string {
    return boundLastAssistantText(assistantTextBuffer.length > 0 ? assistantTextBuffer : lastAssistantText);
  }

  /** 7110 — the message a fresh epoch actually opens on: the objective PLUS the
   *  deterministic tool trail (what was already inspected, where the bytes are,
   *  by digest) and the last visible assistant text. Empty trail → byte-identical
   *  to `epochObjective()`. */
  function epochOpening(trailRef: string | null): string {
    const budgetTokens = resolveTrailOpeningBudget({
      windowTokens: deps.getContextBudgetTokens?.(),
      trailShare: contextBudget.checkpointTrailShareOfContext,
      transcriptReserveShare: contextBudget.minTranscriptShareOfContext,
    });
    return `${epochObjective()}${renderToolTrail(trail.entries(), currentLastAssistantText(), trailLabels, CONTENT_REF_TOOL_NAME, { budgetTokens, trailRef })}`;
  }

  /** Host truth every checkpoint is stamped with — model-written or deterministic.
   *  Persists the full trail to the content store so the payload (on disk) and
   *  the opening (omission line) can both cite it by digest. */
  function hostCheckpointState(): HostCheckpointState {
    return {
      objective: epochObjective(),
      toolTrail: trail.entries(),
      toolTrailRef: trail.persistTrail(),
      lastAssistantText: currentLastAssistantText(),
      createdAt: hostNow(),
      counters: { modelRounds: nativeBudgetState?.rounds ?? 0, toolCalls: nativeBudgetState?.toolCalls ?? 0, trailEntries: trail.size },
    };
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

  const CHECKPOINT_JSON_RESPONSE_CHAR_CAP = 256 * 1024;

  type CheckpointFailureCode =
    | 'CHECKPOINT_PROVIDER_FAILED'
    | 'CHECKPOINT_RESPONSE_MISSING'
    | 'CHECKPOINT_OUTPUT_CONTINUATION_EXHAUSTED'
    | 'CHECKPOINT_SESSION_BUDGET_EXHAUSTED'
    | 'CHECKPOINT_RESPONSE_TOO_LARGE'
    | 'CHECKPOINT_RESPONSE_INVALID_JSON'
    | 'CHECKPOINT_PAYLOAD_INVALID'
    | 'CHECKPOINT_WRITE_FAILED';
  class CheckpointFailure extends Error {
    constructor(readonly code: CheckpointFailureCode) { super(code); }
  }

  /** Accept raw JSON or one complete outer Markdown JSON fence; never prose or
   *  partial fences. Returns the UNTRUSTED candidate — `hostStampCheckpoint`
   *  decides its shape and stamps host truth (7110). */
  function parseCheckpointPayloadText(text: string): unknown {
    if (text.length > CHECKPOINT_JSON_RESPONSE_CHAR_CAP) throw new CheckpointFailure('CHECKPOINT_RESPONSE_TOO_LARGE');
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/i);
    try { return JSON.parse(fenced?.[1]?.trim() ?? trimmed) as unknown; }
    catch { throw new CheckpointFailure('CHECKPOINT_RESPONSE_INVALID_JSON'); }
  }

  /** One checkpoint provider call. It goes through the SAME adapter as every
   *  other turn — so the same measurement/admission wrapper (native-transport's
   *  withMeasuredAdmission) gates it — and its usage is returned to the caller
   *  so it lands in the SAME usage/cost chain, never off-books. */
  async function* callCheckpointProvider(
    previousSummary: string | undefined,
    delta: string,
    usage: UsageTotals,
    attributionGeneration: number,
  ): AsyncGenerator<RequestMeasurementEvent, string, void> {
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
      ...(deps.nativeBudget?.outputReserveTokens ? { outputCeilingTokens: deps.nativeBudget.outputReserveTokens } : {}),
      // 7108 — the checkpoint is a STRUCTURED request (JSON only): hidden
      // reasoning is switched off wherever the model's descriptor can, so the
      // whole visible reserve goes to the payload; transient transport
      // failures get the same bounded retry the turn loop authorizes.
      ...(deps.nativeBudget ? {
        reasoning: { mode: 'off' as const },
        ...(resolveTransportRetryPolicy(contextBudget) ? { transportRetry: resolveTransportRetryPolicy(contextBudget)! } : {}),
      } : {}),
      // TERMINAL-TOOLS-010 — the checkpoint call rides the same abort seam as
      // the turn (or the explicit /compact) it belongs to, so Esc cancels it.
      ...(turnAbort?.signal ? { signal: turnAbort.signal } : {}),
    };
    let text = '';
    // Same bounded output-recovery contract as the turn loop. JSON fragments
    // are appended byte-for-byte: overlap removal can corrupt string values.
    for (let continuation = 0; continuation <= 2; continuation++) {
      if (turnAbort?.signal.aborted) throw new CheckpointFailure('CHECKPOINT_PROVIDER_FAILED');
      if (deps.nativeBudget && nativeBudgetState) {
        const verdict = evaluateNativeBudget({ ...nativeBudgetState, rounds: nativeBudgetState.rounds + 1 }, deps.nativeBudget);
        if (verdict.verdict === 'terminate') throw new CheckpointFailure('CHECKPOINT_SESSION_BUDGET_EXHAUSTED');
      }
      if (deps.costGuard && costExceeded({ ...deps.costGuard,
        spentTokens: deps.costGuard.spentTokens + usage.inputTokens + usage.outputTokens }).exceeded) {
        throw new CheckpointFailure('CHECKPOINT_SESSION_BUDGET_EXHAUSTED');
      }
      const segmentRequest: ProviderRequest = continuation === 0 ? request : {
        ...request,
        messages: [...messages,
          ...(text === '' ? [] : [{ role: 'assistant' as const, content: text }]),
          { role: 'user', content: text === ''
            ? 'Return the requested checkpoint JSON now. Keep it concise and return only the complete JSON object.'
            : 'Continue the incomplete JSON exactly from its final byte. Return only the missing suffix, without repeating any previous bytes or adding fences.' }],
      };
      const window = deps.getContextBudgetTokens?.();
      const canRepair = !checkpointPressureRepaired && transcript.toProviderMessages().some(
        message => message.role === 'tool' && Buffer.byteLength(message.content, 'utf8') > 512);
      if (window !== undefined && window > 0 && (continuation > 0 || canRepair)) {
        const measurement = await measureProviderRequest({ request: segmentRequest,
          identity: { provider: adapter.name, model: request.model, contextWindowTokens: window,
            contextProvenance: 'configured-narrowing' },
          ...(adapter.requestMeasurement ? { capability: adapter.requestMeasurement } : {}),
        });
        const decision = decideProviderAdmission(measurement, deps.nativeBudget?.outputReserveTokens ?? 0,
          deps.nativeBudget?.contextSafetyReserveTokens ?? 0);
        if (!decision.admitted) {
          if (continuation === 0 && canRepair) throw new CheckpointPressure();
          throw new InputContextOverflowError(decision);
        }
      }
      if (nativeBudgetState) nativeBudgetState.rounds++;
      let truncated = false;
      let tooLarge = false;
      for await (const response of adapter.send(segmentRequest)) {
        if (response.type === 'request-measurement') {
          const event = Object.freeze({ type: 'request-measurement' as const,
            decision: response.decision, purpose: 'checkpoint' as const });
          if (attributionGeneration === requestAttributionGeneration) lastRequestMeasurement = event;
          yield event;
        } else if (response.type === 'text-delta') {
          if (text.length + response.text.length > CHECKPOINT_JSON_RESPONSE_CHAR_CAP) tooLarge = true;
          if (!tooLarge) text += response.text;
        } else if (response.type === 'usage') {
          usage.inputTokens += response.inputTokens;
          usage.outputTokens += response.outputTokens;
          providerReportedUsage.inputTokens += response.inputTokens;
          providerReportedUsage.outputTokens += response.outputTokens;
          providerReportedUsage.reports++;
          if (nativeBudgetState) nativeBudgetState.cumulativeTokens += response.inputTokens + response.outputTokens;
        } else if (response.type === 'done') truncated = response.stopReason === 'length';
      }
      if (tooLarge) throw new CheckpointFailure('CHECKPOINT_RESPONSE_TOO_LARGE');
      if (!truncated) return text;
      // With no visible bytes there is no JSON suffix to continue. When source
      // persistence is available, use the deterministic checkpoint immediately
      // instead of paying for repeated hidden-only generations.
      if (text === '' && deps.contentStore) throw new CheckpointFailure('CHECKPOINT_RESPONSE_MISSING');
    }
    throw new CheckpointFailure('CHECKPOINT_OUTPUT_CONTINUATION_EXHAUSTED');
  }

  class CheckpointPressure extends Error {}
  let checkpointPressureRepaired = false;

  function microCompactToolResults(turnId: string): boolean {
    if (!deps.contentStore) return false;
    let changed = false;
    const messages = transcript.toProviderMessages().map(message => {
      if (message.role !== 'tool' || Buffer.byteLength(message.content, 'utf8') <= 512) return message;
      const envelope = containToolResult({ output: message.content, ok: !/\[deckent\] tool-result not ok/u.test(message.content) }, {
        store: deps.contentStore!, maxPreviewBytes: 1,
      });
      // Persistence failure never licenses dropping the source bytes.
      if (!envelope.contentRef || envelope.storeError) return message;
      const content = renderToolResultEnvelope(envelope);
      if (Buffer.byteLength(content, 'utf8') >= Buffer.byteLength(message.content, 'utf8')) return message;
      changed = true;
      return { ...message, content };
    });
    if (changed) transcript.replaceForContextEpoch(messages, turnId);
    return changed;
  }

  /** A failed model summary never licenses losing source data. A deterministic
   * checkpoint references the complete original transcript, verified at the
   * content-store boundary, and explicitly records the unsummarized cause. */
  function deterministicCheckpoint(reasonCode: string): string | undefined {
    if (!deps.contentStore || !scratch || turnAbort?.signal.aborted) return undefined;
    try {
      const bytes = Buffer.from(JSON.stringify(transcript.toEntries()), 'utf8');
      const digest = createHash('sha256').update(bytes).digest('hex');
      const receipt = deps.contentStore.write(bytes);
      if (receipt.sha256 !== digest || receipt.path.length === 0) return undefined;
      // 7110: the payload carries REAL working state — the host-derived tool
      // trail, the last visible assistant text — and cites the raw transcript
      // by digest (readable through the content-ref tool), never by path.
      const host = hostCheckpointState();
      const payload: ScratchCheckpointPayload = {
        schemaVersion: SCRATCH_CHECKPOINT_SCHEMA_VERSION, objective: host.objective, findings: [],
        evidenceRefs: [`sha256:${digest}`], decisions: [], unresolved: [reasonCode],
        nextActions: [], inspectedAreas: [], toolResultDigests: [digest],
        cumulativeCounters: { deterministicFallback: 1, ...host.counters },
        createdAt: host.createdAt,
        toolTrail: host.toolTrail,
        lastAssistantText: host.lastAssistantText,
        toolTrailRef: host.toolTrailRef,
      };
      scratch.writeCheckpoint(payload);
      lastTrailRef = host.toolTrailRef;
      // The transcript gets the summary projection only (B3) — the full trail
      // is on disk and cited by digest.
      return checkpointCompactionText(payload);
    } catch { return undefined; }
  }

  /**
   * Summarize the delta since the last epoch. When the delta does not fit one
   * bounded request it is chunked, each chunk summarized, and the partial
   * summaries recursively chunked+merged — depth-bounded, so an oversized
   * transcript ends in a typed failure rather than an endless continuation.
   */
  async function* summarizeBoundedDelta(
    usage: UsageTotals,
    attributionGeneration: number,
    compacted = false,
  ): AsyncGenerator<RequestMeasurementEvent, string, void> {
    const all = transcript.toProviderMessages();
    const delta = all.slice(Math.min(epochPreambleLength, all.length));
    const budget = compacted ? Math.max(1, Math.floor(checkpointDeltaBudget() / 4)) : checkpointDeltaBudget();
    const previousSummary = previousCheckpointSummary();
    let chunks = planCheckpointDelta(delta, budget);
    if (chunks.length === 0) chunks = ['(no new activity since the previous checkpoint)'];
    for (let depth = 0; chunks.length > 1; depth++) {
      if (depth >= CHECKPOINT_MERGE_MAX_DEPTH) throw new Error('checkpoint-merge-depth-exceeded');
      const partials: string[] = [];
      for (const chunk of chunks) {
        partials.push(yield* callCheckpointProvider(previousSummary, chunk, usage, attributionGeneration));
      }
      chunks = packLines(
        partials.map((partial) => boundTextForCheckpoint(partial, Math.max(128, budget * 2))),
        budget,
      );
      if (chunks.length === 0) throw new Error('checkpoint-merge-produced-nothing');
    }
    return yield* callCheckpointProvider(previousSummary, chunks[0]!, usage, attributionGeneration);
  }

  /** Measure what the CURRENT transcript (plus any pending extra messages) would
   *  cost on the wire. `undefined` when no context authority is known — the
   *  caller then fails closed rather than guessing a window size. */
  /** 7108 — the turn's INCLUSIVE output ceiling (visible reserve + reasoning
   *  room proven by the transport's descriptor): the same authority the loop
   *  uses, so measurement/admission here never under-reserve for a thinking model. */
  async function turnOutputCeilingTokens(adapter: ProviderAdapter, model: string): Promise<number> {
    if (!deps.nativeBudget) return 0;
    return planReasoning({
      policy: contextBudget.reasoning, descriptor: await resolveAdapterReasoningControl(adapter, model, turnAbort?.signal),
      structured: false, visibleReserveTokens: contextBudget.outputReserveTokens,
    }).outputCeilingTokens;
  }

  async function measureContext(extra: readonly ProviderMessage[] = []): Promise<
    { inputTokens: number; window: number; outputCeilingTokens: number; measurement: Awaited<ReturnType<typeof measureProviderRequest>> } | undefined
  > {
    const window = deps.getContextBudgetTokens?.();
    if (window === undefined || !(window > 0)) return undefined;
    const adapter = deps.getAdapter?.() ?? deps.adapter;
    const model = deps.getModel?.() ?? deps.model;
    const outputCeilingTokens = await turnOutputCeilingTokens(adapter, model);
    const request: ProviderRequest = {
      system: composeSystemPrompt({ cwd: deps.cwd, lang: deps.lang,
        ...(scratch ? { scratchDir: scratch.info.root } : {}) }),
      messages: [...transcript.toProviderMessages(), ...extra],
      tools: deps.getProviderToolSchemas?.() ?? deps.registry.toNativeSchemas(),
      model,
      ...(outputCeilingTokens > 0 ? { outputCeilingTokens } : {}),
    };
    if (preambleBudgeter) {
      const prepared = await preambleBudgeter.prepare({
        compose: {cwd: deps.cwd, lang: deps.lang, ...(scratch ? {scratchDir: scratch.info.root} : {})},
        tools: request.tools, adapter, model, window,
        outputCeilingTokens,
        safetyReserveTokens: contextBudget.contextSafetyReserveTokens,
      });
      request.system = prepared.system; request.tools = prepared.tools;
    }
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
    return { inputTokens: measurement.inputTokens, window, outputCeilingTokens, measurement };
  }

  /** Verified exact fit of the fresh epoch — the precondition for the single
   *  bounded retry. Unknown context authority → not verifiable → no retry. */
  async function epochFits(retryInput: string): Promise<boolean> {
    const window = deps.getContextBudgetTokens?.();
    if (window === undefined || !(window > 0)) return false;
    const measured = await measureContext([{ role: 'user', content: retryInput }]);
    if (!measured) return false;
    return decideProviderAdmission(
      measured.measurement,
      measured.outputCeilingTokens,
      deps.nativeBudget?.contextSafetyReserveTokens ?? 0,
    ).admitted;
  }

  /** Set by a successful epoch turnover — the precondition for the one retry. */
  let epochAdvancedThisTurn = false;

  /** Take one context epoch: bounded-delta checkpoint → durable write → compact
   *  the transcript onto raw intent + reference lineage + the checkpoint. Usage
   *  is emitted (and accrued) even when the summarization itself fails — the
   *  provider call happened, so it is billed and reported either way. */
  async function* takeContextEpoch(
    turnId: string,
    attributionGeneration: number,
  ): AsyncIterable<AgentSessionEvent> {
    if (closed || !scratch || !scratchDeps) return;
    const usage: UsageTotals = { inputTokens: 0, outputTokens: 0 };
    checkpointPressureRepaired = false;
    let text: string | undefined;
    let failureCode: CheckpointFailureCode | undefined;
    let providerFailureCode: string | undefined;
    try {
      try {
        try {
          text = yield* summarizeBoundedDelta(usage, attributionGeneration);
        } catch (error) {
          if (!(error instanceof CheckpointPressure)) throw error;
          checkpointPressureRepaired = true;
          microCompactToolResults(turnId);
          text = yield* summarizeBoundedDelta(usage, attributionGeneration, true);
        }
      } catch (error) {
        providerFailureCode = providerContextErrorCode(error);
        failureCode = error instanceof CheckpointFailure ? error.code : 'CHECKPOINT_PROVIDER_FAILED';
      }
    } finally {
      // A consumer may close the outer session iterator between checkpoint
      // chunks. Provider-reported usage observed before that boundary remains
      // billable even though no later aggregate event can be yielded.
      if ((usage.inputTokens > 0 || usage.outputTokens > 0) && deps.costGuard) {
        accrue(deps.costGuard, usage);
      }
    }
    if (usage.inputTokens > 0 || usage.outputTokens > 0) {
      yield { type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    }
    if (providerFailureCode) {
      yield { type: 'notice', code: providerFailureCode, message: providerFailureCode };
    }
    if (closed) return;
    if (text !== undefined) {
      try {
        // 7110: the model's summary fields are merged with HOST truth —
        // `createdAt` is host-stamped (a model-authored instant is discarded)
        // and the tool trail is the host's, never shrinkable by the model.
        const payload = hostStampCheckpoint(parseCheckpointPayloadText(text), hostCheckpointState());
        if (payload === undefined) failureCode = 'CHECKPOINT_PAYLOAD_INVALID';
        else {
          try { scratch.writeCheckpoint(payload); }
          catch (error) {
            failureCode = error instanceof Error && error.message === 'invalid checkpoint payload'
              ? 'CHECKPOINT_PAYLOAD_INVALID'
              : 'CHECKPOINT_WRITE_FAILED';
          }
          if (failureCode === undefined) { text = checkpointCompactionText(payload); lastTrailRef = payload.toolTrailRef ?? null; }
        }
      } catch (error) {
        failureCode = error instanceof CheckpointFailure ? error.code : 'CHECKPOINT_WRITE_FAILED';
      }
    }
    if (failureCode !== undefined || text === undefined) {
      const fallback = deterministicCheckpoint(failureCode ?? 'CHECKPOINT_RESPONSE_MISSING');
      if (fallback !== undefined) {
        text = fallback;
        failureCode = undefined;
        yield { type: 'notice', code: 'native.checkpoint.deterministic', message: 'native.checkpoint.deterministic' };
      }
    }
    if (failureCode !== undefined || text === undefined) {
      const reasonCode = failureCode ?? 'CHECKPOINT_RESPONSE_MISSING';
      checkpointDegradation = {
        status: 'degraded',
        path: scratch.info.checkpointDir,
        reasonCode,
        reason: `checkpoint-degraded:${reasonCode.toLowerCase()}`,
      };
      // The existing epoch is deliberately left untouched on refusal/corruption.
      yield { type: 'notice', code: 'native.checkpoint.degraded', message: `checkpoint degraded — context epoch ${contextEpoch} kept` };
      return;
    }
    microCompactToolResults(turnId);
    // Keep the latest completed call group atomically. The transcript helper's
    // default count of eight can otherwise select eight results from a large
    // batch, miss their earlier assistant owner, and discard every result.
    const lineage = transcript.toProviderMessages();
    let lineageLimit = 8;
    for (let index = lineage.length - 1; index >= 0; index--) {
      if (lineage[index]!.role === 'assistant' && lineage[index]!.toolCalls?.length) {
        lineageLimit = Math.max(lineageLimit, lineage.length - index);
        break;
      }
    }
    transcript.compactForContextEpoch(epochOpening(lastTrailRef), text, turnId, lineageLimit);
    epochPreambleLength = transcript.toProviderMessages().length;
    contextEpoch++;
    epochAdvancedThisTurn = true;
    checkpointDegradation = undefined;
    // 7110: from here on, a byte-identical read-only call this turn is a
    // restart loop, not new work — the trail answers it.
    replayArmed = true;
    yield { type: 'notice', code: 'native.checkpoint.saved', message: `context epoch ${contextEpoch} — checkpointed from a bounded delta` };
  }

  /** PROACTIVE trigger: turn the epoch over BEFORE the request jams. Measured,
   *  not guessed — an unknown context authority simply never triggers it. */
  async function* maybeRefreshBeforeTurn(
    turnId: string,
    attributionGeneration: number,
  ): AsyncIterable<AgentSessionEvent> {
    const planned = contextRefreshPlanned;
    contextRefreshPlanned = false;
    if (!scratch || !scratchDeps) return;
    if (planned) {
      lastContextTrigger = 'planned';
      lastCheckpointPressure = undefined;
      yield* takeContextEpoch(turnId, attributionGeneration);
      return;
    }
    const measured = await measureContext();
    if (!measured) return;
    if (measured.inputTokens >= Math.floor(measured.window * contextBudget.contextHighWaterRatio)) {
      lastContextTrigger = 'token-pressure';
      lastCheckpointPressure = undefined;
      yield* takeContextEpoch(turnId, attributionGeneration);
    }
  }

  async function* runWithCheckpoints(
    input: StructuredTurnInput,
    turnId: string,
    attributionGeneration: number,
    turnLoopDeps: LoopDeps,
  ): AsyncIterable<AgentSessionEvent> {
    if (closed || turnLoopDeps.isCancelled?.()) {
      yield { type: 'error', code: 'native.session.closed', message: 'native.session.closed' };
      yield { type: 'turn-end' };
      return;
    }
    lastRawIntent = input.rawIntent;
    for (const reference of input.references) rememberReference(reference);
    // 7110: the trail and the replay guard are per turn.
    trail.reset();
    assistantTextBuffer = '';
    lastAssistantText = '';
    replayArmed = false;
    try { yield* maybeRefreshBeforeTurn(turnId, attributionGeneration); }
    catch (error) {
      if (!(error instanceof PreambleBudgetError)) throw error;
      yield {type: 'error', code: error.code, message: error.code};
      yield {type: 'turn-end'};
      return;
    }
    // The recovery turn drops the expansion and rides intent + lineage instead —
    // re-sending the payload that just overflowed would be a doomed second call.
    const retryInput = epochObjective();
    for (let attempt = 0; ; attempt++) {
      epochAdvancedThisTurn = false;
      transcript.setNextUserMetadata({ turnId, origin: 'user' });
      const payload = attempt === 0 ? input.expandedPayload : retryInput;
      let retry = false;
      for await (const event of runAgentTurn(turnLoopDeps, transcript, payload)) {
        if (event.type === 'request-measurement'
          && attributionGeneration === requestAttributionGeneration) {
          lastRequestMeasurement = event;
        }
        if (event.type === 'usage') {
          providerReportedUsage.inputTokens += event.inputTokens;
          providerReportedUsage.outputTokens += event.outputTokens;
          providerReportedUsage.reports++;
        }
        // 7110: derive the host trail from the loop's own events.
        if (event.type === 'text-delta') assistantTextBuffer += event.text;
        else if (event.type === 'tool-proposed') trail.propose(event.id, event.tool, event.args);
        else if (event.type === 'tool-result') {
          if (assistantTextBuffer.length > 0) { lastAssistantText = assistantTextBuffer; assistantTextBuffer = ''; }
          if (event.code === REPLAY_SERVED_CODE) {
            // A served replay is not a new observation — never re-recorded.
            trail.discard(event.id);
          } else {
            trail.complete(event.id, event.ok, event.output);
            // Anything that is not an explicitly replayable (pure read) tool may
            // have changed what a read returns — including `deckent_call_tool`,
            // which routes writes/shell behind a silent tier: earlier results stay
            // in the trail as history but can no longer be served.
            if (deps.registry.get(event.tool)?.replayable !== true) trail.invalidateReplay();
          }
        }
        if (event.type === 'error' && isNativeBudgetTerminalCode(event.code)) {
          exhausted = { code: event.code, at: Date.now(), epoch: budgetEpoch };
        }
        if (
          event.type === 'error'
          && (event.code === 'native-context.admission-denied' || event.code === 'INPUT_CONTEXT_OVERFLOW')
          && attempt === 0
        ) {
          // ONE bounded recovery path for a typed overflow: a verified-exact-fit
          // fresh epoch, the original turn retried exactly once. No loop.
          if (!epochAdvancedThisTurn) {
            lastContextTrigger = 'overflow';
            lastCheckpointPressure = undefined;
            yield* takeContextEpoch(turnId, attributionGeneration);
          }
          if (epochAdvancedThisTurn && await epochFits(retryInput)) {
            retry = true;
            break;
          }
        }
        yield event;
        if (event.type === 'tool-result' && event.code === REPLAY_SERVED_CODE) {
          yield { type: 'notice', code: REPLAY_SERVED_CODE, message: REPLAY_SERVED_CODE };
        }
        if (event.type !== 'budget-checkpoint-request') continue;
        // 7110 B3 once-per-turn guard: a pressure request that arrives when the
        // transcript holds NOTHING beyond the preamble the last epoch installed
        // has nothing new to summarize — taking another epoch would only re-render
        // the same opening (host createdAt changes defeat the loop's own digest
        // dedupe) and loop. Typed notice, epoch kept.
        if (event.reason === 'token-pressure' && epochAdvancedThisTurn
          && transcript.toProviderMessages().length <= epochPreambleLength) {
          yield { type: 'notice', code: PRESSURE_SUPPRESSED_CODE, message: PRESSURE_SUPPRESSED_CODE };
          continue;
        }
        lastContextTrigger = event.reason === 'token-pressure' ? 'token-pressure' : 'cadence';
        if (event.reason !== 'token-pressure') lastCheckpointPressure = undefined;
        yield* takeContextEpoch(turnId, attributionGeneration);
        if (event.reason === 'token-pressure' && event.pressure) lastCheckpointPressure = event.pressure;
      }
      if (!retry) return;
      yield {
        type: 'notice',
        code: 'native.checkpoint.epoch-advanced',
        message: `context epoch ${contextEpoch} verified to fit — retrying the turn once`,
      };
    }
  }

  let nativeBudgetState: NativeBudgetState | undefined = deps.nativeBudget ? createNativeBudgetState() : undefined;

  function createTurnLoopDeps(turn: PermissionTurn): LoopDeps {
    return {
      adapter: deps.adapter,
      ...(preambleBudgeter ? {preambleBudgeter} : {}),
      ...(deps.nativeBudget ? { nativeBudget: deps.nativeBudget } : {}),
      ...(nativeBudgetState ? { nativeBudgetState } : {}),
      ...(deps.contentStore ? { contentStore: deps.contentStore } : {}),
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
      isCancelled: () => turn.retired || turn.controller.signal.aborted || activePermissionTurn !== turn,
      getTurnSignal: () => turn.controller.signal,
      issuePermission: (input) => issuePermission(turn, input),
      requestPermission: (request) => awaitPermission(turn, request),
      validatePermission,
      claimPermissionEffect,
      // 7110 restart-loop guard — consulted only after the loop's own
      // permission/policy chain admitted this exact call.
      interceptToolCall(call) {
        if (!replayArmed) return undefined;
        // Explicit purity predicate, never tier: `deckent_call_tool` is silent
        // yet routes writes; CLI/MCP tools read live state.
        if (deps.registry.get(call.name)?.replayable !== true) return undefined;
        const record = trail.find(toolCallDigest(call.name, call.args));
        // Only a result that actually succeeded is evidence; a denial/hold/error
        // recorded before is never served after the permission chain accepted a call.
        if (!record || record.output === null || record.ok !== true) return undefined;
        return {
          ok: record.ok,
          output: `${record.output}\n[deckent] ${trailLabels.replayNote}`,
          meta: { code: REPLAY_SERVED_CODE, ...(record.resultRef ? { resultRef: record.resultRef } : {}) },
        };
      },
      enterToolExecution(callId: string): () => void {
        if (turn.retired || turn.controller.signal.aborted || activePermissionTurn !== turn) return () => {};
        const token = Symbol(callId);
        turn.activeParent = { token, callId };
        return () => {
          if (turn.activeParent?.token === token) turn.activeParent = undefined;
        };
      },
    };
  }

  return {
    send(userInput: TurnInput): AsyncIterable<AgentSessionEvent> {
      if (closed) {
        return (async function* closedTurn(): AsyncIterable<AgentSessionEvent> {
          yield { type: 'error', code: 'native.session.closed', message: 'native.session.closed' };
          yield { type: 'turn-end' };
        })();
      }
      if (activePermissionTurn) retireTurn(activePermissionTurn, 'PERMISSION_TURN_REPLACED');
      // TERMINAL-TOOLS-008 — a fresh controller per turn: a late cancel() on a
      // finished turn can never poison the next one.
      turnAbort = new AbortController();
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
      const generation = ++turnSequence;
      const turnId = `turn-${generation}`;
      const turn: PermissionTurn = {
        generation,
        controller: turnAbort,
        issued: new Map(),
        retired: false,
      };
      activePermissionTurn = turn;
      const attributionGeneration = requestAttributionGeneration;
      return runWithCheckpoints(
        normalizeTurnInput(userInput),
        turnId,
        attributionGeneration,
        createTurnLoopDeps(turn),
      );
    },
    renewBudgetEpoch(): { epoch: number } {
      budgetEpoch++;
      exhausted = undefined;
      if (deps.nativeBudget) nativeBudgetState = createNativeBudgetState();
      // Cumulative billing/cost/usage is NOT touched here — `deps.costGuard` and
      // every emitted usage total stay exactly as they were; only the WORKING
      // budget restarts. The context epoch is refreshed safely on the next send
      // (bounded-delta checkpoint), so `/renew` never has to mean "forget".
      contextRefreshPlanned = true;
      return { epoch: budgetEpoch };
    },
    respondPermission(
      request: PermissionRequestEvent,
      response: PermissionResponse,
    ): PermissionResponseDisposition {
      return acceptPermissionResponse(activePermissionTurn, request, response);
    },
    async requestNestedPermission(
      input: NestedPermissionRequestInput,
      decidePermission: NativePermissionDecisionCallback,
    ): Promise<NestedPermissionRequestResult> {
      const turn = activePermissionTurn;
      const parent = turn?.activeParent;
      if (!turn || !parent || closed || turn.retired || turn.controller.signal.aborted) {
        return { kind: 'hold', reasonCode: 'PERMISSION_PARENT_INACTIVE' };
      }
      let request: PermissionRequestEvent;
      try {
        request = issuePermission(turn, { ...input, callId: parent.callId, nested: true });
      } catch {
        return { kind: 'hold', reasonCode: 'PERMISSION_STALE' };
      }
      let proposed: PermissionResponse;
      try {
        proposed = await decidePermission(request, turn.controller.signal);
      } catch {
        proposed = hold('PERMISSION_DECISION_UNAVAILABLE');
      }
      const disposition = acceptPermissionResponse(turn, request, proposed);
      if (!disposition.ok) return { kind: 'hold', reasonCode: disposition.reasonCode };
      const accepted = turn.issued.get(request.invocation.invocationId)?.response;
      if (!accepted || accepted.decision === 'hold') {
        return { kind: 'hold', reasonCode: accepted?.reasonCode ?? 'PERMISSION_RESPONSE_INVALID' };
      }
      return { kind: 'resolved', request, response: accepted };
    },
    claimPermissionEffect,
    validatePermissionRequest,
    cancel(): void {
      if (activePermissionTurn) retireTurn(activePermissionTurn, 'PERMISSION_CANCELLED');
      turnAbort?.abort();
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
    async contextSnapshot(): Promise<ContextSnapshot> {
      const decision = lastRequestMeasurement?.decision;
      return {
        window: decision?.measurement.identity.contextWindowTokens,
        measuredInputTokens: decision?.measurement.inputTokens,
        ...(lastRequestMeasurement
          ? { lastRequestMeasurement: Object.freeze({ ...lastRequestMeasurement }) }
          : {}),
        ...(providerReportedUsage.reports > 0 ? { providerReportedUsage: { ...providerReportedUsage } } : {}),
        epoch: contextEpoch,
        messages: transcript.toProviderMessages().length,
        preambleMessages: epochPreambleLength,
        ...(preambleBudgeter?.snapshot() ? {preambleBudget: preambleBudgeter.snapshot()} : {}),
        checkpoint: (checkpointDegradation ?? scratch?.readLatestCheckpoint() ?? { status: 'empty' }).status,
        refreshPlanned: contextRefreshPlanned,
        highWaterRatio: contextBudget.contextHighWaterRatio,
        ...(lastContextTrigger ? { lastContextTrigger } : {}),
        ...(lastCheckpointPressure ? { lastCheckpointPressure } : {}),
        ...((() => {
          const authority = deriveMeasurementAuthority(deps.measurementAuthority, decision?.measurement);
          return authority ? { measurementAuthority: authority } : {};
        })()),
      };
    },
    clearLastRequestMeasurement(): void {
      requestAttributionGeneration++;
      lastRequestMeasurement = undefined;
    },
    planContextRefresh(): void {
      contextRefreshPlanned = true;
    },
    compactContext(): AsyncIterable<AgentSessionEvent> {
      if (closed) {
        return (async function* closedCompact(): AsyncIterable<AgentSessionEvent> {
          yield { type: 'error', code: 'native.session.closed', message: 'native.session.closed' };
        })();
      }
      if (!scratch || !scratchDeps) {
        return (async function* unavailable(): AsyncIterable<AgentSessionEvent> {
          yield { type: 'notice', code: 'native.compact.unavailable', message: 'compaction unavailable — no scratch store on this session' };
        })();
      }
      compactSequence++;
      const attributionGeneration = requestAttributionGeneration;
      // A fresh abort seam for the explicit compaction (cancel() aborts it).
      turnAbort = new AbortController();
      lastContextTrigger = 'manual';
      lastCheckpointPressure = undefined;
      return takeContextEpoch(`compact-${compactSequence}`, attributionGeneration);
    },
    close(options = {}): void {
      closed = true;
      if (activePermissionTurn) retireTurn(activePermissionTurn, 'PERMISSION_SESSION_CLOSED');
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
