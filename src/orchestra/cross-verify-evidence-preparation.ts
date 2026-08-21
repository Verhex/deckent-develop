// ─── Cross-verify candidate evidence preparation (§12.2 T2b) ─────────────────
//
// The ONE production caller chain that takes ProviderEvidenceProducer.refresh()
// from "zero callers" to a real pre-compose step on the xverify path. compose()
// stays a pure reader of immutable authority (its documented contract); this
// module runs BEFORE it and only through canonical authorities:
//
//   exact Docker identity  → DockerSpawnBackend.inspectExactCrossVerifyRuntime
//   fresh-evidence reuse   → ProviderTruthStore latest row + toReachabilityEvidence
//   probe ceilings         → owner-authored execution_budget purpose profile
//   probe authorization    → attended-execution approval, provider-evidence-probe
//                            subject (request → live-authenticated decision → claim)
//   probe + persistence    → ProviderEvidenceProducer.refresh() (freshness epoch,
//                            durable singleflight, typed cooldown all live there)
//
// Every missing authority is a typed resumable HOLD naming exactly what is
// missing. Nothing here fabricates a ref, approves itself, or falls back to a
// same-provider verifier. This module is string-free: operator-facing remedy
// text is rendered by the CLI surface from the typed reason codes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ResolvedConfig } from '../core/config-types.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import type { ApprovalAuthorityRuntimeService } from '../core/approval-authority-runtime.js';
import {
  attendedExecutionProjectId,
  providerEvidenceProbeApprovalRequestId,
  AttendedExecutionApprovalError,
  type ProviderEvidenceProbeApprovalClaimV1,
} from '../core/attended-execution-approval.js';
import { ApprovalBrokerError } from '../core/approval-broker.js';
import {
  resolveReachabilityProbePurposeProfile,
  type ReachabilityProbePurposeProfileUnavailableReason,
} from '../core/execution-budget-policy.js';
import { deriveReachabilityProbeBudget } from '../core/execution-budget-derivation.js';
import { toReachabilityEvidence } from '../core/provider-truth.js';
import type { ReachabilityProbeBudget } from '../core/provider-evidence-probe-contract.js';
import type {
  ProviderEvidenceHoldReason,
  ProviderEvidenceRefreshRequest,
} from '../core/provider-evidence-producer.js';
import type { DockerSpawnBackend } from './spawn-backend-docker.js';
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';
import { liveRuleFor } from '../core/approval-rules-engine.js';

const DEFAULT_DECISION_WINDOW_MS = 120_000;
const DEFAULT_DECISION_POLL_MS = 2_000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function approvalValidationReason(error: AttendedExecutionApprovalError): string {
  const structured = error as AttendedExecutionApprovalError & {
    readonly reason?: unknown;
    readonly validationReason?: unknown;
  };
  for (const candidate of [structured.validationReason, structured.reason]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return error.message.match(/\b(?:request-expired|session-expired|request-not-found|session-not-found)\b/u)?.[0]
    ?? error.code.toLowerCase().replaceAll('_', '-');
}

function persistStaleApprovalHold(
  projectRoot: string,
  requestId: string,
  validationReason: string,
  at: string,
): void {
  const directory = join(projectRoot, '.analysis', 'xverify');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'approval-validation-holds.jsonl');
  const prior = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  const record = JSON.stringify({ requestId, validationReason, at });
  atomicWriteFileSync(path, `${prior}${prior && !prior.endsWith('\n') ? '\n' : ''}${record}\n`);
}

export interface CrossVerifyEvidencePreparationInput {
  readonly projectRoot: string;
  readonly config: ResolvedConfig;
  readonly providerAuthority: ProviderAuthorityRuntimeServiceOpenResult | undefined;
  /** Opened by the CLI composition; absent → typed approval-authority hold. */
  readonly approvalRuntime?: ApprovalAuthorityRuntimeService;
  readonly candidate: { readonly provider: string; readonly model: string };
  readonly dockerBackend: Pick<DockerSpawnBackend, 'inspectExactCrossVerifyRuntime'>;
  readonly requester: {
    readonly role: 'brain' | 'worker' | 'auditor' | 'nervous' | 'connector';
    readonly instanceId: string;
  };
  readonly userId: string;
  /** Injected by the rendering surface (i18n stays out of this mechanism module). */
  readonly approvalSummary: string;
  readonly runId: string;
  readonly decisionWindowMs?: number;
  readonly decisionPollMs?: number;
  readonly now?: () => Date;
  readonly sleepFn?: (ms: number) => Promise<void>;
}

