// ─── DeckBroker — host-side credential broker (DECK-SUBPROC-BROKER, ADR-G-005) ─
// Sprint 353 (353-014). Core-only: the subprocess backend does not yet call
// this broker — wiring `subprocess.ts` to consume `resolveForTask` instead of
// letting the worker process inherit `.deck`-derived env directly is an
// explicit follow-up (see notes in this task's .result). This module ships
// the broker + its guarantees so that follow-up is a thin call-site change.
//
// Problem (ADR-G-005): the docker backend already shadows `.deck` out of the
// worker's mount (spawn-backend-docker.ts, DECK-WORKER-ISOLATION). The
// subprocess backend has no mount trick available — the worker runs as a
// host process INSIDE the project root, so `.deck` stays disk-readable to it
// regardless of env-scrubbing. A host-side broker is the only way to keep the
// secret FILE itself out of a subprocess worker's reach: the coordinator
// resolves credentials host-side and hands the worker only the resulting env
// values it already needs (same per-provider allowlist model as today), never
// a path it could read further secrets from.
//
// Guarantees (goCriteria):
//  - task-scoped: resolveForTask(taskId, provider) returns ONLY that
//    provider's own credential — never another provider's, mirroring the
//    zero-cross-leak guarantee `applyDeckSecretsToEnv` already provides
//    (tests/core/auth-matrix.test.ts).
//  - typed outcome: resolveForTaskWithReason(taskId, provider) returns a
//    discriminated `{ state: 'granted', env } | { state: 'denied', reason }`,
//    so a caller can fail closed on the exact denial reason. The nullable
//    resolveForTask is kept as a compat shim derived from it.
//  - audited: every resolve attempt (granted or denied) is appended to an
//    in-memory audit trail — taskId/provider/timestamp/outcome/reason only,
//    NEVER the secret value.
//  - TTL + single-use: the broker is a mint-once handoff — it carries an
//    expiry from construction, and each taskId may successfully resolve
//    exactly once. A second call for the same taskId, or any call past the
//    TTL window, is denied.
//  - no path leak: `projectRoot` / the `.deck` file path is read once at
//    construction and is not stored on `this`, not returned by any public
//    method, and never appears in an audit entry or error.

import { loadDeckSecrets } from './deck-file.js';
import { applyDeckSecretsToEnv } from './provider.js';
import type { ProviderDefinition } from './config-types.js';
import type {
  CredentialDecisionAuditRecord,
  CredentialDecisionInput,
} from './credential-decision-audit.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Why a resolve attempt was denied. Deliberately a CLOSED union, never a free
 * string: a caller that fails closed on the reason (spawn refusal) must break
 * at compile time — not silently fall through a `default` — the day a fourth
 * reason is introduced.
 */
export type DeckBrokerDenialReason =
  | 'expired'
  | 'already-consumed'
  | 'no-secret';

/** A successful resolve: the caller gets env values, and nothing else. */
export interface DeckBrokerGrant {
  readonly state: 'granted';
  /**
   * Fresh shallow copy of `{ ENV_VAR: value }` per call — never the broker's
   * internal reference, so a caller mutating it cannot corrupt a later grant.
   */
  readonly env: Record<string, string>;
  /** A grant has no denial reason — asserting one is a compile error. */
  readonly reason?: never;
}

/** A refused resolve: the caller gets the reason, and nothing else. */
export interface DeckBrokerDenial {
  readonly state: 'denied';
  readonly reason: DeckBrokerDenialReason;
  /**
   * A denial can NEVER carry credentials. `never` makes that a type-level
   * guarantee rather than a review-time convention: this shape cannot later
   * widen into one that smuggles env through the denied arm.
   */
  readonly env?: never;
}

/**
 * Typed outcome of a resolve attempt — discriminated on `state` so a caller
 * can fail closed on the exact reason instead of inferring it from a bare
 * `null` (the pre-existing `resolveForTask` contract kept the reason inside
 * the audit trail, invisible to the call site).
 */
export type DeckBrokerResolution = DeckBrokerGrant | DeckBrokerDenial;

