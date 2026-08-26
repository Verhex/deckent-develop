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
//  • Atomic first-writer-wins writes — every persisted file is fully written to
//    a temp file, then published with a non-replacing hard-link create. A crash
//    never exposes a torn target and a concurrent decision can never be silently
//    overwritten by a later process.
//  • Worker-suspend/resume + channel-relays (turning a pending approval into an
//    actual blocked worker + a Slack/Telegram/dashboard prompt) is APR-2 —
//    explicitly out of scope here. This module is the broker core: store +
//    event + promise-resume only.

import { EventEmitter } from 'node:events';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { DECKENT_DIR } from './constants.js';
import { createJsonFileFirstWriterWins, isApprovalFileAclHold } from './approval-file-cas.js';
import type { ApprovalFileAclHold, ApprovalFileAclOptions } from './approval-file-cas.js';
import {
  approvalLookupIdSchema,
  approvalTombstoneSchema,
  approvalRequestSchema,
  approvalDecisionSchema,
  validateApprovalRequest,
  validateStoredApprovalRequest,
  validateStoredApprovalDecision,
  type ApprovalRequest,
  type ApprovalRequestV2,
  type ApprovalDecision,
  type ApprovalTombstone,
} from './approval-contract.js';
import type { ResolvedApprovalLifecycleConfig } from './config-types.js';
import { DEFAULT_APPROVAL_LIFECYCLE_POLICY } from './approval-lifecycle-policy.js';
import {
  ApprovalStore,
  ApprovalStoreError,
  type ApprovalStoreTerminalCategory,
  type ApprovalTimeoutReceipt,
} from './approval-store.js';

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
  | 'APR_UNKNOWN_REQUEST'
  | 'APR_ALREADY_DECIDED'
  | 'APR_EXPIRED'
  | 'APR_LIFECYCLE_DISABLED'
  | 'APR_LIFECYCLE_ASYNC_REQUIRED';

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
  /** Current lifecycle authority. Omission is fail-closed for governed writes. */
  lifecycle?: ResolvedApprovalLifecycleConfig;
  /** Shared authoritative clock used by submit/decide/expiry paths. */
  clock?: () => Date;
  /** Cross-platform private-file proof seam for governed writes. */
  privateFileAcl?: ApprovalFileAclOptions;
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
  private readonly lifecycle: ResolvedApprovalLifecycleConfig;
  private readonly clock: () => Date;
  private readonly privateFileAcl: ApprovalFileAclOptions;
  private readonly requestsById = new Map<string, ApprovalRequest>();
  private readonly decisionsById = new Map<string, ApprovalDecision>();
  private readonly waitersById = new Map<string, Array<(decision: ApprovalDecision) => void>>();
  /** Decision filenames already settled by THIS instance — dedupe key for the
   *  poll seam so a re-scan never re-emits/re-resolves the same decision. */
  private readonly seenDecisionFiles = new Set<string>();
  private readonly seenTombstoneFiles = new Set<string>();

  constructor(
    projectRoot: string,
    opts: ApprovalBrokerOptions = {},
  ) {
    super();
    this.storeDir = opts.storeDir ?? join(projectRoot, DECKENT_DIR, 'approvals');
    this.lifecycle = opts.lifecycle
      ?? (DEFAULT_APPROVAL_LIFECYCLE_POLICY as ResolvedApprovalLifecycleConfig);
    this.clock = opts.clock ?? (() => new Date());
    this.privateFileAcl = opts.privateFileAcl ?? {};
    this.ensureStoreDir();
    this.hydrateFromDisk();
  }

  private lifecycleStore(): ApprovalStore {
    return new ApprovalStore('', {
      storeDir: this.storeDir,
      lifecycle: this.lifecycle,
      clock: this.clock,
      privateFileAcl: this.privateFileAcl,
    });
  }

  // ─── Store paths ────────────────────────────────────────────────────────

  private ensureStoreDir(): void {
    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true, mode: 0o700 });
    }
  }

  private requestFilePath(id: string): string {
    return join(this.storeDir, `${id}.request.json`);
  }

  private decisionFilePath(id: string): string {
    return join(this.storeDir, `${id}.decision.json`);
  }

  private tombstoneFilePath(id: string): string {
    return join(this.storeDir, `${id}.tombstone.json`);
  }

  private readTombstoneFromDisk(id: string): ApprovalTombstone | undefined {
    if (!approvalLookupIdSchema.safeParse(id).success) return undefined;
    try {
      const result = approvalTombstoneSchema.safeParse(
        JSON.parse(readFileSync(this.tombstoneFilePath(id), 'utf-8')),
      );
      return result.success && result.data.id === id ? result.data : undefined;
    } catch {
      return undefined;
    }
  }

  private readRequestFromDisk(id: string): ApprovalRequest | undefined {
    if (!approvalLookupIdSchema.safeParse(id).success) return undefined;
    if (this.readTombstoneFromDisk(id)) return undefined;
    try {
      const result = validateStoredApprovalRequest(JSON.parse(readFileSync(this.requestFilePath(id), 'utf-8')));
      return result.ok && result.value.id === id ? result.value : undefined;
    } catch {
      return undefined;
    }
  }

  /** Rebuild validated request/decision state from canonical on-disk paths. */
  private hydrateFromDisk(): void {
    let files: string[];
    try {
      files = readdirSync(this.storeDir);
    } catch {
      return;
    }

    for (const file of files) {
      if (!file.endsWith('.tombstone.json')) continue;
      try {
        const result = approvalTombstoneSchema.safeParse(JSON.parse(readFileSync(join(this.storeDir, file), 'utf-8')));
        if (!result.success || file !== `${result.data.id}.tombstone.json`) continue;
        this.seenTombstoneFiles.add(file);
        this.decisionsById.set(result.data.id, result.data.decision);
      } catch {
        // Tolerant reader: malformed tombstones are not terminal authority.
      }
    }

    for (const file of files) {
      if (!file.endsWith('.request.json')) continue;
      try {
        const result = validateStoredApprovalRequest(JSON.parse(readFileSync(join(this.storeDir, file), 'utf-8')));
        if (!result.ok || file !== `${result.value.id}.request.json`) continue;
        if (this.readTombstoneFromDisk(result.value.id)) continue;
        this.requestsById.set(result.value.id, result.value);
      } catch {
        // Tolerant reader: a malformed/external partial is not runtime authority.
      }
    }

    for (const file of files) {
      if (!file.endsWith('.decision.json')) continue;
      try {
        const result = validateStoredApprovalDecision(JSON.parse(readFileSync(join(this.storeDir, file), 'utf-8')));
        if (!result.ok || file !== `${result.value.requestId}.decision.json`) continue;
        if (this.readTombstoneFromDisk(result.value.requestId)) continue;
        if (!this.requestsById.has(result.value.requestId)) continue;
        this.seenDecisionFiles.add(file);
        this.decisionsById.set(result.value.requestId, result.value);
      } catch {
        // Tolerant reader: retry on the next fresh instance/poll.
      }
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
    if (value.version === '2.0') {
      throw new ApprovalBrokerError(
        'governed v2 requests require submitLifecycle() so private-file authority can be proven asynchronously',
        'APR_LIFECYCLE_ASYNC_REQUIRED',
      );
    }
    if (this.requestsById.has(value.id)
      || existsSync(this.tombstoneFilePath(value.id))
      || existsSync(this.decisionFilePath(value.id))
      || !createJsonFileFirstWriterWins(this.requestFilePath(value.id), value)) {
      throw new ApprovalBrokerError(`duplicate approval request id: ${value.id}`, 'APR_DUPLICATE_ID');
    }
    this.requestsById.set(value.id, value);
    this.emit('pending', value);
    return value;
  }

  /**
   * Publish a governed v2 request through the private cross-platform CAS path.
   * Gate-off rejects creation but never prevents reads or expiry draining.
   */
  async submitLifecycle(request: ApprovalRequestV2): Promise<ApprovalRequestV2 | ApprovalFileAclHold> {
    try {
      const published = await this.lifecycleStore().createLifecycleRequest(request);
      if (isApprovalFileAclHold(published)) return published;
      this.requestsById.set(published.id, published);
      this.emit('pending', published);
      return published;
    } catch (error) {
      if (error instanceof ApprovalStoreError) {
        if (error.code === 'APR_STORE_LIFECYCLE_DISABLED') {
          throw new ApprovalBrokerError(error.message, 'APR_LIFECYCLE_DISABLED');
        }
        if (error.code === 'APR_STORE_ALREADY_TERMINAL') {
          throw new ApprovalBrokerError(error.message, 'APR_DUPLICATE_ID');
        }
        throw new ApprovalBrokerError(error.message, 'APR_INVALID_REQUEST');
      }
      throw error;
    }
  }

  // ─── decide + awaitDecision ─────────────────────────────────────────────

  /**
   * Await the decision for `id`. Resolves immediately if already decided
   * (locally or previously discovered via the poll seam); otherwise queues a
   * resolver that {@link ApprovalBroker.decide}, {@link ApprovalBroker.expire},
   * or {@link ApprovalBroker.checkForExternalDecisions} resumes.
   */
  awaitDecision(id: string): Promise<ApprovalDecision> {
    this.checkForExternalDecisions();
    const settled = this.decisionsById.get(id);
    if (settled) return Promise.resolve(settled);
    return new Promise((resolve) => {
      const waiters = this.waitersById.get(id);
      if (waiters) waiters.push(resolve);
      else this.waitersById.set(id, [resolve]);
    });
  }

  /** Exact read-only lookup used by trusted decision ingress adapters. */
  getRequest(id: string): ApprovalRequest | null {
    if (!approvalLookupIdSchema.safeParse(id).success) return null;
    const request = this.readRequestFromDisk(id);
    if (request) this.requestsById.set(id, request);
    return request ?? null;
  }

  /** Exact read-only durable winner lookup. Never creates or changes a decision. */
  getDecision(id: string): ApprovalDecision | null {
    if (!approvalLookupIdSchema.safeParse(id).success) return null;
    this.checkForExternalDecisions();
    return this.decisionsById.get(id) ?? null;
  }

  /**
   * Resolve `id` with a decision. Validates against the contract, persists the
   * decision atomically, resolves any queued {@link ApprovalBroker.awaitDecision}
   * promises, and emits `'decided'`. Throws {@link ApprovalBrokerError} when
   * `id` is already decided or the decision is invalid.
   */
  decide(id: string, input: ApprovalDecisionInput): ApprovalDecision {
    return this.decideAt(id, input, this.clock());
  }

  private decideAt(id: string, input: ApprovalDecisionInput, now: Date): ApprovalDecision {
    this.checkForExternalDecisions();
    if (this.decisionsById.has(id)) {
      throw new ApprovalBrokerError(`approval request already decided: ${id}`, 'APR_ALREADY_DECIDED');
    }
    const result = validateStoredApprovalDecision({ ...input, requestId: id });
    if (!result.ok) {
      throw new ApprovalBrokerError(
        `invalid ApprovalDecision: ${result.errors.join('; ')}`,
        'APR_INVALID_DECISION',
      );
    }
    const request = this.readRequestFromDisk(id);
    if (!request) {
      throw new ApprovalBrokerError(`approval request not found or retired: ${id}`, 'APR_UNKNOWN_REQUEST');
    }
    this.requestsById.set(id, request);
    const category: ApprovalStoreTerminalCategory = result.value.channel === 'ttl-expire'
      ? 'expired'
      : result.value.decision === 'allow'
        ? 'approved'
        : 'denied';
    try {
      const durable = new ApprovalStore('', {
        storeDir: this.storeDir,
        lifecycle: this.lifecycle,
        clock: () => now,
        privateFileAcl: this.privateFileAcl,
      }).transition(id, category, input);
      return this.settleDecision(durable, { persist: false });
    } catch (error) {
      if (error instanceof ApprovalStoreError) {
        this.checkForExternalDecisions();
        if (error.code === 'APR_STORE_EXPIRED') {
          throw new ApprovalBrokerError(`approval request already expired: ${id}`, 'APR_EXPIRED');
        }
        if (error.code === 'APR_STORE_ALREADY_TERMINAL') {
          throw new ApprovalBrokerError(`approval request already decided: ${id}`, 'APR_ALREADY_DECIDED');
        }
        if (error.code === 'APR_STORE_UNKNOWN_ID') {
          throw new ApprovalBrokerError(`approval request not found or retired: ${id}`, 'APR_UNKNOWN_REQUEST');
        }
        if (error.code === 'APR_STORE_INVALID_DECISION' || error.code === 'APR_STORE_CATEGORY_MISMATCH') {
          throw new ApprovalBrokerError(error.message, 'APR_INVALID_DECISION');
        }
      }
      if (error instanceof ApprovalBrokerError && error.code === 'APR_ALREADY_DECIDED') {
        this.checkForExternalDecisions();
      }
      throw error;
    }
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
  decideChecked(id: string, input: ApprovalDecisionInput, now?: Date): ApprovalDecideResult {
    const effectiveNow = now ?? this.clock();
    const expired = this.expiredResultFor(id, effectiveNow);
    if (expired) {
      if (this.decisionsById.get(id)?.channel !== 'ttl-expire') this.expire(effectiveNow);
      return expired;
    }
    try {
      return this.decideAt(id, input, effectiveNow);
    } catch (error) {
      if (error instanceof ApprovalBrokerError && error.code === 'APR_EXPIRED') {
        const request = this.readRequestFromDisk(id) ?? this.requestsById.get(id);
        return { outcome: 'expired', requestId: id, expiresAt: request?.expiresAt ?? effectiveNow.toISOString() };
      }
      throw error;
    }
  }

  /** Returns the expired-outcome shape for `id` iff its TTL has already
   *  elapsed by `now`, else `undefined`. A request already decided by a REAL
   *  (non-TTL) channel is not "expired" here — that stays
   *  `APR_ALREADY_DECIDED` via the normal `decide()` path. */
  private expiredResultFor(id: string, now: Date): ApprovalDecideExpiredResult | undefined {
    this.checkForExternalDecisions();
    const existingDecision = this.decisionsById.get(id);
    if (existingDecision) {
      if (existingDecision.channel !== 'ttl-expire') return undefined;
      const expiresAt = this.requestsById.get(id)?.expiresAt ?? existingDecision.decidedAt;
      return { outcome: 'expired', requestId: id, expiresAt };
    }

    const request = this.readRequestFromDisk(id) ?? this.requestsById.get(id);
    if (request && Date.parse(request.expiresAt) <= now.getTime()) {
      return { outcome: 'expired', requestId: id, expiresAt: request.expiresAt };
    }
    return undefined;
  }

  /** Shared settle path for decide/expire/checkForExternalDecisions. */
  private settleDecision(decision: ApprovalDecision, opts: { persist: boolean }): ApprovalDecision {
    if (opts.persist && !createJsonFileFirstWriterWins(this.decisionFilePath(decision.requestId), decision)) {
      throw new ApprovalBrokerError(
        `approval request already decided: ${decision.requestId}`,
        'APR_ALREADY_DECIDED',
      );
    }
    if (opts.persist && existsSync(this.tombstoneFilePath(decision.requestId))) {
      try { unlinkSync(this.decisionFilePath(decision.requestId)); } catch { /* prune may have won cleanup */ }
      throw new ApprovalBrokerError(
        `approval request not found or retired: ${decision.requestId}`,
        'APR_UNKNOWN_REQUEST',
      );
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
  expire(now?: Date): ApprovalDecision[] {
    const effectiveNow = now ?? this.clock();
    const ids = this.lifecycleStore().sweepExpired(effectiveNow);
    const discovered = this.checkForExternalDecisions();
    const byId = new Map(discovered.map((decision) => [decision.requestId, decision]));
    return ids.flatMap((id) => {
      const decision = byId.get(id) ?? this.decisionsById.get(id);
      return decision ? [decision] : [];
    });
  }

  /** Read the durable timeout authority produced by either broker or store. */
  getTimeoutReceipt(id: string): ApprovalTimeoutReceipt | null {
    return this.lifecycleStore().getTimeoutReceipt(id);
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
      files = readdirSync(this.storeDir);
    } catch {
      return [];
    }

    const discovered: ApprovalDecision[] = [];
    for (const file of files) {
      if (!file.endsWith('.tombstone.json') || this.seenTombstoneFiles.has(file)) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(join(this.storeDir, file), 'utf-8'));
      } catch {
        continue;
      }
      const result = approvalTombstoneSchema.safeParse(raw);
      if (!result.success || file !== `${result.data.id}.tombstone.json`) {
        this.seenTombstoneFiles.add(file);
        continue;
      }
      this.seenTombstoneFiles.add(file);
      if (this.decisionsById.has(result.data.id)) continue;
      discovered.push(this.settleDecision(result.data.decision, { persist: false }));
    }

    for (const file of files) {
      if (!file.endsWith('.decision.json') || this.seenDecisionFiles.has(file)) continue;

      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(join(this.storeDir, file), 'utf-8'));
      } catch {
        // Torn/partial write (mid-rename) — do NOT mark seen, retry next poll.
        continue;
      }

      const result = validateStoredApprovalDecision(raw);
      if (!result.ok) {
        // Permanently malformed foreign file — mark seen so it never retry-loops.
        this.seenDecisionFiles.add(file);
        continue;
      }

      const decision = result.value;
      if (file !== `${decision.requestId}.decision.json`) {
        this.seenDecisionFiles.add(file);
        continue;
      }
      const request = this.readRequestFromDisk(decision.requestId);
      if (!request) {
        this.seenDecisionFiles.add(file);
        continue;
      }
      this.requestsById.set(request.id, request);
      if (this.decisionsById.has(decision.requestId)) {
        this.seenDecisionFiles.add(file);
        continue;
      }

      discovered.push(this.settleDecision(decision, { persist: false }));
    }
    return discovered;
  }
}