export type CrossVerifyEvidencePreparationHoldReason =
  | 'provider_authority_unavailable'
  | 'backend_identity_unavailable'
  | 'budget_profile_unavailable'
  | 'approval_authority_unavailable'
  | 'approval_undecided'
  | 'approval_rejected'
  | 'approval_untrusted'
  | 'approval_consumed'
  | 'evidence_refresh_hold';

export type CrossVerifyEvidencePreparationResult =
  | {
      readonly state: 'ready';
      /** True when fresh evidence was reused and no probe was authorized or run. */
      readonly reused: boolean;
      readonly executionProfileRef: string;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly state: 'hold';
      readonly reasonCode: CrossVerifyEvidencePreparationHoldReason;
      /** Exact missing-authority detail (opaque codes/refs, never free prose). */
      readonly detailCode: string;
      readonly evidenceRefs: readonly string[];
      /** Present on approval holds so the operator can decide the exact request. */
      readonly approvalRequestId?: string;
      /** Present on producer holds so remedies can name the producer reason. */
      readonly producerReasonCode?: ProviderEvidenceHoldReason;
    };

function billingModeOf(config: ResolvedConfig): ReachabilityProbeBudget['billingMode'] {
  return config.auth_mode === 'api' ? 'metered-api' : 'subscription';
}

function hold(
  reasonCode: CrossVerifyEvidencePreparationHoldReason,
  detailCode: string,
  evidenceRefs: readonly string[] = [],
  extra: { approvalRequestId?: string; producerReasonCode?: ProviderEvidenceHoldReason } = {},
): CrossVerifyEvidencePreparationResult {
  return Object.freeze({
    state: 'hold',
    reasonCode,
    detailCode,
    evidenceRefs: Object.freeze([...evidenceRefs]),
    ...(extra.approvalRequestId ? { approvalRequestId: extra.approvalRequestId } : {}),
    ...(extra.producerReasonCode ? { producerReasonCode: extra.producerReasonCode } : {}),
  });
}

/**
 * Prepare exact candidate reachability/limit evidence for one verifier
 * candidate, so the downstream composition's candidate gate reads real rows
 * instead of holding on `candidate_evidence_unavailable` forever.
 */
