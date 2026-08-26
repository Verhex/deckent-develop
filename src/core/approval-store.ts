// ─── ApprovalStore — durable, restart-survive approval index (APR-STORE) ─────
// Builds a durable layer ON TOP of the file-per-request disk schema that
// `approval-broker.ts` already owns and writes — WITHOUT modifying that
// module. Cited schema (approval-broker.ts, not reproduced here as logic,
// only as a compatible reader/writer of the SAME on-disk shape):
//   • storeDir default = `join(projectRoot, DECKENT_DIR, 'approvals')`
//     (approval-broker.ts `ApprovalBroker` constructor)
//   • one file per request:  `<id>.request.json`  → ApprovalRequest
//   • one file per decision: `<id>.decision.json` → ApprovalDecision
//     (both validated against approval-contract.ts, never redefined here)
//   • atomic write = fully-written temp + non-replacing hard-link create
//     (`approval-file-cas.ts`); a later process can never overwrite the winner
//   • a TTL-swept decision is written with `channel: 'ttl-expire'`,
//     `decidedBy: 'system'` (approval-broker.ts `expire()`)
//
// ApprovalStore is a PEER of the broker, not a wrapper around it — it imports
// only approval-contract.ts and re-derives its own read/write against the
// same directory. This is deliberate: a store instance recovers its full
// state purely by re-scanning `storeDir`, with zero reliance on any broker
// in-memory state — the property that makes it restart-survive.
//
// Categorization is derived ONLY from fields the contract already defines
// (`expiresAt`, `channel`, `decision`) — no new schema is invented:
//   pending  — no decision file yet, and `now < request.expiresAt`
//   expired  — no decision file yet, and `now >= request.expiresAt`
//              (overdue, not yet swept by `sweepExpired()` / `ApprovalBroker.
//              expire()`), OR a decision file exists with `channel ===
//              'ttl-expire'` (swept)
//   approved — decision file exists, `channel !== 'ttl-expire'`, and
//              `decision === 'allow'`
//   denied   — decision file exists, `channel !== 'ttl-expire'`, and
//              `decision !== 'allow'` (deny / defer / escalate)

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
import {
  createJsonFileFirstWriterWins,
  createPrivateJsonFileFirstWriterWins,
  type ApprovalFileAclHold,
  type ApprovalFileAclOptions,
} from './approval-file-cas.js';
import {
  APPROVAL_CONTRACT_V2_VERSION,
  approvalDecisionSchema,
  approvalTombstoneSchema,
  validateStoredApprovalRequest,
  validateStoredApprovalDecision,
  type ApprovalRequest,
  type ApprovalRequestV2,
  type ApprovalDecision,
} from './approval-contract.js';
import type { ResolvedApprovalLifecycleConfig, ResolvedApprovalLifecycleProfile } from './config-types.js';
import {
  DEFAULT_APPROVAL_LIFECYCLE_POLICY,
  applyApprovalLifecycleProfileTransition,
  approvalLifecycleProfileDigest,
  mapLegacyApprovalRisk,
  maxApprovalRiskTier,
  resolveApprovalTimeout,
} from './approval-lifecycle-policy.js';

// ─── Input types (derived from the contract — never redeclared) ─────────────

/** Accepted shape for {@link ApprovalStore.transition} — the contract's own
 *  decision input with `requestId` omitted (the store supplies it from the
 *  `id` argument), mirroring `ApprovalBrokerDecisionInput`'s derivation. */
export type ApprovalDecisionInput = Omit<z.input<typeof approvalDecisionSchema>, 'requestId'>;

// ─── Categories + snapshot shape ─────────────────────────────────────────────

export type ApprovalStoreCategory = 'pending' | 'approved' | 'denied' | 'expired';

/** Terminal categories {@link ApprovalStore.transition} may move a request
 *  INTO. `pending` is only ever the initial (undecided) state — never a
 *  transition target. */
export type ApprovalStoreTerminalCategory = Exclude<ApprovalStoreCategory, 'pending'>;

