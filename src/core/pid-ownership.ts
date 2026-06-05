// ═══ pid-ownership — pid-reuse catastrophe guard (§4G / B2) ══════════
//
// isPidAlive proves SOME process holds a pid, NOT that it is the one we recorded.
// If a sprint's coordinator died and the OS reused its pid for an unrelated
// process, a stale pid file + liveness-only check would SIGKILL that foreign
// process. This module captures a per-process START TOKEN at pid-file write time
// and re-verifies it before signalling: a differing token means the pid was
// recycled → 'reused' → callers must refuse to signal. Zero-tolerance guard.

import { readFileSync } from 'node:fs';
import { isPidAlive } from './pid-liveness.js';

/**
 * A token that is stable for a given live process but (effectively) unique across
 * process lifetimes, so pid reuse is detectable. On Linux/WSL this is the kernel
 * start-time (field 22 of /proc/<pid>/stat, jiffies since boot) — cheap, no spawn,
 * never changes for a live process. On other platforms returns null (caller falls
 * back to 'unknown' = liveness-only, preserving existing behavior). Never throws.
 */
export function processStartToken(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform !== 'linux') return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    // comm (field 2) is parenthesized and may contain spaces/parens — parse the
    // fixed fields AFTER the last ')'. Post-')' fields start at field 3 (state),
    // so starttime (field 22) is index (22 - 3) = 19.
    const after = stat.slice(stat.lastIndexOf(')') + 2);
    const fields = after.split(' ');
    const starttime = fields[19];
    return starttime && /^\d+$/.test(starttime) ? `s${starttime}` : null;
  } catch {
    return null;
  }
}

export type OwnershipStatus = 'owned' | 'reused' | 'dead' | 'unknown';

export interface PidRecordLike {
  readonly pid: number;
  /** Start token captured when the pid file was written (absent on old files). */
  readonly startToken?: string | null;
}

export interface OwnershipDeps {
  isAlive?: (pid: number) => boolean;
  startToken?: (pid: number) => string | null;
}

/**
 * Classify whether the process behind a recorded pid is still the one we wrote:
 *  - 'dead'    — no record / no live process (nothing to signal).
 *  - 'reused'  — alive, but the live start token differs from the stored one →
 *                the pid was recycled to a DIFFERENT process; never signal it.
 *  - 'owned'   — alive and the start token matches → provably our process.
 *  - 'unknown' — alive but ownership can't be proven (old pid file without a
 *                token, or a non-Linux platform). Callers preserve prior
 *                behavior (liveness-only) for 'unknown'.
 */
export function verifyPidOwnership(record: PidRecordLike | null, deps: OwnershipDeps = {}): OwnershipStatus {
  const isAlive = deps.isAlive ?? isPidAlive;
  const tokenOf = deps.startToken ?? processStartToken;

  if (!record || typeof record.pid !== 'number') return 'dead';
  if (!isAlive(record.pid)) return 'dead';

  const live = tokenOf(record.pid);
  if (record.startToken && live) {
    return record.startToken === live ? 'owned' : 'reused';
  }
  return 'unknown';
}
