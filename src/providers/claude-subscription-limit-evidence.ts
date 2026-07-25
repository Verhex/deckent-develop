import { createHash } from 'node:crypto';

import {
  probeSubscriptionLimits,
  type ResetTime,
  type SubscriptionLimitResult,
} from '../core/limit-preflight.js';
import type {
  ProviderLimitEvidenceSource,
  ProviderLimitSourceObservation,
} from '../core/provider-evidence-producer.js';
import type { ProviderLimitWindow } from '../core/provider-limit-truth.js';
import {
  assertCanonicalModelApiId,
  assertOpaqueEvidenceRef,
  assertOpaqueSha256,
} from '../core/provider-truth.js';

const DEFAULT_TTL_MS = 60_000;
const SESSION_WINDOW_ID = 'claude.session';
const WEEK_ALL_WINDOW_ID = 'claude.week-all';
const WEEK_FABLE_WINDOW_ID = 'claude.week-fable';

type LimitSourceInput = Parameters<ProviderLimitEvidenceSource['observe']>[0];
type LimitProbe = () => Promise<SubscriptionLimitResult>;

export interface ClaudeSubscriptionLimitEvidenceOptions {
  readonly probe?: LimitProbe;
  readonly now?: () => Date;
  readonly ttlMs?: number;
}

function digest(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

function evidenceRef(kind: string, ...parts: readonly string[]): string {
  return `claude-limit-${kind}:${digest(kind, ...parts)}`;
}

function resetEvidence(reset: ResetTime | null): ProviderLimitWindow['reset'] {
  if (!reset) return { state: 'unknown', at: null, displayRefHash: null };
  return {
    state: 'unknown',
    at: null,
    displayRefHash: digest(reset.text, reset.timezone ?? 'none'),
  };
}

function percentWindow(
  windowId: string,
  kind: ProviderLimitWindow['kind'],
  consumed: number,
  reset: ResetTime | null,
): ProviderLimitWindow {
  return {
    windowId,
    kind,
    model: null,
    unit: 'percent',
    consumed,
    remaining: 100 - consumed,
    limit: 100,
    reset: resetEvidence(reset),
  };
}

function exactScope(input: LimitSourceInput): boolean {
  try {
    assertCanonicalModelApiId(input.model);
    assertOpaqueSha256('accountRefHash', input.accountRefHash, true);
    assertOpaqueSha256(
      'account backend scope ref',
      input.accountEvidence?.backendScopeRefHash ?? null,
      true,
    );
    assertOpaqueEvidenceRef(
      'account identity evidence',
      input.accountEvidence?.identityEvidenceRef ?? null,
      true,
    );
    assertOpaqueEvidenceRef(
      'credential generation evidence',
      input.accountEvidence?.credentialGenerationRef ?? null,
      true,
    );
  } catch {
    return false;
  }
  return input.provider === 'claude'
    && input.authMode === 'subscription'
    && input.backend.transport === 'cli'
    && input.accountEvidence !== null;
}

function sourceScopeDigest(input: LimitSourceInput): string {
  return digest(
    input.tenantId,
    input.projectId,
    input.provider,
    input.model,
    input.authMode,
    input.accountRefHash ?? 'none',
    input.accountEvidence?.identityEvidenceRef ?? 'none',
    input.accountEvidence?.credentialGenerationRef ?? 'none',
    input.accountEvidence?.backendScopeRefHash ?? 'none',
    input.backend.transport,
    input.backend.executionBackend,
    input.backend.endpointRefHash ?? 'none',
  );
}

/**
 * Claude subscription `/usage` projector.
 *
 * Plain-text percentages are useful current display evidence, but they do not
 * prove per-call quota burn or an account-bound reservation. This source is
 * therefore permanently advisory; canonical limit materialization keeps it
 * `unknown/HOLD` even when every display window is present.
 */
export class ClaudeSubscriptionLimitEvidenceSource implements ProviderLimitEvidenceSource {
  readonly authorityRef = evidenceRef('authority', 'claude-usage-display-v1');
  readonly kind = 'provider-cli' as const;
  readonly authority = 'advisory' as const;
  private readonly probe: LimitProbe;
  private readonly now: () => Date;
  private readonly ttlMs: number;

  constructor(options: ClaudeSubscriptionLimitEvidenceOptions = {}) {
    this.probe = options.probe ?? (() => probeSubscriptionLimits());
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (!Number.isSafeInteger(this.ttlMs) || this.ttlMs <= 0 || this.ttlMs > DEFAULT_TTL_MS) {
      throw new TypeError(`ttlMs must be a positive integer no greater than ${DEFAULT_TTL_MS}`);
    }
  }

  async observe(input: LimitSourceInput): Promise<ProviderLimitSourceObservation> {
    const scopeDigest = sourceScopeDigest(input);
    const fetchedAt = this.now();
    const expiresAt = new Date(fetchedAt.getTime() + this.ttlMs);
    if (!exactScope(input) || !Number.isFinite(fetchedAt.getTime())) {
      return {
        state: 'unavailable',
        requiredWindowIds: [],
        windows: [],
        source: {
          operatorApprovalRef: null,
          evidenceRef: evidenceRef('unavailable', 'scope', scopeDigest),
          fetchedAt: Number.isFinite(fetchedAt.getTime())
            ? fetchedAt.toISOString()
            : new Date(0).toISOString(),
          expiresAt: Number.isFinite(expiresAt.getTime())
            ? expiresAt.toISOString()
            : new Date(1).toISOString(),
          incorporatedReservationEventRefs: [],
        },
      };
    }

    const result = await this.probe();
    const rawDigest = digest(result.raw);
    const sourceRef = evidenceRef(
      result.unavailable ? 'unavailable' : 'snapshot',
      scopeDigest,
      rawDigest,
      result.unavailable ? result.reason : 'parsed',
    );
    if (result.unavailable) {
      return {
        state: 'unavailable',
        requiredWindowIds: [],
        windows: [],
        source: {
          operatorApprovalRef: null,
          evidenceRef: sourceRef,
          fetchedAt: fetchedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          incorporatedReservationEventRefs: [],
        },
        evidenceRefs: [
          input.accountEvidence!.identityEvidenceRef,
          input.accountEvidence!.credentialGenerationRef,
        ],
      };
    }

    const windows: ProviderLimitWindow[] = [
      percentWindow(SESSION_WINDOW_ID, 'session', result.sessionPct, result.sessionResetAt),
      percentWindow(WEEK_ALL_WINDOW_ID, 'week-all', result.weekAllPct, result.weekAllResetAt),
    ];
    if (result.weekFablePct !== undefined) {
      windows.push(percentWindow(
        WEEK_FABLE_WINDOW_ID,
        'custom',
        result.weekFablePct,
        result.weekAllResetAt,
      ));
    }
    return {
      state: 'known',
      requiredWindowIds: [SESSION_WINDOW_ID, WEEK_ALL_WINDOW_ID, WEEK_FABLE_WINDOW_ID],
      windows,
      source: {
        operatorApprovalRef: null,
        evidenceRef: sourceRef,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        incorporatedReservationEventRefs: [],
      },
      evidenceRefs: [
        input.accountEvidence!.identityEvidenceRef,
        input.accountEvidence!.credentialGenerationRef,
        evidenceRef('model-scope', input.model),
      ],
    };
  }
}
