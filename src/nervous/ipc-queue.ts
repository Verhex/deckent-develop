// src/nervous/ipc-queue.ts
//
// W2-2 — Sprint 180 Task 5. NERVOUS-TODO §11.2 Step E + §11.10 karar #1.
//
// File-based IPC queue bridging MCP process (`nervous_accept` / `nervous_reject`)
// and the long-running Executor that owns the in-memory `pendingApprovals` map.
//
// Layout under the project root:
//
//   .deckent/nervous-ipc/
//     pending/    → freshly written approval requests (one JSON per file)
//     resolved/   → files moved here after Executor consumes them
//
// Each file name is unique per write (`<notificationId>-<ts>-<random>.json`)
// so concurrent writers cannot collide. Readers tolerate corrupt or partially
// written files by skipping them — the next poll tick retries.

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { NERVOUS_IPC_DIR } from '../core/constants.js';

/**
 * How long an unconsumed approval file may linger before it is aged out. Once
 * `markResolved` is gated on consumption (multi-poller safety), an accept that no
 * live executor ever claims (e.g. its owning process exited) would otherwise loop
 * in `pending/` forever. After this TTL any poller relocates it as an orphan.
 */
const ORPHAN_APPROVAL_TTL_MS = 10 * 60 * 1000; // 10 min

// ─── Nervous Poller Liveness (APPROVE-007, §4G) ───────────────────────────────
//
// A heartbeat file lets a short-lived CLI process (`deckent nervous accept`)
// decide whether a long-running nervous executor is alive and will consume an
// IPC approval. Heartbeat over raw-pid avoids pid-reuse false positives: a
// crashed executor leaves a stale timestamp, and `staleMs` ages it out.

/** Heartbeat file path under the nervous IPC dir. */
export function heartbeatPath(projectRoot: string): string {
  return join(projectRoot, NERVOUS_IPC_DIR, 'heartbeat');
}

/** Stamp the heartbeat with the current time (best-effort, never throws). */
export function writeNervousHeartbeat(projectRoot: string): void {
  const p = heartbeatPath(projectRoot);
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, String(Date.now()), 'utf-8');
  } catch {
    /* best-effort */
  }
}

/** Remove the heartbeat (clean shutdown → immediately reports not-alive). */
export function clearNervousHeartbeat(projectRoot: string): void {
  try {
    rmSync(heartbeatPath(projectRoot), { force: true });
  } catch {
    /* best-effort */
  }
}

/**
 * True when a fresh heartbeat (within `staleMs`) is present — i.e. a nervous
 * executor is running and will consume IPC approvals. Note: this is a snapshot;
 * the executor can still exit in the TOCTOU window between this check and the
 * approval being consumed (handled by the caller's wording, not a guarantee).
 */
