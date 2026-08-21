import { createHash } from 'node:crypto';

import type { ProviderReachabilityEvidenceSource } from '../core/provider-evidence-producer.js';
import {
  isExecutionProfileRef,
  type BoundedReachabilityProbeTransport,
} from '../core/provider-evidence-probe-contract.js';
import type {
  ReachabilityProbeObservation,
  ReachabilityProbeRequest,
} from '../core/provider-truth.js';

const PROBE_PROMPT = 'Reply with exactly DECKENT_REACHABILITY_OK. Do not use tools.';

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function evidenceRef(kind: string, ...parts: readonly string[]): string {
  return `docker-reachability-${kind}:${digest(kind, ...parts)}`;
}

/**
 * Provider-neutral reachability source for the canonical bounded Docker probe.
 *
 * Provider argv, credential admission, and response parsing remain entirely in
 * the injected canonical transport. This source only validates the requested
 * scope, forwards the owner-projected bounds, and projects the sanitized native
 * transport union into provider-truth observations.
 */
export class DockerBoundedReachabilityEvidenceSource
implements ProviderReachabilityEvidenceSource {
  readonly authorityRef: string;

  constructor(
    private readonly providerId: string,
    private readonly resolveTransport: () => BoundedReachabilityProbeTransport | null,
  ) {
    if (!providerId || providerId.trim() !== providerId) {
      throw new TypeError('providerId must be an exact non-empty canonical provider ID');
    }
    // v3 separates the provider token budget from the bounded CLI envelope
    // ceiling and distinguishes response overflow from Docker transport
    // failure. The revision is part of freshness identity upstream, so a
    // wrongly-classified earlier cooldown cannot suppress the corrected probe.
    this.authorityRef = evidenceRef('authority', providerId, 'bounded-probe-v3');
  }

  readonly probe = async (
    request: Readonly<ReachabilityProbeRequest>,
  ): Promise<ReachabilityProbeObservation> => {
    const scopeRef = evidenceRef(
      'scope',
      this.providerId,
      request.provider,
      request.model,
      request.auth.mode,
      request.backend.transport,
      request.backend.executionBackend,
      request.backend.executionProfileRef,
      request.executionProfile.provider,
      request.executionProfile.profileRef,
    );
    const notLive = (
      outcome: 'unsupported' | 'not-run',
      reason: string,
    ): ReachabilityProbeObservation => ({
      outcome,
      calledProvider: null,
      calledModel: null,
      providerRequestRefHash: null,
      latencyMs: null,
      evidenceRefs: [scopeRef, evidenceRef('hold', this.providerId, reason)],
    });

    const exactScope = request.provider === this.providerId
      && request.auth.mode === 'subscription'
      && request.auth.accountRefHash !== null
      && request.backend.transport === 'cli'
      && request.backend.executionBackend === 'docker'
      && isExecutionProfileRef(request.backend.executionProfileRef)
      && request.executionProfile.provider === this.providerId
      && request.executionProfile.profileRef === request.backend.executionProfileRef
      && request.executionProfile.allowed.some(item =>
        item.authMode === request.auth.mode
        && item.transport === request.backend.transport
        && item.executionBackend === request.backend.executionBackend);
    if (!exactScope) return notLive('unsupported', 'scope-mismatch');

    const projection = request.admission.budget.projection;
    if (!projection) return notLive('not-run', 'budget-projection-unavailable');
    const transport = this.resolveTransport();
    if (!transport) return notLive('unsupported', 'canonical-transport-unavailable');

    const native = await transport.invoke({
      provider: this.providerId,
      model: request.model,
      executionProfileRef: request.backend.executionProfileRef,
      promptBytes: new TextEncoder().encode(PROBE_PROMPT),
      timeoutMs: projection.timeoutMs,
      maxOutputTokens: projection.maxOutputTokens,
    });

    switch (native.outcome) {
      case 'completed':
        // The canonical transport command builder pins its executed request to
        // this exact provider/model/profile tuple. No provider output is parsed
        // or trusted to establish called identity here.
        return {
          outcome: 'succeeded',
          calledProvider: this.providerId,
          calledModel: request.model,
          providerRequestRefHash: native.providerRequestRef === null
            ? null
            : digest('provider-request-ref', native.providerRequestRef),
          latencyMs: native.latencyMs,
          evidenceRefs: [scopeRef],
        };
      case 'timed-out':
        return {
          outcome: 'timeout',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: native.elapsedMs,
          evidenceRefs: [scopeRef, evidenceRef('transport', this.providerId, 'timed-out')],
        };
      case 'rejected':
        return {
          outcome: 'invalid-response',
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: native.latencyMs,
          evidenceRefs: [
            scopeRef,
            evidenceRef('transport', this.providerId, 'rejected', native.providerCode ?? 'unclassified'),
          ],
        };
      case 'transport-error': {
        const outcome = native.errorCode === 'backend_unreachable' ? 'backend-unreachable'
          : native.errorCode === 'backend_unsupported' ? 'unsupported'
            : native.errorCode === 'credential_unavailable' ? 'auth-rejected'
              : 'transport-error';
        return {
          outcome,
          calledProvider: null,
          calledModel: null,
          providerRequestRefHash: null,
          latencyMs: native.elapsedMs,
          evidenceRefs: [
            scopeRef,
            evidenceRef('transport', this.providerId, 'transport-error', native.errorCode),
          ],
        };
      }
    }
  };
}