export interface ApprovalStoreEntry {
  readonly request: ApprovalRequest;
  /** `null` for the `pending` bucket and for an overdue-but-unswept `expired`
   *  entry — every `approved`/`denied` entry, and a swept `expired` entry,
   *  always carries its decision. */
  readonly decision: ApprovalDecision | null;
  readonly lifecycle?: ApprovalAppliedLifecycleView;
}

export interface ApprovalAppliedLifecycleView {
  readonly origin: 'confirmation' | 'autonomous-trigger' | 'gateway-pairing' | 'broker-native';
  readonly lifecycleGeneration: string;
  readonly effectiveExpiresAt: string;
  readonly riskTier: 'routine' | 'elevated' | 'critical';
  readonly authoredPolicyDigest: string;
  readonly appliedPolicyDigest: string;
  readonly appliedProfile: ResolvedApprovalLifecycleProfile;
  readonly policyTransitionChanged: boolean;
  readonly weakeningIgnored: boolean;
}

export interface ApprovalStoreSnapshot {
  pending: ApprovalStoreEntry[];
  approved: ApprovalStoreEntry[];
  denied: ApprovalStoreEntry[];
  expired: ApprovalStoreEntry[];
  quarantined: ApprovalStoreQuarantineEntry[];
}

function emptySnapshot(): ApprovalStoreSnapshot {
  return { pending: [], approved: [], denied: [], expired: [], quarantined: [] };
}

export interface ApprovalStoreQuarantineEntry {
  readonly file: string;
  readonly sourceReference: string;
  readonly reasonCode: 'unreadable-json' | 'invalid-request-contract' | 'filename-id-mismatch';
}

export interface ApprovalTimeoutReceipt {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly tenantId: string;
  readonly scopeId: string;
  readonly sourceReference: string;
  readonly origin: 'confirmation' | 'autonomous-trigger' | 'gateway-pairing' | 'broker-native';
  readonly lifecycleGeneration: string;
  readonly actor: 'system:expiry';
  readonly kind: 'timeout-disposition';
  readonly action: 'park' | 'deny' | 'proceed-warn';
  readonly terminalState: 'UNDECIDABLE' | 'EXPIRED';
  readonly riskTier: 'routine' | 'elevated' | 'critical';
  readonly expiresAt: string;
  readonly decidedAt: string;
  readonly authoredPolicyDigest: string;
  readonly appliedPolicyDigest: string;
  readonly replayAllowed: false;
  readonly accessGrantAllowed: false;
}

export interface ApprovalTimeoutSettlement {
  readonly decision: ApprovalDecision;
  readonly receipt: ApprovalTimeoutReceipt;
}