/**
 * Minimal shape the broker needs from a durable audit sink — deliberately NOT
 * the concrete `CredentialDecisionAuditSink` class (credential-decision-audit.ts),
 * so a hermetic test can inject an in-memory fake without touching disk, and
 * the broker stays decoupled from the sink's own storage/hash-chain details.
 */
export interface DeckBrokerAuditSink {
  record(input: CredentialDecisionInput): CredentialDecisionAuditRecord;
}

/** One audit-trail entry. Metadata only — never a secret value or file path. */
export interface DeckBrokerAuditEntry {
  readonly taskId: string;
  readonly provider: string;
  readonly timestamp: string;
  readonly outcome: 'granted' | 'denied';
  readonly reason?: DeckBrokerDenialReason;
}

export interface DeckBrokerOptions {
  /**
   * Config-driven provider registry (`config.providers.registry`) — forwarded
   * to `applyDeckSecretsToEnv` so a custom `openai-compatible` provider's
   * deck secret resolves through the broker exactly like a built-in provider
   * (F1-012 parity, no broker-side hardcoding).
   */
  providerRegistry?: readonly ProviderDefinition[];
  /**
   * Handoff lifetime in ms from construction. Default 5 minutes — mirrors
   * the auditor's existing stale-lock threshold (worker-default.md), a sane
   * host-local default for "mint at plan time, consume at spawn time".
   */
  ttlMs?: number;
  /** Injectable clock (test hermeticity) — defaults to `() => new Date()`. */
  now?: () => Date;
  /**
   * Durable sink every granted/denied decision is also recorded to, in
   * addition to the in-memory `auditLog` (`getAuditLog()` — unchanged,
   * kept for backward compatibility). Optional: with no sink configured, or
   * if the sink throws, broker behavior (return value, consumption,
   * in-memory audit trail) is entirely unaffected — see `resolveForTaskWithReason`.
   */
  auditSink?: DeckBrokerAuditSink;
}

const DEFAULT_TTL_MS = 5 * 60_000;

// ─── DeckBroker ─────────────────────────────────────────────────────────────

/**
 * Host-side, mint-once credential broker over `.deck`. Construct one per
 * spawn batch (e.g. once per sprint at plan/bootstrap time); every task's
 * provider credential is then resolved through `resolveForTask` instead of
 * the caller touching `loadDeckSecrets`/`.deck` directly.
 */
export class DeckBroker {
  private readonly providerEnvOverrides: Readonly<Record<string, Readonly<Record<string, string>>>>;
  private readonly ttlMs: number;
  private readonly mintedAtMs: number;
  private readonly now: () => Date;
  private readonly consumed = new Set<string>();
  private readonly auditLog: DeckBrokerAuditEntry[] = [];
  private readonly auditSink?: DeckBrokerAuditSink;

  constructor(projectRoot: string, opts: DeckBrokerOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.auditSink = opts.auditSink;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.mintedAtMs = this.now().getTime();
    // Single source of truth for the DECKENT_* -> canonical-env-var mapping
    // (provider.ts) — the broker never re-derives it, so it cannot drift.
    // `projectRoot` is used here only, and is not retained on `this`.
    const secrets = loadDeckSecrets(projectRoot);
    this.providerEnvOverrides = applyDeckSecretsToEnv(secrets, opts.providerRegistry ? [...opts.providerRegistry] : undefined);
  }

  /**
   * Resolve the env-injection value for `taskId`'s `provider` credential, as a
   * typed outcome the caller can act on: `{ state: 'granted', env }` or
   * `{ state: 'denied', reason }`. This is the canonical resolve path — the
   * denial reason is a security-boundary signal (it is what a fail-closed
   * spawn decision hangs on), so it is returned to the caller rather than left
   * only in the audit trail.
   *
   * Same guarantees as before: task-scoped (never another provider's
   * credential), audited (granted + denied), TTL + single-use, and no `.deck`
   * path in either arm.
   */
  resolveForTaskWithReason(taskId: string, provider: string): DeckBrokerResolution {
    const timestamp = this.now().toISOString();

    if (this.now().getTime() - this.mintedAtMs > this.ttlMs) {
      this.audit(taskId, provider, timestamp, 'denied', 'expired');
      return { state: 'denied', reason: 'expired' };
    }
    if (this.consumed.has(taskId)) {
      this.audit(taskId, provider, timestamp, 'denied', 'already-consumed');
      return { state: 'denied', reason: 'already-consumed' };
    }

    const env = this.providerEnvOverrides[provider];
    if (!env || Object.keys(env).length === 0) {
      this.audit(taskId, provider, timestamp, 'denied', 'no-secret');
      return { state: 'denied', reason: 'no-secret' };
    }

    this.consumed.add(taskId);
    this.audit(taskId, provider, timestamp, 'granted', undefined, env);
    return { state: 'granted', env: { ...env } };
  }

