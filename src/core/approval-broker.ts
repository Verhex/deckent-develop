// ─── ApprovalBroker — runtime-wide EVENT-driven approval core (APR-1) ────────
// Governs: strategic-pivot §11.1 (runtime-wide ApprovalBroker, "en kritik" P0) +
// ADR-G-020 (authority). Built on approval-contract.ts (APR-CONTRACT, sprint-350
// task 350-004) — this module owns ZERO contract shape; it only imports and
// enforces it.
//
// Design tenets:
//  • EVENT-driven, never stdin — `submit`/`decide` are plain method calls; the
//    broker emits 'pending'/'decided' so any surface (terminal/dashboard/api/
//    connector) can subscribe without blocking a read loop.
//  • Multi-process reality — the store is FILE-backed (`<projectRoot>/.deckent/
//    approvals/`, one file per request + one per decision). A decision may be
//    written by a DIFFERENT process entirely (e.g. a dashboard or CLI `deckent
//    approve <id>` invocation). `checkForExternalDecisions()` is the injectable
//    poll/watch seam that discovers such externally-written decisions and
//    settles them exactly like a local `decide()` call — same event, same
//    awaiter resolution.
//  • Atomic writes — every persisted file goes through tmp-write + `renameSync`
//    (POSIX/NTFS atomic metadata op), so a crash mid-write never leaves a torn
//    request/decision file for a reader to trip over (same pattern as
//    core/file-lock.ts and core/credentials-per-project.ts).
//  • Worker-suspend/resume + channel-relays (turning a pending approval into an
//    actual blocked worker + a Slack/Telegram/dashboard prompt) is APR-2 —
//    explicitly out of scope here. This module is the broker core: store +
//    event + promise-resume only.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { DECKENT_DIR } from './constants.js';
import {
  approvalRequestSchema,
  approvalDecisionSchema,
  validateApprovalRequest,
  validateApprovalDecision,
  type ApprovalRequest,
  type ApprovalDecision,
} from './approval-contract.js';

// ─── Input types (derived from the contract — never redeclared) ─────────────

/** Accepted shape for {@link ApprovalBroker.submit} — the contract's own input
 *  type (defaulted fields like `version`/`maskedArgs` stay optional here). */
export type ApprovalRequestInput = z.input<typeof approvalRequestSchema>;

/** Accepted shape for {@link ApprovalBroker.decide} — the contract's decision
 *  input with `requestId` omitted (the broker supplies it from the `id` arg). */
export type ApprovalDecisionInput = Omit<z.input<typeof approvalDecisionSchema>, 'requestId'>;

// ─── decideChecked result (additive — decide() itself is untouched) ─────────

/**
 * {@link ApprovalBroker.decideChecked} outcome for a request whose TTL had
 * already elapsed at call time — either `expiresAt <= now`, or the TTL sweep
 * ({@link ApprovalBroker.expire}) already settled it with `channel:
 * 'ttl-expire'`. No decision is ever written for this outcome (the request is
 * left exactly as found — still pending, or already TTL-decided) so a late
 * human decide() attempt can never clobber/duplicate a decision.
 */
export interface ApprovalDecideExpiredResult {
  readonly outcome: 'expired';
  readonly requestId: string;
  readonly expiresAt: string;
}

/**
 * {@link ApprovalBroker.decideChecked} return shape — the existing
 * `ApprovalDecision` success shape, additively unioned with the expired
 * outcome above. `ApprovalDecision` (the contract's `.strict()` schema) never
 * carries an `outcome` field, so `isExpiredDecideResult` below is a safe,
 * exhaustive discriminant.
 */
export type ApprovalDecideResult = ApprovalDecision | ApprovalDecideExpiredResult;

/** Type guard for {@link ApprovalDecideResult} — true iff `result` is the
 *  additive expired-outcome member (never a normal `ApprovalDecision`). */