export interface ApprovalPolicyTransitionReceipt {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly origin: ApprovalAppliedLifecycleView['origin'];
  readonly lifecycleGeneration: string;
  readonly kind: 'policy-transition';
  readonly observedAt: string;
  readonly authoredPolicyDigest: string;
  readonly appliedPolicyDigest: string;
  readonly transitionChanged: boolean;
  readonly weakeningIgnored: boolean;
  readonly appliedProfile: ResolvedApprovalLifecycleProfile;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApprovalStoreErrorCode =
  | 'APR_STORE_UNKNOWN_ID'
  | 'APR_STORE_ALREADY_TERMINAL'
  | 'APR_STORE_INVALID_DECISION'
  | 'APR_STORE_CATEGORY_MISMATCH'
  | 'APR_STORE_RETIREMENT_CONFLICT'
  | 'APR_STORE_EXPIRED'
  | 'APR_STORE_LIFECYCLE_DISABLED';

export class ApprovalStoreError extends Error {
  constructor(
    message: string,
    public readonly code: ApprovalStoreErrorCode,
  ) {
    super(message);
    this.name = 'ApprovalStoreError';
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface ApprovalStoreOptions {
  /** Absolute directory for the file-backed store. Defaults to the EXACT
   *  same path `ApprovalBroker` defaults to: `<projectRoot>/.deckent/
   *  approvals`. Tests MUST override with a hermetic tmpdir — never point
   *  this at a real project's `.deckent`. */
  storeDir?: string;
  /** Current policy is admission/tightening authority; absent is fail-closed. */
  lifecycle?: ResolvedApprovalLifecycleConfig;
  clock?: () => Date;
  privateFileAcl?: ApprovalFileAclOptions;
}

// ─── Disk scan (pure — no instance state) ────────────────────────────────────

/** Tolerant JSON read — a torn/mid-rename file (or any unreadable file)
 *  yields `undefined` rather than throwing, mirroring the broker's own
 *  torn-write tolerance in `checkForExternalDecisions()`. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return undefined;
  }
}

function categorize(request: ApprovalRequest, decision: ApprovalDecision | null, nowMs: number): ApprovalStoreCategory {
  if (!decision) {
    return Date.parse(request.expiresAt) <= nowMs ? 'expired' : 'pending';
  }
  if (decision.channel === 'ttl-expire') return 'expired';
  return decision.decision === 'allow' ? 'approved' : 'denied';
}

function appliedLifecycleView(
  request: ApprovalRequest,
  currentPolicy: ResolvedApprovalLifecycleConfig,
): ApprovalAppliedLifecycleView | undefined {
  if (request.version !== APPROVAL_CONTRACT_V2_VERSION) return undefined;
  const transition = applyApprovalLifecycleProfileTransition(
    request.lifecycleProfile,
    currentPolicy.profiles[request.origin],
  );
  const profile = transition.profile;
  const effectiveExpiresAt = new Date(Math.min(
    Date.parse(request.expiresAt),
    Date.parse(request.createdAt) + profile.ttlMs,
  )).toISOString();
  return {
    origin: request.origin,
    lifecycleGeneration: request.lifecycleGeneration,
    effectiveExpiresAt,
    riskTier: maxApprovalRiskTier(request.riskTier, profile.riskTier),
    authoredPolicyDigest: request.policySnapshotDigest,
    appliedPolicyDigest: approvalLifecycleProfileDigest(request.origin, profile),
    appliedProfile: profile,
    policyTransitionChanged: transition.transitionChanged,
    weakeningIgnored: transition.weakeningIgnored,
  };
}

/** Full disk scan of `dir` into a categorized snapshot. Malformed/torn/
 *  contract-invalid files are silently skipped (never thrown) — same
 *  tolerance policy as the broker's poll seam. A decision file whose
 *  `requestId` has no matching request file is skipped too (nothing to
 *  attach it to). */
function scanStoreDir(
  dir: string,
  now: Date,
  lifecycle: ResolvedApprovalLifecycleConfig = DEFAULT_APPROVAL_LIFECYCLE_POLICY as ResolvedApprovalLifecycleConfig,
): ApprovalStoreSnapshot {
  const snapshot = emptySnapshot();
  if (!existsSync(dir)) return snapshot;

  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return snapshot;
  }
  // Defensive boundary for virtual/mocked filesystem adapters. Node's native
  // implementation always returns an array in this overload, but a malformed
  // adapter must degrade to an empty snapshot rather than break status reads.
  if (!Array.isArray(files)) return snapshot;

  const requestsById = new Map<string, ApprovalRequest>();
  const decisionsById = new Map<string, ApprovalDecision>();
  const retiredIds = new Set<string>();

  for (const file of files) {
    if (!file.endsWith('.tombstone.json')) continue;
    const parsed = approvalTombstoneSchema.safeParse(readJson(join(dir, file)));
    if (parsed.success && file === `${parsed.data.id}.tombstone.json`) retiredIds.add(parsed.data.id);
  }

  for (const file of files) {
    if (file.endsWith('.request.json')) {
      const parsed = readJson(join(dir, file));
      if (parsed === undefined) {
        snapshot.quarantined.push({ file, sourceReference: `approval-file:${file}`, reasonCode: 'unreadable-json' });
        continue;
      }
      const result = validateStoredApprovalRequest(parsed);
      if (!result.ok) {
        snapshot.quarantined.push({ file, sourceReference: `approval-file:${file}`, reasonCode: 'invalid-request-contract' });
        continue;
      }
      if (file !== `${result.value.id}.request.json`) {
        snapshot.quarantined.push({ file, sourceReference: `approval-file:${file}`, reasonCode: 'filename-id-mismatch' });
        continue;
      }
      if (!retiredIds.has(result.value.id)) requestsById.set(result.value.id, result.value);
    } else if (file.endsWith('.decision.json')) {
      const parsed = readJson(join(dir, file));
      if (parsed === undefined) continue;
      const result = validateStoredApprovalDecision(parsed);
      if (result.ok
        && file === `${result.value.requestId}.decision.json`
        && !retiredIds.has(result.value.requestId)) decisionsById.set(result.value.requestId, result.value);
    }
  }

  const nowMs = now.getTime();
  for (const [id, request] of requestsById) {
    const decision = decisionsById.get(id) ?? null;
    const applied = appliedLifecycleView(request, lifecycle);
    const category = decision === null && applied !== undefined
      ? Date.parse(applied.effectiveExpiresAt) <= nowMs ? 'expired' : 'pending'
      : categorize(request, decision, nowMs);
    snapshot[category].push({ request, decision, ...(applied ? { lifecycle: applied } : {}) });
  }
  return snapshot;
}

/** Shared broker/store timeout constructor: identical input yields identical receipt bytes. */
export function buildApprovalTimeoutSettlement(
  request: ApprovalRequest,
  now: Date,
  lifecycle: ResolvedApprovalLifecycleConfig = DEFAULT_APPROVAL_LIFECYCLE_POLICY as ResolvedApprovalLifecycleConfig,
): ApprovalTimeoutSettlement {
  const applied = appliedLifecycleView(request, lifecycle);
  const origin = applied?.origin ?? 'broker-native';
  const profile = applied?.appliedProfile ?? lifecycle.profiles['broker-native'];
  const riskTier = applied?.riskTier
    ?? maxApprovalRiskTier(profile.riskTier, mapLegacyApprovalRisk(request.risk));
  const requestKind = typeof request.details['kind'] === 'string' ? request.details['kind'] : undefined;
  const timeout = resolveApprovalTimeout({
    origin,
    profile,
    riskTier,
    requestDefaultAction: request.defaultAction,
    requestKind,
  });
  const decisionValue = timeout.action === 'proceed-warn'
    ? 'allow'
    : timeout.action === 'deny'
      ? 'deny'
      : 'defer';
  const decidedAt = now.toISOString();
  const validated = validateStoredApprovalDecision({
    requestId: request.id,
    decision: decisionValue,
    decidedBy: 'system:expiry',
    channel: 'ttl-expire',
    decidedAt,
    closureReason: 'expired',
  });
  if (!validated.ok) {
    throw new ApprovalStoreError(
      `invalid timeout decision: ${validated.errors.join('; ')}`,
      'APR_STORE_INVALID_DECISION',
    );
  }
  const authoredPolicyDigest = applied?.authoredPolicyDigest
    ?? approvalLifecycleProfileDigest('broker-native', profile);
  const appliedPolicyDigest = applied?.appliedPolicyDigest
    ?? approvalLifecycleProfileDigest('broker-native', profile);
  return {
    decision: validated.value,
    receipt: {
      schemaVersion: 1,
      requestId: request.id,
      tenantId: request.tenantId,
      scopeId: request.scopeId,
      sourceReference: request.version === APPROVAL_CONTRACT_V2_VERSION
        ? request.source.reference
        : `approval-request:${request.id}`,
      origin,
      lifecycleGeneration: applied?.lifecycleGeneration ?? 'legacy-v1',
      actor: 'system:expiry',
      kind: 'timeout-disposition',
      action: timeout.action,
      terminalState: timeout.terminalState,
      riskTier,
      expiresAt: applied?.effectiveExpiresAt ?? request.expiresAt,
      decidedAt,
      authoredPolicyDigest,
      appliedPolicyDigest,
      replayAllowed: false,
      accessGrantAllowed: false,
    },
  };
}

/** Reject a `transition()` whose caller-asserted target category contradicts
 *  what {@link categorize} would actually compute for the decision being
 *  written — the invariant that keeps `transition()` from drifting away from
 *  the categorization rule above. */
function assertCategoryConsistency(to: ApprovalStoreTerminalCategory, decision: ApprovalDecision): void {
  if (decision.channel === 'ttl-expire') {
    if (to !== 'expired') {
      throw new ApprovalStoreError(
        `channel 'ttl-expire' always categorizes as 'expired', not '${to}'`,
        'APR_STORE_CATEGORY_MISMATCH',
      );
    }
    return;
  }
  if (to === 'expired') {
    throw new ApprovalStoreError(
      "transition to 'expired' requires channel 'ttl-expire' (approval-contract.ts channel semantics)",
      'APR_STORE_CATEGORY_MISMATCH',
    );
  }
  if (to === 'approved' && decision.decision !== 'allow') {
    throw new ApprovalStoreError(
      `transition to 'approved' requires decision 'allow', got '${decision.decision}'`,
      'APR_STORE_CATEGORY_MISMATCH',
    );
  }
  if (to === 'denied' && decision.decision === 'allow') {
    throw new ApprovalStoreError("transition to 'denied' cannot use decision 'allow'", 'APR_STORE_CATEGORY_MISMATCH');
  }
}

// ─── ApprovalStore ────────────────────────────────────────────────────────────

/**
 * Durable, restart-survive index over the SAME directory `ApprovalBroker`
 * persists to. Multiple `ApprovalStore`/`ApprovalBroker` instances (same or
 * different processes) may share one `storeDir`.
 */
export class ApprovalStore {
  private readonly storeDir: string;
  private readonly lifecycle: ResolvedApprovalLifecycleConfig;
  private readonly clock: () => Date;
  private readonly privateFileAcl: ApprovalFileAclOptions;
  private snapshot: ApprovalStoreSnapshot = emptySnapshot();

