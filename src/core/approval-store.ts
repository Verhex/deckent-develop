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
//   • atomic write = tmp file (`${filePath}.${randomUUID()}.tmp`) +
//     `writeFileSync` + `renameSync`, best-effort `unlinkSync` of the tmp file
//     on rename failure (approval-broker.ts `atomicWriteJson`)
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
//              (overdue, not yet swept by `ApprovalBroker.expire()`), OR a
//              decision file exists with `channel === 'ttl-expire'` (swept)
//   approved — decision file exists, `channel !== 'ttl-expire'`, and
//              `decision === 'allow'`
//   denied   — decision file exists, `channel !== 'ttl-expire'`, and
//              `decision !== 'allow'` (deny / defer / escalate)

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
  approvalDecisionSchema,
  validateApprovalRequest,
  validateApprovalDecision,
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
  | 'APR_STORE_CATEGORY_MISMATCH';

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

  for (const file of files) {
    if (file.endsWith('.request.json')) {
      const parsed = readJson(join(dir, file));
      if (parsed === undefined) continue;
      const result = validateApprovalRequest(parsed);
      if (result.ok) requestsById.set(result.value.id, result.value);
    } else if (file.endsWith('.decision.json')) {
      const parsed = readJson(join(dir, file));
      if (parsed === undefined) continue;
      const result = validateApprovalDecision(parsed);
      if (result.ok) decisionsById.set(result.value.requestId, result.value);
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
      mkdirSync(this.storeDir, { recursive: true });
    }
  }

  private requestFilePath(id: string): string {
    return join(this.storeDir, `${id}.request.json`);
  }

  private decisionFilePath(id: string): string {
    return join(this.storeDir, `${id}.decision.json`);
  }

  /** Atomic write — identical tmp+rename pattern to approval-broker.ts
   *  `atomicWriteJson` (cited at module top), so a crash mid-write never
   *  leaves a torn file, and a concurrent broker sharing `storeDir` never
   *  observes a half-written decision. */
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

    const result = validateApprovalDecision({ ...input, requestId: id });
    if (!result.ok) {
      throw new ApprovalStoreError(`invalid ApprovalDecision: ${result.errors.join('; ')}`, 'APR_STORE_INVALID_DECISION');
    }
    const decision = result.value;
    assertCategoryConsistency(to, decision);

    this.atomicWriteJson(this.decisionFilePath(id), decision);
    this.index();
    return decision;
  }

  // ─── prune ──────────────────────────────────────────────────────────────

  /**
   * Delete the on-disk request+decision file pair for every decided entry
   * (`approved` / `denied` / swept `expired`) whose `decision.decidedAt` is
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
