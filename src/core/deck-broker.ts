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

// ─── Types ──────────────────────────────────────────────────────────────────

/** Why a resolve attempt was denied. */
export type DeckBrokerDenialReason =
  | 'expired'
  | 'already-consumed'
  | 'no-secret';

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

  constructor(projectRoot: string, opts: DeckBrokerOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.mintedAtMs = this.now().getTime();
    // Single source of truth for the DECKENT_* -> canonical-env-var mapping
    // (provider.ts) — the broker never re-derives it, so it cannot drift.
    // `projectRoot` is used here only, and is not retained on `this`.
    const secrets = loadDeckSecrets(projectRoot);
    this.providerEnvOverrides = applyDeckSecretsToEnv(secrets, opts.providerRegistry ? [...opts.providerRegistry] : undefined);
  }

  /**
   * Resolve the env-injection value for `taskId`'s `provider` credential.
   * Returns a fresh shallow copy of `{ ENV_VAR: value }` on success (never
   * the internal reference), or `null` if denied — check `getAuditLog()` for
   * the denial reason. Never returns a `.deck` path, and never returns any
   * OTHER provider's credential.
   */
  resolveForTask(taskId: string, provider: string): Record<string, string> | null {
    const timestamp = this.now().toISOString();

    if (this.now().getTime() - this.mintedAtMs > this.ttlMs) {
      this.audit(taskId, provider, timestamp, 'denied', 'expired');
      return null;
    }
    if (this.consumed.has(taskId)) {
      this.audit(taskId, provider, timestamp, 'denied', 'already-consumed');
      return null;
    }

    const env = this.providerEnvOverrides[provider];
    if (!env || Object.keys(env).length === 0) {
      this.audit(taskId, provider, timestamp, 'denied', 'no-secret');
      return null;
    }

    this.consumed.add(taskId);
    this.audit(taskId, provider, timestamp, 'granted');
    return { ...env };
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
  ): void {
    this.auditLog.push(
      reason === undefined
        ? { taskId, provider, timestamp, outcome }
        : { taskId, provider, timestamp, outcome, reason },
    );
  }
}