export function isNervousPollerAlive(projectRoot: string, staleMs = 5000): boolean {
  const p = heartbeatPath(projectRoot);
  if (!existsSync(p)) return false;
  try {
    const ts = parseInt(readFileSync(p, 'utf-8').trim(), 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < staleMs;
  } catch {
    return false;
  }
}

// ─── Public Types ───────────────────────────────────────────────────────────

export type ApprovalDecision = 'accepted' | 'rejected';

export interface ApprovalRequest {
  readonly notificationId: string;
  readonly decision: ApprovalDecision;
  readonly reason?: string;
  readonly requestedAt: string;
  /**
   * APPROVE-007b (Sprint 280): optional payload edits a human applied before
   * accepting. The executor shallow-merges these over the action's original
   * payload (`{ ...original, ...modifiedPayload }`) on an `accepted` decision.
   * Absent (legacy / reject) → byte-identical to the pre-edit behavior.
   */
  readonly modifiedPayload?: Record<string, unknown>;
}

export interface ApprovalRequestInput {
  readonly notificationId: string;
  readonly decision: ApprovalDecision;
  readonly reason?: string;
  readonly requestedAt?: string;
  /** Optional payload edits to transport with an accept — see ApprovalRequest. */
  readonly modifiedPayload?: Record<string, unknown>;
}

export interface PendingItem {
  readonly file: string;
  readonly request: ApprovalRequest;
}

// The handler returns whether THIS poller's executor actually consumed the
// approval (matched a pending in its in-memory map). `void` is treated as
// consumed for backward compatibility with handlers that don't report.
export type ApprovalHandler = (request: ApprovalRequest) => void | boolean | Promise<void | boolean>;

export interface PollingHandle {
  dispose(): void;
}

// ─── NervousIpcQueue ────────────────────────────────────────────────────────

/**
 * File-based IPC queue for MCP → Executor approval routing.
 *
 * Lifecycle:
 *   1. MCP `nervous_accept(id)` calls `writeApproval(req)` → pending JSON file
 *   2. Executor's polling loop reads pending, invokes `executor.resolveApproval`
 *   3. Polling loop moves processed file to `resolved/`
 *
 * The queue is process-safe: unique filenames prevent overwrites. Filesystem
 * `rename` is atomic on the same volume so consumers cannot race against
 * the producer on the same file twice.
 */
export class NervousIpcQueue {
  private readonly baseDir: string;
  private readonly pendingDir: string;
  private readonly resolvedDir: string;

  constructor(projectRoot: string) {
    this.baseDir = join(projectRoot, NERVOUS_IPC_DIR);
    this.pendingDir = join(this.baseDir, 'pending');
    this.resolvedDir = join(this.baseDir, 'resolved');
  }

  getBaseDir(): string {
    return this.baseDir;
  }

  getPendingDir(): string {
    return this.pendingDir;
  }

  getResolvedDir(): string {
    return this.resolvedDir;
  }

  /**
   * Append an approval request to the pending dir.
   * Returns the absolute path of the freshly written file.
   *
   * The filename embeds `notificationId`, a high-resolution timestamp and a
   * random suffix so concurrent writers never collide — even when the same
   * notification id is approved/rejected twice in rapid succession.
   */
  async writeApproval(input: ApprovalRequestInput): Promise<string> {
    await this.ensureDirs();
    const requestedAt = input.requestedAt ?? new Date().toISOString();
    const record: ApprovalRequest = {
      notificationId: input.notificationId,
      decision: input.decision,
      reason: input.reason,
      requestedAt,
      // Carried only when present — JSON.stringify omits an undefined value, so
      // legacy (no-edit) writes stay byte-identical to the pre-280-003 format.
      modifiedPayload: input.modifiedPayload,
    };
    const safeId = sanitizeId(input.notificationId);
    const suffix = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    const filePath = join(this.pendingDir, `${safeId}-${suffix}.json`);
    await writeFile(filePath, JSON.stringify(record, null, 2) + '\n', 'utf-8');
    return filePath;
  }

  /**
   * Read every JSON file currently in the pending dir.
   * Corrupt/partial files are skipped silently — the next tick retries them
   * if they are re-written by the producer.
   */
  async readPending(): Promise<PendingItem[]> {
    if (!existsSync(this.pendingDir)) {
      return [];
    }
    const entries = await readdir(this.pendingDir);
    const items: PendingItem[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const file = join(this.pendingDir, entry);
      try {
        const raw = await readFile(file, 'utf-8');
        const parsed = JSON.parse(raw) as ApprovalRequest;
        if (
          typeof parsed.notificationId === 'string' &&
          (parsed.decision === 'accepted' || parsed.decision === 'rejected')
        ) {
          items.push({ file, request: parsed });
        }
      } catch {
        // Skip corrupt/partial files; consumer will retry next poll
      }
    }
    return items;
  }

  /**
   * Move a processed pending file into the resolved dir. Idempotent: if the
   * file no longer exists, the call is a no-op (the same approval cannot be
   * resolved twice). Concurrent consumers that lose the rename race surface
   * as ENOENT/EBUSY and are swallowed — the winner already moved the file.
   */
  async markResolved(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      return;
    }
    await this.ensureDirs();
    const target = join(this.resolvedDir, basename(filePath));
    try {
      await rename(filePath, target);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT' || code === 'EBUSY' || code === 'EPERM') {
        return;
      }
      throw err;
    }
  }

  /**
   * Start a setInterval-based polling loop that hands every pending request to
   * `handler` and moves the file to resolved/ once the handler resolves.
   *
   * Errors raised by the handler are swallowed — the queue must not crash the
   * long-running Executor. The pending file stays in place so the next tick
   * can retry it; if that retry also fails, an operator can manually inspect
   * the file under `.deckent/nervous-ipc/pending/`.
   */
  startPolling(handler: ApprovalHandler, intervalMs = 1000): PollingHandle {
    let stopped = false;
    let inFlight = false;

    const tick = async (): Promise<void> => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const items = await this.readPending();
        for (const item of items) {
          if (stopped) break;
          try {
            const result = await handler(item.request);
            // Multi-poller race-safety (executor-always-live yan-fix): when more
            // than one executor polls the same queue (e.g. the always-on bot AND a
            // running sprint), an accept belongs to whichever executor holds the
            // proposal in its in-memory map. A handler that returns `false` did NOT
            // consume it — leave the file so the OWNING poller can. Resolving
            // (relocating) it here would "steal" the accept and the real owner
            // would never resolve its pending. `void`/`true` → consumed (legacy
            // single-poller behavior preserved). Orphaned accepts (no live owner
            // within the TTL) are aged out so they cannot loop forever.
            const consumed = result !== false;
            if (consumed || this.isOrphanedApproval(item.file)) {
              await this.markResolved(item.file);
            }
          } catch {
            // Handler failure: leave the pending file for retry next tick
          }
        }
      } catch {
        // readPending failure: retry on next tick
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(() => {
      void tick();
    }, intervalMs);

    // Allow the Node.js process to exit if this is the only active handle.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    return {
      dispose: (): void => {
        stopped = true;
        clearInterval(timer);
      },
    };
  }

  /**
   * True when a pending approval file is older than {@link ORPHAN_APPROVAL_TTL_MS}
   * — i.e. no live executor claimed it within the TTL, so it is safe to age out
   * (relocate) rather than retry forever. Best-effort: a stat error → not orphaned
   * (let the next tick retry). Time is read here (not injected) because this is a
   * runtime age check, not part of any resumable/deterministic flow.
   */
  private isOrphanedApproval(filePath: string): boolean {
    try {
      const ageMs = Date.now() - statSync(filePath).mtimeMs;
      return ageMs > ORPHAN_APPROVAL_TTL_MS;
    } catch {
      return false;
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private async ensureDirs(): Promise<void> {
    if (!existsSync(this.pendingDir)) {
      await mkdir(this.pendingDir, { recursive: true });
    }
    if (!existsSync(this.resolvedDir)) {
      await mkdir(this.resolvedDir, { recursive: true });
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Make a notificationId safe for use inside a filename.
 * Replaces any character outside [A-Za-z0-9._-] with `_`.
 */
function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 64) || 'unknown';
}