  constructor(projectRoot: string, opts: ApprovalStoreOptions = {}) {
    this.storeDir = opts.storeDir ?? join(projectRoot, DECKENT_DIR, 'approvals');
    this.lifecycle = opts.lifecycle
      ?? (DEFAULT_APPROVAL_LIFECYCLE_POLICY as ResolvedApprovalLifecycleConfig);
    this.clock = opts.clock ?? (() => new Date());
    this.privateFileAcl = opts.privateFileAcl ?? {};
    // Reads never create an empty authority directory. The first durable write
    // creates it with private permissions through the CAS adapter.
    this.index(this.clock());
  }

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

  private timeoutReceiptFilePath(id: string): string {
    return join(this.storeDir, `${id}.timeout.json`);
  }

  private policyTransitionReceiptFilePath(id: string, appliedPolicyDigest: string): string {
    return join(this.storeDir, `${id}.${appliedPolicyDigest}.policy-transition.json`);
  }

  // ─── load / index (restart-survive) ────────────────────────────────────

  /** Pure, one-shot disk scan — no instance required. Use this from a
   *  stateless caller (e.g. a single CLI invocation) that does not need a
   *  live, re-syncable index. */
  static load(dir: string, now: Date = new Date()): ApprovalStoreSnapshot {
    return scanStoreDir(dir, now);
  }