export function isExpiredDecideResult(result: ApprovalDecideResult): result is ApprovalDecideExpiredResult {
  return 'outcome' in result && result.outcome === 'expired';
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApprovalBrokerErrorCode =
  | 'APR_INVALID_REQUEST'
  | 'APR_DUPLICATE_ID'
  | 'APR_INVALID_DECISION'
  | 'APR_ALREADY_DECIDED';

export class ApprovalBrokerError extends Error {
  constructor(
    message: string,
    public readonly code: ApprovalBrokerErrorCode,
  ) {
    super(message);
    this.name = 'ApprovalBrokerError';
  }
}

// ─── Broker options + status ──────────────────────────────────────────────────

export interface ApprovalBrokerOptions {
  /** Absolute directory for the file-backed store. Defaults to
   *  `<projectRoot>/.deckent/approvals`. Tests MUST override with a hermetic
   *  tmpdir — never point this at a real project's `.deckent`. */
  storeDir?: string;
}

export type ApprovalRecordStatus = 'pending' | 'decided';

// ─── Typed EventEmitter surface ───────────────────────────────────────────────

export interface ApprovalBroker {
  on(event: 'pending', listener: (request: ApprovalRequest) => void): this;
  on(event: 'decided', listener: (decision: ApprovalDecision, request: ApprovalRequest | undefined) => void): this;
  once(event: 'pending', listener: (request: ApprovalRequest) => void): this;
  once(event: 'decided', listener: (decision: ApprovalDecision, request: ApprovalRequest | undefined) => void): this;
  off(event: 'pending', listener: (request: ApprovalRequest) => void): this;
  off(event: 'decided', listener: (decision: ApprovalDecision, request: ApprovalRequest | undefined) => void): this;
  emit(event: 'pending', request: ApprovalRequest): boolean;
  emit(event: 'decided', decision: ApprovalDecision, request: ApprovalRequest | undefined): boolean;
}

/**
 * Runtime-wide approval broker (APR-1 core). One instance per process; multiple
 * instances (same or different processes) may share the same `storeDir` — see
 * {@link ApprovalBroker.checkForExternalDecisions}.
 */
export class ApprovalBroker extends EventEmitter {
  private readonly storeDir: string;
  private readonly requestsById = new Map<string, ApprovalRequest>();
  private readonly decisionsById = new Map<string, ApprovalDecision>();
  private readonly waitersById = new Map<string, Array<(decision: ApprovalDecision) => void>>();
  /** Decision filenames already settled by THIS instance — dedupe key for the
   *  poll seam so a re-scan never re-emits/re-resolves the same decision. */
  private readonly seenDecisionFiles = new Set<string>();

  constructor(
    projectRoot: string,
    opts: ApprovalBrokerOptions = {},
  ) {
    super();
    this.storeDir = opts.storeDir ?? join(projectRoot, DECKENT_DIR, 'approvals');
    this.ensureStoreDir();
  }

  // ─── Store paths ────────────────────────────────────────────────────────

  private ensureStoreDir(): void {
    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true });
    }
  }

  private requestFilePath(id: string): string {
    return join(this.storeDir, `${id}.request.json`);
  }

  private decisionFilePath(id: string): string {
    return join(this.storeDir, `${id}.decision.json`);
  }

  /** Atomic write: temp file (unique-suffixed, so concurrent writers in the
   *  same process never collide on the tmp name) + `renameSync` onto the real
   *  path. On rename failure the tmp file is best-effort removed and the error
   *  rethrown — the destination file is left exactly as it was (never torn). */
  private atomicWriteJson(filePath: string, data: unknown): void {
    this.ensureStoreDir();
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    try {
      renameSync(tmpPath, filePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup — the rename error below is what the caller needs.
      }
      throw err;
    }
  }

  // ─── submit ─────────────────────────────────────────────────────────────

  /**
   * Submit a new approval request. Validates against the contract, persists it
   * atomically to the file-backed store, tracks it as pending, and emits
   * `'pending'`. Throws {@link ApprovalBrokerError} on an invalid request or a
   * duplicate `id`.
   */
  submit(request: ApprovalRequestInput): ApprovalRequest {
    const result = validateApprovalRequest(request);
    if (!result.ok) {
      throw new ApprovalBrokerError(
        `invalid ApprovalRequest: ${result.errors.join('; ')}`,
        'APR_INVALID_REQUEST',
      );
    }
    const value = result.value;
    if (this.requestsById.has(value.id)) {
      throw new ApprovalBrokerError(`duplicate approval request id: ${value.id}`, 'APR_DUPLICATE_ID');
    }
    this.atomicWriteJson(this.requestFilePath(value.id), value);
    this.requestsById.set(value.id, value);
    this.emit('pending', value);
    return value;
  }

  // ─── decide + awaitDecision ─────────────────────────────────────────────

  /**
   * Await the decision for `id`. Resolves immediately if already decided
   * (locally or previously discovered via the poll seam); otherwise queues a
   * resolver that {@link ApprovalBroker.decide}, {@link ApprovalBroker.expire},
   * or {@link ApprovalBroker.checkForExternalDecisions} resumes.
   */
  awaitDecision(id: string): Promise<ApprovalDecision> {
    const settled = this.decisionsById.get(id);
    if (settled) return Promise.resolve(settled);
    return new Promise((resolve) => {
      const waiters = this.waitersById.get(id);
      if (waiters) waiters.push(resolve);
      else this.waitersById.set(id, [resolve]);
    });
  }

  /**
   * Resolve `id` with a decision. Validates against the contract, persists the
   * decision atomically, resolves any queued {@link ApprovalBroker.awaitDecision}
   * promises, and emits `'decided'`. Throws {@link ApprovalBrokerError} when
   * `id` is already decided or the decision is invalid.
   */
  decide(id: string, input: ApprovalDecisionInput): ApprovalDecision {
    if (this.decisionsById.has(id)) {
      throw new ApprovalBrokerError(`approval request already decided: ${id}`, 'APR_ALREADY_DECIDED');
    }
    const result = validateApprovalDecision({ ...input, requestId: id });
    if (!result.ok) {
      throw new ApprovalBrokerError(
        `invalid ApprovalDecision: ${result.errors.join('; ')}`,
        'APR_INVALID_DECISION',
      );
    }
    return this.settleDecision(result.value, { persist: true });
  }

  /**
   * Honest decide (additive — {@link ApprovalBroker.decide} itself is
   * unchanged, so every existing caller keeps its exact current
   * throw-or-`ApprovalDecision` behavior). Checks TTL expiry BEFORE attempting
   * any decision: if `id`'s request has already elapsed (`expiresAt <= now`)
   * or was already settled by the TTL sweep (`channel: 'ttl-expire'`), returns
   * the typed `{ outcome: 'expired', ... }` result and writes NOTHING —
   * neither a fresh decision file nor an overwrite of the sweep's own
   * decision (no double-decision). Otherwise delegates to {@link
   * ApprovalBroker.decide} unchanged, so a live request's approve/reject
   * keeps its exact current success/throw shape.
   *
   * Consumer surfaces that must render "this expired" honestly to a human
   * (a bot button press, a CLI approve/reject command) call this instead of
   * `decide()` directly.
   */
  decideChecked(id: string, input: ApprovalDecisionInput, now: Date = new Date()): ApprovalDecideResult {
    const expired = this.expiredResultFor(id, now);
    if (expired) return expired;
    return this.decide(id, input);
  }

  /** Returns the expired-outcome shape for `id` iff its TTL has already
   *  elapsed by `now`, else `undefined`. A request already decided by a REAL
   *  (non-TTL) channel is not "expired" here — that stays
   *  `APR_ALREADY_DECIDED` via the normal `decide()` path. */
  private expiredResultFor(id: string, now: Date): ApprovalDecideExpiredResult | undefined {
    const existingDecision = this.decisionsById.get(id);
    if (existingDecision) {
      if (existingDecision.channel !== 'ttl-expire') return undefined;
      const expiresAt = this.requestsById.get(id)?.expiresAt ?? existingDecision.decidedAt;
      return { outcome: 'expired', requestId: id, expiresAt };
    }

    const request = this.requestsById.get(id);
    if (request && Date.parse(request.expiresAt) <= now.getTime()) {
      return { outcome: 'expired', requestId: id, expiresAt: request.expiresAt };
    }
    return undefined;
  }

  /** Shared settle path for decide/expire/checkForExternalDecisions. */
  private settleDecision(decision: ApprovalDecision, opts: { persist: boolean }): ApprovalDecision {
    if (opts.persist) {
      this.atomicWriteJson(this.decisionFilePath(decision.requestId), decision);
    }
    this.seenDecisionFiles.add(`${decision.requestId}.decision.json`);
    this.decisionsById.set(decision.requestId, decision);

    const waiters = this.waitersById.get(decision.requestId);
    if (waiters) {
      this.waitersById.delete(decision.requestId);
      for (const resolve of waiters) resolve(decision);
    }

    this.emit('decided', decision, this.requestsById.get(decision.requestId));
    return decision;
  }

  // ─── expire (TTL sweep) ─────────────────────────────────────────────────

  /**
   * TTL sweep: every still-pending request whose `expiresAt <= now` is
   * auto-decided using its own `defaultAction` (`decidedBy: 'system'`,
   * `channel: 'ttl-expire'`). Returns the decisions produced (empty if
   * nothing expired). Already-decided requests are skipped.
   */
  expire(now: Date = new Date()): ApprovalDecision[] {
    const nowMs = now.getTime();
    const produced: ApprovalDecision[] = [];
    for (const [id, request] of this.requestsById) {
      if (this.decisionsById.has(id)) continue;
      if (Date.parse(request.expiresAt) > nowMs) continue;

      const result = validateApprovalDecision({
        requestId: id,
        decision: request.defaultAction,
        decidedBy: 'system',
        channel: 'ttl-expire',
        decidedAt: now.toISOString(),
        reason: 'TTL expired — defaultAction applied',
      });
      // Constructed from already-validated fields — cannot fail; fail-safe skip if it ever does.
      if (!result.ok) continue;
      produced.push(this.settleDecision(result.value, { persist: true }));
    }
    return produced;
  }

  // ─── list ───────────────────────────────────────────────────────────────

  /** List requests by status. Defaults to `'pending'`. */
  list(status: ApprovalRecordStatus | 'all' = 'pending'): ApprovalRequest[] {
    const out: ApprovalRequest[] = [];
    for (const [id, request] of this.requestsById) {
      const isDecided = this.decisionsById.has(id);
      if (status === 'all' || (isDecided ? status === 'decided' : status === 'pending')) {
        out.push(request);
      }
    }
    return out;
  }

  // ─── Poll/watch seam (multi-process decide) ────────────────────────────

  /**
   * Scan the store for `*.decision.json` files not yet settled by THIS
   * instance — the case where a DIFFERENT process (or a different
   * `ApprovalBroker` instance sharing `storeDir`) called the equivalent of
   * `decide()` and wrote the decision file directly. Each newly discovered,
   * contract-valid decision is settled exactly like a local `decide()` (queued
   * awaiters resolved, `'decided'` emitted) — WITHOUT re-persisting (the file
   * is already on disk). Returns the newly discovered decisions.
   *
   * Injectable poll seam: call this from a `setInterval` in production, or
   * directly (no fake timers) in tests — hermetic by construction.
   */
  checkForExternalDecisions(): ApprovalDecision[] {
    this.ensureStoreDir();
    let files: string[];
    try {
      files = readdirSync(this.storeDir).filter((f) => f.endsWith('.decision.json'));
    } catch {
      return [];
    }

    const discovered: ApprovalDecision[] = [];
    for (const file of files) {
      if (this.seenDecisionFiles.has(file)) continue;

      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(join(this.storeDir, file), 'utf-8'));
      } catch {
        // Torn/partial write (mid-rename) — do NOT mark seen, retry next poll.
        continue;
      }

      const result = validateApprovalDecision(raw);
      if (!result.ok) {
        // Permanently malformed foreign file — mark seen so it never retry-loops.
        this.seenDecisionFiles.add(file);
        continue;
      }

      const decision = result.value;
      if (this.decisionsById.has(decision.requestId)) {
        this.seenDecisionFiles.add(file);
        continue;
      }

      discovered.push(this.settleDecision(decision, { persist: false }));
    }
    return discovered;
  }
}
