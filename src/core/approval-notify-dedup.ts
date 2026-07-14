// ─── ApprovalNotifyDedup — persistent notify-state guard (APR-NOTIFY-DEDUP) ──
// Fixes the "restart re-asks the same card" gap: `ApprovalStoreWatch`'s
// seenPending/seenDecided sets (approval-store-watch.ts) are IN-MEMORY only —
// recreated on every process start — and its store-replay scan re-fires
// `onPending` for every request still on disk, which `wireApprovalCrossProcess`
// (cli/repl/run.tsx) forwards straight into `broker.emit('pending', ...)`, the
// SAME event a genuine new `submit()` fires. `ApprovalRelay` cannot tell the two
// apart, so a bot/REPL restart re-dispatches a card every attached channel
// already saw in a PREVIOUS run. This module is the disk-persisted guard the
// relay checks BEFORE dispatch, so the guard itself survives the restart that
// the in-memory sets don't.
//
// Deliberately a thin, single-purpose sibling of approval-broker.ts /
// approval-store.ts — same storeDir default, same tmp+rename atomic-write
// shape (reused inline; a third copy, not a new shared abstraction) — but owns
// its own file (`.notified.json`) and its own tiny schema, never touching a
// request/decision file.

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from './constants.js';

export interface ApprovalNotifyDedupOptions {
  /** Absolute directory the state file lives under. Defaults to the SAME
   *  directory `ApprovalBroker`/`ApprovalStore` default to:
   *  `<projectRoot>/.deckent/approvals`. Tests MUST override with a hermetic
   *  tmpdir — never point this at a real project's `.deckent`. */
  storeDir?: string;
}

const NOTIFIED_FILE_NAME = '.notified.json';
const NOTIFIED_FILE_VERSION = 1;

interface NotifiedFileShape {
  version: typeof NOTIFIED_FILE_VERSION;
  notifiedIds: string[];
}

function isNotifiedFileShape(value: unknown): value is NotifiedFileShape {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate['version'] === NOTIFIED_FILE_VERSION &&
    Array.isArray(candidate['notifiedIds']) &&
    candidate['notifiedIds'].every((id) => typeof id === 'string')
  );
}

/**
 * Disk-backed set of already-notified approval-request ids. One instance per
 * process; a fresh instance (simulating a restart) recovers its full state by
 * loading `<storeDir>/.notified.json` in the constructor — no carried-over
 * in-memory state required, which is exactly the property that makes the
 * restart guard work.
 */
export class ApprovalNotifyDedup {
  private readonly storeDir: string;
  private readonly filePath: string;
  private notifiedIds: Set<string>;

  constructor(projectRoot: string, opts: ApprovalNotifyDedupOptions = {}) {
    this.storeDir = opts.storeDir ?? join(projectRoot, DECKENT_DIR, 'approvals');
    this.filePath = join(this.storeDir, NOTIFIED_FILE_NAME);
    this.notifiedIds = this.load();
  }

  private ensureStoreDir(): void {
    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true });
    }
  }

  /** Fail-soft disk load — a missing file, an unreadable file, or a
   *  structurally-invalid/corrupt JSON payload all recover to an empty set
   *  rather than throwing (never crash the relay over a torn dedup file). */
  private load(): Set<string> {
    if (!existsSync(this.filePath)) return new Set();
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      return isNotifiedFileShape(raw) ? new Set(raw.notifiedIds) : new Set();
    } catch {
      return new Set();
    }
  }

  /** Atomic write: tmp file (unique-suffixed) + `renameSync` onto the real
   *  path — identical shape to `approval-broker.ts` `atomicWriteJson` /
   *  `approval-store.ts`, so a crash mid-write never leaves a torn state file. */
  private persist(): void {
    this.ensureStoreDir();
    const tmpPath = `${this.filePath}.${randomUUID()}.tmp`;
    const data: NotifiedFileShape = { version: NOTIFIED_FILE_VERSION, notifiedIds: [...this.notifiedIds] };
    writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    try {
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // Best-effort cleanup — the rename error below is what the caller needs.
      }
      throw err;
    }
  }

  /** Has `id` already been notified (in this process or a prior one)? */
  wasNotified(id: string): boolean {
    return this.notifiedIds.has(id);
  }

  /** Record `id` as notified and persist immediately. A no-op (no disk
   *  write) if `id` is already marked. */
  markNotified(id: string): void {
    if (this.notifiedIds.has(id)) return;
    this.notifiedIds.add(id);
    this.persist();
  }

  /** Remove `ids` from the notified set (e.g. once a request is decided or
   *  expired) and persist only if something actually changed — keeps the
   *  state file from growing unbounded and lets an id be reused later
   *  (theoretical) without a stale block. */
  clear(ids: readonly string[]): void {
    let changed = false;
    for (const id of ids) {
      if (this.notifiedIds.delete(id)) changed = true;
    }
    if (changed) this.persist();
  }
}
