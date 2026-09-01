// ─── QuestionApprovalBridge — WorkerQuestion ↔ ApprovalBroker (CKPT-1) ────────
// Governs: MASTER-PLAN Sıra-73 (CKPT-1, gerçek human-checkpoint) + strategic-pivot
// §11 (runtime-wide ApprovalBroker) + ADR-G-020 (authority). Built directly on the
// broker's PUBLIC surface only — this module owns ZERO broker internals, mirroring
// the `NervousApprovalBridge` / `WorkerApprovalGate` precedent (nervous/
// approval-bridge.ts, core/approval-worker-gate.ts).
//
// What it does: today a worker's question is auto-answered by Brain's
// `handleWorkerQuestion` (ipc-registry.ts) — a hardcoded 'continue' with no human
// in the loop. This bridge turns one WorkerQuestion into one ApprovalRequest
// (scope 'lifecycle', policy 'require-approval', risk derived heuristically from
// the question content), submits it to the injected broker, awaits the decision,
// and maps it back onto the worker's own BrainAnswer vocabulary:
//   • allow   → the worker's `suggestedAction` (or 'continue' when none)
//   • deny    → 'abort'
//   • timeout → fail-open 'continue' (the historical auto-continue default — a
//     question checkpoint must never strand a worker; §11.7)
//   • defer/escalate and TTL-expire settle the same as timeout: plain 'continue',
//     suggestedAction is NEVER honored on a non-human resolution.
//
// Pure bridge — deliberately NOT wired anywhere. ipc-registry.ts is untouched by
// design (its `handleWorkerQuestion` flow stays byte-identical); a follow-up task
// (CKPT wire) threads this module into the live question loop behind the
// `approval.question_bridge` flag (default-off, see isQuestionBridgeEnabled).
//
// ── Design note: NPM-ADVISORY never crosses this bridge (born-454) ────────────
// Dependency-mutation advisories ([NPM-ADVISORY]-prefixed questions) are a
// deterministic POLICY, not a judgment call: the answer is always fail-closed
// 'continue' + explicit not-approved message, and the actual dependency mutation
// happens host-side only (sprint-356 live incident: a worker `npm install`
// destroyed native bindings host-wide). Routing an advisory through a human
// checkpoint would make that guarantee racy — a human 'allow' here could be read
// as approval to run the install inside the workspace, and a timeout would add a
// 60s stall to a branch whose outcome is already fixed. So the bridge REJECTS
// advisory questions up front (`kind: 'npm-advisory-rejected'`, broker never
// contacted) and points the caller back at the deterministic branch in
// `handleWorkerQuestion` (ipc-registry.ts), which remains their single owner.

