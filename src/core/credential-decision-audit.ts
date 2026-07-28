// ─── Credential Decision Audit Sink (457-002) ───────────────────────────────
// Durable, append-only, redacted sink for credential broker decisions
// (`DeckBroker` — deck-broker.ts, 353-014 — currently keeps only an
// IN-MEMORY audit trail). Records taskId/provider/decision/reason/timestamp
// plus a REDACTED secret reference (env var NAME + a short sha256 PREFIX
// only — never the secret value, never a `.deck` path). Wiring DeckBroker to
// call this sink is a follow-up task (457-003, next batch); this batch ships
// the sink and proves it with its own tests.
//
// Storage: outside the project tree, in the platform global state directory
// (global-scope-resolver.ts) — never under a worker-mounted project root, so
// a scoped/sandboxed worker cannot see or tamper with its own audit trail.
// Hash-chain shape follows the existing audit-writer.ts canonicalJson
// pattern (reused here, not reinvented) so an independent verifier can
// recompute the same chain this module writes.

import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, posix, win32 } from 'node:path';

import { canonicalJson } from './audit-writer.js';
import {
  resolveGlobalScopePaths,
  type GlobalScopeEnv,
  type GlobalScopePlatform,
} from './global-scope-resolver.js';

export const CREDENTIAL_DECISION_AUDIT_SCHEMA_VERSION = 1 as const;

/** Genesis anchor for the tamper-evident hash chain (mirrors audit-writer.ts GENESIS_HMAC). */
export const CREDENTIAL_DECISION_AUDIT_GENESIS_HASH =
  'deckent-credential-decision-audit-genesis-0000000000000000000000000000000000000000';

/**
 * Hex chars of `sha256(secretValue)` retained in a redacted reference — a short
 * correlation fingerprint for support/debugging, never enough of the digest to
 * usefully narrow a brute-force search back to the original secret.
 */
const SECRET_HASH_PREFIX_LENGTH = 12;

/** Rejects any identity field that looks like it references a `.deck` secrets file path. */
const DECK_PATH_MARKER = /\.deck(?:[\\/]|$)/i;

export type CredentialDecisionOutcome = 'granted' | 'denied';

/**
 * Mirrors DeckBroker's existing denial taxonomy
 * (`deck-broker.ts` `DeckBrokerDenialReason`) plus one additional value for
 * the granted path. Deliberately NOT imported from deck-broker.ts — no
 * coupling is introduced this batch; the broker does not call this sink yet.
 */
export type CredentialDecisionReason =
  | 'resolved'
  | 'expired'
  | 'already-consumed'
  | 'no-secret';

/**
 * Redacted reference to the credential involved in a `granted` decision.
 * Carries only the env var NAME and a short sha256 PREFIX of its value —
 * never the value itself.
 */
export interface CredentialDecisionRedactedRef {
  readonly envVarName: string;
  readonly secretSha256Prefix: string;
}

export interface CredentialDecisionInput {
  readonly taskId: string;
  readonly provider: string;
  readonly decision: CredentialDecisionOutcome;
  readonly reason: CredentialDecisionReason;
  readonly occurredAt: string;
  /**
   * Required for (and only for) a `granted` decision. `secretValue` is used
   * ONLY to derive `secretSha256Prefix` inside `record()` — it is never
   * assigned to a field, logged, or returned by this module.
   */
  readonly secret?: {
    readonly envVarName: string;
    readonly secretValue: string;
  };
}

export interface CredentialDecisionAuditRecord {
  readonly schemaVersion: typeof CREDENTIAL_DECISION_AUDIT_SCHEMA_VERSION;
  readonly taskId: string;
  readonly provider: string;
  readonly decision: CredentialDecisionOutcome;
  readonly reason: CredentialDecisionReason;
  readonly occurredAt: string;
  readonly recordedAt: string;
  readonly redactedRef: CredentialDecisionRedactedRef | null;
  readonly prevHash: string;
  readonly hash: string;
}

export class CredentialDecisionAuditError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'IO_FAILURE',
    message: string,
  ) {
    super(message);
    this.name = 'CredentialDecisionAuditError';
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertSafeIdentity(name: string, value: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CredentialDecisionAuditError('INVALID_INPUT', `${name} must be a non-empty string`);
  }
  if (DECK_PATH_MARKER.test(value)) {
    throw new CredentialDecisionAuditError('INVALID_INPUT', `${name} must not reference a .deck path`);
  }
}

function assertTimestamp(name: string, value: string): void {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new CredentialDecisionAuditError('INVALID_INPUT', `${name} must be a canonical ISO-8601 timestamp`);
  }
}

const VALID_REASONS: readonly CredentialDecisionReason[] = ['resolved', 'expired', 'already-consumed', 'no-secret'];