  /** Rebuild the full in-memory index by re-scanning `storeDir` from
   *  scratch. This is the restart-survive seam: the constructor calls this
   *  once, so a brand-new instance (simulating a fresh process) needs ZERO
   *  carried-over state to reach full state. Safe to call again any time to
   *  re-sync after an external writer (a live broker, another `ApprovalStore`
   *  instance, a `deckent approve` CLI invocation) touched the directory. */
  index(now: Date = new Date()): ApprovalStoreSnapshot {
    this.snapshot = scanStoreDir(this.storeDir, now, this.lifecycle);
    return this.snapshot;
  }

  /** The in-memory snapshot as of the last {@link index} call (the
   *  constructor already ran one). */
  load(): ApprovalStoreSnapshot {
    return this.snapshot;
  }

  /**
   * Author a governed v2 request. Gate-off blocks new pending records but does
   * not affect compatibility reads or expiry draining of existing records.
   */
  async createLifecycleRequest(
    request: ApprovalRequestV2,
  ): Promise<ApprovalRequestV2 | ApprovalFileAclHold> {
    if (!this.lifecycle.enabled) {
      throw new ApprovalStoreError(
        'approval lifecycle is disabled; new governed pending records are blocked',
        'APR_STORE_LIFECYCLE_DISABLED',
      );
    }
    const validated = validateStoredApprovalRequest(request);
    if (!validated.ok || validated.value.version !== APPROVAL_CONTRACT_V2_VERSION) {
      throw new ApprovalStoreError(
        `invalid lifecycle request: ${validated.ok ? 'v2 required' : validated.errors.join('; ')}`,
        'APR_STORE_INVALID_DECISION',
      );
    }
    const published = await createPrivateJsonFileFirstWriterWins(
      this.requestFilePath(request.id),
      request,
      this.privateFileAcl,
    );
    if (published.state === 'HOLD') return published;
    if (!published.created) {
      throw new ApprovalStoreError(`request already exists: ${request.id}`, 'APR_STORE_ALREADY_TERMINAL');
    }
    this.index(this.clock());
    return request;
  }