  /**
   * Legacy nullable form of {@link resolveForTaskWithReason}, kept unchanged so
   * existing callers migrate in their own time. Returns a fresh shallow copy of
   * `{ ENV_VAR: value }` on success (never the internal reference), or `null` if
   * denied — check `getAuditLog()`, or prefer `resolveForTaskWithReason`, for the
   * denial reason. Never returns a `.deck` path, and never returns any OTHER
   * provider's credential.
   *
   * Derived from the typed method, not a parallel implementation: there is
   * exactly one resolve/audit code path, so the two forms cannot drift.
   */
  resolveForTask(taskId: string, provider: string): Record<string, string> | null {
    const resolution = this.resolveForTaskWithReason(taskId, provider);
    return resolution.state === 'granted' ? resolution.env : null;
  }

  /** Read-only copy of every resolve attempt so far (granted + denied). */
  getAuditLog(): readonly DeckBrokerAuditEntry[] {
    return [...this.auditLog];
  }

  private audit(
    taskId: string,
    provider: string,
    timestamp: string,
    outcome: 'granted' | 'denied',
    reason?: DeckBrokerDenialReason,
    grantedEnv?: Readonly<Record<string, string>>,
  ): void {
    this.auditLog.push(
      reason === undefined
        ? { taskId, provider, timestamp, outcome }
        : { taskId, provider, timestamp, outcome, reason },
    );
    this.writeToSink(taskId, provider, timestamp, outcome, reason, grantedEnv);
  }

  /**
   * Best-effort mirror of this decision into the durable sink (457-002's
   * `CredentialDecisionAuditSink`, if injected). Deliberately isolated from
   * the in-memory `auditLog` above: any sink failure (thrown error, missing
   * sink) is swallowed here and never propagates — `resolveForTaskWithReason`
   * / `resolveForTask` / `getAuditLog()` behave identically whether or not a
   * durable sink is configured or healthy.
   */
  private writeToSink(
    taskId: string,
    provider: string,
    occurredAt: string,
    outcome: 'granted' | 'denied',
    reason: DeckBrokerDenialReason | undefined,
    grantedEnv: Readonly<Record<string, string>> | undefined,
  ): void {
    if (!this.auditSink) return;
    try {
      const input: CredentialDecisionInput =
        outcome === 'granted'
          ? {
              taskId,
              provider,
              decision: 'granted',
              reason: 'resolved',
              occurredAt,
              secret: toSecretRef(grantedEnv),
            }
          : { taskId, provider, decision: 'denied', reason: reason as DeckBrokerDenialReason, occurredAt };
      this.auditSink.record(input);
    } catch {
      // Durable sink is best-effort — a write failure must never change
      // broker/credential-resolution behavior (goCriteria: "sink yoksa/atarsa
      // broker davranışı [değişmez]").
    }
  }
}

/**
 * Every provider override is exactly one `{ ENV_VAR: value }` entry
 * (`applyDeckSecretsToEnv`, provider.ts) — take that single pair as the
 * sink's redacted-secret source. `secret` is required by the sink only for a
 * granted decision, which is the only case this is called from.
 */
function toSecretRef(
  grantedEnv: Readonly<Record<string, string>> | undefined,
): CredentialDecisionInput['secret'] {
  if (!grantedEnv) return undefined;
  const entry = Object.entries(grantedEnv)[0];
  if (!entry) return undefined;
  const [envVarName, secretValue] = entry;
  return { envVarName, secretValue };
}