function validateInput(input: CredentialDecisionInput): void {
  assertSafeIdentity('taskId', input.taskId);
  assertSafeIdentity('provider', input.provider);
  assertTimestamp('occurredAt', input.occurredAt);
  if (input.decision !== 'granted' && input.decision !== 'denied') {
    throw new CredentialDecisionAuditError('INVALID_INPUT', 'decision must be "granted" or "denied"');
  }
  if (!VALID_REASONS.includes(input.reason)) {
    throw new CredentialDecisionAuditError('INVALID_INPUT', 'reason is not a recognized credential-decision reason');
  }
  if (input.decision === 'granted') {
    if (!input.secret) {
      throw new CredentialDecisionAuditError('INVALID_INPUT', 'a granted decision requires a secret reference');
    }
    assertSafeIdentity('secret.envVarName', input.secret.envVarName);
    if (typeof input.secret.secretValue !== 'string' || input.secret.secretValue === '') {
      throw new CredentialDecisionAuditError('INVALID_INPUT', 'secret.secretValue must be a non-empty string');
    }
  } else if (input.secret !== undefined) {
    throw new CredentialDecisionAuditError('INVALID_INPUT', 'a denied decision must not carry a secret reference');
  }
}

// ─── Path resolution (outside the project tree — never worker-mounted) ─────

/**
 * Resolve the durable sink path in the platform global state directory —
 * mirrors {@link resolveExecutionTerminationLedgerPath}'s signature and
 * out-of-project-tree guarantee (execution-termination-ledger.ts).
 */
export function resolveCredentialDecisionAuditPath(
  platform: GlobalScopePlatform,
  env: GlobalScopeEnv,
): string {
  const scope = resolveGlobalScopePaths(platform, env);
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.join(scope.stateDir, 'credential-decision-audit.jsonl');
}

// ─── Sink ───────────────────────────────────────────────────────────────────

export interface CredentialDecisionAuditSinkOptions {
  readonly now?: () => Date;
}

/**
 * Append-only, hash-chained sink for credential-decision audit records.
 * Exposes exactly one write method (`record`) and read-only module-level
 * accessors — there is no update/delete API, by construction.
 */
export class CredentialDecisionAuditSink {
  private readonly filePath: string;
  private readonly now: () => Date;

  constructor(filePath: string, options: CredentialDecisionAuditSinkOptions = {}) {
    if (!filePath) {
      throw new CredentialDecisionAuditError('INVALID_INPUT', 'filePath is required');
    }
    this.filePath = filePath;
    this.now = options.now ?? (() => new Date());
  }

  /** Appends one redacted credential-decision record and returns it. */
  record(input: CredentialDecisionInput): CredentialDecisionAuditRecord {
    validateInput(input);

    const redactedRef: CredentialDecisionRedactedRef | null = input.secret
      ? {
          envVarName: input.secret.envVarName,
          secretSha256Prefix: sha256Hex(input.secret.secretValue).slice(0, SECRET_HASH_PREFIX_LENGTH),
        }
      : null;

    const base = {
      schemaVersion: CREDENTIAL_DECISION_AUDIT_SCHEMA_VERSION,
      taskId: input.taskId,
      provider: input.provider,
      decision: input.decision,
      reason: input.reason,
      occurredAt: input.occurredAt,
      recordedAt: this.now().toISOString(),
      redactedRef,
    };

    // Re-derive prevHash from disk on every write (no in-memory chain-head
    // cache) — avoids the stale-cache hazard multiple processes appending to
    // the same file would hit with a cached head (see audit-writer.ts's own
    // per-stream chainHeads comments for the same class of bug).
    const prevHash = readLastRecordHash(this.filePath) ?? CREDENTIAL_DECISION_AUDIT_GENESIS_HASH;
    const hash = sha256Hex(prevHash + canonicalJson(base));
    const record: CredentialDecisionAuditRecord = { ...base, prevHash, hash };

    try {
      mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
      appendFileSync(this.filePath, `${canonicalJson(record)}\n`, 'utf-8');
      chmodSync(this.filePath, 0o600);
    } catch (error) {
      throw new CredentialDecisionAuditError(
        'IO_FAILURE',
        `Credential decision audit append failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
    }

    return record;
  }
}

// ─── Read + verify ──────────────────────────────────────────────────────────

/** Reads every persisted record in append order. Missing file → empty array. */
export function readCredentialDecisionAuditRecords(filePath: string): CredentialDecisionAuditRecord[] {
  if (!existsSync(filePath)) return [];
  const lines = readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim() !== '');
  return lines.map(line => JSON.parse(line) as CredentialDecisionAuditRecord);
}

function readLastRecordHash(filePath: string): string | undefined {
  return readCredentialDecisionAuditRecords(filePath).at(-1)?.hash;
}

/**
 * Verifies the tamper-evident hash chain of a sequence of records (as
 * returned by {@link readCredentialDecisionAuditRecords}). Returns
 * `{ intact: false, brokenAt }` at the first broken link — a prevHash that
 * does not chain from the prior record (or GENESIS for the first record), or
 * a hash that does not match its own re-derived payload.
 */
export function verifyCredentialDecisionAuditChain(
  records: readonly CredentialDecisionAuditRecord[],
): { intact: boolean; brokenAt?: number } {
  let expectedPrev = CREDENTIAL_DECISION_AUDIT_GENESIS_HASH;
  for (const [index, record] of records.entries()) {
    if (record.prevHash !== expectedPrev) return { intact: false, brokenAt: index };
    const { prevHash, hash, ...base } = record;
    const expectedHash = sha256Hex(prevHash + canonicalJson(base));
    if (expectedHash !== hash) return { intact: false, brokenAt: index };
    expectedPrev = hash;
  }
  return { intact: true };
}