  private findEntry(id: string): { category: ApprovalStoreCategory; entry: ApprovalStoreEntry } | undefined {
    for (const category of ['pending', 'approved', 'denied', 'expired'] as const) {
      const entry = this.snapshot[category].find((e) => e.request.id === id);
      if (entry) return { category, entry };
    }
    return undefined;
  }

  // ─── transition ─────────────────────────────────────────────────────────

  /**
   * Move `id` out of `pending`/unswept-`expired` into a terminal category by
   * writing its decision file — atomically, at the EXACT path the broker
   * itself uses (`<id>.decision.json`). Any live `ApprovalBroker` sharing
   * `storeDir` discovers it via `checkForExternalDecisions()` exactly like
   * any other externally-written decision. Throws {@link ApprovalStoreError}
   * for an unknown id, an already-decided id, an invalid decision, or a
   * decision whose actual category contradicts `to`.
   */
  transition(id: string, to: ApprovalStoreTerminalCategory, input: ApprovalDecisionInput): ApprovalDecision {
    const now = this.clock();
    this.index(now);
    const found = this.findEntry(id);
    if (!found) {
      throw new ApprovalStoreError(`no request found for id: ${id}`, 'APR_STORE_UNKNOWN_ID');
    }
    if (found.entry.decision) {
      throw new ApprovalStoreError(`request already decided: ${id}`, 'APR_STORE_ALREADY_TERMINAL');
    }
    if (found.category === 'expired') {
      this.sweepExpired(now);
      throw new ApprovalStoreError(`request already expired: ${id}`, 'APR_STORE_EXPIRED');
    }

    const result = validateStoredApprovalDecision({ ...input, requestId: id });
    if (!result.ok) {
      throw new ApprovalStoreError(`invalid ApprovalDecision: ${result.errors.join('; ')}`, 'APR_STORE_INVALID_DECISION');
    }
    const decision = result.value;
    assertCategoryConsistency(to, decision);

    this.ensureStoreDir();
    if (!createJsonFileFirstWriterWins(this.decisionFilePath(id), decision)) {
      this.index();
      throw new ApprovalStoreError(`request already decided: ${id}`, 'APR_STORE_ALREADY_TERMINAL');
    }
    if (existsSync(this.tombstoneFilePath(id))) {
      try { unlinkSync(this.decisionFilePath(id)); } catch { /* prune may have won cleanup */ }
      this.index();
      throw new ApprovalStoreError(`request retired before decision commit: ${id}`, 'APR_STORE_UNKNOWN_ID');
    }
    this.index();
    return decision;
  }

  // ─── sweepExpired (read-time TTL sweep) ──────────────────────────────────