import { createHash, randomUUID } from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import type { ApprovalBrokerLike } from '../core/approval-worker-gate.js';
import type { ApprovalRequestInput } from '../core/approval-broker.js';
import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalRisk,
} from '../core/approval-contract.js';
import { maskArgs } from '../core/approval-masking.js';
import type { BrainAnswer, QuestionAction, WorkerQuestion } from '../core/task-types.js';
import { NPM_ADVISORY_MARKER } from './ipc-registry.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Wait ceiling before the timeout fallback settles the broker. Mirrors
 *  `askBrain`'s own 60s question-timeout default (ipc-registry.ts) — the two
 *  ends of the question pipe share one clock convention. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Decision channel stamped by this bridge's own timeout fallback. Answers
 *  settled through this channel (or the broker's TTL sweep) NEVER honor the
 *  worker's suggestedAction — only a human-originated 'allow' does. */
export const QUESTION_BRIDGE_FALLBACK_CHANNEL = 'question-bridge-fallback';

/** The broker's own TTL-sweep channel (approval-broker.ts `expire()`). */
const TTL_EXPIRE_CHANNEL = 'ttl-expire';

/** Contract ceiling for `ApprovalRequest.summary` (approval-contract.ts). */
const SUMMARY_MAX_LENGTH = 200;

// ─── Flag: approval.question_bridge (default-off) ─────────────────────────────

/**
 * Read the `approval.question_bridge` flag off a RAW config object (the parsed
 * `.deckent/config.json` shape). Default-off: an absent block, absent key, or a
 * non-`true` value all disable the bridge. Duck-typed raw read — the same
 * precedent as `api/server.ts`'s `isApprovalApiDecideEnabled` (`approval.api_decide`):
 * config-types.ts is outside this task's write scope, so typing the field on
 * `ApprovalConfig` (`question_bridge?: boolean`) is tracked as follow-up work.
 */
export function isQuestionBridgeEnabled(config: unknown): boolean {
  if (config === null || typeof config !== 'object') return false;
  const approvalBlock = (config as Record<string, unknown>)['approval'];
  if (!approvalBlock || typeof approvalBlock !== 'object') return false;
  return (approvalBlock as Record<string, unknown>)['question_bridge'] === true;
}

// ─── Risk heuristic (question content → ApprovalRisk) ────────────────────────

/** Ordered first-match-wins content heuristics — highest tier checked first.
 *  Scanned over `question + context` (case-insensitive). Coarse by design: the
 *  checkpoint human sees the full masked context anyway; risk only drives
 *  display priority/urgency, never the verdict. */
const RISK_HEURISTICS: ReadonlyArray<{ readonly risk: ApprovalRisk; readonly pattern: RegExp }> = [
  // Secret/credential surface — the highest-stakes ambiguity a worker can hit.
  { risk: 'critical', pattern: /credential|secret|token|password|api[-_ ]?key|\.env\b/i },
  // Destructive / outward-facing / hard-to-reverse operations.
  { risk: 'high', pattern: /delet|remov|\bdrop\b|\brm\s+-|force|overwrit|\bpush\b|deploy|\bprod(uction)?\b|migrat/i },
  // Structure-shifting but recoverable operations.
  { risk: 'medium', pattern: /renam|\bmov(e|ing)\b|schema|\block(file)?\b|rewrit/i },
];

/**
 * Derive an {@link ApprovalRisk} tier from the question's own content.
 * First matching tier wins (critical → high → medium); a worker already
 * suggesting 'abort' signals elevated stakes even without a keyword hit;
 * everything else is a plain low-risk ambiguity question.
 */
export function deriveQuestionRisk(question: WorkerQuestion): ApprovalRisk {
  const text = `${question.question} ${question.context ?? ''}`;
  for (const { risk, pattern } of RISK_HEURISTICS) {
    if (pattern.test(text)) return risk;
  }
  return question.suggestedAction === 'abort' ? 'medium' : 'low';
}

// ─── NPM-ADVISORY guard ───────────────────────────────────────────────────────

/** True iff the question is a dependency-mutation advisory (born-454 marker) —
 *  same detection rule as `handleWorkerQuestion`'s deterministic branch. */
export function isNpmAdvisoryQuestion(question: WorkerQuestion): boolean {
  return question.question.trimStart().startsWith(NPM_ADVISORY_MARKER);
}

/** Human/caller-facing note returned when an advisory question is rejected. */
export const NPM_ADVISORY_REJECTION_NOTE =
  'NPM-ADVISORY questions never cross the human-checkpoint bridge: their answer is a '
  + 'deterministic fail-closed policy (born-454) owned by handleWorkerQuestion '
  + '(src/orchestra/ipc-registry.ts) — always \'continue\' + not-approved message, with the '
  + 'actual dependency mutation performed host-side only. Route this question through the '
  + 'deterministic path instead.';

// ─── Bridge input / output ────────────────────────────────────────────────────

export interface QuestionBridgeOptions {
  /** Wait ceiling before the timeout fallback settles ('continue'). Default 60s
   *  ({@link DEFAULT_TIMEOUT_MS} — `askBrain` parity). */
  timeoutMs?: number;
  /** Recorded on the ApprovalRequest. Default 'local' (single-tenant runtime). */
  tenantId?: string;
  /** Recorded on the ApprovalRequest. Default 'operator'. */
  userId?: string;
  /** Clock seam for deterministic tests. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Id generator seam for deterministic tests. Defaults to `randomUUID`. */
  idFactory?: () => string;
  /** Exact normal-Docker question authority. WorkerQuestion itself remains an
   *  identity-free payload and cannot populate these fields. */
  exactAttemptBinding?: QuestionApprovalExactAttemptBinding;
  /** Re-read the host-private receipt/fence after the external decision. An
   *  exact binding without this seam fails closed before broker submission. */
  revalidateExactAttemptBinding?: (
    binding: QuestionApprovalExactAttemptBinding,
  ) => boolean | Promise<boolean>;
}

export interface QuestionApprovalExactAttemptBinding {
  readonly schemaVersion: 2;
  readonly projectRootSha256: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly generation: number;
  readonly admissionReceiptDigest: `sha256:${string}`;
  readonly fenceDigest: `sha256:${string}`;
  readonly questionReceiptDigest: `sha256:${string}`;
  readonly questionEnvelopeDigest: `sha256:${string}`;
  readonly sequence: number;
}

/** The question was bridged: submitted, decided (by a human, a policy channel,
 *  or the timeout fallback), and mapped back to a worker-consumable answer. */
export interface QuestionBridgeAnswer {
  readonly kind: 'bridged';
  readonly answer: BrainAnswer;
  readonly decision: ApprovalDecision;
  readonly request: ApprovalRequest;
}

/** The question was an NPM-ADVISORY and never reached the broker — the caller
 *  must route it through the deterministic `handleWorkerQuestion` branch. */
export interface QuestionBridgeRejection {
  readonly kind: 'npm-advisory-rejected';
  readonly note: string;
}

export interface QuestionBridgeAuthorityHold {
  readonly kind: 'authority-hold';
  readonly reasonCode:
    | 'EXACT_QUESTION_BINDING_INVALID'
    | 'EXACT_QUESTION_REVALIDATOR_UNAVAILABLE'
    | 'EXACT_QUESTION_AUTHORITY_CHANGED';
}

export type QuestionBridgeResult =
  | QuestionBridgeAnswer
  | QuestionBridgeRejection
  | QuestionBridgeAuthorityHold;

// ─── WorkerQuestion → ApprovalRequestInput ────────────────────────────────────

/** Clamp a summary onto the contract's 1..200 window, with a metadata-only
 *  fallback for a blank (fully-masked-away or empty) question text. */
function toSummary(maskedQuestion: string, taskId: string): string {
  const trimmed = maskedQuestion.trim();
  if (trimmed.length === 0) return `Worker question — task ${taskId}`;
  return trimmed.length <= SUMMARY_MAX_LENGTH ? trimmed : `${trimmed.slice(0, SUMMARY_MAX_LENGTH - 1)}…`;
}

/**
 * Map a WorkerQuestion onto the approval contract's input shape. The question
 * text + context pass through `maskArgs()` (core/approval-masking.ts) BEFORE
 * touching the request — the raw context never travels on the contract
 * (`details` carries metadata only; `rawArgsRef` stays null: this bridge holds
 * no out-of-band raw store, so there is deliberately nothing to point at).
 */
export function questionToApprovalRequest(
  question: WorkerQuestion,
  opts: {
    id: string;
    tenantId: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
    exactAttemptBinding?: QuestionApprovalExactAttemptBinding;
  },
): ApprovalRequestInput {
  const masked = maskArgs({
    question: question.question,
    context: question.context ?? '',
  });
  const maskedQuestion = typeof masked['question'] === 'string' ? masked['question'] : '';

  const exactAttempt = opts.exactAttemptBinding === undefined
    ? undefined
    : snapshotQuestionApprovalExactAttemptBinding(opts.exactAttemptBinding, question.taskId);
  if (opts.exactAttemptBinding !== undefined && exactAttempt === null) {
    throw new TypeError('EXACT_QUESTION_BINDING_INVALID');
  }
  return {
    id: opts.id,
    requester: {
      role: 'worker',
      // Contract requires min(1) — fall back to the task-derived worker id
      // convention (`w-<taskId>`, worker.ts) for a blank workerId.
      instanceId: question.workerId || `w-${question.taskId}`,
    },
    summary: toSummary(maskedQuestion, question.taskId),
    details: {
      // Metadata only — the question/context content lives in maskedArgs.
      taskId: question.taskId,
      workerId: question.workerId,
      suggestedAction: question.suggestedAction ?? null,
      questionTimestamp: question.timestamp,
      source: 'worker-question',
      ...(exactAttempt ? { exactAttempt } : {}),
    },
    scopeId: exactAttempt
      ? exactAttemptApprovalScopeId(exactAttempt)
      : question.taskId,
    scope: 'lifecycle',
    risk: deriveQuestionRisk(question),
    policy: 'require-approval',
    // TTL-expire parity with the timeout fallback: the historical question
    // default is auto-continue, and decisionToBrainAnswer maps any non-human
    // channel back to plain 'continue' (suggestedAction never honored there).
    defaultAction: 'allow',
    tenantId: opts.tenantId,
    userId: opts.userId,
    createdAt: opts.createdAt.toISOString(),
    expiresAt: opts.expiresAt.toISOString(),
    maskedArgs: masked,
    rawArgsRef: null,
  };
}

function exactAttemptApprovalScopeId(binding: QuestionApprovalExactAttemptBinding): string {
  const hash = createHash('sha256');
  hash.update('deckent.question-approval.exact-attempt-scope.v2', 'utf8');
  hash.update(Buffer.from([0]));
  hash.update(JSON.stringify([
    binding.projectRootSha256,
    binding.projectId,
    binding.taskId,
    binding.attemptId,
    binding.generation,
  ]), 'utf8');
  return `ipc-question:${hash.digest('hex')}`;
}

// ─── ApprovalDecision → BrainAnswer ───────────────────────────────────────────

/** True iff the decision came from a non-human resolution path (this bridge's
 *  own timeout fallback, or the broker's TTL sweep). */
function isFallbackChannel(channel: string): boolean {
  return channel === QUESTION_BRIDGE_FALLBACK_CHANNEL || channel === TTL_EXPIRE_CHANNEL;
}

/**
 * Map a settled {@link ApprovalDecision} back onto the worker's BrainAnswer
 * vocabulary. Only a human-originated 'allow' honors `suggestedAction`; every
 * fallback/TTL resolution and every non-allow verdict short of 'deny' degrades
 * to the historical auto-continue default. 'deny' is the one hard stop: 'abort'.
 */
export function decisionToBrainAnswer(
  decision: ApprovalDecision,
  question: WorkerQuestion,
  now: () => Date,
): BrainAnswer {
  const timestamp = now().toISOString();

  if (decision.decision === 'deny') {
    return {
      taskId: question.taskId,
      action: 'abort',
      message: `Checkpoint denied by ${decision.decidedBy} (${decision.channel})${decision.reason ? `: ${decision.reason}` : ''}`,
      timestamp,
    };
  }

  if (decision.decision === 'allow' && !isFallbackChannel(decision.channel)) {
    const honored: QuestionAction = question.suggestedAction ?? 'continue';
    return {
      taskId: question.taskId,
      action: honored,
      message: `Checkpoint approved by ${decision.decidedBy} (${decision.channel}) — ${
        question.suggestedAction ? `honoring suggested action '${honored}'` : "no suggested action, defaulting to 'continue'"
      }`,
      timestamp,
    };
  }

  // Timeout fallback, TTL expire, defer, escalate — fail-open continue (the
  // historical auto-continue default; a checkpoint must never strand a worker).
  return {
    taskId: question.taskId,
    action: 'continue',
    message: `Checkpoint unresolved (${decision.decision} via ${decision.channel}) — auto-continue fallback`,
    timestamp,
  };
}

// ─── bridgeQuestionToApproval — the round-trip ────────────────────────────────

/**
 * Bridge one WorkerQuestion through the runtime-wide ApprovalBroker (CKPT-1):
 * mask → submit → await decision (raced against `timeoutMs`) → map back to a
 * BrainAnswer. NPM-ADVISORY questions are rejected up front (see the design
 * note in the module header) — the broker is never contacted for them.
 *
 * Timeout is race-safe (WorkerApprovalGate parity): the fallback settles the
 * broker with an 'allow' on the {@link QUESTION_BRIDGE_FALLBACK_CHANNEL}; if an
 * external decision lands first (`decide` throws), the bridge defers to that
 * REAL decision instead — a stale fallback never overrides a genuine verdict.
 */
export async function bridgeQuestionToApproval(
  question: WorkerQuestion,
  broker: ApprovalBrokerLike,
  opts: QuestionBridgeOptions = {},
): Promise<QuestionBridgeResult> {
  if (isNpmAdvisoryQuestion(question)) {
    return { kind: 'npm-advisory-rejected', note: NPM_ADVISORY_REJECTION_NOTE };
  }

  const exactAttemptBinding = opts.exactAttemptBinding === undefined
    ? undefined
    : snapshotQuestionApprovalExactAttemptBinding(opts.exactAttemptBinding, question.taskId);
  if (opts.exactAttemptBinding !== undefined) {
    if (exactAttemptBinding === null) {
      return { kind: 'authority-hold', reasonCode: 'EXACT_QUESTION_BINDING_INVALID' };
    }
    if (opts.revalidateExactAttemptBinding === undefined) {
      return {
        kind: 'authority-hold',
        reasonCode: 'EXACT_QUESTION_REVALIDATOR_UNAVAILABLE',
      };
    }
  }

  const now = opts.now ?? (() => new Date());
  const idFactory = opts.idFactory ?? randomUUID;
  const timeoutMs = Math.max(1, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const createdAt = now();
  const request = broker.submit(
    questionToApprovalRequest(question, {
      id: idFactory(),
      tenantId: opts.tenantId ?? 'local',
      userId: opts.userId ?? 'operator',
      createdAt,
      expiresAt: new Date(createdAt.getTime() + timeoutMs),
      ...(exactAttemptBinding ? { exactAttemptBinding } : {}),
    }),
  );

  const decision = await awaitDecisionOrFallback(broker, request.id, timeoutMs, now);
  if (
    exactAttemptBinding !== undefined
    && exactAttemptBinding !== null
    && !await opts.revalidateExactAttemptBinding!(exactAttemptBinding)
  ) {
    return { kind: 'authority-hold', reasonCode: 'EXACT_QUESTION_AUTHORITY_CHANGED' };
  }
  return {
    kind: 'bridged',
    answer: decisionToBrainAnswer(decision, question, now),
    decision,
    request,
  };
}

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
const EXACT_BINDING_KEYS = Object.freeze([
  'schemaVersion',
  'projectRootSha256',
  'projectId',
  'taskId',
  'attemptId',
  'generation',
  'admissionReceiptDigest',
  'fenceDigest',
  'questionReceiptDigest',
  'questionEnvelopeDigest',
  'sequence',
] as const);

function boundedIdentity(value: unknown): value is string {
  return typeof value === 'string'
    && value === value.trim()
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 128;
}

function snapshotQuestionApprovalExactAttemptBinding(
  value: QuestionApprovalExactAttemptBinding,
  expectedTaskId: string,
): QuestionApprovalExactAttemptBinding | null {
  if (
    value === null
    || typeof value !== 'object'
    || nodeTypes.isProxy(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== EXACT_BINDING_KEYS.length
    || keys.some(key => typeof key !== 'string' || !EXACT_BINDING_KEYS.includes(key as never))
  ) return null;
  for (const key of EXACT_BINDING_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || descriptor.get || descriptor.set) return null;
  }
  if (!(value.schemaVersion === 2
    && SHA256_HEX_PATTERN.test(value.projectRootSha256)
    && boundedIdentity(value.projectId)
    && value.taskId === expectedTaskId
    && boundedIdentity(value.taskId)
    && boundedIdentity(value.attemptId)
    && Number.isSafeInteger(value.generation)
    && value.generation > 0
    && Number.isSafeInteger(value.sequence)
    && value.sequence > 0
    && SHA256_DIGEST_PATTERN.test(value.admissionReceiptDigest)
    && SHA256_DIGEST_PATTERN.test(value.fenceDigest)
    && SHA256_DIGEST_PATTERN.test(value.questionReceiptDigest)
    && SHA256_DIGEST_PATTERN.test(value.questionEnvelopeDigest))) return null;
  return Object.freeze({
    schemaVersion: 2,
    projectRootSha256: value.projectRootSha256,
    projectId: value.projectId,
    taskId: value.taskId,
    attemptId: value.attemptId,
    generation: value.generation,
    admissionReceiptDigest: value.admissionReceiptDigest,
    fenceDigest: value.fenceDigest,
    questionReceiptDigest: value.questionReceiptDigest,
    questionEnvelopeDigest: value.questionEnvelopeDigest,
    sequence: value.sequence,
  });
}

/** Race the broker's decision against the timeout (WorkerApprovalGate's
 *  awaitDecisionOrFallback pattern, decision-object flavored). */
function awaitDecisionOrFallback(
  broker: ApprovalBrokerLike,
  requestId: string,
  timeoutMs: number,
  now: () => Date,
): Promise<ApprovalDecision> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolveViaTimeoutFallback(broker, requestId, now).then(resolve, reject);
    }, timeoutMs);

    broker.awaitDecision(requestId).then(
      (decision) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(decision);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Settle the broker with the timeout fallback ('allow' on the fallback
 *  channel — mapped back to plain 'continue', never suggestedAction). If an
 *  external decision landed in the race window (`decide` throws), defer to it. */
async function resolveViaTimeoutFallback(
  broker: ApprovalBrokerLike,
  requestId: string,
  now: () => Date,
): Promise<ApprovalDecision> {
  try {
    return broker.decide(requestId, {
      decision: 'allow',
      decidedBy: 'system',
      channel: QUESTION_BRIDGE_FALLBACK_CHANNEL,
      decidedAt: now().toISOString(),
      reason: 'question checkpoint timed out — auto-continue fallback',
    });
  } catch {
    return broker.awaitDecision(requestId);
  }
}