export async function prepareCrossVerifyCandidateEvidence(
  input: CrossVerifyEvidencePreparationInput,
): Promise<CrossVerifyEvidencePreparationResult> {
  const now = input.now ?? (() => new Date());
  const sleep = input.sleepFn ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));

  const authority = input.providerAuthority;
  if (!authority || authority.state !== 'ready') {
    return hold(
      'provider_authority_unavailable',
      authority?.state === 'hold' ? authority.reasonCode : 'not-configured',
      authority?.state === 'hold' ? [authority.authorityEvidenceRef] : [],
    );
  }

  // 1 — exact Docker candidate identity (digest-pinned; no identity → no probe).
  const runtime = await input.dockerBackend.inspectExactCrossVerifyRuntime(
    input.candidate.provider as never,
    input.candidate.model,
  );
  if (runtime.state !== 'ready') {
    return hold('backend_identity_unavailable', runtime.reasonCode, [runtime.authorityEvidenceRef]);
  }

  const service = authority.service;
  const backendScope = {
    transport: 'cli' as const,
    executionBackend: 'docker' as const,
    executionProfileRef: runtime.executionProfileRef,
    endpointRefHash: null,
    runtimeFingerprint: runtime.runtimeFingerprint,
  };

  // 2 — fresh-evidence reuse: a known∧reachable row inside its TTL needs no new
  // approval and no probe. The producer re-checks this under its singleflight
  // lock too; this pre-check only avoids pointless operator approval prompts.
  // 7081 approval-carousel layer-2 (2026-08-20): this lookup is ACCOUNT-
  // AGNOSTIC — the account hash is resolved inside the producer's evidence
  // sources, so the old exact-scope query with `accountRefHash: null` never
  // matched a row written with a real hash, and every run re-asked the owner
  // for a one-shot approval even while a fresh row sat in the store. The
  // producer's full exact-scope reuse remains the authority for actually
  // USING the evidence.
  const nowDate = now();
  const freshRow = service.truthStore.getLatestReachabilityAnyAccount({
    tenantId: service.tenantId,
    projectId: service.projectId,
    provider: input.candidate.provider,
    model: input.candidate.model,
    authMode: billingModeOf(input.config) === 'metered-api' ? 'api' : 'subscription',
    transport: backendScope.transport,
    executionBackend: backendScope.executionBackend,
    endpointRefHash: null,
    runtimeFingerprint: runtime.runtimeFingerprint,
    executionProfileRef: runtime.executionProfileRef,
    capability: 'inference',
  }, nowDate);
  // 7081 layer-2 (final form): a fresh row must NOT short-circuit the whole
  // preparation — the canonical refresh (step 5) also writes the fresh LIMIT
  // snapshot the verifier-candidate projection requires (min-freshness), so
  // skipping it produced authority_failure holds downstream. A fresh row only
  // skips the APPROVAL step: the producer's own exact-scope reuse then
  // returns ready without a probe, and a real probe (no fresh row at the
  // producer's scope) holds with the honest typed probe_approval_required.
  let skipApprovalForFreshEvidence = false;
  if (freshRow) {
    const evidence = toReachabilityEvidence(freshRow, nowDate);
    if (evidence.state === 'known' && evidence.reachable) {
      skipApprovalForFreshEvidence = true;
    }
  }

  // 3 — owner-authored probe ceilings (no ceiling literal exists in code).
  const billingMode = billingModeOf(input.config);
  const profileDecision = resolveReachabilityProbePurposeProfile({
    ...(input.config.execution_budget ? { policy: input.config.execution_budget } : {}),
    billingMode,
  });
  if (profileDecision.state !== 'available') {
    return hold(
      'budget_profile_unavailable',
      profileDecision.reasonCode satisfies ReachabilityProbePurposeProfileUnavailableReason,
      [profileDecision.profileRef],
    );
  }
  const projection = deriveReachabilityProbeBudget({
    executionBudget: {},
    billingMode,
    purposeProfile: profileDecision.profile,
  });
  const budgetEvidenceRef = `execution-budget:${profileDecision.policyDigest}`;

  // 4 — probe authorization: request → live-authenticated decision → single-use
  // claim. The CLI invocation itself is never a decision. Skipped entirely
  // when fresh reachability evidence exists (7081 layer-2): no probe will
  // fire, so no one-shot approval is owed.
  if (!skipApprovalForFreshEvidence && !input.approvalRuntime) {
    return hold('approval_authority_unavailable', 'approval-authority-not-composed');
  }
  let claim: ProviderEvidenceProbeApprovalClaimV1 | null = null;
  if (!skipApprovalForFreshEvidence) {
  const approvalRuntime = input.approvalRuntime;
  if (!approvalRuntime) {
    return hold('approval_authority_unavailable', 'approval-authority-not-composed');
  }
  const subject = Object.freeze({
    kind: 'provider-evidence-probe' as const,
    tenantId: service.tenantId,
    projectId: attendedExecutionProjectId(input.projectRoot),
    provider: input.candidate.provider,
    model: input.candidate.model,
    backendScope: `${billingMode === 'metered-api' ? 'api' : 'subscription'}:cli:docker` as never,
    executionProfileRef: runtime.executionProfileRef as never,
    // The request digest must name this execution attempt, not merely the
    // reusable provider/runtime coordinates. Same-run contenders still derive
    // the same nonce and may adopt APR_DUPLICATE_ID; a later run cannot.
    attemptNonce: sha256(`${input.runId}\0${runtime.runtimeFingerprint}`),
    budget: projection,
    ttl: Object.freeze({
      startsAt: nowDate.toISOString(),
      expiresAt: new Date(
        nowDate.getTime() + (input.decisionWindowMs ?? DEFAULT_DECISION_WINDOW_MS),
      ).toISOString(),
    }),
  });
  const approvalAuthority = approvalRuntime.attendedExecutionApprovalAuthority;
  const requestId = providerEvidenceProbeApprovalRequestId(subject);
  try {
    approvalAuthority.submitProviderEvidenceProbe({
      requester: input.requester,
      userId: input.userId,
      summary: input.approvalSummary,
      subject,
    });
  } catch (error) {
    // A concurrent contender already submitted the identical subject — the
    // request id is deterministic, so adopt the existing request instead of
    // failing the chain (first-writer-wins on the broker store).
    if (!(error instanceof ApprovalBrokerError) || error.code !== 'APR_DUPLICATE_ID') {
      throw error;
    }
  }

  const deadline = nowDate.getTime() + (input.decisionWindowMs ?? DEFAULT_DECISION_WINDOW_MS);
  const pollMs = input.decisionPollMs ?? DEFAULT_DECISION_POLL_MS;
  for (;;) {
    try {
      claim = approvalAuthority.verifyAndClaimProviderEvidenceProbe(requestId, subject);
      break;
    } catch (error) {
      if (!(error instanceof AttendedExecutionApprovalError)) throw error;
      switch (error.code) {
        case 'DECISION_NOT_FOUND':
          if (now().getTime() >= deadline) {
            return hold('approval_undecided', requestId, [], { approvalRequestId: requestId });
          }
          // D2b-2a micro-wiring: before sleeping, let the approval rules
          // engine try the pending probe. Fail-soft by design — no matching
          // live rule means nothing happens, and any engine refusal leaves
          // the normal human-decision poll untouched (the engine can only
          // ADD a decision through the same MAC'd ingress, never block one).
          try {
            const pending = approvalRuntime.broker.getRequest(requestId);
            const rule = pending ? liveRuleFor(input.projectRoot, pending, now()) : null;
            if (rule) {
              await approvalRuntime.decideByRules(input.projectRoot, {
                requestId,
                action: rule.decision,
                idempotencyKey: `rules-engine:${requestId}:${rule.decision}`,
                reason: rule.reason,
              });
            }
          } catch { /* fail-soft: keep polling for a human decision */ }
          await sleep(pollMs);
          continue;
        case 'DECISION_NOT_ALLOWED':
          return hold('approval_rejected', requestId, [], { approvalRequestId: requestId });
        case 'DECISION_UNTRUSTED':
          persistStaleApprovalHold(
            input.projectRoot,
            requestId,
            approvalValidationReason(error),
            now().toISOString(),
          );
          return hold('approval_untrusted', requestId, [], { approvalRequestId: requestId });
        case 'APPROVAL_ALREADY_CONSUMED':
          return hold('approval_consumed', requestId, [], { approvalRequestId: requestId });
        default:
          throw error;
      }
    }
  }
  }

  // 5 — canonical refresh: freshness epoch, durable singleflight, cooldown and
  // truth/receipt persistence all live inside the producer. Runs on BOTH
  // paths (7081 layer-2): with a claim it may probe; without one (fresh
  // evidence pre-checked) it re-writes the fresh LIMIT snapshot the
  // downstream verifier-candidate projection requires and reuses the fresh
  // reachability row under its own exact scope — a real probe without a
  // claim holds with the typed probe_approval_required, never a failure.
  const refreshRequest: ProviderEvidenceRefreshRequest = {
    idempotencyKey: `xverify-prep:${runtime.runtimeFingerprint}`,
    runId: input.runId,
    taskId: null,
    callId: `xverify-prep:${runtime.runtimeFingerprint}`,
    provider: input.candidate.provider,
    model: input.candidate.model,
    authMode: billingMode === 'metered-api' ? 'api' : 'subscription',
    backend: backendScope,
    executionProfile: {
      profileRef: runtime.executionProfileRef,
      provider: input.candidate.provider,
      allowed: [{
        authMode: billingMode === 'metered-api' ? 'api' : 'subscription',
        transport: 'cli',
        executionBackend: 'docker',
      }],
    },
    approval: claim
      ? {
          evidenceRef: claim.evidenceRef,
          grantedAt: claim.grantedAt,
          expiresAt: claim.expiresAt,
        }
      : { evidenceRef: null, grantedAt: null, expiresAt: null },
    budget: {
      evidenceRef: budgetEvidenceRef,
      projection,
    },
  };
  const refreshed = await service.evidenceProducer.refresh(refreshRequest);
  if (refreshed.state !== 'ready') {
    return hold(
      'evidence_refresh_hold',
      refreshed.reasonCode,
      [refreshed.authorityEvidenceRef, ...(refreshed.deferralEvidenceRef ? [refreshed.deferralEvidenceRef] : [])],
      { producerReasonCode: refreshed.reasonCode },
    );
  }
  return Object.freeze({
    state: 'ready' as const,
    reused: false,
    executionProfileRef: runtime.executionProfileRef,
    evidenceRefs: Object.freeze([
      refreshed.authorityEvidenceRef,
      ...refreshed.reachability.evidenceRefs,
    ]),
  });
}