  /**
   * Read-time TTL sweep: re-scan the store and write an HONEST closure decision
   * for every OVERDUE-yet-undecided request (categorized `expired` with a `null`
   * decision — its `expiresAt <= now` and no decision file yet). Each decision is
   * written atomically at the broker-compatible `<id>.decision.json` path and
   * mirrors the broker's own `expire()` shape — `channel: 'ttl-expire'`,
   * `decidedBy: 'system'`, `decision` = the request's `defaultAction` — plus the
   * additive, optional `closureReason: 'expired'` honest-closure marker
   * (approval-contract.ts). `reason` is left at its `''` default: this mechanism
   * layer stamps a STRUCTURED marker, never a hardcoded user-facing string.
   *
   * Unlike {@link ApprovalBroker.expire}, which only sees requests submitted
   * through its own in-memory map, this is disk-driven — it closes overdue
   * requests regardless of which process submitted them.
   *
   * Cross-process safe by construction:
   *  • Atomic first-writer-wins publish — a concurrent reader never sees a
   *    torn decision and a sibling can never overwrite the winner.
   *  • Idempotent — the leading re-scan skips any id already decided (by this
   *    call, a sibling store/broker, or a `deckent approve` CLI), so a repeat
   *    call never double-decides and returns `[]` once everything is closed.
   *  • Race-tolerant — if a sibling process wins the write for the same id,
   *    this instance records no closure and re-indexes the durable winner.
   *
   * NEVER deletes a request file — deletion is exclusively {@link prune}'s job
   * (aged, already-decided entries). A sweep only ever WRITES a closure decision,
   * preserving the honest-closure audit trail.
   *
   * Returns the ids this call actually closed (empty if nothing was overdue) so a
   * caller — NOTIFY-DEDUP cleanup, status reporting, {@link ApprovalExpiryDriver}
   * — can react to exactly what just closed. Re-indexes the in-memory snapshot
   * after any write, so a subsequent {@link load}/{@link prune} sees the closures.
   */
  sweepExpired(now: Date = new Date()): string[] {
    this.index(now);
    const swept: string[] = [];
    let attempted = false;
    for (const entry of this.snapshot.expired) {
      const id = entry.request.id;
      if (entry.decision) {
        if (entry.decision.channel === 'ttl-expire') {
          const settled = buildApprovalTimeoutSettlement(
            entry.request,
            new Date(entry.decision.decidedAt),
            this.lifecycle,
          );
          this.ensureStoreDir();
          createJsonFileFirstWriterWins(this.timeoutReceiptFilePath(id), settled.receipt);
        }
        continue;
      }
      const settled = buildApprovalTimeoutSettlement(entry.request, now, this.lifecycle);
      attempted = true;
      this.ensureStoreDir();
      if (createJsonFileFirstWriterWins(this.decisionFilePath(id), settled.decision)) {
        if (existsSync(this.tombstoneFilePath(id))) {
          try { unlinkSync(this.decisionFilePath(id)); } catch { /* prune may have won cleanup */ }
          continue;
        }
        createJsonFileFirstWriterWins(this.timeoutReceiptFilePath(id), settled.receipt);
        swept.push(id);
      }
    }
    if (attempted) this.index(now);
    return swept;
  }

