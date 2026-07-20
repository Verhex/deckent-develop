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
import { createJsonFileFirstWriterWins } from './approval-file-cas.js';
import {
  approvalDecisionSchema,
  approvalTombstoneSchema,
  validateStoredApprovalRequest,
  validateStoredApprovalDecision,
  type ApprovalRequest,
  type ApprovalDecision,
} from './approval-contract.js';

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
}

export interface ApprovalStoreSnapshot {
  pending: ApprovalStoreEntry[];
  approved: ApprovalStoreEntry[];
  denied: ApprovalStoreEntry[];
  expired: ApprovalStoreEntry[];
}

function emptySnapshot(): ApprovalStoreSnapshot {
  return { pending: [], approved: [], denied: [], expired: [] };
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApprovalStoreErrorCode =
  | 'APR_STORE_UNKNOWN_ID'
  | 'APR_STORE_ALREADY_TERMINAL'
  | 'APR_STORE_INVALID_DECISION'
  | 'APR_STORE_CATEGORY_MISMATCH'
  | 'APR_STORE_RETIREMENT_CONFLICT';

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

/** Full disk scan of `dir` into a categorized snapshot. Malformed/torn/
 *  contract-invalid files are silently skipped (never thrown) — same
 *  tolerance policy as the broker's poll seam. A decision file whose
 *  `requestId` has no matching request file is skipped too (nothing to
 *  attach it to). */
function scanStoreDir(dir: string, now: Date): ApprovalStoreSnapshot {
  const snapshot = emptySnapshot();
  if (!existsSync(dir)) return snapshot;

  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return snapshot;
  }

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
      if (parsed === undefined) continue;
      const result = validateStoredApprovalRequest(parsed);
      if (result.ok
        && file === `${result.value.id}.request.json`
        && !retiredIds.has(result.value.id)) requestsById.set(result.value.id, result.value);
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
    snapshot[categorize(request, decision, nowMs)].push({ request, decision });
  }
  return snapshot;
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
  private snapshot: ApprovalStoreSnapshot = emptySnapshot();

  constructor(projectRoot: string, opts: ApprovalStoreOptions = {}) {
    this.storeDir = opts.storeDir ?? join(projectRoot, DECKENT_DIR, 'approvals');
    this.ensureStoreDir();
    this.index();
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
    this.snapshot = scanStoreDir(this.storeDir, now);
    return this.snapshot;
  }

  /** The in-memory snapshot as of the last {@link index} call (the
   *  constructor already ran one). */
  load(): ApprovalStoreSnapshot {
    return this.snapshot;
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
    const found = this.findEntry(id);
    if (!found) {
      throw new ApprovalStoreError(`no request found for id: ${id}`, 'APR_STORE_UNKNOWN_ID');
    }
    if (found.entry.decision) {
      throw new ApprovalStoreError(`request already decided: ${id}`, 'APR_STORE_ALREADY_TERMINAL');
    }

    const result = validateStoredApprovalDecision({ ...input, requestId: id });
    if (!result.ok) {
      throw new ApprovalStoreError(`invalid ApprovalDecision: ${result.errors.join('; ')}`, 'APR_STORE_INVALID_DECISION');
    }
    const decision = result.value;
    assertCategoryConsistency(to, decision);

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
      if (entry.decision) continue; // already swept/decided — idempotent skip
      const id = entry.request.id;
      const result = validateStoredApprovalDecision({
        requestId: id,
        decision: entry.request.defaultAction,
        decidedBy: 'system',
        channel: 'ttl-expire',
        decidedAt: now.toISOString(),
        closureReason: 'expired',
      });
      // Built from already-validated request fields — cannot fail; fail-safe skip.
      if (!result.ok) continue;
      attempted = true;
      if (createJsonFileFirstWriterWins(this.decisionFilePath(id), result.value)) {
        if (existsSync(this.tombstoneFilePath(id))) {
          try { unlinkSync(this.decisionFilePath(id)); } catch { /* prune may have won cleanup */ }
          continue;
        }
        swept.push(id);
      }
    }
    if (attempted) this.index(now);
    return swept;
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