  /** Read a durable typed timeout receipt without changing store state. */
  getTimeoutReceipt(id: string): ApprovalTimeoutReceipt | null {
    const raw = readJson(this.timeoutReceiptFilePath(id));
    if (raw === undefined || raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = raw as Partial<ApprovalTimeoutReceipt>;
    if (value.schemaVersion !== 1
      || value.requestId !== id
      || typeof value.tenantId !== 'string'
      || typeof value.scopeId !== 'string'
      || typeof value.sourceReference !== 'string'
      || value.actor !== 'system:expiry'
      || value.kind !== 'timeout-disposition'
      || value.replayAllowed !== false
      || value.accessGrantAllowed !== false) return null;
    return value as ApprovalTimeoutReceipt;
  }

  /** Pure durable-recovery projection. Callers can retry idempotent
   * settle-back/delivery after restart without re-running expiry mutation. */
  listTimeoutReceipts(): ApprovalTimeoutReceipt[] {
    if (!existsSync(this.storeDir)) return [];
    return readdirSync(this.storeDir)
      .filter((name) => name.endsWith('.timeout.json'))
      .sort()
      .flatMap((name) => {
        const id = name.slice(0, -'.timeout.json'.length);
        const receipt = this.getTimeoutReceipt(id);
        return receipt ? [receipt] : [];
      });
  }

  /**
   * Persist stable evidence for every in-flight policy difference. Tightening
   * changes the effective view; weakening remains ignored but is still visible.
   * The applied digest is part of the filename, so retries are FWW-idempotent
   * and a later stronger revision appends rather than overwrites history.
   */
  persistPolicyTransitions(now: Date = this.clock()): ApprovalPolicyTransitionReceipt[] {
    this.index(now);
    const written: ApprovalPolicyTransitionReceipt[] = [];
    for (const category of ['pending', 'expired'] as const) {
      for (const entry of this.snapshot[category]) {
        const lifecycle = entry.lifecycle;
        if (!lifecycle || (!lifecycle.policyTransitionChanged && !lifecycle.weakeningIgnored)) continue;
        const receipt: ApprovalPolicyTransitionReceipt = {
          schemaVersion: 1,
          requestId: entry.request.id,
          origin: lifecycle.origin,
          lifecycleGeneration: lifecycle.lifecycleGeneration,
          kind: 'policy-transition',
          observedAt: now.toISOString(),
          authoredPolicyDigest: lifecycle.authoredPolicyDigest,
          appliedPolicyDigest: lifecycle.appliedPolicyDigest,
          transitionChanged: lifecycle.policyTransitionChanged,
          weakeningIgnored: lifecycle.weakeningIgnored,
          appliedProfile: lifecycle.appliedProfile,
        };
        this.ensureStoreDir();
        if (createJsonFileFirstWriterWins(
          this.policyTransitionReceiptFilePath(entry.request.id, lifecycle.appliedPolicyDigest),
          receipt,
        )) written.push(receipt);
      }
    }
    return written;
  }

  // ─── prune ──────────────────────────────────────────────────────────────

  /**
   * Retire every decided entry older than the cutoff with a permanent,
   * first-writer-wins tombstone, then best-effort remove its request+decision
   * file pair. The tombstone is the logical deletion authority: it prevents ID
   * reuse and makes partial physical cleanup fail-closed instead of resurrecting
   * a pending request or re-binding a stale decision.
   *
   * For every decided entry (`approved` / `denied` / swept `expired`) whose
   * `decision.decidedAt` is
   * older than `olderThan`. `pending` entries and unswept-`expired` entries
   * (no decision yet) are NEVER pruned regardless of age. Best-effort file
   * removal (a file already gone is not an error). Returns the pruned ids.
   */
  prune(olderThan: Date): string[] {
    const cutoffMs = olderThan.getTime();
    const pruned: string[] = [];
    for (const category of ['approved', 'denied', 'expired'] as const) {
      for (const entry of this.snapshot[category]) {
        const decidedAt = entry.decision?.decidedAt;
        if (!decidedAt || Date.parse(decidedAt) >= cutoffMs) continue;
        const id = entry.request.id;
        const tombstone = {
          version: 1,
          id,
          retiredAt: new Date().toISOString(),
          decision: entry.decision,
        } as const;
        const created = createJsonFileFirstWriterWins(this.tombstoneFilePath(id), tombstone);
        if (!created) {
          const existing = approvalTombstoneSchema.safeParse(readJson(this.tombstoneFilePath(id)));
          if (!existing.success
            || existing.data.id !== id
            || JSON.stringify(existing.data.decision) !== JSON.stringify(entry.decision)) {
            throw new ApprovalStoreError(
              `retirement tombstone conflict for id: ${id}`,
              'APR_STORE_RETIREMENT_CONFLICT',
            );
          }
        }
        for (const path of [this.requestFilePath(id), this.decisionFilePath(id)]) {
          try {
            unlinkSync(path);
          } catch {
            // Best-effort — already gone or never existed.
          }
        }
        pruned.push(id);
      }
    }
    if (pruned.length > 0) this.index();
    return pruned;
  }
}
